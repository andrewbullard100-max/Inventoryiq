// GET /api/resume-count?areaId=area_xxxxxxxxxxxx
//
// Returns an in-progress count for this area, if one exists, along with everything
// persisted for it so far -- every stage's already-analyzed results, and every photo
// already uploaded. Lets the frontend offer "resume where you left off" instead of
// starting a multi-hundred-photo count over from scratch after a dropped tab.

import { getSupabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { areaId } = req.query || {};
    if (!areaId || typeof areaId !== 'string') {
      res.status(400).json({ error: 'areaId is required' });
      return;
    }

    const supabase = getSupabaseAdmin();

    const { data: count, error: countErr } = await supabase
      .from('counts')
      .select('id, started_at')
      .eq('area_id', areaId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (countErr) {
      res.status(500).json({ error: 'Failed to look up in-progress count', details: countErr.message });
      return;
    }
    if (!count) {
      res.status(200).json({ resumable: false });
      return;
    }

    const [{ data: items, error: itemsErr }, { data: photos, error: photosErr }] = await Promise.all([
      supabase.from('count_items').select('id, item_id, ai_count, confidence, match_status, stage_id, stage_name').eq('count_id', count.id),
      supabase.from('count_photos').select('id, stage_id, storage_path, captured_at').eq('count_id', count.id),
    ]);

    if (itemsErr || photosErr) {
      res.status(500).json({ error: 'Failed to load in-progress count details', details: itemsErr?.message || photosErr?.message });
      return;
    }

    // Group by stage so the frontend can rebuild its stage list directly.
    const stageIds = [...new Set([...(items || []).map(i => i.stage_id), ...(photos || []).map(p => p.stage_id)].filter(Boolean))];

    res.status(200).json({
      resumable: true,
      countId: count.id,
      startedAt: count.started_at,
      stageIds,
      completedStageResults: (items || []).filter(i => i.stage_id), // stage_id null rows aren't from a completed stage analysis
      photos: photos || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
