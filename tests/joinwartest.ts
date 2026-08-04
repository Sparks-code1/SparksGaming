// Join the War: an eliminated player is only offered a turn when there is
// somewhere legal to re-enter. With nowhere to go they are skipped silently
// rather than being asked to forfeit.
import { computeTurnAdvance } from '@/lib/gameReducer'
import { legalJoinWarTerritoryIds } from '@/lib/gameLogic'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const T = (id: string, owner: string | null, adjacentIds: string[] = [], extra: any = {}) =>
  ({ id, name: id, continentId: 'asia', occupyingPlayerId: owner, troops: 1,
     scars: [], cities: [], adjacentIds, ...extra })

/** p0 active, p1 eliminated, p2 active. */
const players = (p1: any) => [
  { id: 'p0', factionId: 'f0', isEliminated: false, cards: [] },
  { id: 'p1', factionId: 'f1', isEliminated: true, cards: [], ...p1 },
  { id: 'p2', factionId: 'f2', isEliminated: false, cards: [] },
]
const state = (territories: any, p1: any = {}, activeHqs: any = {}) => ({
  players: players(p1), territories, activeHqs,
  currentPlayerIndex: 0, turnNumber: 1, legacySnapshot: {},
} as any)

// ── the legality rule ─────────────────────────────────────────────────────
{
  const terr = {
    open:   T('open', null),
    owned:  T('owned', 'p0'),
    city:   T('city', null, [], { cities: [{ name: 'c', isMajor: false, isDestroyed: false }] }),
    ruined: T('ruined', null, [], { cities: [{ name: 'c', isMajor: false, isDestroyed: true }] }),
    hq:     T('hq', 'p0'),
    nextHq: T('nextHq', null),
    fz:     T('fz', null),
  }
  terr.hq.adjacentIds = ['nextHq']
  const legal = legalJoinWarTerritoryIds(terr, ['hq'], 'fz').sort()
  check('legal spots: unowned, city-free, away from HQs, not the Fallout Zone',
    legal, ['open', 'ruined'])
  check('an occupied territory is not legal', legal.includes('owned'), false)
  check('a standing city blocks it', legal.includes('city'), false)
  check('a DESTROYED city does not block it', legal.includes('ruined'), true)
  check('the HQ itself is blocked', legal.includes('hq'), false)
  check('adjacent to an HQ is blocked', legal.includes('nextHq'), false)
  check('the Fallout Zone is blocked', legal.includes('fz'), false)
}

// ── the skip rule ─────────────────────────────────────────────────────────
const OPEN   = { open: T('open', null), a: T('a', 'p0') }   // a legal spot exists
const NOSPOT = { a: T('a', 'p0'), b: T('b', 'p2') }         // board is full

check('legal spot exists -> the eliminated player IS offered their turn',
  computeTurnAdvance(state(OPEN)).nextIdx, 1)

check('NO legal spot -> skipped straight past to the next active player',
  computeTurnAdvance(state(NOSPOT)).nextIdx, 2)

check('already joined -> skipped even though a spot exists',
  computeTurnAdvance(state(OPEN, { joinedWarThisGame: true })).nextIdx, 2)
check('already forfeited -> skipped even though a spot exists',
  computeTurnAdvance(state(OPEN, { joinedWarThisGame: false })).nextIdx, 2)

// ── active players are never skipped ──────────────────────────────────────
{
  const s = state(NOSPOT)
  s.players[1].isEliminated = false
  check('an ACTIVE player is never skipped, spot or not', computeTurnAdvance(s).nextIdx, 1)
}

// ── no infinite loop when everyone else is skippable ──────────────────────
{
  const s = state(NOSPOT)
  s.players[2] = { id: 'p2', factionId: 'f2', isEliminated: true, cards: [], joinedWarThisGame: false }
  check('all others skippable -> wraps back to the current player',
    computeTurnAdvance(s).nextIdx, 0)
}

// ── a vacated territory re-opens the offer ────────────────────────────────
{
  // Same board, but an end-of-turn scar vacated 'a' — that spot is now legal,
  // so the eliminated player must be offered a turn again.
  const vacated = { a: T('a', null), b: T('b', 'p2') }
  check('a territory vacated at end of turn re-opens the Join the War offer',
    computeTurnAdvance(state(vacated)).nextIdx, 1)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
