-- InventoryIQ baseline schema
--
-- This captures the schema as it actually exists in the live Supabase project
-- (wlkzscchquoivzpkofyx) at the time this migrations/ directory was introduced.
-- It is written as an idempotent "create if missing" baseline rather than a
-- literal replay of every ad-hoc change made by hand in the SQL Editor to date,
-- since that history wasn't tracked. From this point forward, every schema
-- change should be added as a new numbered file in this directory instead of
-- being run ad-hoc, so the database and the app repo never drift apart again.
--
-- RLS is enabled on every table below with NO policies defined. That's
-- deliberate, not an oversight: every table is written/read exclusively by
-- the Vercel API functions using the Supabase service role key, which
-- bypasses RLS entirely. The anon key (used client-side only for uploading
-- photos to Storage via signed URLs) never queries these tables directly.
-- If a table ever needs direct anon/authenticated access, add explicit
-- policies for it rather than relaxing this default.

-- ─── locations ────────────────────────────────────────────────────────────
create table if not exists public.locations (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.locations enable row level security;

-- ─── areas ────────────────────────────────────────────────────────────────
create table if not exists public.areas (
  id          text primary key,
  location_id text not null references public.locations(id),
  name        text not null,
  created_at  timestamptz not null default now()
);
alter table public.areas enable row level security;

-- ─── items (global item master) ─────────────────────────────────────────────
create table if not exists public.items (
  id                  text primary key,
  name                text not null,
  brand               text,
  vendor              text,
  vendor_item_code    text,
  order_uom           text,
  pack_size           text,
  unit_price          numeric,
  category_id         text,
  gl_account          text,
  aliases             jsonb not null default '[]'::jsonb,
  reference_image_url text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.items enable row level security;

-- ─── item_area_assignments (per-area par levels) ────────────────────────────
create table if not exists public.item_area_assignments (
  id         text primary key,
  item_id    text not null references public.items(id),
  area_id    text not null references public.areas(id),
  par_level  numeric not null default 0,
  sort_order integer,
  created_at timestamptz not null default now()
);
alter table public.item_area_assignments enable row level security;

-- ─── stages (persistent named capture stages per area) ──────────────────────
create table if not exists public.stages (
  id         text primary key,
  area_id    text not null references public.areas(id),
  name       text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);
alter table public.stages enable row level security;

-- ─── counts (one row per count session) ─────────────────────────────────────
create table if not exists public.counts (
  id               uuid primary key default gen_random_uuid(),
  area_id          text not null references public.areas(id),
  status           text not null default 'in_progress', -- in_progress | submitted | approved | abandoned
  started_by       text,
  started_at       timestamptz not null default now(),
  finalized_by     text,
  finalized_at     timestamptz,
  current_stage_id text
);
alter table public.counts enable row level security;

-- ─── count_items (one row per detected/reconciled line item) ────────────────
create table if not exists public.count_items (
  id             uuid primary key default gen_random_uuid(),
  count_id       uuid not null references public.counts(id),
  item_id        text references public.items(id),
  ai_count       numeric,
  confidence     numeric,
  match_status   text not null default 'unknown', -- matched | visual_match | unknown | not_found | cross_stage_conflict
  manual_override numeric,
  override_note  text,
  stage_id       text,
  stage_name     text,
  created_at     timestamptz not null default now()
);
alter table public.count_items enable row level security;

-- ─── count_photos (photo audit trail) ────────────────────────────────────────
create table if not exists public.count_photos (
  id           uuid primary key default gen_random_uuid(),
  count_id     uuid not null references public.counts(id),
  storage_path text not null,
  sha256_hash  text,
  stage_id     text,
  captured_by  text,
  captured_at  timestamptz not null default now()
);
alter table public.count_photos enable row level security;

-- ─── Storage bucket for captured count photos ───────────────────────────────
-- Private bucket -- photos are written via signed upload URL from the browser
-- and read back only by the service role (analyze-photos.js). Never made public.
insert into storage.buckets (id, name, public)
values ('count-photos', 'count-photos', false)
on conflict (id) do nothing;
