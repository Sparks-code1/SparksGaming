-- Seats nobody can play: online, with no account, and not marked as computer.
--
-- Game 4 of the Test8 campaign was published with Marshal Krieg, Warlord Osk
-- and Praetor Volk as HUMAN seats. Nobody could act for them — the server only
-- accepts an action from the account that holds the seat, and they have none —
-- so the game stopped dead the first time the turn reached one of them, and
-- the seat looked to the table like a human who would not move.
--
-- The rule this restores is an invariant of online play: a seat with no
-- account is a computer seat. Applied wherever it is currently violated, since
-- any match in that state is equally stuck, and no match that is NOT in that
-- state is touched.
--
-- The board's own players are patched to match, because the AI driver reads
-- the board rather than the seat rows, and the version is bumped so both
-- machines adopt the corrected state instead of playing on with their copy.
do $$
declare
  m record;
  n int;
begin
  for m in
    select id from matches where status = 'active'
      and exists (
        select 1 from match_players mp
         where mp.match_id = matches.id and mp.user_id is null and mp.is_ai = false
      )
  loop
    update match_players
       set is_ai = true, ai_difficulty = coalesce(ai_difficulty, 'medium')
     where match_id = m.id and user_id is null and is_ai = false;
    get diagnostics n = row_count;

    update matches x
       set state = jsonb_set(x.state, '{players}', (
             select jsonb_agg(
               case when exists (
                 select 1 from match_players mp
                  where mp.match_id = x.id and mp.player_id = p->>'id' and mp.is_ai
               )
               then jsonb_set(jsonb_set(p, '{isAI}', 'true'::jsonb),
                              '{aiDifficulty}', '"medium"'::jsonb)
               else p end
               order by ord)
             from jsonb_array_elements(x.state->'players') with ordinality t(p, ord)
           )),
           version = x.version + 1,
           updated_at = now()
     where x.id = m.id
       and jsonb_typeof(x.state->'players') = 'array';

    raise notice 'match %: % accountless seat(s) are computer players', left(m.id::text, 8), n;
  end loop;
end $$;
