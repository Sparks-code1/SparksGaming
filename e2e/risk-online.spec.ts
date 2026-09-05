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
    // A SLOWER NETWORK THAN LOOPBACK, on purpose — see openSeat. Both seats,
    // because which one holds the opening turn is decided by dice later, and
    // the hold at the end needs the acting seat to be the one whose realtime
    // arrives after its own POST returns. 1.5 s is far more than a loopback
    // response takes and far less than any hand-off below is allowed.
    const host = await openSeat(browser, 0, { slowRealtime: 1500 })
    const guest = await openSeat(browser, 1, { slowRealtime: 1500 })
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

    // ── AND EVERY SEAT SEES EVERY BUILD ────────────────────────────────────
    // Each client announces `<version>+<commit>` over presence and the badge
    // beside Live shows the table. This is the round trip the unit suite
    // cannot make: both browsers here are the same dev server, so each must
    // show the OTHER as present — "2 here, same build" — and both must name
    // the same build. A table on different builds would read "⚠ Name on …"
    // instead, which is the thing that used to be discovered from symptoms.
    const badgeOf = (s: Seat) => s.page.locator('text=/Live\\s*·\\s*v\\S+/').first()
    const builds: string[] = []
    for (const s of seats) {
      await expect(badgeOf(s), `${s.name}'s badge never showed both seats on one build`)
        .toHaveText(/Live\s*·\s*v\S+\s*·\s*2 here, same build/, { timeout: 20_000 })
      // `· v` rather than a bare `v`: the badge starts with the word "Live",
      // whose own v matched first and captured the letter e.
      builds.push((await badgeOf(s).innerText()).match(/·\s*v(\S+)/)?.[1] ?? '')
    }
    expect(builds[0], 'the two browsers reported different builds off one dev server').toBe(builds[1])
    expect(builds[0], 'the build id carries no commit').toMatch(/^\d+\.\d+\.\d+\+[0-9a-f]{7}$/)

    // ── AND A MOVE MADE HERE STAYS MADE HERE ───────────────────────────────
    // The hand-off has a direction nothing above checks: a move has to stay
    // true on the machine that MADE it. It did not. matchSync drops the echoes
    // of a client's own actions, so the last board the wire delivered to the
    // acting seat is the state at the START of its turn — and every action
    // rewrote that seat's secrets row, which re-emitted that stale board onto
    // the acting screen with the move missing. Troops back at the HQ, draft
    // phase again, the turn announced again; the opponent's screen fine
    // throughout, because the acting seat's echoes DO reach them.
    //
    // So the acting seat places its whole draft and moves to attack, and then
    // this WAITS — three seconds, long past the secrets echo — asserting the
    // whole time that the screen has not gone back to the draft. A hold is the
    // assertion; a snapshot taken the instant after the press passes either
    // way.
    // ── ON THE SECOND SEAT TO ACT, WHICH IS THE ONLY ONE THE BUG CAN REACH ──
    // A seat's cached wire board is only ever refreshed by the OTHER seat's
    // actions — its own echoes are dropped. The seat that acts FIRST in a
    // match has therefore never received a board at all: the host dealt it,
    // every version since was its own, and its cache is null, so the stale
    // re-emit is a no-op there. Two earlier versions of this hold ran on
    // whoever won the dice, which was the host, and passed with the bug fully
    // restored because they were holding on the one seat that cannot see it.
    // The instrumented trace showed the re-emit firing three times on the
    // watching seat and never on the acting one.
    //
    // So the first seat plays its turn out and hands over, and the hold is
    // done by the second — who has now received a whole turn of the other's
    // states and holds exactly the cache the bug needs. That is Linda's seat.
    const { toPlace, draftableTerritory, clickTerritory, press: pressOn, passTurn } = await import('./support/risk')
    const opener = seats.find(s => s.name.toLowerCase() === first!.toLowerCase())!
    const actor = seats.find(s => s !== opener)!
    const watcher = opener
    await passTurn(opener.page)
    await bothAgreeItIs(seats, actor.name)

    expect(await toPlace(actor.page), 'the acting seat was owed no reinforcements').toBeGreaterThan(0)
    const spot = await draftableTerritory(actor.page)
    for (let i = 0; i < 40 && (await toPlace(actor.page)) > 0; i++) {
      await clickTerritory(actor.page, spot.id)
    }
    expect(await toPlace(actor.page), 'the draft never reached zero').toBe(0)

    // Into the attack phase, however many presses the controls want.
    for (let i = 0; i < 3; i++) {
      if (/End Attack/.test(await actor.page.locator('body').innerText())) break
      await pressOn(actor.page, /✓ Confirm|Begin Attack/)
    }
    expect(await actor.page.locator('body').innerText(),
      'the acting seat never reached the attack phase').toMatch(/End Attack/)

    // THE PHASE HEADER, NOT THE BUTTONS. A first version of this hold watched
    // for "Begin Attack" and "N to place" and passed with the bug fully
    // restored — because the revert puts the BOARD back to the deal while the
    // draft counter is React state that does not revert with it, so the
    // screen after a revert reads "✓ Confirm" and "✓ all placed": draft
    // phase, wearing the labels of a finished draft. The header says which
    // phase the board is in and says it from the board.
    //
    // AND IT NEEDED THE SLOW NETWORK ABOVE TO FAIL AT ALL. With the header
    // check fixed it STILL passed against the restored bug, because on
    // loopback the realtime echo of your own action beats your POST response,
    // matchSync forwards it, and the cached board is current by the time the
    // secrets echo re-emits it. The bug's precondition is the response winning.
    // The 1.5 s hold on realtime frames guarantees it, which is the ordering a
    // real player on a real network gets — and the one this test was silently
    // never exercising.
    const until = Date.now() + 3_000
    while (Date.now() < until) {
      const said = await actor.page.locator('body').innerText()
      expect(said, 'the acting screen went back to the draft after its own move')
        .not.toMatch(/\bDRAFT\b|✓ Confirm|Begin Attack|\d+ to place|all placed/)
      expect(said, 'the acting screen left the attack phase').toMatch(/End Attack/)
      await actor.page.waitForTimeout(250)
    }
    // And the opponent sees the same phase — the truth did land.
    await expect(watcher.page.locator('text=/\\battack\\b/i').first(),
      'the watching seat never saw the attack phase').toBeVisible({ timeout: 15_000 })
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
