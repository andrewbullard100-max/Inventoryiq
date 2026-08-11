// POST /api/finalize-count
//
// Default (no `action`) -- finalize/reconcile, body:
// {
//   "countId": "uuid",              -- from /api/count-session; this count's stages have
//                                       already had their results persisted by analyze-photos
//   "areaId": "area_xxxxxxxxxxxx",
//   "requireApproval": false,
//   "finalItems": [
//     {
//       "itemId": "item_xxx" | null,          -- null only for "unknown" rows
//       "aiCount": 6, "confidence": 0.91, "matchStatus": "matched",
//       "override": null, "note": "", "overrideReason": null, "overrideNote": "",
//       "sourceRowIds": ["uuid-of-the-count_items-row-this-came-from"]
//       // sourceRowIds has >1 entries for an item that was detected in multiple stages
//       // (the person is confirming the merged/reconciled total), and is omitted/empty
//       // for a not_found item that was never detected in any stage.
//     }
//   ]
// }
//
// This endpoint reconciles and locks the session -- it does not create the `counts` row
// or the original per-stage line items; count-session.js + analyze-photos.js already did
// that progressively as the count happened:
//   - a single-stage detection gets its manual_override/override_reason/override_note
//     applied via UPDATE, plus its locked unit_cost/extended_value (the original AI
//     detection row itself is otherwise left alone -- it's audit trail)
//   - a cross-stage detection (sourceRowIds.length > 1) gets ONE new reconciled row
//     inserted (stage_id NULL), representing the final adjudicated quantity, while the
//     individual per-stage detection rows that fed it stay in place as audit trail
//   - an item assigned to the area but never detected in any stage gets its not_found row
//     inserted now, for the first time
// Cost is always read server-side from the item master at the moment the count is
// finalized -- never trust a browser-supplied price for accounting value. Locked
// unit_cost/extended_value are snapshots: later catalog price changes do not rewrite the
// value of inventory that was already counted.
//
// { action: 'approve', countId }               -- moves a submitted count to approved.
// { action: 'reject',  countId, note }          -- sends it back, reason required.
// Every transition (submitted / approved / rejected / finalized) writes a row to
// count_events -- an append-only audit log of who did what, when.
//
// Required DB migrations:
//   supabase/migrations/20260810_lock_inventory_cost.sql
//   supabase/migrations/20260810_inventory_control_v5.sql
//   supabase/migrations/20260810_audit_trail.sql
//   supabase/migrations/20260810_override_feedback.sql

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, respondToAuthError, HttpError } from './_lib/auth.js';

const roundMoney = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

async function logEvent(supabase, countId, eventType, actorName, note) {
  // Audit logging is best-effort: a missing migration or transient failure here must
  // never block the underlying approve/reject/finalize action.
  try {
    await supabase.from('count_events').insert({ count_id: countId, event_type: eventType, actor_name: actorName || null, note: note || null });
  } catch { /* non-fatal */ }
}

// Finds (or opens) this org's current open inventory cycle. Best-effort: if the v5
// migration hasn't been applied, counts still finalize without a cycle attached.
async function resolveOpenCycleId(supabase, orgId) {
  const existing = await supabase.from('inventory_cycles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return null; // e.g. migration not applied yet
  if (existing.data?.id) return existing.data.id;

  const created = await supabase.from('inventory_cycles')
    .insert({ organization_id: orgId, label: `Inventory ${new Date().toLocaleDateString('en-US')}`, status: 'open', started_at: new Date().toISOString() })
    .select('id').single();
  return created.error ? null : (created.data?.id || null);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);
    requireOrgMembership(auth);

    const { action } = req.body || {};
    if (action === 'approve' || action === 'reject') { await handleDecision(req, res, supabase, auth, action); return; }
    await handleFinalize(req, res, supabase, auth);
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}

async function handleDecision(req, res, supabase, auth, action) {
  const { countId, note } = req.body || {};
  if (!countId) { res.status(400).json({ error: 'countId is required' }); return; }
  if (action === 'reject' && (!note || !note.trim())) { res.status(400).json({ error: 'A reason is required to reject a count' }); return; }

  const { data: existing, error: fetchErr } = await supabase
    .from('counts').select('id, status').eq('id', countId).eq('organization_id', auth.orgId).single();
  if (fetchErr || !existing) { res.status(404).json({ error: 'Count not found in your organization' }); return; }
  if (existing.status !== 'submitted') {
    res.status(409).json({ error: `This count is already ${existing.status}, not awaiting approval.` });
    return;
  }

  const now = new Date().toISOString();
  const update = action === 'approve'
    ? { status: 'approved', finalized_at: now, approved_by: auth.userId }
    : { status: 'rejected', rejection_reason: note.trim() };

  const { error: updateErr } = await supabase.from('counts').update(update).eq('id', countId);
  if (updateErr) {
    const migrationMissing = /approved_by|rejection_reason|schema cache/i.test(updateErr.message || '');
    res.status(500).json({
      error: migrationMissing
        ? 'The approval workflow is not enabled in the database yet.'
        : `Failed to ${action} count`,
      details: updateErr.message,
    });
    return;
  }

  await logEvent(supabase, countId, action === 'approve' ? 'approved' : 'rejected', auth.email, note);
  res.status(200).json({ countId, status: update.status });
}

async function handleFinalize(req, res, supabase, auth) {
  const { countId, areaId, requireApproval, finalItems } = req.body || {};

  if (!countId || typeof countId !== 'string') { res.status(400).json({ error: 'countId is required' }); return; }
  if (!areaId || typeof areaId !== 'string') { res.status(400).json({ error: 'areaId is required' }); return; }
  if (!Array.isArray(finalItems)) { res.status(400).json({ error: 'finalItems must be an array' }); return; }

  // Don't finalize a count that isn't ours / isn't in_progress / isn't in the caller's
  // organization. Prevents double-finalizing (e.g. a retried request) from corrupting an
  // already-locked count, and prevents finalizing another org's count.
  const { data: existingCount, error: countFetchErr } = await supabase
    .from('counts')
    .select('id, status')
    .eq('id', countId)
    .eq('organization_id', auth.orgId)
    .single();

  if (countFetchErr || !existingCount) { res.status(404).json({ error: 'Count session not found', details: countFetchErr?.message }); return; }
  if (existingCount.status !== 'in_progress') {
    res.status(409).json({ error: `Count is already ${existingCount.status}, cannot finalize again` });
    return;
  }

  // Cost is always read server-side from the item master, never trusted from the browser.
  const itemIds = [...new Set(finalItems.map(fi => fi.itemId).filter(Boolean))];
  const priceByItem = new Map();
  if (itemIds.length) {
    const { data: priceRows, error: priceErr } = await supabase
      .from('items').select('id, unit_price').eq('organization_id', auth.orgId).in('id', itemIds);
    if (priceErr) { res.status(500).json({ error: 'Failed to lock item costs', details: priceErr.message }); return; }
    for (const r of (priceRows || [])) priceByItem.set(r.id, Number(r.unit_price || 0));
  }
  const now = new Date().toISOString();
  const cycleId = await resolveOpenCycleId(supabase, auth.orgId);

  for (const fi of finalItems) {
    const sourceIds = Array.isArray(fi.sourceRowIds) ? fi.sourceRowIds.filter(Boolean) : [];
    const quantity = Number(fi.override ?? fi.aiCount ?? 0);
    const unitCost = Number(priceByItem.get(fi.itemId) || 0);
    const extendedValue = roundMoney(quantity * unitCost);
    const hasOverride = fi.override !== null && fi.override !== undefined;

    if (sourceIds.length === 1) {
      // Besides overrides, this also needs to persist item_id/match_status -- the
      // "+ Add to Catalog" flow reclassifies a row from unknown (item_id null) to a real
      // catalog item client-side, and that reclassification has to land here too, or the
      // row stays orphaned as "unknown" in the database forever.
      const update = {
        item_id: fi.itemId ?? null,
        match_status: fi.matchStatus || 'unknown',
        manual_override: fi.override ?? null,
        override_note: fi.note || null,
        unit_cost: unitCost,
        extended_value: extendedValue,
        cost_locked_at: now,
        count_status: fi.countStatus || (fi.matchStatus === 'not_found' ? 'not_seen' : 'counted'),
        override_reason: hasOverride ? (fi.overrideReason || null) : null,
      };
      let { error: updateErr } = await supabase.from('count_items').update(update).eq('id', sourceIds[0]).eq('count_id', countId);
      if (updateErr && /override_reason|unit_cost|extended_value|cost_locked_at|count_status|schema cache/i.test(updateErr.message || '')) {
        // Progressive compatibility: some historical-cost / override-reason / count-status
        // migrations may not be applied yet. Retry with just the always-present columns.
        ({ error: updateErr } = await supabase.from('count_items').update({
          item_id: fi.itemId ?? null,
          match_status: fi.matchStatus || 'unknown',
          manual_override: fi.override ?? null,
          override_note: fi.note || null,
        }).eq('id', sourceIds[0]).eq('count_id', countId));
      }
      if (updateErr) {
        res.status(500).json({ error: `Failed to apply override for item ${fi.itemId}`, details: updateErr.message });
        return;
      }
    } else {
      // Either a cross-stage merge (sourceIds.length > 1) or a not_found reconciliation
      // (sourceIds.length === 0) -- both need a brand-new stage_id-NULL row representing
      // the final adjudicated line.
      const insert = {
        count_id: countId,
        item_id: fi.itemId ?? null,
        ai_count: fi.aiCount ?? 0,
        confidence: fi.confidence ?? 0,
        match_status: fi.matchStatus || (sourceIds.length > 1 ? 'cross_stage_conflict' : 'not_found'),
        manual_override: fi.override ?? null,
        override_note: fi.note || null,
        stage_id: null,
        stage_name: null,
        unit_cost: unitCost,
        extended_value: extendedValue,
        cost_locked_at: now,
        count_status: fi.countStatus || (fi.matchStatus === 'not_found' || sourceIds.length === 0 ? 'not_seen' : 'counted'),
        override_reason: hasOverride ? (fi.overrideReason || null) : null,
      };
      let { error: insertErr } = await supabase.from('count_items').insert(insert);
      if (insertErr && /override_reason|unit_cost|extended_value|cost_locked_at|count_status|schema cache/i.test(insertErr.message || '')) {
        const { unit_cost, extended_value, cost_locked_at, count_status, override_reason, ...legacy } = insert;
        ({ error: insertErr } = await supabase.from('count_items').insert(legacy));
      }
      if (insertErr) {
        res.status(500).json({ error: `Failed to save reconciled row for item ${fi.itemId}`, details: insertErr.message });
        return;
      }
    }
  }

  // Lock the session.
  const status = requireApproval ? 'submitted' : 'approved';
  const countUpdate = { status, finalized_at: status === 'approved' ? now : null, finalized_by: auth.userId };
  if (cycleId) countUpdate.cycle_id = cycleId;
  if (status === 'submitted') countUpdate.submitted_by = auth.userId;
  if (status === 'approved') countUpdate.approved_by = auth.userId;

  let { error: statusErr } = await supabase.from('counts').update(countUpdate).eq('id', countId);
  if (statusErr && /cycle_id|submitted_by|approved_by|schema cache/i.test(statusErr.message || '')) {
    ({ error: statusErr } = await supabase.from('counts')
      .update({ status, finalized_at: status === 'approved' ? now : null, finalized_by: auth.userId })
      .eq('id', countId));
  }

  if (statusErr) {
    res.status(500).json({ error: 'Line items saved but failed to lock the count session', details: statusErr.message, countId });
    return;
  }

  await logEvent(supabase, countId, status === 'submitted' ? 'submitted' : 'finalized', auth.email);

  res.status(200).json({ countId, status, itemCount: finalItems.length, cycleId });
}
