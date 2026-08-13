// GET  /api/inventory-metrics
//   Financial + operational inventory intelligence, scoped to the caller's organization.
//   Uses locked historical cost where available, preserves legacy fallbacks, and returns
//   SKU/category variance, current count-cycle progress, pending approvals, a recent audit
//   log, and per-area confidence-calibration suggestions.
// POST /api/inventory-metrics { action: 'tagVariance', countItemId, tag, note }
//   Assigns a root-cause tag to a specific count line. The only write path in this file.
//
// Every table here is scoped by organization_id -- either directly (areas, items,
// item_area_assignments, counts, inventory_cycles) or transitively through counts.id
// (count_items, count_events), since count_items/count_events don't carry organization_id
// themselves and are only ever loaded via a count_id already filtered to this org.

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, respondToAuthError, HttpError } from './_lib/auth.js';

const n = (v) => Number(v || 0);
const money2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);
    requireOrgMembership(auth);

    if (req.method === 'POST') { await handleTagVariance(req, res, supabase, auth); return; }
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
    await handleGet(req, res, supabase, auth);
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}

async function handleGet(req, res, supabase, auth) {
  const orgId = auth.orgId;
  const [areasResp, itemsResp, assignmentsResp] = await Promise.all([
    supabase.from('areas').select('id, location_id, name').eq('organization_id', orgId),
    supabase.from('items').select('id, name, vendor, vendor_item_code, unit_price, category_id').eq('organization_id', orgId),
    supabase.from('item_area_assignments').select('item_id, area_id, par_level').eq('organization_id', orgId),
  ]);
  const firstError = areasResp.error || itemsResp.error || assignmentsResp.error;
  if (firstError) { res.status(500).json({ error: 'Failed to load inventory reference data', details: firstError.message }); return; }

  const areas = areasResp.data || [];
  const items = itemsResp.data || [];
  const assignmentRows = assignmentsResp.data || [];
  const itemById = new Map(items.map(i => [i.id, i]));
  const priceByItem = new Map(items.map(i => [i.id, n(i.unit_price)]));
  const areaById = new Map(areas.map(a => [a.id, a]));

  // Category names are optional -- this deployment has no categories table yet.
  let categoryNameById = new Map();
  const catResp = await supabase.from('categories').select('id, name');
  if (!catResp.error) categoryNameById = new Map((catResp.data || []).map(c => [c.id, c.name]));
  const catName = (id) => id ? (categoryNameById.get(id) || `Category ${String(id).slice(0, 8)}`) : 'Uncategorized';

  if (!areas.length) { res.status(200).json(emptyPayload()); return; }

  let countsResp = await supabase.from('counts')
    .select('id, area_id, status, started_at, finalized_at, cycle_id, submitted_by, approved_by, rejection_reason')
    .eq('organization_id', orgId)
    .in('area_id', areas.map(a => a.id))
    .in('status', ['approved', 'submitted'])
    .order('started_at', { ascending: false })
    .limit(Math.max(150, areas.length * 10));
  let auditColumnsAvailable = true;
  if (countsResp.error && /submitted_by|approved_by|rejection_reason|schema cache/i.test(countsResp.error.message || '')) {
    auditColumnsAvailable = false;
    countsResp = await supabase.from('counts')
      .select('id, area_id, status, started_at, finalized_at, cycle_id')
      .eq('organization_id', orgId)
      .in('area_id', areas.map(a => a.id))
      .in('status', ['approved', 'submitted'])
      .order('started_at', { ascending: false })
      .limit(Math.max(150, areas.length * 10));
  }
  let cycleColumnsAvailable = true;
  if (countsResp.error && /cycle_id|schema cache/i.test(countsResp.error.message || '')) {
    cycleColumnsAvailable = false;
    countsResp = await supabase.from('counts')
      .select('id, area_id, status, started_at, finalized_at')
      .eq('organization_id', orgId)
      .in('area_id', areas.map(a => a.id))
      .in('status', ['approved', 'submitted'])
      .order('started_at', { ascending: false })
      .limit(Math.max(150, areas.length * 10));
  }
  if (countsResp.error) { res.status(500).json({ error: 'Failed to load count history', details: countsResp.error.message }); return; }
  const countRows = countsResp.data || [];
  if (!countRows.length) { res.status(200).json({ ...emptyPayload(), cycleColumnsAvailable }); return; }

  // count_items/count_events have no organization_id of their own -- they're safe to load
  // by count_id here only because countRows above was already filtered to this org.
  let ciResp = await supabase.from('count_items')
    .select('id, count_id, item_id, ai_count, manual_override, unit_cost, extended_value, cost_locked_at, count_status, variance_tag, variance_note')
    .in('count_id', countRows.map(c => c.id));
  let historicalColumnsAvailable = true;
  let countStatusAvailable = true;
  let varianceTagAvailable = true;
  if (ciResp.error) {
    const msg = ciResp.error.message || '';
    if (/count_status|schema cache/i.test(msg)) countStatusAvailable = false;
    if (/unit_cost|extended_value|cost_locked_at|schema cache/i.test(msg)) historicalColumnsAvailable = false;
    if (/variance_tag|variance_note|schema cache/i.test(msg)) varianceTagAvailable = false;
    const cols = ['id', 'count_id', 'item_id', 'ai_count', 'manual_override'];
    if (historicalColumnsAvailable) cols.push('unit_cost', 'extended_value', 'cost_locked_at');
    if (countStatusAvailable) cols.push('count_status');
    if (varianceTagAvailable) cols.push('variance_tag', 'variance_note');
    ciResp = await supabase.from('count_items').select(cols.join(', ')).in('count_id', countRows.map(c => c.id));
  }
  if (ciResp.error) { res.status(500).json({ error: 'Failed to load count values', details: ciResp.error.message }); return; }
  const countItems = ciResp.data || [];

  const linesByCount = new Map();
  for (const ci of countItems) {
    const qty = n(ci.manual_override ?? ci.ai_count);
    const hasLockedCost = historicalColumnsAvailable && ci.unit_cost !== null && ci.unit_cost !== undefined;
    const unitCost = hasLockedCost ? n(ci.unit_cost) : n(priceByItem.get(ci.item_id));
    const value = hasLockedCost && ci.extended_value !== null && ci.extended_value !== undefined ? n(ci.extended_value) : qty * unitCost;
    const line = { ...ci, qty, unitCost, value, hasLockedCost, countStatus: ci.count_status || 'counted' };
    const arr = linesByCount.get(ci.count_id) || []; arr.push(line); linesByCount.set(ci.count_id, arr);
  }

  // Per-area confidence calibration: how often a human has to correct this area's AI
  // counts. Surfaced as a suggestion, not applied automatically -- raising a threshold
  // trades speed for review time, and that trade-off is a manager's call.
  const overrideStatsByArea = new Map();
  for (const c of countRows) {
    const lines = (linesByCount.get(c.id) || []).filter(l => !['not_seen', 'not_counted'].includes(l.countStatus));
    if (!lines.length) continue;
    const stats = overrideStatsByArea.get(c.area_id) || { total: 0, overridden: 0 };
    stats.total += lines.length;
    stats.overridden += lines.filter(l => l.manual_override !== null && l.manual_override !== undefined).length;
    overrideStatsByArea.set(c.area_id, stats);
  }
  const areaCalibration = areas
    .map(area => {
      const stats = overrideStatsByArea.get(area.id);
      if (!stats || stats.total < 5) return null;
      const overrideRate = stats.overridden / stats.total;
      const suggestedThreshold = overrideRate > 0.35 ? 0.85 : overrideRate > 0.20 ? 0.80 : null;
      return { areaId: area.id, areaName: area.name, sampleSize: stats.total, overrideRate: money2(overrideRate), suggestedThreshold };
    })
    .filter(Boolean)
    .filter(a => a.suggestedThreshold !== null)
    .sort((a, b) => b.overrideRate - a.overrideRate);

  const countsByArea = new Map();
  for (const c of countRows) {
    if (c.status !== 'approved') continue;
    const lines = linesByCount.get(c.id) || [];
    const value = lines.filter(l => !['not_seen', 'not_counted'].includes(l.countStatus)).reduce((s, l) => s + l.value, 0);
    const lockedLines = lines.filter(l => l.hasLockedCost).length;
    const legacyLines = lines.length - lockedLines;
    const arr = countsByArea.get(c.area_id) || [];
    arr.push({ ...c, date: c.finalized_at || c.started_at, value, lines, lockedLines, legacyLines });
    countsByArea.set(c.area_id, arr);
  }
  for (const arr of countsByArea.values()) arr.sort((a, b) => new Date(b.date) - new Date(a.date));

  const pendingApprovals = countRows
    .filter(c => c.status === 'submitted')
    .map(c => {
      const lines = linesByCount.get(c.id) || [];
      const value = lines.filter(l => !['not_seen', 'not_counted'].includes(l.countStatus)).reduce((s, l) => s + l.value, 0);
      const area = areaById.get(c.area_id);
      return {
        countId: c.id, areaId: c.area_id, areaName: area?.name || 'Unknown area',
        submittedBy: auditColumnsAvailable ? (c.submitted_by || null) : null,
        submittedAt: c.started_at, itemCount: lines.length, totalValue: money2(value),
      };
    })
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

  const snapshotCount = Math.min(6, Math.max(...Array.from(countsByArea.values()).map(a => a.length), 0));
  const snapshots = [];
  for (let idx = 0; idx < snapshotCount; idx++) {
    const members = [];
    for (const area of areas) { const c = (countsByArea.get(area.id) || [])[idx]; if (c) members.push(c); }
    if (!members.length) continue;
    const totalValue = members.reduce((s, m) => s + m.value, 0);
    const latestDate = members.reduce((latest, m) => !latest || new Date(m.date) > new Date(latest) ? m.date : latest, null);
    const legacyLines = members.reduce((s, m) => s + m.legacyLines, 0), lockedLines = members.reduce((s, m) => s + m.lockedLines, 0);
    snapshots.push({ index: idx, date: latestDate, value: money2(totalValue), areaCount: members.length, lockedLines, legacyLines, historicallyCosted: legacyLines === 0 && lockedLines > 0 });
  }

  const latestCountByArea = new Map(), priorCountByArea = new Map();
  for (const area of areas) { const arr = countsByArea.get(area.id) || []; if (arr[0]) latestCountByArea.set(area.id, arr[0]); if (arr[1]) priorCountByArea.set(area.id, arr[1]); }

  const aggregateByItem = (countMap) => {
    const out = new Map();
    for (const count of countMap.values()) for (const l of count.lines) {
      if (['not_seen', 'not_counted'].includes(l.countStatus)) continue;
      const cur = out.get(l.item_id) || { qty: 0, value: 0 }; cur.qty += l.qty; cur.value += l.value; out.set(l.item_id, cur);
    }
    return out;
  };
  const currentItems = aggregateByItem(latestCountByArea), previousItems = aggregateByItem(priorCountByArea);
  const itemIds = new Set([...currentItems.keys(), ...previousItems.keys()]);
  const itemVariances = [...itemIds].map(id => {
    const meta = itemById.get(id) || {}; const cur = currentItems.get(id) || { qty: 0, value: 0 }; const prev = previousItems.get(id) || { qty: 0, value: 0 };
    const variance = cur.value - prev.value;
    return { itemId: id, name: meta.name || 'Unknown item', sku: meta.vendor_item_code || id, categoryId: meta.category_id || null, categoryName: catName(meta.category_id), currentQty: cur.qty, previousQty: prev.qty, currentValue: money2(cur.value), previousValue: money2(prev.value), variance: money2(variance), variancePct: prev.value > 0 ? variance / prev.value : null };
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const catMap = new Map();
  for (const row of itemVariances) {
    const key = row.categoryId || 'uncategorized'; const cur = catMap.get(key) || { categoryId: row.categoryId, categoryName: row.categoryName, currentValue: 0, previousValue: 0 };
    cur.currentValue += row.currentValue; cur.previousValue += row.previousValue; catMap.set(key, cur);
  }
  const categories = [...catMap.values()].map(c => ({ ...c, currentValue: money2(c.currentValue), previousValue: money2(c.previousValue), variance: money2(c.currentValue - c.previousValue), variancePct: c.previousValue > 0 ? (c.currentValue - c.previousValue) / c.previousValue : null })).sort((a, b) => b.currentValue - a.currentValue);

  const currentValue = snapshots[0]?.value || 0, previousValue = snapshots[1]?.value || 0;
  const variance = money2(currentValue - previousValue), variancePct = previousValue > 0 ? variance / previousValue : null;
  const lineItemsForArea = (count) => (count?.lines || [])
    .filter(l => l.countStatus !== 'not_counted')
    .map(l => {
      const meta = itemById.get(l.item_id) || {};
      return { itemId: l.item_id, name: meta.name || 'Unknown item', sku: meta.vendor_item_code || l.item_id || null, qty: l.qty, unitCost: money2(l.unitCost), value: money2(l.value), countStatus: l.countStatus };
    })
    .sort((a, b) => b.value - a.value);

  const areaBreakdown = areas.map(area => { const latest = latestCountByArea.get(area.id), prior = priorCountByArea.get(area.id); return { areaId: area.id, locationId: area.location_id, areaName: area.name, value: money2(latest?.value || 0), previousValue: money2(prior?.value || 0), variance: money2((latest?.value || 0) - (prior?.value || 0)), date: latest?.date || null, historicallyCosted: !!latest && latest.legacyLines === 0 && latest.lockedLines > 0, status: latest?.status || 'not_started', items: lineItemsForArea(latest) }; }).sort((a, b) => b.value - a.value);

  const allLines = [...latestCountByArea.values()].flatMap(c => c.lines);
  const statusCounts = allLines.reduce((acc, l) => { acc[l.countStatus] = (acc[l.countStatus] || 0) + 1; return acc; }, {});

  // Active cycle progress: scoped to this org's open cycle.
  let activeCycle = null;
  if (cycleColumnsAvailable) {
    const cycleResp = await supabase.from('inventory_cycles').select('id,label,status,started_at,finalized_at').eq('organization_id', orgId).eq('status', 'open').order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (!cycleResp.error && cycleResp.data) {
      const cycleId = cycleResp.data.id;
      const cycleCounts = countRows.filter(c => c.cycle_id === cycleId);
      const completedAreas = new Set(cycleCounts.map(c => c.area_id));
      activeCycle = { ...cycleResp.data, totalAreas: areas.length, completedAreas: completedAreas.size, progressPct: areas.length ? completedAreas.size / areas.length : 0, areas: areas.map(a => ({ areaId: a.id, areaName: a.name, complete: completedAreas.has(a.id) })) };
    }
  }
  if (!activeCycle) {
    const newest = snapshots[0]?.date ? new Date(snapshots[0].date) : null;
    const recentCutoff = newest ? new Date(newest.getTime() - 7 * 86400000) : null;
    const completed = areas.filter(a => { const c = latestCountByArea.get(a.id); return c && recentCutoff && new Date(c.date) >= recentCutoff; });
    activeCycle = { id: null, label: 'Current inventory cycle', status: 'derived', started_at: recentCutoff?.toISOString() || null, totalAreas: areas.length, completedAreas: completed.length, progressPct: areas.length ? completed.length / areas.length : 0, areas: areas.map(a => ({ areaId: a.id, areaName: a.name, complete: completed.some(x => x.id === a.id) })) };
  }

  const topIncreases = itemVariances.filter(x => x.variance > 0).slice(0, 5);
  const topDecreases = itemVariances.filter(x => x.variance < 0).slice(0, 5);
  const topDrivers = [...topIncreases.slice(0, 3), ...topDecreases.slice(0, 2)].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const concentration = Math.abs(variance) > 0 ? topDrivers.reduce((s, x) => s + Math.abs(x.variance), 0) / Math.abs(variance) : 0;
  const rootCause = {
    headline: variance === 0 ? 'Inventory value is flat versus the previous cycle.' : `Inventory value is ${variance > 0 ? 'up' : 'down'} ${Math.abs(variancePct || 0) * 100 < 0.05 ? 'slightly' : 'materially'} versus the previous cycle.`,
    drivers: topDrivers,
    concentration,
    narrative: topDrivers.length ? `${topDrivers.slice(0, 3).map(x => `${x.name} (${x.variance >= 0 ? '+' : ''}$${Math.abs(x.variance).toLocaleString(undefined, { maximumFractionDigits: 0 })})`).join(', ')} are the largest dollar drivers.` : 'Complete another inventory cycle to identify dollar drivers.'
  };

  const legacyEstimatedLines = [...linesByCount.values()].flat().filter(l => !l.hasLockedCost).length;
  const anyLocked = [...linesByCount.values()].flat().some(l => l.hasLockedCost);
  const costingBasis = legacyEstimatedLines === 0 && anyLocked ? 'locked_historical_cost' : anyLocked ? 'mixed_locked_and_legacy_estimate' : 'legacy_current_item_price';

  const totalParByItem = new Map();
  for (const row of assignmentRows) {
    totalParByItem.set(row.item_id, (totalParByItem.get(row.item_id) || 0) + n(row.par_level));
  }
  const reorderSuggestions = [...totalParByItem.keys()]
    .map(itemId => {
      const meta = itemById.get(itemId);
      if (!meta) return null;
      const onHand = currentItems.get(itemId)?.qty || 0;
      const totalPar = totalParByItem.get(itemId) || 0;
      const orderQty = Math.max(0, totalPar - onHand);
      if (orderQty <= 0) return null;
      const unitCost = n(priceByItem.get(itemId));
      const relatedVariance = itemVariances.find(v => v.itemId === itemId);
      const velocityBoost = relatedVariance ? Math.min(2, 1 + Math.abs(relatedVariance.variancePct || 0)) : 1;
      return {
        itemId, name: meta.name, sku: meta.vendor_item_code || itemId, vendor: meta.vendor || null,
        onHand, totalPar, orderQty, unitCost: money2(unitCost), estCost: money2(orderQty * unitCost),
        priorityScore: money2(orderQty * unitCost * velocityBoost),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const areaItemVariances = [];
  for (const area of areas) {
    const latest = latestCountByArea.get(area.id);
    const prior = priorCountByArea.get(area.id);
    if (!latest) continue;
    const priorQtyByItem = new Map((prior?.lines || []).filter(l => !['not_seen', 'not_counted'].includes(l.countStatus)).map(l => [l.item_id, l.qty]));
    for (const line of latest.lines) {
      if (['not_seen', 'not_counted'].includes(line.countStatus)) continue;
      const priorQty = priorQtyByItem.get(line.item_id);
      if (priorQty === undefined) continue;
      const qtyDelta = line.qty - priorQty;
      if (qtyDelta === 0) continue;
      const meta = itemById.get(line.item_id) || {};
      const valueDelta = money2(qtyDelta * line.unitCost);
      areaItemVariances.push({
        countItemId: line.id, itemId: line.item_id, name: meta.name || 'Unknown item',
        areaId: area.id, areaName: area.name,
        previousQty: priorQty, currentQty: line.qty, qtyDelta,
        valueDelta, date: latest.date,
        varianceTag: varianceTagAvailable ? (line.variance_tag || null) : null,
        varianceNote: varianceTagAvailable ? (line.variance_note || null) : null,
      });
    }
  }
  areaItemVariances.sort((a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta));

  let auditLog = [];
  if (countRows.length) {
    const eventsResp = await supabase.from('count_events')
      .select('id, count_id, event_type, actor_name, note, created_at')
      .in('count_id', countRows.map(c => c.id))
      .order('created_at', { ascending: false })
      .limit(20);
    if (!eventsResp.error) {
      const countMeta = new Map(countRows.map(c => [c.id, c]));
      auditLog = (eventsResp.data || []).map(e => {
        const c = countMeta.get(e.count_id);
        const area = c ? areaById.get(c.area_id) : null;
        return { id: e.id, countId: e.count_id, eventType: e.event_type, actorName: e.actor_name, note: e.note, createdAt: e.created_at, areaName: area?.name || 'Unknown area' };
      });
    }
  }

  res.status(200).json({ currentValue, previousValue, variance, variancePct, snapshots, areas: areaBreakdown, itemVariances, categories, rootCause, activeCycle, statusCounts, costingBasis, historicalCostLockEnabled: historicalColumnsAvailable, countStatusAvailable, cycleColumnsAvailable, legacyEstimatedLines, reorderSuggestions, areaItemVariances: areaItemVariances.slice(0, 40), varianceTagAvailable, pendingApprovals, auditLog, auditColumnsAvailable, areaCalibration });
}

const VALID_VARIANCE_TAGS = ['theft', 'waste', 'recipe_variance', 'receiving_error', 'counting_error', 'other'];

async function handleTagVariance(req, res, supabase, auth) {
  const { action, countItemId, tag, note } = req.body || {};
  if (action !== 'tagVariance') { res.status(400).json({ error: 'Unsupported action' }); return; }
  if (!countItemId) { res.status(400).json({ error: 'countItemId is required' }); return; }
  if (tag !== null && !VALID_VARIANCE_TAGS.includes(tag)) {
    res.status(400).json({ error: `tag must be one of ${VALID_VARIANCE_TAGS.join(', ')}, or null to clear` });
    return;
  }

  // count_items has no organization_id of its own -- verify via its parent count that
  // this line actually belongs to the caller's org before allowing the write.
  const { data: row, error: lookupErr } = await supabase
    .from('count_items')
    .select('id, count_id, counts!inner(organization_id)')
    .eq('id', countItemId)
    .eq('counts.organization_id', auth.orgId)
    .maybeSingle();
  if (lookupErr) { res.status(500).json({ error: 'Failed to verify count line', details: lookupErr.message }); return; }
  if (!row) { res.status(404).json({ error: 'Count line not found in your organization' }); return; }

  const { error } = await supabase
    .from('count_items')
    .update({ variance_tag: tag, variance_note: note || null })
    .eq('id', countItemId);
  if (error) {
    const migrationMissing = /variance_tag|variance_note|schema cache/i.test(error.message || '');
    res.status(500).json({
      error: migrationMissing
        ? 'Variance tagging is not enabled in the database yet.'
        : 'Failed to save variance tag',
      details: error.message,
    });
    return;
  }
  res.status(200).json({ countItemId, tag, note: note || null });
}

function emptyPayload() { return { currentValue: 0, previousValue: 0, variance: 0, variancePct: null, snapshots: [], areas: [], itemVariances: [], categories: [], rootCause: { headline: 'No inventory history yet.', drivers: [], concentration: 0, narrative: 'Complete an inventory cycle to build variance intelligence.' }, activeCycle: null, statusCounts: {}, costingBasis: 'locked_historical_cost', historicalCostLockEnabled: true, countStatusAvailable: true, cycleColumnsAvailable: true, legacyEstimatedLines: 0, reorderSuggestions: [], areaItemVariances: [], varianceTagAvailable: true, pendingApprovals: [], auditLog: [], auditColumnsAvailable: true, areaCalibration: [] }; }
