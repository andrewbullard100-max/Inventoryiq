-- InventoryIQ v5: operation-wide inventory cycles + explicit count-line status.
-- Run after 20260810_lock_inventory_cost.sql.

create table if not exists public.inventory_cycles (
  id uuid primary key default gen_random_uuid(),
  label text,
  status text not null default 'open' check (status in ('open','closed')),
  started_at timestamptz not null default now(),
  finalized_at timestamptz
);

alter table public.counts
  add column if not exists cycle_id uuid references public.inventory_cycles(id) on delete set null;

alter table public.count_items
  add column if not exists count_status text not null default 'counted';

create index if not exists counts_cycle_id_idx on public.counts(cycle_id);

-- Backfill existing rows conservatively.
update public.count_items
set count_status = case
  when match_status = 'not_found' then 'not_seen'
  else 'counted'
end
where count_status is null or count_status = '';
