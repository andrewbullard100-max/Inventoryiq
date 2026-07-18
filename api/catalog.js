// GET /api/catalog
//
// Returns the full catalog tree from Supabase: locations -> areas, plus the
// global item master and every area assignment. The frontend loads this once
// on startup instead of using hardcoded demo data, so location/area names,
// items, and par levels always reflect what's actually in the database.
//
// Read-only. Safe to call without auth for now since it's reference data,
// not secrets -- revisit if/when this app has real user accounts.

import { getSupabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const [{ data: locations, error: locErr }, { data: areas, error: areaErr },
           { data: items, error: itemErr }, { data: assignments, error: asnErr },
           { data: stages, error: stageErr }] = await Promise.all([
      supabase.from('locations').select('id, name'),
      supabase.from('areas').select('id, location_id, name'),
      supabase.from('items').select('id, name, brand, vendor, vendor_item_code, order_uom, pack_size, unit_price, category_id, gl_account, aliases, reference_image_url'),
      supabase.from('item_area_assignments').select('id, item_id, area_id, par_level, sort_order'),
      supabase.from('stages').select('id, area_id, name, sort_order').order('sort_order', { ascending: true }),
    ]);

    const firstError = locErr || areaErr || itemErr || asnErr || stageErr;
    if (firstError) {
      res.status(500).json({ error: 'Failed to load catalog', details: firstError.message });
      return;
    }

    res.status(200).json({ locations, areas, items, assignments, stages });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
