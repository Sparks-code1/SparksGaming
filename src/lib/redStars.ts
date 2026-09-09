import type { LegacyState } from '@/types/legacy'
import type { Territory } from '@/types/territory'
import { controlledHqTerritoryIds } from './gameLogic'
import { playerSignatureCount } from './roster'

/**
 * Red stars, counted in ONE place.
 *
 * A player's stars this game are three things added together:
 *
 *   - the HQs they control, their own included (see risk-rules-rulings);
 *   - the stars earned this game — bought with four cards, or awarded by a
 *     mission, a star power, the coin deck, an alien — kept in
 *     `purchasedStars` and zeroed at the close-out;
 *   - the CONSOLATION STAR: one red star for every player who has yet to sign
 *     the board. A signature earns a missile at every game start instead, so
 *     the table is even — the winners bring a missile, everyone else brings a
 *     star and starts on two (their HQ and this). Confirmed 2026-09-07. It is
 *     not stored: it is a fact about the record, held for as long as the
 *     record says so, and gone the game after the player first wins.
 *
 * Eight copies of "HQ + purchased" used to live on the board and one in the
 * AI, and each new kind of star meant finding them all. They route through
 * here now; a count that does not is a count that is wrong.
 */

/** Games this player has won — the career record, or the board's signatures for a campaign that predates it. */
export function careerWins(legacy: LegacyState | null | undefined, playerId: string): number {
  return (legacy?.playerWins ?? {})[playerId] ?? playerSignatureCount(legacy, playerId)
}

/** Has this player written their name on the board yet? */
export function hasSignedBoard(legacy: LegacyState | null | undefined, playerId: string): boolean {
  return careerWins(legacy, playerId) > 0
}

/**
 * Has ANYONE signed the board yet?
 *
 * The consolation star only exists opposite a missile: a signature brings a
 * missile at every game start, and the star is what everyone else brings
 * instead. In game one nobody has signed, so nobody draws a missile and
 * nobody draws a star — the scale is already level, and handing every
 * faction a star there would make the first game a race to two.
 */
export function campaignHasSignature(legacy: LegacyState | null | undefined): boolean {
  if ((legacy?.victoryLog ?? []).length > 0) return true
  return Object.values(legacy?.playerWins ?? {}).some(n => (n ?? 0) > 0)
}

/** The consolation star: one for a player yet to sign a board somebody else has. */
export function consolationStar(legacy: LegacyState | null | undefined, playerId: string): 0 | 1 {
  if (!campaignHasSignature(legacy)) return 0
  return hasSignedBoard(legacy, playerId) ? 0 : 1
}

/** Stars earned this game — bought or awarded — from the per-game ledger. */
export function earnedStars(legacy: LegacyState | null | undefined, playerId: string): number {
  return (legacy?.purchasedStars ?? {})[playerId] ?? 0
}

/**
 * Every red star a player holds right now. `earned` may be passed by a caller
 * that has just changed the ledger and not yet stored it — an award or a
 * purchase checking for the fourth star on the spot.
 */
export function redStarTotal(
  legacy: LegacyState | null | undefined,
  playerId: string,
  territories: Record<string, Territory>,
  earned: number = earnedStars(legacy, playerId),
): number {
  return controlledHqTerritoryIds(playerId, territories).length + earned + consolationStar(legacy, playerId)
}
