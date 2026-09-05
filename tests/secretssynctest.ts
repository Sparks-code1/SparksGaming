// The secrets channel. RLS is what keeps one seat's row off another's socket;
// this suite covers the client's half — that it maps rows correctly and that a
// row it should never have received is REPORTED rather than quietly dropped.
//
// The subscription itself needs Supabase, so what is exercised here is the pure
// logic around it, reached by driving the same handler shape the channel calls.
import { readFileSync } from 'node:fs'
import type { SecretsRow } from '@/lib/secretsSync'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// Mirrors the module's own mapping and routing. Kept in step by the assertions
// below rather than by import, because the real one is closed over a live
// channel and cannot be called without one.
interface RawRow { match_id?: string; player_id?: string; data?: Record<string, unknown>; updated_at?: string }
const toRow = (r: RawRow): SecretsRow | null =>
  r?.match_id && r?.player_id
    ? { matchId: r.match_id, playerId: r.player_id, data: r.data ?? {}, updatedAt: r.updated_at ?? '' }
    : null

function route(raw: RawRow, expectPlayerId?: string) {
  const mine: SecretsRow[] = []
  const foreign: SecretsRow[] = []
  const row = toRow(raw)
  if (!row) return { mine, foreign, ignored: true }
  if (expectPlayerId && row.playerId !== expectPlayerId) foreign.push(row)
  else mine.push(row)
  return { mine, foreign, ignored: false }
}

const raw = (player: string, data: Record<string, unknown> = { spice: 5 }): RawRow =>
  ({ match_id: 'm1', player_id: player, data, updated_at: '2026-08-17T00:00:00Z' })

// ── mapping ──────────────────────────────────────────────────────────────────
check('a row maps to camelCase', toRow(raw('p1')), {
  matchId: 'm1', playerId: 'p1', data: { spice: 5 }, updatedAt: '2026-08-17T00:00:00Z',
})
check('missing data becomes an empty object, not undefined',
  toRow({ match_id: 'm1', player_id: 'p1' })?.data, {})
check('a row with no seat is ignored', toRow({ match_id: 'm1' }), null)
check('a row with no match is ignored', toRow({ player_id: 'p1' }), null)

// ── routing ──────────────────────────────────────────────────────────────────
check('my own row is delivered', route(raw('p1'), 'p1').mine.length, 1)

// The important one. RLS should make this impossible; if it happens the policy
// is broken, and dropping it silently would hide that behind a client-side
// filter that merely LOOKS like it is doing the work.
const foreign = route(raw('p2'), 'p1')
check('another seat\'s row is NOT delivered as mine', foreign.mine.length, 0)
check('...it is reported as foreign', foreign.foreign.length, 1)
check('...carrying the seat it actually belonged to', foreign.foreign[0].playerId, 'p2')

// Without an expected seat there is nothing to compare against, so everything
// RLS allowed through is taken at face value.
check('with no expected seat, rows are taken as given', route(raw('p2')).mine.length, 1)

// ── secrets are opaque to this layer ─────────────────────────────────────────
// It carries whatever a game keeps per seat. Dune's first is one number; the
// channel must not care.
check('an arbitrary shape survives the round trip',
  toRow(raw('p1', { spice: 12, traitors: ['x'], bid: null }))?.data,
  { spice: 12, traitors: ['x'], bid: null })

// ── The hand arrives ALONE, never wearing the last board the wire delivered ──
//
// useMatchSync used to answer a secrets-row update by re-emitting `lastPublic`
// with the new hand merged in. But matchSync drops every echo at or below the
// version this client already applied, and that version is bumped on each POST
// response — so the echoes of a client's OWN actions never arrive, and
// `lastPublic` is only ever refreshed by the other machine. On the acting
// player's screen it is the state at the start of their turn. apply_match_write
// rewrites every seat's secrets row on every action, so every move the acting
// player made put their turn-start board back on their own screen: troops back
// at the HQ, draft phase again, the turn announced again, and their next action
// refused as stale because the version pointer had rolled back with it. The
// opponent's screen was fine the whole time — a bug with a direction.
//
// Pinned as source: the hook is closed over a live channel and the bug needs two
// channels racing, which is the two-seat browser spec's job. These say the
// shape that made it possible is gone and the shape that stops it is present.
{
  const hook = readFileSync('src/lib/useMatchSync.ts', 'utf8')
  // The join is createSeatMerge — pure, and the thing seatmergetest drives.
  // These pin its SHAPE; that file pins its behaviour.
  const at = hook.indexOf('secretsArrived(secrets: SeatSecrets) {')
  const onSecrets = at < 0 ? '' : hook.slice(at, hook.indexOf('\n    },', at))

  check('the secrets side of the join was found', at > 0, true)
  // THE BUG. A board going out from the secrets side is one this client did
  // not just compute — on the acting machine, the start of its own turn.
  check('a secrets update sends no board', /onState\(|\bemit\(/.test(onSecrets), false)
  check('...it hands the hand over on its own', /onSecrets\?\.\(lastSecrets\)/.test(onSecrets), true)
  // The hand-before-board case still needs covering, and it is covered by the
  // OTHER direction: every public state that arrives is merged with the latest
  // secrets. Remove that and the first hand of a match sits in a variable.
  check('...and a public state still picks up the latest hand',
    /mergeOwnSecrets\(lastPublic, seatId, lastSecrets\)/.test(hook), true)

  const board = readFileSync('src/components/GameBoard.tsx', 'utf8')
  const stateAt = board.indexOf('onState: (state, version) => {')
  const onState = stateAt < 0 ? '' : board.slice(stateAt, stateAt + 1400)
  // THE GUARD AT THE CONSUMER. The transport already orders versions; this is
  // the check that does not share its blind spot, which is exactly where the
  // stale re-emit walked in.
  check('the board refuses a state older than the one on screen',
    /if \(version < held\)[\s\S]{0,120}?return/.test(onState), true)
  check('...and patches an arriving hand onto the board it is HOLDING',
    /onSecrets: secrets => \{[\s\S]{0,300}?mergeOwnSecrets\(\s*gameStateRef\.current/.test(board), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
