/**
 * The storm: phase 1 of a Dune turn.
 *
 * Pure and roll-injected. Nothing here calls Math.random — the reducer contract
 * this project already lives under forbids it, so the die roll arrives as an
 * argument and the server is what produces it.
 *
 * DIRECTION. The storm travels counter-clockwise, and this board's sector
 * numbering was chosen to run counter-clockwise too (see SECTOR_ONE_BEARING in
 * scripts/build-dune-board.mjs). So counter-clockwise is simply INCREASING
 * sector number, wrapping 18 -> 1. That is why the chevrons on the storm track
 * point the way they do, and it means no bearing arithmetic belongs in here.
 */
import {
  DUNE_PLAYER_POSITIONS, DUNE_SECTORS, DUNE_TERRITORIES, TERRITORIES_BY_SECTOR,
} from '@/data/dune/boardData'
import type { Force, GameMode, SectorId, TerritoryId } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'

export const SECTOR_COUNT = 18

/** First storm of the game: 0–20 from the storm start, so it can overshoot a
 *  whole circle, and can also not move at all. */
export const FIRST_STORM_ROLL = { min: 0, max: 20 } as const
/**
 * Every storm after the first.
 *
 * The RANGE ITSELF depends on the game: 2–6 in the basic game, 1–6 in the
 * advanced one. This is the plainest example of why mode has to reach the phase
 * functions — it is not a faction power layered on top, it is a different die.
 */
export const STORM_ROLL = { min: 2, max: 6 } as const
export const STORM_ROLL_ADVANCED = { min: 1, max: 6 } as const
export const stormRollRange = (mode: GameMode) =>
  mode === 'advanced' ? STORM_ROLL_ADVANCED : STORM_ROLL

/** Where the first storm sets out from. */
export const STORM_START: SectorId = 'sector-1'

/** The Imperial Basin is sand but is sheltered, so the storm does not kill in
 *  it. Held by id because it is a named exception to a terrain rule, not a
 *  terrain of its own. */
export const STORM_SHELTERED: readonly TerritoryId[] = ['territory-05']

const num = (id: SectorId): number => Number(id.slice('sector-'.length))
const sectorId = (n: number): SectorId => `sector-${((n - 1) % SECTOR_COUNT) + 1}`

/**
 * The sectors a storm ENTERS moving `count` counter-clockwise from `from`.
 *
 * The origin is excluded: the storm already sat there and is not passing over
 * it again. The destination is included, because the rule counts sectors the
 * storm "passes over or stops" on.
 *
 * A roll larger than a full circle sweeps every sector once — 20 covers all 18
 * and still finishes two along, which is why the first roll goes to 20 at all.
 */
export function sweptSectors(from: SectorId, count: number): SectorId[] {
  if (count <= 0) return []
  const start = num(from)
  const seen = new Set<SectorId>()
  const out: SectorId[] = []
  for (let i = 1; i <= Math.min(count, SECTOR_COUNT); i++) {
    const id = sectorId(start + i)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Where the storm comes to rest. Separate from the sweep because a full-circle
 *  roll sweeps everything but still stops somewhere particular. */
export function stormDestination(from: SectorId, count: number): SectorId {
  return sectorId(num(from) + Math.max(0, count))
}

/** Where a stack stands, without regard to whose it is. */
export interface Cell {
  territoryId: TerritoryId
  sector: SectorId
}

/**
 * Is this cell exposed to a storm sweeping `swept`?
 *
 * Sand only. Rock, the strongholds and the Polar Sink shelter what stands on
 * them, and the Imperial Basin is a named exception despite being sand.
 *
 * Exposure is about the GROUND. How many die once exposed is about the faction,
 * and is decided separately — see stormLosses.
 */
export function isExposedToStorm(cell: Cell, swept: readonly SectorId[]): boolean {
  if (!swept.includes(cell.sector)) return false
  if (STORM_SHELTERED.includes(cell.territoryId)) return false
  const t = DUNE_TERRITORIES.find(x => x.id === cell.territoryId)
  return t?.terrain === 'sand'
}

/**
 * How many of a stack the storm takes.
 *
 * The Fremen lose half, rounded UP, and only in the advanced game — their
 * storm-loss rule lives under `advanced` in the faction data, not among their
 * ordinary abilities. In the basic game they burn like everyone else.
 *
 * Rounded up rather than down: half of three is two lost, one surviving. The
 * other rounding would make an odd stack better off than an even one.
 */
export function stormLosses(force: Force, mode: GameMode): number {
  if (mode === 'advanced' && force.faction === 'fremen') {
    return Math.ceil(force.count / 2)
  }
  return force.count
}

/** A stack after the storm has taken its share. */
export interface StormCasualty {
  force: Force
  /** How many died. Fewer than the whole stack only for the Fremen. */
  lost: number
  /** How many are still standing there. */
  survived: number
}

export interface StormOutcome {
  from: SectorId
  to: SectorId
  swept: SectorId[]
  /** Every stack the storm touched, with what it took. */
  casualties: StormCasualty[]
  /** Forces bound for the Tleilaxu Tanks, as counts by faction and cell. */
  killed: Force[]
  /** The forces as they stand afterwards, survivors included, empties dropped. */
  forcesAfter: Force[]
  /** Territories whose spice is swept away, to the Spice Bank. Spice is removed
   *  wherever the storm passes, with no terrain exemption: sheltering forces and
   *  sheltering spice are different rules. */
  spiceCleared: TerritoryId[]
}

/**
 * Resolve a storm move against the forces on the board.
 *
 * `mode` is required rather than defaulted. A default would let a caller resolve
 * a storm without saying which game it is, and get the basic rules silently —
 * which for the Fremen is the difference between losing half a stack and all of
 * it.
 */
export function resolveStorm(
  from: SectorId,
  roll: number,
  forces: readonly Force[],
  mode: GameMode,
  spiceOnBoard: readonly Cell[] = [],
): StormOutcome {
  const swept = sweptSectors(from, roll)

  const casualties: StormCasualty[] = []
  const forcesAfter: Force[] = []
  for (const force of forces) {
    if (!isExposedToStorm(force, swept)) { forcesAfter.push(force); continue }
    const lost = Math.min(force.count, stormLosses(force, mode))
    const survived = force.count - lost
    casualties.push({ force, lost, survived })
    if (survived > 0) forcesAfter.push({ ...force, count: survived })
  }

  return {
    from,
    to: stormDestination(from, roll),
    swept,
    casualties,
    killed: casualties
      .filter(c => c.lost > 0)
      .map(c => ({ ...c.force, count: c.lost })),
    forcesAfter,
    spiceCleared: spiceOnBoard.filter(s => swept.includes(s.sector)).map(s => s.territoryId),
  }
}

// ── Obstruction ──────────────────────────────────────────────────────────────
// The storm blocks as well as kills: forces may not move into, out of, or
// through the sector it occupies, and no battle may involve a force standing in
// it. Both are the same question, so both callers ask it here.

/** True when this cell is under the storm and therefore sealed. */
export function isInStorm(cell: Cell, storm: SectorId): boolean {
  return cell.sector === storm
}

/** Territories the storm is sitting on, for the movement and battle rules. */
export function territoriesInStorm(storm: SectorId): readonly string[] {
  return TERRITORIES_BY_SECTOR[storm] ?? []
}

// ── First player ─────────────────────────────────────────────────────────────

/**
 * Who bids, ships and moves first: the seat the storm approaches NEXT.
 *
 * Counter-clockwise from where the storm now rests, so a seat the storm has
 * just passed waits almost a full circle for its turn to come round. A seat in
 * the storm's own sector counts as already reached, and the search moves on.
 *
 * `seats` maps each player to the sector their marker sits beside.
 */
export function firstPlayerAfterStorm<T extends { sector: SectorId }>(
  storm: SectorId,
  seats: readonly T[],
): T | null {
  if (seats.length === 0) return null

  // Every seat must name a sector the board actually has, and so must the storm.
  //
  // This replaces a fallback that returned seats[0] when the walk found nobody.
  // That looked like defensive tidiness and was a trap: a seat carrying no
  // sector — the shape you get building seats straight from DUNE_PLAYER_POSITIONS
  // before this data existed — matches nothing, the walk falls through, and the
  // fallback hands back "whoever is first in the array" as though it were a
  // ruling. Silent, plausible, and wrong every time. Failing here is louder and
  // points at the actual mistake.
  const known = new Set<string>(DUNE_SECTORS.map(s => s.id))
  if (!known.has(storm)) {
    throw new Error(`the storm is in no sector this board has: ${String(storm)}`)
  }
  const stray = seats.find(s => !known.has(s.sector))
  if (stray) {
    throw new Error(`a seat sits beside no sector this board has: ${String(stray.sector)}`)
  }

  // Empty seats need no handling of their own, and that is the point: a position
  // nobody took is simply not in `seats`, so the walk steps over its sector like
  // any other empty sector. See seatsFromPositions.
  const start = num(storm)
  for (let i = 1; i <= SECTOR_COUNT; i++) {
    const id = sectorId(start + i)
    const seat = seats.find(s => s.sector === id)
    if (seat) return seat
  }
  // Unreachable: eighteen steps cover every sector, including the storm's own at
  // the last step, and every seat was just checked to sit in one of them.
  throw new Error('the storm walked all eighteen sectors without reaching a seat')
}

/** A seat at the table: who is sitting there, and where. */
export interface Seat {
  faction: FactionId
  positionId: string
  sector: SectorId
}

/**
 * Turn a seating plan into seats the storm can walk.
 *
 * `seating` maps a player position's id to the faction sitting there. Positions
 * nobody took are left out of the result entirely — which is the whole of how
 * empty seats are handled. Dune seats two to six around six fixed positions, so
 * up to four of them are empty in most games; nothing downstream should have to
 * know that, and with this nothing does.
 *
 * Order follows the board data, so seats come back in seat-number order. That is
 * NOT turn order: seat numbers run clockwise and the storm runs counter-
 * clockwise, so the storm visits them in descending seat number.
 */
export function seatsFromPositions(
  seating: Readonly<Record<string, FactionId | null | undefined>>,
): Seat[] {
  const seats = DUNE_PLAYER_POSITIONS.flatMap(p => {
    const faction = seating[p.id]
    return faction ? [{ faction, positionId: p.id, sector: p.sectorId as SectorId }] : []
  })
  const twice = seats.find((s, i) => seats.findIndex(o => o.faction === s.faction) !== i)
  if (twice) {
    throw new Error(`${twice.faction} is seated in more than one position`)
  }
  return seats
}

/** Sanity: the ids this module manufactures must exist in the board data. */
export function sectorIdsAreValid(): boolean {
  return DUNE_SECTORS.length === SECTOR_COUNT
    && DUNE_SECTORS.every(s => s.id === sectorId(s.number))
}
