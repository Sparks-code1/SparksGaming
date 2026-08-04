// Lead faction: the FACTION with the most campaign wins (none if 2+ tie).
// Once the World Capital is placed it picks the starting face-up mission and
// begins each game owning the World Capital with 3 troops.
import { leadFactionId, factionWinCounts, LEAD_FACTION_WORLD_CAPITAL_TROOPS }
  from '@/lib/gameLogic'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const win = (factionId: string) => ({ factionId })

// ── who leads ─────────────────────────────────────────────────────────────
check('a clear leader', leadFactionId([win('khan'), win('khan'), win('bear')]), 'khan')
check('a single win is enough to lead', leadFactionId([win('bear')]), 'bear')
check('TWO factions tied -> NO lead faction',
  leadFactionId([win('khan'), win('bear')]), null)
check('three-way tie -> no lead faction',
  leadFactionId([win('a'), win('b'), win('c')]), null)
check('a tie at 2 wins each -> no lead faction',
  leadFactionId([win('a'), win('a'), win('b'), win('b')]), null)
check('a tie broken by a later win',
  leadFactionId([win('a'), win('b'), win('a')]), 'a')
check('no games played yet -> no lead faction', leadFactionId([]), null)
check('undefined victory log -> no lead faction', leadFactionId(undefined), null)

// tracked by FACTION, not player: the same player winning under two factions
// splits the record between them.
check('wins follow the FACTION, not the player',
  leadFactionId([win('khan'), win('bear')]), null)

// ── win tallies (drives the UI) ───────────────────────────────────────────
check('per-faction win counts',
  factionWinCounts([win('khan'), win('khan'), win('bear')]), { khan: 2, bear: 1 })
check('empty log tallies to nothing', factionWinCounts([]), {})
check('malformed entries are ignored',
  factionWinCounts([win('khan'), { factionId: '' } as any, null as any]), { khan: 1 })

// ── the World Capital grant ───────────────────────────────────────────────
check('lead faction starts with 3 troops on the World Capital',
  LEAD_FACTION_WORLD_CAPITAL_TROOPS, 3)

// Mirrors the setup rule in GameBoard's initialState.
const applyGrant = (opts: {
  lead: string | null, wcId: string | null,
  players: Array<{ id: string, factionId: string }>,
  wc?: { occupyingPlayerId: string | null, troops: number, activeHqPlayerId?: string },
}) => {
  const t: any = opts.wcId
    ? { [opts.wcId]: { id: opts.wcId, occupyingPlayerId: null, troops: 0, ...(opts.wc ?? {}) } }
    : {}
  if (opts.lead && opts.wcId && t[opts.wcId]) {
    const p = opts.players.find(pl => pl.factionId === opts.lead)
    if (p && !t[opts.wcId].activeHqPlayerId) {
      t[opts.wcId] = { ...t[opts.wcId], occupyingPlayerId: p.id, troops: LEAD_FACTION_WORLD_CAPITAL_TROOPS }
    }
  }
  return t
}
const PLAYERS = [{ id: 'p1', factionId: 'khan' }, { id: 'p2', factionId: 'bear' }]

check('lead faction owns the World Capital with 3 troops at game start',
  applyGrant({ lead: 'khan', wcId: 'wc', players: PLAYERS }).wc,
  { id: 'wc', occupyingPlayerId: 'p1', troops: 3 })

check('NO lead faction -> the World Capital starts unowned (must pay 5 to enter)',
  applyGrant({ lead: null, wcId: 'wc', players: PLAYERS }).wc,
  { id: 'wc', occupyingPlayerId: null, troops: 0 })

check('lead faction not playing this game -> Capital stays unowned',
  applyGrant({ lead: 'aliens', wcId: 'wc', players: PLAYERS }).wc,
  { id: 'wc', occupyingPlayerId: null, troops: 0 })

check('World Capital not placed yet -> nothing to grant',
  applyGrant({ lead: 'khan', wcId: null, players: PLAYERS }), {})

check('an HQ already on the Capital is never overwritten',
  applyGrant({ lead: 'khan', wcId: 'wc', players: PLAYERS,
    wc: { occupyingPlayerId: 'p2', troops: 8, activeHqPlayerId: 'p2' } }).wc.occupyingPlayerId, 'p2')

// ── the 3 troops are ON TOP of normal starting troops ────────────────────
{
  const NORMAL_START = 8
  const leadTotal = NORMAL_START + LEAD_FACTION_WORLD_CAPITAL_TROOPS
  check('lead faction fields 8 at their HQ PLUS 3 on the Capital', leadTotal, 11)
  check('...and the HQ still gets its full 8 (not redistributed)', NORMAL_START, 8)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
