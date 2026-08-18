-- Per-seat hidden state.
--
-- Everything in matches.state reaches every connected client: the realtime
-- subscription is a Postgres changefeed, which delivers the whole row, and RLS
-- decides whether you receive a row rather than which parts of it. So a secret
-- is only secret if it lives somewhere else. This is that somewhere else.
--
-- Nothing reads or writes this table yet. It is created empty and unused so the
-- shape and its policies can land on their own, before any behaviour depends on
-- them. See docs/hidden-state-and-simultaneity.md.
--
-- First user: Risk's card hands, which are broadcast to every seat today.

create table if not exists match_secrets (
  match_id   uuid not null references matches(id) on delete cascade,
  -- Matches state.players[].id, the same seat identity match_players uses.
  -- Text, not uuid: seat ids are the game's own ('p1'), not database keys.
  player_id  text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- Reads are per seat, so the lookup is always by match; the primary key covers
-- it. No further index earns its keep at six rows per match.

alter table match_secrets enable row level security;

-- ── Who may read ─────────────────────────────────────────────────────────────
-- Your own row, and only your own. The seat-to-user mapping already exists in
-- match_players, so it is joined rather than duplicated here: a second copy of
-- "which user owns this seat" is a second thing to keep true.
drop policy if exists "read your own secrets" on match_secrets;
create policy "read your own secrets"
  on match_secrets for select
  using (exists (
    select 1 from match_players mp
    where mp.match_id = match_secrets.match_id
      and mp.player_id = match_secrets.player_id
      and mp.user_id = auth.uid()
  ));

-- ── Who may write ────────────────────────────────────────────────────────────
-- Nobody, through this API. There is deliberately NO insert, update or delete
-- policy: with RLS enabled and no policy, every client write is refused. The
-- edge function writes with the service role, which bypasses RLS entirely.
--
-- The absence below is the protection. If a write policy is ever added here,
-- a client could rewrite its own hand.

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Added to the publication so a seat can subscribe to its own secrets the way
-- it already subscribes to the match. RLS is enforced for changefeed subscribers,
-- so the select policy above is what keeps one seat's row off another's socket.
--
-- Replica identity is left at the default (primary key). matches uses FULL so
-- it can deliver the old row; secrets have no use for it, and FULL would put a
-- second copy of every hand on the wire.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'match_secrets'
  ) then
    alter publication supabase_realtime add table match_secrets;
  end if;
end $$;

-- ── Atomicity: read this before writing the first row ────────────────────────
-- A single game action can change several seats' secrets AND the public state
-- at once. The Khan card steal is the case that proves it: one action moves a
-- card out of the victim's hand and into the thief's, so it touches two secrets
-- rows plus the counts in matches.state.
--
-- The edge function currently writes state with a compare-and-swap UPDATE on
-- matches.version. Adding separate statements for the secrets would make that
-- three writes with no transaction around them, and a failure between them
-- duplicates a card or destroys one — silently, since both halves look valid on
-- their own and nothing downstream re-derives the total.
--
-- So the write path must be ONE transaction spanning the matches CAS and every
-- affected secrets row, which means a plpgsql function called over RPC rather
-- than a sequence of PostgREST calls. That function belongs to step 3, when
-- something first writes here; it is named now so the requirement is not
-- rediscovered halfway through.
--
--   apply_match_write(match_id, expected_version, new_state, secrets jsonb)
--     -> updates matches where version = expected_version
--     -> upserts each seat's row from `secrets`
--     -> both, or neither
--
-- Secrets need no version column of their own: they are only ever written
-- inside that transaction, so the match version already orders them.

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_name = 'match_secrets') then
    raise exception 'match_secrets was not created';
  end if;

  if not exists (select 1 from pg_tables
                 where tablename = 'match_secrets' and rowsecurity = true) then
    raise exception 'match_secrets has RLS disabled — every seat could read every hand';
  end if;

  if not exists (select 1 from pg_policies
                 where tablename = 'match_secrets' and policyname = 'read your own secrets') then
    raise exception 'match_secrets read policy missing';
  end if;

  -- The point of the table. A write policy here would let a client edit its own
  -- hand, so its absence is asserted rather than assumed.
  if exists (select 1 from pg_policies
             where tablename = 'match_secrets' and cmd in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception 'match_secrets has a client write policy — only the service role may write';
  end if;
end $$;
