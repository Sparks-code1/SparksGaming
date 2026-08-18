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
 */
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { SectorId, TerritoryId } from '@/types/Dune/Game'
import type { Occupied } from './storm'

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
  /** Every force in the territory, in every sector of it. */
  forcesKilled: Occupied[]
  /** Spice removed, to the Spice Bank. */
  spiceRemoved: number
}

export interface SpiceBlowInput {
  deck: readonly SpiceCard[]
  discard: readonly SpiceCard[]
  forces: readonly Occupied[]
  /** Spice already lying on the board, by territory. */
  spiceOnBoard: Readonly<Record<string, number>>
  /** Turn 1 ignores worms and shuffles them back afterwards. */
  firstTurn: boolean
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
  /** Forces bound for the Tleilaxu Tanks, flattened for the caller. */
  toTanks: Occupied[]
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
  const setAside: SpiceCard[] = []
  let placed: SpiceBlowOutcome['placed'] = null

  // Ten turns, twenty-one cards: the deck cannot run dry in a standard game, so
  // an empty one means something upstream is wrong. Reshuffling the discard is an
  // advanced-game rule and is deliberately NOT done here — silently continuing
  // with no card would hide the bug and produce a turn where no spice appeared.
  while (true) {
    if (deck.length === 0) {
      throw new Error('spice deck exhausted — it cannot run dry in ten turns, so this is a bug, not a rule')
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

    const top = showing(discard)
    if (!top) {
      // Turn 1 is required to place a territory card, so by the time a worm can
      // devour anything there is always something showing. Nothing to eat means
      // the phase was entered in a state the rules cannot produce.
      throw new Error('Shai-Hulud drawn with an empty discard — turn 1 must place a territory card first')
    }
    // A worm showing is legal: the second of two is discarded immediately and
    // eats nothing. Only a territory can be devoured.
    if (top.kind === 'territory') {
      devoured.push({
        territoryId: top.territoryId,
        forcesKilled: input.forces.filter(f => f.territoryId === top.territoryId),
        spiceRemoved: input.spiceOnBoard[top.territoryId] ?? 0,
      })
    }
    // A worm with a worm showing eats nothing, and is still discarded.
    discard.push(card)
  }

  // Turn 1: the ignored worms go back into the deck, shuffled, once the phase
  // is over — not before, or one could be drawn again during the same phase.
  const finalDeck = setAside.length ? shuffle([...deck, ...setAside], input.rng) : deck

  return {
    deck: finalDeck,
    discard,
    placed,
    devoured,
    ignored: setAside.length,
    toTanks: devoured.flatMap(d => d.forcesKilled),
  }
}
