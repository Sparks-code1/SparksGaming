# Server-authoritative multiplayer — scaffolding

This is the backend scaffolding for turning Risk Legacy from single-browser
hotseat into server-authoritative online multiplayer. The **client-side
refactor is done** (a pure `gameReducer` with injected RNG, all per-turn state in
`GameState`, and an effects channel — see `src/lib/gameReducer.ts`). What's here
is the server side.

> **Status:** written and reviewed, **not deployed or tested**. The seeded RNG
> (below) is unit-tested in the app; the schema and Edge Function cannot be run
> from this repo — you deploy them against a real Supabase project. Treat them as
> a vetted starting point.

## What's in this folder

| File | What it is |
|---|---|
| `schema.sql` | Original single-blob campaign schema (legacy state). Keep it. |
| `multiplayer-schema.sql` | **New.** Per-match rows: `matches`, `match_players`, `match_actions` + RLS. Replaces the "one global blob" write model. |
| `functions/apply-action/index.ts` | **New.** The server reducer entry point (Edge Function). Validates the action, runs the *same* `gameReducer` with a **seeded** RNG, persists state, appends to the action log. |

## The model

```
client  --Action-->  apply-action (service role)
                       • auth: is it your slot + your turn?
                       • seed = hash(match.rng_seed, action_seq)   ← deterministic
                       • { state, effects } = gameReducer(state, action, seededRng)
                       • write matches.state (guarded on version) + append match_actions
                     <--{ state, effects, version }
  ...all clients receive the new action via Realtime and re-render + interpret effects
```

The reducer is **pure and reproducible**: `createSeededRng(seed)` (mulberry32,
in `gameReducer.ts`) means the same seed yields the same combat on any runtime.
Verified: `resolveCombat(a, d, mods, createSeededRng(s))` is byte-identical
across runs. So the server owns the dice and nobody has to trust the client.

## Deploy

1. `supabase/schema.sql` then `supabase/multiplayer-schema.sql` in the SQL editor.
2. Add realtime:
   ```sql
   alter publication supabase_realtime add table matches;
   alter publication supabase_realtime add table match_actions;
   ```
3. **Share the reducer with the function.** The Edge Function imports
   `../_shared/gameReducer.ts`. The reducer has *no runtime deps* (only
   `import type`, which Deno erases), so it ports cleanly once the type imports
   resolve. Copy `src/lib/gameReducer.ts` + `src/types/game.ts` +
   `src/types/territory.ts` into `supabase/functions/_shared/` and rewrite the
   `@/…` type imports to relative paths (or use an import map / shared package).
4. `supabase functions deploy apply-action` (needs `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

## Remaining CLIENT work (not done)

The client still dispatches locally. To go online:

1. **Transport.** Today `dispatch(action)` runs the reducer in-process
   (`GameBoard.tsx`). Add a remote path: POST the action to `apply-action`,
   receive `{ state, effects, version }`. Optimistic-apply locally, then
   reconcile with the server's state (or await it). Note: the current `dispatch`
   is synchronous and mirrors `gameStateRef` immediately — a remote transport is
   async, so this is a real change to the dispatch contract (optimistic apply +
   reconcile).
2. **Realtime.** Subscribe to `match_actions` for the match; on each new row,
   apply the state and run the existing effect interpreter (`applyCombatEffect`
   in `GameBoard.tsx`) so sounds/modals/legacy fire for remote players too.
3. **Auth + lobby.** Sign-in; a lobby screen that creates a `matches` row and
   seats `match_players` (reuse `PlayerSlotsScreen`), mapping each human seat to
   a `user_id`.
4. **Per-action authorization.** The Edge Function enforces the baseline
   ("current player's slot only"). Add the exceptions before going live:
   Join-the-War (an eliminated player acts), comeback-power / missile picks
   (a non-current player responds), etc.
5. **Legacy vs match state.** `campaigns.legacy_state` stays for campaign-
   permanent data; a match references its campaign. Decide which legacy writes
   the effect interpreter performs move server-side.

## What can't be verified here

Deploying Edge Functions, configuring auth, and testing realtime need a live
Supabase project and multiple clients — none of which exist in this dev
environment. The **seeded RNG** is the only piece testable in-app, and it passes.
