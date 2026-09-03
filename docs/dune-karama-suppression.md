# Cancelling an advantage with Karama

**BUILT, and this describes it. Last refreshed 2026-09-03.**

Both halves of Karama are done. The proactive half — spending one on your own
faction's power — is `src/lib/dune/karama.ts`. This is the other half: stopping
an opponent using one of theirs.

This file was written as a plan and has been rewritten as a description. Where
the build departed from the plan, the departure is marked and the reason kept,
because the reasoning is the part worth keeping.

---

## What the card does

> "…use this card to stop a player from using one of their faction advantages
> **when they attempt to use it**. Stops the use of that advantage during one
> game phase."

Three things follow from that sentence, and the third is the one that decides the
whole design.

**It is reactive.** It fires at the moment of use, not before. There is no
browsing a list of everything an opponent might do and picking one in advance —
by the time you are picking, the moment has passed.

**Its effect is scoped to a phase**, not to a single use. Stopping the Atreides
looking at a treachery card stops them looking for that whole bidding phase, not
just at that one card.

**Nobody is obliged to play it.** Most of the time nobody holds one, and most of
the time a holder declines. So the game cannot wait on an answer.

---

## The shape, as built

### It is played, not offered

**DEPARTURE FROM THE PLAN.** This document originally proposed an *offering*
window: the game would pause at each point an advantage was about to fire, name
the holders of a Karama, and proceed whether or not anyone answered. That is not
what was built, and the reason is the reason the plan itself gives for wanting
it — most of the time nobody holds one, and most of the time a holder declines.
A window at every firing site would have stopped the game constantly for an
answer that is almost always silence.

What was built instead is a plain action. A player holding a Karama sends
`KARAMA_STOP` naming the target faction, the rule, and the phase it bites in.
The card is discarded publicly, an entry goes into `state.suppressed[]`, and
every firing site asks `isSuppressed(...)` when it fires.

```
KARAMA_STOP { card, target, ref, phase? }
  -> state.suppressed[] gains { faction, ref, by, turn, phase }
  -> the site that fires that rule asks isSuppressed() and declines
```

It is reactive in effect without being reactive in mechanism: the stop is placed
ahead of the moment and consulted at it.

### Which phase it bites in

Silence means the phase being played in, which is what it always meant. A later
phase of the same turn may be named instead — `stoppablePhases(current)` is the
list, and the panel draws its picker from the same function the endpoint judges
with.

**This is not decoration.** Some advantages fire in the same breath as their
phase begins, with nothing between the two for anyone to answer in. The Guild
naming its place in the shipping order is the plainest case: the window opens in
the very write that sets the phase, so a stop that could only ever be stamped
with the phase already running could never once have fired. Naming a phase ahead
is how "before you ship, Karama" is actually said at a table.

A phase already past cannot be named: that moment cannot be interrupted.

**AND THE COMING STORM, from the Mentat Pause — the one crossing of a turn
boundary this card makes.** The Storm is the FIRST phase of a turn, so nothing
earlier in that turn can name it, and since the storm rolls, moves and tells
the Fremen their next distance in a single press there is no moment inside the
phase to answer either. Two stops sat on the menu that could not once have
fired: knowing the storm a turn early, and half losses in it.

The Pause is the moment immediately before the next storm, which is the same
reasoning that moved Family Atomics and Weather Control there. A stop named
from the Pause on the Storm is stamped `turn + 1`; everything else is stamped
with the turn it is played in. `stopTurnFor` is the one place that arithmetic
happens, because the panel has to show the player which storm they are aiming
at and the endpoint has to stamp it, and two answers would put a stop on a
storm nobody meant.

Nothing else reaches across a turn. From mid-turn this turn's storm has blown
and next turn's is out of the card's reach.

### Only what this game is playing

The menu takes the mode. Half these advantages live on the advanced side of the
sheet and do nothing whatever in a basic game — Sardaukar counting double, the
Fremen storm foreknowledge, the Guild going out of turn — and offering them in a
basic game sells a stop against something that was never going to happen. Mode is
a REQUIRED argument to `suppressibleRefs`, not a defaulted one, so a caller
cannot ask what a Karama may stop without saying which game it is asking about.

### One paragraph can be more than one advantage

A ref may name part of a sheet entry, written `abilities.shipment#kinds`. The
Guild's shipment paragraph is four things at once — collecting everybody's fees,
their own half rate, and two kinds of shipment nobody else may make — and one
card taking all four is not a reading a table would accept. The prose is NOT
split: the card a player reads stays whole, and the qualifier lives in the
reference. `canKaramaStop` strips at the `#` before checking `unsuppressable`, or
the qualifier would be a way round a faction's protection.

### Abilities become addressable

An ability has to be nameable before it can be stopped. `FactionRuleRef` already
does this — `'specialVictory'`, `'abilities.bidding'`, `'advanced.karama'` — and
is the closest thing to an ability id the data has. It names the GROUP as well as
the key, because the Bene Gesserit carry two `beforeGame` entries and a bare key
identifies neither.

When abilities stop being prose keyed by phase, those references become real ids.
Until then they are strings that resolve, and `factionRuleText` is what proves a
reference points at something rather than at nothing.

### Suppression is checked where the ability fires

Each ability's implementation asks, at its own point of use:

```ts
if (isSuppressed(state, faction, 'abilities.bidding')) { /* it does not happen */ }
```

The state that answers it is small: which (faction, ref) pairs are stopped, and
for which phase of which turn. It expires when the phase does.

### Built incrementally, not in one pass

**This is the part worth holding to.** The instinct is to do it as a single
sweep: enumerate every ability, give each an id, add a check to each. That would
mostly be adding checks to code that does not exist. The alternative produces a
large diff of hooks guarding nothing, which then has to be revisited anyway.

**(Superseded 2026-09-01.)** The sentence that used to stand here — "only the
storm and spice-blow ones have any implementation at all" — was true when this
was written and is long false: every phase is built now. See the audit below for
where that leaves the checks.

So: each ability gets its id and its suppression check **when the ability itself
is implemented**, as part of implementing it. The alternative produces a large
diff of hooks guarding nothing, which then has to be revisited anyway when the
real code lands, and which nothing can test in the meantime.

**(Superseded again 2026-09-02.)** "The one thing to do up front is the window"
no longer applies — there is no window. What is shared is `suppressibleRefs`, the
menu, and `isSuppressed`, the question; both existed before the first check did.

The incremental rule failed twice in practice and is now enforced rather than
remembered. A rule that depends on somebody recalling it is already broken:
`tests/karamatest.ts` requires every enforced entry to carry a
`// KARAMA-STOP: <faction> <ref>` marker at its firing site with a real
`isSuppressed` call within six lines of it, and requires every marker to belong
to an enforced entry. Both directions, because a flag with no check is a promise
the game cannot keep and a check with no flag is enforcement nobody may buy.

---

## Win conditions are out of reach

> "Cannot be used to stop a win condition advantage."

Already data. Each faction states which of its own rules are beyond a Karama in
`Faction.unsuppressable`, and `canKaramaStop(faction, ref)` reads it. Three exist
across the six:

| Faction | What is protected | Where it lives |
|---|---|---|
| Fremen | Their special victory | `specialVictory` |
| Spacing Guild | Their special victory | `specialVictory` |
| Bene Gesserit | The prediction win | `abilities.beforeGame` |

The third is the awkward one: their win sits in `abilities.beforeGame` rather
than `specialVictory`, because their paragraph describes making the prediction
AND winning by it in one breath. Splitting it would be a rules edit, so the
reference points at where the rule actually is.

`tests/factionstest.ts` holds two checks that matter more than the list itself.
Every faction with a `specialVictory` must have flagged it — derived, so a third
faction gaining one and nobody flagging it fails by name. And every reference
must resolve to text that exists, because a faction protecting a rule that is not
there reads exactly like a faction with nothing to protect.

---

## The Bene Gesserit hold more of these than anyone

Their advanced power makes a Worthless Card playable as a Karama. Two Karama
cards exist against five worthless ones, so the faction that can spend worthless
cards this way can hold more Karamas than everyone else put together — and they
are the cards nobody else bids for, so they come cheap.

That lands squarely on this half. Whatever the window costs to open, the Bene
Gesserit will be the ones answering it, and a design that assumes Karamas are
rare is assuming something that is not true of one seat at the table.

`isKaramaFor(faction, mode, card)` answers what counts as a Karama.
`karamaOptions(faction, mode)` answers what one buys. The Bene Gesserit changed
the first and not the second, and collapsing those two questions is what led to
their empty options list being read as them gaining nothing from the card.

---

## Open questions, and how they were settled

**Who sees the window** — moot. There is no window. The stop is a played card:
publicly discarded, publicly recorded in `state.suppressed[]`, and the table sees
what was stopped and by whom. Nothing is inferred about who holds what.

**Whether declining is public** — moot for the same reason. Nobody is asked, so
there is no declining to observe.

**What "one game phase" means for an ability used out of sequence** — settled by
letting the card name its phase. The Guild takes its shipment out of turn, and a
stop aimed at that names Shipment and Movement from an earlier phase of the same
turn. See "Which phase it bites in".

**Whether a suppressed ability is announced** — the STOP is announced, at the
moment it is played. What is not announced is the firing site declining later;
the seat that tried simply gets its ordinary refusal. That asymmetry is
deliberate: the table saw the card played and can read the consequence, and a
second announcement per firing would narrate a rule rather than play it.

---

## The audit, 2026-09-03

Counted from `factions.ts`, `canKaramaStop` and `suppressibleRefs`, against the
`isSuppressed` call sites in `dune-action`. The numbers are produced by the
suite, not by reading: `tests/karamatest.ts` holds each of them as a literal so
that adding or dropping an offer is a decision somebody has to make twice.

**36 addressable rules across the six factions. 3 are beyond a Karama** — the
Fremen special victory, the Guild special victory, and the Bene Gesserit
prediction. The win conditions, exactly as the section above says.

**26 curated stops. All 26 are enforced and offered.**

An unenforced stop is not a stop that quietly does nothing. It would take the
card, discard it where the table can see, announce itself, and then the
advantage would happen anyway. A player who is refused keeps their card and
knows where they stand; a player who is told it worked has been lied to and paid
for it. So an entry with no check at its firing site is **not offered**, and
`suppressibleRefs` is the one list both the panel and the endpoint read.

In a basic game the menu is 12, not 26 — the fourteen advanced entries are dropped.

### Enforced

| Faction | Rule | Where it is checked |
|---|---|---|
| Atreides | `abilities.bidding` | the auction card they alone see — and the stop takes back the one already in their tray |
| Atreides | `abilities.battle` | the plan element they may demand, asked again where the question is put |
| Emperor | `abilities.bidding` | their cut of what the auction pays |
| Emperor | `advanced.forces` | Sardaukar doubling, in the plan AND in the losses |
| Harkonnen | `abilities.treachery` | the bonus card |
| Spacing Guild | `abilities.shipment` | the fees redirected, and the half rate lost |
| Spacing Guild | `abilities.shipment#kinds` | cross-shipping and shipping home |
| Spacing Guild | `advanced.shipment` | naming their place in the rotation |
| Fremen | `abilities.shipment` | the free desert radius |
| Fremen | `advanced.shipment` | landing in a storm at half losses |
| Fremen | `advanced.storm` | knowing the next storm a turn early |
| Fremen | `advanced.forces` | Fedaykin doubling, in the plan AND in the losses |
| Fremen | `advanced.battle` | fighting at full strength without spice |
| Bene Gesserit | `abilities.battle` | the Voice, at the pick AND where it speaks |
| Bene Gesserit | `abilities.shipment` | the free force into the Polar Sink |
| Bene Gesserit | `advanced.shipment` | the advisor that follows a shipment |
| Bene Gesserit | `advanced.charity` | the flat two, whatever they hold |
| Bene Gesserit | `advanced.advisors` | advisors sitting in ground without a fight |
| Bene Gesserit | `advanced.fighters` | going to ground when somebody arrives |
| Bene Gesserit | `advanced.battle` | standing advisors up before a shipment |
| Fremen | `abilities.movement` | the second step — never the city flight |

Two of those say **AND** for a reason. "Counting double in battle and in taking
losses" is two halves of one sentence, and for a while only the first was
stopped: the plan was judged with the elites cancelled and the losses then
allocated with them doubled again. The suite now scans the endpoint for any
`eliteWorth` or `fullWithoutSpice` call whose own arguments carry no stop.

### Nothing is left unoffered

**Closed 2026-09-03.** Every curated stop now has a check at the site where its
rule fires, so the menu and the game agree everywhere: what a player is offered
is what a card actually buys.

Four notes from the last five, each the kind of thing a later reader would
flatten if it were not written down:

- **The Fremen second step is stoppable; the city flight is not.** Three
  territories out of Arrakeen or Carthag belongs to whoever holds the city, and
  is no faction's advantage.
- **Stopping the Fremen worm immunity takes the ally's shield with it.** The
  shield is that immunity lent out; with nothing left to lend, sparing the ally
  while the Fremen themselves burn would be a protection the sheet never grants.
- **`advanced.spiceBlow` fires in two phases** — placing the extra worms during
  the blow, half losses during the storm — so a stop aimed at one does not touch
  the other. That is what "during one game phase" means for an advantage used in
  two, and it is the answer to a question this document used to leave open.
- **The stopped Kwisatz Haderach is refused as `kwisatz-asleep`**, the same
  refusal a seat gets before their losses have woken him. He is not available to
  field either way, so a second code would have been a distinction without a
  difference.

The Bene Gesserit cluster went first, on the same day, because their six were
one idea rather than six.

### The rule that keeps this honest

An ability gets its check **when the ability is built**, as part of building it.
That rule failed twice — the Fremen desert radius shipped without one, and so did
eighteen more — and the only reason anybody found out was by reading the list. It
is enforced by the suite now rather than remembered, in both directions.
