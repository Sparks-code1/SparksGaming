-- Scheming: a line for the table, for your alliance, or for one person.
--
-- match_chat carried public lines only, and lines addressed to one seat stayed
-- in the browser that composed them. That is right for the GAME'S OWN notices
-- — "not eligible for charity" is a sentence about how much spice somebody
-- holds, derived from a response only that client received, and it has no
-- business travelling. It is useless for players scheming at each other, which
-- is most of what Dune is: an alliance is negotiated in private and betrayed
-- in public.
--
-- SO THE SCOPING IS THE DATABASE'S. A client that filtered its own inbox is a
-- client that could choose not to — the rows would already be on the machine,
-- one devtools tab away. What a seat cannot read, it never receives.
--
-- THREE SCOPES:
--   'table'    everybody at the table, as before and still the default
--   'alliance' you and whoever you are allied with
--   'player'   you and one named seat
--
-- YOUR OWN LINES ARE ALWAYS YOURS TO SEE, whatever their scope, or the thing
-- you just sent vanishes as you send it.

alter table match_chat add column if not exists scope text not null default 'table';
alter table match_chat add column if not exists to_player_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'match_chat_scope_known') then
    alter table match_chat
      add constraint match_chat_scope_known check (scope in ('table', 'alliance', 'player'));
  end if;
  -- A NAMED RECIPIENT EXACTLY WHEN THERE IS ONE. Without this, 'table' plus a
  -- recipient is a line that reads as private and is not, which is the most
  -- dangerous shape this table could hold.
  if not exists (select 1 from pg_constraint where conname = 'match_chat_recipient_matches_scope') then
    alter table match_chat
      add constraint match_chat_recipient_matches_scope check (
        (scope = 'player' and to_player_id is not null)
        or (scope <> 'player' and to_player_id is null)
      );
  end if;
end $$;

-- ─── which seat am I ─────────────────────────────────────────────────────────
-- SECURITY DEFINER for the same reason is_seated_in is: a policy on match_chat
-- that reads match_players, whose policy reads matches, is the recursion
-- Postgres refuses. It answers one question about the CALLER and can be asked
-- nothing about anybody else.
create or replace function my_seat_in(p_match uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select player_id from match_players
   where match_id = p_match and user_id = auth.uid()
   limit 1
$$;

revoke all on function my_seat_in(uuid) from public;
grant execute on function my_seat_in(uuid) to authenticated;

-- ─── am I allied with that seat ──────────────────────────────────────────────
-- THE ALLIANCE LIVES IN matches.state, which is where the game keeps it: each
-- player's public line names their ally. BOTH HALVES MUST AGREE, exactly as
-- allyOf does on the client — an alliance claimed by one side is a bug rather
-- than a relationship, and here it would be a way to read somebody's post by
-- declaring yourself their friend.
--
-- False during a lobby, when there is no state and no alliances yet.
create or replace function allied_with_seat(p_match uuid, p_other text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with mine as (
    select faction_id from match_players
     where match_id = p_match and user_id = auth.uid() limit 1
  ),
  theirs as (
    select faction_id from match_players
     where match_id = p_match and player_id = p_other limit 1
  ),
  roster as (
    select p->>'faction' as faction, p->>'ally' as ally
      from matches m,
           lateral jsonb_array_elements(coalesce(m.state->'players', '[]'::jsonb)) p
     where m.id = p_match
  )
  select exists (
    select 1
      from mine, theirs, roster me, roster them
     where me.faction = mine.faction_id
       and them.faction = theirs.faction_id
       and me.ally = theirs.faction_id
       and them.ally = mine.faction_id
  )
$$;

revoke all on function allied_with_seat(uuid, text) from public;
grant execute on function allied_with_seat(uuid, text) to authenticated;

-- ─── who may read what ───────────────────────────────────────────────────────
drop policy if exists "seated read chat" on match_chat;
create policy "seated read chat"
  on match_chat for select
  using (
    is_seated_in(match_id)
    and (
      scope = 'table'
      -- YOUR OWN, ALWAYS. Otherwise the line you just sent disappears as you
      -- send it, and you cannot see your own half of a conversation.
      or user_id = auth.uid()
      or (scope = 'player' and to_player_id = my_seat_in(match_id))
      or (scope = 'alliance' and allied_with_seat(match_id, player_id))
    )
  );

-- ─── and what may be written ─────────────────────────────────────────────────
-- The scope is checked as well as the author. A line naming a recipient who is
-- not at the table is a line nobody will ever read, and it would sit in the log
-- looking as though it had been delivered.
drop policy if exists "seated write chat" on match_chat;
create policy "seated write chat"
  on match_chat for insert
  with check (
    user_id = auth.uid()
    and is_seated_in(match_id)
    and (
      to_player_id is null
      or exists (
        select 1 from match_players p
         where p.match_id = match_chat.match_id and p.player_id = match_chat.to_player_id
      )
    )
  );

comment on column match_chat.scope is
  'table, alliance or player. Enforced by the select policy, never by the '
  'client — anything the client filters it could choose not to filter.';
comment on column match_chat.to_player_id is
  'The one seat a player-scoped line is for. Null for every other scope, and '
  'the check constraint keeps those two facts from disagreeing.';
