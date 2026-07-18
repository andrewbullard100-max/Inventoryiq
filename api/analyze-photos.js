// POST /api/analyze-photos
//
// Body:
// {
//   "areaId": "area_xxxxxxxxxxxx",
//   "images": [ { "mediaType": "image/jpeg", "data": "<base64>" }, ... ]
// }
//
// Flow:
//   1. Look up which items are assigned to this area (and their par levels) in Supabase.
//   2. Send the photo(s) to Claude Vision along with ONLY that area's item list --
//      this is the area-scoped prompt: Claude never sees the full 1,423-item catalog,
//      just the ~20-130 items that actually live in this area. Better accuracy, lower cost.
//   3. Claude returns structured counts. We map its confidence score to one of four
//      match statuses your app already uses: matched / visual_match / unknown / not_found.
//   4. Response goes back to the frontend for the Review screen -- nothing is written
//      to the database here; finalization happens as its own step.

import { getSupabaseAdmin } from './_lib/supabase.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
const CONFIDENCE_THRESHOLD = 0.75; // matches the 0.75 default called out in the product spec

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { areaId, images } = req.body || {};

    if (!areaId || typeof areaId !== 'string') {
      res.status(400).json({ error: 'areaId is required' });
      return;
    }
    if (!Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: 'images must be a non-empty array' });
      return;
    }
    if (images.length > 20) {
      res.status(400).json({ error: 'Max 20 images per request' });
      return;
    }

    const supabase = getSupabaseAdmin();

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

${referenceBlocks.length > 0 ? `Before the storage area photo(s), you will also be shown reference photos for a few specific items on the list (each one labeled with its itemId). Use these to visually confirm a match when the label is unclear or the packaging is generic -- these are items that have been historically hard to identify from text/label alone.\n\n` : ''}For every item you can identify in the photo(s), report:
- itemId (must exactly match an id from the list below)
- count (your best count of units/cases visible; use the item's stated order unit)
- confidence (0.0-1.0, how sure you are of both the identification and the count)

If you see something on shelf that is clearly inventory but does NOT match any item on the list, include it in "unrecognizedItems" with a short description instead of an itemId.

Respond with ONLY valid JSON, no other text, in this exact shape:
{
  "counts": [ { "itemId": "string", "count": number, "confidence": number } ],
  "unrecognizedItems": [ { "description": "string", "confidence": number } ]
}

Item list for this area:
${JSON.stringify(promptItemList, null, 2)}`;

    const imageBlocks = images.map((img) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType,
        data: img.data,
      },
    }));

    // 3. Call Claude Vision.
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              ...referenceBlocks,
              ...imageBlocks,
              { type: 'text', text: 'Count the items in the storage area photo(s) above per your instructions and respond with the JSON only.' },
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

    const data = await response.json();
    const textBlock = (data.content || []).find((c) => c.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'No text response from Claude' });
      return;
    }

    let parsed;
    try {
      const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      res.status(502).json({ error: 'Could not parse Claude response as JSON', raw: textBlock.text });
      return;
    }

    // 4. Map into the app's match-status model.
    //    - matched / visual_match: the AI matched a real item on this area's list, split by confidence.
    //    - unknown: something visible that is NOT on the area's list at all (a genuinely new item).
    //    - not_found: an item that IS assigned to this area but wasn't seen in any photo.
    const itemById = new Map(areaItems.map((i) => [i.itemId, i]));
    const seenIds = new Set();

    const results = [];
    for (const c of (parsed.counts || [])) {
      const it = itemById.get(c.itemId);
      if (!it) continue; // model referenced an itemId not on the list -- ignore rather than guess
      seenIds.add(c.itemId);
      results.push({
        itemId: c.itemId,
        name: it.name,
        aiCount: c.count,
        confidence: c.confidence,
        matchStatus: c.confidence >= CONFIDENCE_THRESHOLD ? 'matched' : 'visual_match',
      });
    }

    // Items assigned to the area but not detected at all -> flagged for manual review.
    for (const item of areaItems) {
      if (!seenIds.has(item.itemId)) {
        results.push({
          itemId: item.itemId,
          name: item.name,
          aiCount: 0,
          confidence: 0,
          matchStatus: 'not_found',
        });
      }
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

    res.status(200).json({
      areaId,
      results: [...results, ...unrecognized],
      model: MODEL,
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
