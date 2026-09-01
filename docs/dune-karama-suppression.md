# Cancelling an advantage with Karama

The plan, not the build. The proactive half of Karama is done —
`src/lib/dune/karama.ts` — and this is the other half: stopping an opponent from
using one of their faction advantages.

Written down because the shape of it is decided and the timing of it is not, and
those are different things.

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

## The shape

### The interrupt is an offering window

`src/lib/dune/phase.ts` already has it. `offering(from, ask, carry, closesAt)`
stops a phase, names who *may* act, and proceeds whether or not anyone does —
built for Family Atomics, which has the same problem: a rare card, held by one
player, played into a specific gap.

Karama needs exactly that, opened at each point where an advantage is about to
fire, offered to everyone holding a Karama card:

```
faction is about to use ability X
  -> offering(everyone-with-a-karama, { kind: 'karama-window', faction, ability: X }, carry)
  -> nobody answers, or somebody plays one
  -> the ability fires, or does not
```

The `ask` carries which ability, so a client can say *"the Atreides are about to
look at this card"* rather than *"someone is doing something"*.

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

The one thing to do up front is the window, because it is shared. Everything else
arrives with its own ability.

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

## Open, and worth settling before it is built

**Who sees the window.** Offering it to everyone holding a Karama tells the table
that somebody is about to do something interruptible, which is information. The
alternative — offering silently and only to holders — means the interface knows
who holds one, and hands are secret.

**Whether declining is public.** If the window closes with nobody playing, does
the table learn that nobody held one?

**What "one game phase" means for an ability used out of sequence.** The Guild
takes its shipment out of turn; suppressing "during one game phase" is unclear
when the phase they act in is not their own.

**Whether a suppressed ability is announced.** Stopping the Atreides looking at a
card is visible. Stopping something passive may not be.

---

## The audit, 2026-09-01

Taken after a live playtest found the Fremen desert unguarded. Counted from
`factions.ts` and `canKaramaStop`, against the `isSuppressed` call sites in
`dune-action`.

**40 addressable rules across the six factions. 37 are stoppable.** The three a
Karama may never touch are the Fremen special victory, the Guild special
victory, and the Bene Gesserit prediction (`abilities.beforeGame`) — the win
conditions, exactly as the section above says.

**Seven of the 37 are checked where they fire:**

| Faction | Rule | Where |
|---|---|---|
| Atreides | `abilities.bidding` | the auction card they alone see |
| Atreides | `abilities.battle` | the one element of a plan they may demand |
| Emperor | `abilities.bidding` | their cut of what the auction pays |
| Harkonnen | `abilities.treachery` | the bonus card |
| Spacing Guild | `abilities.shipment` | the fee redirected to the bank |
| Bene Gesserit | `abilities.battle` | the Voice |
| Fremen | `abilities.shipment` | the free desert radius — **added 2026-09-01** |

The Fremen one is the reason for this audit. Their radius shipped without a
check, so the single power that most changes who can reach where could not be
cancelled at all — against this document's own rule that an ability gets its
check WHEN it is built. Note what the check does and does not touch: it prices
the desert at the ordinary rate, and leaves the payee with the bank, because
the Fremen fee never reaching the Guild follows from their reserves being on
planet (`Faction.reservesHeld`, data) and not from the advantage being stopped.

**The other 30 have no check.** Some are correctly unchecked — the rule above
is that a check arrives with its ability, and not every one of these is built.
But several ARE built and are unguarded, and those are debt rather than
deferral. The ones known to be built and unchecked:

- Fremen `abilities.movement` — two territories instead of one
- Fremen `advanced.forces` / Emperor `advanced.forces` — Fedaykin and Sardaukar
  counting double in battle and in losses
- Harkonnen `abilities.traitors` — keeping all four
- Harkonnen `advanced.capturedLeaders` — taking a leader after a win
- Bene Gesserit `advanced.charity` — always collecting, whatever they hold
- Bene Gesserit `advanced.advisors` / `advanced.fighters` — the advisor flow
- Atreides `advanced.kwisatzHaderach` — the counter and what it protects
- Spacing Guild `advanced.shipment` — cross-planet and shipping home

None of those is hard on its own; each is one `isSuppressed` call at the site
where the rule fires, plus a test in both directions — that stopping it changes
the outcome, and that stopping one seat leaves the others alone. What makes
them worth doing together is that they are all now findable: the list above is
the whole of it.

