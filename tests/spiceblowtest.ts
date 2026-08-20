// Spice blow, phase 2. The worm devours a TERRITORY — every sector of it, and
// rock is no shelter — which is the opposite of how the storm works, so the
// two are contrasted directly below.
import {
  buildSpiceDeck, resolveSpiceBlow, resolveDoubleSpiceBlow, applySpicePlacement,
  shuffle, showing, SHAI_HULUD_COUNT,
} from '@/lib/dune/spiceBlow'
import type { SpiceCard } from '@/lib/dune/spiceBlow'
import { beginDoubleSpiceBlow, placeFremenWorms } from '@/lib/dune/spiceBlow'
import { isAwaiting, runToSettled } from '@/lib/dune/phase'
import type { Force, SectorId, TerritoryId } from '@/types/Dune/Game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const terr = (id: string, spice: number, sector: number): SpiceCard =>
  ({ kind: 'territory', territoryId: id as TerritoryId, name: id, spice, sector: `sector-${sector}` as SectorId })
const worm: SpiceCard = { kind: 'shai-hulud' }
const at = (t: string, s: number, faction = 'harkonnen', count = 1): Force => ({
  faction: faction as Force['faction'],
  territoryId: t as TerritoryId,
  sector: `sector-${s}` as SectorId,
  count,
})
const rng = () => 0.5
// Somewhere none of the test cards blow, so the storm is out of the way unless a
// test deliberately parks it on a card's sector.
const STORM_AWAY = 'sector-18' as SectorId
const base = { forces: [], spiceOnBoard: {}, storm: STORM_AWAY, firstTurn: false, rng, mode: 'basic' as const }

// ── the deck as printed ──────────────────────────────────────────────────────
const deck = buildSpiceDeck()
check('15 territory cards + 6 worms', deck.length, 21)
check('six worms', deck.filter(c => c.kind === 'shai-hulud').length, SHAI_HULUD_COUNT)
check('every territory card carries a sector',
  deck.filter(c => c.kind === 'territory' && !c.sector).length, 0)
check('total spice matches the board', 
  deck.reduce((n, c) => n + (c.kind === 'territory' ? c.spice : 0), 0), 116)

// ── a plain blow ─────────────────────────────────────────────────────────────
const plain = resolveSpiceBlow({ ...base, deck: [terr('a', 8, 3), terr('b', 6, 5)], discard: [] })
check('spice lands on the drawn territory', plain.placed, { territoryId: 'a', sector: 'sector-3', amount: 8 })
check('one card drawn, one left', plain.deck.length, 1)
check('the drawn card is now showing', showing(plain.discard)?.kind, 'territory')
check('nothing devoured', plain.devoured, [])

// ── the worm ─────────────────────────────────────────────────────────────────
// It eats what is showing BEFORE it is itself discarded — "now showing".
const eaten = resolveSpiceBlow({
  ...base,
  deck: [worm, terr('b', 6, 5)],
  discard: [terr('a', 8, 3)],
  forces: [at('a', 3), at('a', 9), at('b', 5)],   // two sectors of 'a', one of 'b'
  spiceOnBoard: { a: 8, b: 12 },
})
check('the worm eats the territory showing', eaten.devoured.map(d => d.territoryId), ['a'])
check('EVERY sector of it, not just one', eaten.devoured[0].forcesKilled.length, 2)
check('...and the untouched territory keeps its forces',
  eaten.toTanks.some(f => (f.territoryId as string) === 'b'), false)
check('its spice goes to the bank', eaten.devoured[0].spiceRemoved, 8)
check('the blow still lands on the NEXT territory drawn',
  eaten.placed, { territoryId: 'b', sector: 'sector-5', amount: 6 })
check('forces are handed over for the tanks', eaten.toTanks.length, 2)

// ── consecutive worms ────────────────────────────────────────────────────────
// The most recently discarded card is always the one showing, so the second
// worm finds a WORM showing and has no territory to eat.
const twice = resolveSpiceBlow({
  ...base,
  deck: [worm, worm, terr('c', 6, 7)],
  discard: [terr('a', 8, 3)],
  forces: [at('a', 3)],
  spiceOnBoard: { a: 8 },
})
check('two worms, but only one meal', twice.devoured.map(d => d.territoryId), ['a'])
check('the second ate nothing', twice.devoured.length, 1)
check('and the blow lands after both', twice.placed?.territoryId, 'c')
check('both worms are discarded', twice.discard.filter(c => c.kind === 'shai-hulud').length, 2)

// Turn 1 must place a territory card, so a worm can never meet an empty discard.
// Impossible states fail loudly rather than resolving to "ate nothing", which
// looks identical to a legal second worm and would hide the bug.
const threw = (fn: () => unknown) => { try { fn(); return false } catch { return true } }
check('a worm on an empty discard is refused, not tolerated',
  threw(() => resolveSpiceBlow({ ...base, deck: [worm, terr('a', 8, 3)], discard: [] })), true)

// ── turn one ─────────────────────────────────────────────────────────────────
const first = resolveSpiceBlow({
  ...base,
  storm: STORM_AWAY, firstTurn: true,
  deck: [worm, worm, terr('a', 8, 3), terr('b', 6, 5)],
  discard: [terr('z', 6, 1)],
  forces: [at('z', 1)],
  spiceOnBoard: { z: 6 },
})
check('turn one devours nothing', first.devoured, [])
check('...even with a territory showing', first.toTanks, [])
check('two worms set aside', first.ignored, 2)
check('the blow lands on the first territory drawn', first.placed?.territoryId, 'a')
check('the worms go back into the deck', first.deck.filter(c => c.kind === 'shai-hulud').length, 2)
check('...so nothing is lost from it', first.deck.length, 3)
check('and no worm reaches the discard', first.discard.filter(c => c.kind === 'shai-hulud').length, 0)

// All six worms in a row on turn one must be survivable: they are set aside,
// not resolved, so there is no territory to devour and nothing to refuse.
const sixWorms = resolveSpiceBlow({
  ...base,
  storm: STORM_AWAY, firstTurn: true,
  deck: [worm, worm, worm, worm, worm, worm, terr('a', 8, 3)],
  discard: [],
})
check('six worms on turn one do not throw', sixWorms.ignored, 6)
check('...and the blow still lands', sixWorms.placed?.territoryId, 'a')
check('...with every worm back in the deck', sixWorms.deck.filter(c => c.kind === 'shai-hulud').length, 6)
check('...and none on the discard', sixWorms.discard.filter(c => c.kind === 'shai-hulud').length, 0)

// ── the deck running dry means different things in the two games ─────────────
// Basic: one territory card a turn over ten turns needs ten and the deck holds
// fifteen, so an empty deck is a bug. Quietly placing no spice would look like a
// legal turn where the blow simply did nothing.
//
// The discard is deliberately DEEP here. Against a one-card pile the call throws
// either way — with the mode guard, because basic refuses exhaustion; without
// it, because a pile of one is all showing card and has nothing to reshuffle.
// The check would pass with the rule deleted, which is no check at all.
check('basic: an exhausted deck is refused',
  threw(() => resolveSpiceBlow({
    ...base, deck: [], discard: [terr('a', 8, 3), terr('b', 6, 5), terr('c', 10, 7)],
  })), true)

// Advanced: TWO territory cards a turn needs twenty. The deck runs dry around
// turn seven by arithmetic, so the reshuffle is a rule rather than a rescue.
{
  const dry = resolveSpiceBlow({
    ...base, mode: 'advanced',
    deck: [],
    discard: [terr('a', 8, 3), terr('b', 6, 5), terr('c', 10, 7)],
  })
  check('advanced: an exhausted deck reshuffles instead', dry.reshuffled, true)
  check('...and the blow lands', dry.placed !== null, true)

  // The card SHOWING stays put. It is what the next worm devours, so burying it
  // in the deck would silently disarm every worm that followed.
  check('the showing card is not swept into the deck', dry.discard[0], terr('c', 10, 7))
  check('...only the cards beneath it are', dry.deck.length, 1)
  check('no card is created or lost', dry.deck.length + dry.discard.length, 3)

  check('basic never reshuffles',
    resolveSpiceBlow({ ...base, deck: [terr('a', 8, 3)], discard: [] }).reshuffled, false)

  // A pile of one is all showing card. Nothing to reshuffle is still a bug.
  check('advanced: nothing buried to reshuffle is refused',
    threw(() => resolveSpiceBlow({ ...base, mode: 'advanced', deck: [], discard: [terr('a', 8, 3)] })), true)
}

// ── a blow SETS the spice, it does not add to it ─────────────────────────────
// A territory harvested down from twelve to four blows back to twelve, not to
// sixteen. Lives in the rules module rather than each caller because "+= amount"
// is the natural thing to write and it is wrong.
check('a blow overwrites what is already lying there',
  applySpicePlacement({ x: 4 }, { territoryId: 'x' as TerritoryId, sector: 'sector-3' as SectorId, amount: 12 }),
  { x: 12 })
check('...and leaves every other territory alone',
  applySpicePlacement({ x: 4, y: 6 }, { territoryId: 'x' as TerritoryId, sector: 'sector-3' as SectorId, amount: 12 }),
  { x: 12, y: 6 })
check('no placement leaves the board untouched', applySpicePlacement({ x: 4 }, null), { x: 4 })

// ── shuffle is injected, not random ──────────────────────────────────────────
const seq = [0.1, 0.9, 0.3, 0.7, 0.2]
let i = 0
const seeded = () => seq[i++ % seq.length]
i = 0; const s1 = shuffle([1, 2, 3, 4, 5], seeded)
i = 0; const s2 = shuffle([1, 2, 3, 4, 5], seeded)
check('the same seed gives the same order', s1, s2)
check('...and it is a permutation, not a resample', [...s1].sort(), [1, 2, 3, 4, 5])

// ── the worm and the Fremen ─────────────────────────────
// Shai-Hulud does not devour the Fremen. An ordinary ability, not an advanced
// one, so it holds in BOTH games.
for (const mode of ['basic', 'advanced'] as const) {
  const out = resolveSpiceBlow({
    ...base, mode,
    deck: [worm, terr('b', 6, 5)],
    discard: [terr('a', 8, 3)],
    forces: [at('a', 3, 'fremen', 4), at('a', 3, 'harkonnen', 4)],
    spiceOnBoard: { a: 8 },
  })
  check(mode + ': the worm eats the Harkonnen',
    out.devoured[0].forcesKilled.map(f => f.faction), ['harkonnen'])
  check(mode + ': and spares the Fremen',
    out.devoured[0].forcesSpared.map(f => f.faction), ['fremen'])
  check(mode + ': only the eaten go to the tanks',
    out.toTanks.reduce((n, f) => n + f.count, 0), 4)
}

// ── additional worms belong to the Fremen, in the advanced game ────────
// Surfaced as a count rather than resolved: where they go is a player decision,
// and this function decides nothing a player is entitled to decide.
{
  const deck = [worm, worm, terr('c', 6, 7)]
  const discard = [terr('a', 8, 3)]
  const forces = [at('a', 3, 'harkonnen', 4)]

  const basic = resolveSpiceBlow({ ...base, deck, discard, forces, spiceOnBoard: { a: 8 } })
  check('basic: nothing is handed to the Fremen', basic.wormsForFremenToPlace, 0)

  const adv = resolveSpiceBlow({
    ...base, mode: 'advanced', fremenInPlay: true,
    deck, discard, forces, spiceOnBoard: { a: 8 },
  })
  check('advanced: the first worm resolves normally',
    adv.devoured.map(d => d.territoryId), ['a'])
  check('...and the second is theirs to place', adv.wormsForFremenToPlace, 1)
  check('...left unresolved, so it devoured nothing extra', adv.devoured.length, 1)

  const noFremen = resolveSpiceBlow({
    ...base, mode: 'advanced', fremenInPlay: false,
    deck, discard, forces, spiceOnBoard: { a: 8 },
  })
  check('advanced with no Fremen seated: the phase behaves as it always did',
    noFremen.wormsForFremenToPlace, 0)
}

// ── the advanced double blow: ONE deck, TWO discard piles ────────────────────
// Not two decks. Each pile is resolved independently by the same rules, and a
// worm eats whatever its OWN pile is showing.
{
  const dbl = { forces: [] as Force[], spiceOnBoard: {}, storm: STORM_AWAY, firstTurn: false, rng }

  const clean = resolveDoubleSpiceBlow({
    ...dbl,
    deck: [terr('x', 8, 3), terr('y', 6, 5), terr('z', 10, 7)],
    discardA: [], discardB: [],
  })
  check('both piles blow, from the one deck',
    [clean.a.placed?.territoryId, clean.b.placed?.territoryId], ['x', 'y'])
  check('one deck, so it is two cards shorter', clean.deck.length, 1)
  check('each pile keeps its own top card',
    [showing(clean.discardA)?.kind, showing(clean.discardB)?.kind], ['territory', 'territory'])
  check('...and they are different cards',
    [(showing(clean.discardA) as { name: string }).name, (showing(clean.discardB) as { name: string }).name],
    ['x', 'y'])
  check('no worms, no Nexus', clean.nexus, false)

  // A worm in each pile. The one in B still devours — it simply triggers nothing.
  const both = resolveDoubleSpiceBlow({
    ...dbl,
    deck: [worm, terr('x', 8, 3), worm, terr('y', 6, 5)],
    discardA: [terr('a', 8, 3)],
    discardB: [terr('b', 6, 5)],
    forces: [at('a', 3), at('b', 5)],
    spiceOnBoard: { a: 8, b: 6 },
  })
  check('pile A\'s worm eats pile A\'s showing card', both.a.devoured.map(d => d.territoryId), ['a'])
  check('pile B\'s worm eats pile B\'s, not pile A\'s', both.b.devoured.map(d => d.territoryId), ['b'])
  check('both piles send forces to the tanks', both.toTanks.length, 2)

  // ── at most ONE Nexus a turn, triggered by the first worm in either pile ────
  check('the first worm triggers it', both.a.nexus, true)
  check('the second does NOT trigger a second', both.b.nexus, false)
  check('...and the turn reports exactly one', both.nexus, true)

  const onlyB = resolveDoubleSpiceBlow({
    ...dbl,
    deck: [terr('x', 8, 3), worm, terr('y', 6, 5)],
    discardA: [terr('a', 8, 3)],
    discardB: [terr('b', 6, 5)],
    forces: [at('b', 5)],
    spiceOnBoard: { b: 6 },
  })
  check('a worm in pile B alone still triggers the Nexus', [onlyB.a.nexus, onlyB.b.nexus], [false, true])
  check('...so the turn has one', onlyB.nexus, true)
  check('...and pile A, which drew no worm, ate nothing', onlyB.a.devoured, [])

  // ── pile B sees what pile A placed, SET not added ──────────────────────────
  // x is harvested down to 4, pile A blows 8 on it, pile B's worm eats it. Had
  // the blow added rather than set, the worm would take 12 to the bank.
  const chain = resolveDoubleSpiceBlow({
    ...dbl,
    deck: [terr('x', 8, 3), worm, terr('y', 6, 5)],
    discardA: [],
    discardB: [terr('x', 8, 3)],
    spiceOnBoard: { x: 4 },
  })
  check('pile B sees pile A\'s blow as a replacement, not a top-up',
    chain.b.devoured[0].spiceRemoved, 8)
}

// ── the Fremen's additional worms are counted PER PILE ───────────────────────
// Each discard pile is treated as a separate spice blow, so each pile's FIRST
// worm resolves normally and only the ones after it are the Fremen's to place.
{
  const fremen = {
    forces: [at('a', 3), at('b', 5)],
    spiceOnBoard: { a: 8, b: 6 },
    storm: STORM_AWAY, firstTurn: false, rng, fremenInPlay: true,
    discardA: [terr('a', 8, 3)],
    discardB: [terr('b', 6, 5)],
  }

  // Three worms in pile A, two in pile B. The example that settled it.
  const split = resolveDoubleSpiceBlow({
    ...fremen,
    deck: [worm, worm, worm, terr('x', 8, 3), worm, worm, terr('y', 6, 5)],
  })
  check('pile A hands over the worms after its first', split.a.wormsForFremenToPlace, 2)
  check('pile B counts from ITS first worm, not the turn\'s', split.b.wormsForFremenToPlace, 1)
  check('five worms across the turn are THREE for the Fremen, not four',
    split.wormsForFremenToPlace, 3)
  check('each pile\'s first worm still devoured its own showing card',
    [split.a.devoured.map(d => d.territoryId), split.b.devoured.map(d => d.territoryId)],
    [['a'], ['b']])

  // Four in pile A, one in pile B. The lone worm in B is a FIRST worm — it
  // resolves normally, and the Fremen get nothing at all from that pile.
  const lopsided = resolveDoubleSpiceBlow({
    ...fremen,
    deck: [worm, worm, worm, worm, terr('x', 8, 3), worm, terr('y', 6, 5)],
  })
  check('a lone worm in pile B is a first worm, not an additional one',
    lopsided.b.wormsForFremenToPlace, 0)
  check('...so it devours instead of being handed over',
    lopsided.b.devoured.map(d => d.territoryId), ['b'])
  check('...and the turn still hands over three', lopsided.wormsForFremenToPlace, 3)

  // However the worms fall, with no Fremen seated the phase behaves as it did.
  const none = resolveDoubleSpiceBlow({
    ...fremen, fremenInPlay: false,
    deck: [worm, worm, worm, terr('x', 8, 3), worm, worm, terr('y', 6, 5)],
  })
  check('no Fremen seated, nothing to hand over', none.wormsForFremenToPlace, 0)
}

// ── turn one sets worms aside ACROSS BOTH PILES ──────────────────────────────
// A worm ignored while pile A resolves stays out of the deck while pile B
// resolves. Returned between the piles it could be drawn twice in one turn, and
// one physical worm would be counted as two ignored.
{
  // rng 0 makes the shuffle actually move things, so a worm returned early would
  // land on top of pile B's deck and be drawn again. Held, it cannot be.
  const rng0 = () => 0
  const one = resolveDoubleSpiceBlow({
    forces: [], spiceOnBoard: {}, storm: STORM_AWAY, firstTurn: true, rng: rng0,
    deck: [worm, terr('x', 8, 3), terr('y', 6, 5)],
    discardA: [], discardB: [],
  })
  check('the one worm in the deck is ignored exactly once', one.ignored, 1)
  check('...counted in the pile that drew it', [one.a.ignored, one.b.ignored], [1, 0])
  check('...and both piles still blow',
    [one.a.placed?.territoryId, one.b.placed?.territoryId], ['x', 'y'])
  check('the worm is back in the deck once the turn is over',
    one.deck.filter(c => c.kind === 'shai-hulud').length, 1)
  check('...and reached neither discard',
    [...one.discardA, ...one.discardB].filter(c => c.kind === 'shai-hulud').length, 0)
  check('turn one devours nothing, in either pile',
    [...one.a.devoured, ...one.b.devoured], [])

  // All six at once, split across the piles: still six, never more.
  const all = resolveDoubleSpiceBlow({
    forces: [], spiceOnBoard: {}, storm: STORM_AWAY, firstTurn: true, rng: rng0,
    deck: [worm, worm, worm, terr('x', 8, 3), worm, worm, worm, terr('y', 6, 5)],
    discardA: [], discardB: [],
  })
  check('six worms across two piles are six ignored, not more', all.ignored, SHAI_HULUD_COUNT)
  check('...all six back in the deck', all.deck.filter(c => c.kind === 'shai-hulud').length, SHAI_HULUD_COUNT)
  check('...and nothing was lost from it', all.deck.length, SHAI_HULUD_COUNT)
}

// Real ids, unlike the made-up ones above: placing a worm is validated against
// the board, because "the Fremen put a worm in Xanadu" is a bug and should read
// like one. Harg Pass, Wind Pass, The Minor Erg.
const HARG = 'territory-02' as TerritoryId
const WIND = 'territory-04' as TerritoryId
const ERG = 'territory-07' as TerritoryId

// ── the seam: the Fremen place their worms BEFORE pile B is revealed ─────────
// The ordering is not a formality. A worm placed from pile A can empty a
// territory that pile B is about to reveal, and the whole point of pausing is
// that the second reveal sees the consequences of the first.
{
  const board = {
    discardA: [terr('a', 8, 3)],
    discardB: [terr(HARG, 6, 5)],
    forces: [at('a', 3), at(HARG, 5)],
    spiceOnBoard: { a: 8, [HARG]: 6 },
    storm: STORM_AWAY, firstTurn: false, rng, fremenInPlay: true,
    // A: worm eats 'a', second worm is the Fremen's, then x lands.
    // B: worm eats whatever pile B shows, then y lands.
    deck: [worm, worm, terr('x', 8, 3), worm, terr('y', 6, 5)],
  }

  const stopped = beginDoubleSpiceBlow(board)
  check('the phase stops rather than running straight through', stopped.status, 'awaiting')
  if (!isAwaiting(stopped)) throw new Error('unreachable — the check above failed')

  check('it says who has to answer', stopped.from, ['fremen'])
  check('...and what it is asking for', stopped.ask, { kind: 'place-worms', pile: 'A', worms: 1 })

  // The load-bearing assertion: pile B has NOT been touched yet.
  check('pile B is still face down', stopped.carry.b, null)
  check('...and its cards are still in the deck', stopped.carry.deck.length, 2)

  // The continuation is data. If this ever stops being true the phase cannot be
  // stored between two clients, which is the whole reason it is shaped this way.
  //
  // Inspected directly rather than compared before and after JSON: 'check'
  // stringifies BOTH sides, so a round trip compared against its own source
  // drops the closure from the expected value too and passes no matter what is
  // in there. That version of this check was green with a function in the carry.
  const nonData = (v: unknown, path = 'carry'): string[] => {
    if (v === null) return []
    const t = typeof v
    if (t === 'function' || t === 'symbol' || t === 'bigint' || t === 'undefined') {
      return [path + ': ' + t]
    }
    if (t !== 'object') return []
    if (Array.isArray(v)) return v.flatMap((x, i) => nonData(x, path + '[' + i + ']'))
    if (Object.getPrototypeOf(v) !== Object.prototype) return [path + ': not a plain object']
    return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => nonData(x, path + '.' + k))
  }
  check('the continuation is plain data — nothing a database would lose',
    nonData(stopped.carry), [])

  // And it genuinely resumes from the stored copy, not just from the live one.
  const roundTripped = JSON.parse(JSON.stringify(stopped.carry))
  const viaMemory = runToSettled(
    placeFremenWorms(stopped.carry, [HARG], rng), c => placeFremenWorms(c, [], rng))
  const viaStorage = runToSettled(
    placeFremenWorms(roundTripped, [HARG], rng), c => placeFremenWorms(c, [], rng))
  check('resuming from the stored copy reaches the same outcome', viaStorage, viaMemory)

  // Place the worm on 'b' — the very territory pile B is showing.
  const done = runToSettled(
    placeFremenWorms(roundTripped, [HARG], rng),
    c => placeFremenWorms(c, [], rng))

  check('the Fremen worm ate where they put it',
    done.devouredByFremen.map(d => d.territoryId), [HARG])
  check('...taking the forces standing there',
    done.devouredByFremen[0].forcesKilled.length, 1)
  check('...and the spice with them', done.devouredByFremen[0].spiceRemoved, 6)

  // Proof of order: pile B's own worm then finds 'b' already stripped. Had pile
  // B been revealed first, it would have taken these forces itself.
  check('pile B revealed afterwards, so its worm found nothing left to eat',
    done.b.devoured[0].forcesKilled, [])
  check('...and no spice either', done.b.devoured[0].spiceRemoved, 0)
  check('the forces reach the tanks once, not twice', done.toTanks.length, 2)

  // Devoured spice leaves the board; the blow that follows puts its own down.
  check('the board is left with only what was blown onto it',
    done.spiceOnBoard, { x: 8, y: 6 })
}

// ── the same phase, driven by a caller with nobody to ask ────────────────────
{
  const board = {
    discardA: [terr('a', 8, 3)], discardB: [terr(HARG, 6, 5)],
    forces: [at('a', 3), at(HARG, 5)], spiceOnBoard: { a: 8, [HARG]: 6 },
    storm: STORM_AWAY, firstTurn: false, rng, fremenInPlay: true,
    deck: [worm, worm, terr('x', 8, 3), worm, terr('y', 6, 5)],
  }
  const declined = resolveDoubleSpiceBlow(board)
  check('declining every worm is legal — the rule says CAN, not must',
    declined.devouredByFremen, [])
  check('...and the offer is still reported', declined.wormsForFremenToPlace, 1)
  check('...so pile B keeps the forces the Fremen chose not to take',
    declined.b.devoured[0].forcesKilled.length, 1)
}

// ── the seam refuses what the rules cannot produce ───────────────────────────
{
  const board = {
    discardA: [terr('a', 8, 3)], discardB: [terr('b', 6, 5)],
    forces: [at('a', 3)], spiceOnBoard: { a: 8 },
    storm: STORM_AWAY, firstTurn: false, rng, fremenInPlay: true,
    deck: [worm, worm, terr('x', 8, 3), terr('y', 6, 5)],
  }
  const stopped = beginDoubleSpiceBlow(board)
  if (!isAwaiting(stopped)) throw new Error('expected a pause')

  check('placing more worms than were offered is refused',
    threw(() => placeFremenWorms(stopped.carry, [HARG, WIND], rng)), true)
  check('placing one in a territory that does not exist is refused',
    threw(() => placeFremenWorms(stopped.carry, ['nowhere' as TerritoryId], rng)), true)

  // A resume that hands back the pause it was given is a hang, not a failure,
  // unless something counts. This is that something.
  check('a resume function that never advances is caught, not looped forever',
    threw(() => runToSettled(stopped, c => awaitingAgain(c))), true)
}

// A deliberately broken resume, for the check above.
function awaitingAgain(carry: Parameters<typeof placeFremenWorms>[0]) {
  return {
    status: 'awaiting' as const, need: 'required' as const,
    from: ['fremen' as Force['faction']],
    ask: { kind: 'place-worms' as const, pile: 'A' as const, worms: 1 },
    carry,
  }
}

// ── a Fremen worm spares the Fremen, same as one off the deck ────────────────
{
  const board = {
    discardA: [terr('a', 8, 3)], discardB: [terr('b', 6, 5)],
    forces: [at('a', 3), at(ERG, 7, 'fremen', 4), at(ERG, 7, 'harkonnen', 3)],
    spiceOnBoard: { a: 8, [ERG]: 10 },
    storm: STORM_AWAY, firstTurn: false, rng, fremenInPlay: true,
    deck: [worm, worm, terr('x', 8, 3), terr('y', 6, 5)],
  }
  const stopped = beginDoubleSpiceBlow(board)
  if (!isAwaiting(stopped)) throw new Error('expected a pause')
  const done = runToSettled(
    placeFremenWorms(stopped.carry, [ERG], rng),
    c => placeFremenWorms(c, [], rng))

  check('their own worm eats the Harkonnen',
    done.devouredByFremen[0].forcesKilled.map(f => f.faction), ['harkonnen'])
  check('...and spares them', done.devouredByFremen[0].forcesSpared.map(f => f.faction), ['fremen'])
  check('...and clears the spice they were sitting on', done.spiceOnBoard[ERG], undefined)
}

// ── a blow into the storm puts nothing down ─────────────────────────────────
// The card is still turned, still discarded, still the one showing. Only the
// spice is refused — it would be swept the instant it landed.
{
  const UNDER = 'sector-3' as SectorId          // where terr('a', 8, 3) blows
  const blocked = resolveSpiceBlow({
    ...base, storm: UNDER,
    deck: [terr('a', 8, 3), terr('b', 6, 5)], discard: [],
  })
  check('nothing is placed', blocked.placed, null)
  check('...and the blow that was refused is reported',
    blocked.blockedByStorm, { territoryId: 'a', sector: UNDER, amount: 8 })
  check('the card is still discarded', blocked.discard.length, 1)
  check('...and is the one showing', (showing(blocked.discard) as { name: string }).name, 'a')
  check('the blow still ends there — the next card is not turned', blocked.deck.length, 1)

  // A worm that follows eats the territory, and finds forces but no spice.
  const eaten = resolveSpiceBlow({
    ...base, storm: UNDER,
    deck: [worm, terr('b', 6, 5)],
    discard: [terr('a', 8, 3)],
    forces: [at('a', 3)],
    spiceOnBoard: {},                            // because the blow put none down
  })
  check('a worm on a storm-refused territory still devours it',
    eaten.devoured.map(d => d.territoryId), ['a'])
  check('...taking the forces', eaten.devoured[0].forcesKilled.length, 1)
  check('...but there is no spice for it to take', eaten.devoured[0].spiceRemoved, 0)

  // Move the storm one sector over and the same draw places normally.
  const allowed = resolveSpiceBlow({
    ...base, storm: 'sector-4' as SectorId,
    deck: [terr('a', 8, 3), terr('b', 6, 5)], discard: [],
  })
  check('one sector away and the spice lands',
    allowed.placed, { territoryId: 'a', sector: UNDER, amount: 8 })
  check('...with nothing refused', allowed.blockedByStorm, null)

  // Either pile can blow into it, and the turn reports both.
  const both = resolveDoubleSpiceBlow({
    forces: [], spiceOnBoard: {}, storm: UNDER, firstTurn: false, rng,
    deck: [terr('x', 8, 3), terr('y', 6, 3)], discardA: [], discardB: [],
  })
  check('both piles refused', both.blockedByStorm.map(b => b.territoryId), ['x', 'y'])
  check('...so the board is left bare', both.spiceOnBoard, {})
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
