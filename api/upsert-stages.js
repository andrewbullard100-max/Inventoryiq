// POST /api/upsert-stages
// Body: { "areaId": "area_xxx", "stages": [ { "id": "stage_xxx" (optional -- omit to create new), "name": "Shelf 1", "sortOrder": 0 } ] }
// Upserts stages for an area. Stages persist across sessions -- once a staff
// member names "Shelf 1" during a count, it shows up again next time that
// area is counted, so naming stays consistent for the audit trail.
//
// DELETE /api/upsert-stages
// Body: { "id": "stage_xxx" }
// Removes a single stage.

import { getSupabaseAdmin } from './_lib/supabase.js';
import crypto from 'crypto';

function newStageId() {
  return 'stage_' + crypto.randomBytes(6).toString('hex');
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === 'POST') {
    try {
      const { areaId, stages } = req.body || {};
      if (!areaId || !Array.isArray(stages) || stages.length === 0) {
        res.status(400).json({ error: 'areaId and a non-empty stages array are required' });
        return;
      }

      const rows = stages.map((s) => ({
        id: s.id || newStageId(),
        area_id: areaId,
        name: s.name,
        sort_order: s.sortOrder ?? 0,
      }));

      const { data, error } = await supabase
        .from('stages')
        .upsert(rows, { onConflict: 'id' })
        .select('id, area_id, name, sort_order');

      if (error) {
        res.status(500).json({ error: 'Failed to save stages', details: error.message });
        return;
      }
      res.status(200).json({ stages: data });
    } catch (err) {
      res.status(500).json({ error: 'Unexpected server error', details: err.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
      const { error } = await supabase.from('stages').delete().eq('id', id);
      if (error) {
        res.status(500).json({ error: 'Failed to remove stage', details: error.message });
        return;
      }
      res.status(200).json({ removed: true });
    } catch (err) {
      res.status(500).json({ error: 'Unexpected server error', details: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
