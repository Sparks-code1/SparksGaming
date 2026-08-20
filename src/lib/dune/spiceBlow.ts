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
import type { Force, GameMode, SectorId, TerritoryId } from '@/types/Dune/Game'

export type SpiceCard =
  | { kind: 'territory'; territoryId: TerritoryId; name: string; spice: number; sector: SectorId }
  | { kind: 'shai-hulud' }

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
  /** Where the blow landed. Null only if the deck ran out. */
  placed: { territoryId: TerritoryId; sector: SectorId; amount: number } | null
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
      placed = { territoryId: card.territoryId, sector: card.sector, amount: card.spice }
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
      const inTerritory = input.forces.filter(f => f.territoryId === top.territoryId)
      devoured.push({
        territoryId: top.territoryId,
        // Shai-Hulud does not devour the Fremen. Both games.
        forcesKilled: inTerritory.filter(f => f.faction !== 'fremen'),
        forcesSpared: inTerritory.filter(f => f.faction === 'fremen'),
        spiceRemoved: input.spiceOnBoard[top.territoryId] ?? 0,
      })
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
 * does the work, and the only things crossing between them are the deck, the
 * Nexus and turn one's set-aside worms.
 */
export interface DoubleBlowOutcome {
  deck: SpiceCard[]
  discardA: SpiceCard[]
  discardB: SpiceCard[]
  a: SpiceBlowOutcome
  b: SpiceBlowOutcome
  /** At most one per turn, whichever pile produced the first worm. */
  nexus: boolean
  /** Worms set aside across the whole turn — never more than the six that exist,
   *  because a worm held out of pile A cannot be drawn again by pile B. */
  ignored: number
  /**
   * Worms for the Fremen to place, summed across both piles.
   *
   * Counted PER PILE, not per turn, because each discard pile is treated as a
   * separate spice blow: each pile's first worm resolves normally and only the
   * ones after it are the Fremen's. Five worms split three and two across the
   * piles hand over THREE — not the four a per-turn reading gives.
   */
  wormsForFremenToPlace: number
  /** Both piles' devoured forces, for the tanks. */
  toTanks: Force[]
}

export function resolveDoubleSpiceBlow(input: {
  deck: readonly SpiceCard[]
  discardA: readonly SpiceCard[]
  discardB: readonly SpiceCard[]
  forces: readonly Force[]
  spiceOnBoard: Readonly<Record<string, number>>
  firstTurn: boolean
  fremenInPlay?: boolean
  rng: () => number
}): DoubleBlowOutcome {
  const a = resolveSpiceBlow({
    ...input, mode: 'advanced', discard: input.discardA, deferSetAside: true,
  })

  // Pile B draws from what pile A left, sees the spice pile A placed, and knows
  // whether the Nexus has already fired. It does NOT see pile A's ignored worms:
  // those are held out until the turn is over, which is what "across both piles"
  // means. A worm ignored once is ignored once.
  const b = resolveSpiceBlow({
    ...input,
    mode: 'advanced',
    deck: a.deck,
    discard: input.discardB,
    deferSetAside: true,
    spiceOnBoard: applySpicePlacement(input.spiceOnBoard, a.placed),
    forces: input.forces.filter(f => !a.toTanks.includes(f)),
    nexusAlreadyTriggered: a.nexus,
  })

  const held = [...a.setAside, ...b.setAside]
  return {
    deck: held.length ? shuffle([...b.deck, ...held], input.rng) : b.deck,
    discardA: a.discard,
    discardB: b.discard,
    a, b,
    nexus: a.nexus || b.nexus,
    ignored: a.ignored + b.ignored,
    wormsForFremenToPlace: a.wormsForFremenToPlace + b.wormsForFremenToPlace,
    toTanks: [...a.toTanks, ...b.toTanks],
  }
}
