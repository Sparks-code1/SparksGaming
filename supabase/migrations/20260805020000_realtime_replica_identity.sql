-- Risk Legacy Digital — make realtime updates carry the whole row
-- ============================================================================
-- Measured state of the remote database before this ran:
--
--   publication supabase_realtime : matches, match_actions   ← already correct
--   replica identity              : matches=d, match_actions=d, match_players=d
--
-- So the tables WERE publishing. What was missing is the second half of the
-- realtime block in multiplayer-schema.sql: `replica identity full`. Those two
-- lines were added to that file after it had already been run by hand, so the
-- publication landed and the replica identity did not.
--
-- With identity DEFAULT, logical decoding writes only the primary key as the
-- OLD image of an updated row. The NEW image is complete either way, which is
-- why `payload.new.state` has been arriving — but it leaves two sharp edges:
--
--   * `payload.old` is unavailable, so any future "what changed" logic gets a
--     row containing nothing but an id.
--   * A realtime FILTER on an UPDATE is evaluated against the old image. The
--     current filter is `id=eq.<matchId>`, and id is the primary key, so it
--     survives. Filter an update on any other column — status, game_number,
--     current_player — and it silently matches nothing.
--
-- The cost is WAL volume: every update to `matches` now writes the previous
-- `state` blob as well as the new one. At five players taking a few hundred
-- actions a game that is irrelevant, and it buys back a failure mode that
-- produces no error anywhere — the client just stops receiving turns.
-- ============================================================================

alter table matches       replica identity full;
alter table match_actions replica identity full;

-- Assert rather than assume. If this migration reports success, the database
-- is in the state above — no separate verification step to remember or skip.
do $$
declare wrong text;
begin
  select string_agg(c.relname, ', ') into wrong
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('matches', 'match_actions')
    and c.relreplident <> 'f';
  if wrong is not null then
    raise exception 'replica identity is still not FULL on: %', wrong;
  end if;

  select string_agg(expected.tablename, ', ') into wrong
  from (values ('matches'), ('match_actions')) as expected(tablename)
  where not exists (
    select 1 from pg_publication_tables p
    where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
      and p.tablename = expected.tablename
  );
  if wrong is not null then
    raise exception 'not published to supabase_realtime: %', wrong;
  end if;
end $$;
