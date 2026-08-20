// The storm, phase 1. Counter-clockwise is INCREASING sector number on this
// board, because the numbering was chosen to run that way — so the wrap at
// 18 -> 1 is the case most likely to be got wrong, and it is tested hardest.
import {
  sweptSectors, stormDestination, resolveStorm, isExposedToStorm, stormLosses,
  firstPlayerAfterStorm, sectorIdsAreValid, territoriesInStorm, stormRollRange,
  STORM_START, SECTOR_COUNT, FIRST_STORM_ROLL, STORM_ROLL, STORM_ROLL_ADVANCED,
} from '@/lib/dune/storm'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { Force, SectorId, TerritoryId } from '@/types/Dune/Game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const s = (n: number) => `sector-${n}` as SectorId
const stack = (faction: string, t: string, sec: number, count = 3): Force => ({
  faction: faction as Force['faction'],
  territoryId: t as TerritoryId,
  sector: `sector-${sec}` as SectorId,
  count,
})

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

check('sand in a swept sector is exposed',
  isExposedToStorm({ territoryId: sand.id as TerritoryId, sector: s(7) }, swept), true)
check('rock shelters what stands on it',
  isExposedToStorm({ territoryId: rock.id as TerritoryId, sector: s(7) }, swept), false)
check('a stronghold shelters too',
  isExposedToStorm({ territoryId: hold.id as TerritoryId, sector: s(7) }, swept), false)
check('the Polar Sink is never touched',
  isExposedToStorm({ territoryId: sink.id as TerritoryId, sector: s(7) }, swept), false)
check('the Imperial Basin is sand but sheltered by name',
  isExposedToStorm({ territoryId: 'territory-05', sector: s(7) }, swept), false)
check('...and the exception is really needed — it IS sand',
  DUNE_TERRITORIES.find(t => t.id === 'territory-05')?.terrain, 'sand')
check('sand in a sector the storm missed survives',
  isExposedToStorm({ territoryId: sand.id as TerritoryId, sector: s(12) }, swept), false)

// The distinction the whole cell model exists for: one territory, two sectors,
// only one of them stormed.
const split = DUNE_TERRITORIES.find(t => t.terrain === 'sand' && t.sectors.length > 1 && t.id !== 'territory-05')!
const [a, b] = split.sectors as SectorId[]
check(`${split.displayName} spans ${split.sectors.length} sectors`, split.sectors.length > 1, true)
check('a storm in one of its sectors kills there',
  isExposedToStorm({ territoryId: split.id as TerritoryId, sector: a }, [a]), true)
check('...and spares the same territory in the other sector',
  isExposedToStorm({ territoryId: split.id as TerritoryId, sector: b }, [a]), false)

// ── spice ────────────────────────────────────────────────────────────────────
// No terrain exemption: sheltering forces and sheltering spice are different
// rules, and only forces get shelter.
const out = resolveStorm(s(6), 1, [], 'basic', [
  { territoryId: rock.id as TerritoryId, sector: s(7) },
  { territoryId: sand.id as TerritoryId, sector: s(12) },
])
check('spice is swept away even on rock', out.spiceCleared, [rock.id])
check('spice outside the sweep stays', out.spiceCleared.includes(sand.id as TerritoryId), false)

// ── who owns the losses ─────────────────────────────────────
// The rule that was previously unsayable: Fremen lose HALF, rounded up, and only
// in the advanced game. Their storm-loss rule sits under `advanced` in the
// faction data, not among their ordinary abilities.
check('basic game: the Fremen burn like everyone else',
  stormLosses(stack('fremen', 'x', 7, 4), 'basic'), 4)
check('advanced game: the Fremen lose half',
  stormLosses(stack('fremen', 'x', 7, 4), 'advanced'), 2)
check('rounded UP, so an odd stack is not better off',
  stormLosses(stack('fremen', 'x', 7, 3), 'advanced'), 2)
check('a lone Fremen still dies', stormLosses(stack('fremen', 'x', 7, 1), 'advanced'), 1)
check('everyone else loses the lot even in the advanced game',
  stormLosses(stack('harkonnen', 'x', 7, 4), 'advanced'), 4)

{
  // End to end, over the same ground: one stack each, same sector, same sand.
  const sandT = sand.id as TerritoryId
  const sec = Number(String(sand.sectors[0]).replace('sector-', ''))
  const forces = [stack('fremen', sandT, sec, 4), stack('harkonnen', sandT, sec, 4)]
  const from = s(((sec + 16) % 18) + 1)          // one short, so the sweep lands on it

  const basic = resolveStorm(from, 1, forces, 'basic')
  check('basic: both stacks wiped', basic.killed.reduce((n, k) => n + k.count, 0), 8)
  check('...and nothing is left standing there', basic.forcesAfter.length, 0)

  const adv = resolveStorm(from, 1, forces, 'advanced')
  check('advanced: six lost, not eight', adv.killed.reduce((n, k) => n + k.count, 0), 6)
  check('...and the Fremen keep two',
    adv.forcesAfter.filter(f => f.faction === 'fremen').map(f => f.count), [2])
  check('...while the Harkonnen keep none',
    adv.forcesAfter.filter(f => f.faction === 'harkonnen').length, 0)
}

// ── the die itself changes with the game ───────────────────────
check('basic storms roll 2-6',
  [stormRollRange('basic').min, stormRollRange('basic').max], [2, 6])
check('advanced storms roll 1-6',
  [stormRollRange('advanced').min, stormRollRange('advanced').max], [1, 6])
check('the constants agree with the selector',
  [STORM_ROLL.max, STORM_ROLL_ADVANCED.min], [6, 1])

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
