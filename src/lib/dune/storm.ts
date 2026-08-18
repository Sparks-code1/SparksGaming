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
import { DUNE_SECTORS, DUNE_TERRITORIES, TERRITORIES_BY_SECTOR } from '@/data/dune/boardData'
import type { SectorId, TerritoryId } from '@/types/Dune/Game'

export const SECTOR_COUNT = 18

/** First storm of the game: 0–20 from the storm start, so it can overshoot a
 *  whole circle, and can also not move at all. */
export const FIRST_STORM_ROLL = { min: 0, max: 20 } as const
/** Every storm after that: 2–6 from wherever it stands. */
export const STORM_ROLL = { min: 2, max: 6 } as const

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

/** A stack of forces, identified by the cell it occupies. */
export interface Occupied {
  territoryId: TerritoryId
  sector: SectorId
}

/**
 * Is this cell killed by a storm sweeping `swept`?
 *
 * Sand only. Rock, the strongholds and the Polar Sink shelter what stands on
 * them, and the Imperial Basin is a named exception despite being sand.
 */
export function isKilledByStorm(cell: Occupied, swept: readonly SectorId[]): boolean {
  if (!swept.includes(cell.sector)) return false
  if (STORM_SHELTERED.includes(cell.territoryId)) return false
  const t = DUNE_TERRITORIES.find(x => x.id === cell.territoryId)
  return t?.terrain === 'sand'
}

export interface StormOutcome {
  from: SectorId
  to: SectorId
  swept: SectorId[]
  /** Forces killed — these go to the Tleilaxu Tanks. */
  killed: Occupied[]
  /** Territories whose spice is swept away, to the Spice Bank. Spice is removed
   *  wherever the storm passes, with no terrain exemption: sheltering forces and
   *  sheltering spice are different rules. */
  spiceCleared: TerritoryId[]
}

/** Resolve a storm move against the forces on the board. */
export function resolveStorm(
  from: SectorId,
  roll: number,
  forces: readonly Occupied[],
  spiceOnBoard: readonly { territoryId: TerritoryId; sector: SectorId }[] = [],
): StormOutcome {
  const swept = sweptSectors(from, roll)
  return {
    from,
    to: stormDestination(from, roll),
    swept,
    killed: forces.filter(f => isKilledByStorm(f, swept)),
    spiceCleared: spiceOnBoard.filter(s => swept.includes(s.sector)).map(s => s.territoryId),
  }
}

// ── Obstruction ──────────────────────────────────────────────────────────────
// The storm blocks as well as kills: forces may not move into, out of, or
// through the sector it occupies, and no battle may involve a force standing in
// it. Both are the same question, so both callers ask it here.

/** True when this cell is under the storm and therefore sealed. */
export function isInStorm(cell: Occupied, storm: SectorId): boolean {
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
  const start = num(storm)
  for (let i = 1; i <= SECTOR_COUNT; i++) {
    const id = sectorId(start + i)
    const seat = seats.find(s => s.sector === id)
    if (seat) return seat
  }
  // Every seat sits in the storm's own sector — possible only with one seat.
  return seats[0] ?? null
}

/** Sanity: the ids this module manufactures must exist in the board data. */
export function sectorIdsAreValid(): boolean {
  return DUNE_SECTORS.length === SECTOR_COUNT
    && DUNE_SECTORS.every(s => s.id === sectorId(s.number))
}
