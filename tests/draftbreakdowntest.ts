// The reinforce breakdown must add up to the troops actually granted, and each
// line must be the thing it claims to be.
//
// The header used to infer the continent bonus by subtracting a TERRITORIES-ONLY
// base from the total. calcReinforcements divides territories + city population,
// so every troop the cities earned landed in a figure labelled "continent bonus":
// three continents worth 11 with 15 population read as "+16 continent bonus".
import { calcReinforcements, totalContinentBonus } from '@/lib/gameLogic'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const ME = 'p1', THEM = 'p2'

function makeBoard(heldContinents: string[], cities: Record<string, Array<{ isMajor?: boolean; isDestroyed?: boolean; headquartersFactionId?: string }>> = {}): any {
  const t: any = {}
  for (const d of TERRITORY_DEFINITIONS) {
    t[d.id] = {
      id: d.id, name: d.name, continentId: d.continentId, adjacentIds: [],
      occupyingPlayerId: heldContinents.includes(d.continentId) ? ME : THEM,
      troops: 1, scars: [],
      cities: (cities[d.id] ?? []).map((c, i) => ({
        id: `${d.id}-c${i}`, name: `${d.name} City`, territoryId: d.id,
        isMajor: !!c.isMajor, isDestroyed: !!c.isDestroyed,
        headquartersFactionId: c.headquartersFactionId,
      })),
    }
  }
  return t
}

/** Mirrors the TurnControls header. */
function breakdown(territories: any, ctx: {
  namedContinents?: any; continentBonusModifiers?: any
  worldCapitalTerritoryId?: string | null; primitive?: boolean; roundUp?: boolean
} = {}) {
  const owned = Object.values(territories).filter((t: any) => t.occupyingPlayerId === ME) as any[]
  const cityPopulation = ctx.primitive ? 0 : owned.reduce((sum, t) => {
    if (ctx.worldCapitalTerritoryId && t.id === ctx.worldCapitalTerritoryId) return sum + 5
    return sum + t.cities.reduce(
      (n: number, c: any) => n + (c.isDestroyed || c.headquartersFactionId ? 0 : (c.isMajor ? 2 : 1)), 0)
  }, 0)
  const effective = owned.length + cityPopulation
  const baseTroops = Math.max(3, ctx.roundUp ? Math.ceil(effective / 3) : Math.floor(effective / 3))
  const bonus = totalContinentBonus(ME, territories, ctx)
  const total = calcReinforcements(ME, territories, !!ctx.roundUp, ctx.namedContinents ?? {},
    ctx.worldCapitalTerritoryId ?? null, !!ctx.primitive, ctx.continentBonusModifiers ?? [])
  return { territories: owned.length, cityPopulation, baseTroops, bonus, total }
}

/** What the old header reported as the "continent bonus". */
function oldBonus(territories: any, ctx: any = {}) {
  const owned = Object.values(territories).filter((t: any) => t.occupyingPlayerId === ME).length
  return calcReinforcements(ME, territories, false, {}, ctx.worldCapitalTerritoryId ?? null,
    false, ctx.continentBonusModifiers ?? []) - Math.max(3, Math.floor(owned / 3))
}

console.log('\n— the reported bug: cities inflating the "continent bonus" —')
{
  // Africa + Europe + Australia, with cities dotted about.
  const cities: any = {
    congo: [{}], egypt: [{}], ukraine: [{}], scandinavia: [{}],
    'northern-europe': [{}], indonesia: [{}],
    'new-guinea': [{ isMajor: true }], 'eastern-australia': [{ isMajor: true }],
  }
  const ctx = {
    namedContinents: { africa: { namedByPlayerId: ME } },
    continentBonusModifiers: [
      { continentId: 'europe', bonusDelta: -1 },
      { continentId: 'australia', bonusDelta: 1 },
    ],
  }
  const b = makeBoard(['africa', 'europe', 'australia'], cities)
  const r = breakdown(b, ctx)

  check('the continent bonus is the sum of the three continents', r.bonus === 4 + 4 + 3, String(r.bonus))
  check('city population is counted separately', r.cityPopulation === 10, String(r.cityPopulation))
  check('the lines add up to the troops granted', r.baseTroops + r.bonus === r.total,
    `${r.baseTroops} + ${r.bonus} != ${r.total}`)
  check('the OLD header over-reported the continent bonus', oldBonus(b, ctx) > r.bonus,
    `old ${oldBonus(b, ctx)} vs real ${r.bonus}`)
  check('...by exactly the troops the cities earned',
    oldBonus(b, ctx) - r.bonus === r.baseTroops - Math.max(3, Math.floor(r.territories / 3)) - 1,
    `old ${oldBonus(b, ctx)} real ${r.bonus} base ${r.baseTroops}`)
}

console.log('\n— the breakdown always reconciles —')
{
  const cases: Array<[string, string[], any, any]> = [
    ['no continents, no cities', [], {}, {}],
    ['one continent', ['australia'], {}, {}],
    ['cities but no continent', [], { congo: [{}], egypt: [{ isMajor: true }] }, {}],
    ['world capital', ['australia'], { brazil: [{ isMajor: true }] }, { worldCapitalTerritoryId: 'brazil' }],
    ['destroyed city pays nothing', ['africa'], { congo: [{ isDestroyed: true }] }, {}],
    ['an HQ is not population', ['africa'], { congo: [{ headquartersFactionId: 'aliens' }] }, {}],
    ['primitive weakness ignores cities', ['africa'], { congo: [{}], egypt: [{}] }, { primitive: true }],
    ['balk rounds up', ['africa'], { congo: [{}] }, { roundUp: true }],
    ['named + modified', ['australia'], {}, {
      namedContinents: { australia: { namedByPlayerId: ME } },
      continentBonusModifiers: [{ continentId: 'australia', bonusDelta: 1 }],
    }],
    ['whole map', ['north-america','south-america','europe','africa','asia','australia'], {}, {}],
  ]
  let allOk = true
  for (const [label, held, cities, ctx] of cases) {
    const r = breakdown(makeBoard(held, cities), ctx)
    if (r.baseTroops + r.bonus !== r.total) {
      allOk = false
      console.log(`   MISMATCH ${label}: ${r.baseTroops} + ${r.bonus} != ${r.total}`)
    }
  }
  check(`all ${cases.length} boards reconcile`, allOk)
}

console.log('\n— individual lines are honest —')
{
  // Brazil is in South America, so that continent has to be held for the
  // Capital to count at all — population is only ever counted on owned ground.
  const ctx = { worldCapitalTerritoryId: 'brazil' }
  const r = breakdown(makeBoard(['south-america'], { brazil: [{ isMajor: true }] }), ctx)
  check('the World Capital counts 5, not 5 + its major city', r.cityPopulation === 5, String(r.cityPopulation))
  check('a World Capital you do NOT hold counts nothing',
    breakdown(makeBoard(['australia'], { brazil: [{ isMajor: true }] }), ctx).cityPopulation === 0)

  const noCities = breakdown(makeBoard(['africa']))
  check('a board with no cities reports 0 population', noCities.cityPopulation === 0)
  check('and its base is territories / 3', noCities.baseTroops === Math.max(3, Math.floor(noCities.territories / 3)))

  const primitive = breakdown(makeBoard(['africa'], { congo: [{}], egypt: [{}] }), { primitive: true })
  check('Primitive weakness zeroes the population line', primitive.cityPopulation === 0)
  check('and still reconciles', primitive.baseTroops + primitive.bonus === primitive.total)
}

console.log('\n— the naming bonus reaches the header —')
{
  // The header used to pass {} for namedContinents, so it under-reported here.
  const b = makeBoard(['australia'])
  const named = { namedContinents: { australia: { namedByPlayerId: ME } } }
  check('unnamed is the printed 2', breakdown(b).bonus === 2)
  check('named by me is 3', breakdown(b, named).bonus === 3)
  check('named by someone else is still 2',
    breakdown(b, { namedContinents: { australia: { namedByPlayerId: THEM } } }).bonus === 2)
  check('and the total agrees', breakdown(b, named).baseTroops + 3 === breakdown(b, named).total)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
