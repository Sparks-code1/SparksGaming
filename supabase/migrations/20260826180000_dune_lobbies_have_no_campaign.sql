-- A Dune match belongs to no campaign.
--
-- `matches.campaign_id` exists because Risk here is a LEGACY campaign: a match
-- is game N of a campaign whose scars, cities and roster carry between games,
-- and apply-action reads `campaigns.legacy_state` to resolve them. Dune has
-- none of that. It is one game, complete in itself, and there is nothing for a
-- campaign row to hold.
--
-- The alternative was minting a campaign per Dune match so the column had
-- something in it. That is a row that exists to satisfy a constraint rather
-- than to record anything, and it would show up in every query that lists a
-- player's campaigns — the Risk campaign screen included.
--
-- NOTHING RISK DOES CHANGES. Every Risk query names its campaign
-- (`findOpenLobby`, `closeOtherLobbies`), and a null never matches an equality
-- test, so a Dune lobby is invisible to all of them without their asking. The
-- one place that reads a campaign off a match — apply-action — is already
-- refusing anything that is not `game_type = 'risk'`, so it cannot reach a row
-- whose campaign is null.
--
-- Safe to run twice: dropping a not-null constraint that is not there succeeds.

alter table matches alter column campaign_id drop not null;

comment on column matches.campaign_id is
  'The Risk legacy campaign this match belongs to. Null for Dune, which is one '
  'game rather than a campaign — see game_type.';
