// POST /api/finalize-count
//
// Body:
// {
//   "countId": "uuid",              -- from /api/start-count; this count's stages have
//                                       already had their results persisted by analyze-photos
//   "areaId": "area_xxxxxxxxxxxx",
//   "requireApproval": false,
//   "finalItems": [
//     {
//       "itemId": "item_xxx" | null,          -- null only for "unknown" rows
//       "aiCount": 6, "confidence": 0.91, "matchStatus": "matched",
//       "override": null, "note": "",
//       "sourceRowIds": ["uuid-of-the-count_items-row-this-came-from"]
//       // sourceRowIds has >1 entries for an item that was detected in multiple stages
//       // (the person is confirming the merged/reconciled total), and is omitted/empty
//       // for a not_found item that was never detected in any stage.
//     }
//   ]
// }
//
// What changed from the old version: this no longer creates the `counts` row or inserts
// every line item from scratch -- start-count + analyze-photos already did that
// progressively, stage by stage, as the count happened. This endpoint's job now is just
// to reconcile and lock the session:
//   - a single-stage detection gets its manual_override/override_note applied via UPDATE
//     (the original AI detection row itself is left alone -- it's audit trail)
//   - a cross-stage detection (sourceRowIds.length > 1) gets ONE new reconciled row
//     inserted (stage_id NULL), representing the final adjudicated quantity, while the
//     individual per-stage detection rows that fed it stay in place as audit trail
//   - an item assigned to the area but never detected in any stage gets its not_found row
//     inserted now, for the first time -- this used to happen per-stage (the root cause of
//     the old cross-stage-conflict bug); reconciling it once, here, against the complete
//     set of what was actually detected across every stage, is the fix.

import { getSupabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { countId, areaId, requireApproval, finalItems } = req.body || {};

    if (!countId || typeof countId !== 'string') {
      res.status(400).json({ error: 'countId is required' });
      return;
    }
    if (!areaId || typeof areaId !== 'string') {
      res.status(400).json({ error: 'areaId is required' });
      return;
    }
    if (!Array.isArray(finalItems)) {
      res.status(400).json({ error: 'finalItems must be an array' });
      return;
    }

    const supabase = getSupabaseAdmin();

    // Sanity check: don't finalize a count that isn't ours / isn't in_progress. Prevents
    // double-finalizing (e.g. a retried request) from corrupting an already-locked count.
    const { data: existingCount, error: countFetchErr } = await supabase
      .from('counts')
      .select('id, status')
      .eq('id', countId)
      .single();

    if (countFetchErr || !existingCount) {
      res.status(404).json({ error: 'Count session not found', details: countFetchErr?.message });
      return;
    }
    if (existingCount.status !== 'in_progress') {
      res.status(409).json({ error: `Count is already ${existingCount.status}, cannot finalize again` });
      return;
    }

    // 1. Apply overrides to single-stage rows, and insert reconciled rows for anything
    //    that doesn't map to exactly one existing row (cross-stage merges, not_found).
    for (const fi of finalItems) {
      const sourceIds = Array.isArray(fi.sourceRowIds) ? fi.sourceRowIds.filter(Boolean) : [];

      if (sourceIds.length === 1) {
        // Besides overrides, this also needs to persist item_id/match_status -- the
        // "+ Add to Catalog" flow reclassifies a row from unknown (item_id null) to a real
        // catalog item client-side, and that reclassification has to land here too, or the
        // row stays orphaned as "unknown" in the database forever.
        const { error: updateErr } = await supabase
          .from('count_items')
          .update({
            item_id: fi.itemId ?? null,
            match_status: fi.matchStatus || 'unknown',
            manual_override: fi.override ?? null,
            override_note: fi.note || null,
          })
          .eq('id', sourceIds[0])
          .eq('count_id', countId); // extra guard against cross-count id mixups
        if (updateErr) {
          res.status(500).json({ error: `Failed to apply override for item ${fi.itemId}`, details: updateErr.message });
          return;
        }
      } else {
        // Either a cross-stage merge (sourceIds.length > 1) or a not_found reconciliation
        // (sourceIds.length === 0) -- both need a brand-new stage_id-NULL row representing
        // the final adjudicated line.
        const { error: insertErr } = await supabase.from('count_items').insert({
          count_id: countId,
          item_id: fi.itemId ?? null,
          ai_count: fi.aiCount ?? 0,
          confidence: fi.confidence ?? 0,
          match_status: fi.matchStatus || (sourceIds.length > 1 ? 'cross_stage_conflict' : 'not_found'),
          manual_override: fi.override ?? null,
          override_note: fi.note || null,
          stage_id: null,
          stage_name: null,
        });
        if (insertErr) {
          res.status(500).json({ error: `Failed to save reconciled row for item ${fi.itemId}`, details: insertErr.message });
          return;
        }
      }
    }

    // 2. Lock the session.
    const status = requireApproval ? 'submitted' : 'approved';
    const now = new Date().toISOString();
    const { error: statusErr } = await supabase
      .from('counts')
      .update({ status, finalized_at: status === 'approved' ? now : null })
      .eq('id', countId);

    if (statusErr) {
      res.status(500).json({ error: 'Line items saved but failed to lock the count session', details: statusErr.message, countId });
      return;
    }

    res.status(200).json({ countId, status, itemCount: finalItems.length });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
