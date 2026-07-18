// POST /api/upload-reference-image
// Body: { "itemId": "item_xxx", "mediaType": "image/jpeg", "data": "<base64>" }
//
// Stores a reference photo for an item in Supabase Storage (bucket:
// item-references, public read) and saves the public URL onto the item.
// This is what powers the "give Claude a reference photo" accuracy boost --
// only for items that actually need it, not the whole catalog.

import { getSupabaseAdmin } from './_lib/supabase.js';

const BUCKET = 'item-references';

async function ensureBucket(supabase) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.name === BUCKET);
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
}

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
    const { itemId, mediaType, data } = req.body || {};
    if (!itemId || !mediaType || !data) {
      res.status(400).json({ error: 'itemId, mediaType, and data are required' });
      return;
    }

    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);

    const buffer = Buffer.from(data, 'base64');
    const path = `${itemId}.${extFor(mediaType)}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mediaType, upsert: true });

    if (uploadErr) {
      res.status(500).json({ error: 'Failed to upload reference image', details: uploadErr.message });
      return;
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = `${publicUrlData.publicUrl}?t=${Date.now()}`; // cache-bust on re-upload

    const { error: updateErr } = await supabase
      .from('items')
      .update({ reference_image_url: url })
      .eq('id', itemId);

    if (updateErr) {
      res.status(500).json({ error: 'Image uploaded but failed to link to item', details: updateErr.message });
      return;
    }

    res.status(200).json({ url });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
