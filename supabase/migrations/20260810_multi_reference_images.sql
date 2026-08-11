-- InventoryIQ: multiple reference photos per item (front/side/label/other),
-- instead of a single reference_image_url. Run after the v5 migrations.
--
-- reference_image_url (legacy, singular) is left in place and kept in sync
-- as "the most recently uploaded photo" so nothing that already reads it
-- (existing API responses, older frontend builds) breaks.

alter table public.items
  add column if not exists reference_image_urls jsonb not null default '[]'::jsonb;

comment on column public.items.reference_image_urls is
  'Array of {url, label, uploadedAt} objects. label is one of front/side/label/other.';

-- Backfill: anything with a legacy single reference photo gets it represented
-- in the new array too, so existing reference photos show up in the gallery
-- immediately rather than looking like they were lost.
update public.items
set reference_image_urls = jsonb_build_array(
  jsonb_build_object('url', reference_image_url, 'label', 'front', 'uploadedAt', now())
)
where reference_image_url is not null
  and (reference_image_urls is null or reference_image_urls = '[]'::jsonb);
