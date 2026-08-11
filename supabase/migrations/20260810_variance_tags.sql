-- InventoryIQ: root-cause tagging on count lines with a large swing from
-- the prior count, so recurring dollar variance becomes a trackable pattern
-- (theft, waste, recipe variance, receiving error, counting error) instead
-- of the same mystery re-litigated every cycle.

alter table public.count_items
  add column if not exists variance_tag text,
  add column if not exists variance_note text;

comment on column public.count_items.variance_tag is
  'One of: theft, waste, recipe_variance, receiving_error, counting_error, other. Null = untagged.';
