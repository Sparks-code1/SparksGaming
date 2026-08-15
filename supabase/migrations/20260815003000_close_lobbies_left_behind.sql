-- Lobby rows for games the campaign has already played.
--
-- A lobby opened for game 1 was never started — the game was begun some other
-- way — and the row stayed status='lobby' for three games. "The open lobby in
-- this campaign" is deliberately not filtered by game number (a machine's own
-- copy lags the campaign, so an exact match hid the lobby a joiner was invited
-- to), and it always found this one first: the host was offered "Game #1" and
-- the joiner sat in "waiting to start #1" while the campaign was on game 4.
--
-- The client now ignores a lobby numbered below its own copy. This closes the
-- rows that are already sitting there. Only lobbies strictly behind the
-- campaign are touched — a lobby for the current game is somebody waiting.
update matches m
   set status = 'abandoned'
  from campaigns c
 where m.campaign_id = c.id
   and m.status = 'lobby'
   and m.game_number < coalesce((c.legacy_state->>'currentGameNumber')::int, 1);
