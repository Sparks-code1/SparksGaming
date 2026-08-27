-- A Dune table is found by its code, not by browsing.
--
-- WHAT IT IS NOW. The select policy on `matches` reads
--
--     status = 'lobby' and auth.uid() is not null
--
-- which is every open lobby, to every signed-in account on the deployment. Risk
-- has always relied on that and it has never mattered: a Risk lobby is reached
-- through `findOpenLobby(campaignId)`, and you only have the campaign id if
-- somebody gave you the campaign's join code. The code was the gate; the policy
-- was never doing the work.
--
-- Dune has no campaign, so the Dune lobby screen listed lobbies straight out of
-- that policy — and two different accounts could both see and join the same
-- table without anybody sharing anything. Fine among friends on a private
-- deployment. Not fine in public.
--
-- SO THE CODE BECOMES THE GATE HERE TOO, and it has to be a real one rather
-- than a filter in the browser: anything the client filters, the client could
-- have not filtered.
--
--   1. Dune lobbies are readable only by people already AT them — the creator,
--      or anybody holding a seat. Nobody can list them.
--   2. Joining goes through join_dune_lobby(), which is SECURITY DEFINER and
--      takes the code as the credential. It seats you, and only then can you
--      see the row.
--
-- RISK IS DELIBERATELY UNTOUCHED. The policy below leaves every non-Dune row
-- under exactly the rule it had, expressed as its own branch so that is
-- readable rather than implied.

-- ─── the code ────────────────────────────────────────────────────────────────
alter table matches add column if not exists join_code text;

-- Uppercase and short: it is read aloud and typed by hand. Unique only among
-- OPEN lobbies — a finished game's code may be handed out again, and a unique
-- index over everything would make codes scarcer the longer the deployment ran.
create unique index if not exists matches_join_code_open_idx
  on matches (join_code)
  where status = 'lobby' and join_code is not null;

-- ─── am I seated? ────────────────────────────────────────────────────────────
-- SECURITY DEFINER, and that is not a shortcut. The policy on `matches` needs
-- to ask about `match_players`, whose own policy asks about `matches` — and
-- Postgres raises "infinite recursion detected in policy" for exactly that
-- shape. A definer function reads the table with RLS bypassed, which breaks the
-- cycle. It answers one question about the CALLER and cannot be asked about
-- anybody else, so it hands out nothing.
create or replace function is_seated_in(p_match uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from match_players
    where match_id = p_match and user_id = auth.uid()
  )
$$;

revoke all on function is_seated_in(uuid) from public;
grant execute on function is_seated_in(uuid) to authenticated;

-- ─── who may see a lobby ─────────────────────────────────────────────────────
drop policy if exists "authed read lobbies" on matches;
create policy "authed read lobbies"
  on matches for select
  using (
    status = 'lobby'
    and auth.uid() is not null
    and (
      -- RISK, EXACTLY AS BEFORE. Its lobbies are gated by the campaign's own
      -- join code, one layer up, and changing this would break joining.
      coalesce(game_type, 'risk') <> 'dune'
      -- A Dune table you opened.
      or created_by = auth.uid()
      -- Or one you are already sitting at. Everything else is invisible, which
      -- is what makes the code worth having.
      or is_seated_in(id)
    )
  );

drop policy if exists "authed read lobby seats" on match_players;
create policy "authed read lobby seats"
  on match_players for select
  using (exists (
    select 1 from matches m
    where m.id = match_id
      and m.status = 'lobby'
      and auth.uid() is not null
      and (
        coalesce(m.game_type, 'risk') <> 'dune'
        or m.created_by = auth.uid()
        or is_seated_in(m.id)
      )
  ));

-- ─── joining with a code ─────────────────────────────────────────────────────
-- The whole point: the caller cannot SEE the row, so they cannot join it by
-- selecting it and inserting a seat. They present the code and this seats them.
--
-- Everything it refuses, it refuses without saying which — a wrong code and a
-- full table both come back as null, because distinguishing them tells somebody
-- guessing codes that they have found a real one.
create or replace function join_dune_lobby(
  p_code    text,
  p_name    text,
  p_faction text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m       record;
  seats   int;
  taken   int;
  n       int;
begin
  if auth.uid() is null then return null; end if;
  if p_code is null or length(trim(p_code)) = 0 then return null; end if;

  select id, human_slots into m
    from matches
   where upper(join_code) = upper(trim(p_code))
     and status = 'lobby'
     and game_type = 'dune'
   limit 1;
  if not found then return null; end if;

  -- ALREADY SEATED IS NOT AN ERROR. Coming back to a table you are already at
  -- is the commonest reason to type the code a second time, and refusing would
  -- lock somebody out of their own game.
  if exists (select 1 from match_players where match_id = m.id and user_id = auth.uid()) then
    return m.id;
  end if;

  select count(*) into taken from match_players where match_id = m.id;
  if taken >= coalesce(m.human_slots, 6) then return null; end if;

  -- THE FACTION IS THE SEAT. Two of the same is a game with two of one rules
  -- card, so it is refused here as well as in the browser — the browser check
  -- is a courtesy, this one is the rule.
  if exists (
    select 1 from match_players
     where match_id = m.id and faction_id = p_faction
  ) then
    return null;
  end if;

  select coalesce(min(g), 0) into n
    from generate_series(0, coalesce(m.human_slots, 6) - 1) g
   where g not in (select seat from match_players where match_id = m.id);

  insert into match_players (match_id, seat, player_id, user_id, name, faction_id, is_ai, ready)
  values (m.id, n, p_name, auth.uid(), p_name, p_faction, false, false);

  return m.id;
end $$;

revoke all on function join_dune_lobby(text, text, text) from public;
grant execute on function join_dune_lobby(text, text, text) to authenticated;

comment on function join_dune_lobby(text, text, text) is
  'Seat the caller at the Dune lobby with this code. SECURITY DEFINER: the '
  'row is not readable until you are in it, so the code is the credential. '
  'Returns the match id, or null for anything refused.';

comment on column matches.join_code is
  'Share code for a Dune table. Null for Risk, which is gated by its '
  'campaign''s own code one layer up.';
