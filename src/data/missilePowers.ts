/**
 * Missile Powers (brown slot) — unlocked by the Nuclear Milestone.
 * Activated in-game by discarding a missile. A faction earns a pick each time
 * it gains a red star token during a game (starting tokens do not count).
 */
export interface MissilePower {
  id: string
  name: string
  description: string
}

/** Brown accent color used for missile power UI */
export const MISSILE_POWER_COLOR = '#a06a2a'

export const MISSILE_POWERS: MissilePower[] = [
  {
    id: 'mp-stealthy',
    name: 'Stealthy',
    description: 'You may place some or all of your recruited troops into one unmarked, unoccupied territory. This is not an expansion.',
  },
  {
    id: 'mp-convincing',
    name: 'Convincing',
    description: 'You gain one extra troop in Mercenary territories.',
  },
  {
    id: 'mp-emp',
    name: 'EMP',
    description: 'Activate before a combat roll. Dice rolled for combat in that territory can\'t be modified for the rest of the turn.',
  },
  {
    id: 'mp-recon',
    name: 'Recon',
    description: 'Activate before you would draw a coin card. You may take any one face-up territory card instead.',
  },
  {
    id: 'mp-rally',
    name: 'Rally',
    description: 'Activate at the start of your turn. Place 2 troops in every HQ you control.',
  },
]

// ─── Mutant Evolve powers (The Mutants Evolve events) ─────────────────────────

export interface MutantEvolvePower {
  id: string
  name: string
  /** Axis pair that reveals this power */
  stance: 'offensive' | 'defensive'
  aptitude: 'brains' | 'brawn'
  description: string
}

export const MUTANT_EVOLVE_POWERS: MutantEvolvePower[] = [
  {
    id: 'me-mass-hypnosis',
    name: 'Mass Hypnosis',
    stance: 'offensive', aptitude: 'brains',
    description: 'When turning in cards, you may pick one of those territories. Until the beginning of your next turn, that territory cannot be attacked.',
  },
  {
    id: 'me-unstable-cloning',
    name: 'Unstable Cloning',
    stance: 'defensive', aptitude: 'brains',
    description: 'When defending, if you roll natural doubles, add 1 additional defending troop to the territory if you still own it after the battle.',
  },
  {
    id: 'me-unnatural-strength',
    name: 'Unnatural Strength',
    stance: 'offensive', aptitude: 'brawn',
    description: 'When attacking, your 6\'s beat the defender\'s 6\'s.',
  },
  {
    id: 'me-mindshackle',
    name: 'Mindshackle',
    stance: 'defensive', aptitude: 'brawn',
    description: 'After collecting a resource card, you may trade it for a random card from the hand of a player whose territory you conquered this turn.',
  },
]
