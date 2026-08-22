/**
 * The spice blow: phase 2 of a Dune turn.
 *
 * Pure and RNG-injected, like the storm. Deck order arrives already decided —
 * the server shuffles, everyone else receives — because a deck each client
 * shuffled for itself is not the same deck.
 *
 * Two things here differ from the storm and are easy to get backwards:
 *
 *   The worm devours a TERRITORY, not a sector. The storm kills only in the
 *   sectors it sweeps; Shai-Hulud takes everything in the territory showing,
 *   every sector of it.
 *
 *   Rock is no shelter. The storm spares forces on rock and in strongholds;
 *   the worm does not care what they are standing on.
 *
 * The Fremen are the exception to both: Shai-Hulud does not devour them. That is
 * an ordinary ability rather than an advanced one — it sits under `abilities` in
 * the faction data, not under `advanced` — so it holds in both games.
 */
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type {
  Force, GameMode, SectorId, SpiceCard, SpiceDeckPublic, TerritoryId,
} from '@/types/Dune/Game'
import { awaiting, runToSettled, settled } from './phase'
import type { Step } from './phase'

// The card type lives in @/types/Dune/Game now, because the public game state
// names it too. Re-exported so every `from '@/lib/dune/spiceBlow'` still works.
export type { SpiceCard } from '@/types/Dune/Game'

/** Six worms in the deck, matching the six cards the generator prints. */
export const SHAI_HULUD_COUNT = 6

/** The deck as printed: one card per spice blow, plus the worms. Unshuffled —
 *  ordering is the caller's business, and the caller has the RNG. */
export function buildSpiceDeck(): SpiceCard[] {
  // flatMap rather than filter+map: a filter does not narrow the mapped value,
  // so spiceBlow stays 'number | null' downstream and the card type will not take
  // it. Checking inside the callback narrows it where it is actually used.
  const territories: SpiceCard[] = DUNE_TERRITORIES.flatMap(t =>
    t.spiceBlow != null && t.spiceSector != null
      ? [{
          kind: 'territory' as const,
          territoryId: t.id as TerritoryId,
          name: t.displayName,
          spice: t.spiceBlow,
          sector: t.spiceSector as SectorId,
        }]
      : [])
  return [...territories, ...Array.from({ length: SHAI_HULUD_COUNT }, (): SpiceCard => ({ kind: 'shai-hulud' }))]
}

/** Fisher-Yates against an injected 0..1 source. Never Math.random. */
export function shuffle<T>(cards: readonly T[], rng: () => number): T[] {
  const out = [...cards]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The card showing on the discard pile — the most recently discarded, whatever
 * it is.
 *
 * A worm discarded on top IS what is showing, which is why a second consecutive
 * worm finds no territory to devour. See the note on that below.
 */
export function showing(discard: readonly SpiceCard[]): SpiceCard | null {
  return discard.length ? discard[discard.length - 1] : null
}

/**
 * What the shared row is told about the deck.
 *
 * ONE PLACE. The count has to be published because clients cannot read
 * match_decks, and a number copied into the row by hand at each of the several
 * places the deck changes is a number that will eventually be copied wrong —
 * usually as `deck.length` from before a draw rather than after it.
 *
 * The deck goes IN and does not come out. That is the whole point: this is the
 * boundary between what the server knows and what the table sees.
 */
export function publicSpiceDeck(input: {
  deck: readonly SpiceCard[]
  discardA: readonly SpiceCard[]
  discardB?: readonly SpiceCard[]
}): SpiceDeckPublic {
  return {
    remaining: input.deck.length,
    discardA: [...input.discardA],
    discardB: [...(input.discardB ?? [])],
  }
}

export interface Devoured {
  territoryId: TerritoryId
  /** Every force in the territory, in every sector of it — Fremen excepted. */
  forcesKilled: Force[]
  /** Fremen stacks the worm passed over. Recorded rather than dropped, because
   *  "the worm came and they lived" is a thing the table should see. */
  forcesSpared: Force[]
  /** Spice removed, to the Spice Bank. */
  spiceRemoved: number
}

/**
 * What a worm does to a territory.
 *
 * Pulled out of the reveal loop because a worm the Fremen place by hand has to
 * eat by exactly the same rule as one that came off the deck — including
 * sparing the Fremen. Two copies of this would drift, and the copy that drifted
 * would be the one nobody was looking at.
 */
export function devourTerritory(
  territoryId: TerritoryId,
  forces: readonly Force[],
  spiceOnBoard: Readonly<Record<string, number>>,
): Devoured {
  const inTerritory = forces.filter(f => f.territoryId === territoryId)
  return {
    territoryId,
    // Shai-Hulud does not devour the Fremen. Both games.
    forcesKilled: inTerritory.filter(f => f.faction !== 'fremen'),
    forcesSpared: inTerritory.filter(f => f.faction === 'fremen'),
    spiceRemoved: spiceOnBoard[territoryId] ?? 0,
  }
}

export interface SpiceBlowInput {
  deck: readonly SpiceCard[]
  discard: readonly SpiceCard[]
  forces: readonly Force[]
  mode: GameMode
  /** Whether the Fremen are in this game at all. Their worm rules are theirs
   *  alone, so with no Fremen seated the phase behaves as it always did. */
  fremenInPlay?: boolean
  /** Spice already lying on the board, by territory. */
  spiceOnBoard: Readonly<Record<string, number>>
  /**
   * Where the storm is sitting.
   *
   * A blow into the sector the storm occupies puts NO spice down — it would be
   * swept the instant it landed. The card is still turned, still discarded, and
   * still the one showing, so a worm that follows devours that territory and
   * takes the forces standing in it; there is simply no spice for it to take.
   *
   * Required rather than defaulted: the storm is always somewhere, and a phase
   * that resolved without knowing where would place spice the board should have
   * refused, silently and only sometimes.
   */
  storm: SectorId
  /** Turn 1 ignores worms and shuffles them back afterwards. In the advanced
   *  game this applies ACROSS both piles: a worm set aside resolving pile A is
   *  still set aside, not redrawn, when pile B is resolved. */
  firstTurn: boolean
  /**
   * Whether a Nexus has already fired this turn.
   *
   * At most one Nexus happens per turn, triggered by the FIRST worm in either
   * pile. A worm in the second pile still devours — it simply triggers nothing.
   * Passed in rather than inferred because only the caller resolving both piles
   * knows what the first one did.
   */
  nexusAlreadyTriggered?: boolean
  /**
   * Hold turn one's set-aside worms instead of shuffling them back.
   *
   * The advanced game's two piles are one TURN, so a worm ignored while pile A
   * resolves has to stay out of the deck while pile B resolves. Shuffling it back
   * between the piles lets the same physical worm be drawn twice in one turn and
   * counted twice as ignored — six worms could then report as more than six. The
   * caller holding both piles returns them once, at the end.
   */
  deferSetAside?: boolean
  rng: () => number
}

export interface SpiceBlowOutcome {
  deck: SpiceCard[]
  discard: SpiceCard[]
  /** Where the blow landed, or null when nothing was placed — which now means
   *  the storm was sitting on it. See `blockedByStorm`. */
  placed: { territoryId: TerritoryId; sector: SectorId; amount: number } | null
  /**
   * The blow the storm refused, if it refused one.
   *
   * Reported rather than swallowed: "no spice appeared this turn" and "the blow
   * fell under the storm" look identical on the board and are entirely different
   * to a player deciding where to ship.
   */
  blockedByStorm: { territoryId: TerritoryId; sector: SectorId; amount: number } | null
  /** One entry per worm that actually ate something, in the order they came. */
  devoured: Devoured[]
  /** Worms drawn and set aside on turn 1, shuffled back in at the end. */
  ignored: number
  /** The set-aside worms themselves. Already back in `deck` unless
   *  `deferSetAside` was set, in which case they are the caller's to return. */
  setAside: SpiceCard[]
  /** True when a worm appeared here AND no Nexus had fired yet this turn. */
  nexus: boolean
  /** True when an exhausted deck was rebuilt from the discards mid-phase.
   *  Advanced only; in the basic game exhaustion is refused instead. */
  reshuffled: boolean
  /** Forces bound for the Tleilaxu Tanks, flattened for the caller. */
  toTanks: Force[]
  /**
   * Worms the Fremen may place where they like, in the advanced game.
   *
   * Surfaced as a COUNT rather than resolved, because it is a player decision
   * and this function decides nothing a player is entitled to decide.
   *
   * THIS PILE'S count. The first worm of a blow behaves normally and only the
   * additional ones are theirs, and a discard pile is one blow — so in the
   * advanced game each pile's first worm resolves normally, not just the turn's.
   */
  wormsForFremenToPlace: number
}

/**
 * Apply a blow to the spice already lying on the board.
 *
 * A blow SETS the territory to the card's printed value; it does not add to it.
 * A territory harvested down from twelve to four goes back to twelve, not to
 * sixteen. Written here rather than left to each caller, because "+= amount" is
 * the natural thing to write and it is wrong — the dev view had exactly that bug.
 */
export function applySpicePlacement(
  spiceOnBoard: Readonly<Record<string, number>>,
  placed: SpiceBlowOutcome['placed'],
): Record<string, number> {
  if (!placed) return { ...spiceOnBoard }
  return { ...spiceOnBoard, [placed.territoryId]: placed.amount }
}

/**
 * Apply a whole blow to the board: what the worms ate, then what was placed.
 *
 * The order is the rule. A worm eats what is showing, and only afterwards does
 * the territory card that ends the blow put spice down — so a territory devoured
 * and then blown ends up holding the new amount, not nothing. Doing it the other
 * way round loses the blow.
 *
 * Callers reached for `applySpicePlacement` alone and quietly kept spice on
 * territories a worm had just cleared, which looks like nothing at all until a
 * player collects from a territory that should be bare.
 */
export function applyBlowToBoard(
  spiceOnBoard: Readonly<Record<string, number>>,
  out: SpiceBlowOutcome,
): Record<string, number> {
  const next = { ...spiceOnBoard }
  for (const d of out.devoured) delete next[d.territoryId]
  return applySpicePlacement(next, out.placed)
}

/**
 * Turn cards until a territory appears, resolving worms on the way.
 *
 * Order within a worm matters: it devours what is showing BEFORE it is itself
 * discarded, which is what the card text means by "now showing".
 */
export function resolveSpiceBlow(input: SpiceBlowInput): SpiceBlowOutcome {
  const deck = [...input.deck]
  const discard = [...input.discard]
  const devoured: Devoured[] = []
  let wormsSeen = 0
  let wormsToPlace = 0
  let nexus = false
  let reshuffled = false
  let blockedByStorm: SpiceBlowOutcome['blockedByStorm'] = null
  const setAside: SpiceCard[] = []
  let placed: SpiceBlowOutcome['placed'] = null

  // Exhaustion means different things in the two games.
  //
  // Basic: one territory card a turn over ten turns needs ten, and the deck
  // holds fifteen. It cannot run dry, so an empty one is a bug and is refused.
  //
  // Advanced: TWO territory cards a turn needs twenty, and there are fifteen.
  // The deck runs dry around turn seven by arithmetic, so a reshuffle is a rule
  // rather than a rescue.
  while (true) {
    if (deck.length === 0) {
      if (input.mode !== 'advanced') {
        throw new Error('spice deck exhausted — it cannot run dry in ten turns of the basic game, so this is a bug, not a rule')
      }
      // The top of each pile stays where it is: it is the card SHOWING, and the
      // next worm devours whatever it names. Only the cards beneath it return to
      // the deck.
      const buried = discard.slice(0, -1)
      if (buried.length === 0) {
        throw new Error('spice deck exhausted with nothing buried to reshuffle')
      }
      deck.push(...shuffle(buried, input.rng))
      discard.splice(0, discard.length - 1)
      reshuffled = true
    }
    const card = deck.shift() as SpiceCard

    if (card.kind === 'territory') {
      const landing = { territoryId: card.territoryId, sector: card.sector, amount: card.spice }
      // The storm is standing on it, so nothing is put down. The card still
      // discards and still shows — this ends the blow either way.
      if (card.sector === input.storm) blockedByStorm = landing
      else placed = landing
      discard.push(card)
      break
    }

    // ── Shai-Hulud ───────────────────────────────────────────────────────────
    if (input.firstTurn) {
      // Turn 1 ignores worms entirely: set aside now, shuffled back after.
      setAside.push(card)
      continue
    }

    wormsSeen++
    // The first worm of the TURN triggers the Nexus, whichever pile it lands in.
    if (!input.nexusAlreadyTriggered && !nexus) nexus = true
    const top = showing(discard)
    if (!top) {
      // Turn 1 is required to place a territory card, so by the time a worm can
      // devour anything there is always something showing. Nothing to eat means
      // the phase was entered in a state the rules cannot produce.
      throw new Error('Shai-Hulud drawn with an empty discard — turn 1 must place a territory card first')
    }
    // A worm showing is legal: the second of two is discarded immediately and
    // eats nothing. Only a territory can be devoured.
    //
    // Advanced game: after the first worm of a blow, the Fremen place the rest
    // themselves. Counted here and handed back unresolved.
    //
    // 'wormsSeen' is per CALL, which is per PILE, and that is the ruling: each
    // discard pile is a separate spice blow, so each pile's first worm resolves
    // normally. Counting from the turn instead would hand the Fremen pile B's
    // first worm as well — one more worm every turn both piles blow one.
    const fremenPlacesIt =
      input.mode === 'advanced' && input.fremenInPlay && wormsSeen > 1
    if (fremenPlacesIt) {
      wormsToPlace++
      discard.push(card)
      continue
    }

    if (top.kind === 'territory') {
      devoured.push(devourTerritory(top.territoryId, input.forces, input.spiceOnBoard))
    }
    // A worm with a worm showing eats nothing, and is still discarded.
    discard.push(card)
  }

  // Turn 1: the ignored worms go back into the deck, shuffled, once the phase
  // is over — not before, or one could be drawn again during the same phase.
  // With two piles "the phase" is both of them, so the caller may hold them.
  const finalDeck = setAside.length && !input.deferSetAside
    ? shuffle([...deck, ...setAside], input.rng)
    : deck

  return {
    deck: finalDeck,
    discard,
    placed,
    devoured,
    ignored: setAside.length,
    setAside,
    blockedByStorm,
    nexus,
    reshuffled,
    toTanks: devoured.flatMap(d => d.forcesKilled),
    wormsForFremenToPlace: wormsToPlace,
  }
}


/**
 * The advanced game's double blow: two reveals, two discard piles, ONE deck.
 *
 * Each pile is resolved independently by the same rules, which is why this is a
 * wrapper rather than a second implementation — the single-pile function already
 * does the work.
 *
 * It cannot be one straight-through call, though, because the Fremen place their
 * worms AS THEY COME UP: pile A is revealed, the Fremen put down whatever it
 * handed back, and only then is pile B turned over. A worm placed from pile A can
 * devour a territory that pile B is about to blow spice onto, so the order is not
 * a formality. That gap is the seam, and it is built with the general pattern in
 * ./phase.ts rather than a private one, because bidding and battles pause the
 * same way and should not each invent it.
 */
export interface DoubleBlowInput {
  deck: readonly SpiceCard[]
  discardA: readonly SpiceCard[]
  discardB: readonly SpiceCard[]
  forces: readonly Force[]
  spiceOnBoard: Readonly<Record<string, number>>
  /** Where the storm sits. Either pile can blow into it. */
  storm: SectorId
  firstTurn: boolean
  fremenInPlay?: boolean
  rng: () => number
}

export interface DoubleBlowOutcome {
  deck: SpiceCard[]
  discardA: SpiceCard[]
  discardB: SpiceCard[]
  a: SpiceBlowOutcome
  b: SpiceBlowOutcome
  /** At most one per turn, whichever pile produced the first worm. */
  nexus: boolean
  /** True when an exhausted deck was rebuilt mid-turn, in either pile. */
  reshuffled: boolean
  /** Blows the storm refused, from either pile. Usually empty. */
  blockedByStorm: NonNullable<SpiceBlowOutcome['blockedByStorm']>[]
  /** Worms set aside across the whole turn — never more than the six that exist,
   *  because a worm held out of pile A cannot be drawn again by pile B. */
  ignored: number
  /**
   * Worms offered to the Fremen, summed across both piles.
   *
   * Counted PER PILE, not per turn, because each discard pile is treated as a
   * separate spice blow: each pile's first worm resolves normally and only the
   * ones after it are the Fremen's. Five worms split three and two across the
   * piles hand over THREE — not the four a per-turn reading gives.
   *
   * This is what was OFFERED. What they actually put down is `devouredByFremen`,
   * which may be shorter: the rule says the worms "can be placed", not must.
   */
  wormsForFremenToPlace: number
  /** What the Fremen's own worms ate, in the order they were placed. */
  devouredByFremen: Devoured[]
  /**
   * The board's spice after both blows and any Fremen worms.
   *
   * Returned rather than left to the caller because getting here by hand means
   * applying two placements and any number of devours in the right order, and
   * the first thing anyone writes for the placements is `+=`, which is wrong.
   */
  spiceOnBoard: Record<string, number>
  /** Both piles' devoured forces plus the Fremen's, for the tanks. */
  toTanks: Force[]
}

/** What the phase stops to ask for. Public — it says what is needed, never what
 *  anyone chose. */
export interface SpiceBlowAsk {
  kind: 'place-worms'
  /** The pile that handed them back. Its worms go down before the next reveal. */
  pile: 'A' | 'B'
  /** How many are on offer. Placing fewer is legal; the rule says "can". */
  worms: number
}

/** The continuation: plain data, so it survives a round trip to the database. */
export interface SpiceBlowCarry {
  /** Which pile has just been resolved. */
  pile: 'A' | 'B'
  deck: SpiceCard[]
  discardA: SpiceCard[]
  discardB: SpiceCard[]
  forces: Force[]
  spiceOnBoard: Record<string, number>
  firstTurn: boolean
  fremenInPlay: boolean
  storm: SectorId
  a: SpiceBlowOutcome
  b: SpiceBlowOutcome | null
  devouredByFremen: Devoured[]
}

export type SpiceBlowStep = Step<SpiceBlowAsk, SpiceBlowCarry, DoubleBlowOutcome>

/** How many worms the Fremen are still owed at this pause. Derived rather than
 *  stored, so it cannot disagree with the pile it came from. */
function owed(carry: SpiceBlowCarry): number {
  const from = carry.pile === 'A' ? carry.a : carry.b
  return from?.wormsForFremenToPlace ?? 0
}

/** Pause if this pile handed worms back, otherwise carry straight on. */
function pauseOrContinue(carry: SpiceBlowCarry, rng: () => number): SpiceBlowStep {
  if (carry.fremenInPlay && owed(carry) > 0) {
    return awaiting(['fremen'], { kind: 'place-worms', pile: carry.pile, worms: owed(carry) }, carry)
  }
  return carry.pile === 'A' ? revealPileB(carry, rng) : finish(carry, rng)
}

/**
 * Turn pile B over.
 *
 * It draws from what pile A left, sees the spice pile A placed and any worm the
 * Fremen have since put down, and knows whether the Nexus has already fired. It
 * does NOT see pile A's ignored worms: those are held out until the turn is
 * over, which is what "turn one's set-aside applies across both piles" means. A
 * worm ignored once is ignored once.
 */
function revealPileB(carry: SpiceBlowCarry, rng: () => number): SpiceBlowStep {
  const b = resolveSpiceBlow({
    deck: carry.deck,
    discard: carry.discardB,
    forces: carry.forces,
    mode: 'advanced',
    fremenInPlay: carry.fremenInPlay,
    spiceOnBoard: carry.spiceOnBoard,
    storm: carry.storm,
    firstTurn: carry.firstTurn,
    nexusAlreadyTriggered: carry.a.nexus,
    deferSetAside: true,
    rng,
  })
  return pauseOrContinue({
    ...carry,
    pile: 'B',
    b,
    deck: b.deck,
    discardB: b.discard,
    forces: carry.forces.filter(f => !b.toTanks.includes(f)),
    spiceOnBoard: applyBlowToBoard(carry.spiceOnBoard, b),
  }, rng)
}

/** Both piles are done: return the held worms to the deck and report. */
function finish(carry: SpiceBlowCarry, rng: () => number): SpiceBlowStep {
  const { a, b } = carry
  if (!b) throw new Error('the spice blow finished without ever revealing pile B')
  const held = [...a.setAside, ...b.setAside]
  return settled({
    deck: held.length ? shuffle([...carry.deck, ...held], rng) : carry.deck,
    discardA: carry.discardA,
    discardB: carry.discardB,
    a, b,
    nexus: a.nexus || b.nexus,
    reshuffled: a.reshuffled || b.reshuffled,
    blockedByStorm: [a.blockedByStorm, b.blockedByStorm].filter(x => x != null),
    ignored: a.ignored + b.ignored,
    wormsForFremenToPlace: a.wormsForFremenToPlace + b.wormsForFremenToPlace,
    devouredByFremen: carry.devouredByFremen,
    spiceOnBoard: carry.spiceOnBoard,
    toTanks: [
      ...a.toTanks,
      ...b.toTanks,
      ...carry.devouredByFremen.flatMap(d => d.forcesKilled),
    ],
  })
}

/**
 * Reveal pile A, and stop if the Fremen have worms to place.
 *
 * Returns a step, not an outcome: the caller loops, answering each pause, until
 * it settles. `resolveDoubleSpiceBlow` below is that loop for callers with
 * nobody to ask.
 */
export function beginDoubleSpiceBlow(input: DoubleBlowInput): SpiceBlowStep {
  const a = resolveSpiceBlow({
    deck: input.deck,
    discard: input.discardA,
    forces: input.forces,
    mode: 'advanced',
    fremenInPlay: input.fremenInPlay,
    spiceOnBoard: input.spiceOnBoard,
    storm: input.storm,
    firstTurn: input.firstTurn,
    deferSetAside: true,
    rng: input.rng,
  })
  return pauseOrContinue({
    pile: 'A',
    deck: a.deck,
    discardA: a.discard,
    discardB: [...input.discardB],
    forces: input.forces.filter(f => !a.toTanks.includes(f)),
    spiceOnBoard: applyBlowToBoard(input.spiceOnBoard, a),
    firstTurn: input.firstTurn,
    fremenInPlay: input.fremenInPlay ?? false,
    storm: input.storm,
    a,
    b: null,
    devouredByFremen: [],
  }, input.rng)
}

/**
 * The Fremen answer: put their worms down, then the phase carries on.
 *
 * A placed worm devours by the same rule as one off the deck — every force in
 * the territory except theirs, and the spice with it. Placing fewer than were
 * offered is legal, and an empty list is how a caller declines.
 */
export function placeFremenWorms(
  carry: SpiceBlowCarry,
  at: readonly TerritoryId[],
  rng: () => number,
): SpiceBlowStep {
  if (at.length > owed(carry)) {
    throw new Error(
      `the Fremen were offered ${owed(carry)} worm(s) from pile ${carry.pile} `
      + `but tried to place ${at.length}`,
    )
  }
  for (const id of at) {
    if (!DUNE_TERRITORIES.some(t => t.id === id)) {
      throw new Error(`no such territory to place a worm in: ${id}`)
    }
  }

  const devoured = at.map(id => devourTerritory(id, carry.forces, carry.spiceOnBoard))
  const killed = devoured.flatMap(d => d.forcesKilled)
  const spiceOnBoard = { ...carry.spiceOnBoard }
  for (const d of devoured) delete spiceOnBoard[d.territoryId]

  const next: SpiceBlowCarry = {
    ...carry,
    forces: carry.forces.filter(f => !killed.includes(f)),
    spiceOnBoard,
    devouredByFremen: [...carry.devouredByFremen, ...devoured],
  }
  // Past the pause now, so go on rather than offering the same worms again.
  return next.pile === 'A' ? revealPileB(next, rng) : finish(next, rng)
}

/**
 * Both piles, with every Fremen worm declined.
 *
 * The whole-turn shortcut for callers with nobody to ask: a test, a replay, a
 * game with no Fremen seated. Worms are still counted and reported in
 * `wormsForFremenToPlace`; none are put down, which is a legal outcome because
 * the rule says they CAN be placed. A game with a Fremen player at the table
 * must use `beginDoubleSpiceBlow` and answer the pauses, or it silently plays
 * their turn for them.
 */
export function resolveDoubleSpiceBlow(input: DoubleBlowInput): DoubleBlowOutcome {
  return runToSettled(
    beginDoubleSpiceBlow(input),
    carry => placeFremenWorms(carry, [], input.rng),
  )
}
