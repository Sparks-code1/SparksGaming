// Resource deck depletion: a red star goes to the player with the most
// territories. A SHARED lead means nobody takes it — picking one of them would
// be decided by map data order, and could silently end the game.
import { territoryLead } from '@/lib/gameLogic'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** Build a board from "owner repeated N times" counts. */
const board = (counts: Record<string, number>) => {
  const territories: Record<string, { occupyingPlayerId: string | null }> = {}
  let i = 0
  for (const [owner, n] of Object.entries(counts)) {
    for (let k = 0; k < n; k++) territories[`t${i++}`] = { occupyingPlayerId: owner }
  }
  return territories
}

// ─── 1. A clear leader takes the star ─────────────────────────────────────
console.log('--- a clear leader ---')
{
  const lead = territoryLead(board({ p1: 14, p2: 11, p3: 9 }))
  check('the leader is identified', lead.leaderId, 'p1')
  check('with their territory count', lead.count, 14)
  check('and is the only one on the top count', lead.leaderIds, ['p1'])
}
check('a one-territory margin is still a clear lead',
  territoryLead(board({ p1: 12, p2: 11 })).leaderId, 'p1')

// ─── 2. A tie awards nothing ──────────────────────────────────────────────
console.log('\n--- a shared lead ---')
{
  const lead = territoryLead(board({ p1: 11, p2: 11, p3: 8 }))
  check('no single leader, so no star', lead.leaderId, null)
  check('both tied players are reported for the notice', lead.leaderIds, ['p1', 'p2'])
  check('the shared count is reported', lead.count, 11)
}
{
  const lead = territoryLead(board({ p1: 9, p2: 9, p3: 9 }))
  check('a three-way tie also awards nothing', lead.leaderId, null)
  check('...and names all three', lead.leaderIds, ['p1', 'p2', 'p3'])
}
{
  // The old bug: first-found-wins handed the star to whoever owned the
  // earliest territory in the map data. Ordering must not decide it.
  const a = territoryLead(board({ p1: 11, p2: 11 }))
  const b = territoryLead(board({ p2: 11, p1: 11 }))
  check('map ordering cannot decide a tie', [a.leaderId, b.leaderId], [null, null])
  check('...and both orderings report the same tied set',
    [[...a.leaderIds].sort(), [...b.leaderIds].sort()], [['p1', 'p2'], ['p1', 'p2']])
}
{
  // Trailing players tied with each other are irrelevant — only the top counts.
  const lead = territoryLead(board({ p1: 15, p2: 9, p3: 9 }))
  check('a tie BELOW the leader does not block the star', lead.leaderId, 'p1')
}

// ─── 3. Degenerate boards ─────────────────────────────────────────────────
console.log('\n--- edge cases ---')
check('an empty board has no leader', territoryLead({}), { leaderId: null, count: 0, leaderIds: [] })
check('unoccupied territories are ignored',
  territoryLead({ a: { occupyingPlayerId: null }, b: { occupyingPlayerId: null } }),
  { leaderId: null, count: 0, leaderIds: [] })
check('one player holding everything leads',
  territoryLead(board({ p1: 42 })).leaderId, 'p1')
{
  const lead = territoryLead({ a: { occupyingPlayerId: null }, b: { occupyingPlayerId: 'p1' } })
  check('a single occupied territory still counts', [lead.leaderId, lead.count], ['p1', 1])
}

// ─── 4. What the game does with the result ────────────────────────────────
console.log('\n--- award decision ---')
const starAward = (counts: Record<string, number>) => {
  const lead = territoryLead(board(counts))
  return lead.leaderId
    ? { award: lead.leaderId, stars: 1 }
    : { award: null, stars: 0, tied: lead.leaderIds, count: lead.count }
}
check('clear leader gets exactly 1 star', starAward({ p1: 14, p2: 11 }), { award: 'p1', stars: 1 })
check('tie awards zero stars and reports the tie',
  starAward({ p1: 11, p2: 11 }), { award: null, stars: 0, tied: ['p1', 'p2'], count: 11 })

// No star means no 4th star, so a tie can never end the game here.
const wouldEndGame = (hqStars: number, counts: Record<string, number>, pid: string) => {
  const lead = territoryLead(board(counts))
  const earned = lead.leaderId === pid ? 1 : 0
  return hqStars + earned >= 4
}
check('a leader on 3 stars wins when the deck empties',
  wouldEndGame(3, { p1: 14, p2: 11 }, 'p1'), true)
check('a TIED player on 3 stars does not win', wouldEndGame(3, { p1: 11, p2: 11 }, 'p1'), false)
check('...and neither does the other', wouldEndGame(3, { p1: 11, p2: 11 }, 'p2'), false)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
