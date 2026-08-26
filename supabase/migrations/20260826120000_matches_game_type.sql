-- Which game a match is.
--
-- THE TABLE COULD NOT TELL THEM APART. `matches` holds a campaign id, a game
-- number, a status and a `state` blob — and nothing saying whether that blob is
-- a Risk board or a Dune one. A Dune match seeded with status 'active' is,
-- as far as every Risk query is concerned, an ordinary match: apply-action
-- would load it, hand it to gameReducer, and the reducer would read a state
-- that has no territories, no players it recognises and no continents, then
-- write whatever it made of that back over the row.
--
-- That is not a hypothetical. scripts/seed-dune-match.mjs has been writing rows
-- into this table since Dune got a server, and apply-action's only gate is
-- `status = 'active'`, which those rows satisfy.
--
-- So the discriminator goes on the row, and BOTH endpoints check it: a match is
-- played by the game it says it is, or it is refused. The column is the cheap
-- half; the guards in apply-action and dune-action are the half that matters,
-- because a label nothing reads protects nothing.
--
-- DEFAULT 'risk', because every row that existed before this migration was a
-- Risk match — except the seeded Dune ones, which are relabelled below by the
-- one thing that can identify them: the shape of their own state.

alter table matches
  add column if not exists game_type text not null default 'risk';

-- Named values, so a typo is a failed write rather than a match nothing will
-- play. Unlike match_decks.deck — which is deliberately unconstrained because a
-- new deck should not need a migration — a new GAME is a much larger thing than
-- a migration, and there will not be one by accident.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_game_type_known'
  ) then
    alter table matches
      add constraint matches_game_type_known check (game_type in ('risk', 'dune'));
  end if;
end $$;

-- The Dune rows that are already here.
--
-- BY THE SHAPE OF THE STATE, which is the only evidence there is: nothing else
-- on the row distinguishes them. `spiceDeck` is in every Dune state this
-- codebase has ever written — the seed script writes it for all three of its
-- phases, and no Risk state has ever had such a key.
--
-- Rows with a null or empty state stay 'risk', which is right: a lobby that
-- never started is a Risk lobby, since that is the only kind the app can make.
update matches
   set game_type = 'dune'
 where game_type = 'risk'
   and state is not null
   and state ? 'spiceDeck';

-- Filtering lobbies by game is now an ordinary query, so it should not be a
-- scan. Partial on 'lobby' because that is the status every one of those
-- queries also names.
create index if not exists matches_game_type_lobby_idx
  on matches (game_type, campaign_id)
  where status = 'lobby';

comment on column matches.game_type is
  'Which game this row is a match of: risk or dune. Both endpoints refuse a '
  'match whose game is not theirs — see apply-action and dune-action.';
