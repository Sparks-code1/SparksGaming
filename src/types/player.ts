import type { FactionId } from './faction'
import type { AIDifficulty } from './ai'

export interface Player {
  id: string
  name: string
  factionId: FactionId
  /** Supabase auth user id, null for local/AI players */
  userId: string | null

  /** True when this slot is controlled by the computer */
  isAI?: boolean
  /** AI difficulty (only meaningful when isAI is true) */
  aiDifficulty?: AIDifficulty

  // per-game state
  troops: number          // troops available to place this turn
  cards: string[]         // territory card ids in hand
  missionCardId: string | null   // secret mission card for this campaign game
  isEliminated: boolean
  /** True if they used their Join the War option this game (can't rejoin again) */
  joinedWarThisGame?: boolean
  /** True if this player controls their faction's HQ territory */
  holdsHq: boolean

  // campaign record
  wins: number
  /** Game numbers in which this player won */
  winHistory: number[]
}
