// GET /api/catalog
//
// Returns the full catalog tree for the caller's organization: locations -> areas, plus
// the item master, every area assignment, and two pieces of counting-status data the
// simplified home screen needs so it doesn't require a second round-trip:
//   - each area's lastCountedAt (most recent approved count) and countIntervalDays, so the
//     client can compute which areas are "due" for a cycle count
//   - recentCounts: the caller's own last 10 counts (started or finalized by them), across
//     any area, for the "My Recent Counts" list
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
      supabase.from('locations').select('id, name, type').eq('organization_id', orgId),
      supabase.from('areas').select('id, location_id, name, count_interval_days').eq('organization_id', orgId),
      supabase.from('items').select('id, name, brand, vendor, vendor_item_code, order_uom, pack_size, unit_price, category_id, gl_account, aliases, reference_image_url, reference_image_urls').eq('organization_id', orgId),
      supabase.from('item_area_assignments').select('id, item_id, area_id, par_level, sort_order').eq('organization_id', orgId),
      supabase.from('stages').select('id, area_id, name, sort_order').eq('organization_id', orgId).order('sort_order', { ascending: true }),
    ]);

    const firstError = locErr || areaErr || itemErr || asnErr || stageErr;
    if (firstError) {
      res.status(500).json({ error: 'Failed to load catalog', details: firstError.message });
      return;
    }

    // Last approved count per area -- drives "Due Today" client-side (an area is due once
    // now - lastCountedAt > count_interval_days). Best-effort: an area with no approved
    // count yet just comes back with lastCountedAt: null, which the client treats as
    // "always due" (nothing to compare against).
    let lastCountedAtByArea = {};
    let recentCounts = [];
    if (areas.length) {
      const areaIds = areas.map(a => a.id);
      const { data: countRows, error: countsErr } = await supabase
        .from('counts')
        .select('id, area_id, status, started_at, finalized_at, started_by, finalized_by')
        .eq('organization_id', orgId)
        .in('area_id', areaIds)
        .order('started_at', { ascending: false })
        .limit(500); // recent window is plenty for both lastCountedAt and this user's recent list

      if (!countsErr) {
        for (const c of countRows || []) {
          if (c.status !== 'approved') continue;
          const date = c.finalized_at || c.started_at;
          const existing = lastCountedAtByArea[c.area_id];
          if (!existing || new Date(date) > new Date(existing)) lastCountedAtByArea[c.area_id] = date;
        }

        const areaNameById = new Map(areas.map(a => [a.id, a.name]));
        recentCounts = (countRows || [])
          .filter(c => c.started_by === auth.userId || c.finalized_by === auth.userId)
          .slice(0, 10)
          .map(c => ({
            countId: c.id,
            areaId: c.area_id,
            areaName: areaNameById.get(c.area_id) || 'Unknown area',
            status: c.status,
            date: c.finalized_at || c.started_at,
          }));
      }
    }

    const areasWithStatus = areas.map(a => ({
      ...a,
      last_counted_at: lastCountedAtByArea[a.id] || null,
    }));

    res.status(200).json({ locations, areas: areasWithStatus, items, assignments, stages, recentCounts });
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
};
