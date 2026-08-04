// AI: card trade-ins and red-star pursuit.
import {
  handCoinTotal, aiTradeInDecision, playerRedStars, rivalStarCounts, rivalsOnMatchPoint,
  aiMissionFocus, aiShouldPursueMission, aiAttackPlan,
} from '@/lib/ai'
import { coinTradeInTroops, CARD_TRADE_IN_VALUES } from '@/data/cards'
import { initialTurnState } from '@/types/game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// ─── 1. Trade-in coin math matches the human hand ─────────────────────────
console.log('--- trade-in coin math ---')
check('the reward track is 2/4/7/10/13/17/21/25/30', CARD_TRADE_IN_VALUES,
  [2, 4, 7, 10, 13, 17, 21, 25, 30])
check('below 2 coins cannot be traded', coinTradeInTroops(1), null)

// Territory cards carry their own coin value (incl. runner-up upgrades);
// resource/coin cards are worth exactly 1 — same as CardHand.
const RES = { t1: 1, t2: 2, tUp: 4 }
check('multi-coin + upgraded territory cards are summed at face value',
  handCoinTotal(['t1', 't2', 'tUp'], RES), 7)
check('an unlisted card counts as its base 1', handCoinTotal(['unknown'], RES), 1)
check('empty hand is 0 coins', handCoinTotal([], RES), 0)

// ─── 2. Difficulty behaviour ──────────────────────────────────────────────
console.log('\n--- trade-in by difficulty ---')
const decide = (hand: string[], diff: any, opts?: any) =>
  aiTradeInDecision(hand, RES, diff, opts)
const troopsOf = (d: any) => d?.troops ?? null

check('EASY trades as soon as the hand is worth 2 coins',
  troopsOf(decide(['t2'], 'easy')), 2)
check('EASY holds a 1-coin hand (below the minimum)',
  decide(['t1'], 'easy'), null)

check('MEDIUM holds at 3 coins (has not reached 4)',
  decide(['t1', 't2'], 'medium'), null)
check('MEDIUM trades at 4 coins for 7 troops',
  troopsOf(decide(['t2', 't2'], 'medium')), 7)

// Hard: holds while one more coin jumps a tier, cashes when the gain thins out.
check('HARD holds a 2-coin hand (one more coin doubles it: 2 -> 4)',
  decide(['t2'], 'hard'), null)
check('HARD holds at 4 coins (next tier is +3)',
  decide(['t2', 't2'], 'hard'), null)
check('HARD cashes at 7 coins (track flattens, fat hand is a liability)',
  troopsOf(decide(['tUp', 't1', 't2'], 'hard')), 17)
check('HARD cashes immediately when a rival is on 3 stars',
  troopsOf(decide(['t2'], 'hard', { rivalOnMatchPoint: true })), 2)
check('no hand -> no decision', decide([], 'hard'), null)

// every difficulty prices the SAME hand identically
{
  const hand = ['tUp', 't2', 't1']   // 7 coins
  const coins = [ 'easy', 'medium', 'hard' ].map(d => decide(hand, d as any)?.totalCoins)
  check('all difficulties agree on the coin total', coins, [7, 7, 7])
}

// ─── 3. Red star tracking ─────────────────────────────────────────────────
console.log('\n--- red stars ---')
const T = (id: string, owner: string | null, extra: any = {}) => ({
  id, name: id, continentId: 'asia', occupyingPlayerId: owner, troops: 5,
  scars: [], cities: [], adjacentIds: [], ...extra,
})
const starState: any = {
  players: [
    { id: 'me', factionId: 'f0', isEliminated: false, cards: [] },
    { id: 'r1', factionId: 'f1', isEliminated: false, cards: [] },
    { id: 'r2', factionId: 'f2', isEliminated: false, cards: [] },
  ],
  territories: {
    hqA: T('hqA', 'r1', { activeHqPlayerId: 'r1' }),
    hqB: T('hqB', 'r1', { activeHqPlayerId: 'x' }),   // captured HQ still counts
    plain: T('plain', 'r2'),
    mine: T('mine', 'me'),
  },
  turn: initialTurnState(), currentPlayerIndex: 0,
}
const starLegacy: any = { purchasedStars: { r1: 1, r2: 1 } }
check('stars = HQs controlled + stars earned', playerRedStars(starState, starLegacy, 'r1'), 3)
check('a rival with only a bought star', playerRedStars(starState, starLegacy, 'r2'), 1)
check('rivals ranked by stars', rivalStarCounts(starState, starLegacy, 'me'),
  [{ playerId: 'r1', stars: 3 }, { playerId: 'r2', stars: 1 }])
check('a rival on 3 stars is flagged as match point',
  rivalsOnMatchPoint(starState, starLegacy, 'me'), ['r1'])
check('nobody at 3 stars -> no match point',
  rivalsOnMatchPoint(starState, { purchasedStars: {} } as any, 'me'), [])

// ─── 4. Mission focus — combat conquests only ─────────────────────────────
console.log('\n--- mission pursuit ---')
const mk = (missionId: string, turn: any = {}, territories?: any) => {
  const terr = territories ?? {
    a: T('a', 'me'), b: T('b', 'enemy'), c: T('c', 'enemy'),
  }
  return aiMissionFocus(
    { players: [], territories: terr, turn: { ...initialTurnState(), ...turn } } as any,
    { activeGameCards: { currentMissionId: missionId } } as any,
    'me',
  )
}
{
  const f = mk('mc-9-territories-turn', { conqueredIds: ['x', 'y'] })
  check('9-territories mission counts COMBAT conquests', f?.remaining, 7)
}
{
  // captureCount includes walking into empty land; it must NOT count.
  const f = mk('mc-9-territories-turn', { conqueredIds: [], captureCount: 5 })
  check('empty-territory advances do NOT count toward mission progress',
    f?.remaining, 9)
}
{
  const f = mk('mc-4-sea-turn', { conqueredViaSeaIds: ['s1', 's2'] })
  check('sea mission counts sea conquests only', f?.remaining, 2)
}
{
  const terr: any = {
    a: T('a', 'me', { cities: [{ name: 'c', isMajor: false, isDestroyed: false }] }),
    b: T('b', 'enemy', { cities: [{ name: 'c', isMajor: true, isDestroyed: false }] }),
    c: T('c', 'enemy'),
  }
  const f = mk('mc-6-cities', {}, terr)
  check('6-cities: needs 5 more and targets enemy CITY territories', f?.remaining, 5)
  check('...targeting the enemy city, not the empty enemy land',
    [...(f?.targetIds ?? [])], ['b'])
}
check('a mission with no conquest path yields no focus',
  mk('mc-world-capital'), null)
check('no face-up mission -> no focus',
  aiMissionFocus({ territories: {}, turn: initialTurnState() } as any, {} as any, 'me'), null)

// ─── 5. Who pursues, and when ─────────────────────────────────────────────
const focusAt = (remaining: number) => ({ missionId: 'm', targetIds: new Set<string>(), remaining })
check('EASY never diverts to the mission', aiShouldPursueMission(focusAt(1), 'easy'), false)
check('MEDIUM pursues when 2 conquests away', aiShouldPursueMission(focusAt(2), 'medium'), true)
check('MEDIUM ignores a mission 3 conquests away', aiShouldPursueMission(focusAt(3), 'medium'), false)
check('HARD pursues a mission 5 conquests away', aiShouldPursueMission(focusAt(5), 'hard'), true)
check('an already-satisfied mission is not pursued', aiShouldPursueMission(focusAt(0), 'hard'), false)

// ─── 6. Planner prioritises mission targets and 3-star rivals ─────────────
console.log('\n--- attack planning ---')
{
  const terr: any = {
    base:    T('base', 'me', { troops: 20, adjacentIds: ['plainEnemy', 'missionCity'] }),
    plainEnemy:  T('plainEnemy', 'r2', { troops: 1, adjacentIds: ['base'] }),
    missionCity: T('missionCity', 'r2', { troops: 1, adjacentIds: ['base'],
      cities: [{ name: 'c', isMajor: true, isDestroyed: false }] }),
  }
  const st: any = {
    players: [{ id: 'me', factionId: 'f', isEliminated: false, cards: [] },
              { id: 'r2', factionId: 'g', isEliminated: false, cards: [] }],
    territories: terr, turn: initialTurnState(), currentPlayerIndex: 0,
  }
  const lg: any = { activeGameCards: { currentMissionId: 'mc-6-cities' }, purchasedStars: {} }
  const plan = aiAttackPlan(st, lg, 'me', 'hard')
  check('HARD attacks the mission-relevant city first', plan[0]?.tgtId, 'missionCity')
}
{
  // Two equal targets; one belongs to a rival on 3 stars.
  const terr: any = {
    base:  T('base', 'me', { troops: 20, adjacentIds: ['safe', 'leader'] }),
    safe:  T('safe', 'r2', { troops: 1, adjacentIds: ['base'] }),
    leader: T('leader', 'r1', { troops: 1, adjacentIds: ['base'] }),
    hq1: T('hq1', 'r1', { activeHqPlayerId: 'r1', adjacentIds: [] }),
    hq2: T('hq2', 'r1', { activeHqPlayerId: 'r1', adjacentIds: [] }),
    hq3: T('hq3', 'r1', { activeHqPlayerId: 'r1', adjacentIds: [] }),
  }
  const st: any = {
    players: [{ id: 'me', factionId: 'f', isEliminated: false, cards: [] },
              { id: 'r1', factionId: 'g', isEliminated: false, cards: [] },
              { id: 'r2', factionId: 'h', isEliminated: false, cards: [] }],
    territories: terr, turn: initialTurnState(), currentPlayerIndex: 0,
  }
  const lg: any = { purchasedStars: {} }   // r1 holds 3 HQs = 3 stars
  check('the 3-star rival is correctly identified',
    rivalsOnMatchPoint(st, lg, 'me'), ['r1'])
  const plan = aiAttackPlan(st, lg, 'me', 'hard')
  check('HARD strikes the 3-star rival over an equal, safer target',
    plan[0]?.tgtId, 'leader')
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
