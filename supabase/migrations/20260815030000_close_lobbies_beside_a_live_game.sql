-- A lobby waiting beside a game that is already being played.
--
-- The game-4 lobby of the Test8 campaign sat open while game 4 was played in a
-- different match row — the board was built outside the lobby, so nothing ever
-- closed it. It is for the CURRENT game number, so "a lobby the campaign has
-- left behind" does not describe it and the client still offers it: the host
-- is invited to join a game that is already running, and the joiner waits in a
-- lobby that will never start.
--
-- A campaign has one game at a time. Starting one now closes any other lobby
-- in that campaign (startLobby and createOnlineMatch both do it); this closes
-- the ones already open beside a live game.
update matches m
   set status = 'abandoned'
 where m.status = 'lobby'
   and exists (
     select 1 from matches live
      where live.campaign_id = m.campaign_id
        and live.status = 'active'
        and live.id <> m.id
   );
