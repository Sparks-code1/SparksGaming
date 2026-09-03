# The browser run

`npm run test:e2e`

## What it is for, and what it is not

The 107 unit suites read source and call functions. They prove the rules are
written and that they compute. They cannot see:

- **a control that renders nothing**, because a prop stopped being passed at the
  call site — the component is perfect, the screen is empty;
- **a control that is there and cannot be pressed**, disabled forever, which
  looks exactly like an app that is working;
- **a control with something laid on top of it** — this one wedged a whole
  match once, when a fixed notice box covered the corner a small table keeps
  its Ready button in. Every test was green. The button was rendered, enabled
  and correct.

So nothing here re-checks a rule. Every assertion is that a control is on
screen, is reachable, and answers. Three helpers in `support/seat.ts` carry
those three questions, and `expectNothingOnTop` names the layer doing the
covering rather than timing out anonymously.

## What it needs in the environment

| | |
|---|---|
| Docker | running — the local Supabase stack lives in it |
| the stack | `npx supabase start`, then `npx supabase db reset` if migrations changed |
| Node modules | `@playwright/test` and its Chromium (`npx playwright install chromium`) |
| the live project | **not used, and refused** — see below |

Nothing else. It mints its own six accounts (`e2e-1..6@local.test`), serves the
edge function itself, opens its own dev server on port 5174, and deals its own
matches. No `.env` values are read: `playwright.config.ts` asks
`supabase status` for the local URL and anon key and hands those to the dev
server, because the repo's `.env` names the LIVE project and a browser run
signed into that would be playing in someone's real game. `readStack()` throws
on any API that is not loopback.

## How long

About **30 seconds** wall clock, all in:

- ~2s setup — accounts, edge function, and a real match dealt through the lobby
- ~7s for Vite to boot and Playwright to start Chromium
- ~1.2–3s per test, 10 tests, one worker

The first run after a fresh `supabase start` is slower — 12s or so of setup
rather than 2s — because Deno caches the edge function's imports. One worker is
deliberate: the seats share a match and walk it forward, and parallel runs
would race each other's turn.

## The fixtures

- **setup** — a match dealt *through the lobby*, host opens, others join by
  code, the server deals. It is the only way to reach setup, and it exercises
  the real seating path.
- **shipment** — the seeder's `bidding` position, advanced with real
  `ADVANCE_PHASE` presses to Shipment and Movement.
- **battle** — the seeder's `battle` position: two contested territories, real
  hands, traitors crossed.

Matches are left in the local database on purpose; a failed run is far easier
to read with its match still there. `npx supabase db reset` clears them.

## Proving it still bites

The suite was checked by planting each of the three failures in real source and
confirming the run goes red and names the fault: the setup column's render
condition forced false, the ship rail's, Ready hard-disabled, and a transparent
full-screen overlay dropped over the board. All four were caught. A browser
suite that cannot catch its own three targets is worse than none, so re-run
that check if you change the helpers.

## battleplan.spec.ts

Two battles, both plans committed, through the endpoint — plus the Commit
button, pressed, with the public row as the witness that a plan reached it.

This one exists because of a specific miss. A helper extracted for the battle
Karama stops was parked between two case labels inside the switch, and a switch
does not run the statements it jumps past: every BATTLE_PLAN died on a
ReferenceError. It typechecked, it bundled, all 107 unit suites passed, and the
existing battle spec passed too — it drove the dial and stopped short of
pressing Commit. Two deploys and a player's bug report found it.

The beats between the two plans — a Voice, the Atreides question, the traitor
call, a loss allocation — are PLAYED rather than scripted:  reads
the row and answers whatever is actually open. A fixed script would encode one
seating and rot, and would skip a new beat in silence instead of failing.

The guard is proven, not assumed. Passing against fixed code shows a spec runs;
it does not show it would have caught anything. So the helper was stranded back
inside the switch and the spec re-run — both tests failed, the first with

    BATTLE_PLAN crashed the endpoint as emperor.
    Cannot access 'battleStops' before initialization
      emperor BATTLE_PICK → 200 ok
      emperor BATTLE_PLAN → 500 action-threw

— and the helper was put back. About 15s for the pair, on the local stack.
