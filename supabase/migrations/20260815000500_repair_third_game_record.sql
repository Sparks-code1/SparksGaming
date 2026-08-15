-- Same damage, one number up: the third game of the Test8 campaign was
-- recorded as game 2, the number the second game had just been repaired to.
--
-- The client that ran that ceremony was still on the build without
-- recordedGameNumber, so it stamped whatever its board said. The rebuild
-- protocol did its part — the refused write merged onto the repaired copy
-- instead of overwriting it — but the number came from the board.
--
-- Written generically rather than as "2 becomes 3": the last victory entry is
-- renumbered past the whole log whenever an earlier entry already holds its
-- number, its ceremony's stickers move with it (a ceremony's stickers begin
-- at the winner's major city, so the LAST major city marks where the last
-- ceremony starts), the session record follows, and the campaign advances to
-- one past the corrected game. Guarded at every step, and a no-op once the
-- log is consistent.
do $$
declare
  cid        text;
  ls         jsonb;
  vlog       jsonb;
  new_vlog   jsonb := '[]'::jsonb;
  new_stick  jsonb := '[]'::jsonb;
  stick      jsonb;
  e          jsonb;
  n          int;
  i          int := 0;
  last_i     int;
  old_num    int;
  new_num    int;
  last_major int := -1;
  win_name   text;
  sess_id    text;
begin
  select id::text, legacy_state into cid, ls
    from campaigns
   where world_name ilike '%test8%'
   limit 1
     for update;

  if cid is null then
    raise notice 'repair3: campaign not present here — nothing to do';
    return;
  end if;

  if coalesce((ls->>'gameInProgress')::boolean, false) then
    raise notice 'repair3: a game is in progress — its number keys live scar deals, not touching it';
    return;
  end if;

  vlog := coalesce(ls->'victoryLog', '[]'::jsonb);
  n := jsonb_array_length(vlog);
  if n < 2 then
    raise notice 'repair3: % victory entries — nothing to renumber', n;
    return;
  end if;

  last_i  := n - 1;
  old_num := (vlog->last_i->>'gameNumber')::int;
  win_name := vlog->last_i->>'winnerName';

  -- Only act if an EARLIER entry already holds that number. A consistent log
  -- falls straight through here.
  select count(*) into i
    from jsonb_array_elements(vlog) with ordinality t(v, ord)
   where t.ord <= last_i and (t.v->>'gameNumber')::int = old_num;
  if i = 0 then
    raise notice 'repair3: last entry (game %) collides with nothing — nothing to do', old_num;
    return;
  end if;

  select max((v->>'gameNumber')::int) + 1 into new_num from jsonb_array_elements(vlog) v;

  new_vlog := jsonb_set(vlog, array[last_i::text, 'gameNumber'], to_jsonb(new_num));

  -- The last ceremony's stickers: from the last major city onward, and only
  -- those still carrying the old number.
  stick := coalesce(ls->'stickers', '[]'::jsonb);
  i := 0;
  for e in select value from jsonb_array_elements(stick) loop
    if (e->>'description') like 'city:major%' then last_major := i; end if;
    i := i + 1;
  end loop;

  if last_major < 0 then
    new_stick := stick;
    raise notice 'repair3: no major city stickers — stickers left as they are';
  else
    i := 0;
    for e in select value from jsonb_array_elements(stick) loop
      if i >= last_major and (e->>'appliedInGame')::int = old_num then
        e := jsonb_set(e, '{appliedInGame}', to_jsonb(new_num));
      end if;
      new_stick := new_stick || jsonb_build_array(e);
      i := i + 1;
    end loop;
  end if;

  update campaigns
     set legacy_state = jsonb_set(
           jsonb_set(
             jsonb_set(ls, '{victoryLog}', new_vlog),
             '{stickers}', new_stick),
           '{currentGameNumber}', to_jsonb(new_num + 1)),
         legacy_version = coalesce(legacy_version, 0) + 1
   where id::text = cid;

  raise notice 'repair3: last victory entry (%) game % -> %, campaign now on game %',
    coalesce(win_name, '?'), old_num, new_num, new_num + 1;

  -- The session record for that game is the newest row at the old number, and
  -- it must name the same winner — otherwise this is not the row and it is
  -- left alone.
  select id::text into sess_id
    from game_sessions
   where campaign_id::text = cid
     and game_number = old_num
     and winner_player_name is not distinct from win_name
   order by created_at desc limit 1;

  if sess_id is null then
    raise notice 'repair3: no session row at game % for % — left as is', old_num, coalesce(win_name, '?');
  else
    update game_sessions set game_number = new_num where id::text = sess_id;
    raise notice 'repair3: session % -> game %', sess_id, new_num;
  end if;
end $$;
