// GET /api/catalog
//
// Returns the full catalog tree for the caller's organization: locations -> areas, plus
// the item master and every area assignment. The frontend loads this once on startup.
//
// Requires auth -- scoped to the caller's organization_id on every table.

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, respondToAuthError } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);
    requireOrgMembership(auth);
    const orgId = auth.orgId;

    const [{ data: locations, error: locErr }, { data: areas, error: areaErr },
           { data: items, error: itemErr }, { data: assignments, error: asnErr },
           { data: stages, error: stageErr }] = await Promise.all([
      supabase.from('locations').select('id, name').eq('organization_id', orgId),
      supabase.from('areas').select('id, location_id, name').eq('organization_id', orgId),
      supabase.from('items').select('id, name, brand, vendor, vendor_item_code, order_uom, pack_size, unit_price, category_id, gl_account, aliases, reference_image_url').eq('organization_id', orgId),
      supabase.from('item_area_assignments').select('id, item_id, area_id, par_level, sort_order').eq('organization_id', orgId),
      supabase.from('stages').select('id, area_id, name, sort_order').eq('organization_id', orgId).order('sort_order', { ascending: true }),
    ]);

    const firstError = locErr || areaErr || itemErr || asnErr || stageErr;
    if (firstError) {
      res.status(500).json({ error: 'Failed to load catalog', details: firstError.message });
      return;
    }

    res.status(200).json({ locations, areas, items, assignments, stages });
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
