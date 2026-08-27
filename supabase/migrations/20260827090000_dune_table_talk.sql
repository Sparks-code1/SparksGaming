-- Three things a table needs before it is dealt, and one it needs after.
--
--   1. A SEAT WITHOUT A FACTION. Picking one before joining meant picking blind
--      — a Dune lobby is invisible until you are seated, so a joiner could not
--      see that somebody already had the Atreides and was simply refused. You
--      sit down first and choose at the table, where you can see what is taken.
--
--   2. THE MODE IS THE TABLE'S. It was decided by whoever pressed Start, out of
--      a default nobody was shown. Basic and advanced are different games — a
--      different storm die, the Kwisatz Haderach, Sardaukar, Fedaykin, the
--      advisor — so everybody has to agree to the same one before it is dealt.
--
--   3. TALKING. The Nexus is a negotiation: alliances are proposed and agreed
--      between turns, out loud. The chat panel has been drawing messages since
--      it was written and had no way to send one anywhere.

-- ─── a seat may be unassigned ────────────────────────────────────────────────
-- join_dune_lobby refused a duplicate faction; now it seats without one and the
-- choosing happens at the table. UNASSIGNED is the placeholder lib/lobby
-- already uses, so a Dune seat and a Risk seat mean the same thing by it.
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

  insert into match_players (match_id, seat, player_id, user_id, name, faction_id, is_ai, ready)
  values (m.id, n, p_name, auth.uid(), p_name, coalesce(want, 'unassigned'), false, false);

  return m.id;
end $$;

revoke all on function join_dune_lobby(text, text, text) from public;
grant execute on function join_dune_lobby(text, text, text) to authenticated;

-- ─── the mode belongs to the table ───────────────────────────────────────────
-- Advanced by default, which is what it silently was.
alter table matches add column if not exists game_mode text not null default 'advanced';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_game_mode_known') then
    alter table matches
      add constraint matches_game_mode_known check (game_mode in ('basic', 'advanced'));
  end if;
end $$;

comment on column matches.game_mode is
  'basic or advanced, agreed in the lobby before the game is dealt. Read by '
  'START_DUNE so the deal is the game everybody was looking at.';

-- ─── talking ─────────────────────────────────────────────────────────────────
-- ONE TABLE, AND ONLY PUBLIC LINES IN IT. The chat panel also carries lines
-- addressed to a single seat — "not eligible for charity", which is a sentence
-- about how much spice somebody holds. Those are composed by the client that
-- received the refusal and never leave it. Marking a message private does not
-- make its transport private, so the private ones do not come here at all and
-- there is no column for a recipient: a field that cannot be set cannot be
-- misused.
create table if not exists match_chat (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references matches(id) on delete cascade,
  -- Who said it, as a seat. The faction is denormalised so a line survives its
  -- author leaving, and so reading the log needs no join.
  player_id  text not null,
  faction_id text,
  body       text not null check (length(body) between 1 and 500),
  said_at    timestamptz not null default now(),
  -- The account that wrote it, which is what the policies are about.
  user_id    uuid not null default auth.uid()
);

create index if not exists match_chat_match_idx on match_chat (match_id, said_at);

alter table match_chat enable row level security;

-- Realtime sends the whole row; replica identity full so an update or delete
-- would carry one too. Inserts are all this table does, but the setting is
-- cheap and the absence of it is the kind of thing found at 2am.
alter table match_chat replica identity full;

-- READ IF YOU ARE AT THE TABLE. is_seated_in is the definer helper from the
-- join-code migration: match_chat asking match_players directly, while
-- match_players' own policy asks matches, is the recursion Postgres refuses.
drop policy if exists "seated read chat" on match_chat;
create policy "seated read chat"
  on match_chat for select
  using (is_seated_in(match_id));

-- WRITE AS YOURSELF, AT A TABLE YOU ARE AT. `user_id = auth.uid()` is the whole
-- rule: you cannot post as somebody else, and you cannot post into a game you
-- are not in. Nothing may update or delete — there is no policy for either, so
-- a line said at the table stays said.
drop policy if exists "seated write chat" on match_chat;
create policy "seated write chat"
  on match_chat for insert
  with check (user_id = auth.uid() and is_seated_in(match_id));

comment on table match_chat is
  'Table talk for a match. PUBLIC lines only — anything addressed to one seat '
  'is composed and kept by that client and never written here.';
