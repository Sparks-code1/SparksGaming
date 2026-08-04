// City stickers are a fixed campaign supply: 5 major, 9 minor. A city that is
// ruined, covered or razed is SPENT — its sticker stays in `stickers` and is
// recorded in `destroyedCities`. Deleting the sticker (as the Ruin used to)
// hands the slot back and lets an extra city be founded later.
import { citiesLostOn, worldCapitalReplacedCities } from '@/lib/gameLogic'
import { applyLegacyToTerritories } from '@/lib/legacyApi'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const S = (id: string, targetId: string, description: string, name = id) =>
  ({ id, name, description, placement: 'territory', targetId, appliedInGame: 1 })

const NINE_MINORS = Array.from({ length: 9 }, (_, i) =>
  S(`minor-${i}`, `t${i}`, 'city:minor', `City ${i}`))

const minorsPlaced = (stickers: any[]) =>
  stickers.filter(s => s.description === 'city:minor').length

console.log('\n— a ruined minor city does not free its slot —')
{
  const stickers = [...NINE_MINORS]
  check('nine minor cities are placed', minorsPlaced(stickers) === 9)

  const ruined = citiesLostOn(stickers, [], 't4', 'aliens', 5, { minorOnly: true })
  check('the ruin takes exactly one city', ruined.replaced.length === 1)
  check('and names it', ruined.replacedNames[0] === 'City 4')
  check('recorded against the Aliens in the right game',
    ruined.replaced[0].destroyedByPlayerId === 'aliens' && ruined.replaced[0].destroyedInGame === 5)

  // The sticker list is NOT filtered — that is the whole point.
  check('the tally is still nine, so no tenth city can be founded',
    minorsPlaced(stickers) === 9)

  // What the old code did, for contrast.
  const oldWay = stickers.filter(s => !(s.targetId === 't4' && s.description === 'city:minor'))
  check('...whereas deleting the sticker left only eight and opened a slot',
    minorsPlaced(oldWay) === 8)
}

console.log('\n— but the city is gone from the board —')
{
  const stickers = [...NINE_MINORS]
  const ruined = citiesLostOn(stickers, [], 't4', 'aliens', 5, { minorOnly: true })
  const legacy: any = {
    scars: [], stickers, destroyedCities: ruined.replaced, destroyedHqs: [],
    renamedTerritories: [], ruinTerritoryIds: ['t4'],
  }
  const blank = (id: string) => ({ id, name: id, continentId: 'x', adjacentIds: [],
    occupyingPlayerId: null, troops: 0, scars: [], cities: [] })
  const rebuilt: any = applyLegacyToTerritories(
    { t3: blank('t3'), t4: blank('t4') } as any, legacy)

  check('the ruined territory has no living city',
    rebuilt.t4.cities.filter((c: any) => !c.isDestroyed).length === 0)
  check('the sticker is still there, marked destroyed',
    rebuilt.t4.cities.length === 1 && rebuilt.t4.cities[0].isDestroyed === true)
  check('it records the game it was lost', rebuilt.t4.cities[0].destroyedInGame === 5)
  check('a neighbouring city is untouched',
    rebuilt.t3.cities.filter((c: any) => !c.isDestroyed).length === 1)
}

console.log('\n— the Ruin only ever takes a MINOR city —')
{
  const stickers = [
    S('maj', 'cap', 'city:major', 'Grand City'),
    S('min', 'cap', 'city:minor', 'Little City'),
  ]
  const minorOnly = citiesLostOn(stickers, [], 'cap', 'aliens', 5, { minorOnly: true })
  check('the major city survives a ruin', minorOnly.replacedNames.join(',') === 'Little City')
  // The World Capital, by contrast, covers whatever is there.
  const capital = worldCapitalReplacedCities(stickers, [], 'cap', 'p1', 5)
  check('the World Capital still covers both',
    capital.replacedNames.sort().join(',') === 'Grand City,Little City')
}

console.log('\n— re-running is safe —')
{
  const stickers = [...NINE_MINORS]
  const first = citiesLostOn(stickers, [], 't4', 'aliens', 5, { minorOnly: true })
  const second = citiesLostOn(stickers, first.replaced, 't4', 'aliens', 6, { minorOnly: true })
  check('a city already destroyed is not recorded twice', second.replaced.length === 0)
  check('an untouched territory yields nothing',
    citiesLostOn(stickers, [], 'nowhere', 'aliens', 5, { minorOnly: true }).replaced.length === 0)
  check('missing inputs are safe',
    citiesLostOn(null, null, 't4', 'aliens', 5, { minorOnly: true }).replaced.length === 0)
}

console.log('\n— HQs and fortifications are not cities —')
{
  const stickers = [
    S('hq', 't4', 'HQ:aliens'),
    S('fort', 't4', 'fortification:7'),
    S('min', 't4', 'city:minor', 'Doomed'),
  ]
  const ruined = citiesLostOn(stickers, [], 't4', 'aliens', 5, { minorOnly: true })
  check('only the city is recorded', ruined.replaced.map(r => r.cityId).join(',') === 'min')
  // The component removes the HQ and fortification stickers outright — neither is
  // a limited supply — so confirm they are not caught by the city helper.
  check('the HQ sticker is left to the caller', !ruined.replaced.some(r => r.cityId === 'hq'))
  check('so is the fortification', !ruined.replaced.some(r => r.cityId === 'fort'))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
