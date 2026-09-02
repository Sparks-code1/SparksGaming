// The storm, phase 1. Counter-clockwise is INCREASING sector number on this
// board, because the numbering was chosen to run that way — so the wrap at
// 18 -> 1 is the case most likely to be got wrong, and it is tested hardest.
import { readFileSync, readdirSync } from 'node:fs'
import {
  sweptSectors, stormDestination, resolveStorm, isExposedToStorm, stormLosses,
  firstPlayerAfterStorm, seatsFromPositions, sectorIdsAreValid, territoriesInStorm, stormRollRange,
  beginStorm, resolveStormMove, SHIELD_WALL_PROTECTS,
  fremenForeknow, FOREKNOWN_FROM_TURN, stormRollPromised,
  STORM_START, SECTOR_COUNT, FIRST_STORM_ROLL, STORM_ROLL, STORM_ROLL_ADVANCED,
} from '@/lib/dune/storm'
import { DUNE_PLAYER_POSITIONS, DUNE_TERRITORIES } from '@/data/dune/boardData'
import { isAwaiting } from '@/lib/dune/phase'
import type { FactionId } from '@/types/Dune/Faction'
import type { Force, SectorId, TerritoryId } from '@/types/Dune/Game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const s = (n: number) => `sector-${n}` as SectorId
/** Every source file under a directory, for the sweeps that ask where a
 *  thing is allowed to appear. */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${dir}/${e.name}`)
      : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [])
// The Shield Wall stands unless a test says otherwise, which is the state
// every game starts in.
const num = (id: SectorId) => Number(id.slice('sector-'.length))
const INTACT = 'intact' as const
const DOWN = 'destroyed' as const
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
  isExposedToStorm({ territoryId: sand.id as TerritoryId, sector: s(7) }, swept, INTACT), true)
check('rock shelters what stands on it',
  isExposedToStorm({ territoryId: rock.id as TerritoryId, sector: s(7) }, swept, INTACT), false)
check('a stronghold shelters too',
  isExposedToStorm({ territoryId: hold.id as TerritoryId, sector: s(7) }, swept, INTACT), false)
check('the Polar Sink is never touched',
  isExposedToStorm({ territoryId: sink.id as TerritoryId, sector: s(7) }, swept, INTACT), false)
check('the Imperial Basin is sand but sheltered by name',
  isExposedToStorm({ territoryId: 'territory-05', sector: s(7) }, swept, INTACT), false)
check('...and the exception is really needed — it IS sand',
  DUNE_TERRITORIES.find(t => t.id === 'territory-05')?.terrain, 'sand')
check('sand in a sector the storm missed survives',
  isExposedToStorm({ territoryId: sand.id as TerritoryId, sector: s(12) }, swept, INTACT), false)

// The distinction the whole cell model exists for: one territory, two sectors,
// only one of them stormed.
const split = DUNE_TERRITORIES.find(t => t.terrain === 'sand' && t.sectors.length > 1 && t.id !== 'territory-05')!
const [a, b] = split.sectors as SectorId[]
check(`${split.displayName} spans ${split.sectors.length} sectors`, split.sectors.length > 1, true)
check('a storm in one of its sectors kills there',
  isExposedToStorm({ territoryId: split.id as TerritoryId, sector: a }, [a], INTACT), true)
check('...and spares the same territory in the other sector',
  isExposedToStorm({ territoryId: split.id as TerritoryId, sector: b }, [a], INTACT), false)

// ── spice ────────────────────────────────────────────────────────────────────
// This used to assert that spice is swept "even on rock", constructed by putting
// spice on a rock territory. Unifying the shape made that unrepresentable, and
// it turned out to be a state the board can never produce: all fifteen blow
// markers are on sand. The old shape let a caller place spice anywhere, so the
// test proved a rule against a position that cannot occur.
//
// What is actually true, and checkable: spice sits where its marker is, and the
// storm takes it when it sweeps that sector.
{
  const blowers = DUNE_TERRITORIES.filter(t => t.spiceSector != null)
  check('every spice marker on the board is on sand',
    blowers.filter(t => t.terrain !== 'sand').map(t => t.displayName), [])

  const here = blowers[0], elsewhere = blowers.find(t => t.spiceSector !== here.spiceSector)!
  const sweptSector = here.spiceSector as SectorId
  const out = resolveStorm(s(num(sweptSector) - 1), 1, [], 'basic', INTACT,
    { [here.id]: 6, [elsewhere.id]: 8 })
  check('spice in the swept sector goes to the bank',
    out.spiceCleared.map(c => c.territoryId), [here.id])
  check('...with the amount it lost', out.spiceCleared[0].amount, 6)
  check('spice outside the sweep stays', out.spiceOnBoard, { [elsewhere.id]: 8 })
}

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

  const basic = resolveStorm(from, 1, forces, 'basic', INTACT)
  check('basic: both stacks wiped', basic.killed.reduce((n, k) => n + k.count, 0), 8)
  check('...and nothing is left standing there', basic.forcesAfter.length, 0)

  const adv = resolveStorm(from, 1, forces, 'advanced', INTACT)
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

// ── the six seats, and the four that are usually empty ───────────────────────
// Dune seats two to six players around six fixed positions, so most games leave
// positions empty. Turn order is decided by which sector the storm reaches next,
// so an empty position must be stepped over exactly like any other empty sector.
const threw = (fn: () => unknown) => { try { fn(); return false } catch { return true } }
const P = (n: number) => `player-position-${n}`

check('the board gives every seat a sector',
  DUNE_PLAYER_POSITIONS.filter(p => !p.sectorId).map(p => p.id), [])
check('six seats, each in its own sector',
  new Set(DUNE_PLAYER_POSITIONS.map(p => p.sectorId)).size, 6)
// Seat numbers run clockwise; the storm runs counter-clockwise. Worth pinning,
// because reading them as the same direction reverses the whole turn order.
check('seat numbers ascend as sector numbers DESCEND by three',
  DUNE_PLAYER_POSITIONS.map(p => p.sectorId),
  ['sector-11', 'sector-8', 'sector-5', 'sector-2', 'sector-17', 'sector-14'])

// A seating plan is position -> faction. Empty positions are simply absent.
const seatAll: Record<string, FactionId> = {
  [P(1)]: 'atreides', [P(2)]: 'harkonnen', [P(3)]: 'emperor',
  [P(4)]: 'fremen', [P(5)]: 'spacing-guild', [P(6)]: 'bene-gesserit',
}
check('six players fill every position', seatsFromPositions(seatAll).length, 6)
check('an empty position is left out rather than seated as nobody',
  seatsFromPositions({ [P(1)]: 'atreides', [P(4)]: 'fremen' }).map(x => x.positionId),
  [P(1), P(4)])
check('a position explicitly set to null is empty too',
  seatsFromPositions({ [P(1)]: 'atreides', [P(2)]: null }).map(x => x.positionId), [P(1)])
check('nobody seated at all', seatsFromPositions({}), [])
check('the same faction in two chairs is refused',
  threw(() => seatsFromPositions({ [P(1)]: 'atreides', [P(3)]: 'atreides' })), true)

// ── two players, four empty positions ────────────────────────────────────────
// Positions 1 (sector-11) and 4 (sector-2) sit opposite each other.
{
  const two = seatsFromPositions({ [P(1)]: 'atreides', [P(4)]: 'fremen' })
  // Counter-clockwise from 11: 12..18, then 1, then 2. Fremen at 2 is reached
  // first even though four empty positions lie between.
  check('the storm steps over four empty positions to reach the next player',
    firstPlayerAfterStorm(s(11), two)?.faction, 'fremen')
  check('...and from the far side it comes back to the other one',
    firstPlayerAfterStorm(s(2), two)?.faction, 'atreides')
  // The storm sitting ON an empty position's sector must not seat anyone there.
  check('the storm resting on an EMPTY position seats nobody there',
    firstPlayerAfterStorm(s(14), two)?.faction, 'fremen')
  // Sector 5 is position 3's sector, also empty. Walking up from 5 the first
  // seat reached is Atreides at 11, not Fremen at 2 — the walk goes one way only.
  check('...and from an empty position on the other side', firstPlayerAfterStorm(s(5), two)?.faction, 'atreides')
}

// ── the empty seats are genuinely invisible ──────────────────────────────────
// The strongest form: for every storm sector, who goes first must not change
// when an unoccupied position is added to or removed from the board's seating.
{
  const occupied = { [P(2)]: 'harkonnen' as FactionId, [P(5)]: 'emperor' as FactionId }
  const same: string[] = []
  for (let i = 1; i <= 18; i++) {
    const withEmpties = seatsFromPositions({
      ...occupied, [P(1)]: null, [P(3)]: undefined, [P(4)]: null, [P(6)]: null,
    })
    const a = firstPlayerAfterStorm(s(i), seatsFromPositions(occupied))?.faction
    const b = firstPlayerAfterStorm(s(i), withEmpties)?.faction
    if (a !== b) same.push(`sector-${i}: ${a} vs ${b}`)
  }
  check('naming the empty positions changes nothing, in all 18 storm sectors', same, [])
}

// ── a seat with no sector is refused, not guessed at ─────────────────────────
// This is the shape you get building seats straight from the position markers
// before they carried a sector. The old code answered it with seats[0].
check('a seat carrying no sector is refused',
  threw(() => firstPlayerAfterStorm(s(1), [{ sector: undefined as unknown as SectorId }])), true)
check('a seat in a sector the board does not have is refused',
  threw(() => firstPlayerAfterStorm(s(1), [{ sector: 'sector-99' as SectorId }])), true)
check('a storm in no real sector is refused',
  threw(() => firstPlayerAfterStorm('sector-0' as SectorId, [{ sector: s(4) }])), true)

// ── one player is still answerable ───────────────────────────────────────────
{
  const solo = seatsFromPositions({ [P(3)]: 'emperor' })
  check('one seat goes first wherever the storm is',
    [1, 5, 6, 18].map(i => firstPlayerAfterStorm(s(i), solo)?.faction),
    ['emperor', 'emperor', 'emperor', 'emperor'])
  // Including when the storm sits in that seat's own sector: it waits a full
  // circle, which with one player is the same seat again.
  check('...even standing in the storm', firstPlayerAfterStorm(s(5), solo)?.faction, 'emperor')
}

// ── the roll ranges are the documented ones ──────────────────────────────────
check('first storm rolls 0–20', [FIRST_STORM_ROLL.min, FIRST_STORM_ROLL.max], [0, 20])
check('later storms roll 2–6', [STORM_ROLL.min, STORM_ROLL.max], [2, 6])

// ── the Shield Wall, and the two strongholds that hide behind it ────────────
// The trap this rule sets: while the wall stands, "protected by the wall" and
// "protected for being a stronghold" give the same answer for Arrakeen and
// Carthag, so nothing distinguishes them. They only come apart once it falls.
{
  const BASIN = 'territory-05' as TerritoryId    // sand
  const ARRAKEEN = 'territory-13' as TerritoryId // stronghold
  const CARTHAG = 'territory-26' as TerritoryId  // stronghold
  const OPEN_SAND = 'territory-07' as TerritoryId

  check('the wall covers exactly three territories',
    [...SHIELD_WALL_PROTECTS], [BASIN, ARRAKEEN, CARTHAG])

  // Standing: all three safe, whatever they are made of.
  for (const [name, id] of [['Imperial Basin', BASIN], ['Arrakeen', ARRAKEEN], ['Carthag', CARTHAG]] as const) {
    check(`wall intact: ${name} is sheltered`,
      isExposedToStorm({ territoryId: id, sector: s(4) }, [s(4)], INTACT), false)
  }

  // Fallen: all three burn — including the two that are strongholds, which is
  // the assertion that would pass for the wrong reason under the old terrain
  // rule and is the whole point of the change.
  for (const [name, id] of [['Imperial Basin', BASIN], ['Arrakeen', ARRAKEEN], ['Carthag', CARTHAG]] as const) {
    check(`wall down: ${name} is exposed`,
      isExposedToStorm({ territoryId: id, sector: s(4) }, [s(4)], DOWN), true)
  }

  // And the wall changes nothing anywhere else.
  check('a stronghold the wall does not cover stays sheltered either way',
    [INTACT, DOWN].map(w => isExposedToStorm({ territoryId: 'territory-33' as TerritoryId, sector: s(4) }, [s(4)], w)),
    [false, false])
  check('open sand burns either way',
    [INTACT, DOWN].map(w => isExposedToStorm({ territoryId: OPEN_SAND, sector: s(8) }, [s(8)], w)),
    [true, true])
  check('a sector the storm never reached is safe with the wall down',
    isExposedToStorm({ territoryId: OPEN_SAND, sector: s(8) }, [s(9)], DOWN), false)

  // The reasoning in StormOutcome.spiceCleared leans on this: the three the
  // wall covers hold no spice, so the wall never has to decide about spice.
  check('none of the three ever holds spice on the board',
    SHIELD_WALL_PROTECTS.filter(id => {
      const t = DUNE_TERRITORIES.find(x => x.id === id)
      return t?.spiceBlow != null || t?.spiceSector != null
    }), [])
}

// ── the seam between the roll and the move ─────────────────────────────────
// Family Atomics is played after the storm's movement is calculated and before
// it moves, so the wall has to be read at the END of that gap, not the start.
{
  // Arrakeen really is in sector 10, and the other stack is parked outside the
  // sweep so the only thing that can change between the two resolutions is the
  // wall.
  const forces = [stack('harkonnen', 'territory-13', 10), stack('harkonnen', 'territory-07', 8)]
  const step = beginStorm({ from: s(9), roll: 1, forces, mode: 'basic', mayInterrupt: ['harkonnen'] })
  check('the storm stops before it moves', step.status, 'awaiting')
  if (!isAwaiting(step)) throw new Error('unreachable')
  check('...and the window is offered, not demanded', step.need, 'optional')
  check('...naming what is about to happen',
    [step.ask.kind, step.ask.from, step.ask.to], ['before-the-storm-moves', s(9), s(10)])
  check('...with the sweep already known', step.ask.swept, [s(10)])
  check('nothing has moved yet', step.carry.forces.length, 2)

  // The same carry, resolved against two different walls. This is the rule:
  // the answer depends on the state AFTER the window, not before it.
  const spared = resolveStormMove(step.carry, INTACT)
  const burned = resolveStormMove(step.carry, DOWN)
  check('wall standing: Arrakeen keeps its forces',
    spared.killed.map(k => k.territoryId), [])
  check('wall brought down in the window: Arrakeen burns',
    burned.killed.map(k => k.territoryId), ['territory-13'])
  check('both storms still stop in the same place', [spared.to, burned.to], [s(10), s(10)])
  check('the stack outside the sweep is untouched either way',
    [spared.forcesAfter.length, burned.forcesAfter.length], [2, 1])
}

// ── spice: one shape, and amounts ──────────────────────────────────────────
{
  const spice = { 'territory-07': 6, 'territory-09': 8 }
  const t7 = DUNE_TERRITORIES.find(t => t.id === 'territory-07')
  const swept = [t7?.spiceSector as SectorId]
  const out = resolveStorm(s(num(swept[0]) - 1), 1, [], 'basic', INTACT, spice)
  check('spice is keyed by territory, as the spice blow keys it',
    out.spiceCleared.map(c => c.territoryId), ['territory-07'])
  check('...and the amount comes back with it', out.spiceCleared[0].amount, 6)
  check('...the storm returns the board rather than a list to apply by hand',
    out.spiceOnBoard, { 'territory-09': 8 })
}

// ── the Fremen see it coming ────────────────────────────────────────────
// THE CARD: "The first storm in the game is normal. All subsequent storms can
// move either 1-6 sectors and you get to know the number of sectors before
// the storm moves on the previous turn." So what they learn is NEXT turn's
// number, at the end of this one — this turn's is already public by then,
// published between the roll and the move so Family Atomics has its beat, and
// knowing a public number is no advantage at all.
{
  const ask = (over: Record<string, unknown> = {}) => fremenForeknow({
    mode: 'advanced', seated: true, nextTurn: 3, ...over,
  } as never)

  check('the advanced game only', [ask(), ask({ mode: 'basic' })], [true, false])
  check('...and only with the Fremen at the table', ask({ seated: false }), false)
  check('...and not through a Karama', ask({ suppressed: true }), false)

  // THE FIRST STORM IS NORMAL, which is the card's own exemption: nothing is
  // foretold about turn one, so the first thing they are ever told is turn
  // two's, at the end of turn one.
  check('turn one is the normal storm the card exempts',
    [ask({ nextTurn: 1 }), ask({ nextTurn: 2 }), ask({ nextTurn: 10 })],
    [false, true, true])
  check('...which is what the constant says', FOREKNOWN_FROM_TURN, 2)

  // ── the promise, and the two stores that keep it ───────────────────────
  // A NUMBER TOLD IN ADVANCE IS ONLY WORTH SOMETHING IF IT ARRIVES. The roll
  // is committed to match_decks — RLS on, no policy at all, so the table
  // cannot read what one seat was told — and every storm reads that before it
  // rolls anything fresh. Told and then re-rolled would be worse than never
  // telling them.
  const ep = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const at = ep.indexOf('const stormRollFor = async')
  check('the storm reads its promise before it rolls', at > 0, true)
  {
    const near = ep.slice(at, at + 900)
    check('...out of match_decks, under its own key',
      [near.includes("eq('deck', 'storm')"),
        near.includes('const promised = stormRollPromised(held, forTurn)'),
        near.includes('if (promised !== null) return promised')],
      [true, true, true])
  }

  // THE PROMISE ITSELF, exercised rather than read for.
  check('a promise for this turn is what moves the marker',
    stormRollPromised({ turn: 4, roll: 5 }, 4), 5)
  check('...and a promise for another turn is not',
    stormRollPromised({ turn: 3, roll: 5 }, 4), null)
  check('...nor is a promise that never got made',
    [stormRollPromised(null, 4), stormRollPromised(undefined, 4),
      stormRollPromised({}, 4), stormRollPromised({ turn: 4 }, 4)],
    [null, null, null, null])
  check('a promised nought is still a promise',
    stormRollPromised({ turn: 4, roll: 0 }, 4), 0)
  check('and nothing rolls the storm behind its back',
    (ep.match(/rollStorm\(/g) ?? []).length, 2)

  const fa = ep.indexOf('const foretellStorm = async')
  check('the end of a storm decides the next one', fa > 0, true)
  {
    const near = ep.slice(fa, fa + 1600)
    check('...for the turn after this one',
      near.includes('nextTurn: movedTurn + 1'), true)
    check('...into the Fremen row and the deck store, and nowhere public',
      [near.includes('stormAhead: { turn: nextTurn, roll }'),
        near.includes('decks: { storm: [{ turn: nextTurn, roll }] }'),
        near.includes('state.') && /p_state/.test(near)],
      [true, true, false])
    check('...and a Karama takes it away', near.includes('advanced.storm'), true)
  }

  // EVERY STORM THAT BLOWS TELLS THEM. There are three places a storm moves —
  // the owed first one, its second beat after the Atomics window, and a new
  // turn's — and a seat told on two turns out of three would learn nothing
  // except not to trust it.
  check('every path that moves the storm makes the next promise',
    (ep.match(/foretellStorm\(/g) ?? []).length, 3)

  // THE PRINTED BEAT, ON EVERY TURN THAT HAS ONE. The first storm published
  // its roll and waited so Family Atomics had a moment; every turn after it
  // rolled and moved in one press, so the card was playable on turn one and
  // never again.
  const entry = ep.indexOf("case 'Storm': {")
  check('a new turn\'s storm waits for the card too', entry > 0, true)
  {
    const near = ep.slice(entry, entry + 1200)
    check('...on the same test and the same window',
      [near.includes('const canAtomics = turn >= 2'), near.includes('mayAtomics('),
        near.includes('stormCarry: {')], [true, true, true])
  }

  // THE RAIL AND NOWHERE ELSE. It is one seat's knowledge and the whole of
  // its value is that the other five do not have it.
  const screenSrc = readFileSync('src/components/dune/DuneGameScreen.tsx', 'utf8')
  check('the number is drawn for the Fremen alone',
    screenSrc.includes("{seat === 'fremen' && own?.stormAhead"), true)
  check('...and stands down once that turn is public',
    screenSrc.includes('own.stormAhead.turn > state.turn'), true)
  // NOWHERE ELSE IN THE APP. Two sweeps, because one file and one place are
  // different questions: which files may name the field at all, and — inside
  // the screen — whether every mention of it sits in the one expression that
  // hands it to the rail. A second reader anywhere in that file is a second
  // surface waiting to render it.
  {
    const seen = walk('src').filter(f => readFileSync(f, 'utf8').includes('stormAhead'))
      .map(f => f.replace(/\\/g, '/')).sort()
    check('only the screen and the field itself name it', seen, [
      'src/components/dune/DuneGameScreen.tsx',
      'src/lib/dune/charity.ts',
    ])

    const only = screenSrc.indexOf("{seat === 'fremen' && own?.stormAhead")
    check('and inside the screen it is read in exactly one place',
      [...screenSrc.matchAll(/stormAhead/g)]
        .every(m => m.index! >= only && m.index! < only + 260),
      true)
  }
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
