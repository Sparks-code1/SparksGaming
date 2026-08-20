// Territory adjacency, derived from the outlines rather than hand-listed.
//
// The structural assertions matter more than the spot checks: a hand-written
// adjacency list rots one entry at a time, and the failure is always a single
// missing back-reference nobody notices until a move is illegal for no reason.
import { DUNE_TERRITORIES } from '@/data/dune/boardData'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const byId = new Map(DUNE_TERRITORIES.map(t => [t.id, t]))
const nameOf = (id: string) => byId.get(id)?.displayName ?? id

// ── every entry points at a real territory ───────────────────────────────────
check('every neighbour is a territory the board has',
  DUNE_TERRITORIES.flatMap(t => t.adjacent).filter(id => !byId.has(id)), [])
check('nothing borders itself',
  DUNE_TERRITORIES.filter(t => t.adjacent.includes(t.id)).map(t => t.id), [])
check('no territory is listed twice as a neighbour',
  DUNE_TERRITORIES.filter(t => new Set(t.adjacent).size !== t.adjacent.length).map(t => t.id), [])

// ── mutual ───────────────────────────────────────────────────────────────────
// The assertion a hand-written list always eventually fails.
const oneWay: string[] = []
for (const t of DUNE_TERRITORIES) {
  for (const other of t.adjacent) {
    if (!byId.get(other)?.adjacent.includes(t.id)) oneWay.push(`${t.id} -> ${other}`)
  }
}
check('adjacency is mutual', oneWay, [])

// ── nowhere is unreachable ───────────────────────────────────────────────────
check('no territory borders nothing',
  DUNE_TERRITORIES.filter(t => t.adjacent.length === 0).map(t => t.displayName), [])

// Stronger: the whole map is one connected region. A territory reachable from
// nowhere would pass every check above while still being unplayable.
{
  const seen = new Set<string>([DUNE_TERRITORIES[0].id])
  const queue = [DUNE_TERRITORIES[0].id]
  while (queue.length) {
    for (const next of byId.get(queue.pop() as string)?.adjacent ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
  }
  check('every territory is reachable from every other', seen.size, DUNE_TERRITORIES.length)
}

// ── the case the border test alone could not see ─────────────────────────────
// Habbanya Sietch is drawn as an island inside Habbanya Ridge Flat, so it shares
// no outline with anything. Enclosure is adjacency: there is no way in except
// through the flat around it. The generator refuses to emit a stranded
// territory, which is what surfaced this.
{
  const sietch = DUNE_TERRITORIES.find(t => t.displayName === 'Habbanya Sietch')
  check('Habbanya Sietch has exactly one neighbour', sietch?.adjacent.length, 1)
  check('...and it is the flat that encloses it',
    sietch?.adjacent.map(nameOf), ['Habbanya Ridge Flat'])
}

// ── shape of the whole thing ─────────────────────────────────────────────────
// Not magic numbers for their own sake: if a redraw changes the border count,
// that is worth a human looking rather than passing silently.
const borders = DUNE_TERRITORIES.reduce((n, t) => n + t.adjacent.length, 0) / 2
check('103 borders across the map', borders, 103)
check('every territory has at least one neighbour and at most ten',
  DUNE_TERRITORIES.every(t => t.adjacent.length >= 1 && t.adjacent.length <= 10), true)

// The Polar Sink sits at the centre and meets the inner end of many territories;
// a low number here would mean the centre had come apart.
check('the Polar Sink borders several territories',
  (DUNE_TERRITORIES.find(t => t.terrain === 'polar-sink')?.adjacent.length ?? 0) >= 5, true)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
