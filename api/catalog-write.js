// /api/catalog-write
//
// Consolidates what used to be upsert-items.js, upsert-assignments.js, and
// upsert-stages.js into one action-routed file, the same way count-session.js and org.js
// do -- adding auth touched every one of these anyway, and 3 separate files plus the new
// org.js would have pushed this project back over Vercel Hobby's 12-function cap.
//
// All actions are manager-only for now (catalog/sites edits aren't something the simple
// two-role model extends to counters yet -- see the settings.staffCanAddItems toggle in
// the frontend, which isn't wired to server-side enforcement yet).
//
// POST /api/catalog-write   body: { action: "upsert-locations", locations: [...] }
// POST /api/catalog-write   body: { action: "delete-location", id }
// POST /api/catalog-write   body: { action: "upsert-areas", locationId, areas: [...] }
// POST /api/catalog-write   body: { action: "delete-area", id }
// POST /api/catalog-write   body: { action: "upsert-items", items: [...] }
// POST /api/catalog-write   body: { action: "upsert-assignments", assignments: [...] }
// POST /api/catalog-write   body: { action: "delete-assignment", itemId, areaId }
// POST /api/catalog-write   body: { action: "upsert-stages", areaId, stages: [...] }
// POST /api/catalog-write   body: { action: "delete-stage", id }

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, requireManager, respondToAuthError, HttpError } from './_lib/auth.js';
import crypto from 'crypto';

function newItemId() { return 'item_' + crypto.randomBytes(6).toString('hex'); }
function newStageId() { return 'stage_' + crypto.randomBytes(6).toString('hex'); }
function newLocationId() { return 'loc_' + crypto.randomBytes(6).toString('hex'); }
function newAreaId() { return 'area_' + crypto.randomBytes(6).toString('hex'); }
function assignmentId(itemId, areaId) { return 'asn_' + crypto.createHash('md5').update(`${itemId}|${areaId}`).digest('hex').slice(0, 12); }

async function handleUpsertLocations(req, res, supabase, auth) {
  const { locations } = req.body || {};
  if (!Array.isArray(locations) || locations.length === 0) throw new HttpError(400, 'locations must be a non-empty array');

  const rows = locations.map((l) => ({
    id: l.id || newLocationId(),
    organization_id: auth.orgId,
    name: l.name,
    type: l.type || null,
  }));

  const { data, error } = await supabase.from('locations').upsert(rows, { onConflict: 'id' }).select('id, name, type');
  if (error) throw new HttpError(500, `Failed to save locations: ${error.message}`);
  res.status(200).json({ locations: data });
}

async function handleDeleteLocation(req, res, supabase, auth) {
  const { id } = req.body || {};
  if (!id) throw new HttpError(400, 'id is required');

  // areas / counts / item_area_assignments / stages under this location cascade-delete at
  // the DB level -- this genuinely destroys count history for the location, not just the
  // site/area definitions. The frontend confirms this explicitly before calling here.
  const { error } = await supabase.from('locations').delete().eq('id', id).eq('organization_id', auth.orgId);
  if (error) throw new HttpError(500, `Failed to remove location: ${error.message}`);
  res.status(200).json({ removed: true });
}

async function handleUpsertAreas(req, res, supabase, auth) {
  const { locationId, areas } = req.body || {};
  if (!locationId || !Array.isArray(areas) || areas.length === 0) throw new HttpError(400, 'locationId and a non-empty areas array are required');

  const { data: locCheck, error: locCheckErr } = await supabase.from('locations').select('id').eq('id', locationId).eq('organization_id', auth.orgId).maybeSingle();
  if (locCheckErr) throw new HttpError(500, 'Failed to verify location ownership');
  if (!locCheck) throw new HttpError(404, 'Location not found in your organization');

  const rows = areas.map((a) => ({
    id: a.id || newAreaId(),
    organization_id: auth.orgId,
    location_id: locationId,
    name: a.name,
    count_interval_days: a.countIntervalDays ?? 7,
  }));

  const { data, error } = await supabase.from('areas').upsert(rows, { onConflict: 'id' }).select('id, location_id, name, count_interval_days');
  if (error) throw new HttpError(500, `Failed to save areas: ${error.message}`);
  res.status(200).json({ areas: data });
}

async function handleDeleteArea(req, res, supabase, auth) {
  const { id } = req.body || {};
  if (!id) throw new HttpError(400, 'id is required');

  // count_items / stages / item_area_assignments under this area cascade-delete at the DB
  // level -- this destroys count history for the area. The frontend confirms this first.
  const { error } = await supabase.from('areas').delete().eq('id', id).eq('organization_id', auth.orgId);
  if (error) throw new HttpError(500, `Failed to remove area: ${error.message}`);
  res.status(200).json({ removed: true });
}

async function handleUpsertItems(req, res, supabase, auth) {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'items must be a non-empty array');

  const rows = items.map((i) => ({
    id: i.id || newItemId(),
    organization_id: auth.orgId,
    name: i.name,
    brand: i.brand || null,
    vendor: i.vendor || null,
    vendor_item_code: i.vendorItemCode || null,
    order_uom: i.orderUom || null,
    pack_size: i.packSize || null,
    unit_price: i.unitPrice ?? null,
    aliases: JSON.stringify(i.aliases || []),
  }));

  const { data, error } = await supabase.from('items').upsert(rows, { onConflict: 'id' }).select('id, name');
  if (error) throw new HttpError(500, `Failed to save items: ${error.message}`);
  res.status(200).json({ items: data });
}

async function handleUpsertAssignments(req, res, supabase, auth) {
  const { assignments } = req.body || {};
  if (!Array.isArray(assignments) || assignments.length === 0) throw new HttpError(400, 'assignments must be a non-empty array');

  const rows = assignments.map((a) => ({
    id: assignmentId(a.itemId, a.areaId),
    organization_id: auth.orgId,
    item_id: a.itemId,
    area_id: a.areaId,
    par_level: a.parLevel ?? 0,
  }));

  const { data, error } = await supabase.from('item_area_assignments').upsert(rows, { onConflict: 'item_id,area_id' }).select('id');
  if (error) throw new HttpError(500, `Failed to save assignments: ${error.message}`);
  res.status(200).json({ assignments: data });
}

async function handleDeleteAssignment(req, res, supabase, auth) {
  const { itemId, areaId } = req.body || {};
  if (!itemId || !areaId) throw new HttpError(400, 'itemId and areaId are required');

  const { error } = await supabase
    .from('item_area_assignments').delete()
    .eq('item_id', itemId).eq('area_id', areaId).eq('organization_id', auth.orgId);
  if (error) throw new HttpError(500, `Failed to remove assignment: ${error.message}`);
  res.status(200).json({ removed: true });
}

async function handleUpsertStages(req, res, supabase, auth) {
  const { areaId, stages } = req.body || {};
  if (!areaId || !Array.isArray(stages) || stages.length === 0) throw new HttpError(400, 'areaId and a non-empty stages array are required');

  const rows = stages.map((s) => ({
    id: s.id || newStageId(),
    organization_id: auth.orgId,
    area_id: areaId,
    name: s.name,
    sort_order: s.sortOrder ?? 0,
  }));

  const { data, error } = await supabase.from('stages').upsert(rows, { onConflict: 'id' }).select('id, area_id, name, sort_order');
  if (error) throw new HttpError(500, `Failed to save stages: ${error.message}`);
  res.status(200).json({ stages: data });
}

async function handleDeleteStage(req, res, supabase, auth) {
  const { id } = req.body || {};
  if (!id) throw new HttpError(400, 'id is required');

  const { error } = await supabase.from('stages').delete().eq('id', id).eq('organization_id', auth.orgId);
  if (error) throw new HttpError(500, `Failed to remove stage: ${error.message}`);
  res.status(200).json({ removed: true });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);
    requireOrgMembership(auth);

    const { action } = req.body || {};

    // upsert-stages is part of the ordinary capture flow (naming "Shelf 1" while counting),
    // not a catalog edit -- both roles need it, or a counter couldn't persist stage names
    // while running a count. Everything else here IS a catalog/site edit and stays
    // manager-only.
    if (action === 'upsert-stages') { await handleUpsertStages(req, res, supabase, auth); return; }

    requireManager(auth);
    if (action === 'upsert-locations') { await handleUpsertLocations(req, res, supabase, auth); return; }
    if (action === 'delete-location') { await handleDeleteLocation(req, res, supabase, auth); return; }
    if (action === 'upsert-areas') { await handleUpsertAreas(req, res, supabase, auth); return; }
    if (action === 'delete-area') { await handleDeleteArea(req, res, supabase, auth); return; }
    if (action === 'upsert-items') { await handleUpsertItems(req, res, supabase, auth); return; }
    if (action === 'upsert-assignments') { await handleUpsertAssignments(req, res, supabase, auth); return; }
    if (action === 'delete-assignment') { await handleDeleteAssignment(req, res, supabase, auth); return; }
    if (action === 'delete-stage') { await handleDeleteStage(req, res, supabase, auth); return; }
    res.status(400).json({ error: 'Unknown or missing action' });
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
