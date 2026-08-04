// World Capital mission: completing it requires being ELIGIBLE to take a card
// worth 4+ coins. You forgo that card — the 2 Red Stars and the World Capital
// replace it. Because no card is drawn, the "drawing forfeits your mission"
// rule is satisfied rather than bypassed.
import { checkMission, canClaimTerritoryCard } from '@/lib/missionLogic'
import { cardCoinValue, worldCapitalReplacedCities, calcReinforcements } from '@/lib/gameLogic'
import { applyLegacyToTerritories } from '@/lib/legacyApi'
import { getTerritoryCard } from '@/data/cards'
import { initialTurnState } from '@/types/game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const OWNED: any = { a: { id:'a', name:'a', continentId:'asia', occupyingPlayerId:'me',
  troops:1, scars:[], cities:[], adjacentIds:[] } }

const wc = (eligibleForRichCard: boolean, territories: any = OWNED, deckCount = 0) =>
  checkMission('mc-world-capital', 'me', territories,
    { turn: { ...initialTurnState(), eligibleForRichCard } } as any,
    { conqueredIds: [], conqueredViaSeaIds: [] }, deckCount)

// ── coin values, including runner-up upgrades ─────────────────────────────
check('a base card is worth 1', cardCoinValue({ c1: 1 }, 'c1'), 1)
check('an upgraded card reports its NEW value', cardCoinValue({ c1: 4 }, 'c1'), 4)
check('an uninitialised card falls back to its base 1', cardCoinValue({}, 'x'), 1)

// ── the mission condition is ELIGIBILITY ─────────────────────────────────
check('eligible for a 4+ card -> mission completes', wc(true), true)
check('not eligible -> does NOT complete', wc(false), false)
check('a full resource deck alone no longer completes it', wc(false, OWNED, 42), false)
check('an empty deck does not block a genuine eligibility', wc(true, OWNED, 0), true)
check('a player with no territories cannot complete it', wc(true, {}), false)

// ── eligibility: which cards could this player actually take? ────────────
// Mirrors awardTerritoryCard: claimable face-up cards, else the resource pile.
const terr: any = {
  mine:  { id:'mine',  continentId:'asia',   occupyingPlayerId:'me',    troops:1, scars:[], cities:[], adjacentIds:[] },
  enemy: { id:'enemy', continentId:'africa', occupyingPlayerId:'other', troops:1, scars:[], cities:[], adjacentIds:[] },
  home:  { id:'home',  continentId:'europe', occupyingPlayerId:'other', troops:1, scars:[], cities:[], adjacentIds:[] },
}
const CARD_T: Record<string,string> = { cMine:'mine', cEnemy:'enemy', cHome:'home' }
const eligibleIds = (sideboard: string[], resourceTop: string | null, homeland: string | null) => {
  const claimable = sideboard.filter(id =>
    canClaimTerritoryCard('me', CARD_T[id], terr, homeland))
  if (claimable.length > 0) return claimable
  return resourceTop ? [resourceTop] : []
}
const isEligible = (sideboard: string[], resourceTop: string | null,
                    coins: Record<string, number>, homeland: string | null = null) =>
  eligibleIds(sideboard, resourceTop, homeland).some(id => cardCoinValue(coins, id) >= 4)

check('a 4-coin card on a territory you hold -> eligible',
  isEligible(['cMine'], null, { cMine: 4 }), true)
check('a 3-coin card on a territory you hold -> NOT eligible',
  isEligible(['cMine'], null, { cMine: 3 }), false)
check('a 4-coin card you CANNOT claim (enemy territory) -> not eligible',
  isEligible(['cEnemy'], null, { cEnemy: 4 }), false)
check('...but with that continent as your HOMELAND it becomes eligible',
  isEligible(['cHome'], null, { cHome: 4 }, 'europe'), true)
check('falls back to the resource pile when nothing is claimable',
  isEligible([], 'cPile', { cPile: 4 }), true)
check('a 1-coin resource pile top -> not eligible',
  isEligible([], 'cPile', { cPile: 1 }), false)
check('holding a claimable card BLOCKS the pile (must take yours)',
  isEligible(['cMine'], 'cPile', { cMine: 1, cPile: 6 }), false)
check('no cards available at all -> not eligible',
  isEligible([], null, {}), false)

// ── the upgrade path ─────────────────────────────────────────────────────
{
  const before = { rich: 3 }
  const after  = { rich: Math.min(6, before.rich + 1) }   // runner-up +1
  check('3-coin card -> not eligible', isEligible(['cMine'], null, { cMine: before.rich }), false)
  check('SAME card after the runner-up upgrade -> eligible',
    isEligible(['cMine'], null, { cMine: after.rich }), true)
}

// ── turn field migrates ──────────────────────────────────────────────────
{
  check('fresh turn starts ineligible', initialTurnState().eligibleForRichCard, false)
  const oldSave: any = { captured:false, captureCount:0, conqueredIds:[], conqueredViaSeaIds:[],
    bearTrapTerritoryId:null, attackedTerritoryIds:[], shieldedTerritoryIds:[] }
  check('a save predating the field restores it as false',
    ({ ...initialTurnState(), ...oldSave }).eligibleForRichCard, false)
}

// ── WHERE the Capital goes: the territory of the qualifying card ─────────
// Mirrors richCardTerritoryIds in GameBoard.
const richTerritories = (sideboard: string[], resourceTop: string | null,
                         coins: Record<string, number>, homeland: string | null = null) => {
  const ids: string[] = []
  for (const cardId of eligibleIds(sideboard, resourceTop, homeland)) {
    if (cardCoinValue(coins, cardId) < 4) continue
    const tId = CARD_T[cardId] ?? getTerritoryCard(cardId)?.territoryId
    if (tId && !ids.includes(tId)) ids.push(tId)
  }
  return ids
}
check('the qualifying card names its own territory',
  richTerritories(['cMine'], null, { cMine: 4 }), ['mine'])
check('a 3-coin card names nothing',
  richTerritories(['cMine'], null, { cMine: 3 }), [])
check('only the 4+ cards are offered, not every claimable one',
  richTerritories(['cMine', 'cHome'], null, { cMine: 4, cHome: 1 }, 'europe'), ['mine'])
check('two qualifying cards give the player a choice',
  richTerritories(['cMine', 'cHome'], null, { cMine: 4, cHome: 5 }, 'europe'), ['mine', 'home'])
check('real territory cards carry a territory id',
  getTerritoryCard('tc-brazil')?.territoryId, 'brazil')
check('resource-pile coin cards are not territory cards (so never 4+)',
  getTerritoryCard('cc-1')?.territoryId, undefined)

// ── the Capital covers whatever city is already there ────────────────────
const S = (id: string, targetId: string, description: string, name = id) =>
  ({ id, name, description, placement: 'territory', targetId })

{
  const stickers = [
    S('major-1', 'brazil', 'city:major', 'Brazilla'),
    S('minor-1', 'peru', 'city:minor', 'Lima'),
    S('hq-1', 'brazil', 'HQ:khan-industries'),
    S('fort-1', 'brazil', 'fortification:1'),
  ]
  const r = worldCapitalReplacedCities(stickers, [], 'brazil', 'p1', 4)
  check('the major city on the target is covered', r.replaced.map(x => x.cityId), ['major-1'])
  check('and reported by name', r.replacedNames, ['Brazilla'])
  check('an HQ is NOT a city and survives', r.replaced.some(x => x.cityId === 'hq-1'), false)
  check('a fortification sticker is untouched', r.replaced.some(x => x.cityId === 'fort-1'), false)
  check("another territory's city is untouched", r.replaced.some(x => x.cityId === 'minor-1'), false)
  check('the covered city is stamped with the game and the placer',
    r.replaced[0], { cityId: 'major-1', destroyedInGame: 4, destroyedByPlayerId: 'p1' })
}
{
  const stickers = [S('minor-1', 'peru', 'city:minor', 'Lima')]
  check('a MINOR city is covered just the same',
    worldCapitalReplacedCities(stickers, [], 'peru', 'p1', 4).replacedNames, ['Lima'])
  check('open ground covers nothing',
    worldCapitalReplacedCities(stickers, [], 'congo', 'p1', 4).replaced, [])
  check('an already-destroyed city is not recorded twice',
    worldCapitalReplacedCities(stickers, [{ cityId: 'minor-1' }], 'peru', 'p1', 4).replaced, [])
  check('missing sticker list is safe',
    worldCapitalReplacedCities(null, null, 'peru', 'p1', 4).replaced, [])
}
{
  // Both stickers can legally sit on one territory (a minor upgraded in place is
  // one sticker, but a save could carry two) — cover them all.
  const stickers = [
    S('a', 'ukraine', 'city:minor', 'Kyiv'),
    S('b', 'ukraine', 'city:major', 'Ukraina'),
  ]
  const r = worldCapitalReplacedCities(stickers, [], 'ukraine', 'p1', 4)
  check('every city on the territory is covered', r.replaced.map(x => x.cityId), ['a', 'b'])
  check('and all are named', r.replacedNames, ['Kyiv', 'Ukraina'])
}
{
  // The sticker itself stays in `stickers` — it has been spent, so it must keep
  // counting against the 5-major limit.
  const stickers = [S('m1', 'brazil', 'city:major'), S('m2', 'peru', 'city:major')]
  const r = worldCapitalReplacedCities(stickers, [], 'brazil', 'p1', 4)
  check('the helper never removes stickers', stickers.length, 2)
  check('so the major-city tally is unchanged',
    stickers.filter(s => s.description === 'city:major').length, 2)
  check('but the covered one now reads as destroyed',
    new Set(r.replaced.map(x => x.cityId)).has('m1'), true)
}

// ── the replacement survives the reload path ─────────────────────────────
// This is the round trip that matters: the covered city must still be gone
// after the next game rebuilds territories from the legacy record.
{
  const stickers = [
    S('major-1', 'brazil', 'city:major', 'Brazilla'),
    S('hq-1', 'brazil', 'HQ:khan-industries'),
    S('minor-1', 'peru', 'city:minor', 'Lima'),
  ]
  const r = worldCapitalReplacedCities(stickers, [], 'brazil', 'p1', 4)
  const legacy: any = {
    scars: [], stickers, destroyedCities: r.replaced, destroyedHqs: [],
    renamedTerritories: [], worldCapitalTerritoryId: 'brazil',
  }
  const blank = (id: string) => ({ id, name: id, continentId: 'x', adjacentIds: [],
    occupyingPlayerId: null, troops: 0, scars: [], cities: [] })
  const rebuilt: any = applyLegacyToTerritories(
    { brazil: blank('brazil'), peru: blank('peru') } as any, legacy)

  const liveBrazil = rebuilt.brazil.cities.filter((c: any) => !c.isDestroyed && !c.headquartersFactionId)
  check('after a reload the covered city is destroyed', liveBrazil.length, 0)
  check('the HQ on the same territory still stands',
    rebuilt.brazil.cities.filter((c: any) => c.headquartersFactionId).length, 1)
  check("another territory's city is unaffected by the reload",
    rebuilt.peru.cities.filter((c: any) => !c.isDestroyed).map((c: any) => c.name), ['Lima'])

  // ...and it pays no population, which is what "kept the major city" looked
  // like. Padded past the 3-troop floor so the difference is actually visible.
  const filler: any = {}
  for (let i = 0; i < 9; i++) filler[`f${i}`] = { ...blank(`f${i}`), occupyingPlayerId: 'p1' }
  const own = (board: any) => ({ ...filler, ...board,
    brazil: { ...board.brazil, occupyingPlayerId: 'p1' } })

  // Same legacy record, but WITHOUT the replacement — i.e. the old behaviour.
  const notReplaced: any = applyLegacyToTerritories(
    { brazil: blank('brazil'), peru: blank('peru') } as any, { ...legacy, destroyedCities: [] })

  // 10 territories + Capital 5 = 15 → 5 troops. The Capital never stacks with
  // the city it covers, so both boards agree; the covered sticker is dead weight.
  check('the Capital pays 5 and the covered city pays nothing',
    calcReinforcements('p1', own(rebuilt) as any, false, {}, 'brazil'), 5)
  check('the same board with no Capital recorded pays for the major city instead',
    calcReinforcements('p1', own(notReplaced) as any, false, {}, null), 4)
  check('...and a covered city cannot be double-counted by dropping the Capital id',
    calcReinforcements('p1', own(rebuilt) as any, false, {}, null), 3)
}

// ── turn field for the chosen territories migrates ───────────────────────
{
  check('fresh turn has no recorded territories', initialTurnState().richCardTerritoryIds, [])
  const oldSave: any = { captured:false, eligibleForRichCard:true }
  check('a save predating the field restores it as empty',
    ({ ...initialTurnState(), ...oldSave }).richCardTerritoryIds, [])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
