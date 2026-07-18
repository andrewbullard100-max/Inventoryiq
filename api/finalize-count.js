// POST /api/finalize-count
//
// Body:
// {
//   "areaId": "area_xxxxxxxxxxxx",
//   "requireApproval": false,
//   "items": [
//     { "itemId": "item_xxx", "aiCount": 6, "confidence": 0.91, "matchStatus": "matched", "override": null }
//   ]
// }
//
// Writes one row to `counts` and one row per item to `count_items`. This is
// what actually saves a finished count sheet -- before this, everything the
// Review screen showed only lived in the browser tab.

import { getSupabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { areaId, requireApproval, items } = req.body || {};

    if (!areaId || typeof areaId !== 'string') {
      res.status(400).json({ error: 'areaId is required' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const status = requireApproval ? 'submitted' : 'approved';
    const now = new Date().toISOString();

    const { data: count, error: countErr } = await supabase
      .from('counts')
      .insert({
        area_id: areaId,
        status,
        started_at: now,
        finalized_at: status === 'approved' ? now : null,
      })
      .select('id')
      .single();

    if (countErr) {
      res.status(500).json({ error: 'Failed to create count session', details: countErr.message });
      return;
    }

    const rows = items.map((i) => ({
      count_id: count.id,
      item_id: i.itemId,
      ai_count: i.aiCount ?? 0,
      confidence: i.confidence ?? 0,
      match_status: i.matchStatus || 'unknown',
      manual_override: i.override ?? null,
      stage_id: i.stageId ?? null,
      stage_name: i.stageName ?? null,
    }));

    const { error: itemsErr } = await supabase.from('count_items').insert(rows);
    if (itemsErr) {
      res.status(500).json({ error: 'Count session created but line items failed to save', details: itemsErr.message, countId: count.id });
      return;
    }

    res.status(200).json({ countId: count.id, status, itemCount: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
