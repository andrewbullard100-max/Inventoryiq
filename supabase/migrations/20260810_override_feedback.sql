-- InventoryIQ: capture *why* a manager overrode an AI count, not just that
-- they did. This is the raw signal for closing the loop back into which
-- items need a reference photo and which areas need a stricter review
-- threshold -- previously an override just silently replaced the AI value
-- with no record of what was wrong with it.

alter table public.count_items
  add column if not exists override_reason text,
  add column if not exists override_note text;

comment on column public.count_items.override_reason is
  'One of: wrong_item, wrong_quantity, partial_case, lighting_angle, other. Null = not overridden or reason not given.';
