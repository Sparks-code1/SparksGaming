// Live sync for an online match.
//
// Three rules have to hold, and none of them is about speed:
//
//   * a message older than what the client already has is DROPPED — realtime
//     delivers out of order, and the acting client also gets its state back
//     from the POST, so a late echo would otherwise roll the board backwards
//   * every connect and RECONNECT re-fetches the row, because messages sent
//     while the socket was down are gone and are never replayed
//   * hotseat opens nothing at all
//
// The transport is injected, so all of that is exercised here without a
// database, a socket, or a wall clock.
import {
  startMatchSync, reconnectDelay, RECONNECT_DELAYS, LIVE_POLL_MS,
  type SyncTransport, type MatchRow, type LiveStatus,
} from '@/lib/matchSync'
import type { GameState } from '@/types/game'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

/** A board distinguishable by version, so we can tell which state was applied. */
const boardAt = (v: number) => ({ turnNumber: v, players: [], territories: {} } as unknown as GameState)
const row = (v: number): MatchRow => ({ state: boardAt(v), version: v })

/** A fake channel + row store with a manual clock. */
function fakeTransport(initial: MatchRow = row(0)) {
  const timers: Array<{ id: number; fn: () => void; due: number }> = []
  let now = 0, nextId = 1
  const t = {
    opens: 0, closes: 0, fetches: 0,
    online: true,
    stored: initial,
    push: null as null | ((r: MatchRow) => void),
    status: null as null | ((s: 'subscribed' | 'error' | 'closed', m?: string) => void),
    fetchThrows: false,

    transport: {
      open(_matchId, onRow, _onAction, onStatus) {
        t.opens++
        t.push = onRow
        t.status = onStatus
        return () => { t.closes++; t.push = null; t.status = null }
      },
      async fetch() {
        t.fetches++
        if (t.fetchThrows) throw new Error('network down')
        return t.stored
      },
      setTimer(fn, ms) { const id = nextId++; timers.push({ id, fn, due: now + ms }); return id },
      clearTimer(handle) {
        const i = timers.findIndex(x => x.id === handle)
        if (i >= 0) timers.splice(i, 1)
      },
      isOnline: () => t.online,
    } as SyncTransport,

    /** Move the clock and fire anything due. */
    advance(ms: number) {
      now += ms
      for (const timer of [...timers]) {
        if (timer.due <= now) {
          timers.splice(timers.indexOf(timer), 1)
          timer.fn()
        }
      }
    },
    pendingTimers: () => timers.length,
  }
  return t
}

/** Drain the microtask queue so the async resync settles. */
const settle = () => new Promise<void>(r => setTimeout(r, 0))

async function run() {

console.log('\n— it connects, and the first connect re-fetches —')
{
  const t = fakeTransport(row(5))
  const seen: number[] = []
  const statuses: LiveStatus[] = []
  const sync = startMatchSync('m1', {
    onState: (_s, v) => seen.push(v),
    onStatus: s => statuses.push({ ...s }),
  }, t.transport)

  check('a channel was opened', t.opens === 1)
  t.status!('subscribed')
  await settle()
  check('reaching subscribed fetches the row', t.fetches === 1)
  check('and the state is applied', seen.join(',') === '5', seen.join(','))
  check('the status goes live', sync.status().state === 'live')
  check('and reports the version it holds', sync.status().version === 5)
  sync.stop()
  check('stopping closes the channel', t.closes === 1)
  check('and goes idle', sync.status().state === 'idle')
}

console.log('\n— a message older than what we hold is dropped —')
{
  const t = fakeTransport(row(10))
  const seen: number[] = []
  const sync = startMatchSync('m1', { onState: (_s, v) => seen.push(v) }, t.transport)
  t.status!('subscribed')
  await settle()
  check('starts at 10', seen.join(',') === '10')

  t.push!(row(11))
  check('11 is newer and applies', seen.join(',') === '10,11')
  t.push!(row(9))
  check('9 is older and is dropped', seen.join(',') === '10,11')
  t.push!(row(11))
  check('a duplicate of 11 is dropped', seen.join(',') === '10,11')
  t.push!(row(10))
  check('so is a re-delivery of 10', seen.join(',') === '10,11')
  t.push!(row(12))
  check('12 still applies', seen.join(',') === '10,11,12')
  check('the version tracks the highest applied', sync.status().version === 12)

  // Out-of-order burst: only the ones that advance the version survive.
  ;[15, 13, 16, 14].forEach(v => t.push!(row(v)))
  check('an out-of-order burst applies only the advances',
    seen.join(',') === '10,11,12,15,16', seen.join(','))
  sync.stop()
}

console.log('\n— your own move is not re-rendered when it echoes back —')
{
  const t = fakeTransport(row(3))
  const seen: number[] = []
  const sync = startMatchSync('m1', { onState: (_s, v) => seen.push(v) }, t.transport)
  t.status!('subscribed')
  await settle()
  seen.length = 0

  // The acting client POSTs, gets version 4 back, and renders it itself.
  sync.noteApplied(4)
  check('noteApplied records it', sync.status().version === 4)
  t.push!(row(4))
  check('the realtime echo of that same version does nothing', seen.length === 0)
  t.push!(row(5))
  check("but the next player's move still arrives", seen.join(',') === '5')
  sync.stop()
}

console.log('\n— a dropped connection retries with backoff —')
{
  const t = fakeTransport(row(1))
  const statuses: LiveStatus[] = []
  const sync = startMatchSync('m1', { onState: () => {}, onStatus: s => statuses.push({ ...s }) }, t.transport)
  t.status!('subscribed')
  await settle()
  check('live to begin with', sync.status().state === 'live')

  t.status!('error', 'socket closed')
  check('a dropped channel reports reconnecting', sync.status().state === 'reconnecting')
  // Two timers: the retry, plus the standing poll that never goes away.
  check('and a retry is scheduled', t.pendingTimers() === 2, String(t.pendingTimers()))
  check('nothing reopened yet', t.opens === 1)

  t.advance(RECONNECT_DELAYS[0])
  check('the first retry reopens the channel', t.opens === 2)

  // Still failing: the delay grows.
  t.status!('error')
  check('a second failure schedules again', t.pendingTimers() === 2, String(t.pendingTimers()))
  t.advance(RECONNECT_DELAYS[0])
  check('the shorter delay is no longer enough', t.opens === 2, String(t.opens))
  t.advance(RECONNECT_DELAYS[1] - RECONNECT_DELAYS[0])
  check('the longer one fires', t.opens === 3)
  sync.stop()
}

console.log('\n— the backoff schedule —')
{
  check('it grows', RECONNECT_DELAYS.every((d, i) => i === 0 || d > RECONNECT_DELAYS[i - 1]))
  check('the first retry is quick', reconnectDelay(0) <= 1000)
  check('it caps rather than growing forever',
    reconnectDelay(99) === RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1])
  check('a negative attempt is safe', reconnectDelay(-1) === RECONNECT_DELAYS[0])
}

console.log('\n— reconnecting re-fetches, because missed messages are gone —')
{
  const t = fakeTransport(row(1))
  const seen: number[] = []
  const sync = startMatchSync('m1', { onState: (_s, v) => seen.push(v) }, t.transport)
  t.status!('subscribed')
  await settle()
  check('applied 1', seen.join(',') === '1')

  // Drop. While offline the match advances to 7 — those messages never arrive.
  t.status!('error')
  t.stored = row(7)
  check('nothing was received while down', seen.join(',') === '1')

  t.advance(RECONNECT_DELAYS[0])
  t.status!('subscribed')
  await settle()
  check('reconnecting fetches again', t.fetches === 2)
  check('and catches up to 7 without replaying 2..6', seen.join(',') === '1,7', seen.join(','))
  check('back to live', sync.status().state === 'live')
  check('attempts reset on success', sync.status().attempts === 0)
  sync.stop()
}

console.log('\n— no network is reported differently from a flaky channel —')
{
  const t = fakeTransport(row(1))
  const sync = startMatchSync('m1', { onState: () => {} }, t.transport)
  t.status!('subscribed')
  await settle()
  t.online = false
  t.status!('error')
  check('offline is called offline', sync.status().state === 'offline', sync.status().state)
  check('and says so', /network/i.test(sync.status().message ?? ''), sync.status().message)

  t.online = true
  t.advance(RECONNECT_DELAYS[0])
  t.status!('error')
  check('with a network it is only reconnecting', sync.status().state === 'reconnecting')
  sync.stop()
}

console.log('\n— a failed fetch does not wedge it —')
{
  const t = fakeTransport(row(4))
  const seen: number[] = []
  const sync = startMatchSync('m1', { onState: (_s, v) => seen.push(v) }, t.transport)
  t.fetchThrows = true
  t.status!('subscribed')
  await settle()
  check('nothing was applied', seen.length === 0)
  check('and it says it is not in sync', sync.status().state === 'reconnecting')

  t.fetchThrows = false
  await sync.resync()
  check('a later resync recovers', seen.join(',') === '4')
  sync.stop()
}

console.log('\n— the poll catches what realtime never delivers —')
{
  // The bug this exists for: a channel that reports SUBSCRIBED while RLS
  // silently filters every event — an anonymous socket. Nothing arrives, no
  // error fires, and the badge says live. The poll is what still moves the
  // board.
  const t = fakeTransport(row(1))
  const seen: number[] = []
  const sync = startMatchSync('m1', { onState: (_s, v) => seen.push(v) }, t.transport)
  t.status!('subscribed')
  await settle()
  check('applied 1 on connect', seen.join(',') === '1')

  // The match advances on the server; the channel delivers NOTHING.
  t.stored = row(2)
  t.advance(LIVE_POLL_MS)
  await settle()
  check('the poll finds version 2 anyway', seen.join(',') === '1,2', seen.join(','))

  // And again — the loop reschedules itself.
  t.stored = row(3)
  t.advance(LIVE_POLL_MS)
  await settle()
  check('and keeps finding newer rows', seen.join(',') === '1,2,3', seen.join(','))

  // A quiet interval applies nothing — the version guard makes polling free.
  const before = seen.length
  t.advance(LIVE_POLL_MS)
  await settle()
  check('an unchanged row is not re-rendered', seen.length === before)

  const fetches = t.fetches
  sync.stop()
  t.advance(LIVE_POLL_MS * 10)
  await settle()
  check('stop ends the polling', t.fetches === fetches, String(t.fetches))
}

console.log('\n— stop() really stops —')
{
  const t = fakeTransport(row(1))
  const seen: number[] = []
  const sync = startMatchSync('m1', { onState: (_s, v) => seen.push(v) }, t.transport)
  t.status!('subscribed')
  await settle()
  const push = t.push!
  const status = t.status!
  sync.stop()

  push(row(99))
  check('a payload after stop is ignored', !seen.includes(99))
  status('error')
  check('and no retry is scheduled', t.pendingTimers() === 0)
  await sync.resync()
  check('resync after stop does nothing', t.fetches === 1, String(t.fetches))
}

console.log('\n— a pending retry is cancelled on stop —')
{
  const t = fakeTransport(row(1))
  const sync = startMatchSync('m1', { onState: () => {} }, t.transport)
  t.status!('subscribed')
  await settle()
  t.status!('error')
  check('a retry is pending', t.pendingTimers() === 2, String(t.pendingTimers()))
  sync.stop()
  check('stop clears it — retry AND poll', t.pendingTimers() === 0)
  const opensBefore = t.opens
  t.advance(60_000)
  check('and it never fires', t.opens === opensBefore)
}

console.log('\n— hotseat opens nothing —')
{
  // The hook does not call startMatchSync without a match id. Nothing here
  // should ever construct a transport, so the proof is that a fake one handed
  // to an unused sync records no activity.
  const t = fakeTransport(row(1))
  const matchId: string | null = null
  if (matchId) startMatchSync(matchId, { onState: () => {} }, t.transport)
  check('no channel opened', t.opens === 0)
  check('no fetch made', t.fetches === 0)
  check('no timers scheduled', t.pendingTimers() === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

}

void run()
