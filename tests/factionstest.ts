// Faction data. Four of six are filled in; this suite is written so the last two
// are checked the moment they are added rather than needing new assertions.
import { FACTIONS, FACTION_IDS, factionById, ATREIDES, EMPEROR, FREMEN, SPACING_GUILD } from '@/data/dune/factions'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { Faction } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const written = Object.values(FACTIONS).filter(Boolean) as Faction[]

// ── the roster ───────────────────────────────────────────────────────────────
check('six factions in the game', FACTION_IDS.length, 6)
check('ids are unique', new Set(FACTION_IDS).size, 6)
check('all six written', written.length, 6)
check('every written faction is one of the six',
  written.every(f => FACTION_IDS.includes(f.id)), true)
check('the key agrees with the id inside',
  Object.entries(FACTIONS).every(([k, f]) => f?.id === k), true)
check('every faction comes back by id',
  FACTION_IDS.map(id => factionById(id)?.id ?? null), [...FACTION_IDS])

// ── whatever is written must be complete ─────────────────────────────────────
// Applies to the four still to come without needing a line each.
for (const f of written) {
  check(`${f.id}: has a name`, f.name.length > 0, true)
  check(`${f.id}: spice is a number`, typeof f.startingSpice, 'number')
  check(`${f.id}: five leaders`, f.leaders.length, 5)
  check(`${f.id}: every leader strength is a number`,
    f.leaders.every(l => typeof l.strength === 'number' && l.strength > 0), true)
  check(`${f.id}: leader names are unique`,
    new Set(f.leaders.map(l => l.name)).size, f.leaders.length)
  check(`${f.id}: has at least one ability`, Object.keys(f.abilities).length > 0, true)

  // Forces: a count and a place that agree with each other.
  const { onPlanet, placement, reserves, starred } = f.forces
  check(`${f.id}: force counts are numbers`,
    [onPlanet, reserves, starred].every(n => typeof n === 'number' && n >= 0), true)
  check(`${f.id}: starting on planet implies somewhere to start`,
    onPlanet > 0 ? placement.kind !== 'reserve-only' : placement.kind === 'reserve-only', true)

  // The link that would otherwise rot: a faction cannot begin in a territory the
  // board does not have. This is the assertion that caught the draft naming
  // Sietch Tabr and pointing at Rim Wall West.
  const startsIn = placement.kind === 'fixed' ? [placement.territoryId]
    : placement.kind === 'distribute' ? [...placement.among]
    : []
  for (const id of startsIn) {
    check(`${f.id}: ${id} is a territory the board actually has`,
      DUNE_TERRITORIES.some(t => t.id === id), true)
  }
  if (placement.kind === 'distribute') {
    check(`${f.id}: more than one territory to distribute among`, placement.among.length > 1, true)
    check(`${f.id}: no territory listed twice`,
      new Set(placement.among).size, placement.among.length)
  }

  // Starred are a SUBSET of the forces, not extra. If that reading is wrong this
  // is where it shows up, rather than in a setup that deals the wrong pieces.
  check(`${f.id}: starred forces fit inside the total`,
    starred <= onPlanet + reserves, true)
}

// ── the two written, specifically ────────────────────────────────────────────
// Named rather than merely valid. A wrong-but-real id passes every structural
// check above; only naming the expected place catches it.
const nameOf = (id: string) => DUNE_TERRITORIES.find(t => t.id === id)?.displayName
check('Atreides start in Arrakeen', nameOf('territory-13'), 'Arrakeen')
check("the Guild starts in Tuek's Sietch", nameOf('territory-33'), "Tuek's Sietch")
check('the Fremen spread across the three named sietches and walls',
  FREMEN.forces.placement.kind === 'distribute'
    ? FREMEN.forces.placement.among.map(nameOf)
    : null,
  ['Sietch Tabr', 'False Wall South', 'False Wall West'])
check('Atreides revive two free', ATREIDES.freeRevivals, 2)
check('Atreides have powers in three phases',
  Object.keys(ATREIDES.abilities).sort(), ['battle', 'bidding', 'movement'])

check('the Fremen distribute rather than start in one place',
  FREMEN.forces.placement.kind, 'distribute')
check('the Fremen have three Fedaykin', FREMEN.forces.starred, 3)
check('only the Fremen and the Guild have a special victory',
  written.filter(x => x.specialVictory).map(x => x.id).sort(), ['fremen', 'spacing-guild'])
check('the Guild starts five on planet', SPACING_GUILD.forces.onPlanet, 5)

// Dune is symmetric in forces: every faction fields the same number, split
// differently. Asserted across all six rather than per faction, so the check
// does not need the rulebook — only that they agree with each other.
const totals = written.map(x => ({ id: x.id, total: x.forces.onPlanet + x.forces.reserves }))
check('every faction fields the same number of forces',
  totals.map(t => t.total), totals.map(() => 20))

check('the Emperor starts entirely in reserve',
  [EMPEROR.forces.onPlanet, EMPEROR.forces.placement.kind], [0, 'reserve-only'])
check('the Emperor has five Sardaukar', EMPEROR.forces.starred, 5)
check('...within twenty forces', EMPEROR.forces.reserves, 20)

// ── the draft's editor accidents are gone ────────────────────────────────────
// dealScarCards is a real function in src/data/scarCards.ts that autocomplete
// pasted into the rules text. It is the kind of thing that survives a proofread
// because it looks like code rather than a misspelling.
const allText = written.flatMap(f => [
  f.alliance, f.specialVictory ?? '',
  ...Object.values(f.advanced), ...Object.values(f.abilities),
]).join(' ')
check('no code tokens left in the prose', /dealScarCards|turnKey/.test(allText), false)
check('no known misspellings left',
  /strenght|oppent|focing|cammpt|Kwiastaz|anoy |paided|Sardukar|forrces|inthe |NExus|tunr /.test(allText), false)
check('the rules text survived — it was not just emptied',
  allText.length > 4000, true)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
