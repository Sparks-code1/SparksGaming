-- The second game of the Test8 campaign was played, won and recorded as
-- "game 1" — the number the first game already held.
--
-- Cause: the campaign's game-number bump was lost. The second match was
-- created with game_number=2, but the board inside it opened carrying
-- gameNumber=1 (a legacy write refused and rebuilt from a stale read, before
-- the S36 rebuild protocol). Its ceremony then stamped everything it touched
-- with 1: the victory-log entry, the winner's major city and fortification,
-- and every runner-up's minor city. The session record went further wrong —
-- it names the winner by finding the victory entry for that game number, and
-- with two entries numbered 1 it found the first, so a game Test won is
-- filed under ryan's name.
--
-- The code no longer allows this: recordedGameNumber refuses a number already
-- won by somebody else, the winner lookup matches the winner's id, and the
-- campaign advance never falls behind the game just played. This repairs the
-- record that was already written.
--
-- Deliberately NOT touched: currentGameNumber and the live match. A game is in
-- progress on a board numbered 2, and that number keys its dealt scar cards
-- and its restored card piles — renumbering underneath it would strand both.
-- It will be recorded as game 3 when it ends, and the campaign advances from
-- there.
--
-- Every step is guarded on finding exactly the damage described, so this is a
-- no-op on a database that does not have it. Verified against the live
-- campaign as a rolled-back dry run before being committed.
do $$
declare
  cid        text;
  ls         jsonb;
  vlog       jsonb;
  new_vlog   jsonb := '[]'::jsonb;
  new_stick  jsonb := '[]'::jsonb;
  e          jsonb;
  i          int := 0;
  ones       int;
  seen_one   int := 0;
  majors     int := 0;
  split_at   int := -1;
  win_name   text;
  dup_id     text;
begin
  -- FOR UPDATE: a game is being played on this campaign right now. Locking the
  -- row holds off a concurrent save for the length of this transaction, and the
  -- version bump below then refuses any write that was built from the old copy
  -- — which rebuilds itself onto this one, as every legacy write now does.
  select id::text, legacy_state into cid, ls
    from campaigns
   where world_name ilike '%test8%'
   limit 1
     for update;

  if cid is null then
    raise notice 'repair: campaign not present here — nothing to do';
    return;
  end if;

  vlog := coalesce(ls->'victoryLog', '[]'::jsonb);
  select count(*) into ones
    from jsonb_array_elements(vlog) v where (v->>'gameNumber')::int = 1;

  if ones <> 2 then
    raise notice 'repair: victory log does not show the double-game-1 damage (% entries at 1) — nothing to do', ones;
    return;
  end if;

  -- 1. The SECOND game-1 entry is the second game. Renumber it to 2.
  for e in select value from jsonb_array_elements(vlog) loop
    if (e->>'gameNumber')::int = 1 then
      seen_one := seen_one + 1;
      if seen_one = 2 then
        e := jsonb_set(e, '{gameNumber}', '2'::jsonb);
        win_name := e->>'winnerName';
      end if;
    end if;
    new_vlog := new_vlog || jsonb_build_array(e);
  end loop;

  -- 2. That game's stickers. A ceremony's stickers are appended in one run
  -- beginning with the winner's major city, so the SECOND major city in the
  -- list is where the second ceremony starts — everything from there on is
  -- game 2's. (Only entries still stamped 1 are moved.)
  for e in select value from jsonb_array_elements(coalesce(ls->'stickers', '[]'::jsonb)) loop
    if (e->>'description') like 'city:major%' then
      majors := majors + 1;
      if majors = 2 then split_at := i; end if;
    end if;
    i := i + 1;
  end loop;

  if split_at < 0 then
    raise notice 'repair: only % major city sticker(s) — stickers left as they are', majors;
    new_stick := coalesce(ls->'stickers', '[]'::jsonb);
  else
    i := 0;
    for e in select value from jsonb_array_elements(coalesce(ls->'stickers', '[]'::jsonb)) loop
      if i >= split_at and (e->>'appliedInGame')::int = 1 then
        e := jsonb_set(e, '{appliedInGame}', '2'::jsonb);
      end if;
      new_stick := new_stick || jsonb_build_array(e);
      i := i + 1;
    end loop;
  end if;

  update campaigns
     set legacy_state = jsonb_set(jsonb_set(ls, '{victoryLog}', new_vlog), '{stickers}', new_stick),
         legacy_version = coalesce(legacy_version, 0) + 1
   where id::text = cid;

  raise notice 'repair: victory log entry 2 -> game 2 (winner %), stickers from index % renumbered',
    coalesce(win_name, '?'), split_at;

  -- 3. The session record for that game: right faction, wrong number, wrong
  -- name. It is the newest of the game-1 rows — the first two are the first
  -- game, recorded twice.
  update game_sessions
     set game_number = 2,
         winner_player_name = coalesce(win_name, winner_player_name)
   where id::text = (
     select id::text from game_sessions
      where campaign_id::text = cid and game_number = 1
      order by created_at desc limit 1
   );

  -- 4. Drop the duplicate first-game session (identical winner and faction,
  -- inserted twice by a ceremony that ran twice). Keep the earliest.
  select g.id::text into dup_id
    from game_sessions g
   where g.campaign_id::text = cid and g.game_number = 1
     and exists (
       select 1 from game_sessions o
        where o.campaign_id = g.campaign_id
          and o.game_number = g.game_number
          and o.winner_player_name is not distinct from g.winner_player_name
          and o.winner_faction_id is not distinct from g.winner_faction_id
          and o.created_at < g.created_at
     )
   order by g.created_at desc limit 1;

  if dup_id is not null then
    delete from game_sessions where id::text = dup_id;
    raise notice 'repair: removed duplicate game-1 session %', dup_id;
  end if;
end $$;
