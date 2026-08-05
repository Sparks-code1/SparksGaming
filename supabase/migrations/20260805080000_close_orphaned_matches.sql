-- One-off repair, kept in history deliberately.
--
-- The first real two-machine run found a client bug: a `joinedMatch` left over
-- from a previous game made the next game's host adopt the OLD match and never
-- flip its own lobby to active. Match 9744617a was left as a lobby with setup
-- complete and no board — its joiner stared at "the game opens in a moment"
-- forever — while 7650d55d (the previous test's match) stayed active with two
-- campaigns' legacies pointing at it.
--
-- The client is fixed (lobbyToStart now outranks every stale pointer, and
-- cross-game state is cleared at each boundary); these rows are closed so
-- nothing offers or adopts them again. Guarded by exact shape so a rerun — or
-- a genuinely live game — cannot be touched by mistake.
update matches set status = 'abandoned'
  where substr(id::text, 1, 8) = '9744617a' and status = 'lobby' and state is null;
update matches set status = 'abandoned'
  where substr(id::text, 1, 8) = '7650d55d' and status = 'active';
update campaigns
  set legacy_state = legacy_state || '{"activeMatchId": null}'::jsonb
  where substr(id, 1, 8) = '7da14cd7'
    and legacy_state->>'activeMatchId' is not null;
