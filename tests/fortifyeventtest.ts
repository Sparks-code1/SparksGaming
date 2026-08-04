// The Fortify event: the largest-population player picks troops or permanence.
//
// It used to hand the DRAWER +2 troops on any one territory. Now it goes to the
// player with the largest population, must go into CITIES, and offers a real
// decision — four troops now, or one of the campaign's five fortifications
// forever. The second option destroys the card for the whole campaign; the
// first only discards it.
import {
  FORTIFICATION_SUPPLY, FORTIFY_EVENT_TROOPS, FORTIFY_EVENT_CITIES,
  fortificationsPlaced, canPlaceFortification, countCitiesOn,
} from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const city = (isMajor = false) => ({ id: `c${Math.random()}`, name: 'City', isMajor, isDestroyed: false })
const terr = (id: string, owner: string | null, cities: any[] = [], troops = 3) =>
  ({ id, name: id, continentId: 'nowhere', occupyingPlayerId: owner, troops, cities,
     adjacentIds: [], shape: '', labelX: 0, labelY: 0, scars: [] })
const fortSticker = (target: string, charges = 10) =>
  ({ id: `f${target}`, name: 'Fortification', description: `fortification:${charges}`,
     placement: 'territory', targetId: target, appliedInGame: 1 })

const WC = 'brazil'
const ownedCityIds = (pid: string, terrs: Record<string, any>, wc: string | null = WC) =>
  Object.values(terrs).filter((t: any) => t.occupyingPlayerId === pid && countCitiesOn(t, wc) > 0).map((t: any) => t.id)

/** The whole event, driven the way the click handler and AI drive it. */
function runEvent(
  leaderId: string,
  terrs: Record<string, any>,
  stickers: any[],
  choice: 'troops' | 'fortification',
  clicks: string[],
) {
  const eligible = ownedCityIds(leaderId, terrs)
  if (eligible.length === 0) return { outcome: 'no-city', card: 'discarded', stickers, terrs }

  if (choice === 'fortification') {
    if (!canPlaceFortification({ stickers })) return { outcome: 'refused', card: 'pending', stickers, terrs }
    const target = clicks.find(id => eligible.includes(id))
    if (!target) return { outcome: 'refused', card: 'pending', stickers, terrs }
    return { outcome: 'fortified', target, card: 'DESTROYED', stickers: [...stickers, fortSticker(target)], terrs }
  }

  let left = Math.min(FORTIFY_EVENT_CITIES, eligible.length)
  const used: string[] = []
  const next = { ...terrs }
  for (const id of clicks) {
    if (left <= 0) break
    if (!eligible.includes(id) || used.includes(id)) continue        // refused, costs nothing
    next[id] = { ...next[id], troops: next[id].troops + FORTIFY_EVENT_TROOPS }
    used.push(id); left--
  }
  return { outcome: left === 0 ? 'troops-placed' : 'troops-partial', used, card: 'discarded', stickers, terrs: next }
}

console.log('\n— the numbers —')
{
  check('2 troops per city', FORTIFY_EVENT_TROOPS === 2, String(FORTIFY_EVENT_TROOPS))
  check('into 2 different cities', FORTIFY_EVENT_CITIES === 2, String(FORTIFY_EVENT_CITIES))
  check('so 4 troops in total', FORTIFY_EVENT_TROOPS * FORTIFY_EVENT_CITIES === 4)
  check('and the fortification supply is the campaign-wide 5', FORTIFICATION_SUPPLY === 5)
}

console.log('\n— troops go into two DIFFERENT cities —')
{
  const terrs = {
    congo: terr('congo', 'p1', [city()]),
    egypt: terr('egypt', 'p1', [city(true)]),
    peru:  terr('peru', 'p1', []),
    enemy: terr('enemy', 'p2', [city()]),
  }
  const r = runEvent('p1', terrs, [], 'troops', ['congo', 'egypt'])
  check('both cities were used', r.outcome === 'troops-placed', r.outcome)
  check('congo got 2', r.terrs.congo.troops === 5)
  check('egypt got 2', r.terrs.egypt.troops === 5)
  check('4 troops in total', r.terrs.congo.troops + r.terrs.egypt.troops === 6 + 4)
  check('the card is only discarded', r.card === 'discarded')

  // The same city twice must not soak up the whole reward.
  const same = runEvent('p1', terrs, [], 'troops', ['congo', 'congo', 'egypt'])
  check('clicking one city twice is refused', same.terrs.congo.troops === 5, String(same.terrs.congo.troops))
  check('and the second lot goes elsewhere', same.terrs.egypt.troops === 5)

  const notCity = runEvent('p1', terrs, [], 'troops', ['peru', 'congo', 'egypt'])
  check('a territory with no city is refused', notCity.terrs.peru.troops === 3)
  const enemyCity = runEvent('p1', terrs, [], 'troops', ['enemy', 'congo', 'egypt'])
  check("an enemy's city is refused", enemyCity.terrs.enemy.troops === 3)
}

console.log('\n— the World Capital counts as a city here too —')
{
  const terrs = { brazil: terr('brazil', 'p1', []), congo: terr('congo', 'p1', [city()]) }
  check('the World Capital is eligible', ownedCityIds('p1', terrs).includes('brazil'))
  const r = runEvent('p1', terrs, [], 'troops', ['brazil', 'congo'])
  check('it can take the troops', r.terrs.brazil.troops === 5)
  check('and both cities were used', r.outcome === 'troops-placed')
}

console.log('\n— only one city: place what you can —')
{
  const terrs = { congo: terr('congo', 'p1', [city()]), peru: terr('peru', 'p1', []) }
  const r = runEvent('p1', terrs, [], 'troops', ['congo', 'peru'])
  check('the one city still gets its troops', r.terrs.congo.troops === 5)
  check('and the reward is not forfeited', r.outcome === 'troops-placed', r.outcome)
  check('the card still only discards', r.card === 'discarded')
}

console.log('\n— no city at all: nothing happens, card survives —')
{
  const terrs = { peru: terr('peru', 'p1', []) }
  const r = runEvent('p1', terrs, [], 'troops', ['peru'])
  check('the event cannot arm', r.outcome === 'no-city')
  check('and the card is NOT destroyed', r.card === 'discarded')
}

console.log('\n— the fortification is permanent and destroys the card —')
{
  const terrs = { congo: terr('congo', 'p1', [city()]), peru: terr('peru', 'p1', []) }
  const r = runEvent('p1', terrs, [], 'fortification', ['congo'])
  check('the city is fortified', r.outcome === 'fortified' && r.target === 'congo')
  check('a sticker was added', fortificationsPlaced(r.stickers) === 1)
  check('with charges', r.stickers[0].description === 'fortification:10')
  check('and THIS destroys the card', r.card === 'DESTROYED')
  check('troops instead would not have', runEvent('p1', terrs, [], 'troops', ['congo']).card === 'discarded')

  const onBare = runEvent('p1', terrs, [], 'fortification', ['peru'])
  check('a territory with no city cannot be fortified', onBare.outcome === 'refused')
}

console.log('\n— the fortification option runs out —')
{
  const terrs = { congo: terr('congo', 'p1', [city()]) }
  for (let placed = 0; placed < FORTIFICATION_SUPPLY; placed++) {
    const stickers = Array.from({ length: placed }, (_, i) => fortSticker(`t${i}`))
    check(`with ${placed} placed the option is open`, canPlaceFortification({ stickers }))
    check(`...and it works`, runEvent('p1', terrs, stickers, 'fortification', ['congo']).outcome === 'fortified')
  }
  const spent = Array.from({ length: FORTIFICATION_SUPPLY }, (_, i) => fortSticker(`t${i}`))
  check('at 5 the option is closed', !canPlaceFortification({ stickers: spent }))
  check('and choosing it is refused', runEvent('p1', terrs, spent, 'fortification', ['congo']).outcome === 'refused')
  check('troops are still available', runEvent('p1', terrs, spent, 'troops', ['congo']).outcome === 'troops-placed')

  // A worn-out fortification still counts — it does not free the option again.
  const wornOut = Array.from({ length: FORTIFICATION_SUPPLY }, (_, i) => fortSticker(`t${i}`, 0))
  check('spent fortifications do not reopen it', !canPlaceFortification({ stickers: wornOut }))
}

console.log('\n— the two cards are destroyed independently —')
{
  // Taking the fortification on one card must not remove the other.
  let destroyed: string[] = []
  const takeFort = (cardId: string) => { destroyed = [...destroyed, cardId] }
  takeFort('ec-fortify-1')
  check('the used card is gone', destroyed.includes('ec-fortify-1'))
  check('the other survives', !destroyed.includes('ec-fortify-2'))
  // And the deck build filters on exactly that list.
  const deck = ['ec-fortify-1', 'ec-fortify-2', 'ec-control-1'].filter(id => !destroyed.includes(id))
  check('next game deals only the survivors', deck.join(',') === 'ec-fortify-2,ec-control-1', deck.join(','))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
