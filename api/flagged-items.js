// GET /api/flagged-items
//
// Returns items that keep coming back as visual_match or unknown in real
// count history (2+ times) and don't have a reference photo yet. This is
// the "tell me which items actually need a reference photo" list -- driven
// by real evidence, not a guess at the whole catalog upfront.

import { getSupabaseAdmin } from './_lib/supabase.js';

const THRESHOLD_OCCURRENCES = 2;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: rows, error } = await supabase
      .from('count_items')
      .select('item_id, match_status, confidence, items ( id, name, brand, reference_image_url )')
      .in('match_status', ['visual_match', 'unknown']);

    if (error) {
      res.status(500).json({ error: 'Failed to load count history', details: error.message });
      return;
    }

    const byItem = new Map();
    for (const row of rows || []) {
      if (!row.items || row.items.reference_image_url) continue; // already has a reference photo
      const key = row.item_id;
      const entry = byItem.get(key) || { itemId: key, name: row.items.name, brand: row.items.brand, occurrences: 0 };
      entry.occurrences += 1;
      byItem.set(key, entry);
    }

    const flagged = Array.from(byItem.values())
      .filter((e) => e.occurrences >= THRESHOLD_OCCURRENCES)
      .sort((a, b) => b.occurrences - a.occurrences);

    res.status(200).json({ items: flagged });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
