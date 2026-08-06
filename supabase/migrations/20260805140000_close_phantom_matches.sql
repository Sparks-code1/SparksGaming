-- Second one-off repair, same shape as 20260805080000.
--
-- A render fall-through mounted a phantom GameBoard during the host's start
-- flow, and its match-start effect flipped the lobby to 'active' carrying a
-- DEFAULT board — before setup had even rolled the dice. The real setup could
-- then never publish (its writes require status='lobby'), the joiner adopted
-- the garbage board, and every genuine action was refused against it. Both
-- affected matches hold boards no one ever played; close them, and detach the
-- campaigns so nothing re-adopts them. Guarded by shape: an active match that
-- was REALLY played has version > 0.
update matches set status = 'abandoned'
  where substr(id::text, 1, 8) in ('1a8228b0', '867dfe15')
    and status = 'active' and version = 0;
update campaigns
  set legacy_state = legacy_state || '{"activeMatchId": null}'::jsonb
  where substr(id, 1, 8) in ('da5b4fd4', 'be448654')
    and legacy_state->>'activeMatchId' is not null;
