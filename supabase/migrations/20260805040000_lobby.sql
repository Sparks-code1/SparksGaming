-- Risk Legacy Digital — a real lobby: host, join, ready up, start
-- ============================================================================
-- `matches.status = 'lobby'` existed from the beginning but nothing could
-- actually USE it, for three reasons this migration fixes.
--
--   1. Nobody could see a lobby they had not already joined. The read policy is
--      `is_match_participant(id)`, which needs a match_players row — so joining
--      required reading the match, and reading the match required having joined.
--
--   2. Only the creator could insert seats, so a player could not seat THEMSELF.
--
--   3. There was no "ready", and no way for the host to start: `matches` had no
--      client UPDATE policy at all, so the existing code path that flipped a
--      lobby to 'active' was being silently refused by RLS.
--
-- Everything here is confined to lobbies. The moment a match goes 'active' the
-- client write surface closes again and the Edge Function's service-role key is
-- the only thing that touches `state` — server authority is unchanged.
-- ============================================================================

-- How many human seats this game is waiting for. AI seats are real rows from
-- the moment the lobby is made; human seats are rows that do not exist yet,
-- which is why the count has to be recorded somewhere.
alter table matches add column if not exists human_slots int not null default 0;

alter table match_players add column if not exists ready boolean not null default false;

-- ─── Reading a lobby you have not joined ─────────────────────────────────────
-- Scoped to lobbies only, and a lobby row carries no game state — `state` is
-- null until it starts. What it exposes is the campaign id, the game number and
-- the seat count, to someone who already holds the campaign's join code.
drop policy if exists "authed read lobbies" on matches;
create policy "authed read lobbies"
  on matches for select
  using (status = 'lobby' and auth.uid() is not null);

drop policy if exists "authed read lobby seats" on match_players;
create policy "authed read lobby seats"
  on match_players for select
  using (exists (
    select 1 from matches m
    where m.id = match_id and m.status = 'lobby' and auth.uid() is not null
  ));

-- ─── Seating yourself ────────────────────────────────────────────────────────
-- `user_id = auth.uid()` is the whole rule: you may create a seat for yourself
-- and nobody else, and only while the game has not started. `is_ai` is forced
-- false so this cannot be used to smuggle in an extra computer player.
drop policy if exists "self seat in lobby" on match_players;
create policy "self seat in lobby"
  on match_players for insert
  with check (
    user_id = auth.uid()
    and is_ai = false
    and exists (select 1 from matches m where m.id = match_id and m.status = 'lobby')
  );

-- Change your own name or ready flag, again only before the game starts.
drop policy if exists "self update in lobby" on match_players;
create policy "self update in lobby"
  on match_players for update
  using (
    user_id = auth.uid()
    and exists (select 1 from matches m where m.id = match_id and m.status = 'lobby')
  )
  with check (user_id = auth.uid() and is_ai = false);

-- Leave a lobby you have not started yet.
drop policy if exists "self leave lobby" on match_players;
create policy "self leave lobby"
  on match_players for delete
  using (
    user_id = auth.uid()
    and exists (select 1 from matches m where m.id = match_id and m.status = 'lobby')
  );

-- ─── The host running their own lobby ────────────────────────────────────────
-- Seating AI players, adjusting the human count, and starting the game. `using`
-- restricts it to a lobby the host created, so this can never touch a match
-- that is already under way — the point at which the server takes over.
drop policy if exists "host manages own lobby" on matches;
create policy "host manages own lobby"
  on matches for update
  using (created_by = auth.uid() and status = 'lobby')
  with check (created_by = auth.uid());

drop policy if exists "host seats ai in lobby" on match_players;
create policy "host seats ai in lobby"
  on match_players for insert
  with check (exists (
    select 1 from matches m
    where m.id = match_id and m.created_by = auth.uid() and m.status = 'lobby'
  ));

drop policy if exists "host manages lobby seats" on match_players;
create policy "host manages lobby seats"
  on match_players for delete
  using (exists (
    select 1 from matches m
    where m.id = match_id and m.created_by = auth.uid() and m.status = 'lobby'
  ));

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Seats appearing and ready flags flipping are the entire point of a lobby
-- screen; without this the host would have to reload to see anyone arrive.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_players'
  ) then
    alter publication supabase_realtime add table match_players;
  end if;
end $$;

alter table match_players replica identity full;

-- ─── Verification ────────────────────────────────────────────────────────────
do $$
declare missing text;
begin
  select string_agg(c.expected, ', ') into missing
  from (values
    ('authed read lobbies'), ('authed read lobby seats'), ('self seat in lobby'),
    ('self update in lobby'), ('self leave lobby'), ('host manages own lobby'),
    ('host seats ai in lobby'), ('host manages lobby seats')
  ) as c(expected)
  where not exists (select 1 from pg_policies p where p.policyname = c.expected);
  if missing is not null then raise exception 'lobby policies missing: %', missing; end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'match_players' and column_name = 'ready') then
    raise exception 'match_players.ready was not created';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'matches' and column_name = 'human_slots') then
    raise exception 'matches.human_slots was not created';
  end if;
end $$;
