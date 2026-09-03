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
import type { Force, GameMode, SectorId, ShieldWall, TerritoryId } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'
import { offering } from './phase'
import { territoryDistance } from './shipment'
import type { Step } from './phase'

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

/**
 * The three the Shield Wall stands over.
 *
 * NOT a terrain rule and not a property of these territories. The wall shelters
 * them, and a treachery card takes the wall down for the rest of the game, so
 * the protection is a fact about THIS match and has to be read from game state.
 *
 * The Imperial Basin is sand and would burn without it. Arrakeen and Carthag are
 * strongholds and would be sheltered by that alone — which is exactly the trap.
 * While the wall stands the two rules agree and nothing distinguishes them; once
 * it falls they disagree, and the answer is that all three burn. So the wall
 * does not merely add protection to these three, it REPLACES whatever they would
 * otherwise have had, and losing it takes the stronghold shelter with it.
 */
export const SHIELD_WALL_PROTECTS: readonly TerritoryId[] = [
  'territory-05',   // Imperial Basin — sand
  'territory-13',   // Arrakeen — stronghold
  'territory-26',   // Carthag — stronghold
]

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
 * Two rules, and the order between them is the whole point:
 *
 *   The three territories the Shield Wall covers are decided BY THE WALL, and by
 *   nothing else. Standing, they are safe whatever they are made of. Fallen,
 *   they are exposed whatever they are made of — Arrakeen and Carthag included,
 *   though they are strongholds.
 *
 *   Everywhere else it is terrain. Sand burns; rock, strongholds and the Polar
 *   Sink shelter what stands on them.
 *
 * `shieldWall` is required rather than defaulted for the same reason `mode` is:
 * a default would let a caller resolve a storm without saying what the board
 * looks like and get the wrong answer silently in the one case that matters.
 *
 * Exposure is about the GROUND. How many die once exposed is about the faction,
 * and is decided separately — see stormLosses.
 */
export function isExposedToStorm(
  cell: Cell, swept: readonly SectorId[], shieldWall: ShieldWall,
): boolean {
  if (!swept.includes(cell.sector)) return false
  if (SHIELD_WALL_PROTECTS.includes(cell.territoryId)) return shieldWall === 'destroyed'
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
export function stormLosses(
  force: Force, mode: GameMode, suppressed = false,
): number {
  // A KARAMA TAKES THE MERCY, and they burn like everyone else. Same entry
  // on the sheet as the worm placement — advanced.spiceBlow — but a
  // different phase, so a stop aimed at the storm and one aimed at the blow
  // are two different cards. That is what "during one game phase" means for
  // an advantage that fires in two.
  if (!suppressed && mode === 'advanced' && force.faction === 'fremen') {
    return Math.ceil(force.count / 2)
  }
  return force.count
}

/**
 * THE FIRST STORM IS NORMAL, and every one after it is known to the Fremen
 * before it blows.
 *
 * Their sheet: "The first storm in the game is normal. All subsequent storms
 * can move either 1-6 sectors and you get to know the number of sectors
 * before the storm moves on the previous turn." So the knowledge is of the
 * NEXT turn's storm, learned at the end of this one — not of this turn's
 * before it moves, which would be worth nothing: by then the number is
 * already public, published between the roll and the move so that Family
 * Atomics has its beat.
 *
 * TURN TWO ONWARD. Turn one is the normal storm the card exempts, so the
 * first thing they are ever told is turn two's, at the end of turn one.
 */
export const FOREKNOWN_FROM_TURN = 2

/**
 * The distance a storm was PROMISED to move, or null if none was.
 *
 * When the Fremen were told this turn's number at the end of the last one,
 * that number was committed, and it is what has to move the marker: rolling
 * fresh would make the foreknowledge a lie told a turn in advance, which is
 * worse than not having the rule at all.
 *
 * A FUNCTION RATHER THAN A TEST INLINED IN THE ENDPOINT. A rule that lives
 * inside a request handler can only be checked by reading the handler for a
 * string, and a gate wrapped in `if (false &&` keeps every one of its
 * strings — which is a test that proves the words are there and nothing
 * about the rule. Here it is exercised at its boundaries instead.
 */
export function stormRollPromised(
  held: { turn?: number; roll?: number } | null | undefined,
  forTurn: number,
): number | null {
  return held && held.turn === forTurn && typeof held.roll === 'number'
    ? held.roll
    : null
}

export function fremenForeknow(input: {
  mode: GameMode
  /** Whether the Fremen are at this table at all. */
  seated: boolean
  /** The turn whose storm would be foretold — the one after the current. */
  nextTurn: number
  /** Their advanced.storm advantage, cancelled by a Karama. */
  suppressed?: boolean
}): boolean {
  return input.mode === 'advanced' && input.seated && !input.suppressed
    && input.nextTurn >= FOREKNOWN_FROM_TURN
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
  /**
   * Spice swept away, to the Spice Bank, with the amount each territory lost.
   *
   * No terrain exemption, and none needed. The three the Shield Wall covers
   * never hold spice on the board at all — the Imperial Basin, Arrakeen and
   * Carthag have no blow marker, and what their occupants earn in advanced play
   * goes straight to the player rather than sitting on the map. So storm
   * protection only ever decides about forces, and the question of whether the
   * wall shelters spice does not arise. Asserted in the storm suite, since it is
   * a fact about the board that this reasoning leans on.
   */
  spiceCleared: { territoryId: TerritoryId; amount: number }[]
  /** The board's spice afterwards. Returned rather than left to the caller for
   *  the same reason the spice blow returns it: doing it by hand is where the
   *  mistakes live. */
  spiceOnBoard: Record<string, number>
}

/**
 * What the storm is about to do, once the roll is known.
 *
 * Handed round before anything moves, because a card can be played against it.
 */
export interface StormAsk {
  kind: 'before-the-storm-moves'
  from: SectorId
  to: SectorId
  /** Everything it will pass over, so a player can see what is at risk. */
  swept: SectorId[]
}

/** The continuation: plain data, so it survives a round trip to the database. */
export interface StormCarry {
  from: SectorId
  roll: number
  to: SectorId
  swept: SectorId[]
  forces: Force[]
  spiceOnBoard: Record<string, number>
  mode: GameMode
}

export type StormStep = Step<StormAsk, StormCarry, StormOutcome>

/**
 * Roll the storm, and stop before it moves.
 *
 * The gap is not decoration. Family Atomics is played "after storm movement is
 * calculated but before the storm moves" — so the sweep is known, everyone can
 * see what is about to burn, and only then does the wall come down. Resolve it
 * in one call and there is nowhere for the card to go.
 *
 * The window is OFFERED, not required: any player holding the card may use it
 * and almost nobody ever does, so the phase must be able to proceed with no
 * answer at all. `closesAt` is the caller's to stamp — nothing here reads a
 * clock.
 */
export function beginStorm(input: {
  from: SectorId
  roll: number
  forces: readonly Force[]
  mode: GameMode
  spiceOnBoard?: Readonly<Record<string, number>>
  /** Who may interrupt. Everyone at the table, since anyone could hold the card. */
  mayInterrupt?: FactionId[]
  closesAt?: number
}): StormStep {
  const swept = sweptSectors(input.from, input.roll)
  const to = stormDestination(input.from, input.roll)
  const carry: StormCarry = {
    from: input.from,
    roll: input.roll,
    to,
    swept,
    forces: [...input.forces],
    spiceOnBoard: { ...(input.spiceOnBoard ?? {}) },
    mode: input.mode,
  }
  return offering(
    input.mayInterrupt ?? [],
    { kind: 'before-the-storm-moves', from: input.from, to, swept },
    carry,
    input.closesAt,
  )
}

/**
 * Move the storm, now that the window has shut.
 *
 * `shieldWall` is read HERE, not when the roll was made, and that ordering is
 * the rule: the card lands in between, and a storm resolved against the wall as
 * it stood at the start of the phase would spare three territories it should
 * have burned.
 */
export function resolveStormMove(carry: StormCarry, shieldWall: ShieldWall): StormOutcome {
  return resolveStorm(carry.from, carry.roll, carry.forces, carry.mode, shieldWall, carry.spiceOnBoard)
}

/**
 * Resolve a storm move against the forces on the board.
 *
 * The whole-phase shortcut, for callers with nobody to offer the window to: a
 * test, a replay, a game with no treachery deck yet. A game where Family Atomics
 * could be played must use `beginStorm` and resolve the window, or it plays that
 * card's timing for the table.
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
  shieldWall: ShieldWall,
  spiceOnBoard: Readonly<Record<string, number>> = {},
  /** The Fremen half-loss, cancelled by a Karama — passed in, since this
   *  resolves a storm and reads no match state of its own. */
  fremenBurn = false,
): StormOutcome {
  const swept = sweptSectors(from, roll)

  const casualties: StormCasualty[] = []
  const forcesAfter: Force[] = []
  for (const force of forces) {
    if (!isExposedToStorm(force, swept, shieldWall)) { forcesAfter.push(force); continue }
    const lost = Math.min(force.count, stormLosses(force, mode, fremenBurn))
    const survived = force.count - lost
    casualties.push({ force, lost, survived })
    if (survived > 0) forcesAfter.push({ ...force, count: survived })
  }

  // Spice is keyed by territory, the same shape the spice blow uses, and its
  // SECTOR comes from the board rather than being carried alongside: a blow
  // lands on the territory's marker, and the marker is in one known sector.
  // Two shapes for the same thing meant every caller converted between them.
  const spiceCleared: StormOutcome['spiceCleared'] = []
  const spiceAfter: Record<string, number> = { ...spiceOnBoard }
  for (const [territoryId, amount] of Object.entries(spiceOnBoard)) {
    if (!(amount > 0)) continue
    const sector = DUNE_TERRITORIES.find(t => t.id === territoryId)?.spiceSector
    if (sector && swept.includes(sector as SectorId)) {
      spiceCleared.push({ territoryId: territoryId as TerritoryId, amount })
      delete spiceAfter[territoryId]
    }
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
    spiceCleared,
    spiceOnBoard: spiceAfter,
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

// ── the storm cards ───────────────────────────────────────────────────────

/** Weather Control's reach: nought to ten sectors, the holder's choice. */
export const WEATHER_CONTROL_MAX = 10
/** The beat between the roll and the move, when the cards may answer. */
export const STORM_CARD_SECONDS = 45
/** The Wall itself, on the board. */
export const SHIELD_WALL_TERRITORY: TerritoryId = 'territory-06' as TerritoryId

/**
 * Whether this faction may detonate Family Atomics: one or more forces on
 * the Shield Wall itself, or on an adjacent territory "with no storm
 * between your sector and the Wall" — judged as a DIRECT crossing by the
 * same walk the movement rules use: distance one, storm included, so a
 * stormed meeting-point or a stormed own sector refuses the way the card
 * means it to.
 */
export function mayAtomics(
  forces: readonly Force[], faction: FactionId, storm: SectorId,
): boolean {
  const mine = forces.filter(f => f.faction === faction && f.count > 0)
  if (mine.some(f => f.territoryId === SHIELD_WALL_TERRITORY)) return true
  const wall = DUNE_TERRITORIES.find(t => t.id === SHIELD_WALL_TERRITORY)
  if (!wall) return false
  const nextDoor = new Set(wall.adjacent)
  return mine.some(f => nextDoor.has(f.territoryId)
    && wall.sectors.some(sec =>
      territoryDistance(
        { territoryId: f.territoryId, sector: f.sector },
        { territoryId: SHIELD_WALL_TERRITORY, sector: sec }, storm) === 1))
}
