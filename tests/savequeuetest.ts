// "Not connected — your progress is not being saved. Another player changed
// this campaign." On one machine. Repeatedly. Nobody else was playing.
//
// Two causes, both mine, both introduced by turning the compare-and-swap on:
//
//   1. Overlapping saves. GameBoard saves on phase changes, turn ends and
//      reward resolutions, and those overlap. Both reads took the same cached
//      version, so the second was guaranteed to lose the swap — and a lost swap
//      did not refresh the cached version, so EVERY save after it lost too. One
//      race ended persistence for the session.
//
//   2. The guard was armed on campaigns nobody else could possibly write.
//
// This suite pins the queue that fixes the first and the predicate that fixes
// the second.
import { SerialQueue } from '@/lib/serialQueue'
import { campaignIsShared } from '@/lib/legacyApi'
import { createRoster, claimRosterSeat } from '@/lib/roster'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms))

/**
 * A stand-in for the campaigns row, with the CAS and the bump trigger.
 * Deliberately faithful: writes are refused unless they name the current
 * version, and EVERY accepted write moves it — which is what the real trigger
 * does, and what made the unqueued version collide with itself.
 */
function fakeRow() {
  let version = 1
  let value = 'initial'
  const accepted: string[] = []
  return {
    get version() { return version },
    get value() { return value },
    accepted,
    /** Mirrors saveLegacyState: read the cached version, write against it. */
    async write(expected: number, next: string, delayMs = 5): Promise<number> {
      await tick(delayMs)                       // the network round trip
      if (expected !== version) throw new Error(`stale (had v${expected}, server v${version})`)
      version += 1
      value = next
      accepted.push(next)
      return version
    },
  }
}

// ─── 1. The race, unqueued — the bug as it shipped ────────────────────────
console.log('--- without the queue: overlapping saves collide ---')
{
  const row = fakeRow()
  let cached = row.version
  const save = async (v: string) => {
    const expected = cached                     // read the cached version…
    cached = await row.write(expected, v)       // …then write against it
  }
  const results = await Promise.allSettled([save('A'), save('B'), save('C')])
  check('only the first of three overlapping saves lands',
    results.map(r => r.status), ['fulfilled', 'rejected', 'rejected'])
  check('and the other two are reported as somebody else writing',
    (results[1] as PromiseRejectedResult).reason.message.startsWith('stale'), true)
  check('two turns worth of progress never reached the server', row.accepted, ['A'])
}

// ─── 2. The same three saves, queued ──────────────────────────────────────
console.log('\n--- with the queue: every save lands, in order ---')
{
  const row = fakeRow()
  const q = new SerialQueue()
  let cached = row.version
  const save = (v: string, delay = 5) => q.run('camp-1', async () => {
    const expected = cached
    cached = await row.write(expected, v, delay)
  })
  const results = await Promise.allSettled([save('A', 15), save('B', 1), save('C', 8)])
  check('all three succeed', results.map(r => r.status), ['fulfilled', 'fulfilled', 'fulfilled'])
  check('in the order they were requested, not the order they finish',
    row.accepted, ['A', 'B', 'C'])
  check('and the version advanced once per save', row.version, 4)
  check('the last write wins the row', row.value, 'C')
}

// ─── 3. A failure must not stop the saves behind it ───────────────────────
console.log('\n--- one failure does not end persistence for the session ---')
{
  const row = fakeRow()
  const q = new SerialQueue()
  let cached = row.version
  const save = (v: string) => q.run('camp-1', async () => {
    const expected = cached
    cached = await row.write(expected, v)
  })
  const boom = q.run('camp-1', async () => { throw new Error('network down') })
  const after = save('A')
  const results = await Promise.allSettled([boom, after])
  check('the failing item rejects to ITS caller', results[0].status, 'rejected')
  check('and the work queued behind it still runs', results[1].status, 'fulfilled')
  check('so the save after a failure reaches the server', row.accepted, ['A'])

  // The wedge: a rejection that killed the chain would leave this pending
  // forever, which is exactly "everything from this session is only in memory".
  const later = await Promise.allSettled([save('B')])
  check('and the queue keeps working afterwards', later[0].status, 'fulfilled')
  check('with both writes recorded', row.accepted, ['A', 'B'])
}

// ─── 4. Separate campaigns do not wait on each other ──────────────────────
console.log('\n--- keyed per campaign ---')
{
  const q = new SerialQueue()
  const order: string[] = []
  const slow = q.run('camp-1', async () => { await tick(20); order.push('slow') })
  const fast = q.run('camp-2', async () => { await tick(1); order.push('fast') })
  await Promise.all([slow, fast])
  check('a slow save on one campaign does not hold up another', order, ['fast', 'slow'])
}

// ─── 5. When the guard is worth arming at all ─────────────────────────────
console.log('\n--- the compare-and-swap only applies to shared campaigns ---')
{
  const solo = createRoster(['Ryan', 'Chris', 'Ana'], 1)
  check('nobody signed in — one machine, no second writer',
    campaignIsShared({ roster: solo }), false)

  const hostOnly = claimRosterSeat(solo, 'p1', 'user-ryan', 'r@x.com').roster
  check('just the host linked is still one machine',
    campaignIsShared({ roster: hostOnly }), false)

  const two = claimRosterSeat(hostOnly, 'p2', 'user-chris', 'c@x.com').roster
  check('two accounts CAN both open the lobby, so guard it',
    campaignIsShared({ roster: two }), true)

  check('an online game is shared no matter who has linked',
    campaignIsShared({ roster: solo, activeMatchId: 'match-1' }), true)
  check('and an ended match is not',
    campaignIsShared({ roster: solo, activeMatchId: null }), false)
  check('a campaign with no roster at all is not shared',
    campaignIsShared({}), false)

  // The regression in one line: Ryan's campaign, five names, none linked,
  // played on one machine. It must never take the guarded path.
  const ryansCampaign = createRoster(['Ryan', 'Chris', 'Hard', 'Medium', 'East'], 1)
  check("the campaign that kept reporting 'another player' is not shared",
    campaignIsShared({ roster: ryansCampaign }), false)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
