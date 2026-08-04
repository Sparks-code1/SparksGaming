// Where an AI drops a bonus troop it did not draft (the Resistance event).
//
// It used to be `Object.values(territories).find(t => t.occupyingPlayerId === id)`
// — whatever came first in map order, quite possibly deep in friendly territory.
// These troops arrive outside the AI's turn and cannot be attacked with, so the
// only useful place for them is the front.
import { aiBonusTroopTarget } from '@/lib/ai'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const ME = 'p1', THEM = 'p2'
type Spec = { owner: string | null; troops?: number; adj: string[]; hq?: boolean; cities?: Array<{ major?: boolean; destroyed?: boolean; hq?: string }> }
function world(spec: Record<string, Spec>): any {
  const territories: any = {}
  for (const [id, s] of Object.entries(spec)) {
    territories[id] = {
      id, name: id, continentId: 'nowhere', adjacentIds: s.adj,
      occupyingPlayerId: s.owner, troops: s.troops ?? 1, scars: [],
      activeHqPlayerId: s.hq ? s.owner : undefined,
      cities: (s.cities ?? []).map((c, i) => ({
        id: `${id}-c${i}`, name: `${id} city`, territoryId: id,
        isMajor: !!c.major, isDestroyed: !!c.destroyed, headquartersFactionId: c.hq,
      })),
    }
  }
  return { territories, players: [{ id: ME }, { id: THEM }] }
}

console.log('\n— it goes to the front, not the first territory in map order —')
{
  // `rear` sorts first and is entirely surrounded by friends; `front` faces the enemy.
  const w = world({
    rear:  { owner: ME,   adj: ['middle'] },
    middle:{ owner: ME,   adj: ['rear', 'front'] },
    front: { owner: ME,   adj: ['middle', 'enemy'] },
    enemy: { owner: THEM, adj: ['front'], troops: 6 },
  })
  check('the old logic would have picked the rear', Object.keys(w.territories)[0] === 'rear')
  check('it picks the border territory', aiBonusTroopTarget(w, ME) === 'front')
}

console.log('\n— among borders, the one under most pressure —')
{
  const w = world({
    quiet: { owner: ME,   adj: ['smallEnemy'], troops: 5 },
    hot:   { owner: ME,   adj: ['bigEnemy'],   troops: 2 },
    smallEnemy: { owner: THEM, adj: ['quiet'], troops: 2 },
    bigEnemy:   { owner: THEM, adj: ['hot'],   troops: 12 },
  })
  check('the threatened border wins', aiBonusTroopTarget(w, ME) === 'hot')
}
{
  // Same enemy strength, different garrisons: reinforce the thinner one.
  const w = world({
    thick: { owner: ME, adj: ['e1'], troops: 9 },
    thin:  { owner: ME, adj: ['e2'], troops: 1 },
    e1: { owner: THEM, adj: ['thick'], troops: 5 },
    e2: { owner: THEM, adj: ['thin'],  troops: 5 },
  })
  check('the thinner garrison wins', aiBonusTroopTarget(w, ME) === 'thin')
}

console.log('\n— ground worth more breaks a tie —')
{
  const w = world({
    plain: { owner: ME, adj: ['e1'], troops: 3 },
    withCity: { owner: ME, adj: ['e2'], troops: 3, cities: [{ major: true }] },
    e1: { owner: THEM, adj: ['plain'], troops: 4 },
    e2: { owner: THEM, adj: ['withCity'], troops: 4 },
  })
  check('a major city outweighs bare ground', aiBonusTroopTarget(w, ME) === 'withCity')

  const hq = world({
    plain: { owner: ME, adj: ['e1'], troops: 3 },
    base:  { owner: ME, adj: ['e2'], troops: 3, hq: true },
    e1: { owner: THEM, adj: ['plain'], troops: 4 },
    e2: { owner: THEM, adj: ['base'],  troops: 4 },
  })
  check('an HQ outweighs bare ground', aiBonusTroopTarget(hq, ME) === 'base')

  const razed = world({
    plain: { owner: ME, adj: ['e1'], troops: 3 },
    ruined:{ owner: ME, adj: ['e2'], troops: 3, cities: [{ major: true, destroyed: true }] },
    e1: { owner: THEM, adj: ['plain'], troops: 4 },
    e2: { owner: THEM, adj: ['ruined'], troops: 4 },
  })
  check('a razed city is worth nothing, so the tie falls to id order',
    aiBonusTroopTarget(razed, ME) === 'plain', String(aiBonusTroopTarget(razed, ME)))
}

console.log('\n— unowned neighbours count as a border —')
{
  const w = world({
    inner: { owner: ME, adj: ['edge'] },
    edge:  { owner: ME, adj: ['inner', 'empty'] },
    empty: { owner: null, adj: ['edge'], troops: 0 },
  })
  check('a territory beside empty ground is a border', aiBonusTroopTarget(w, ME) === 'edge')
}

console.log('\n— fallbacks —')
{
  const noBorder = world({
    a: { owner: ME, adj: ['b'], troops: 1 },
    b: { owner: ME, adj: ['a'], troops: 4 },
  })
  const pick = aiBonusTroopTarget(noBorder, ME)
  check('with no border at all it still picks something', pick === 'a' || pick === 'b', String(pick))

  check('a player holding nothing gets null',
    aiBonusTroopTarget(world({ a: { owner: THEM, adj: [] } }), ME) === null)
  check('an empty board gets null', aiBonusTroopTarget(world({}), ME) === null)
  check('a dangling adjacency does not crash',
    aiBonusTroopTarget(world({ a: { owner: ME, adj: ['ghost'] } }), ME) === 'a')
}

console.log('\n— deterministic —')
{
  const w = world({
    b: { owner: ME, adj: ['e'], troops: 2 },
    a: { owner: ME, adj: ['e'], troops: 2 },
    e: { owner: THEM, adj: ['a', 'b'], troops: 5 },
  })
  const runs = Array.from({ length: 20 }, () => aiBonusTroopTarget(w, ME))
  check('identical inputs give identical answers', new Set(runs).size === 1, JSON.stringify([...new Set(runs)]))
  check('ties break on id, so the earlier id wins', runs[0] === 'a', String(runs[0]))
}

console.log('\n— three troops spread rather than stack —')
{
  // The driver recomputes after each troop; simulate that.
  const w = world({
    hot:  { owner: ME, adj: ['e1'], troops: 1 },
    warm: { owner: ME, adj: ['e2'], troops: 1 },
    e1: { owner: THEM, adj: ['hot'],  troops: 8 },
    e2: { owner: THEM, adj: ['warm'], troops: 7 },
  })
  const placed: string[] = []
  for (let i = 0; i < 3; i++) {
    const id = aiBonusTroopTarget(w, ME)!
    placed.push(id)
    w.territories[id] = { ...w.territories[id], troops: w.territories[id].troops + 1 }
  }
  check('the troops do not all land on one territory', new Set(placed).size > 1, placed.join(','))
  check('the hottest border is reinforced first', placed[0] === 'hot')
  check('all three were placed', placed.length === 3)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
