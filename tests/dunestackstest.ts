// Two factions in a territory, drawn as two.
//
// WHY THIS EXISTS. Every stack was drawn at its cell's anchor — the same
// coordinates for all of them — so a second faction landed exactly on top of
// the first and the board showed one. It surfaced as the Bene Gesserit advisor
// covering the Atreides at setup, but nothing about it was to do with setup:
// any two factions sharing a territory drew as one, at every point in the game.
//
// THE CLAIM THAT MATTERS is not that the bubbles look nice. Two factions in a
// territory is the precondition for a battle, so a board that draws them as one
// is a board that hides the fights — and it hides them silently, in the one
// place a player would expect to see them. Everything below is about that: six
// factions all visible, none on top of another, none pushed over a border into
// a territory they are not in, and none shrunk past the point where the number
// on it can be read.
import {
  fanOut, stacksByCell, territoryHolds, cellAt, cellRoom, BUBBLE_R, BUBBLE_MIN_R,
} from '@/components/dune/DuneBoard'
import type { DuneBoardStack } from '@/components/dune/DuneBoard'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const round = (n: number) => Math.round(n * 1000) / 1000
/** The closest any two bubbles in a layout come to each other, centre to centre. */
const closest = (slots: { x: number; y: number }[]) => {
  let d = Infinity
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    d = Math.min(d, Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y))
  }
  return d
}
/** How far the layout reaches from the anchor. */
const reach = (slots: { x: number; y: number; r: number }[]) =>
  Math.max(...slots.map(s => Math.hypot(s.x, s.y) + s.r))

const ROOMY = 60

// ── one faction, drawn exactly as it always was ───────────────────────────
//
// THE QUIET CASE MUST NOT MOVE. Most cells hold one stack, and a fix for the
// crowded ones that redrew the other ninety per cent would be a change nobody
// asked for on a board people have learned to read.
{
  check('a lone stack sits on the anchor', fanOut(1, ROOMY), [{ x: 0, y: 0, r: BUBBLE_R }])
  // EVEN IN A CELL WITH NO ROOM. It has always sat proud of the tightest
  // slivers and nobody has needed it to do otherwise; shrinking it now would
  // be solving a problem that has never been reported.
  check('...at full size however tight the cell', fanOut(1, 0.5)[0].r, BUBBLE_R)
  check('nothing is drawn for nobody', fanOut(0, ROOMY), [])
}

// ── every faction gets a bubble, up to all six ────────────────────────────
{
  for (let n = 2; n <= 6; n++) {
    check(`${n} factions get ${n} bubbles`, fanOut(n, ROOMY).length, n)
  }
  // NONE OF THEM ON TOP OF ANOTHER, which is the whole bug. Two bubbles of
  // radius r overlap when their centres are closer than 2r.
  for (let n = 2; n <= 6; n++) {
    const slots = fanOut(n, ROOMY)
    check(`...and with ${n} none covers another`,
      round(closest(slots)) >= round(2 * slots[0].r), true)
  }
  // AND THE SAME EVERY TIME. A board whose pieces swap places between renders,
  // with nothing having moved, is a board you cannot read at a glance.
  check('the layout does not wander', fanOut(4, ROOMY), fanOut(4, ROOMY))
}

// ── inside the territory, because the border is the rule ──────────────────
//
// WHICH TERRITORY a bubble sits in decides whether there is a battle. A ring
// that spilled over the outline would be saying a faction is somewhere it is
// not — a worse lie than the one being fixed.
{
  for (let n = 2; n <= 6; n++) {
    check(`${n} bubbles stay inside a cell with room for them`,
      round(reach(fanOut(n, ROOMY))) <= ROOMY, true)
  }
  // THE SQUEEZE IS REAL. More factions in the same room means smaller bubbles;
  // if they did not shrink, the ring would simply grow out of the territory.
  //
  // MEASURED IN A CELL WHERE THE FIT ACTUALLY BINDS. Between the full size and
  // the floor there is only so much give, and in a roomy cell six bubbles fit
  // at full size — flat is the RIGHT answer there, so a squeeze asserted at any
  // old room is an assertion that "never shrinks at all" also satisfies. Room
  // 17 is inside the band for both of these; the whole range from two to six
  // does not fit in the band at once, which is why this is a pair and not a
  // sequence.
  check('...by shrinking as the cell fills',
    fanOut(4, 17)[0].r < fanOut(2, 17)[0].r, true)
  // AND IN A ROOMY CELL IT DOES NOT SHRINK FOR NOTHING. Six factions with the
  // space for six full-size bubbles get six full-size bubbles.
  check('...and not when the cell has the space', fanOut(6, 40)[0].r, BUBBLE_R)
  check('...and never growing past the size a lone stack draws',
    [2, 3, 4, 5, 6].every(n => fanOut(n, 40)[0].r <= BUBBLE_R), true)
}

// ── but never smaller than you can read ───────────────────────────────────
//
// A FLOOR, NOT A FIT AT ANY COST. The tightest cell on the board has barely a
// pixel of clearance. A layout that always fit would draw six dots too small
// to carry a number, which loses the one thing a bubble exists to say —
// overflowing a border is something you can see and reason about, a faction
// you cannot see at all is not.
{
  const tight = fanOut(6, 1)
  check('six in a sliver are still six', tight.length, 6)
  check('...still legible', tight[0].r, BUBBLE_MIN_R)
  check('...and still not on top of one another',
    round(closest(tight)) >= round(2 * tight[0].r), true)
}

// ── the cells the real board actually has ─────────────────────────────────
//
// AGAINST THE GENERATED GEOMETRY, not a made-up number: `room` is measured off
// the territory outline by the board build, so this is the claim that the
// layout works on the board people will play on rather than in principle.
{
  const cells = DUNE_TERRITORIES.flatMap(t => t.cells.map(c => ({ t: t.id, c })))
  check('every cell was measured', cells.every(({ c }) => typeof c.room === 'number'), true)
  // NOT cellRoom AGAINST THE ROW IT READS — that compares the data with
  // itself and holds whatever the number is, including a stub that answers the
  // same thing everywhere. That the numbers are genuinely measured off the
  // artwork is the board build's claim, and spicedecktest runs its --check.
  // What is left for here is that they are real measurements of DIFFERENT
  // places, which is the property the layout depends on.
  check('...and the rooms are not one number repeated',
    new Set(cells.map(({ c }) => c.room)).size > cells.length / 2, true)
  check('...all of them on the board', cells.every(({ c }) => c.room > 0 && c.room < 433), true)
  // AN UNKNOWN CELL IS NOT A GENEROUS ONE. cellAt falls back to the centroid
  // for a sector the territory does not have; laying six bubbles out lavishly
  // on the strength of a lookup that already failed would put them anywhere.
  check('...and an unknown one is not laid out generously',
    cellRoom('territory-01', 'sector-99') <= 20, true)
  check('...with a real territory and a real sector still found',
    cellRoom('territory-01', 'sector-99') !== cellRoom('territory-01', 'sector-5'), true)

  // NO PAIR OF BUBBLES OVERLAPS ANYWHERE ON THE BOARD, at any occupancy.
  const overlapping = cells.filter(({ t, c }) => {
    for (let n = 2; n <= 6; n++) {
      const slots = fanOut(n, cellRoom(t, c.sector))
      if (round(closest(slots)) < round(2 * slots[0].r)) return true
    }
    return false
  })
  check('no cell on the board can hide a faction', overlapping.map(o => `${o.t}|${o.c.sector}`), [])

  // AND THE SPILL IS CONFINED TO THE SLIVERS.
  //
  // WHENEVER THE FLOOR DID NOT BIND, the size was worked out from the room the
  // cell has, so the ring must fit inside it. A cell is "roomy" here by exactly
  // that test — the bubbles came out bigger than the minimum — rather than by a
  // second copy of the arithmetic, which could agree with a broken layout.
  // Without this the floor would be free to paper over a fit that never works.
  const roomy = cells.filter(({ t, c }) => fanOut(2, cellRoom(t, c.sector))[0].r > BUBBLE_MIN_R)
  const spilling = roomy.filter(({ t, c }) =>
    round(reach(fanOut(2, cellRoom(t, c.sector)))) > round(cellRoom(t, c.sector)))
  check('a cell with room for two contains two', spilling.map(o => `${o.t}|${o.c.sector}`), [])
  check('...and most of the board has that room', roomy.length > cells.length * 0.8, true)
  // SIX IS THE HARD CASE and still fits in half the cells outright. Well under
  // that would mean the ring is the wrong shape for this board, not that the
  // board is cramped.
  const sixFits = cells.filter(({ t, c }) => fanOut(6, cellRoom(t, c.sector))[0].r > BUBBLE_MIN_R)
  check('...and half of it has room for all six', sixFits.length > cells.length * 0.5, true)
}

// ── grouped by cell, which is the unit troops occupy ──────────────────────
{
  const s = (faction: string, territoryId: string, sector: string, count = 1): DuneBoardStack =>
    ({ faction: faction as FactionId, territoryId, sector, count })

  const shared = stacksByCell([
    s('atreides', 'territory-01', 'sector-5'),
    s('bene-gesserit', 'territory-01', 'sector-5'),
  ])
  check('two factions in one cell are one group', shared.length, 1)
  check('...holding both', shared[0][1].length, 2)

  // TWO SECTORS OF ONE TERRITORY ARE TWO GROUPS. Troops occupy a (territory,
  // sector) pair: a stack in sector 5 dies to a storm there and one in sector 6
  // does not, so they cannot be piled onto a single anchor.
  const split = stacksByCell([
    s('atreides', 'territory-01', 'sector-5'),
    s('harkonnen', 'territory-01', 'sector-6'),
  ])
  check('two sectors of one territory are two groups', split.length, 2)
  check('...drawn in different places',
    cellAt('territory-01', 'sector-5')?.x !== cellAt('territory-01', 'sector-6')?.x, true)

  // A STACK OF NOTHING IS NOT A STACK. An empty entry taking a slot would push
  // the others apart around a gap.
  check('an emptied stack takes no room',
    stacksByCell([s('atreides', 'territory-01', 'sector-5'),
      s('fremen', 'territory-01', 'sector-5', 0)])[0][1].length, 1)

  // THE ORDER IS FIXED, whatever order the server sent them in. The same
  // factions must not swap seats in the ring between two renders.
  const forward = stacksByCell([
    s('atreides', 'territory-01', 'sector-5'),
    s('emperor', 'territory-01', 'sector-5'),
    s('fremen', 'territory-01', 'sector-5'),
  ])[0][1].map(x => x.faction)
  const backward = stacksByCell([
    s('fremen', 'territory-01', 'sector-5'),
    s('emperor', 'territory-01', 'sector-5'),
    s('atreides', 'territory-01', 'sector-5'),
  ])[0][1].map(x => x.faction)
  check('the ring is in a fixed order', forward, backward)

  // A FACTION'S FIGHTERS AND ADVISORS ARE DIFFERENT PIECES and must not be
  // collapsed into one bubble by a key that only knows the faction.
  const postures = stacksByCell([
    { ...s('bene-gesserit', 'territory-01', 'sector-5'), posture: 'fighter' },
    { ...s('bene-gesserit', 'territory-01', 'sector-5'), posture: 'advisor' },
  ])
  check('fighters and advisors are separate bubbles', postures[0][1].length, 2)
}

// ── one place for a battle, several places for the storm ──────────────────
//
// WHY THIS EXISTS. Battle is by TERRITORY and the storm is by SECTOR, so the
// two rules read the same board differently and the board has to answer both.
// The bubbles are laid out per cell because a stack in sector 9 dies to a storm
// there and one in sector 11 does not — but two clusters inside one outline are
// still one fight, and nothing on the board said so. A player would have had to
// notice two separate clusters and remember they were the same territory.
{
  const s = (faction: string, territoryId: string, sector: string,
    over: Partial<DuneBoardStack> = {}): DuneBoardStack =>
    ({ faction: faction as FactionId, territoryId, sector, count: 3, ...over })

  // NOT `.find(...)!`. A hold that has gone missing is exactly what several
  // of these checks are looking for, and asserting on a property of undefined
  // throws — which ends the suite on the FIRST wrong answer and hides every
  // assertion after it. An empty hold reports as a failure instead of a crash,
  // so one broken rule produces one red line and not a blackout.
  const one = (holds: ReturnType<typeof territoryHolds>, id: string) =>
    holds.find(h => h.territoryId === id)
    ?? { territoryId: id, factions: [] as FactionId[], cells: [], contested: false }

  // ── COUNTED ACROSS SECTORS, which is the point ──────────────────────────
  const split = territoryHolds([
    s('atreides', 'territory-27', 'sector-9'),
    s('harkonnen', 'territory-27', 'sector-11'),
  ])
  check('a territory is one hold however many sectors', split.length, 1)
  check('...naming both factions', one(split, 'territory-27').factions,
    ['atreides', 'harkonnen'])
  // THE FIGHT IS REAL EVEN THOUGH THE STACKS ARE NOT TOUCHING. This is the
  // case the bubbles cannot show on their own and the whole reason for the
  // outline: two clusters a long way apart, one battle.
  check('...and contested across the sector line', one(split, 'territory-27').contested, true)
  check('...with a cell to tether for each', one(split, 'territory-27').cells.length, 2)

  // ── ONE FACTION IN THREE SECTORS IS NOT A BATTLE ────────────────────────
  // It is one army spread out. Marking it contested would send people looking
  // for a fight that cannot happen.
  const spread = territoryHolds([
    s('fremen', 'territory-27', 'sector-9'),
    s('fremen', 'territory-27', 'sector-10'),
    s('fremen', 'territory-27', 'sector-11'),
  ])
  check('one faction spread over three sectors is not a battle',
    one(spread, 'territory-27').contested, false)
  // BUT IT IS STILL TETHERED. Three clusters of the same colour still read as
  // three places until something says otherwise.
  check('...and is still tethered together', one(spread, 'territory-27').cells.length, 3)

  // ── AN ADVISOR IS NOT A COMBATANT ───────────────────────────────────────
  // A Bene Gesserit advisor is in the territory and not in the battle — that
  // is the entire point of the posture. Counting it would light up every
  // territory they are watching as a fight.
  const watched = territoryHolds([
    s('atreides', 'territory-13', 'sector-10'),
    s('bene-gesserit', 'territory-13', 'sector-10', { posture: 'advisor', count: 1 }),
  ])
  check('an advisor watching does not make a battle',
    one(watched, 'territory-13').contested, false)
  check('...though it is still in the territory',
    one(watched, 'territory-13').factions.length, 2)
  // AND THE SAME PAIR FIGHTING DOES.
  const fighting = territoryHolds([
    s('atreides', 'territory-13', 'sector-10'),
    s('bene-gesserit', 'territory-13', 'sector-10', { posture: 'fighter', count: 1 }),
  ])
  check('...but the same two as fighters do', one(fighting, 'territory-13').contested, true)

  // ── A LONE OCCUPANT HAS NOTHING TO SAY ──────────────────────────────────
  // Most territories on a live board hold one faction in one sector. Neither
  // mark should appear, or the board is scribbled over with lines and rings
  // that mean nothing.
  const quiet = territoryHolds([s('atreides', 'territory-13', 'sector-10')])
  check('a lone stack is not contested', one(quiet, 'territory-13').contested, false)
  check('...and has nothing to tether', one(quiet, 'territory-13').cells.length, 1)

  // AN EMPTIED STACK HOLDS NOTHING. A territory somebody has just been thrown
  // out of must not stay ringed.
  check('a territory emptied of forces is not held',
    territoryHolds([s('atreides', 'territory-13', 'sector-10', { count: 0 })]).length, 0)
  // AND SPICE IS NOT A FACTION. A stack with no faction is board furniture.
  check('...nor is one holding nobody',
    territoryHolds([{ territoryId: 'territory-13', sector: 'sector-10', count: 4 }]).length, 0)

  // ── AND THE OUTLINE IS THE BOARD'S OWN ──────────────────────────────────
  // Traced from the artwork's path in the same build, not a second set of
  // coordinates: a highlight that is nearly the shape underneath reads as a
  // misprint, and one that drifts as the board is redrawn is worse.
  const withOutline = DUNE_TERRITORIES.filter(t => t.outline && t.outline.startsWith('M'))
  check('every territory carries the outline the board prints',
    withOutline.length, DUNE_TERRITORIES.length)
  check('...and they are not all the same shape',
    new Set(DUNE_TERRITORIES.map(t => t.outline)).size, DUNE_TERRITORIES.length)
}

// ── every anchor on its own ground ────────────────────────────────────────
// Habbanya Ridge Flat's sector-17 bubble sat INSIDE Habbanya Sietch — the
// island the Flat encloses — because the traced outlines are simple rings
// and the Flat's ring claims the Sietch's ground. The generator now carves
// islands out and guards its own output; this sweep holds the EMITTED data
// to the same law, so a regenerate that loses the fix fails here rather
// than on a table. Outlines are walked from the printed paths themselves,
// curves sampled, so the test needs nothing the shipped data does not carry.
{
  const flattenPath = (d: string): [number, number][] => {
    const toks = d.match(/[MLHVCZ]|-?\d*\.?\d+/g) ?? []
    const pts: [number, number][] = []
    let i = 0, x = 0, y = 0
    const num = () => Number(toks[i++])
    while (i < toks.length) {
      const cmd = toks[i]
      if (cmd === 'M' || cmd === 'L') { i++; x = num(); y = num(); pts.push([x, y]) }
      else if (cmd === 'H') { i++; x = num(); pts.push([x, y]) }
      else if (cmd === 'V') { i++; y = num(); pts.push([x, y]) }
      else if (cmd === 'C') {
        i++
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num()
        for (let k = 1; k <= 8; k++) {
          const u = k / 8, v = 1 - u
          pts.push([
            v*v*v*x + 3*v*v*u*x1 + 3*v*u*u*x2 + u*u*u*x3,
            v*v*v*y + 3*v*v*u*y1 + 3*v*u*u*y2 + u*u*u*y3,
          ])
        }
        x = x3; y = y3
      } else if (cmd === 'Z') { i++ }
      else { x = num(); y = num(); pts.push([x, y]) }  // bare pair: implicit lineto
    }
    return pts
  }
  const inPoly = (pt: [number, number], poly: [number, number][]) => {
    let hit = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j]
      if ((yi > pt[1]) !== (yj > pt[1])
        && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }

  const polys = new Map(DUNE_TERRITORIES.map(t => [t.id, flattenPath(t.outline)]))
  // which territories enclose which: every vertex inside is the test
  const hosts = new Map(DUNE_TERRITORIES.map(a => [a.id, new Set(DUNE_TERRITORIES
    .filter(b => b.id !== a.id && polys.get(a.id)!.every(p => inPoly(p, polys.get(b.id)!)))
    .map(b => b.id))]))

  const wrong: string[] = []
  for (const t of DUNE_TERRITORIES) {
    for (const c of t.cells) {
      const pt: [number, number] = [c.at.x, c.at.y]
      if (!inPoly(pt, polys.get(t.id)!)) wrong.push(`${t.id} ${c.sector} outside itself`)
      for (const o of DUNE_TERRITORIES) {
        if (o.id === t.id || hosts.get(t.id)!.has(o.id)) continue
        if (inPoly(pt, polys.get(o.id)!)) wrong.push(`${t.id} ${c.sector} inside ${o.id}`)
      }
    }
  }
  check('every cell anchor stands on its own ground', wrong, [])
  // the parser is proved on the very pair that failed: the Sietch IS inside
  // the Flat, and the Flat's anchors keep off the Sietch
  check('the Sietch is an island of the Flat',
    hosts.get('territory-38')!.has('territory-37'), true)
  const flat = DUNE_TERRITORIES.find(t => t.id === 'territory-37')!
  check('...and the Flat keeps off it',
    flat.cells.some(c => inPoly([c.at.x, c.at.y], polys.get('territory-38')!)), false)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
