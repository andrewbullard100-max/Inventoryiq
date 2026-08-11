-- inventory_cycles was created without organization_id (pre-auth migration).
-- Multi-tenant now: every cycle must belong to exactly one org, or one org's
-- "open cycle" bleeds into another org's dashboard.
alter table public.inventory_cycles
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create index if not exists inventory_cycles_org_id_idx on public.inventory_cycles(organization_id);
