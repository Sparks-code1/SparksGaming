// The order a board and a hand arrive in, and what goes out when each does.
//
// A player online sees two channels: the public row (matches) and their own
// hidden state (match_secrets). Two facts about them decide everything here.
//
// ONE. matchSync drops every echo at or below the version this client has
// already applied, and the client records a version the moment its own POST
// returns. So the echoes of a client's OWN actions never reach its handlers —
// the last board the wire delivered is only ever refreshed by the OTHER
// machine, and on the acting player's screen it is the state at the start of
// their turn.
//
// TWO. apply_match_write rewrites every seat's secrets row on every action, so
// the secrets channel fires on the acting machine after each of its own moves.
//
// The join used to answer a secrets update by re-emitting the last board with
// the hand merged in. Put the two facts together and that is the start-of-turn
// board going back onto the acting player's screen after every move they made,
// straight past the version guard because it never went through one: troops
// back at the HQ, draft phase again, the turn announced again, the next action
// refused as stale. The opponent's screen fine throughout. Field report,
// 2026-09-05.
//
// THE BROWSER SPEC CANNOT SEE THIS ON LOOPBACK. Whether the own-echo is dropped
// is a race between the POST response and the websocket push, and on localhost
// the push wins every time — the one ordering in which the bug cannot happen.
// The two-seat spec now holds the realtime frames to force the other ordering;
// this file pins the mechanism with the transport faked and no race at all.
import { startMatchSync, type SyncTransport, type MatchRow } from '@/lib/matchSync'
import { createSeatMerge } from '@/lib/useMatchSync'
import type { GameState } from '@/types/game'
import type { SeatState, SeatSecrets } from '@/lib/stateView'

let pass = 0, fail = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  ok   ${label}`) }
  else {
    fail++
    console.log(`  FAIL ${label}\n         got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
  }
}

/** A board at a version: one seat, no hand on the row (the split shape). */
const board = (version: number, phase: string): MatchRow => ({
  state: {
    phase, currentPlayerIndex: 0, turnNumber: 1,
    players: [{ id: 'p1', name: 'One', cardCount: 2 }],
    territories: {},
  } as unknown as GameState,
  version,
  actionSeq: version,
})

/** The smallest transport that lets startMatchSync run: no timers ever fire. */
function fakeTransport(initial: MatchRow) {
  let push: ((r: MatchRow) => void) | null = null
  let status: ((s: 'subscribed' | 'error' | 'closed') => void) | null = null
  const transport: SyncTransport = {
    open(_m, onRow, _onAction, onStatus) { push = onRow; status = onStatus; return () => { push = null } },
    async fetch() { return initial },
    async fetchActions() { return [] },
    setTimer() { return 0 },
    clearTimer() { /* never fires */ },
    isOnline() { return true },
  }
  return {
    transport,
    /** A row lands on the socket. */
    deliver(r: MatchRow) { push?.(r) },
    subscribed() { status?.('subscribed') },
  }
}

const settle = () => new Promise(r => setTimeout(r, 0))

console.log('\n— the acting seat: its own echo is dropped, and the hand must not bring a board back —')
{
  const seen: Array<{ kind: 'state'; version: number; phase: string } | { kind: 'hand'; cards: string[] }> = []
  const merge = createSeatMerge('p1', {
    onState: (s, v) => seen.push({ kind: 'state', version: v, phase: s.phase }),
    onSecrets: h => seen.push({ kind: 'hand', cards: h.cards }),
  })
  const t = fakeTransport(board(1, 'reinforce'))
  const sync = startMatchSync('m', { onState: (s, v) => merge.publicArrived(s as unknown as SeatState, v) }, t.transport)
  t.subscribed()
  await settle()
  t.deliver(board(1, 'reinforce'))         // the deal: the start of this seat's turn
  await settle()

  const opening = seen.filter(e => e.kind === 'state')
  check('the opening board reaches the screen once', opening.map(e => (e as { version: number }).version), [1])

  // The seat acts. Its POST returns v2 and the client records it — THEN the
  // echo of that same write arrives on the socket and is dropped, so the
  // join's last-seen board is still the deal.
  sync.noteApplied(2)
  t.deliver(board(2, 'attack'))
  await settle()
  check('the echo of its own action is dropped by the transport',
    seen.filter(e => e.kind === 'state').length, 1)

  // Now the write that rewrote this seat's secrets row comes round. THE BUG:
  // a board going out here is the deal, one version behind the screen.
  merge.secretsArrived({ cards: ['tc-brazil', 'tc-peru'], missionCardId: null, legacyHand: [], legacyMission: null } as SeatSecrets)
  await settle()
  check('a secrets update sends the hand, and only the hand',
    seen.slice(1), [{ kind: 'hand', cards: ['tc-brazil', 'tc-peru'] }])
  check('...and no board older than the one on screen',
    seen.some(e => e.kind === 'state' && e.version < 2 && seen.indexOf(e) > 0), false)
  sync.stop()
}

console.log('\n— the hand-before-board case is still covered, from the other side —')
{
  const seen: Array<{ kind: string; cards?: string[]; version?: number }> = []
  const merge = createSeatMerge('p1', {
    onState: (s, v) => seen.push({ kind: 'state', version: v, cards: s.players[0].cards }),
    onSecrets: h => seen.push({ kind: 'hand', cards: h.cards }),
  })
  // The hand turns up first — before any board has.
  merge.secretsArrived({ cards: ['tc-ural'], missionCardId: null, legacyHand: [], legacyMission: null } as SeatSecrets)
  check('a hand with no board yet is still handed over on its own',
    seen, [{ kind: 'hand', cards: ['tc-ural'] }])
  // ...and the board that follows carries it, so the first render is whole.
  merge.publicArrived(board(1, 'reinforce').state as unknown as SeatState, 1)
  check('the first board arrives wearing the hand that got there first',
    seen[1], { kind: 'state', version: 1, cards: ['tc-ural'] })
}

console.log('\n— a spectator has no seat and gets no hand —')
{
  const seen: string[] = []
  const merge = createSeatMerge(null, {
    onState: s => seen.push(String(s.players[0].cards)),
    onSecrets: () => seen.push('hand?!'),
  })
  merge.publicArrived(board(1, 'reinforce').state as unknown as SeatState, 1)
  check('the board passes through untouched, with no hand merged', seen, ['undefined'])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
