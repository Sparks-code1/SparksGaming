# What the faction data cannot say

`src/data/dune/factions.ts` holds numbers and prose. The prose describes rules
that need somewhere to live. This is that list, recorded now so the gaps are
known rather than discovered when a phase is half-built.

Written after all six factions were entered.

---

## The finding that matters most

**The phase functions built so far are faction-blind.** `storm.ts` and
`spiceBlow.ts` take forces as `{ territoryId, sector }` — with no owner. They
cannot express:

- Fremen taking **half losses** in a storm (rounded up)
- Fremen **not being devoured** by Shai-Hulud
- Fremen placing **additional worms** wherever they like

Every one of those is a faction modifying a phase that currently has no concept
of factions. This is not a small addition: `Occupied` needs an owner before any
of it is expressible, and once forces have an owner, both phases need a hook
where a faction can alter the outcome.

Worth doing before more phases are written, because every phase after this one
has faction exceptions too.

---

## Missing models, in rough order of how much depends on them

### 1. Territory adjacency — nothing has it

`boardData` knows sectors, spice and cells. It does not know which territories
touch which. Blocked on it:

- Fremen movement: "two territories instead of one"
- Fremen shipment: "within two territories of the Great Flat"
- All ordinary movement, for every faction

**Settled while waiting for it:** whether a faction's reserves are off planet or
on is now data — `Faction.reservesHeld` — rather than something to be read out
of the ability prose. The Fremen are the only ones already on Arrakis, and that
one bit drives two separate rules: their shipment costs nothing, and the Guild is
paid only by factions shipping "from their off-planet reserves", so the Guild's
income is smaller in any game the Fremen are in. Both are asserted in
`tests/factionstest.ts`, including a check that the prose still agrees with the
field, since either can be edited without the other.

This is the single biggest hole. It is derivable from the SVG the same way
sector spans were — shared borders between territory paths — so it belongs in the
generator rather than hand-written.

### 2. Force ownership and force state

Forces are currently anonymous. They need at minimum:

- **an owner** (see above)
- **a mode**, because Bene Gesserit forces are *advisors* or *fighters*, and the
  distinction changes occupancy, battle, spice collection and stronghold
  challenges. Advisors coexist with enemies in a territory — which breaks the
  usual assumption that presence implies conflict
- **an elite flag**, since Sardaukar and Fedaykin are worth two in battle and in
  taking losses, but one in revival, and only one may revive per turn

### 3. Leaders as objects with state

`Leader` is a name and a strength. The rules need leaders that can be:

- alive, dead in the Tleilaxu Tanks, or **captured by the Harkonnen**
- used once per turn, and tracked as used
- revealed as traitors — and *not*, when accompanied by the Kwisatz Haderach

They also need **stable ids**. Traitor cards and captured leaders both identify a
leader, and matching on display name is fragile.

### 4. Battle plans

Four elements — leader, weapon, defense, forces — committed simultaneously and
revealed together. Needed before Atreides prescience or Bene Gesserit Voice mean
anything, and it is the commit-then-reveal case
[the hidden-state design](hidden-state-and-simultaneity.md) was written for.

### 5. The treachery and traitor decks

Neither exists. Harkonnen alone needs: an 8-card hand limit, two cards dealt at
start, a free extra card per purchase, and all four traitors kept.

### 6. Spice as an economy rather than a number

`match_secrets` holds a per-seat integer. The rules need payments **routed**:

- Emperor receives what others pay for treachery cards
- Guild receives what others pay to ship
- Guild pays half fees; 1 spice per 2 forces shipped back
- Emperor may pay for an ally's revivals

So a payment needs a payee that may be a faction rather than the bank.

### 7. Turn order and out-of-turn action

The storm already decides who goes first. Not yet modelled: the Guild taking its
shipment and movement **out of sequence**, without declaring when.

### 8. Alliances

Out of scope by your instruction, but noted because six of the twelve alliance
texts grant an ally something concrete — free revivals, half-price shipment,
shared victory — and none of it is expressible yet.

---

## Per-faction state that has nowhere to live

| Faction | State needed | Where it is written now |
|---|---|---|
| Atreides | Kwisatz Haderach: cumulative losses counter, active flag, per-turn usage | `advanced.general` prose |
| Bene Gesserit | The secret prediction: faction + turn, hidden until the end | `abilities.beforeGame` prose |
| Bene Gesserit | Advisor/fighter mode per stack | `advanced.advisors` / `.fighters` |
| Harkonnen | Captured leaders, and which have been used | `advanced.capturedLeaders` |
| Emperor / Fremen | Elite force counts, and one-revival-per-turn | `forces.starred` is a count only |

The Kwisatz Haderach and the Bene Gesserit prediction are both **hidden per-seat
state**, so they belong in `match_secrets` alongside spice — not in the public
match row. Worth noting now: the prediction in particular must survive the whole
game unrevealed, which makes it the longest-lived secret in the game.

---

## A rule already in conflict with shipped code

**Bene Gesserit charity: "You always receive CHOAM charity of 2 spice regardless
of how many spice you already have."**

`src/lib/dune/charity.ts` implements eligibility as `spice <= 2`, and the
endpoint refuses a claim from anyone above it. The Bene Gesserit break that rule
outright.

The fix is not a special case in the charity function — it is that eligibility
has to become a faction-aware question. That is the same conclusion as the storm
and the worm above, arriving from a third direction.

---

## Ambiguities in the rules text

Recorded in `factions.ts` beside the data. Summarised here:

1. **Fremen Shai-Hulud**, final clause: "Any forces in that territory are not
   devoured." The preceding sentence already spares Fremen forces, so this either
   protects the *destination* after a worm ride, or *other factions'* forces in
   the origin. Very different rules.
2. **Fremen special victory**: "you (or no one) occupies Sietch Tabr and Habbanya
   Sietch" — does "(or no one)" distribute across both, and must both hold at once?
3. **Fremen advanced storm**: "can move either 1-6 sectors" — "either" implies two
   options; 1-6 is a range. And knowing the number "before the storm moves on the
   previous turn" reads as a full turn early, which changes what the storm phase
   reveals and to whom.
4. **Two special victories**: the Guild's ("if no faction has been able to win by
   the end of play") appears to subsume the Fremen's. Neither says which resolves
   first.
5. **Bene Gesserit prediction**: "you and your allies win the game and win alone"
   — those two clauses contradict each other.
6. **Harkonnen captured leaders**: "use it once in a battle, after which, if it
   wasn't killed during that battle, after which you must return that leader" —
   the sentence loses its thread; the intent is presumably return-after-use.

---

## Force totals — resolved

Dune is symmetric: every faction fields the same number of forces, split
differently between the board and reserves. All six now agree at 20.

| Faction | On planet | Where | Reserves |
|---|---:|---|---:|
| Atreides | 10 | Arrakeen | 10 |
| Emperor | 0 | — | 20 |
| Fremen | 10 | distributed across three | 10 |
| Spacing Guild | 5 | Tuek's Sietch | 15 |
| Bene Gesserit | 1 | Polar Sink | 19 |
| Harkonnen | 10 | Carthag | 10 |

Three values had crossed between factions: the Guild had been holding the Bene
Gesserit's 19 reserves and its Polar Sink start, and the Harkonnen had 1 on
planet rather than 10.

The check that caught it encodes no number from the rulebook — only that the six
totals agree with each other. That is why it worked without anyone having to be
right about Dune first, and it is the shape worth reaching for when a rule is
uncertain but a symmetry is not.

---

# What the advanced rules imply

Read against `docs/dune-advance-rules.md` after the storm, spice blow and charity
were built. Three things break or bend; one changes a type that does not exist
yet, which is the cheapest moment to know.

## 1. The spice deck runs dry — a shipped assertion becomes false

`spiceBlow.ts` refuses an empty deck and says why:

> "it cannot run dry in ten turns, so this is a bug, not a rule"

That is true of the basic game and **false of the advanced one**. Two territory
cards are revealed per turn, so ten turns need twenty; the deck holds fifteen.
Exhaustion arrives around **turn 7**, sooner once worms are drawn, since a worm
consumes a card without placing spice.

So the reshuffle deferred as "advanced settings, later" is not optional there —
it is load-bearing from the middle of every advanced game. The guard should
become mode-aware: still a bug in the basic game, still refused; a reshuffle in
the advanced one.

**Built.** The guard now branches on `mode`. The reshuffle takes the cards
*beneath* each pile's top card only — the top is what is SHOWING, and the next
worm devours whatever it names, so burying it would silently disarm every worm
that followed.

A note for anyone writing a similar check: the first version of the basic-game
assertion passed with the rule deleted. It exhausted a one-card discard, which
throws either way — with the guard because basic refuses exhaustion, without it
because a pile of one has nothing buried to reshuffle. The pile has to be deep
enough that only the mode can explain the throw.

## 2. Two discard piles, and FEWER Nexuses than expected

Two piles, A and B, each with its own top card. That part is a smaller change
than it looks: `resolveSpiceBlow` already resolves exactly one reveal-until-a-
territory sequence against one pile. The advanced game calls it twice with a
different pile, rather than needing a rewritten function. `discard` becomes two
arrays and the caller runs the phase per pile.

**But a Nexus is not guaranteed twice a turn.** In the rulebook text the Nexus
sits *inside* the Shai-Hulud branch: reveal a territory card and spice is placed
with no Nexus at all. So a turn produces **nought, one or two** Nexuses depending
on how many piles turned up a worm — not two.

Two ambiguities in the same passage:

- "The Shai-Hulud card is placed on the spice discard pile" — which one? Pile A
  is implied by context but not stated, and it matters, because the top of a pile
  is what the next worm devours.
- Turn one ignores worms and reshuffles them afterwards. With two piles, is that
  once per turn or once per pile?

**Both answered, and built.** One deck, two discard piles — not two decks. Each
pile is resolved independently by the same rules and a worm goes on, and eats
from, its own pile. `resolveDoubleSpiceBlow` is a wrapper that calls the
single-pile function twice; only three things cross between the piles.

**The deck.** Pile B draws from what pile A left.

**The Nexus.** At most one a turn, triggered by the first worm in *either* pile.
A worm in the second pile still devours — it simply triggers nothing. Passed in
as `nexusAlreadyTriggered` rather than inferred, because only the caller
resolving both piles knows what the first one did.

**Turn one's set-aside worms**, which are held across *both* piles rather than
returned between them. This one is worth stating plainly because the obvious
implementation is wrong: returning them at the end of pile A lets the same
physical worm be drawn again by pile B and counted twice as ignored, so six worms
can report as seven. `deferSetAside` hands them back to the caller instead.

**The Fremen's additional worms are counted per pile**, which followed from the
same ruling: a discard pile *is* a spice blow, so each pile's first worm resolves
normally and only the ones after it are the Fremen's to place. Five worms split
three and two across the piles hand over **three**, not the four you get counting
from the turn. A lone worm in pile B is a first worm — it devours, and the Fremen
get nothing from that pile.

Worth keeping the number: the per-turn reading differs only when *both* piles
blow a worm, so it is right most turns and wrong on exactly the turns that
matter. `resolveDoubleSpiceBlow` sums the two piles into one
`wormsForFremenToPlace` so no caller has to know that.

One more rule that arrived with this, and is the reason `applySpicePlacement`
exists rather than each caller doing it inline: **a blow SETS a territory's spice
to the card's printed value, it does not add to it.** A territory harvested down
from twelve to four goes back to twelve, not to sixteen. `+= amount` is the
natural thing to write and it is wrong — the dev view had exactly that bug.

## 3. Advanced combat: strength is not a property of a force

This is the answer to "what can the current state shape not express", and it is
more than a missing field.

A force is worth **full strength if one spice is spent on it, half if not**. The
same physical force is worth 1 or ½ depending on how it was used *in that
battle*. So strength cannot live on `Force` — it is a property of a commitment,
not of a piece.

The rulebook's own example makes the consequence plain. One Sardaukar (worth 2)
and five ordinary forces, dialled 3, one spice spent. The winner may lose:

- 1 Sardaukar at full (2) + 2 ordinary at half (½+½) — **three** forces, or
- 1 ordinary at full (1) + 4 ordinary at half (2) — **five** forces

Both satisfy the dial. So taking losses is a **constraint satisfaction** — find
an allocation whose strengths sum to what was dialled — not a subtraction. That
is the shape to build toward, and it is much easier to get right before a battle
function exists than after.

Three concrete implications:

**`Force` needs an elite count.** Sardaukar and Fedaykin are worth two. `starred`
currently exists only on a faction's *starting* forces, not on the stacks
standing on the board, so a stack cannot say how many of it are elite. This was
noted as deferrable earlier; advanced combat is what makes it required.

**Strength should be counted in HALF UNITS as integers.** Dials come in half
increments, and the winning condition is an exact equality between a dialled
number and a sum of halves. Floating point makes `0.5 + 0.5 + 0.5` a poor thing
to compare for equality. Store `dialledHalves: 6` rather than `dialled: 3` and
the comparison is exact.

**A battle plan carries spice.** Spent win or lose, and to the Spice Bank —
except when a traitor is revealed, in which case the winner pays nothing. So the
plan must record the intended spend before the reveal, and the payment resolves
after it.

## 4. Spice collection is now faction- and stronghold-sensitive

Carthag and Arrakeen pay 2, Tuek's Sietch pays 1, to whoever occupies them **at
the time of collection**, and a player holding two collects for both. The
territory ids already exist (`territory-26`, `territory-13`, `territory-33`), so
this needs occupancy rather than new board data.

## 5. Karama cards need the treachery deck first

Five of the six factions gain a one-time power; the Bene Gesserit do not. Two of
them reach into phases already built:

- **Fremen**: place a sandworm in any sand territory, treated as a normal worm —
  so the spice blow needs a way to accept a worm from outside the deck.
- **Harkonnen**: take cards blindly from another player's hand and give cards
  back — which needs hidden hands, the same machinery as spice.

## 6. The closing line confirms the direction

> "Each Faction has a unique set of rules that changes Storm, Spice Blow and
> Nexus phase, CHOAM, Bidding, Revival, Shipment and movement, Battle phase, and
> Spice Harvest"

Every phase, not some. The faction-aware hook added to the storm and the spice
blow is the pattern for all nine, rather than an exception made for the Fremen.

## Typos, if this text is ever shown to players

territtory, Tleiaxu, palced, dicard, manne, Saedaukar, orinary, plaing, Karana,
"ir they may use it" (or), and NEXUS/Nexus inconsistently capitalised.
