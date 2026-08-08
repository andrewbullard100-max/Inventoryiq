-- Adds stage_id to count_photos so the photo audit trail can tell which
-- capture stage each photo belongs to (fixes the record-photos/resume
-- mismatch where the frontend asked for stage_id but the column didn't exist
-- yet). Applied live via Supabase:apply_migration on the same day this file
-- was added -- included here so a fresh environment ends up with the same
-- schema.
alter table public.count_photos add column if not exists stage_id text;
