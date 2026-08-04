import {
  troopsAfterEntry, minTroopsToEnter, canAffordEntry, type EntryCost,
} from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const cost = (total: number, falloutHalf = false): EntryCost => ({ total, parts: [], falloutHalf })
const MAJOR = cost(2)
const MINOR = cost(1)
const CAPITAL = cost(5)

console.log('\n— the reported bug: major city, uncontested —')
{
  // Old behaviour was Math.max(1, moving - total): 2 in → 1 survived → 1 lost.
  check('3 in → 1 survives (2 lost)', troopsAfterEntry(3, MAJOR) === 1, String(troopsAfterEntry(3, MAJOR)))
  check('4 in → 2 survive (2 lost)', troopsAfterEntry(4, MAJOR) === 2)
  check('10 in → 8 survive (2 lost)', troopsAfterEntry(10, MAJOR) === 8)
  check('2 in → 0, i.e. illegal (was 1, refunding a troop)', troopsAfterEntry(2, MAJOR) === 0)
  check('1 in → 0, i.e. illegal (was 1, refunding both)', troopsAfterEntry(1, MAJOR) === 0)
  check('needs 3 troops moving in', minTroopsToEnter(MAJOR) === 3)
  check('a 3-stack cannot afford it (only 2 can move)', !canAffordEntry(3, MAJOR))
  check('a 4-stack can', canAffordEntry(4, MAJOR))
}

console.log('\n— the loss is always exactly the cost —')
{
  for (const c of [MINOR, MAJOR, CAPITAL, cost(3), cost(4)]) {
    const min = minTroopsToEnter(c)
    let ok = true
    for (let moving = min; moving <= min + 20; moving++) {
      if (moving - troopsAfterEntry(moving, c) !== c.total) { ok = false; break }
    }
    check(`cost ${c.total}: loss equals the cost at every legal size`, ok)
  }
}

console.log('\n— minor city and World Capital —')
{
  check('minor: 2 in → 1 survives', troopsAfterEntry(2, MINOR) === 1)
  check('minor: 1 in → illegal', troopsAfterEntry(1, MINOR) === 0)
  check('minor needs 2', minTroopsToEnter(MINOR) === 2)
  check('capital: 6 in → 1 survives', troopsAfterEntry(6, CAPITAL) === 1)
  check('capital: 5 in → illegal', troopsAfterEntry(5, CAPITAL) === 0)
  check('capital needs 6', minTroopsToEnter(CAPITAL) === 6)
}

console.log('\n— no cost at all —')
{
  check('undefined cost is free', troopsAfterEntry(1, undefined) === 1)
  check('zero cost is free', troopsAfterEntry(1, cost(0)) === 1)
  check('free entry needs just 1', minTroopsToEnter(cost(0)) === 1)
  check('a 2-stack can make a free move', canAffordEntry(2, cost(0)))
  check('a 1-stack cannot move at all', !canAffordEntry(1, cost(0)))
}

console.log('\n— Fallout Zone halving —')
{
  const fz = cost(0, true)
  check('halves after the cost: 4 in → 2', troopsAfterEntry(4, fz) === 2)
  check('rounds up: 3 in → 2', troopsAfterEntry(3, fz) === 2)
  check('1 in → 1 (never zero)', troopsAfterEntry(1, fz) === 1)
  const fzMajor = cost(2, true)
  check('major + fallout: 6 in → 2', troopsAfterEntry(6, fzMajor) === 2)
  check('major + fallout: 3 in → 1', troopsAfterEntry(3, fzMajor) === 1)
  check('major + fallout: 2 in → illegal', troopsAfterEntry(2, fzMajor) === 0)
  // Halving must never turn a legal move into an empty territory.
  let never0 = true
  for (let m = minTroopsToEnter(fzMajor); m <= 40; m++) if (troopsAfterEntry(m, fzMajor) < 1) never0 = false
  check('a legal move never lands 0 troops', never0)
}

console.log('\n— Alien Collaborator (+2) and Unpopular (+1) stack onto the city —')
{
  const collabMajor = cost(4)          // major 2 + collaborator 2
  check('needs 5 troops moving in', minTroopsToEnter(collabMajor) === 5)
  check('5 in → 1 survives (4 lost)', troopsAfterEntry(5, collabMajor) === 1)
  check('4 in → illegal', troopsAfterEntry(4, collabMajor) === 0)
  const unpopMajor = cost(3)           // major 2 + unpopular 1
  check('unpopular major: 4 in → 1 survives', troopsAfterEntry(4, unpopMajor) === 1)
  check('unpopular major needs 4', minTroopsToEnter(unpopMajor) === 4)
}

console.log('\n— monotonic: sending more never arrives with fewer —')
{
  let ok = true
  for (const c of [MINOR, MAJOR, CAPITAL, cost(2, true), cost(0, true)]) {
    let prev = -1
    for (let m = minTroopsToEnter(c); m <= 30; m++) {
      const v = troopsAfterEntry(m, c)
      if (v < prev) { ok = false; break }
      prev = v
    }
  }
  check('survivors never decrease as more troops move in', ok)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
