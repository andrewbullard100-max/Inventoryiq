// POST /api/create-photo-upload-url
//
// Body: { "areaId": "area_xxx", "stageId": "stage_xxx", "mediaType": "image/jpeg" }
//
// Returns a short-lived Supabase Storage signed upload URL/token for ONE photo. The
// browser then uploads the image bytes directly to Supabase Storage using that token --
// the raw photo never passes through this (or any) Vercel function body, so there's no
// 4.5MB body-size ceiling and no reason to compress harder than image quality requires.
//
// The bucket ("count-photos") is private -- this is the only sanctioned way to get a
// photo into it, and analyze-photos.js / record-stage-photos.js are the only server code
// that reads it back, using the service-role key.

import { getSupabaseAdmin } from './_lib/supabase.js';

const BUCKET = 'count-photos';

function extFor(mediaType) {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/webp') return 'webp';
  return 'jpg';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { areaId, stageId, mediaType } = req.body || {};
    if (!areaId || !stageId || !mediaType) {
      res.status(400).json({ error: 'areaId, stageId, and mediaType are required' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const path = `${areaId}/${stageId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFor(mediaType)}`;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) {
      res.status(500).json({ error: 'Failed to create upload URL', details: error.message });
      return;
    }

    res.status(200).json({ path: data.path, token: data.token, bucket: BUCKET });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
