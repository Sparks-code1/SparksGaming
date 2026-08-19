/**
 * What a Dune faction is.
 *
 * The shape the six factions are filled in against. Rules text is kept verbatim
 * as description strings — this file decides the fields, not the wording.
 */
import type { TerritoryId } from './Game'

export type FactionId =
  | 'atreides'
  | 'emperor'
  | 'spacing-guild'
  | 'fremen'
  | 'harkonnen'
  | 'bene-gesserit'

export interface Leader {
  name: string
  /** Battle strength. A number, so it can be added to a battle plan. */
  strength: number
}

/**
 * Where a faction's forces begin.
 *
 * Split into a count and a place, rather than the prose "10 forces in Arrakeen",
 * so setup can act on it without parsing a sentence.
 */
export interface StartingForces {
  /** Already on the board at setup. Zero for factions that start in reserve. */
  onPlanet: number
  /** Where those forces stand. Null when `onPlanet` is 0. */
  territoryId: TerritoryId | null
  /** Off-board, available to ship. */
  reserves: number
  /**
   * Elite forces — the Emperor's five Sardaukar, the Fremen's Fedaykin.
   *
   * Counted as a SUBSET of the totals above, not in addition to them: five
   * starred out of twenty reserves means twenty forces, of which five are elite.
   * Worth confirming against the rulebook before setup is built on it, because
   * the alternative reading (twenty plus five) is equally sayable in English and
   * would leave every faction with the wrong number of pieces.
   */
  starred: number
}

/**
 * Faction powers, keyed by the phase they apply in.
 *
 * All optional: most factions do not have one in every phase, and an absent key
 * says so more plainly than an empty string. Add a phase key when a faction
 * needs it rather than declaring all nine up front.
 */
export interface FactionAbilities {
  storm?: string
  spiceBlow?: string
  charity?: string
  bidding?: string
  revival?: string
  shipment?: string
  movement?: string
  battle?: string
  spiceCollection?: string
}

export interface Faction {
  id: FactionId
  /** As shown to players. */
  name: string
  /** Spice held at setup. Hidden from other players once the game starts. */
  startingSpice: number
  forces: StartingForces
  /** Forces revived free each Revival phase, before paying for more. */
  freeRevivals: number
  abilities: FactionAbilities
  /** What this faction can do for an ally. */
  alliance: string
  /**
   * Advanced-game rules. One string because the rulebook presents it as a
   * paragraph; if the advanced game is implemented these will want breaking
   * apart, and that is the moment to do it rather than now.
   */
  advanced: string
  leaders: Leader[]
}
