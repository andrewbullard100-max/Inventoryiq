-- Adds Supabase Auth-backed organizations with two roles: 'manager' and 'counter'.
-- Deliberately simple -- no permission matrix beyond that one distinction. See
-- api/_lib/auth.js for how these are enforced (the enforcement point is the API layer,
-- not RLS -- every API function still uses the service-role key, which bypasses RLS).

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null default 'counter' check (role in ('manager', 'counter')),
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.organization_members enable row level security;

-- Both invite paths (email invite + shareable join code) resolve to a row here that a
-- newly-authenticated user redeems to join an org with a specific role.
create table if not exists public.organization_join_codes (
  code             text primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             text not null default 'counter' check (role in ('manager', 'counter')),
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,
  revoked          boolean not null default false
);
alter table public.organization_join_codes enable row level security;

-- Scoping columns. Denormalized directly onto each table (rather than requiring a join
-- chain through location_id/area_id everywhere) so every API handler can check "does this
-- row belong to the caller's org" with a single equality check.
alter table public.locations              add column if not exists organization_id uuid references public.organizations(id);
alter table public.areas                  add column if not exists organization_id uuid references public.organizations(id);
alter table public.items                  add column if not exists organization_id uuid references public.organizations(id);
alter table public.item_area_assignments  add column if not exists organization_id uuid references public.organizations(id);
alter table public.stages                 add column if not exists organization_id uuid references public.organizations(id);
alter table public.counts                 add column if not exists organization_id uuid references public.organizations(id);

-- Bootstrap: everything that exists today (6 locations, 1423 items, etc.) belongs to one
-- organization. Create it now, backfill, then lock the columns down -- this also mints a
-- one-time manager join code so the account that signs up first can claim ownership of this
-- existing data, without this migration creating any login credential itself.
do $$
declare
  bootstrap_org  uuid;
  bootstrap_code text;
begin
  if not exists (select 1 from public.organizations) then
    insert into public.organizations (name) values ('InventoryIQ') returning id into bootstrap_org;

    update public.locations             set organization_id = bootstrap_org where organization_id is null;
    update public.areas                 set organization_id = bootstrap_org where organization_id is null;
    update public.items                 set organization_id = bootstrap_org where organization_id is null;
    update public.item_area_assignments set organization_id = bootstrap_org where organization_id is null;
    update public.stages                set organization_id = bootstrap_org where organization_id is null;
    update public.counts                set organization_id = bootstrap_org where organization_id is null;

    bootstrap_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    insert into public.organization_join_codes (code, organization_id, role, expires_at)
    values (bootstrap_code, bootstrap_org, 'manager', now() + interval '7 days');
  end if;
end $$;

alter table public.locations              alter column organization_id set not null;
alter table public.areas                  alter column organization_id set not null;
alter table public.items                  alter column organization_id set not null;
alter table public.item_area_assignments  alter column organization_id set not null;
alter table public.stages                 alter column organization_id set not null;
alter table public.counts                 alter column organization_id set not null;
