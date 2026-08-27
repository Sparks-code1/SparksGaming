# SparksGaming

Board games on computer: a digital recreation of **Risk Legacy**, and **Dune**
in progress — built with React, TypeScript, PixiJS, and Supabase.

## How to Run
1. Clone the repo
2. Run `npm install`
3. Run `npm run dev`
4. Open http://localhost:5173

## Generated board artefacts

The Dune board is generated, not hand-edited. `scripts/build-dune-board.mjs`
reads the pristine Figma export and writes all of:

| Output | Committed | What it is |
|---|---|---|
| `public/dune-board.svg` | yes | the board the app loads |
| `src/data/dune/boardData.ts` | yes | territories, sectors, markers, adjacency |
| `public/dune-cards/*.svg` | **no** | one spice card per blow — see `.gitignore` |

```bash
node scripts/build-dune-board.mjs            # write everything
node scripts/build-dune-board.mjs --report   # classify and print, write nothing
```

Run it after changing the source export or any of the tables at the top of the
script (`TERRITORY_DATA`, `LABEL_OVERRIDES`, `SPICE_OVERRIDES`, `DECOR`). Editing
`dune-board.svg` or `boardData.ts` by hand is always wrong — the next run
overwrites it.

The spice deck is ignored because each of the fifteen cards embeds a full copy
of the board: they cost 1.3MB together and every map tweak rewrites all of them.
Run the script to produce them.
