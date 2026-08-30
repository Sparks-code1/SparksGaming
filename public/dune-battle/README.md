# Battle backgrounds

Backdrops for the Battle Phase — the reveal draws them now, behind the staged
sequence and the winner's loss-allocation window. The hierarchy, most
specific first: the fighters' own scene (`<Territory>-<Faction>`), the
territory's own art (`<Territory>`, numbered variants `<Territory>-2` and up
ALTERNATING between battles fought there), then the ground itself
(`Dune-Stronghold`, `Dune-Sand`, `Dune-Rock`). A place nothing covers keeps the plain
frame. The manifest the app resolves against is src/data/dune/battleArt.ts
— add a new file there (and battlearttest holds the two in sync).

## What is here

| File | Where | Who is standing there |
|---|---|---|
| `Arrakeen.jpg` | Arrakeen (`territory-13`) | nobody in particular |
| `Arrakeen-Atreides.jpg` | Arrakeen | the Atreides, who start there |
| `Carthag.jpg` | Carthag (`territory-26`) | nobody in particular |
| `Carthag-Harkonnen.jpg` | Carthag | the Harkonnen, who start there |
| `Dune-Rock.png` | any rock territory | nobody in particular |
| `Dune-Sand.png` | any sand territory | nobody in particular |
| `Dune-Stronghold.png` | any stronghold without its own art | nobody in particular |
| `Arrakeen-Battle.png` | *unplaced* — an Arrakeen assault scene awaiting a slot | — |

## The naming

`<Territory>.jpg` for the place with nobody named, and
`<Territory>-<Faction>.jpg` for the place with a faction's banners on it. Both
halves are matched against the game's own data — the territory against
`displayName` in `src/data/dune/boardData.ts`, the faction against
`FACTION_IDS` — so a misspelt file is caught now rather than as a battle that
loads no picture.

`Dune-<Terrain>.jpg` (or `.png`) for a backdrop that shows a KIND of ground
rather than one place — `Dune-Rock`, `Dune-Sand` — matched against the
board's own terrain values. Battles happen all over the desert, and forty-odd
territories will not each get a painting; a battle with no painting of its own
place can fall back to its ground.

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
