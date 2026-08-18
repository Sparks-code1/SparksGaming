// The storm, phase 1. Counter-clockwise is INCREASING sector number on this
// board, because the numbering was chosen to run that way — so the wrap at
// 18 -> 1 is the case most likely to be got wrong, and it is tested hardest.
import {
  sweptSectors, stormDestination, resolveStorm, isKilledByStorm,
  firstPlayerAfterStorm, sectorIdsAreValid, territoriesInStorm,
  STORM_START, SECTOR_COUNT, FIRST_STORM_ROLL, STORM_ROLL,
} from '@/lib/dune/storm'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { SectorId, TerritoryId } from '@/types/Dune/Game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const s = (n: number) => `sector-${n}` as SectorId

// ── the ids this module builds must be the ids the board exports ─────────────
check('sector ids line up with the board data', sectorIdsAreValid(), true)

// ── sweeping ─────────────────────────────────────────────────────────────────
check('a move of 3 enters the next three sectors, not the one it left',
  sweptSectors(s(1), 3), [s(2), s(3), s(4)])
check('the destination is included — "passes over OR stops"',
  sweptSectors(s(5), 1), [s(6)])
check('a roll of 0 sweeps nothing (the first storm may not move)',
  sweptSectors(STORM_START, 0), [])
check('and lands where it started', stormDestination(STORM_START, 0), STORM_START)

// The wrap. 18 -> 1, not 18 -> 19.
check('sweeping past the top wraps to sector 1',
  sweptSectors(s(17), 3), [s(18), s(1), s(2)])
check('and the destination wraps with it', stormDestination(s(17), 3), s(2))
check('starting ON 18 wraps immediately', sweptSectors(s(18), 2), [s(1), s(2)])

// Overshooting a whole circle: the first roll goes to 20 for exactly this.
check('a roll of 20 sweeps every sector once, not twice',
  sweptSectors(s(1), 20).length, SECTOR_COUNT)
check('...and still stops two along', stormDestination(s(1), 20), s(3))
check('a roll of exactly 18 sweeps everything and returns home',
  stormDestination(s(4), 18), s(4))

// ── damage ───────────────────────────────────────────────────────────────────
const sand = DUNE_TERRITORIES.find(t => t.terrain === 'sand' && t.id !== 'territory-05')!
const rock = DUNE_TERRITORIES.find(t => t.terrain === 'rock')!
const hold = DUNE_TERRITORIES.find(t => t.stronghold)!
const sink = DUNE_TERRITORIES.find(t => t.terrain === 'polar-sink')!
const swept = [s(7)]

check('sand in a swept sector is killed',
  isKilledByStorm({ territoryId: sand.id as TerritoryId, sector: s(7) }, swept), true)
check('rock shelters what stands on it',
  isKilledByStorm({ territoryId: rock.id as TerritoryId, sector: s(7) }, swept), false)
check('a stronghold shelters too',
  isKilledByStorm({ territoryId: hold.id as TerritoryId, sector: s(7) }, swept), false)
check('the Polar Sink is never touched',
  isKilledByStorm({ territoryId: sink.id as TerritoryId, sector: s(7) }, swept), false)
check('the Imperial Basin is sand but sheltered by name',
  isKilledByStorm({ territoryId: 'territory-05', sector: s(7) }, swept), false)
check('...and the exception is really needed — it IS sand',
  DUNE_TERRITORIES.find(t => t.id === 'territory-05')?.terrain, 'sand')
check('sand in a sector the storm missed survives',
  isKilledByStorm({ territoryId: sand.id as TerritoryId, sector: s(12) }, swept), false)

// The distinction the whole cell model exists for: one territory, two sectors,
// only one of them stormed.
const split = DUNE_TERRITORIES.find(t => t.terrain === 'sand' && t.sectors.length > 1 && t.id !== 'territory-05')!
const [a, b] = split.sectors as SectorId[]
check(`${split.displayName} spans ${split.sectors.length} sectors`, split.sectors.length > 1, true)
check('a storm in one of its sectors kills there',
  isKilledByStorm({ territoryId: split.id as TerritoryId, sector: a }, [a]), true)
check('...and spares the same territory in the other sector',
  isKilledByStorm({ territoryId: split.id as TerritoryId, sector: b }, [a]), false)

// ── spice ────────────────────────────────────────────────────────────────────
// No terrain exemption: sheltering forces and sheltering spice are different
// rules, and only forces get shelter.
const out = resolveStorm(s(6), 1, [], [
  { territoryId: rock.id as TerritoryId, sector: s(7) },
  { territoryId: sand.id as TerritoryId, sector: s(12) },
])
check('spice is swept away even on rock', out.spiceCleared, [rock.id])
check('spice outside the sweep stays', out.spiceCleared.includes(sand.id as TerritoryId), false)

// ── obstruction ──────────────────────────────────────────────────────────────
check('the storm seals whole territories, not just cells',
  territoriesInStorm(s(1)).length > 0, true)

// ── first player ─────────────────────────────────────────────────────────────
const seats = [
  { id: 'atreides', sector: s(4) },
  { id: 'harkonnen', sector: s(9) },
  { id: 'fremen', sector: s(15) },
]
check('the seat the storm reaches next goes first',
  firstPlayerAfterStorm(s(2), seats)?.id, 'atreides')
check('a seat just passed waits almost a full circle',
  firstPlayerAfterStorm(s(5), seats)?.id, 'harkonnen')
check('the search wraps past 18',
  firstPlayerAfterStorm(s(16), seats)?.id, 'atreides')
check('a seat IN the storm counts as reached; the next one goes first',
  firstPlayerAfterStorm(s(4), seats)?.id, 'harkonnen')
check('no seats -> nobody', firstPlayerAfterStorm(s(1), []), null)

// ── the roll ranges are the documented ones ──────────────────────────────────
check('first storm rolls 0–20', [FIRST_STORM_ROLL.min, FIRST_STORM_ROLL.max], [0, 20])
check('later storms roll 2–6', [STORM_ROLL.min, STORM_ROLL.max], [2, 6])

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
