-- The seat's key is the account, never the typed name.
--
-- match_players.player_id is what a secrets row is keyed by. The deal builds
-- those rows into an object keyed by player_id, so two seats sharing a key
-- write ONE row: the later seat silently overwrites the earlier, one player
-- holds nothing of their own — no treachery card, no traitors to choose from —
-- and the public row goes on advertising the hand they were dealt.
--
-- This function put the joiner's DISPLAY NAME in that column, and the host's
-- seat was created browser-side with the same value. So two players who typed
-- the same name were dealt one hand between them, and nothing anywhere refused
-- it.
--
-- auth.uid() is unique by construction and is already the column RLS joins
-- against to decide who may read a secrets row, so keying the seat by it makes
-- the collision impossible to type rather than merely unlikely.
--
-- EVERYTHING ELSE IS AS IT WAS in 20260827090000 — the optional faction, the
-- placeholder that is never "taken", the already-seated shortcut, and the
-- p_faction default that a create-or-replace may not drop. Only the value going
-- into player_id changes.
--
-- NOT A BACKFILL. Existing matches keep whatever keys they were dealt with —
-- their secrets rows are keyed to match, and rewriting one side of that pair
-- would orphan every hand at the table. Old name-keyed rows go on working;
-- START refuses a duplicate key for anything dealt from here on.
create or replace function join_dune_lobby(
  p_code    text,
  p_name    text,
  p_faction text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m       record;
  taken   int;
  n       int;
  want    text := nullif(trim(coalesce(p_faction, '')), '');
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
  -- is the commonest reason to type the code a second time.
  if exists (select 1 from match_players where match_id = m.id and user_id = auth.uid()) then
    return m.id;
  end if;

  select count(*) into taken from match_players where match_id = m.id;
  if taken >= coalesce(m.human_slots, 6) then return null; end if;

  -- A FACTION IS OPTIONAL NOW, and refused only if it is actually taken. The
  -- placeholder is never "taken" — every seat starts holding it.
  if want is not null and want <> 'unassigned' and exists (
    select 1 from match_players
     where match_id = m.id and faction_id = want
  ) then
    return null;
  end if;

  select coalesce(min(g), 0) into n
    from generate_series(0, coalesce(m.human_slots, 6) - 1) g
   where g not in (select seat from match_players where match_id = m.id);

  -- player_id IS THE ACCOUNT; p_name is display copy and goes in `name`, where
  -- two people called the same thing cost nothing.
  insert into match_players (match_id, seat, player_id, user_id, name, faction_id, is_ai, ready)
  values (m.id, n, auth.uid()::text, auth.uid(), p_name, coalesce(want, 'unassigned'), false, false);

  return m.id;
end $$;

revoke all on function join_dune_lobby(text, text, text) from public;
grant execute on function join_dune_lobby(text, text, text) to authenticated;

comment on function join_dune_lobby(text, text, text) is
  'Seat the caller at the Dune lobby with this code. SECURITY DEFINER: the '
  'row is not readable until you are in it, so the code is the credential. '
  'The seat is keyed by the caller''s account, never by the display name — a '
  'shared key deals two seats one hand. Returns the match id, or null for '
  'anything refused.';

-- ── it took, or the migration failed ────────────────────────────────────────
-- A migration that silently did nothing would be worse than none: the
-- collision would go on being typeable while this file said it could not.
do $$
begin
  if not exists (
    select 1 from pg_proc p
     where p.proname = 'join_dune_lobby'
       and pg_get_functiondef(p.oid) like '%auth.uid()::text, auth.uid()%'
  ) then
    raise exception 'join_dune_lobby still keys the seat by something other than the account';
  end if;
  -- AND THE OPTIONAL FACTION SURVIVED the replace, since dropping a parameter
  -- default is refused outright and losing the placeholder would be silent.
  if not exists (
    select 1 from pg_proc p
     where p.proname = 'join_dune_lobby'
       and pg_get_functiondef(p.oid) like '%coalesce(want, ''unassigned'')%'
  ) then
    raise exception 'join_dune_lobby lost its optional faction';
  end if;
end $$;
