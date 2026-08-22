/**
 * What the player HUD shows, worked out from the public state.
 *
 * DERIVED, not stored. Forces on the board and strongholds held are both
 * summed from the same `forces` array the board draws, so the number beside a
 * faction's name and the pieces standing in Arrakeen cannot disagree. A stored
 * total is a second copy of a fact that changes every time a worm surfaces, a
 * storm sweeps or a battle is lost, and it goes stale at the first one nobody
 * remembered to update.
 *
 * The two things that CANNOT be derived here are marked as such where they are
 * declared: the treachery hand count and each seat's reserves are published
 * into the shared row, because the hands live in match_secrets and nothing on
 * this side can count a row it is not allowed to read.
 *
 * Pure, and it takes no clock. Everything here is a fact about a moment that
 * the caller already has.
 */
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { FactionId } from '@/types/Dune/Faction'
import type { DuneGameState, DunePlayerPublic, Force } from '@/types/Dune/Game'

/** Territory ids that are strongholds, resolved once off the board data. */
const STRONGHOLDS: ReadonlySet<string> = new Set(
  DUNE_TERRITORIES.filter(t => t.stronghold).map(t => t.id),
)

export interface HudRow {
  faction: FactionId
  seat: string
  /** Every force this faction has standing on Arrakis, in every sector. */
  forcesOnBoard: number
  /**
   * How many strongholds they hold.
   *
   * COUNTED BY TERRITORY, not by stack. A stronghold is one territory however
   * many of its sectors a faction is standing in, and Arrakeen with forces in
   * two sectors is one stronghold — summing stacks would score it twice and
   * hand somebody the game, since holding strongholds is how Dune is won.
   */
  strongholds: number
  reserves: number
  handCount: number
  ally: FactionId | null
  battleLosses?: number
}

/**
 * One row per seated player, in seat order, with their ally resolved.
 *
 * Seat order rather than turn order: the HUD sits still down the side of the
 * screen while the storm moves the turn order every round, and a list that
 * reorders itself under the reader is a list nobody can find anything in.
 */
export function hudRows(state: Pick<DuneGameState, 'players' | 'forces'>): HudRow[] {
  return state.players.map(p => ({
    faction: p.faction,
    seat: p.seat,
    forcesOnBoard: forcesOnBoard(state.forces, p.faction),
    strongholds: strongholdsHeld(state.forces, p.faction),
    reserves: p.reserves,
    handCount: p.handCount,
    ally: allyOf(state.players, p),
    battleLosses: p.battleLosses,
  }))
}

export function forcesOnBoard(forces: readonly Force[], faction: FactionId): number {
  return forces.reduce((n, f) => (f.faction === faction ? n + f.count : n), 0)
}

export function strongholdsHeld(forces: readonly Force[], faction: FactionId): number {
  const held = new Set<string>()
  for (const f of forces) {
    // A stack of zero is not an occupation. These turn up: a territory emptied
    // by a battle keeps its entry until something prunes it.
    if (f.faction === faction && f.count > 0 && STRONGHOLDS.has(f.territoryId)) {
      held.add(f.territoryId)
    }
  }
  return held.size
}

/**
 * An ally, only if BOTH seats say so.
 *
 * An alliance is a pair, and one side of it claimed alone is a bug rather than
 * a relationship — the HUD pairs the two rows visually, and pairing on one
 * seat's word draws a bracket round somebody who has not agreed to it. A
 * half-alliance is dropped on both sides, so it shows as nobody being allied
 * rather than as an alliance one of them can deny.
 */
export function allyOf(
  players: readonly DunePlayerPublic[], of: DunePlayerPublic,
): FactionId | null {
  if (!of.ally) return null
  const other = players.find(p => p.faction === of.ally)
  return other?.ally === of.faction ? of.ally : null
}

/**
 * Seat order, but with allies moved next to each other.
 *
 * The alliance has to READ AT A GLANCE, and two rows in a shared bracket at
 * opposite ends of the list read as nothing at all. The pair takes the position
 * of whichever of them comes first, so the list still mostly follows the table.
 */
export function pairAllies(rows: readonly HudRow[]): HudRow[] {
  const out: HudRow[] = []
  const placed = new Set<FactionId>()
  for (const row of rows) {
    if (placed.has(row.faction)) continue
    out.push(row)
    placed.add(row.faction)
    if (row.ally) {
      const mate = rows.find(r => r.faction === row.ally)
      if (mate && !placed.has(mate.faction)) { out.push(mate); placed.add(mate.faction) }
    }
  }
  return out
}
