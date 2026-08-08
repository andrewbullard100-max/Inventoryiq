# Migrations

Every schema change from here on gets a new numbered `.sql` file in this
directory *and* gets applied to the live project (`wlkzscchquoivzpkofyx`) via
`Supabase:apply_migration` (or the SQL Editor) at the same time. Don't do one
without the other — that's exactly the "database doesn't match the code"
problem this directory exists to prevent.

Naming: `NNNN_short_description.sql`, zero-padded, incrementing.

`0001_baseline_schema.sql` is a snapshot of the schema as it existed before
this directory was introduced — it's written idempotently (`create table if
not exists`) rather than as a literal replay of the hand-run SQL history,
since that history predates this convention.
