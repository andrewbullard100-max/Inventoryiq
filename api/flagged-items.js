// GET /api/flagged-items
//
// Returns items that keep coming back as visual_match or unknown in real
// count history (2+ times) and don't have a reference photo yet. This is
// the "tell me which items actually need a reference photo" list -- driven
// by real evidence, not a guess at the whole catalog upfront.

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, respondToAuthError } from './_lib/auth.js';

const THRESHOLD_OCCURRENCES = 2;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);
    requireOrgMembership(auth);

    // count_items has no organization_id of its own -- scope through the org's own counts.
    const { data: orgCounts, error: countsErr } = await supabase.from('counts').select('id').eq('organization_id', auth.orgId);
    if (countsErr) { res.status(500).json({ error: 'Failed to load counts', details: countsErr.message }); return; }
    const countIds = (orgCounts || []).map(c => c.id);
    if (countIds.length === 0) { res.status(200).json({ items: [] }); return; }

    const { data: rows, error } = await supabase
      .from('count_items')
      .select('item_id, match_status, confidence, items ( id, name, brand, reference_image_url )')
      .in('match_status', ['visual_match', 'unknown'])
      .in('count_id', countIds);

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
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
