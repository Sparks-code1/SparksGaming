// Khan Industries — Strategic Reserve: +1 troop placed ONTO each HQ territory
// the player controls, at the start of their turn. Auto-placed, NOT drafted.
import { calcDraftTroops, applyHqReserveTroops, controlledHqTerritoryIds }
  from '@/lib/gameLogic'

const T = (id: string, owner: string | null, troops = 1, hqOf?: string): any => ({
  id, name: id, occupyingPlayerId: owner, troops, cities: [], scars: [],
  adjacentIds: [], activeHqPlayerId: hqOf,
})

// Khan owns 3 territories. Two carry HQ tokens: their own, plus one captured.
const mk = (): Record<string, any> => ({
  a: T('a', 'khan', 5, 'khan'),   // own HQ
  b: T('b', 'khan', 3, 'enemy'),  // captured enemy HQ
  c: T('c', 'khan', 2),           // no HQ
  d: T('d', 'enemy', 4, 'enemy2'),// enemy-held HQ — must NOT be touched
})

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const troops = (t: Record<string, any>) => ({ a: t.a.troops, b: t.b.troops, c: t.c.troops, d: t.d.troops })

const KHAN = { playerId: 'khan', factionId: 'khan-industries', legacy: null }

// ── which HQs count ───────────────────────────────────────────────────────
check('controls own + captured HQ, not the enemy-held one',
  controlledHqTerritoryIds('khan', mk()), ['a', 'b'])

// ── the troops land ON the HQ territories ─────────────────────────────────
{
  const r = applyHqReserveTroops(mk(), 'khan', 'khan-hq-troops')
  check('+1 on each controlled HQ; other territories untouched',
    troops(r.territories), { a: 6, b: 4, c: 2, d: 4 })
  check('reports which territories were reinforced', r.grantedTerritoryIds, ['a', 'b'])
}

// ── and NOT into the draft pool ───────────────────────────────────────────
check('draft pool no longer includes the HQ bonus (3 territories -> 3)',
  calcDraftTroops({ ...KHAN, territories: mk(), ability: 'khan-hq-troops' }), 3)
check('draft pool matches a player with no ability',
  calcDraftTroops({ ...KHAN, territories: mk(), ability: null }), 3)

// ── only for the right ability / faction ──────────────────────────────────
check('Supply Lines places nothing',
  troops(applyHqReserveTroops(mk(), 'khan', 'khan-card-bonus').territories), { a: 5, b: 3, c: 2, d: 4 })
check('no ability places nothing',
  troops(applyHqReserveTroops(mk(), 'khan', null).territories), { a: 5, b: 3, c: 2, d: 4 })

// ── no HQs controlled -> nothing happens, same object returned ────────────
{
  const none = { a: T('a', 'khan', 5), d: T('d', 'enemy', 4, 'enemy') }
  const r = applyHqReserveTroops(none, 'khan', 'khan-hq-troops')
  check('no HQs -> no troops added', r.grantedTerritoryIds, [])
  check('no HQs -> returns the same object (no needless copy)', r.territories === none, true)
}

// ── IDEMPOTENCY: the reason this is only called at a turn hand-off ────────
// Applying twice DOES double up — proving the guard rails matter. The call
// sites are fresh-game setup and END_TURN, neither of which re-runs on reload.
{
  const once = applyHqReserveTroops(mk(), 'khan', 'khan-hq-troops').territories
  const twice = applyHqReserveTroops(once, 'khan', 'khan-hq-troops').territories
  check('applying twice would compound (hence the single call site)',
    troops(twice), { a: 7, b: 5, c: 2, d: 4 })
}

// ── does not mutate the input ─────────────────────────────────────────────
{
  const src = mk()
  applyHqReserveTroops(src, 'khan', 'khan-hq-troops')
  check('input territories are not mutated', troops(src), { a: 5, b: 3, c: 2, d: 4 })
}

// ── losing your own HQ: only the captured one is reinforced ───────────────
{
  const lost = { ...mk(), a: T('a', 'enemy', 5, 'khan') }
  const r = applyHqReserveTroops(lost, 'khan', 'khan-hq-troops')
  check('own HQ captured -> only the still-controlled HQ gains', r.grantedTerritoryIds, ['b'])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
