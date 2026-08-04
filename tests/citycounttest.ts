// Counting cities: HQ stickers are not cities, razed cities are not cities, and
// the World Capital is exactly one.
//
// `territory.cities` also holds HQ stickers and destroyed cities. City Blitz
// filtered only `!isDestroyed`, so four captured enemy HQs completed it. And no
// city mission counted the World Capital, which — now that it genuinely destroys
// the city it covers — made City Domination HARDER after founding it.
import { checkMission } from '@/lib/missionLogic'
import { livingCities, countCitiesOn, calcReinforcements } from '@/lib/gameLogic'
import { initialTurnState } from '@/types/game'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const ME = 'p1', THEM = 'p2'

type CitySpec = { major?: boolean; destroyed?: boolean; hq?: string }
// A continent id with no size on the real map, so nothing here ever counts as a
// whole continent — these boards are about cities, and a stray continent bonus
// would muddy the reinforcement numbers. Continents have their own suite.
function terr(id: string, owner: string | null, cities: CitySpec[] = []): any {
  return {
    id, name: id, continentId: 'nowhere', adjacentIds: [], occupyingPlayerId: owner,
    troops: 1, scars: [],
    cities: cities.map((c, i) => ({
      id: `${id}-c${i}`, name: `${id} city ${i}`, territoryId: id,
      isMajor: !!c.major, isDestroyed: !!c.destroyed,
      headquartersFactionId: c.hq,
    })),
  }
}
const board = (...ts: any[]) => Object.fromEntries(ts.map(t => [t.id, t]))

const mission = (id: string, territories: any, conquered: string[] = [], wcId: string | null = null) =>
  checkMission(id, ME, territories, { turn: initialTurnState() } as any,
    { conqueredIds: conquered, conqueredViaSeaIds: [] }, 0,
    { worldCapitalTerritoryId: wcId })

console.log('\n— what counts as a city —')
{
  check('a plain city counts', countCitiesOn(terr('a', ME, [{}])) === 1)
  check('a major city is still one city', countCitiesOn(terr('a', ME, [{ major: true }])) === 1)
  check('a razed city counts for nothing', countCitiesOn(terr('a', ME, [{ destroyed: true }])) === 0)
  check('an HQ is NOT a city', countCitiesOn(terr('a', ME, [{ hq: 'aliens' }])) === 0)
  check('a city with an HQ beside it counts once',
    countCitiesOn(terr('a', ME, [{ hq: 'aliens' }, {}])) === 1)
  check('bare ground counts nothing', countCitiesOn(terr('a', ME)) === 0)
  check('a missing territory counts nothing', countCitiesOn(undefined) === 0)
  check('livingCities agrees',
    livingCities(terr('a', ME, [{}, { destroyed: true }, { hq: 'x' }])).length === 1)
}

console.log('\n— the World Capital is one city —')
{
  const t = terr('cap', ME, [{ major: true }])
  check('without the Capital it is one city (its major)', countCitiesOn(t, null) === 1)
  check('as the Capital it is still exactly one', countCitiesOn(t, 'cap') === 1)
  check('a Capital on bare ground is one city',
    countCitiesOn(terr('cap', ME), 'cap') === 1)
  check('a Capital whose covered city is destroyed is still one',
    countCitiesOn(terr('cap', ME, [{ major: true, destroyed: true }]), 'cap') === 1)
  check('no double dip: a Capital over TWO stickers is one',
    countCitiesOn(terr('cap', ME, [{ major: true }, {}]), 'cap') === 1)
}

console.log('\n— City Domination (6 cities) —')
{
  const five = board(...['a','b','c','d','e'].map(id => terr(id, ME, [{}])))
  check('five cities is not enough', !mission('mc-6-cities', five))

  const sixth = { ...five, f: terr('f', ME, [{}]) }
  check('six completes it', mission('mc-6-cities', sixth))

  const withHqs = { ...five, g: terr('g', ME, [{ hq: 'aliens' }]), h: terr('h', ME, [{ hq: 'khan' }]) }
  check('two captured HQs do NOT top it up', !mission('mc-6-cities', withHqs))

  const withCapital = { ...five, cap: terr('cap', ME) }
  check('the World Capital IS the sixth city', mission('mc-6-cities', withCapital, [], 'cap'))
  check('...and without it being the Capital, it is not',
    !mission('mc-6-cities', withCapital, [], null))

  // The regression the Capital used to cause: it replaced a city, and not
  // counting it left the player a city short of where they started.
  const before = board(...['a','b','c','d','e'].map(id => terr(id, ME, [{}])), terr('cap', ME, [{ major: true }]))
  check('six cities including the one the Capital will cover', mission('mc-6-cities', before))
  const after = board(...['a','b','c','d','e'].map(id => terr(id, ME, [{}])),
    terr('cap', ME, [{ major: true, destroyed: true }]))
  check('after the Capital covers it, still six', mission('mc-6-cities', after, [], 'cap'))

  check('someone else\'s cities do not count',
    !mission('mc-6-cities', board(...['a','b','c','d','e','f'].map(id => terr(id, THEM, [{}])))))
}

console.log('\n— City Blitz (4 cities conquered this turn) —')
{
  const ids = ['a','b','c','d']
  const cities = board(...ids.map(id => terr(id, ME, [{}])))
  check('four conquered cities completes it', mission('mc-4-cities-turn', cities, ids))
  check('three does not', !mission('mc-4-cities-turn', cities, ids.slice(0, 3)))

  const hqs = board(...ids.map(id => terr(id, ME, [{ hq: 'aliens' }])))
  check('four conquered enemy HQs do NOT complete it — the reported bug',
    !mission('mc-4-cities-turn', hqs, ids))

  const razed = board(...ids.map(id => terr(id, ME, [{ destroyed: true }])))
  check('four razed cities do not either', !mission('mc-4-cities-turn', razed, ids))

  const mixed = board(terr('a', ME, [{}]), terr('b', ME, [{ hq: 'x' }]),
    terr('c', ME, [{ major: true }]), terr('d', ME, [{}]))
  check('a mix of two real cities and an HQ falls short',
    !mission('mc-4-cities-turn', mixed, ids))

  const withCap = board(terr('a', ME, [{}]), terr('b', ME, [{}]), terr('c', ME, [{}]), terr('cap', ME))
  check('taking the World Capital counts as a city conquered',
    mission('mc-4-cities-turn', withCap, ['a','b','c','cap'], 'cap'))

  check('a territory you conquered then LOST does not count',
    !mission('mc-4-cities-turn', board(...ids.map(id => terr(id, THEM, [{}]))), ids))
}

console.log('\n— population is unchanged by the refactor —')
{
  // calcReinforcements now shares livingCities; the numbers must not move.
  const b = board(
    terr('a', ME, [{}]),                       // minor  +1
    terr('b', ME, [{ major: true }]),          // major  +2
    terr('c', ME, [{ destroyed: true }]),      // razed   0
    terr('d', ME, [{ hq: 'aliens' }]),         // HQ      0
    terr('e', THEM, [{ major: true }]),        // not mine
  )
  // 4 owned + 3 population = 7 -> floor(7/3) = 2, raised to the minimum 3
  check('cities pay population, HQs and ruins do not',
    calcReinforcements(ME, b, false, {}, null, false, []) === 3)
  const many = board(...Array.from({ length: 12 }, (_, i) => terr(`t${i}`, ME, [{ major: true }])))
  // 12 owned + 24 population = 36 -> 12
  check('a bigger board divides territories + population',
    calcReinforcements(ME, many, false, {}, null, false, []) === 12)
  const withHq = board(...Array.from({ length: 12 }, (_, i) =>
    terr(`t${i}`, ME, i === 0 ? [{ hq: 'x' }, { major: true }] : [{ major: true }])))
  check('an HQ alongside a city does not add population',
    calcReinforcements(ME, withHq, false, {}, null, false, []) === 12)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
