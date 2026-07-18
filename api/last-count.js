// GET /api/last-count?areaId=area_xxxxxxxxxxxx
//
// Returns the most recent finalized (approved) count for an area, with its
// line items, so the Capture screen can show "last counted: 3 days ago"
// and each item's previous on-hand quantity as a reference point before
// the new photo-based count even runs.

import { getSupabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { areaId } = req.query || {};
    if (!areaId || typeof areaId !== 'string') {
      res.status(400).json({ error: 'areaId query param is required' });
      return;
    }

    const supabase = getSupabaseAdmin();

    const { data: counts, error: countErr } = await supabase
      .from('counts')
      .select('id, status, started_at, finalized_at')
      .eq('area_id', areaId)
      .in('status', ['approved', 'submitted'])
      .order('finalized_at', { ascending: false, nullsFirst: false })
      .order('started_at', { ascending: false })
      .limit(1);

    if (countErr) {
      res.status(500).json({ error: 'Failed to look up last count', details: countErr.message });
      return;
    }
    if (!counts || counts.length === 0) {
      res.status(200).json({ lastCount: null });
      return;
    }

    const count = counts[0];
    const { data: countItems, error: itemsErr } = await supabase
      .from('count_items')
      .select('item_id, ai_count, manual_override, match_status, confidence')
      .eq('count_id', count.id);

    if (itemsErr) {
      res.status(500).json({ error: 'Failed to load last count items', details: itemsErr.message });
      return;
    }

    res.status(200).json({
      lastCount: {
        id: count.id,
        status: count.status,
        date: count.finalized_at || count.started_at,
        items: (countItems || []).map((ci) => ({
          itemId: ci.item_id,
          onHand: ci.manual_override ?? ci.ai_count,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
