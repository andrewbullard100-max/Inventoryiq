// POST /api/start-count
//
// Body: { "areaId": "area_xxxxxxxxxxxx" }
//
// Creates a `counts` row with status='in_progress' the moment a capture session begins,
// instead of only at the very end (that's what finalize-count used to do). This is what
// makes stage-by-stage persistence possible: every stage's photos and results can now be
// attached to a real count_id as they happen, so a dropped connection or a backgrounded
// tab mid-count loses at most the current stage, not the whole session.
//
// If an in-progress count already exists for this area (e.g. the person reloaded or the
// tab was killed and reopened), that same count is returned instead of creating a new one
// -- see /api/resume-count for how the frontend discovers it and rehydrates state.

import { getSupabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { areaId } = req.body || {};
    if (!areaId || typeof areaId !== 'string') {
      res.status(400).json({ error: 'areaId is required' });
      return;
    }

    const supabase = getSupabaseAdmin();

    // Reuse an existing in-progress count for this area if one exists, rather than
    // silently starting a second one and orphaning the first.
    const { data: existing, error: findErr } = await supabase
      .from('counts')
      .select('id')
      .eq('area_id', areaId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr) {
      res.status(500).json({ error: 'Failed to check for an existing in-progress count', details: findErr.message });
      return;
    }

    if (existing) {
      res.status(200).json({ countId: existing.id, resumed: true });
      return;
    }

    const { data: created, error: createErr } = await supabase
      .from('counts')
      .insert({ area_id: areaId, status: 'in_progress' })
      .select('id')
      .single();

    if (createErr) {
      res.status(500).json({ error: 'Failed to start count', details: createErr.message });
      return;
    }

    res.status(200).json({ countId: created.id, resumed: false });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
