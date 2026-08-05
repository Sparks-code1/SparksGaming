-- Risk Legacy Digital — synchronized game setup (dice, factions, HQs)
-- ============================================================================
-- After a lobby readies up, the game is SET UP: turn order is rolled, factions
-- and abilities chosen, HQs placed. That whole stretch ran only on the host's
-- machine, which meant every other player stared at a frozen lobby while their
-- own faction was picked for them.
--
-- Two columns make it a shared phase, and no new policies are needed:
--
--   matches.setup        — the setup document. Written by the HOST under the
--                          existing "host manages own lobby" policy, which
--                          already scopes writes to status = 'lobby'. Setup
--                          happens entirely before the board exists, so the
--                          lobby status is the correct gate.
--
--   match_players.choice — one player's pending declaration (their die roll,
--                          their faction pick). Written by its OWNER under the
--                          existing "self update in lobby" policy. The host
--                          reads it, validates it against the setup document,
--                          and publishes the result; a stale or out-of-turn
--                          choice is simply ignored.
--
-- Both tables already publish to supabase_realtime with replica identity full,
-- so every client sees rolls and picks as they land.
-- ============================================================================

alter table matches       add column if not exists setup  jsonb;
alter table match_players add column if not exists choice jsonb;

-- ─── Verification ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'matches' and column_name = 'setup') then
    raise exception 'matches.setup was not created';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'match_players' and column_name = 'choice') then
    raise exception 'match_players.choice was not created';
  end if;
end $$;
