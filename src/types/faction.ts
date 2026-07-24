/** The 5 Risk Legacy starter factions + unlockable factions */
export type FactionId =
  | 'enclave-of-the-bear'
  | 'imperial-balkania'
  | 'khan-industries'
  | 'saharan-republic'
  | 'die-mechaniker'
  | 'aliens'
  | 'mutants'

export interface FactionPower {
  id: string
  name: string
  description: string
  /** Some powers are unlocked by winning a game; null means available from game 1 */
  unlockedAfterGame: number | null
}

export interface Faction {
  id: FactionId
  name: string
  color: string       // hex color for map rendering
  /** Starting power chosen at campaign start */
  startingPower: FactionPower
  /** Additional powers unlocked over the campaign */
  unlockedPowers: FactionPower[]
  /** Territories where this faction has placed HQ stickers */
  headquarterTerritoryIds: string[]
  /** Whether this faction has been eliminated from the campaign permanently */
  retired: boolean
}
