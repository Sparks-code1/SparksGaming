// An action this session authored never re-runs its effects here.
//
// FIELD REPORT, 2026-09-06: when the computer moved, its fortify animated
// twice on the host — two troops to Greenland, then the same flight again.
// Counts stayed right; only the effects ran twice. The action feed dedupes by
// sequence: the client records the seq of its own POST response, and the echo
// of that row on the socket is then "already applied" and dropped. On a fast
// socket the echo comes FIRST, passes as unseen, and its effects run a second
// time on the very machine that already ran them optimistically.
//
// Authorship is the fact, not timing. The transport marks each row `own` when
// its actor_user_id is this session's user — its own seat's actions and, on
// the host, the computer's — and the sync core advances the sequence for an
// own row and runs nothing. A foreign row is unaffected, and an own row still
// counts toward the sequence so nothing behind it is replayed later.
import { startMatchSync, type SyncTransport, type MatchRow } from '@/lib/matchSync'
import type { GameState } from '@/types/game'
import type { Action, Effect } from '@/lib/gameReducer'

let pass = 0, fail = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  ok   ${label}`) }
  else { fail++; console.log(`  FAIL ${label}\n         got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`) }
}

const board = (version: number): MatchRow => ({
  state: { phase: 'attack', currentPlayerIndex: 0, turnNumber: 1, players: [], territories: {} } as unknown as GameState,
  version,
  actionSeq: version,
})

/** A transport whose socket and poll the test drives by hand. */
function fakeTransport(initial: MatchRow, polled: Array<{ action: Action; effects: Effect[]; seq: number; own?: boolean }> = []) {
  let pushRow: ((r: MatchRow) => void) | null = null
  let pushAction: ((a: Action, e: Effect[], seq: number, own?: boolean) => void) | null = null
  let status: ((s: 'subscribed' | 'error' | 'closed') => void) | null = null
  const transport: SyncTransport = {
    open(_m, onRow, onAction, onStatus) { pushRow = onRow; pushAction = onAction; status = onStatus; return () => { pushRow = null } },
    async fetch() { return initial },
    async fetchActions(_m, afterSeq) { return polled.filter(a => a.seq > afterSeq) },
    setTimer() { return 0 },
    clearTimer() { /* never fires */ },
    isOnline() { return true },
  }
  return {
    transport,
    row(r: MatchRow) { pushRow?.(r) },
    action(seq: number, own: boolean) { pushAction?.({ type: 'END_TURN', playerId: 'p1' } as Action, [{ kind: 'noise' } as unknown as Effect], seq, own) },
    subscribed() { status?.('subscribed') },
  }
}
const settle = () => new Promise(r => setTimeout(r, 0))

console.log('\n— the socket: an own row advances the sequence and runs nothing —')
{
  const ran: number[] = []
  const t = fakeTransport(board(3))
  const sync = startMatchSync('m', {
    onState: () => {},
    onAction: (_a, _e, seq) => ran.push(seq),
  }, t.transport)
  t.subscribed()
  await settle()
  t.row(board(3))                 // first sight: the feed baselines at seq 3
  await settle()

  t.action(4, true)               // the echo of this machine's own action, ahead of its POST response
  check('an own row runs no effects', ran, [])
  t.action(5, false)              // somebody else's move
  check('a foreign row behind it still runs', ran, [5])
  sync.noteActionApplied(4)       // the POST response comes back late
  t.action(4, true)               // and the socket repeats the echo
  check('...and the own row is not replayed later either', ran, [5])
  t.action(6, false)
  check('the sequence carried on past the own row', ran, [5, 6])
  sync.stop()
}

console.log('\n— the poll: own rows fetched back are dropped the same way —')
{
  const ran: number[] = []
  const t = fakeTransport(board(3), [
    { action: { type: 'END_TURN', playerId: 'p1' } as Action, effects: [], seq: 4, own: true },
    { action: { type: 'END_TURN', playerId: 'p2' } as Action, effects: [], seq: 5, own: false },
  ])
  const sync = startMatchSync('m', {
    onState: () => {},
    onAction: (_a, _e, seq) => ran.push(seq),
  }, t.transport)
  t.subscribed()
  await settle()
  t.row(board(3))
  await settle()
  await sync.resync()             // the poll fetches what the socket missed
  check('the poll runs only the foreign row', ran, [5])
  sync.stop()
}

console.log('\n— a row with no mark is treated as foreign —')
{
  const ran: number[] = []
  const t = fakeTransport(board(3))
  const sync = startMatchSync('m', { onState: () => {}, onAction: (_a, _e, seq) => ran.push(seq) }, t.transport)
  t.subscribed()
  await settle()
  t.row(board(3))
  await settle()
  t.action(4, undefined as unknown as boolean)
  check('unknown authorship runs the effects — nothing is dropped on a guess', ran, [4])
  sync.stop()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
