-- InventoryIQ historical inventory valuation
-- Run once in Supabase SQL Editor before deploying the matching application code.

alter table public.count_items
  add column if not exists unit_cost numeric(14,4),
  add column if not exists extended_value numeric(14,2),
  add column if not exists cost_locked_at timestamptz;

comment on column public.count_items.unit_cost is
  'Item-master unit cost captured when the physical inventory count was saved.';

comment on column public.count_items.extended_value is
  'Final counted quantity multiplied by locked unit_cost at the time the count was saved.';

comment on column public.count_items.cost_locked_at is
  'Timestamp when the inventory cost basis was captured.';

create index if not exists count_items_cost_locked_at_idx
  on public.count_items (cost_locked_at);
