// /api/count-session
//
// Consolidates what used to be 4 separate endpoints (start-count, create-photo-upload-url,
// record-stage-photos, resume-count) into one file. Reason: Vercel's Hobby plan caps a
// deployment at 12 Serverless Functions, and this project was already at 11 -- adding 4 new
// files for the storage-upload/progressive-persistence work pushed it to 15 and the
// deployment failed outright. One file, routed by `action`, keeps the same functionality
// at a net cost of +1 function instead of +4.
//
// GET  /api/count-session?areaId=area_xxx
//   -> resume: returns an in-progress count for this area (if any), with everything
//      persisted for it so far, so the frontend can offer to pick up where it left off.
//
// POST /api/count-session   body: { action: "start", areaId }
//   -> creates (or reuses) an in-progress `counts` row for this area.
//
// POST /api/count-session   body: { action: "upload-url", areaId, stageId, mediaType }
//   -> returns a signed Storage upload URL/token for one photo. The browser uploads
//      directly to Storage with it -- the photo bytes never pass through this function.
//
// POST /api/count-session   body: { action: "record-photos", countId, photos: [{storagePath, sha256}] }
//   -> writes count_photos rows right after each photo finishes uploading, independent of
//      whether AI analysis subsequently succeeds (the audit trail shouldn't depend on that).

import { getSupabaseAdmin } from './_lib/supabase.js';

const PHOTO_BUCKET = 'count-photos';

function extFor(mediaType) {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/webp') return 'webp';
  return 'jpg';
}

async function handleResume(req, res, supabase) {
  const { areaId } = req.query || {};
  if (!areaId || typeof areaId !== 'string') {
    res.status(400).json({ error: 'areaId is required' });
    return;
  }

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

  const stageIds = [...new Set([...(items || []).map(i => i.stage_id), ...(photos || []).map(p => p.stage_id)].filter(Boolean))];

  res.status(200).json({
    resumable: true,
    countId: count.id,
    startedAt: count.started_at,
    stageIds,
    completedStageResults: (items || []).filter(i => i.stage_id),
    photos: photos || [],
  });
}

async function handleStart(req, res, supabase) {
  const { areaId } = req.body || {};
  if (!areaId || typeof areaId !== 'string') {
    res.status(400).json({ error: 'areaId is required' });
    return;
  }

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
}

async function handleUploadUrl(req, res, supabase) {
  const { areaId, stageId, mediaType } = req.body || {};
  if (!areaId || !stageId || !mediaType) {
    res.status(400).json({ error: 'areaId, stageId, and mediaType are required' });
    return;
  }

  const path = `${areaId}/${stageId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFor(mediaType)}`;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error) {
    res.status(500).json({ error: 'Failed to create upload URL', details: error.message });
    return;
  }

  res.status(200).json({ path: data.path, token: data.token, bucket: PHOTO_BUCKET });
}

async function handleRecordPhotos(req, res, supabase) {
  const { countId, photos } = req.body || {};
  if (!countId || typeof countId !== 'string') {
    res.status(400).json({ error: 'countId is required' });
    return;
  }
  if (!Array.isArray(photos) || photos.length === 0) {
    res.status(400).json({ error: 'photos must be a non-empty array' });
    return;
  }

  const rows = photos.map((p) => ({
    count_id: countId,
    storage_path: p.storagePath,
    sha256_hash: p.sha256 || null,
  }));

  const { error } = await supabase.from('count_photos').insert(rows);
  if (error) {
    res.status(500).json({ error: 'Failed to record photos', details: error.message });
    return;
  }

  res.status(200).json({ recorded: rows.length });
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === 'GET') {
      await handleResume(req, res, supabase);
      return;
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};
      if (action === 'start') { await handleStart(req, res, supabase); return; }
      if (action === 'upload-url') { await handleUploadUrl(req, res, supabase); return; }
      if (action === 'record-photos') { await handleRecordPhotos(req, res, supabase); return; }
      res.status(400).json({ error: 'Unknown or missing action. Expected one of: start, upload-url, record-photos' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
