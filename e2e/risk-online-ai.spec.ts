import { test, expect } from '@playwright/test'
import {
  openSeat, hostCampaign, joinByCode, startFromLobby, bothAgreeItIs, closeSeats, seatComputers,
  settleOnto, type Seat,
} from './support/online'
import { onBoard, whoseTurn, passTurn, where, toPlace, draftableTerritory, placeBurst } from './support/risk'

test.setTimeout(420_000)

/**
 * A computer seat online is played by the host's machine. Its first draft is
 * where the host's board came down on 2026-09-05: the AI's trade-in read
 * `cards.length` off a seat that, online, carries only a cardCount — and a
 * crash in a passive effect unmounts the whole board. The other machines were
 * fine, which is what makes this the host's spec: the host drives, the guest
 * watches, and the assertion is that the host is still standing when the
 * computer hands the turn back.
 */
test('a computer seat takes its turn on the host without taking the host down', async ({ browser }) => {
  const seats: Seat[] = []
  try {
    const host = await openSeat(browser, 0)
    const guest = await openSeat(browser, 1)
    seats.push(host, guest)

    // What "blank screen" looks like from outside: an error that escaped React.
    const crashes: string[] = []
    host.page.on('pageerror', e => crashes.push(e.message))
    // BOTH HALVES OF THE FIX, OBSERVED. The board warns when a computer's hand
    // has not reached it — so a run with no crash but that warning would be the
    // guard alone doing the work, with the policy silently not delivering. And
    // the guest must NOT receive the computer's row: a foreign row is reported
    // as a privacy failure, and the guest did not create this match.
    const unheld: string[] = []
    host.page.on('console', m => { if (/is not held on this machine/.test(m.text())) unheld.push(m.text()) })
    // The hold announcing itself on a seat's console is the proof the burst
    // reached the race at all; a burst that never did proves nothing.
    const holds = new Map<Seat, string[]>()
    for (const s of seats) {
      holds.set(s, [])
      s.page.on('console', m => { if (m.text().includes('[Sync] holding board')) holds.get(s)!.push(m.text()) })
    }
    const leaks: string[] = []
    for (const s of [host, guest]) s.page.on('console', m => { if (m.text().includes('[privacy]')) leaks.push(s.name + ': ' + m.text()) })

    const { code } = await hostCampaign(host)
    await joinByCode(guest, code)
    await expect(host.page.locator(`text=${guest.name}`).first(),
      'the host never saw the joiner take a seat').toBeVisible({ timeout: 30_000 })
    await seatComputers(host, 1)
    // THE RESIZE REACHES THE GUEST BEFORE THE GUEST READIES. Readiness is a
    // per-seat flag the host's copy of the lobby decides Start on, and a table
    // resized underneath a ready that was already cast has raced it once.
    await expect(guest.page.locator('text=🤖').first(),
      'the joiner never saw the computer seat').toBeVisible({ timeout: 15_000 })
    await startFromLobby(host, guest)

    // Setup: each human answers for themselves; the host's machine answers for
    // the computer, which settleOnto waits out like any other seat's decision.
    const humans = seats.map(s => s.name.toLowerCase())
    const human = (n: string | null) => !!n && humans.includes(n.toLowerCase())
    const settled = await Promise.allSettled([
      settleOnto(host, host.name, { alsoFor: n => !human(n) }),
      settleOnto(guest, guest.name),
    ])
    const broke = settled.filter(r => r.status === 'rejected').map(r => (r as PromiseRejectedResult).reason?.message)
    if (broke.length) throw new Error(broke.join(' || ') + ' || HOST: ' + (await where(host.page)) + ' || GUEST: ' + (await where(guest.page)))

    const standing = async () => {
      if (crashes.length) throw new Error('the host screen crashed: ' + crashes.join(' | '))
      if (!(await onBoard(host.page))) throw new Error('the host lost the board: ' + (await where(host.page)))
    }
    const settleAway = async (from: string) => {
      const until = Date.now() + 30_000
      while (Date.now() < until && (await whoseTurn(host.page)) === from) await host.page.waitForTimeout(400)
    }

    // THE COMPUTER MUST PLAY AFTER THE GUEST HAS. The host board keeps every
    // hand it dealt until a state arrives from the OTHER machine — its own
    // actions never echo back — so the split shape the crash needs is only on
    // the host once the guest has acted. That was the table order reported:
    // the guest, then the host, then the computer on the host screen.
    const order: string[] = []
    let guestPassed = false, computerPlayed = false, burstDone = false
    for (let step = 0; step < 8 && !computerPlayed; step++) {
      await standing()
      const now = await whoseTurn(host.page)
      order.push(now ?? 'nobody')
      if (human(now)) {
        const s = seats.find(x => x.name.toLowerCase() === now!.toLowerCase())!
        await bothAgreeItIs(seats, now!)
        // THE FIRST HUMAN TURN PLACES IN A BURST and watches its own pill: two
        // clicks before the first has landed, then the count must only fall.
        let hint: string | undefined
        if (!burstDone && (await toPlace(s.page)) >= 3) {
          const spot = await draftableTerritory(s.page)
          const burst = await placeBurst(s.page, spot.id, 2, { name: s.name })
          expect(burst.rewound, s.name + ' saw its own troops rewind while placing: ' + burst.seen.join(',')).toBe(false)
          expect(holds.get(s)!.length, s.name + "'s burst never reached the hold — the echo did not beat the response, so nothing was proven").toBeGreaterThan(0)
          hint = spot.id
          burstDone = true
        }
        await passTurn(s.page, hint)
        await settleAway(now!)
        if (s === guest) guestPassed = true
        continue
      }
      // The computer's turn, driven by the host and watched by the guest. It
      // ends on its own; the host has to be there to see it end.
      if (guestPassed) computerPlayed = true
      const until = Date.now() + 90_000
      while (Date.now() < until) {
        await standing()
        if (human(await whoseTurn(host.page))) break
        await host.page.waitForTimeout(500)
      }
      const back = await whoseTurn(host.page)
      expect(human(back), 'the computer never handed the turn back: ' + (back ?? 'nobody')).toBe(true)
      await bothAgreeItIs(seats, back!)
    }
    console.log('TURN ORDER SEEN: ' + order.join(' -> '))
    expect(computerPlayed, 'the computer never took a turn after the guest had passed').toBe(true)
    await standing()
    expect(unheld, 'the computer played without its hand on the host — the policy did not deliver it').toEqual([])
    expect(leaks, 'a secrets row reached a screen that does not play that seat').toEqual([])
  } finally {
    await closeSeats(seats)
  }
})
