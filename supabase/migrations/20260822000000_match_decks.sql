-- Deck order: the state nobody may read.
--
-- match_secrets is read-YOUR-OWN. That is the right shape for a hand, a traitor
-- or a spice holding, because each of those belongs to a seat and that seat is
-- allowed to see it. A DECK belongs to nobody. There is no player who may
-- legitimately know what the next treachery card is, so there is no seat to
-- scope a policy to, and "read your own" has nothing to attach to.
--
-- So this table inverts the trick match_secrets uses for writes and applies it
-- to reads. match_secrets has RLS on and deliberately no INSERT/UPDATE/DELETE
-- policy, which refuses every client write. This has RLS on and deliberately NO
-- POLICY AT ALL, which refuses every client read as well. The service role
-- bypasses RLS entirely, so the edge function still sees it. The absence is the
-- protection, in both tables, and in both it is asserted at the foot rather than
-- assumed.
--
-- Nothing reads or writes this yet. It lands empty so the shape and its
-- policies can be proved before any behaviour depends on them — the same order
-- match_secrets and apply_match_write went in.

create table if not exists match_decks (
  match_id   uuid not null references matches(id) on delete cascade,
  -- Which deck: 'treachery', 'traitor', 'spice'. Text rather than an enum, and
  -- unconstrained on purpose — a new deck is a game change, and it should not
  -- also be a migration before it can be tried.
  deck       text not null,
  -- The draw pile, in order. Index 0 is the top.
  --
  -- ONLY the draw pile. A discard is public — the top of the spice discard is
  -- face up on the table and the spice blow reads it — so discards belong in
  -- matches.state where every client can see them. Putting both here would make
  -- the public half unreachable to the clients that need it, and would tempt
  -- somebody to add a select policy to get it back, which is the one thing this
  -- table must never have.
  cards      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (match_id, deck)
);

alter table match_decks enable row level security;

-- ── Who may read ─────────────────────────────────────────────────────────────
-- Nobody. There is deliberately no select policy: with RLS enabled and no
-- policy, PostgREST returns an empty set to every client, authenticated or not.
--
-- ── Who may write ────────────────────────────────────────────────────────────
-- Nobody, likewise. No insert, update or delete policy either.
--
-- Both absences are the protection. The edge function uses the service role,
-- which bypasses RLS, and is the only thing that will ever touch this.

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- NOT added to the publication, and that is not an oversight.
--
-- A changefeed would deliver nothing today, because RLS is enforced for
-- subscribers and no policy means no rows. But a table on the publication is a
-- table somebody can later "fix" by adding a policy to make a subscription work,
-- and the deck would go out over every socket. Leaving it off the publication
-- means there is no broken subscription inviting that fix.

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  policy_count int;
begin
  if not exists (select 1 from information_schema.tables
                 where table_name = 'match_decks') then
    raise exception 'match_decks was not created';
  end if;

  if not exists (select 1 from pg_tables
                 where tablename = 'match_decks' and rowsecurity = true) then
    raise exception 'match_decks has RLS disabled — every client could read the deck order';
  end if;

  -- THE POINT OF THE TABLE. Any policy at all is a way in, so the assertion is
  -- on the count being zero rather than on the absence of a particular one.
  select count(*) into policy_count from pg_policies where tablename = 'match_decks';
  if policy_count <> 0 then
    raise exception 'match_decks has % polic(y/ies) — it must have none, so only the service role can reach it', policy_count;
  end if;

  -- Off the publication, for the reason above.
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and tablename = 'match_decks') then
    raise exception 'match_decks is on the realtime publication — it must not be';
  end if;
end $$;
