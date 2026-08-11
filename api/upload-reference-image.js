// POST   /api/upload-reference-image   { itemId, mediaType, data, label? }
// DELETE /api/upload-reference-image   { itemId, url }
//
// Stores reference photo(s) for an item in Supabase Storage (bucket: item-references,
// public read). An item can hold several labeled reference angles (front/side/label/
// other) instead of just one -- hard-to-identify items (similar packaging, small print)
// benefit from more than a single photo. reference_image_urls (jsonb array) is
// authoritative; the legacy singular reference_image_url column is kept in sync as "most
// recently uploaded" so older readers (and the Vision prompt builder) still work
// unchanged. Reference photos are a catalog edit -- manager-only, org-scoped, same as
// every other catalog write.
//
// Required DB migration: supabase/migrations/20260810_multi_reference_images.sql

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, requireManager, respondToAuthError, HttpError } from './_lib/auth.js';

const BUCKET = 'item-references';
const VALID_LABELS = ['front', 'side', 'label', 'other'];
const MAX_IMAGES_PER_ITEM = 4;

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

async function assertItemInOrg(supabase, itemId, orgId) {
  const { data, error } = await supabase.from('items').select('id, reference_image_urls').eq('id', itemId).eq('organization_id', orgId).maybeSingle();
  if (error) throw new HttpError(500, 'Failed to verify item ownership');
  if (!data) throw new HttpError(404, 'Item not found in your organization');
  return data;
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);
    requireOrgMembership(auth);
    requireManager(auth); // reference photos are a catalog edit

    if (req.method === 'POST') { await handleUpload(req, res, supabase, auth); return; }
    if (req.method === 'DELETE') { await handleDelete(req, res, supabase, auth); return; }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}

async function handleUpload(req, res, supabase, auth) {
  const { itemId, mediaType, data, label } = req.body || {};
  if (!itemId || !mediaType || !data) {
    res.status(400).json({ error: 'itemId, mediaType, and data are required' });
    return;
  }
  const safeLabel = VALID_LABELS.includes(label) ? label : 'other';
  const existingItem = await assertItemInOrg(supabase, itemId, auth.orgId);

  await ensureBucket(supabase);

  const buffer = Buffer.from(data, 'base64');
  // Timestamped path (not a fixed per-item filename) so multiple labeled angles for the
  // same item don't overwrite each other in Storage.
  const path = `${itemId}-${Date.now()}.${extFor(mediaType)}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mediaType, upsert: true });

  if (uploadErr) {
    res.status(500).json({ error: 'Failed to upload reference image', details: uploadErr.message });
    return;
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = `${publicUrlData.publicUrl}?t=${Date.now()}`; // cache-bust on re-upload

  const existing = Array.isArray(existingItem.reference_image_urls) ? existingItem.reference_image_urls : [];
  // Replace any existing photo with the same label (re-shooting "front" overwrites the old
  // front shot instead of accumulating duplicates), then cap total images per item so the
  // Vision prompt payload stays bounded.
  const next = [
    ...existing.filter((img) => img.label !== safeLabel),
    { url, label: safeLabel, uploadedAt: new Date().toISOString() },
  ].slice(-MAX_IMAGES_PER_ITEM);

  const { error: updateErr } = await supabase
    .from('items')
    .update({ reference_image_urls: next, reference_image_url: url })
    .eq('id', itemId)
    .eq('organization_id', auth.orgId);

  if (updateErr) {
    const migrationMissing = /reference_image_urls|schema cache/i.test(updateErr.message || '');
    // Compatibility fallback if the multi-image migration hasn't run yet.
    if (migrationMissing) {
      const { error: legacyErr } = await supabase.from('items').update({ reference_image_url: url }).eq('id', itemId).eq('organization_id', auth.orgId);
      if (legacyErr) {
        res.status(500).json({ error: 'Image uploaded but failed to link to item', details: legacyErr.message });
        return;
      }
      res.status(200).json({ url, images: [{ url, label: safeLabel, uploadedAt: new Date().toISOString() }], migrationPending: true });
      return;
    }
    res.status(500).json({ error: 'Image uploaded but failed to link to item', details: updateErr.message });
    return;
  }

  res.status(200).json({ url, images: next });
}

async function handleDelete(req, res, supabase, auth) {
  const { itemId, url } = req.body || {};
  if (!itemId || !url) {
    res.status(400).json({ error: 'itemId and url are required' });
    return;
  }
  const existingItem = await assertItemInOrg(supabase, itemId, auth.orgId);
  const existing = Array.isArray(existingItem.reference_image_urls) ? existingItem.reference_image_urls : [];
  const next = existing.filter((img) => img.url !== url);
  const newPrimary = next.length ? next[next.length - 1].url : null;

  const { error: updateErr } = await supabase
    .from('items')
    .update({ reference_image_urls: next, reference_image_url: newPrimary })
    .eq('id', itemId)
    .eq('organization_id', auth.orgId);

  if (updateErr) {
    res.status(500).json({ error: 'Failed to remove reference image', details: updateErr.message });
    return;
  }
  res.status(200).json({ images: next });
}
