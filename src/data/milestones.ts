import type { LegacyState } from '@/types/legacy'

/**
 * The sealed-envelope campaign milestones.
 *
 * Shared between the Legacy panel (which lists them) and GameBoard (which
 * records the game each one unlocked in). Keyed by `id` so the unlock game
 * numbers persist against a stable name.
 */
export interface Milestone {
  id: string
  name: string
  subtitle: string
  unlock: string
  reward: string
  isUnlocked: (l: LegacyState) => boolean
}

export const MILESTONES: Milestone[] = [
  {
    id: 'first-blood',
    name: 'First Blood',
    subtitle: 'The first to fall',
    unlock: 'When the first player is eliminated from a game.',
    reward: 'Unlocks Comeback Powers (blue slot) and the 3 Mercenary scar cards.',
    isUnlocked: l => !!l.firstEliminationTriggered,
  },
  {
    id: 'second-victory',
    name: 'The Second Victory',
    subtitle: 'A repeat champion',
    unlock: 'When any player signs the board for their 2nd win.',
    reward: 'Unlocks Missions, the Join the Cause events, and Faction Homelands.',
    isUnlocked: l => !!l.doubleWinnerMilestoneTriggered,
  },
  {
    id: 'ninth-city',
    name: 'The Ninth City',
    subtitle: 'A crowded world',
    unlock: 'When the 9th minor city is placed on the board.',
    reward: 'Unlocks Biohazard scars and the drafted turn order.',
    isUnlocked: l => !!l.ninthCityUnlocked,
  },
  {
    id: 'they-live-among-us',
    name: 'They Live Among Us',
    subtitle: 'The War Progresses',
    unlock: 'When a player is about to place 30+ troops while holding at least 1 missile.',
    reward: 'Unlocks the Aliens faction, Alien Island, Weakness Powers and Alien events.',
    isUnlocked: l => !!l.alienMilestoneTriggered,
  },
  {
    id: 'the-unthinkable',
    name: 'The Unthinkable',
    subtitle: 'The War Progresses',
    unlock: 'When 3 missiles are placed on a single combat roll.',
    reward: 'Unlocks the Mutants faction, the Fallout Zone, Missile Powers and Nuclear events.',
    isUnlocked: l => !!l.nuclearMilestoneTriggered,
  },
]
