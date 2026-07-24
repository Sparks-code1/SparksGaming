export type ContinentId =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'africa'
  | 'asia'
  | 'australia'
  | 'alien-island'  // special single-territory "continent" — never awards a bonus

export type ScarType =
  | 'nuclear-fallout'    // +1 loss both sides per battle here
  | 'fortified'          // +1 to defender's highest die (Bunker)
  | 'fortification'      // +1 to defender's highest AND lowest die (Fortification ring)
  | 'rich-land'          // +1 troop to pool during draft if controlled (legacy, no longer dealt)
  | 'wasteland'          // attacker capped at 2 dice
  | 'biological'         // owner loses 1 troop here at start of their turn (legacy, no longer dealt)
  | 'mercenary'          // +1 troop auto-placed on this territory during owner's draft

export interface Scar {
  type: ScarType
  appliedInGame: number  // campaign game number when applied
  attackCount?: number   // times attacked (fortification scar removed at 10)
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
