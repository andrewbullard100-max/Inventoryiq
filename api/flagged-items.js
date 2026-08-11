// GET /api/flagged-items
//
// Returns items that need a reference photo, driven by two kinds of real evidence (2+
// occurrences of either counts as flagged):
//   1. Claude Vision itself came back uncertain -- visual_match or unknown match_status
//   2. A manager corrected the AI's identification and said why -- override_reason of
//      wrong_item or lighting_angle specifically. Those two reasons mean "the AI
//      misidentified this item" (a reference photo can plausibly fix it); wrong_quantity
//      and partial_case are counting problems a photo wouldn't help with, so they're
//      intentionally excluded from this signal.
// Either signal alone can flag an item; an item hitting both isn't double-counted --
// occurrences is a max, not a sum, across the two sources.

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, respondToAuthError } from './_lib/auth.js';

const THRESHOLD_OCCURRENCES = 2;
const MISIDENTIFICATION_REASONS = ['wrong_item', 'lighting_angle'];

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

    const [lowConfidenceResp, misidentifiedResp] = await Promise.all([
      supabase.from('count_items')
        .select('item_id, items ( id, name, brand, reference_image_url )')
        .in('match_status', ['visual_match', 'unknown'])
        .in('count_id', countIds),
      supabase.from('count_items')
        .select('item_id, override_reason, items ( id, name, brand, reference_image_url )')
        .in('override_reason', MISIDENTIFICATION_REASONS)
        .in('count_id', countIds),
    ]);
    // override_reason may not exist yet if the migration hasn't been applied -- degrade to
    // the low-confidence signal alone rather than failing the whole endpoint.
    const misidentifiedRows = /override_reason|schema cache/i.test(misidentifiedResp.error?.message || '') ? [] : (misidentifiedResp.data || []);
    if (lowConfidenceResp.error) {
      res.status(500).json({ error: 'Failed to load count history', details: lowConfidenceResp.error.message });
      return;
    }

    const byItem = new Map();
    const tally = (rows, source) => {
      for (const row of rows) {
        if (!row.items || row.items.reference_image_url) continue; // already has a reference photo
        const key = row.item_id;
        const entry = byItem.get(key) || { itemId: key, name: row.items.name, brand: row.items.brand, lowConfidenceCount: 0, misidentifiedCount: 0 };
        entry[source] += 1;
        byItem.set(key, entry);
      }
    };
    tally(lowConfidenceResp.data || [], 'lowConfidenceCount');
    tally(misidentifiedRows, 'misidentifiedCount');

    const flagged = Array.from(byItem.values())
      .map(e => ({ ...e, occurrences: Math.max(e.lowConfidenceCount, e.misidentifiedCount) }))
      .filter((e) => e.occurrences >= THRESHOLD_OCCURRENCES)
      .sort((a, b) => b.occurrences - a.occurrences);

    res.status(200).json({ items: flagged });
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}

