export type ContinentId =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'africa'
  | 'asia'
  | 'australia'
  | 'alien-island'  // special single-territory "continent" — never awards a bonus

export type ScarType =
  | 'nuclear-fallout'    // +1 loss to BOTH sides on every combat round fought here
  | 'bunker'          // +1 to defender's highest die (Bunker)
  | 'fortification'      // +1 to defender's highest AND lowest die; one charge
                         //   spent per combat round, destroyed at 10
  | 'wasteland'          // −1 to defender's highest die (Ammo Shortage)
  | 'biological'         // owner loses 1 troop here at the END of their turn;
                         //   Mutants gain 1 instead (legacy, no longer dealt)
  | 'mercenary'          // +1 troop here at the END of the owner's turn (+2 with
                         //   the Mercenary comeback power); Mutants lose 1 instead

export interface Scar {
  type: ScarType
  appliedInGame: number  // campaign game number when applied
  attackCount?: number   // combat ROUNDS fought against it (fortification destroyed at 10)
}

export interface City {
  id: string
  name: string
  territoryId: string
  isDestroyed: boolean
  destroyedInGame?: number
  /** Headquarters sticker placed by a faction */
  headquartersFactionId?: string
  /** Major city gives +2 draft troops; minor gives +1 */
  isMajor?: boolean
  /** Player id who founded this city (for Join the War eligibility) */
  foundedByPlayerId?: string
}

export interface Territory {
  id: string
  name: string
  continentId: ContinentId
  /** SVG path or polygon points for PixiJS rendering */
  shape: string
  /** Center point for troop count label */
  labelX: number
  labelY: number
  /** Adjacency list — which territory ids share a border or sea lane */
  adjacentIds: string[]

  // runtime state
  occupyingPlayerId: string | null
  troops: number
  scars: Scar[]
  cities: City[]
  /** Sticker id applied to this territory (legacy unlock) */
  stickerId?: string
  /** Current-game HQ: which player has their HQ token here */
  activeHqPlayerId?: string
  /** Permanent mark: an HQ was destroyed here in a previous game */
  destroyedHqMarked?: boolean
}
