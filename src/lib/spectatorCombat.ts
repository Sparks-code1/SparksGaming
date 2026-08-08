/**
 * Turning a live match action into something a SPECTATOR can watch.
 *
 * Players not in a battle never see it — the actor's machine runs the combat
 * modal, everyone else just receives the resulting board. This module builds
 * the missing middle from the `match_actions` broadcast that already reaches
 * every client: who attacked whom, the dice as the attacker's screen showed
 * them, and how it ended.
 *
 * Freshness is not handled here and doesn't need to be: `matchSync` delivers
 * each action at most once, live only — never replayed on reconnect, never
 * echoed back to the actor — so a report is built only at the moment the
 * battle actually happened somewhere else.
 */
import type { Action, Effect, CombatRoundLog } from '@/lib/gameReducer'
import type { GameState } from '@/types/game'

export interface SpectatorCombatReport {
  attackerName: string
  /** null when the land was empty (never true for rolled combat). */
  defenderName: string | null
  srcName: string
  tgtName: string
  /** The battle's dice, oldest first. Empty when the actor sent none. */
  rounds: CombatRoundLog[]
  totalAtkLoss: number
  totalDefLoss: number
  captured: boolean
  troopsToAdvance: number
  /** Render one totals card instead of round-by-round dice. */
  summary: boolean
}

/** Auto-resolve fights a dozen rounds in one action; animating each would hold
 *  the audience hostage. Above this many rounds the report is a summary. */
export const SPECTATE_ANIMATE_MAX_ROUNDS = 4

/**
 * Build the report for a remote combat action, or null when there is nothing
 * to watch (not a combat, or an uncontested walk into empty land — no dice).
 *
 * `state` may or may not already include the battle's outcome: the state row
 * UPDATE and the action INSERT race each other onto the socket. Names are
 * therefore taken from the effect where ownership matters (the captured
 * defender), and from static territory data otherwise.
 */
export function buildSpectatorReport(
  action: Action,
  effects: Effect[],
  state: Pick<GameState, 'players' | 'territories'>,
): SpectatorCombatReport | null {
  if (action.type !== 'RESOLVE_COMBAT' && action.type !== 'DECLARE_ATTACK') return null
  if ('uncontested' in action && action.uncontested) return null

  const src = state.territories[action.srcId]
  const tgt = state.territories[action.tgtId]
  if (!src || !tgt) return null

  const nameOf = (pid: string | null | undefined) =>
    pid ? state.players.find(p => p.id === pid)?.name ?? null : null

  // DECLARE_ATTACK (server dice): the rounds live in the combat-resolved effect.
  const resolved = effects.find(e => e.kind === 'combat-resolved')
  const outcome = resolved && 'outcome' in resolved ? resolved.outcome : null

  const rounds: CombatRoundLog[] = action.type === 'DECLARE_ATTACK'
    ? (outcome?.rounds ?? []).map(r => ({ atkDice: r.atkDice, defDice: r.defDice, aLoss: r.aLoss, dLoss: r.dLoss }))
    : (action.rounds ?? [])

  const totalAtkLoss = action.type === 'DECLARE_ATTACK' ? outcome?.totalAtkLoss ?? 0 : action.totalAtkLoss
  const totalDefLoss = action.type === 'DECLARE_ATTACK' ? outcome?.totalDefLoss ?? 0 : action.totalDefLoss
  const captured     = action.type === 'DECLARE_ATTACK' ? outcome?.captured ?? false : action.captured

  // On a capture the state may already show the attacker owning the target, so
  // the pre-battle defender is only reliable from the territory-captured
  // effect. On a repelled attack ownership never changed.
  const capturedEffect = effects.find(e => e.kind === 'territory-captured')
  const defenderName = captured && capturedEffect && 'fromPlayerId' in capturedEffect
    ? nameOf(capturedEffect.fromPlayerId)
    : nameOf(tgt.occupyingPlayerId)

  // The source is the attacker's whether or not the state already advanced.
  const attackerName = captured && capturedEffect && 'byPlayerId' in capturedEffect
    ? nameOf(capturedEffect.byPlayerId) ?? nameOf(src.occupyingPlayerId) ?? 'Unknown'
    : nameOf(src.occupyingPlayerId) ?? 'Unknown'

  return {
    attackerName,
    defenderName,
    srcName: src.name,
    tgtName: tgt.name,
    rounds,
    totalAtkLoss,
    totalDefLoss,
    captured,
    troopsToAdvance: action.troopsToAdvance,
    summary: rounds.length === 0 || rounds.length > SPECTATE_ANIMATE_MAX_ROUNDS,
  }
}

/** How long the overlay should stay up, in ms — long enough to read, short
 *  enough that a chain of auto-resolved battles keeps moving. */
export function spectatorDisplayMs(report: SpectatorCombatReport): number {
  if (report.summary) return 5_000
  return 2_500 + report.rounds.length * 1_100
}
