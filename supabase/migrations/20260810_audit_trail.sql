-- InventoryIQ: audit trail + a real approval workflow.
--
-- Previously, "Require approval before finalizing" set a count's status to
-- 'submitted' and then nothing in the app ever moved it to 'approved' --
-- there was no approval queue, no approve/reject action, and no record of
-- who did what. This adds the columns and event log needed to close that
-- loop.

alter table public.counts
  add column if not exists submitted_by text,
  add column if not exists approved_by text,
  add column if not exists rejection_reason text;

create table if not exists public.count_events (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.counts(id) on delete cascade,
  event_type text not null check (event_type in ('submitted', 'approved', 'rejected', 'finalized')),
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists count_events_count_id_idx on public.count_events(count_id);
create index if not exists count_events_created_at_idx on public.count_events(created_at desc);

comment on table public.count_events is
  'Append-only audit log: every submit/approve/reject/finalize action on a count, with who and when.';
