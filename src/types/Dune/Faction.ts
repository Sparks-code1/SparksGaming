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
 * Where a faction's on-planet forces begin.
 *
 * Discriminated because the three cases are genuinely different jobs for setup:
 * one places pieces, one asks the player a question, one does nothing. Collapsing
 * them into an optional territory plus an optional list would leave every reader
 * working out which combination means what.
 */
export type StartingPlacement =
  /** All of them in one named territory — Atreides in Arrakeen. */
  | { kind: 'fixed'; territoryId: TerritoryId }
  /**
   * The player distributes `onPlanet` freely across these, in whatever split
   * they choose. A SETUP CHOICE, not a fixed division: the Fremen's ten may go
   * ten-nil-nil or four-three-three.
   */
  | { kind: 'distribute'; among: readonly TerritoryId[] }
  /** Nothing on the board at setup. */
  | { kind: 'reserve-only' }

export interface StartingForces {
  /** Already on the board at setup. Zero for factions that start in reserve. */
  onPlanet: number
  /** How those forces get onto the board. */
  placement: StartingPlacement
  /** Off-board, available to ship. */
  reserves: number
  /**
   * Elite forces — the Emperor's Sardaukar, the Fremen's Fedaykin.
   *
   * Counted as a SUBSET of the totals above, not in addition to them: five
   * starred out of twenty reserves means twenty forces, of which five are elite.
   * Still worth confirming against the rulebook before setup deals pieces from
   * it, because the alternative reading is equally sayable in English.
   */
  starred: number
}

/**
 * Faction powers, keyed by the phase they apply in.
 *
 * All optional: most factions do not have one in every phase, and an absent key
 * says so more plainly than an empty string.
 */
export interface FactionAbilities {
  /** Applies before play begins — a prediction made at faction selection, or a
   *  placement that happens during setup rather than in a phase. */
  beforeGame?: string
  storm?: string
  spiceBlow?: string
  /** Shai-Hulud specifically, which is part of the spice blow but reads as its
   *  own rule for the factions that care about worms. */
  shaiHulud?: string
  charity?: string
  bidding?: string
  revival?: string
  shipment?: string
  movement?: string
  battle?: string
  spiceCollection?: string
  /** Powers over the traitor deck, which is dealt outside the phase sequence. */
  traitors?: string
  /** Powers over the treachery deck and hand limits, distinct from bidding. */
  treachery?: string
}

/**
 * Advanced-game rules.
 *
 * Extends the phase keys because some factions present theirs that way — the
 * Fremen have separate storm, spice blow and shipment entries — while others are
 * a single paragraph, which goes in `general`. Both shapes are the rulebook's,
 * not a choice made here.
 */
export interface AdvancedRules extends FactionAbilities {
  /** For factions whose advanced rules are one block of prose. */
  general?: string
  /** Rules about the forces themselves, such as what an elite force is worth. */
  forces?: string
  /** Bene Gesserit forces have two modes; each needs its own rules text. */
  advisors?: string
  fighters?: string
  /** Harkonnen keep or sell the leaders they defeat. */
  capturedLeaders?: string
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
  advanced: AdvancedRules
  /** Only some factions have one — the Fremen and the Guild. */
  specialVictory?: string
  leaders: Leader[]
}
