# Battle backgrounds

Backdrops for the Battle Phase, which **is not built yet**. Nothing in the app
points at these files. They are committed rather than kept on somebody's disk
because artwork that lives outside the repo is artwork that gets lost, and
because the folder is easier to fill in a few sittings than in one.

## What is here

| File | Where | Who is standing there |
|---|---|---|
| `Arrakeen.jpg` | Arrakeen (`territory-13`) | nobody in particular |
| `Arrakeen-Atreides.jpg` | Arrakeen | the Atreides, who start there |
| `Carthag.jpg` | Carthag (`territory-26`) | nobody in particular |
| `Carthag-Harkonnen.jpg` | Carthag | the Harkonnen, who start there |

## The naming

`<Territory>.jpg` for the place with nobody named, and
`<Territory>-<Faction>.jpg` for the place with a faction's banners on it. Both
halves are matched against the game's own data — the territory against
`displayName` in `src/data/dune/boardData.ts`, the faction against
`FACTION_IDS` — so a misspelt file is caught now rather than as a battle that
loads no picture.

A faction variant needs its plain counterpart: a battle in Arrakeen where the
Atreides are not present still has to draw Arrakeen.

## Keeping this honest

`tests/battlearttest.ts` names every file here one by one, the same way
`leaderportraittest` names the leader portraits. That pattern has already
earned its keep once: Paul's and Liet-Kynes's artwork sat in
`public/dune-leaders` pointed at by nothing, and the check went red until it
was registered.

So: **adding a file here fails the suite until it is listed.** That is
deliberate. A picture nobody has claimed is a picture nobody will notice is
missing from the screen.

The suite also asserts that *nothing in `src/` references this folder*. When
battles are built and something finally does, that check fails — which is the
prompt to come back and rewrite this file rather than leave it saying the
phase does not exist.
