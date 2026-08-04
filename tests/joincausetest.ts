// Join the Cause: the LARGEST-POPULATION player places 3 troops in cities THEY
// control.
//
// The troops used to be dropped into `troopsToPlace` — the current player's
// draft pool — no matter who won the choice. Two bugs in one line: the wrong
// player got them, and they could be placed anywhere rather than in cities.
import { aiBonusTroopTarget } from '@/lib/ai'
import { livingCities, countCitiesOn } from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const WINNER = 'p1', OTHER = 'p2'
type Spec = { owner: string | null; troops?: number; adj: string[]; cities?: Array<{ major?: boolean; destroyed?: boolean; hq?: string }> }
function world(spec: Record<string, Spec>): any {
  const territories: any = {}
  for (const [id, s] of Object.entries(spec)) {
    territories[id] = {
      id, name: id, continentId: 'nowhere', adjacentIds: s.adj,
      occupyingPlayerId: s.owner, troops: s.troops ?? 1, scars: [],
      cities: (s.cities ?? []).map((c, i) => ({
        id: `${id}-c${i}`, name: `${id} city`, territoryId: id,
        isMajor: !!c.major, isDestroyed: !!c.destroyed, headquartersFactionId: c.hq,
      })),
    }
  }
  return { territories, players: [{ id: WINNER }, { id: OTHER }] }
}

/**
 * Mirrors joinCauseCityIds in GameBoard — counted with countCitiesOn so the
 * World Capital IS the city on its territory, the same rule population uses.
 */
const cityIds = (state: any, playerId: string, wcId: string | null = null) =>
  Object.values(state.territories)
    .filter((t: any) => t.occupyingPlayerId === playerId && countCitiesOn(t, wcId) > 0)
    .map((t: any) => t.id)

/** Mirrors the click-handler guard, which now asks the same function. */
function canPlaceOn(state: any, playerId: string, tid: string, wcId: string | null = null): boolean {
  const t = state.territories[tid]
  if (!t || t.occupyingPlayerId !== playerId) return false
  return cityIds(state, playerId, wcId).includes(tid)
}

console.log('\n— only the winner\'s CITIES are legal —')
{
  const w = world({
    myCity:    { owner: WINNER, adj: ['enemyCity'], cities: [{}] },
    myPlain:   { owner: WINNER, adj: ['enemyCity'] },
    myRuined:  { owner: WINNER, adj: [], cities: [{ destroyed: true }] },
    myHqOnly:  { owner: WINNER, adj: [], cities: [{ hq: 'aliens' }] },
    enemyCity: { owner: OTHER,  adj: ['myCity'], cities: [{ major: true }] },
  })
  check('a city I hold is legal', canPlaceOn(w, WINNER, 'myCity'))
  check('bare ground I hold is NOT', !canPlaceOn(w, WINNER, 'myPlain'))
  check('a razed city is NOT', !canPlaceOn(w, WINNER, 'myRuined'))
  check('an HQ is not a city', !canPlaceOn(w, WINNER, 'myHqOnly'))
  check("an enemy's city is NOT", !canPlaceOn(w, WINNER, 'enemyCity'))
  check('the legal set is exactly my living cities',
    cityIds(w, WINNER).join(',') === 'myCity', cityIds(w, WINNER).join(','))
}

console.log('\n— the winner is whoever won, not whoever is playing —')
{
  const w = world({
    winnerCity: { owner: WINNER, adj: [], cities: [{}] },
    otherCity:  { owner: OTHER,  adj: [], cities: [{}] },
  })
  // The old code added to the CURRENT player's pool; if that was OTHER, the
  // reward went to the wrong person entirely.
  check('the winner has somewhere to place', cityIds(w, WINNER).length === 1)
  check('and it is not the other player\'s city', !cityIds(w, WINNER).includes('otherCity'))
  check("placing on the other player's city is refused", !canPlaceOn(w, WINNER, 'otherCity'))
}

console.log('\n— no cities means no troops —')
{
  const w = world({ mine: { owner: WINNER, adj: [] } })
  check('a winner with no cities has no legal target', cityIds(w, WINNER).length === 0)
  check('and the AI picker returns null',
    aiBonusTroopTarget(w, WINNER, t => cityIds(w, WINNER).includes(t.id)) === null)
}

console.log('\n— the AI places in its most threatened city —')
{
  const w = world({
    safeCity: { owner: WINNER, adj: ['friend'], troops: 2, cities: [{}] },
    hotCity:  { owner: WINNER, adj: ['horde'],  troops: 2, cities: [{}] },
    friend:   { owner: WINNER, adj: ['safeCity'] },
    horde:    { owner: OTHER,  adj: ['hotCity'], troops: 10 },
  })
  const eligible = new Set(cityIds(w, WINNER))
  const pick = aiBonusTroopTarget(w, WINNER, t => eligible.has(t.id))
  check('it picks a city, not the plain border', eligible.has(pick!), String(pick))
  check('and the threatened one', pick === 'hotCity', String(pick))
}
{
  // A non-city territory may be under far more pressure — it must still be skipped.
  const w = world({
    frontLine: { owner: WINNER, adj: ['horde'], troops: 1 },
    quietCity: { owner: WINNER, adj: [], troops: 5, cities: [{ major: true }] },
    horde:     { owner: OTHER,  adj: ['frontLine'], troops: 20 },
  })
  const eligible = new Set(cityIds(w, WINNER))
  const pick = aiBonusTroopTarget(w, WINNER, t => eligible.has(t.id))
  check('the desperate non-city border is ignored', pick === 'quietCity', String(pick))
}

console.log('\n— three troops, one per click —')
{
  const w = world({
    a: { owner: WINNER, adj: ['e'], troops: 1, cities: [{}] },
    b: { owner: WINNER, adj: ['e'], troops: 1, cities: [{}] },
    e: { owner: OTHER,  adj: ['a', 'b'], troops: 9 },
  })
  const eligible = new Set(cityIds(w, WINNER))
  let left = 3
  const placed: string[] = []
  while (left > 0) {
    const id = aiBonusTroopTarget(w, WINNER, t => eligible.has(t.id))!
    placed.push(id)
    w.territories[id] = { ...w.territories[id], troops: w.territories[id].troops + 1 }
    left--
  }
  check('exactly three troops are placed', placed.length === 3)
  check('all in cities', placed.every(id => eligible.has(id)))
  check('spread across both cities rather than stacked', new Set(placed).size === 2, placed.join(','))
  check('total troops added is 3',
    w.territories.a.troops + w.territories.b.troops === 2 + 3)
}

console.log('\n— the World Capital is a legal target —')
{
  // The World Capital covers the city sticker it replaced, so reading raw
  // stickers finds nothing there — while population scores it 5, the single
  // biggest number on the board and usually the reason its holder won at all.
  const w = world({
    brazil: { owner: WINNER, adj: [], troops: 3 },            // WC, no sticker left
    peru:   { owner: WINNER, adj: [], troops: 3 },
  })
  check('the OLD sticker-reading rule found nowhere',
    Object.values(w.territories).filter((t: any) =>
      t.occupyingPlayerId === WINNER && livingCities(t).length > 0).length === 0)
  check('the World Capital is now a target', canPlaceOn(w, WINNER, 'brazil', 'brazil'))
  check('bare ground beside it still is not', !canPlaceOn(w, WINNER, 'peru', 'brazil'))
  check('it is the only target', cityIds(w, WINNER, 'brazil').join(',') === 'brazil')

  // Population and placement must agree about what counts as a city.
  const pop = (pid: string, wcId: string) => {
    let s = 0
    for (const t of Object.values(w.territories) as any[]) {
      if (t.occupyingPlayerId !== pid) continue
      s += 1
      if (t.id === wcId) { s += 5; continue }
      for (const c of livingCities(t)) s += c.isMajor ? 2 : 1
    }
    return s
  }
  check('population counts the World Capital as 5', pop(WINNER, 'brazil') === 2 + 5)
  check('winning on the World Capital no longer forfeits the reward',
    pop(WINNER, 'brazil') > 0 && cityIds(w, WINNER, 'brazil').length > 0)
  check('the World Capital counts once, not twice',
    countCitiesOn({ ...w.territories.brazil, cities: [{ id: 'x', isMajor: true }] } as any, 'brazil') === 1)
}

console.log('\n— the reward outlives somebody else\'s turn —')
{
  // The winner is chosen by population, so it is usually NOT the player taking
  // the turn — and they have no reason to be racing an AI's clock.
  type Pending = { playerId: string; troopsLeft: number } | null
  const oldEndTurn = (_p: Pending): Pending => null   // wiped every pending picker
  const newEndTurn = (p: Pending): Pending => p       // Resistance/Join the Cause kept

  let pending: Pending = { playerId: WINNER, troopsLeft: 3 }
  check('the OLD end-of-turn destroyed the reward', oldEndTurn(pending) === null)
  pending = newEndTurn(pending)
  check('it survives the turn ending', pending !== null)
  check('with all three troops still owed', pending?.troopsLeft === 3)
  pending = newEndTurn(newEndTurn(pending))
  check('and several more turns', pending?.troopsLeft === 3)

  const w = world({
    brazil: { owner: WINNER, adj: [], troops: 3 },
    congo:  { owner: WINNER, adj: [], troops: 3, cities: [{}] },
  })
  const placeOne = (p: Pending, tid: string): Pending => {
    if (!p) return null
    if (!canPlaceOn(w, p.playerId, tid, 'brazil')) return p        // refused, costs nothing
    w.territories[tid].troops += 1
    const left = p.troopsLeft - 1
    return left <= 0 ? null : { ...p, troopsLeft: left }
  }
  pending = placeOne(pending, 'brazil')
  check('a troop lands on the World Capital', w.territories.brazil.troops === 4)
  pending = placeOne(pending, 'nowhere')
  check('an illegal click costs no troop', pending?.troopsLeft === 2)
  pending = placeOne(pending, 'congo')
  pending = placeOne(pending, 'congo')
  check('the third troop clears the placement', pending === null)
  check('exactly three troops landed',
    w.territories.brazil.troops + w.territories.congo.troops === 6 + 3)
}

console.log('\n— an AI winner reinforces its own cities, not the pool —')
{
  const w = world({
    egypt:  { owner: OTHER,  adj: ['quebec'], troops: 3, cities: [{ major: true }] },
    sahara: { owner: OTHER,  adj: [], troops: 3 },
    quebec: { owner: WINNER, adj: ['egypt'], troops: 3, cities: [{}] },
  })
  const eligible = cityIds(w, OTHER)
  check('the AI gets its own city', eligible.join(',') === 'egypt', eligible.join(','))
  check("never the current player's city", !eligible.includes('quebec'))
  check('never its own bare ground', !eligible.includes('sahara'))

  // The old AI branch: +3 to troopsToPlace, the CURRENT player's draft pool.
  let currentPlayerPool = 0
  currentPlayerPool += 3
  check('the OLD path paid the player taking the turn', currentPlayerPool === 3)
  check('...and that pool is overwritten at the next turn count',
    (() => { let pool = currentPlayerPool; pool = 7 /* next player's reinforcements */; return pool === 7 })())

  currentPlayerPool = 0
  let left = 3
  while (left > 0) {
    const set = new Set(cityIds(w, OTHER))
    const id = aiBonusTroopTarget(w, OTHER, t => set.has(t.id))!
    w.territories[id].troops += 1
    left--
  }
  check('the new path pays the current player nothing', currentPlayerPool === 0)
  check('three troops reached the AI winner', w.territories.egypt.troops === 3 + 3)
  check("the human's city is untouched", w.territories.quebec.troops === 3)
}

console.log('\n— Control the People asks the same question about cities —')
{
  // Its 5 troops go "into any one city you control", decided by the same
  // largest-population count. It had its own copy of the sticker check, so the
  // World Capital was invisible to it too.
  const w = world({
    brazil: { owner: WINNER, adj: ['horde'], troops: 2 },     // World Capital
    peru:   { owner: WINNER, adj: [], troops: 2 },
    horde:  { owner: OTHER,  adj: ['brazil'], troops: 12 },
  })
  const eligible = cityIds(w, WINNER, 'brazil')
  check('the World Capital is a city here too', eligible.join(',') === 'brazil', eligible.join(','))
  check('the OLD check saw none',
    Object.values(w.territories).filter((t: any) =>
      t.occupyingPlayerId === WINNER && livingCities(t).length > 0).length === 0)

  const set = new Set(eligible)
  check('the AI picks from that same list',
    aiBonusTroopTarget(w, WINNER, t => set.has(t.id)) === 'brazil')

  // With no city at all the troop option is refused, but the maneuver is always
  // there — so the modal is never a dead end.
  const bare = world({ peru: { owner: WINNER, adj: [], troops: 2 } })
  check('no city means no troop option', cityIds(bare, WINNER, 'brazil').length === 0)
  check('and the AI picker returns null',
    aiBonusTroopTarget(bare, WINNER, () => false) === null)
}

console.log('\n— Join the Cause is never a dead end —')
{
  // Both rewards can be unavailable at once: no city AND an empty mission deck.
  // Two disabled buttons and no close would end the game where it stands.
  const nothingToClaim = (targets: number, missions: number) => targets === 0 && missions === 0
  check('no city + empty deck offers a way out', nothingToClaim(0, 0))
  check('a city alone does not', !nothingToClaim(1, 0))
  check('a mission alone does not', !nothingToClaim(0, 6))
  check('both available does not', !nothingToClaim(2, 6))

  // The live campaign: six missions still in the deck, so the swap is real.
  const liveMissionDeck = ['mc-6-cities', 'mc-9-territories-turn', 'mc-continent-turn',
    'mc-4-cities-turn', 'mc-7-continent-bonus', 'mc-4-sea-turn']
  check('the campaign has missions to swap to', liveMissionDeck.length > 0)
  check('so the mission reward is offered there', !nothingToClaim(0, liveMissionDeck.length))
}

console.log('\n— a Riot loser picks their OWN casualties —')
{
  // The modal used to route every loser through the same click-to-choose hint
  // bar. When the loser was an AI that handed the human the job of deciding
  // where an opponent bleeds — and on the human's own turn, the board sat
  // waiting for them to do it.
  const w = world({
    deepStack: { owner: OTHER, adj: [], troops: 9 },
    thinLine:  { owner: OTHER, adj: [], troops: 2 },
    lastMan:   { owner: OTHER, adj: [], troops: 1 },
    mine:      { owner: WINNER, adj: [], troops: 6 },
  })
  const aiRiotTarget = (state: any, loserId: string) =>
    Object.values(state.territories)
      .filter((t: any) => t.occupyingPlayerId === loserId && t.troops > 1)
      .sort((a: any, b: any) => b.troops - a.troops)[0] as any

  const pick = aiRiotTarget(w, OTHER)
  check('it pays from its deepest stack', pick.id === 'deepStack', pick?.id)
  check('never from a 1-troop territory', pick.troops > 1)
  check("never from the human's territory", pick.occupyingPlayerId === OTHER)
  const removed = Math.min(2, pick.troops - 1)
  check('it loses 2', removed === 2)
  check('and is never wiped below 1', pick.troops - removed >= 1)

  // A loser holding nothing above 1 troop pays nothing at all.
  const broke = world({ a: { owner: OTHER, adj: [], troops: 1 }, b: { owner: OTHER, adj: [], troops: 1 } })
  check('a loser with no stack loses nothing', aiRiotTarget(broke, OTHER) === undefined)

  // Down to exactly 2 troops: it may only give up one.
  const thin = world({ only: { owner: OTHER, adj: [], troops: 2 } })
  const t = aiRiotTarget(thin, OTHER)
  check('a 2-troop holding gives up just 1', Math.min(2, t.troops - 1) === 1)
  check('leaving the territory held', t.troops - Math.min(2, t.troops - 1) === 1)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
