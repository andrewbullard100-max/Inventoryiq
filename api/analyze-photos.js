// POST /api/analyze-photos
//
// Body:
// {
//   "areaId": "area_xxxxxxxxxxxx",
//   "countId": "uuid",              -- from /api/start-count
//   "stageId": "stage_xxx",
//   "stageName": "Shelf 1",
//   "storagePaths": [ "area_x/stage_x/169...-ab12.jpg", ... ]  -- from create-photo-upload-url,
//                                                                already uploaded to Storage
// }
//
// Flow:
//   1. Look up which items are assigned to this area (and their par levels) in Supabase.
//   2. Download the photos for this stage from Storage (private bucket, service-role only --
//      the request body itself now only carries paths, never image bytes, so there's no
//      practical size ceiling on how many/how large the photos for a stage can be).
//   3. Send the photo(s) to Claude Vision along with ONLY that area's item list --
//      this is the area-scoped prompt: Claude never sees the full 1,423-item catalog,
//      just the ~20-130 items that actually live in this area. Better accuracy, lower cost.
//   4. Claude returns structured counts. We map its confidence score to one of the match
//      statuses your app uses (matched / visual_match / unknown -- not_found is reconciled
//      later, once, after all of a count's stages are in; see the note further down).
//   5. Persist each result row into count_items immediately, tagged with this stage --
//      this is what makes a stage durable the moment it's analyzed, independent of whether
//      the browser tab survives to see the response.

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, respondToAuthError, HttpError } from './_lib/auth.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
const CONFIDENCE_THRESHOLD = 0.75; // matches the 0.75 default called out in the product spec
const PHOTO_BUCKET = 'count-photos';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);
    requireOrgMembership(auth);

    const { areaId, countId, stageId, stageName, storagePaths } = req.body || {};

    if (!areaId || typeof areaId !== 'string') {
      res.status(400).json({ error: 'areaId is required' });
      return;
    }
    if (!countId || typeof countId !== 'string') {
      res.status(400).json({ error: 'countId is required -- call /api/start-count first' });
      return;
    }
    if (!stageId || typeof stageId !== 'string') {
      res.status(400).json({ error: 'stageId is required' });
      return;
    }
    if (!Array.isArray(storagePaths) || storagePaths.length === 0) {
      res.status(400).json({ error: 'storagePaths must be a non-empty array' });
      return;
    }
    if (storagePaths.length > 5) {
      res.status(400).json({ error: 'Max 5 photos per stage' });
      return;
    }

    // Both the area and the count session must belong to the caller's organization --
    // otherwise one org could analyze photos against another org's item catalog (areaId)
    // or write results into another org's count (countId) just by guessing/reusing an id.
    const [{ data: areaCheck, error: areaCheckErr }, { data: countCheck, error: countCheckErr }] = await Promise.all([
      supabase.from('areas').select('id').eq('id', areaId).eq('organization_id', auth.orgId).maybeSingle(),
      supabase.from('counts').select('id').eq('id', countId).eq('organization_id', auth.orgId).maybeSingle(),
    ]);
    if (areaCheckErr || countCheckErr) { res.status(500).json({ error: 'Failed to verify area/count ownership' }); return; }
    if (!areaCheck) { res.status(404).json({ error: 'Area not found in your organization' }); return; }
    if (!countCheck) { res.status(404).json({ error: 'Count session not found in your organization' }); return; }

    // 0. Pull this stage's photos down from Storage. Fail the whole request if any is
    //    missing -- an incomplete photo set shouldn't silently produce a partial count.
    const imageBlocks = [];
    for (const path of storagePaths) {
      const { data: fileData, error: dlErr } = await supabase.storage.from(PHOTO_BUCKET).download(path);
      if (dlErr) {
        res.status(404).json({ error: `Failed to fetch photo "${path}" from storage`, details: dlErr.message });
        return;
      }
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const mediaType = fileData.type || 'image/jpeg';
      imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } });
    }

    // 1. Pull this area's assigned items (the area-scoped catalog).
    const { data: assignments, error: dbError } = await supabase
      .from('item_area_assignments')
      .select('item_id, par_level, items ( id, name, brand, vendor_item_code, order_uom, pack_size, aliases, reference_image_url )')
      .eq('area_id', areaId);

    if (dbError) {
      res.status(500).json({ error: 'Failed to load area catalog', details: dbError.message });
      return;
    }
    if (!assignments || assignments.length === 0) {
      res.status(404).json({ error: 'No items are assigned to this area yet' });
      return;
    }

    const areaItems = assignments.map((a) => ({
      itemId: a.items.id,
      name: a.items.name,
      brand: a.items.brand,
      vendorItemCode: a.items.vendor_item_code,
      unit: a.items.order_uom,
      packSize: a.items.pack_size,
      parLevel: a.par_level,
      referenceImageUrl: a.items.reference_image_url,
      aliases: Array.isArray(a.items.aliases) ? a.items.aliases : [],
    }));

    // 1b. Download reference photos (only for items that have one -- most won't).
    // These get shown to Claude alongside the captured photos so it can visually
    // compare, which meaningfully helps on generic packaging or near-identical SKUs.
    const itemsWithReference = areaItems.filter((i) => i.referenceImageUrl).slice(0, 10); // cap cost/size per request
    const referenceBlocks = [];
    for (const item of itemsWithReference) {
      try {
        const imgRes = await fetch(item.referenceImageUrl);
        if (!imgRes.ok) continue;
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        referenceBlocks.push({ type: 'text', text: `Reference photo for "${item.name}" (itemId: ${item.itemId}):` });
        referenceBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: contentType, data: buffer.toString('base64') },
        });
      } catch {
        // Reference photo fetch failed -- skip it, don't fail the whole request over it.
      }
    }

    // 2. Build the area-scoped prompt.
    const promptItemList = areaItems.map(({ referenceImageUrl, ...rest }) => rest); // don't dump raw URLs into the prompt text
    const systemPrompt = `You are an inventory counting assistant for a foodservice operation. You will be shown one or more photos of a single storage area. Your job is to count how many of each item you can see, matching ONLY against the item list provided below -- do not invent items that are not on this list.

${referenceBlocks.length > 0 ? `Before the storage area photo(s), you will also be shown reference photos for a few specific items on the list (each one labeled with its itemId). Use these to visually confirm a match when the label is unclear or the packaging is generic -- these are items that have been historically hard to identify from text/label alone.\n\n` : ''}IMPORTANT -- the photos may overlap the same physical shelf space (e.g. a wide shelf photographed in two overlapping shots). Before counting, first identify which items appear in more than one photo -- treat those as the SAME physical unit(s), not separate ones. Never sum a per-photo count across photos for an item that could be the same physical stock.

Within a single photo, look carefully for multiple identical items stacked or placed side by side -- boxes of the same product are often grouped together, and it's easy to undercount them at a glance. Count every visible unit of a matched product, not just the first one you notice.

For every item you can identify, report:
- itemId (must exactly match an id from the list below)
- count (your best count of physical units/cases actually present, after deduplicating across overlapping photos; use the item's stated order unit)
- confidence (0.0-1.0, how sure you are of both the identification and the count)

If you see something on shelf that is clearly inventory but does NOT match any item on the list, include it in "unrecognizedItems" with a short description instead of an itemId.

Each item in the list may include an "aliases" array -- these are alternate vendor codes, UPCs, or label text that operators have recorded for that item. Treat any of these as equally valid to the item's "name" when matching what's printed on a package.

Work through the photos step by step first: note what shelf/area each photo covers, which items repeat across photos, and how many of each distinct item you can actually count. Use printed vendor codes, item numbers, UPCs, or other label text (including any aliases listed) to disambiguate near-identical packaging where possible. Then, once you've reasoned through it, end your response with a line containing only "FINAL ANSWER:" followed by valid JSON in this exact shape and nothing else after it:
{
  "counts": [ { "itemId": "string", "count": number, "confidence": number } ],
  "unrecognizedItems": [ { "description": "string", "confidence": number } ]
}

Item list for this area:
${JSON.stringify(promptItemList, null, 2)}`;

    // 3. Call Claude Vision (imageBlocks were built from Storage downloads above).
    //    Streamed rather than a single blocking JSON response: this call routinely runs long
    //    (chain-of-thought reasoning over up to 15 images, up to 8192 output tokens --
    //    vercel.json sets a 300s maxDuration on this function for exactly that reason), and a
    //    long-lived connection with zero bytes flowing is exactly the shape of request that
    //    gets silently truncated by intermediate infrastructure -- coming back as a 200 with
    //    an empty content array instead of a clean error. Reading the response as a stream
    //    avoids that failure mode; everything downstream still treats the result as one text
    //    string, same as before.
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        stream: true,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              ...referenceBlocks,
              ...imageBlocks,
              { type: 'text', text: 'Count the items in the storage area photo(s) above per your instructions. Reason through it first, then end with "FINAL ANSWER:" followed by the JSON.' },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: 'Claude API request failed', details: errText });
      return;
    }

    let text = '';
    let stopReason = null;
    let streamError = null;
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop(); // the last split piece may be a partial event -- carry it to the next read
        for (const evt of events) {
          for (const line of evt.split('\n')) {
            if (!line.startsWith('data:')) continue;
            let payload;
            try { payload = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
              text += payload.delta.text;
            } else if (payload.type === 'message_delta' && payload.delta?.stop_reason) {
              stopReason = payload.delta.stop_reason;
            } else if (payload.type === 'error') {
              streamError = payload.error?.message || 'Claude returned a stream error';
            }
          }
        }
      }
    } catch (e) {
      console.error('analyze-photos: stream read failed', { areaId, stageId, countId, message: e.message });
      res.status(502).json({ error: 'Claude stream was interrupted', details: e.message });
      return;
    }

    if (streamError) {
      console.error('analyze-photos: Claude stream returned an error event', { areaId, stageId, countId, streamError });
      res.status(502).json({ error: 'Claude API stream error', details: streamError });
      return;
    }

    if (!text) {
      // Should be rare now that this is streamed, but if it still happens, this is what makes
      // the next occurrence diagnosable instead of a dead end.
      console.error('analyze-photos: no text content in Claude stream', { areaId, stageId, countId, stopReason });
      res.status(502).json({ error: 'No text response from Claude', stopReason });
      return;
    }

    let parsed;
    try {
      const markerIdx = text.lastIndexOf('FINAL ANSWER:');
      const afterMarker = markerIdx >= 0 ? text.slice(markerIdx + 'FINAL ANSWER:'.length) : text;
      const cleaned = afterMarker.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      res.status(502).json({ error: 'Could not parse Claude response as JSON', raw: text });
      return;
    }

    // 4. Map into the app's match-status model.
    //    - matched / visual_match: the AI matched a real item on this area's list, split by confidence.
    //    - unknown: something visible that is NOT on the area's list at all (a genuinely new item).
    //    This endpoint only reports what was actually seen in THIS stage's photos -- it does not
    //    know the full set of stages a location will be counted across, so it never emits
    //    not_found rows. Reconciling "assigned to the area but never seen in any stage" happens
    //    once, client-side, after every stage's results have been merged (see mergeStageResults
    //    in App.jsx). Doing it per-stage here was the root cause of the old cross-stage-conflict
    //    bug: every item not visible in a given 5-photo stage was getting a not_found row, so
    //    nearly every catalog item ended up with a row in every stage and got flagged as a
    //    "conflict" purely from an artifact of how stages were batched, not a real double-count risk.
    const itemById = new Map(areaItems.map((i) => [i.itemId, i]));

    const results = [];
    for (const c of (parsed.counts || [])) {
      const it = itemById.get(c.itemId);
      if (!it) continue; // model referenced an itemId not on the list -- ignore rather than guess
      results.push({
        itemId: c.itemId,
        name: it.name,
        aiCount: c.count,
        confidence: c.confidence,
        matchStatus: c.confidence >= CONFIDENCE_THRESHOLD ? 'matched' : 'visual_match',
      });
    }

    // Genuinely unrecognized items (visible, but not on this area's list) become
    // their own rows with no itemId -- these are what "+ Add to Catalog" is for.
    const unrecognized = (parsed.unrecognizedItems || []).map((u) => ({
      itemId: null,
      name: u.description,
      aiCount: 1,
      confidence: u.confidence ?? 0.5,
      matchStatus: 'unknown',
    }));

    const allResults = [...results, ...unrecognized];

    // 5. Persist this stage's results now, before responding -- if the client never sees
    //    this response (tab killed, connection dropped), the stage's work isn't lost.
    //    (Deliberately no not_found rows here -- see the comment above; those are
    //    reconciled once at finalize, across every stage this count actually ran.)
    //
    //    Idempotency: this stage may be getting re-analyzed on a retry -- either because a
    //    prior attempt persisted successfully but the client never saw the response before
    //    retrying, or because it was part of a concurrent batch where a sibling stage failed
    //    and the whole batch got retried. Either way, count_id + stage_id rows from any
    //    earlier attempt need to be cleared before inserting the fresh set, or a retry
    //    duplicates that stage's line items instead of replacing them.
    const { error: clearErr } = await supabase.from('count_items').delete().eq('count_id', countId).eq('stage_id', stageId);
    if (clearErr) {
      res.status(500).json({ error: 'Failed to clear previous results for this stage before re-inserting', details: clearErr.message });
      return;
    }

    if (allResults.length > 0) {
      const rows = allResults.map((r) => ({
        count_id: countId,
        item_id: r.itemId,
        ai_count: r.aiCount,
        confidence: r.confidence,
        match_status: r.matchStatus,
        stage_id: stageId,
        stage_name: stageName || null,
      }));
      const { data: inserted, error: persistErr } = await supabase.from('count_items').insert(rows).select('id');
      if (persistErr) {
        // Analysis succeeded but persistence failed -- still return the results so the
        // person isn't blocked, but flag it so the frontend knows this stage isn't durable
        // yet and should retry the save rather than silently move on.
        res.status(200).json({ areaId, countId, stageId, results: allResults, model: MODEL, persisted: false, persistError: persistErr.message });
        return;
      }
      // Supabase returns inserted rows in the same order they were given.
      inserted.forEach((row, i) => { allResults[i].dbId = row.id; });
    }

    res.status(200).json({
      areaId,
      countId,
      stageId,
      results: allResults,
      model: MODEL,
      persisted: true,
    });
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
