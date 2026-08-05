-- Risk Legacy Digital — guards for playing a campaign across two machines
-- ============================================================================
-- Run in the Supabase SQL editor, after multiplayer-schema.sql. Safe to re-run.
--
-- The board is server-authoritative (see multiplayer-schema.sql). Campaign
-- LEGACY state is not — scars, cities, red stars, missions and the history log
-- are still written by clients, as one whole `legacy_state` blob.
--
-- That blob is the hazard. Two machines in the same campaign each read it, each
-- append their own consequence, and each write the whole thing back. The second
-- write silently erases the first: a scar placed, a city founded, a red star
-- awarded — gone, with no error anywhere. Last-write-wins is invisible.
--
-- So the row gets a version, and clients write with a compare-and-swap against
-- the version they read. A write built on a stale copy is REFUSED rather than
-- applied, and the client re-reads and retries.
-- ============================================================================

alter table campaigns add column if not exists legacy_version int not null default 0;

-- Bumped by the database itself, not by whoever remembers to. A client that
-- forgets to increment cannot accidentally disable the check for everyone else.
create or replace function bump_legacy_version()
returns trigger language plpgsql as $$
begin
  new.legacy_version := coalesce(old.legacy_version, 0) + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists campaigns_bump_legacy_version on campaigns;
create trigger campaigns_bump_legacy_version
  before update on campaigns
  for each row execute function bump_legacy_version();

-- ─── Verification ─────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--     where table_name = 'campaigns' and column_name = 'legacy_version';
--   select tgname from pg_trigger where tgname = 'campaigns_bump_legacy_version';
--
-- Expect one row from each.
--
-- To watch it work:
--   select id, legacy_version from campaigns;
--   update campaigns set world_name = world_name where id = '<id>';
--   select id, legacy_version from campaigns;   -- one higher
