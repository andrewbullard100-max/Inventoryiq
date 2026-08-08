// POST /api/record-stage-photos
//
// Body:
// {
//   "countId": "uuid",
//   "photos": [ { "storagePath": "area_x/stage_x/169...-ab12.jpg", "sha256": "hex..." } ]
// }
//
// Writes one count_photos row per uploaded photo. Called right after each photo finishes
// uploading to Storage (see create-photo-upload-url.js) -- deliberately BEFORE analysis
// runs, so the audit trail (source photo + tamper-evidence hash) exists even if Vision
// analysis subsequently fails or the person abandons the stage.

import { getSupabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { countId, photos } = req.body || {};
    if (!countId || typeof countId !== 'string') {
      res.status(400).json({ error: 'countId is required' });
      return;
    }
    if (!Array.isArray(photos) || photos.length === 0) {
      res.status(400).json({ error: 'photos must be a non-empty array' });
      return;
    }

    const supabase = getSupabaseAdmin();
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
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
