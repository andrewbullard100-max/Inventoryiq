// /api/count-session
//
// Consolidated (see org.js/catalog-write.js for the same pattern) to stay within Vercel
// Hobby's 12-Serverless-Function cap.
//
// GET  /api/count-session?areaId=area_xxx
//   -> resume: returns an in-progress count for this area (if any) in the caller's
//      organization, so the frontend can offer to pick up where it left off. If a
//      DIFFERENT user already has this area's count in progress, returns
//      { resumable: false, activeElsewhere: true, startedAt } instead of handing it over.
//
// POST /api/count-session   body: { action: "start", areaId, force? }
//   -> creates (or reuses) an in-progress `counts` row for this area, attributed to the
//      caller's verified user id (started_by). If a different user's session is already in
//      progress here, returns 409 { collision: true } unless force is set, in which case
//      their session is marked abandoned and a fresh one is started. This used to be keyed
//      on a client-supplied, spoofable localStorage "deviceId" before auth existed -- now
//      it's the actual authenticated user, which is what the original collision fix should
//      have been grounded in.
//
// POST /api/count-session   body: { action: "upload-url", areaId, stageId, mediaType }
//   -> returns a signed Storage upload URL/token for one photo.
//
// POST /api/count-session   body: { action: "record-photos", countId, photos: [{storagePath, sha256, stageId}] }
//   -> writes count_photos rows right after each photo finishes uploading.
//
// POST /api/count-session   body: { action: "abandon", countId }
//   -> marks an in-progress count abandoned so "Start Over" doesn't keep reusing it.

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, respondToAuthError, HttpError } from './_lib/auth.js';

const PHOTO_BUCKET = 'count-photos';

function extFor(mediaType) {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/webp') return 'webp';
  return 'jpg';
}

// Every handler below takes an areaId at some point (directly, or via a countId lookup) --
// this confirms it belongs to the caller's org before anything reads/writes against it, so
// one org can never see or touch another org's count data via a guessed/reused id.
async function assertAreaInOrg(supabase, areaId, orgId) {
  const { data, error } = await supabase.from('areas').select('id').eq('id', areaId).eq('organization_id', orgId).maybeSingle();
  if (error) throw new HttpError(500, 'Failed to verify area');
  if (!data) throw new HttpError(404, 'Area not found in your organization');
}

async function assertCountInOrg(supabase, countId, orgId) {
  const { data, error } = await supabase.from('counts').select('id, area_id').eq('id', countId).eq('organization_id', orgId).maybeSingle();
  if (error) throw new HttpError(500, 'Failed to verify count session');
  if (!data) throw new HttpError(404, 'Count session not found in your organization');
  return data;
}

async function handleResume(req, res, supabase, auth) {
  const { areaId } = req.query || {};
  if (!areaId || typeof areaId !== 'string') throw new HttpError(400, 'areaId is required');
  await assertAreaInOrg(supabase, areaId, auth.orgId);

  const { data: count, error: countErr } = await supabase
    .from('counts')
    .select('id, started_at, started_by')
    .eq('area_id', areaId)
    .eq('organization_id', auth.orgId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (countErr) throw new HttpError(500, 'Failed to look up in-progress count');
  if (!count) { res.status(200).json({ resumable: false }); return; }

  // Someone else in the org already has this area's count in progress -- don't hand it to
  // this user as "resumable" (that's the multi-user collision: two people's photos/results
  // silently intermingling in the same session).
  if (count.started_by && count.started_by !== auth.userId) {
    res.status(200).json({ resumable: false, activeElsewhere: true, startedAt: count.started_at });
    return;
  }

  const [{ data: items, error: itemsErr }, { data: photos, error: photosErr }] = await Promise.all([
    supabase.from('count_items').select('id, item_id, ai_count, confidence, match_status, stage_id, stage_name').eq('count_id', count.id),
    supabase.from('count_photos').select('id, stage_id, storage_path, sha256_hash, captured_at').eq('count_id', count.id),
  ]);
  if (itemsErr || photosErr) throw new HttpError(500, 'Failed to load in-progress count details');

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

async function handleStart(req, res, supabase, auth) {
  const { areaId, force } = req.body || {};
  if (!areaId || typeof areaId !== 'string') throw new HttpError(400, 'areaId is required');
  await assertAreaInOrg(supabase, areaId, auth.orgId);

  const { data: existing, error: findErr } = await supabase
    .from('counts')
    .select('id, started_by, started_at')
    .eq('area_id', areaId)
    .eq('organization_id', auth.orgId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) throw new HttpError(500, 'Failed to check for an existing in-progress count');

  if (existing) {
    const belongsToSomeoneElse = existing.started_by && existing.started_by !== auth.userId;

    if (belongsToSomeoneElse && !force) {
      res.status(409).json({ error: 'Someone else is already counting this area', collision: true, countId: existing.id, startedAt: existing.started_at });
      return;
    }

    if (belongsToSomeoneElse && force) {
      // Explicit takeover: retire the other user's session (kept, not deleted -- audit
      // trail) and start a fresh one rather than mutating a session that isn't ours.
      const { error: abandonErr } = await supabase.from('counts').update({ status: 'abandoned' }).eq('id', existing.id);
      if (abandonErr) throw new HttpError(500, 'Failed to release the other session');
    } else {
      if (!existing.started_by) await supabase.from('counts').update({ started_by: auth.userId }).eq('id', existing.id);
      res.status(200).json({ countId: existing.id, resumed: true });
      return;
    }
  }

  const { data: created, error: createErr } = await supabase
    .from('counts')
    .insert({ area_id: areaId, organization_id: auth.orgId, status: 'in_progress', started_by: auth.userId })
    .select('id')
    .single();
  if (createErr) throw new HttpError(500, 'Failed to start count');

  res.status(200).json({ countId: created.id, resumed: false });
}

async function handleAbandon(req, res, supabase, auth) {
  const { countId } = req.body || {};
  if (!countId || typeof countId !== 'string') throw new HttpError(400, 'countId is required');
  await assertCountInOrg(supabase, countId, auth.orgId);

  const { data, error } = await supabase
    .from('counts').update({ status: 'abandoned' }).eq('id', countId).eq('status', 'in_progress').select('id');
  if (error) throw new HttpError(500, 'Failed to abandon count');

  res.status(200).json({ abandoned: (data || []).length > 0 });
}

async function handleUploadUrl(req, res, supabase, auth) {
  const { areaId, stageId, mediaType } = req.body || {};
  if (!areaId || !stageId || !mediaType) throw new HttpError(400, 'areaId, stageId, and mediaType are required');
  await assertAreaInOrg(supabase, areaId, auth.orgId);

  const path = `${areaId}/${stageId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFor(mediaType)}`;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error) throw new HttpError(500, 'Failed to create upload URL');

  res.status(200).json({ path: data.path, token: data.token, bucket: PHOTO_BUCKET });
}

async function handleRecordPhotos(req, res, supabase, auth) {
  const { countId, photos } = req.body || {};
  if (!countId || typeof countId !== 'string') throw new HttpError(400, 'countId is required');
  if (!Array.isArray(photos) || photos.length === 0) throw new HttpError(400, 'photos must be a non-empty array');
  await assertCountInOrg(supabase, countId, auth.orgId);

  const rows = photos.map((p) => ({
    count_id: countId,
    storage_path: p.storagePath,
    sha256_hash: p.sha256 || null,
    stage_id: p.stageId || null,
  }));

  const { error } = await supabase.from('count_photos').insert(rows);
  if (error) throw new HttpError(500, 'Failed to record photos');

  res.status(200).json({ recorded: rows.length });
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);
    requireOrgMembership(auth);

    if (req.method === 'GET') { await handleResume(req, res, supabase, auth); return; }

    if (req.method === 'POST') {
      const { action } = req.body || {};
      if (action === 'start') { await handleStart(req, res, supabase, auth); return; }
      if (action === 'upload-url') { await handleUploadUrl(req, res, supabase, auth); return; }
      if (action === 'record-photos') { await handleRecordPhotos(req, res, supabase, auth); return; }
      if (action === 'abandon') { await handleAbandon(req, res, supabase, auth); return; }
      res.status(400).json({ error: 'Unknown or missing action. Expected one of: start, upload-url, record-photos, abandon' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
