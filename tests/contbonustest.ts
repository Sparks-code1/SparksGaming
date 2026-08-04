// "Have a total continent bonus of 7 or more troops" must be judged on the
// troops the player actually collects — printed bonus + campaign modifiers + 1
// for a continent they named. The mission used to read only the printed values,
// so a player collecting 7 could be told they had not reached 7.
import { checkMission } from '@/lib/missionLogic'
import {
  calcReinforcements, totalContinentBonus, continentBonusFor, continentsHeldInFull,
} from '@/lib/gameLogic'
import { TERRITORY_DEFINITIONS, CONTINENT_BONUSES } from '@/data/territoryData'
import { initialTurnState } from '@/types/game'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const ME = 'p1', THEM = 'p2'

/** A board where `owner` holds every territory of each continent in `held`. */
function board(held: string[], owner = ME): any {
  const t: any = {}
  for (const d of TERRITORY_DEFINITIONS) {
    t[d.id] = {
      id: d.id, name: d.name, continentId: d.continentId, adjacentIds: [],
      occupyingPlayerId: held.includes(d.continentId) ? owner : THEM,
      troops: 1, scars: [], cities: [],
    }
  }
  return t
}

const mission = (territories: any, ctx: any = {}) =>
  checkMission('mc-7-continent-bonus', ME, territories,
    { turn: initialTurnState() } as any,
    { conqueredIds: [], conqueredViaSeaIds: [] }, 0, ctx)

/** The continent-bonus part of what calcReinforcements actually pays. */
const paid = (territories: any, ctx: any = {}) =>
  calcReinforcements(ME, territories, false, ctx.namedContinents ?? {}, null, false,
    ctx.continentBonusModifiers ?? [])
  - calcReinforcements(ME, territories, false, {}, null, false,
    [{ continentId: 'x', bonusDelta: 0 }])
  + totalContinentBonus(ME, territories, {})

console.log('\n— printed bonuses, no campaign changes —')
{
  check('asia alone is 7 and completes', mission(board(['asia'])))
  check('australia alone (2) does not', !mission(board(['australia'])))
  check('africa + south america (5) does not', !mission(board(['africa', 'south-america'])))
  check('north america + australia (7) completes', mission(board(['north-america', 'australia'])))
  check('holding nothing whole does not', !mission(board([])))
  check('a partial continent pays nothing', totalContinentBonus(ME, (() => {
    const t = board(['asia']); const first = Object.values(t).find((x: any) => x.continentId === 'asia') as any
    first.occupyingPlayerId = THEM; return t
  })(), {}) === 0)
}

console.log('\n— a winner-reward modifier counts (the reported bug) —')
{
  // Ryan's campaign: Australia +1, Europe -1.
  const mods = [
    { continentId: 'australia', bonusDelta: 1 },
    { continentId: 'europe', bonusDelta: -1 },
  ]
  const b = board(['africa', 'australia'])
  check('printed total is only 5', totalContinentBonus(ME, b, {}) === 5,
    String(totalContinentBonus(ME, b, {})))
  check('with the +1 reward it is 6', totalContinentBonus(ME, b, { continentBonusModifiers: mods }) === 6)
  check('...still short, so the mission holds', !mission(b, { continentBonusModifiers: mods }))

  const b2 = board(['north-america', 'australia'])
  check('NA + Australia pays 8 with the reward',
    totalContinentBonus(ME, b2, { continentBonusModifiers: mods }) === 8)
  check('and completes', mission(b2, { continentBonusModifiers: mods }))

  // A negative modifier must be able to BLOCK a mission the printed value passes.
  const b3 = board(['europe', 'australia'])
  check('Europe + Australia is 7 on the printed board', totalContinentBonus(ME, b3, {}) === 7)
  check('but 7 after -1 and +1 cancel out',
    totalContinentBonus(ME, b3, { continentBonusModifiers: mods }) === 7)
  const harsh = [{ continentId: 'europe', bonusDelta: -3 }]
  check('a -3 on Europe drops it to 4 and blocks the mission',
    !mission(b3, { continentBonusModifiers: harsh }),
    String(totalContinentBonus(ME, b3, { continentBonusModifiers: harsh })))
}

console.log('\n— naming a continent counts, for its namer only —')
{
  const named = { australia: { namedByPlayerId: ME }, africa: { namedByPlayerId: THEM } }
  const b = board(['north-america', 'australia'])
  check('printed is 7', totalContinentBonus(ME, b, {}) === 7)
  check('my named continent makes it 8', totalContinentBonus(ME, b, { namedContinents: named }) === 8)

  // The case that fails without the naming bonus: exactly 7 only because of it.
  const b2 = board(['africa', 'australia', 'south-america'])  // 3 + 2 + 2 = 7 printed
  const thin = board(['australia', 'north-america'])
  void thin
  check('africa+australia+SA is 7 printed and completes', mission(b2))

  // Someone else's naming must not help me.
  const b3 = board(['africa', 'south-america'])   // 5 printed
  check("another player's named continent adds nothing to mine",
    totalContinentBonus(ME, b3, { namedContinents: named }) === 5,
    String(totalContinentBonus(ME, b3, { namedContinents: named })))
  check('...so the mission still fails', !mission(b3, { namedContinents: named }))
}

console.log('\n— the exact reported shape: 7 collected, mission said no —')
{
  // Africa (3) + Australia (2 printed, +1 reward, +1 named by me) = 3 + 4 = 7.
  const ctx = {
    continentBonusModifiers: [{ continentId: 'australia', bonusDelta: 1 }],
    namedContinents: { australia: { namedByPlayerId: ME } },
  }
  const b = board(['africa', 'australia'])
  check('the player collects 7', totalContinentBonus(ME, b, ctx) === 7,
    String(totalContinentBonus(ME, b, ctx)))
  check('the OLD printed-only maths saw 5',
    ['africa', 'australia'].reduce((s, c) => s + (CONTINENT_BONUSES as any)[c], 0) === 5)
  check('the mission now completes', mission(b, ctx))
}

console.log('\n— mission and reinforcements never disagree —')
{
  const ctx = {
    continentBonusModifiers: [
      { continentId: 'australia', bonusDelta: 1 },
      { continentId: 'europe', bonusDelta: -1 },
    ],
    namedContinents: {
      asia: { namedByPlayerId: ME }, australia: { namedByPlayerId: ME },
      africa: { namedByPlayerId: THEM },
    },
  }
  const combos = [
    [], ['australia'], ['africa'], ['asia'], ['europe'], ['south-america'], ['north-america'],
    ['africa', 'australia'], ['africa', 'south-america'], ['europe', 'australia'],
    ['north-america', 'australia'], ['asia', 'australia'],
    ['africa', 'australia', 'south-america'], ['north-america', 'south-america', 'africa'],
  ]
  let agree = true, checked = 0
  for (const held of combos) {
    const b = board(held)
    const collected = totalContinentBonus(ME, b, ctx)
    // Reinforcements = base + this same total, so recovering it must match.
    const viaReinforcements = calcReinforcements(
      ME, b, false, ctx.namedContinents as any, null, false, ctx.continentBonusModifiers)
    const owned = Object.values(b).filter((t: any) => t.occupyingPlayerId === ME).length
    const base = Math.max(3, Math.floor(owned / 3))
    if (viaReinforcements - base !== collected) { agree = false; console.log('   mismatch on', held) }
    if (mission(b, ctx) !== (collected >= 7)) { agree = false; console.log('   mission disagrees on', held, collected) }
    checked++
  }
  check(`all ${checked} holdings agree between payout and mission`, agree)
}

console.log('\n— helper edge cases —')
{
  check('an unknown continent is worth nothing', continentBonusFor('atlantis', ME) === 0)
  check('a modifier cannot push a bonus below 0',
    continentBonusFor('australia', ME, { continentBonusModifiers: [{ continentId: 'australia', bonusDelta: -99 }] }) === 0)
  check('...but its namer still collects 1',
    continentBonusFor('australia', ME, {
      continentBonusModifiers: [{ continentId: 'australia', bonusDelta: -99 }],
      namedContinents: { australia: { namedByPlayerId: ME } },
    }) === 1)
  check('modifiers on the same continent stack',
    continentBonusFor('australia', ME, { continentBonusModifiers: [
      { continentId: 'australia', bonusDelta: 1 }, { continentId: 'australia', bonusDelta: 2 }] }) === 5)
  check('continentsHeldInFull lists only whole continents',
    continentsHeldInFull(ME, board(['africa', 'australia'])).sort().join(',') === 'africa,australia')
  check('an empty board holds nothing', continentsHeldInFull(ME, board([])).length === 0)
  check('no context is the printed value', continentBonusFor('asia', ME) === 7)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
