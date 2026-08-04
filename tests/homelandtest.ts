// Faction Homeland: tally starting-HQ continents across the campaign; the most
// frequent is the homeland (a tie means none). A homeland lets the faction claim
// any face-up territory card in that whole continent.
import { computeHomelands, homelandContinentFor, canClaimTerritoryCard }
  from '@/lib/missionLogic'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const start = (gameNumber: number, factionId: string, continentId: string) =>
  ({ gameNumber, factionId, continentId })

// ── the tally rule ────────────────────────────────────────────────────────
check('most-started continent wins',
  computeHomelands([
    start(1, 'khan', 'asia'), start(2, 'khan', 'asia'), start(3, 'khan', 'europe'),
  ]), { khan: 'asia' })

// THE USER'S EXAMPLE: by game 4, two starts in Australia and two in South
// America is a tie -> no homeland.
check("Ryan's example: 2 Australia + 2 South America by game 4 = NO homeland",
  computeHomelands([
    start(1, 'bear', 'australia'), start(2, 'bear', 'south-america'),
    start(3, 'bear', 'australia'), start(4, 'bear', 'south-america'),
  ]), { bear: null })

check('a single start decides it outright',
  computeHomelands([start(1, 'aliens', 'africa')]), { aliens: 'africa' })
check('three-way tie = no homeland',
  computeHomelands([
    start(1, 'x', 'asia'), start(2, 'x', 'europe'), start(3, 'x', 'africa'),
  ]), { x: null })
check('a tie broken by a later start',
  computeHomelands([
    start(1, 'x', 'asia'), start(2, 'x', 'europe'), start(3, 'x', 'europe'),
  ]), { x: 'europe' })
check('factions are tallied independently',
  computeHomelands([
    start(1, 'a', 'asia'), start(1, 'b', 'europe'), start(2, 'a', 'asia'),
  ]), { a: 'asia', b: 'europe' })
check('no history at all', computeHomelands([]), {})

// ── gated behind signing the board twice ─────────────────────────────────
const HOMELANDS = { khan: 'asia' }
check('locked before the double-winner milestone',
  homelandContinentFor({ doubleWinnerMilestoneTriggered: false, factionHomelands: HOMELANDS }, 'khan'), null)
check('active once the milestone unlocks',
  homelandContinentFor({ doubleWinnerMilestoneTriggered: true, factionHomelands: HOMELANDS }, 'khan'), 'asia')
check('a tied faction still has none after unlock',
  homelandContinentFor({ doubleWinnerMilestoneTriggered: true, factionHomelands: { bear: null } }, 'bear'), null)

// ── the card-claim rule ──────────────────────────────────────────────────
const T = (id: string, continentId: string, owner: string | null) =>
  ({ id, name: id, continentId, occupyingPlayerId: owner, troops: 1, scars: [], cities: [], adjacentIds: [] })
const territories: Record<string, any> = {
  'siam':      T('siam', 'asia', 'me'),        // asia, I hold it
  'india':     T('india', 'asia', 'enemy'),    // asia, enemy holds it
  'ural':      T('ural', 'asia', null),        // asia, unoccupied
  'brazil':    T('brazil', 'south-america', 'enemy'),
  'argentina': T('argentina', 'south-america', 'me'),
}
const claim = (tid: string, homeland: string | null) =>
  canClaimTerritoryCard('me', tid, territories, homeland)

// Without a homeland: only what you occupy (the pre-existing rule).
check('no homeland — card for a territory you hold', claim('siam', null), true)
check('no homeland — enemy-held card refused', claim('india', null), false)
check('no homeland — unoccupied card refused', claim('ural', null), false)

// With an Asia homeland: the WHOLE continent opens up, and nothing else does.
check('homeland asia — still claims what you hold', claim('siam', 'asia'), true)
check('homeland asia — claims an ENEMY-held card in the continent', claim('india', 'asia'), true)
check('homeland asia — claims an UNOCCUPIED card in the continent', claim('ural', 'asia'), true)
check('homeland asia — does NOT claim outside the continent', claim('brazil', 'asia'), false)
check('homeland asia — territories you hold elsewhere still count',
  claim('argentina', 'asia'), true)
check('unknown territory id is refused', claim('atlantis', 'asia'), false)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
