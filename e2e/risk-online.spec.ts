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
 * THE WHOLE WALK, both browsers: two signed-in accounts, a campaign created and
 * hosted, the joiner reaching it with the code (which is join_campaign_by_code
 * doing the crossing), the joiner taking a lobby seat, THE HOST SEEING THEM
 * ARRIVE, the host starting once the table is ready, the dice, the factions and
 * the abilities answered independently on each screen, both HQs placed, and the
 * two boards naming the same seat's turn.
 *
 * IT WAS THREE THINGS, AND THE ONE THAT MATTERED WAS NOT IN THE HARNESS. This
 * spec sat fixme'd on a note saying the guest's click registered as a hover and
 * that the second browser's map took clicks differently. Nothing about that was
 * right, and the reason it read that way is worth keeping.
 *
 * ONE — A REAL CRASH, which is what this file exists to find. The projection
 * omits other seats' hands rather than emptying them, and the player strip and
 * the Cards button still read `p.cards.length`. Every board with an opponent on
 * it threw `Cannot read properties of undefined` and React unmounted the tree:
 * two blank browsers, no DOM, no buttons. Only a second browser can see it —
 * the solo specs never have a seat whose hand is hidden — and it had been
 * shipped and not yet played.
 *
 * TWO — THE READY TOGGLE. "✓ Ready — click to un-ready" is the same button as
 * "I'm Ready" wearing its other label. The blind walk reached the lobby in the
 * beat before the host's start had propagated, took it for progress, and undid
 * the ready this file had just cast. Then the screen moved on, the button went
 * with it, and an untimed click waited on a control that no longer existed
 * until the test timeout fired seven minutes later naming nothing.
 *
 * THREE — AND ONLY THEN THE HQ STAGE, though not as recorded. placeHQ was
 * being called on a browser that had already reached the board: the stage ended
 * between settleOnto reading the screen and placeHQ acting on it, so twelve
 * clicks went to detached nodes and the helper reported, in its own words, that
 * the map had taken the click as a hover. It had not. There was no map.
 *
 * THE LESSON IS ABOUT THE REPORT, NOT THE BUG. Each of these was intermittent,
 * and each failed with either no message or a confidently wrong one, so all
 * three were filed under the last thing anybody had watched go wrong. press()
 * carries a click timeout now and placeHQ says whether its clicks were refused
 * and why — a failure that names itself is worth more here than one more
 * assertion.
 */
test('a hosted game reaches both browsers, and the turn is the same turn', async ({ browser }) => {
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

    // ── STILL IN THE LOBBY, AND ALREADY READY ─────────────────────────────
    // Nothing on this screen is this seat's to press. The ready is cast and
    // its toggle now only takes it back; the seat-count chips are the host's
    // shape controls; Start is the host's. The walk lands here whenever the
    // host's start has not yet come round to this browser — a window of a beat
    // or two, hit about one run in five — and pressing ANYTHING in it undid the
    // ready this file had just cast. Excluding the toggle alone was not enough:
    // the fallback then reached for a seat-count chip instead. The screen is
    // simply not this seat's to act on, so it waits.
    if (/✓ Ready — click to un-ready/.test(said)) {
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
