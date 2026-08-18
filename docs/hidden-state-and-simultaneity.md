# Hidden information and simultaneous phases

Dune needs two things Risk never has: state that only one player may see
(traitor cards, spice holdings, committed battle plans), and phases where every
seat acts at once (bidding, battle plan commitment).

The current architecture assumes neither. This is what it would take, and what
it costs Risk.

Nothing here is implemented.

---

## What the transport actually does today

Worth stating precisely, because it rules out the obvious approach.

Clients subscribe with `postgres_changes` on the `matches` row
(`matchSync.ts:310`) and read `state, version, action_seq` from it. A Postgres
changefeed delivers **the whole row to every subscriber**. RLS decides whether
you receive a row at all; it cannot hand different columns — let alone
different JSON keys — to different subscribers. `REPLICA IDENTITY FULL` (set in
`20260805020000_realtime_replica_identity.sql`) means the payload carries the
old row as well as the new one.

So: **anything inside `matches.state` is visible to every connected seat**, whatever
the client chooses to render. A traitor card hidden only in the UI is not
hidden. This is the single fact the design has to work around.

> Worth checking before any of this: whether Risk already leaks. Territory cards
> in hand are secret in the physical game, and they live in `state` today. If
> the current implementation is already showing them to spectators, that is a
> live bug rather than a Dune problem.

---

## Hidden state

### The shape that fits

Split storage rather than filter the broadcast:

```
matches.state          public state — unchanged, still broadcast to everyone
match_secrets          (match_id, seat_id, data jsonb)
                       RLS: seat_id maps to auth.uid()
                       one row per seat; each client subscribes to its own
```

Public state carries *that* a seat has a secret, never *what* it is: `{ bids:
{ p2: 'committed' } }`, not the bid. The secret itself is a row only that seat
can select.

This keeps everything that currently works. The CAS on `matches.version` still
serialises writes. `postgres_changes` still pushes public state. Nothing about
the existing subscription changes; a second, RLS-scoped subscription is added
beside it.

The alternatives are worse for this codebase. Moving state onto a `broadcast`
channel so the edge function can send per-seat payloads means giving up
row-level CAS and rebuilding reconnection/replay by hand. Polling a `get-state`
endpoint that filters per caller gives up realtime push entirely.

### What it does to the reducer

The reducer contract has to grow a projection:

```ts
reduce(publicState, secrets, action, rng) → { publicState, secrets, effects }
view(publicState, secrets, seatId) → clientState
```

`view` is the important half. It is the only thing that decides what a seat may
see, so it must live on the server side of a trust boundary — which means the
**full reducer can only ever run in the edge function**. Clients run it against
their projection.

That collides with something real. Today the client applies non-combat actions
optimistically to keep `gameStateRef` synchronous (task #23), and only waits on
the server for dice. Optimistic apply is sound exactly when the action's outcome
does not depend on anything the client cannot see. That is a property each game
has to declare per action, not a blanket rule.

---

## Simultaneous phases

### The precedent already exists

The missile window is commit-then-reveal, built and shipped:
`combatWindow` holds `claims[]`, an `expiresAt`, and a `priority` order; several
seats append claims off-turn; `CLOSE_COMBAT_WINDOW` folds them into the result
by a deterministic priority. Multiple players act into one window and the server
arbitrates.

What it lacks is secrecy — claims are visible as they arrive — and a completion
gate other than a clock.

### The log does not need to change

This is the reassuring part. Commits stay individually sequenced writes under
the existing `version` CAS: they are ordered, append-only, exactly as now. What
changes is that the *game* stops advancing on each one. It advances on resolve.

Simultaneity is a property of the phase, not of the log. A commit is an ordinary
action that writes a secret and flips a public flag; the reveal is one further
action that reads all the secrets at once. The action log stays sequential and
totally ordered throughout, which means replay, reconnection and the CAS story
are all untouched.

```
phase: { kind: 'commit', waitingOn: ['p1','p3'], deadline }
  p3 commits  → secret written, waitingOn: ['p1']      (log seq n)
  p1 commits  → secret written, waitingOn: []          (log seq n+1)
  RESOLVE     → secrets folded into public state       (log seq n+2)
```

`RESOLVE` fires when `waitingOn` empties, or on the deadline. The reducer must
stay clock-free, so the deadline is handled the way the missile window already
handles it: the caller supplies the time and the server bounds it.

### Where the turn gate goes

The client turn gate and `OFF_TURN_ACTIONS` become a special case of a
question the game answers: *is this seat one this phase is waiting on?* In
sequential play the answer is "only the active player"; in a commit phase it is
"anyone in `waitingOn`". That predicate is `authorize()` from the
`GameDefinition` sketch in [platform-extraction.md](platform-extraction.md) —
it is already the right place, and already game-owned.

---

## Impact on Risk

**If the split is additive, close to none.** Risk writes no secrets, so
`match_secrets` stays empty, `view` is identity, and every phase reports as
sequential. The second subscription can be skipped for a game that declares no
hidden state.

Two things do land on Risk:

**The optimistic path needs an audit.** Once `view` exists, the client reducer
runs on a projection. Risk's optimistic actions almost certainly survive — none
of them read anything hidden — but "almost certainly" is not the same as
checked, and this is the failure mode that shows up as desync three games in.

**The reducer signature changes.** Threading `secrets` through
`reduce` touches every call site and the generated edge bundle, even where the
argument is always empty. That is mechanical, and it is exactly the kind of
sweeping change the sequencing in [platform-extraction.md](platform-extraction.md)
exists to keep survivable — it should land as its own step, with the suite green,
and before any Dune rule depends on it.

---

## Order

1. Check whether Risk currently leaks its card hands. It decides whether this is
   new capability or an outstanding bug.
2. `match_secrets` + RLS, unused. Additive, no behaviour change.
3. `view` in the contract, identity for Risk. Audit the optimistic path here.
4. Thread `secrets` through the reducer, empty for Risk.
5. Commit/reveal phase kind, generalising what the missile window already does.

Steps 2–4 are all reversible and all end green. Step 5 is where Dune's first
real rule can land.
