-- Sites & Areas UI has always had a "type" field (Restaurant/Store/etc) and now needs a
-- per-area counting interval for cycle-count scheduling, but neither ever had a backing
-- column -- SitesScreen only ever wrote to local React state, never to the database.
alter table public.locations
  add column if not exists type text;

alter table public.areas
  add column if not exists count_interval_days integer not null default 7;

comment on column public.areas.count_interval_days is
  'How often this area should be counted, in days. Drives the "Due Today" list on the home screen -- an area is due once its last approved count is older than this many days.';
