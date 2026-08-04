import type { LegacyState } from '@/types/legacy'
import { getRoster, playerSignatureCount } from './roster'

/** A campaign runs 15 games. */
export const CAMPAIGN_GAMES = 15

export interface CampaignStanding {
  playerId: string
  name: string
  /** Games this player won — how many times they wrote their name on the board. */
  signatures: number
}

export interface CampaignOutcome {
  /** True once the champion can no longer change. */
  decided: boolean
  /** Winner(s). More than one only when the final game ends in a tie. */
  championIds: string[]
  /** Every roster member, most signatures first. */
  standings: CampaignStanding[]
  gamesPlayed: number
  gamesRemaining: number
  /** Decided before game 15 because nobody left could catch the leader. */
  clinchedEarly: boolean
}

/**
 * How many games have been completed.
 *
 * Takes the larger of the signed games and the game counter: the counter is
 * incremented when a game is finalised, so trusting either alone could
 * overstate how many games are still to play and delay an early clinch.
 */
function gamesPlayedIn(legacy: LegacyState | null | undefined): number {
  const signed = (legacy?.victoryLog ?? []).length
  const counted = Math.max(0, (legacy?.currentGameNumber ?? 1) - 1)
  return Math.min(CAMPAIGN_GAMES, Math.max(signed, counted))
}

/**
 * Who owns the world.
 *
 * The champion is whoever signed the board most across the campaign. That is
 * settled after 15 games, or earlier the moment no one else can catch the
 * leader even by winning every game that remains.
 *
 * A tie at the end of 15 games returns every tied player rather than inventing
 * a tiebreak — the world is shared.
 */
export function campaignOutcome(legacy: LegacyState | null | undefined): CampaignOutcome {
  const standings: CampaignStanding[] = getRoster(legacy)
    .map(m => ({ playerId: m.id, name: m.name, signatures: playerSignatureCount(legacy, m.id) }))
    .sort((a, b) => b.signatures - a.signatures)

  const gamesPlayed = gamesPlayedIn(legacy)
  const gamesRemaining = Math.max(0, CAMPAIGN_GAMES - gamesPlayed)

  const empty: CampaignOutcome = {
    decided: false, championIds: [], standings, gamesPlayed, gamesRemaining, clinchedEarly: false,
  }
  if (standings.length === 0) return empty

  const top = standings[0].signatures
  const leaders = standings.filter(s => s.signatures === top).map(s => s.playerId)

  // All 15 played: the standings are final, ties included.
  if (gamesRemaining === 0) {
    // Nobody has won anything — there is no champion to crown.
    if (top === 0) return empty
    return { ...empty, decided: true, championIds: leaders }
  }

  // Early clinch: only possible with a single leader, and only when the best
  // any rival could reach — their total plus every remaining game — still
  // falls short. Equalling the leader is not enough to displace them, but it
  // would create a tie, so the rival must stay strictly below.
  if (leaders.length > 1) return empty
  const best = standings[1]?.signatures ?? 0
  if (best + gamesRemaining < top) {
    return { ...empty, decided: true, championIds: leaders, clinchedEarly: true }
  }
  return empty
}

/** Champion names, formatted for the announcement. */
export function championLabel(outcome: CampaignOutcome): string {
  const names = outcome.championIds
    .map(id => outcome.standings.find(s => s.playerId === id)?.name ?? id)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Stamp the finished campaign onto legacy state. Idempotent — re-running on an
 * already-completed campaign changes nothing, so a replayed save or a remount
 * can never rewrite the champion.
 */
export function applyCampaignCompletion(
  legacy: LegacyState,
  outcome: CampaignOutcome,
): LegacyState {
  if (!outcome.decided || legacy.campaignComplete) return legacy
  return {
    ...legacy,
    campaignComplete: true,
    campaignWinnerId: outcome.championIds[0],
    campaignChampionIds: outcome.championIds,
    gameInProgress: false,
    activeGameState: null,
    historyLog: [
      ...(legacy.historyLog ?? []),
      {
        gameNumber: outcome.gamesPlayed,
        entry: `The world belongs to ${championLabel(outcome)} — campaign complete after ${outcome.gamesPlayed} games`,
        timestamp: new Date().toISOString(),
      },
    ],
  }
}
