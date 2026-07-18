// POST /api/upsert-assignments
// Body: { "assignments": [ { "itemId": "item_xxx", "areaId": "area_xxx", "parLevel": 8 } ] }
// Upserts on the (item_id, area_id) unique constraint -- safe to call
// repeatedly for the same item+area pair, e.g. when editing a par level.
//
// DELETE /api/upsert-assignments
// Body: { "itemId": "item_xxx", "areaId": "area_xxx" }
// Removes a single assignment (used when un-assigning an item from an area).

import { getSupabaseAdmin } from './_lib/supabase.js';
import crypto from 'crypto';

function assignmentId(itemId, areaId) {
  return 'asn_' + crypto.createHash('md5').update(`${itemId}|${areaId}`).digest('hex').slice(0, 12);
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === 'POST') {
    try {
      const { assignments } = req.body || {};
      if (!Array.isArray(assignments) || assignments.length === 0) {
        res.status(400).json({ error: 'assignments must be a non-empty array' });
        return;
      }

      const rows = assignments.map((a) => ({
        id: assignmentId(a.itemId, a.areaId),
        item_id: a.itemId,
        area_id: a.areaId,
        par_level: a.parLevel ?? 0,
      }));

      const { data, error } = await supabase
        .from('item_area_assignments')
        .upsert(rows, { onConflict: 'item_id,area_id' })
        .select('id');

      if (error) {
        res.status(500).json({ error: 'Failed to save assignments', details: error.message });
        return;
      }
      res.status(200).json({ assignments: data });
    } catch (err) {
      res.status(500).json({ error: 'Unexpected server error', details: err.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const { itemId, areaId } = req.body || {};
      if (!itemId || !areaId) {
        res.status(400).json({ error: 'itemId and areaId are required' });
        return;
      }
      const { error } = await supabase
        .from('item_area_assignments')
        .delete()
        .eq('item_id', itemId)
        .eq('area_id', areaId);

      if (error) {
        res.status(500).json({ error: 'Failed to remove assignment', details: error.message });
        return;
      }
      res.status(200).json({ removed: true });
    } catch (err) {
      res.status(500).json({ error: 'Unexpected server error', details: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
