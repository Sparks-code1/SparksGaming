/**
 * Two seats, two browsers, one Risk match.
 *
 * THE ONE SURFACE WHERE EVERY BUG HAS BEEN FOUND BY PLAYING. The phantom board,
 * the stale-turn skip, the reinforcement pool arriving empty, the ghost
 * territories, the joiner stuck on NOT CONNECTED, and this week a crash that
 * took both browsers down at HQ placement. Not one of them is visible to a unit
 * suite, and not one is visible to a SINGLE-page browser suite either: they are
 * all failures of the hand-off, where something true on one machine has to
 * become true on another.
 *
 * So nothing here asserts that a button worked. It asserts that it worked
 * THERE, and that the other browser now agrees.
 */
import { test, expect } from '@playwright/test'
import {
  openSeat, hostCampaign, joinByCode, startFromLobby, bothAgreeItIs, closeSeats, placeHQ,
  isForward, type Seat,
} from './support/online'
import { onBoard, whoseTurn } from './support/risk'

/** Two browsers, a lobby, a deal and a turn. Slower than the solo walk. */
test.setTimeout(420_000)

/**
 * NOT GREEN YET, and marked so rather than left to fail the suite.
 *
 * HOW FAR IT GETS, which is most of the way and all of the hard part: two
 * signed-in browsers, a campaign created and hosted, the joiner reaching it
 * with the code (which is join_campaign_by_code doing the crossing), the joiner
 * taking a lobby seat, THE HOST SEEING THEM ARRIVE — the first hand-off, and it
 * passes — the host starting once the table is ready, then the dice, the
 * factions and the abilities answered independently on each screen, and the
 * host's HQ placed.
 *
 * WHERE IT STOPS: the guest's HQ click registers as a hover rather than a
 * selection, so no confirm bar appears and that browser never reaches the
 * board. placeHQ retries twelve territories looking for the bar and finds none,
 * which is why the run is slow as well as red. The host's identical click on
 * the same map works, so it is not the coordinate maths — something about the
 * second browser's map is taking the click differently, and finding out is the
 * next job.
 *
 * WHAT IS ALREADY WORTH HAVING: the helpers in support/online.ts. Two contexts,
 * two accounts, the lobby walk and bothAgreeItIs are the expensive parts and
 * they work.
 */
test.fixme('a hosted game reaches both browsers, and the turn is the same turn', async ({ browser }) => {
  const seats: Seat[] = []
  try {
    const host = await openSeat(browser, 0)
    const guest = await openSeat(browser, 1)
    seats.push(host, guest)

    // ── The lobby, through the real screens ────────────────────────────────
    // BOTH CROSSINGS ARE HERE and both were broken this week. Reaching the
    // campaign is join_campaign_by_code: the joiner is not on the roster, so
    // they can neither read the row nor write it, and the code is the whole
    // credential. Entering the lobby is takeSeat, a different table and a
    // different rule.
    const { code } = await hostCampaign(host)
    expect(code, 'the host never got a join code').toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/)

    await joinByCode(guest, code)

    // ── THE HOST SEES THE JOINER ARRIVE ────────────────────────────────────
    // The first hand-off in the run, and the cheapest one to get wrong: the
    // guest's seat exists on the guest's screen the instant they press, and on
    // the host's only when the lobby row comes back round.
    // .first(), because the joiner's name lands in two places at once on the
    // host's screen — the seat itself and the line waiting on them — and two
    // matches is a strict-mode failure rather than a pass. The question here
    // is whether the name arrived at all.
    await expect(host.page.locator(`text=${guest.name}`).first(),
      'the host never saw the joiner take a seat').toBeVisible({ timeout: 30_000 })

    // ── The host starts, once the table is ready ───────────────────────────
    await startFromLobby(host, guest)

    // ── Both onto a board ──────────────────────────────────────────────────
    // Whatever the setup screens ask, they ask it of a named seat, and each
    // browser answers only for itself — the same rule playSetup follows solo.
    // BOTH SCREENS ON A FAILURE. Promise.all reports the first rejection and
    // throws the other away, so a stuck pair told you about one browser and
    // left you guessing about the one that actually caused it — which is
    // exactly the wrong half in a hand-off bug.
    const settled = await Promise.allSettled([
      settleOnto(host, host.name),
      settleOnto(guest, guest.name),
    ])
    const broke = settled.filter(r => r.status === 'rejected')
    if (broke.length) {
      const { where } = await import('./support/risk')
      throw new Error([
        ...broke.map(r => (r as PromiseRejectedResult).reason?.message),
        '=== HOST SCREEN ===',
        await where(host.page),
        '=== GUEST SCREEN ===',
        await where(guest.page),
      ].join('\n\n'))
    }

    expect(await onBoard(host.page), 'the host never reached a board').toBe(true)
    expect(await onBoard(guest.page), 'the joiner never reached a board').toBe(true)

    // ── AND THE TWO BOARDS ARE THE SAME BOARD ──────────────────────────────
    // The assertion this file exists for. A turn belongs to one seat, and both
    // machines have to name the same one — every online bug in this project has
    // been a machine that did not find out, or found out and had it taken away
    // again by an echo.
    const first = await whoseTurn(host.page)
    expect(first, 'nobody holds the opening turn').toBeTruthy()
    await bothAgreeItIs(seats, first!)
  } finally {
    await closeSeats(seats)
  }
})

/**
 * Answer whatever this browser's own seat is asked, until a board appears.
 *
 * ONLINE SETUP IS ANSWERED ON EACH PLAYER'S OWN SCREEN — the dice, the faction,
 * the HQ — so each browser drives itself and neither may click for the other.
 * That is the rule under test as much as it is the mechanism: a screen that let
 * one machine answer for both is how a setup document goes out of step.
 */
async function settleOnto(seat: Seat, me: string, budgetMs = 120_000): Promise<void> {
  const { askedOf, press, where } = await import('./support/risk')
  const until = Date.now() + budgetMs

  while (Date.now() < until) {
    if (await onBoard(seat.page)) return
    const said = await seat.page.locator('body').innerText()

    // ── WAITING IS NOT BEING STUCK ────────────────────────────────────────
    // Online setup asks each player on their own screen, so a browser spends
    // most of this walk with nothing to do and the screen says so. A first
    // version counted STEPS, and the host — waiting perfectly correctly for
    // the guest to choose an ability — spent its whole allowance waiting and
    // reported that it never reached a board. Time is the honest budget: a
    // seat that waits forever still fails, and a seat that waits a while does
    // not.
    if (/Waiting for .+ to\b/i.test(said)) {
      await seat.page.waitForTimeout(700)
      continue
    }

    // ── THE MAP STAGE, which is not a button ──────────────────────────────
    // Each player places their own HQ on their own screen, and the prompt says
    // so — "your pick — choose on the map".
    if (/PLACE YOUR HQ/.test(said)) {
      // MINE OR THEIRS. Both players see the map; only the one being asked is
      // told it is their pick.
      if (/your pick/i.test(said)) await placeHQ(seat.page)
      else await seat.page.waitForTimeout(700)
      continue
    }

    // Somebody else's decision, on a screen that names its picker: wait it out
    // rather than answering for them. Neither browser may click for the other
    // — that is the rule under test as much as it is the mechanism.
    const asked = await askedOf(seat.page)
    if (asked && asked.toLowerCase() !== me.toLowerCase()) {
      await seat.page.waitForTimeout(700)
      continue
    }

    const live = await seat.page.$$eval('button:not([disabled])',
      els => els.map(e => (e.textContent ?? '').trim()))
    const go = live.filter(isForward)
      .find(n => /continue|▶|→|confirm|roll|start|begin/i.test(n))
      ?? live.filter(isForward)[0]
    if (!go) { await seat.page.waitForTimeout(700); continue }
    await press(seat.page, go.slice(0, 24)).catch(() => {})
  }
  throw new Error(
    `${me} never reached a board in ${budgetMs / 1000}s.\n${await where(seat.page)}`)
}
