/**
 * The turn moves without anybody pressing anything.
 *
 * This is the one claim no unit test can make. The rule is pure and tested in
 * dunephasetest; what cannot be checked there is whether the effect actually
 * FIRES in a browser — and the failure mode is silent, because an effect that
 * takes the ticking clock as a dependency restarts its timer every second and
 * never fires at all. Everything still renders. The phase simply never moves,
 * which is indistinguishable from a table where nobody is playing.
 *
 * A spectator gets the opposite check: their browser must sit there and watch.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readRun, stackOf } from './support/run'
import { seedPhase, advanceTo, phaseOf, dealMatch } from './support/stack'
import { signInSeat, openMatch } from './support/seat'

const run = readRun()
const stack = stackOf(run)

/**
 * Push the look window into the past.
 *
 * The window is thirty seconds from phase entry and the auto-press waits for
 * it, so a test that played fair would sit here for half a minute. The clock
 * is the thing under test only in that the client READS it — so it is set,
 * not waited out.
 */
async function expireLookWindow(matchId: string) {
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  const { data } = await admin.from('matches').select('state, version').eq('id', matchId).single()
  const state = (data?.state ?? {}) as Record<string, unknown>
  const clock = state.phaseClock as { turn: number; phase: string } | undefined
  if (!clock) return
  await admin.from('matches')
    .update({ state: { ...state, phaseClock: { ...clock, closesAt: Date.now() - 1000 } } })
    .eq('id', matchId)
}

test('a seated player watches the phase advance without touching anything', async ({ page, context }) => {
  const matchId = seedPhase(stack, 'bidding')
  // Revival holds nothing and asks nobody for anything — the quiet phase that
  // used to sit there until a human pressed a button.
  await advanceTo(stack, 'atreides', matchId, 'Revival')
  expect(await phaseOf(stack, matchId)).toBe('Revival')
  await expireLookWindow(matchId)

  await signInSeat(context, stack, 'atreides')
  await openMatch(page, matchId)

  // NOT A CLICK ANYWHERE IN THIS TEST. The browser is the clock.
  await expect.poll(
    async () => phaseOf(stack, matchId),
    {
      message: 'the phase never advanced on its own — the client is not firing',
      timeout: 30_000,
      intervals: [500, 1000, 1000, 2000],
    },
  ).not.toBe('Revival')
})

test('a spectator watches and never drives', async ({ page, context }) => {
  // FOUR SEATS, so two accounts are left over to watch with.
  const matchId = dealMatch(stack, { seats: 4 })
  await advanceTo(stack, 'atreides', matchId, 'Storm', 3).catch(() => {})
  const before = await phaseOf(stack, matchId)
  await expireLookWindow(matchId)

  // The sixth account holds no seat at this table.
  await signInSeat(context, stack, 'bene-gesserit')
  await page.goto(`/?dune-match=${matchId}`)
  await page.waitForTimeout(8_000)

  expect(await phaseOf(stack, matchId),
    'a spectator advanced somebody else\'s game').toBe(before)
})
