// Riot and Resistance, reworked.
//
// Both used to pick ONE player and hand them a choice — lowest roll removes 2
// troops wherever they like; fewest territories places 3 troops wherever they
// like. Both now resolve on the board with no choices at all:
//
//   Riot        every MAJOR city rolls, +1 per troop and per HQ on it. Under 6
//               and it loses troops equal to the NATURAL die, its HQ is
//               demolished, and an emptied territory goes uncontrolled.
//   Resistance  every MINOR city holding 1 or 2 troops loses one; a city on its
//               last troop is abandoned.
import {
  resolveRiot, resolveResistance, riotCityTerritoryIds, RIOT_SAFE_ROLL,
} from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const major = () => ({ id: `mc${Math.random()}`, name: 'Major', isMajor: true, isDestroyed: false })
const minor = () => ({ id: `nc${Math.random()}`, name: 'Minor', isMajor: false, isDestroyed: false })
const hq = (factionId: string) => ({ id: `hq${Math.random()}`, name: 'HQ', isMajor: false, isDestroyed: false, headquartersFactionId: factionId })
const T = (id: string, owner: string | null, troops: number, cities: any[] = []) =>
  ({ id, name: id, continentId: 'nowhere', occupyingPlayerId: owner, troops, cities,
     adjacentIds: [], shape: '', labelX: 0, labelY: 0, scars: [] })
/** A die that returns a fixed sequence, so every outcome here is exact. */
const dice = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length] }

console.log('\n— which cities roll —')
{
  const terrs: any = {
    bigcity:  T('bigcity', 'p1', 3, [major()]),
    smallcity: T('smallcity', 'p1', 3, [minor()]),
    bare:     T('bare', 'p1', 9, []),
    razed:    T('razed', 'p1', 3, [{ ...major(), isDestroyed: true }]),
    hqonly:   T('hqonly', 'p1', 3, [hq('aliens')]),
    unowned:  T('unowned', null, 0, [major()]),
  }
  const ids = riotCityTerritoryIds(terrs)
  check('a major city rolls', ids.includes('bigcity'))
  check('a minor city does not', !ids.includes('smallcity'))
  check('bare ground does not', !ids.includes('bare'))
  check('a destroyed major city does not', !ids.includes('razed'))
  check('an HQ alone is not a major city', !ids.includes('hqonly'))
  check('an unowned major city has nobody to roll', !ids.includes('unowned'))
  check('exactly one city rolls here', ids.length === 1, ids.join(','))
}

console.log('\n— the modifier decides IF, the natural die decides HOW MUCH —')
{
  const terrs: any = { city: T('city', 'p1', 2, [major()]) }
  // roll 3 + 2 troops = 5, under 6 → suffers, loses the NATURAL 3 (capped at 2)
  const [r] = resolveRiot(terrs, dice(3))
  check('the modified roll is roll + troops', r.modified === 5)
  check('under 6 it suffers', r.suffers)
  check('it loses the NATURAL roll, not the modified one', r.roll === 3)
  check('capped at what is actually there', r.troopsLost === 2)
  check('and the territory empties', r.becomesUncontrolled)

  // The case above cannot tell the two apart — min(3,2) and min(5,2) are both
  // 2, so the cap hides which number was used. This one can: 3 troops, roll 1.
  // Modified 4, so it suffers; natural loss is 1, modified loss would be 3.
  const distinguishes: any = { city: T('city', 'p1', 3, [major()]) }
  const [d] = resolveRiot(distinguishes, dice(1))
  check('a low roll on a fuller city still fails', d.suffers && d.modified === 4)
  check('and loses only the NATURAL 1, not the modified 4', d.troopsLost === 1, String(d.troopsLost))
  check('so the garrison survives', !d.becomesUncontrolled)

  // The same city with one more troop is safe: 3 + 3 = 6.
  const safer: any = { city: T('city', 'p1', 3, [major()]) }
  const [s] = resolveRiot(safer, dice(3))
  check('exactly 6 is safe', s.modified === RIOT_SAFE_ROLL && !s.suffers)
  check('a safe city loses nothing', s.troopsLost === 0)
  check('and is not abandoned', !s.becomesUncontrolled)
}

console.log('\n— HQs add to the roll and are demolished on a failure —')
{
  const withHq: any = { city: T('city', 'p1', 1, [major(), hq('mutants')]) }
  // roll 3 + 1 troop + 1 HQ = 5 → suffers
  const [r] = resolveRiot(withHq, dice(3))
  check('the HQ adds 1 to the roll', r.hqCount === 1 && r.modified === 5)
  check('it still suffers', r.suffers)
  check('the HQ is demolished', r.hqFactionIds.join(',') === 'mutants')
  check('the last troop is lost', r.troopsLost === 1 && r.becomesUncontrolled)

  // Same city, roll 4 → 4 + 1 + 1 = 6 → safe, and the HQ survives.
  const [safe] = resolveRiot(withHq, dice(4))
  check('a safe city keeps its HQ', safe.hqFactionIds.length === 0)
  check('and loses nothing', safe.troopsLost === 0)

  const twoHqs: any = { city: T('city', 'p1', 1, [major(), hq('aliens'), hq('mutants')]) }
  const [t] = resolveRiot(twoHqs, dice(2))
  check('two HQs add 2', t.hqCount === 2 && t.modified === 2 + 1 + 2)
  check('both are demolished when it fails', t.suffers && t.hqFactionIds.length === 2)
}

console.log('\n— one roll per city, not per player —')
{
  const terrs: any = {
    a: T('a', 'p1', 1, [major()]),
    b: T('b', 'p1', 9, [major()]),
    c: T('c', 'p2', 1, [major()]),
  }
  // Sorted ids drive the roll order: a, b, c
  const rs = resolveRiot(terrs, dice(1, 1, 1))
  check('three cities, three rolls', rs.length === 3)
  check('p1 rolled twice', rs.filter(r => r.playerId === 'p1').length === 2)
  check('the thin one fails', rs.find(r => r.territoryId === 'a')!.suffers)
  check('the fat one holds on the same roll', !rs.find(r => r.territoryId === 'b')!.suffers)
  check('one player can lose one city and keep another',
    rs.find(r => r.territoryId === 'a')!.suffers && !rs.find(r => r.territoryId === 'b')!.suffers)
  check("the other player's city is judged on its own", rs.find(r => r.territoryId === 'c')!.suffers)
}

console.log('\n— the World Capital does not roll —')
{
  // It replaced the major city on its territory, so it carries no city:major
  // sticker — and it is exempt by rule, not by accident.
  const terrs: any = { brazil: T('brazil', 'p1', 1, []), congo: T('congo', 'p1', 1, [major()]) }
  const ids = riotCityTerritoryIds(terrs)
  check('the World Capital territory is not in the roll list', !ids.includes('brazil'))
  check('an ordinary major city still is', ids.includes('congo'))
  check('so a Riot cannot touch it', resolveRiot(terrs, dice(1)).every(r => r.territoryId !== 'brazil'))
}

console.log('\n— every roll value behaves —')
{
  // 1 troop, no HQ: safe only when the die alone reaches 5 (5 + 1 = 6).
  for (let roll = 1; roll <= 6; roll++) {
    const terrs: any = { city: T('city', 'p1', 1, [major()]) }
    const [r] = resolveRiot(terrs, dice(roll))
    const shouldSuffer = roll + 1 < RIOT_SAFE_ROLL
    check(`roll ${roll} with 1 troop ${shouldSuffer ? 'suffers' : 'holds'}`, r.suffers === shouldSuffer)
    if (shouldSuffer) check(`  and loses ${Math.min(roll, 1)}`, r.troopsLost === Math.min(roll, 1))
  }
  const empty = resolveRiot({}, dice(1))
  check('no major cities means no rolls', empty.length === 0)
}

console.log('\n— Resistance thins the weakly-held minor cities —')
{
  const terrs: any = {
    one:    T('one', 'p1', 1, [minor()]),
    two:    T('two', 'p1', 2, [minor()]),
    three:  T('three', 'p1', 3, [minor()]),
    majorc: T('majorc', 'p1', 1, [major()]),
    bare:   T('bare', 'p1', 1, []),
    enemy:  T('enemy', 'p2', 2, [minor()]),
    razed:  T('razed', 'p1', 1, [{ ...minor(), isDestroyed: true }]),
  }
  const rs = resolveResistance(terrs)
  const ids = rs.map(r => r.territoryId)
  check('a 1-troop minor city is hit', ids.includes('one'))
  check('a 2-troop minor city is hit', ids.includes('two'))
  check('a 3-troop minor city is not', !ids.includes('three'))
  check('a major city is not', !ids.includes('majorc'))
  check('bare ground is not', !ids.includes('bare'))
  check('a destroyed city is not', !ids.includes('razed'))
  check("an enemy's minor city IS — it hits every player", ids.includes('enemy'))
  check('three cities in total — two of p1s and one of p2s', rs.length === 3, String(rs.length))

  check('the 1-troop city is abandoned', rs.find(r => r.territoryId === 'one')!.becomesUncontrolled)
  check('the 2-troop city is not', !rs.find(r => r.territoryId === 'two')!.becomesUncontrolled)
  check('it reports what was there before', rs.find(r => r.territoryId === 'two')!.troopsBefore === 2)
}

console.log('\n— Resistance on a board with nothing to hit —')
{
  const fat: any = { a: T('a', 'p1', 5, [minor()]), b: T('b', 'p1', 4, [minor()]) }
  check('well-garrisoned minor cities are untouched', resolveResistance(fat).length === 0)
  check('an empty board is safe', resolveResistance({}).length === 0)
  const unowned: any = { a: T('a', null, 1, [minor()]) }
  check('an unowned minor city is skipped', resolveResistance(unowned).length === 0)
}

console.log('\n— both are pure: same board, same dice, same answer —')
{
  const terrs = () => ({ city: T('city', 'p1', 2, [major()]), small: T('small', 'p1', 1, [minor()]) }) as any
  check('Riot is reproducible',
    JSON.stringify(resolveRiot(terrs(), dice(2))) === JSON.stringify(resolveRiot(terrs(), dice(2))))
  check('Resistance is deterministic',
    JSON.stringify(resolveResistance(terrs())) === JSON.stringify(resolveResistance(terrs())))
  const before = terrs()
  resolveRiot(before, dice(1)); resolveResistance(before)
  check('neither mutates the board it was given',
    before.city.troops === 2 && before.small.troops === 1)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
