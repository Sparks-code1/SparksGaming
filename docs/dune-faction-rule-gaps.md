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
