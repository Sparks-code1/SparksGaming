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

## Staged previews

Not part of a run, but the same idea: ?dune-game stages the screen against a
fixture so a layout can be LOOKED at. ?battle=plan is the plan form before the
reveal, ?ship is the shipment rail with a seat first in the rotation and both
halves of its turn unspent — the only arrangement where the whole rail is live.
Both were added because a control that has only ever been asserted about is a
control nobody has seen.

## risk.spec.ts

The first browser coverage Risk has ever had. Everything above it is Dune's.

It differs from every Dune spec in one way: **it seeds nothing.** The Dune
fixtures write a match with the service role because the phases they assert on
are unreachable without playing a whole turn to get there. Risk's walk from the
front door to a live board is a dozen clicks and takes twelve seconds — and that
walk is itself the part nobody had driven, so seeding past it would skip the only
thing here that had never been proven.

It signs in as nobody. A campaign can be created signed out, the form says so,
and every screen the walk touches works that way.

`support/risk.ts` carries the walk: `newCampaign`, `openSlots` / `leaveSlots`,
`playSetup`, and `soloGame` for all three. Controls are found **by their text**,
because Risk's screens carry no `data-` hooks the way Dune's grew them — a spec
that finds a control the way a player finds it fails when a player would be
lost, which is the right moment to fail.

### Two maps, and they are not the same map

Setup's HQ picker is an **SVG**, one `<polygon>` per territory, each carrying a
`<title>` that doubles as the refusal: `Alaska` is open, `Alaska — city` is not.
So the open territories are the titles with no dash in them, and the walk needs
to know none of the rules to find one.

The board is **Pixi on a canvas**, with an SVG layer for markers only and no
territory polygons at all. Both of those cost a debugging round: the walk first
clicked blind points on a canvas that setup does not have, and the board spec
first counted polygons the board does not draw.

### What it found on the first run

- **Setup never asks the computer anything.** `GameSetupScreen` takes an
  `aiPlayerIds` set and consults it in exactly one place — the alien weakness
  power. Faction, permanent ability and HQ are all put to the human at the
  keyboard on the computer's behalf, one seat at a time. Not a soft-lock: the
  clicks land and the game starts. But a solo player makes every one of the
  bot's opening decisions for it, which is why `playSetup` clicks for the
  computer and says so.
- **The Human / AI toggle recorded its state only as a background colour.** No
  screen reader could read it and no test could assert it without matching rgba
  strings. It carries `aria-pressed` now.

### Proving it bites

Both targets were planted in real source and the run went red for each: the
toggle's `aria-pressed` forced false (the seat-count spec failed naming the two
it expected), and the board's map canvas hidden (the walk failed saying it never
reached a board).

One more was found by running it, not by planting it. `onBoard` matched three
phase names in capitals, which passed run after run because the dice kept
putting the computer first — its banner shouts `⚔ ATTACK`. The turn a HUMAN
opens starts in `DRAFT`, in sentence case, and the walk declared a perfectly
good board unreached. Which way it went depended on a die roll. It now matches
case-insensitively, with the phase list completed, **and** requires a canvas —
because a faction ability card reads "round up draft bonuses", and the word
alone was true three screens early.

### The computer answers for itself now

The finding above is fixed, and two specs hold it: `playSetup` takes an optional
name and clicks for **that player only**, so every screen put to a bot has to be
answered by the bot or the walk runs its cap down and fails naming the screen it
stalled on. One spec runs a bot alongside the human; the other runs two, which
is what proves the sequencing rather than a lucky ordering.

Both were checked by disabling each half of the new behaviour in real source.
Stopping the faction and ability auto-pick failed at `BOT ONE — PICK A FACTION`;
stopping the HQ auto-pick failed at `PLACE YOUR HQ`.

One more case thing, worth knowing before writing a spec against these screens:
two of the three choice headings are uppercased in CSS, and `innerText` returns
what is rendered. The faction screen asks `HARNESS — PICK A FACTION` of a player
the roster calls `Harness`, so the first version of the name check waited for the
human to answer for herself.

### One full AI turn

The oldest open question about Risk: the AI turn driver — reinforce, attack,
fortify, end — had never been watched end to end. Its known failure is a stall,
and a stalled AI looks exactly like a human seat with nobody at it.

The spec reaches a board, hands the turn to the computer, and waits for it to
come back. Whoever the dice put first, exactly one computer turn is watched: if
the human opens, `passTurn` plays their turn out to hand over; if the computer
opens, the wait is the whole test.

**The board's map is a canvas with nothing addressable on it** — no data
attributes, no accessible names, and the SVG marker layer over it is
`pointer-events: none`. So a territory click is a click at a POINT, and
`territoryPoint` does the `object-fit: contain` arithmetic once from the canvas
box and the map's own dimensions. `passTurn` checks the counter actually drops
after each click, so a wrong mapping fails saying so rather than clicking the
ocean forty times.

**The phase-advance control is one button with four labels** — `Begin Attack →`
while troops are owed, `✓ Confirm` once they are down, then `End Attack →`, then
`End Turn →`. Pressing the three in order finds none of them, because placing
the draft relabels the first. `passTurn` presses whatever it currently says
until the seat changes hands.

**The 20-second stall watchdog is folded into the wait**, not checked after it.
Checked afterwards it could never fail: a stall failed the wait first, and a
turn that recovered had already cleared the Nudge. Inside the poll it earns its
place — the failure says whether the board itself had noticed, which is the
difference between a slow turn and a wedged one.

**It does not ask whether the turn was PLAYED.** A driver that handed the seat
straight on without reinforcing or attacking would pass. An attempt to close
that — comparing what the computer held before and after, which `holdings`
reads off the roster strip — was removed because it could not be made to fail:
stubbing `aiReinforcePlacements`, `aiAttackPlan` and `aiFortifyMove` all to
nothing left the run green, so whatever moves those numbers is not only them.
An assertion nobody can make fail is worse than none, because it reads like
cover. `holdings` itself works — a probe showed a real turn taking Bot One from
one territory to eight — and is left for whoever works out what that path is.

Proven by wedging the driver at the fortify phase in real source. The run fails
with `the computer took its turn and never gave control back — the AI turn
driver stalled mid-turn`, and `Received: "stalled — the board gave up and
offered a Nudge"`. Three clean runs before that to check it is not flaky:
~30s each.

### Several consecutive turns

One turn reaches none of the interrupts — no event card, no capture that opens a
modal, no elimination — and those are exactly where the AI driver is least
proven: it auto-answers its own choice modals, pauses for human-owned ones, and
a state it has no branch for is a wedge. Which of them are covered is not a
thing to reason about from the code. It is a thing to walk into.

Three seats, two of them computers, nine hand-overs. Two bots produce battles
between themselves as well as against the human — more captures, more cards,
more chance of an elimination inside the run. ~45s with fast-forward on, which
is also a probe in its own right: turn boundaries crossed by shrunken timers is
the exact race that once let a stale AI step end a human's reinforce phase
under him.

`playRounds` answers for the named human and nobody else, fails on a Nudge
naming the seat and the turn, and fails if any seat holds the turn past its
patience. `passTurn` asks the board which ground it can still draft onto rather
than remembering an opening HQ — over several turns the human loses territory,
and in a two-seat game can lose the one they started on.

**Uncaught page errors fail the run.** An unhandled interrupt is at least as
likely to throw as to hang, and a throw inside a React effect leaves the board
looking fine while the driver is dead. Nothing else in this file watches for
that.

A passing run prints the rotation it achieved — `turns held: Harness → Bot One →
Bot Two → …` — because the per-seat assertions are SKIPPED when the game ends
early, and a silently weakened test is the thing this file keeps catching itself
doing.

Proven three ways in real source. A wedge from turn two: the single-turn spec
**passes** and this one fails with `Bot Two stalled — the board gave up and
offered a Nudge on turn 5`, which is the whole reason it exists. A throw that
does not wedge: caught by the page-error assertion, which the stall check would
never have reached. And the clean run above, in strict three-seat rotation with
no seat skipped.
