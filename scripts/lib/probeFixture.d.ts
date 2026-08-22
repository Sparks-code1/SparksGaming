/** Types for probeFixture.js — plain JS, because the script that uses it runs
 *  under bare node with no build step. */
import type { GameState } from '../../src/types/game'
import type { Action } from '../../src/lib/gameReducer'

export const PROBE_ACTOR: string
export const PROBE_ACTION: Action
export const PROBE_EXPECTED_PHASE: string
export function probeState(campaignId?: string, mark?: string): GameState

export interface ProbeSeed {
  /** The whole board, decks and all. */
  board: GameState
  /** What goes in matches.state — publicView's shape. */
  publicHalf: GameState
  /** What goes in match_decks, keyed by pile. */
  decks: Record<string, string[]>
}

export function probeSeed(campaignId: string, mark: string): ProbeSeed
