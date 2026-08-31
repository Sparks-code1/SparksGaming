/**
 * Setup, as a player meets it.
 *
 * The rules of setup are covered by dunesetuptest and setupwindowtest — what
 * they cannot see is whether the column that asks the questions rendered at
 * all, whether Ready is reachable, and whether pressing it does anything. Each
 * of those has failed before with every suite green.
 */
import { test, expect } from '@playwright/test'
import { readRun, stackOf } from './support/run'
import {
  signInSeat, openMatch, expectControlPresent, expectRespondsToClick, expectNothingOnTop,
} from './support/seat'

const run = readRun()
const stack = stackOf(run)

test.describe('setup: the controls are there and answer', () => {
  test('the setup column renders for a seated player', async ({ page, context }) => {
    await signInSeat(context, stack, 'atreides')
    await openMatch(page, run.matchId)

    // ONE: the column itself. It is passed `setup` handlers by the screen, and
    // a screen that stopped passing them draws no column at all — which looks
    // exactly like a match that has finished setting up.
    await expectControlPresent(page, '[data-layer="setup-window"]', 'the setup column')

    // ...and it is between the chat and the board, which is the arrangement
    // the whole grammar depends on: answers on the left, board in the middle.
    const order = await page.evaluate(() => {
      const at = (s: string) => {
        const el = document.querySelector(s)
        return el ? el.getBoundingClientRect().left : -1
      }
      return {
        chat: at('[data-layer="chat"]'),
        column: at('[data-layer="setup-window"]'),
        board: at('[data-layer="board"]'),
      }
    })
    expect(order.column, 'the setup column is not on screen').toBeGreaterThan(-1)
    expect(order.chat, 'the setup column is left of the chat').toBeLessThan(order.column)
    expect(order.column, 'the setup column is right of the board').toBeLessThan(order.board)
  })

  test('Ready is present, uncovered, and refuses while the seat owes something', async ({ page, context }) => {
    await signInSeat(context, stack, 'atreides')
    await openMatch(page, run.matchId)

    await expectControlPresent(page, '[data-layer="setup-ready"]', 'the Ready button')

    // THREE: the failure that wedged a match. A notice box was laid over the
    // corner Ready sat in, so nobody could press it, so setup never closed.
    // Ready moved into this column partly for that reason; this is the check
    // that says it stayed reachable.
    await expectNothingOnTop(page, '[data-layer="setup-ready"]', 'the Ready button')

    // TWO, in its honest form: this seat owes a traitor, so Ready SHOULD be
    // dead — and it should say why rather than just sitting there.
    const ready = page.locator('[data-layer="setup-ready"]').first()
    await expect(ready, 'Ready is live for a seat that still owes a decision').toBeDisabled()
    await expect(page.locator('[data-ready-blocked="yes"]').first()).toBeVisible()
    await expect(page.locator('[data-layer="setup-window"]'))
      .toContainText('Still to answer')
  })

  test('keeping a traitor frees Ready, and pressing it registers', async ({ page, context }) => {
    await signInSeat(context, stack, 'harkonnen')
    await openMatch(page, run.matchId)

    // The Harkonnen keep all four traitors and owe no decision for them, so
    // this seat's Ready is live from the start — the other half of the gate.
    const ready = page.locator('[data-layer="setup-ready"]').first()
    await expectControlPresent(page, '[data-layer="setup-ready"]', 'the Ready button')
    await expect(ready, 'the Harkonnen owe nothing yet Ready is dead').toBeEnabled()

    // TWO: it is not merely enabled — pressing it reaches the server and comes
    // back. The confirmation is the button's own state, which only changes
    // because the public row said so.
    await expectRespondsToClick(page, '[data-layer="setup-ready"]', 'the Ready button',
      async () => {
        await expect(ready, 'Ready was pressed and nothing came back')
          .toContainText('✓ Ready', { timeout: 30_000 })
      })

    // and the table was told, which is the public half of the same write
    await expect(page.locator('[data-layer="player-hud"] [data-ready="yes"]').first())
      .toBeVisible({ timeout: 30_000 })
  })

  test('a seat sees its own hand — and is told plainly if it does not', async ({ page, context }) => {
    await signInSeat(context, stack, 'atreides')
    await openMatch(page, run.matchId)

    // THE DEAL REACHED THIS BROWSER. Every route to an empty tray looks the
    // same on screen, so the check is that the alarm is ABSENT and the cards
    // are present — a seat holding nothing would show the alarm instead.
    await expect(page.locator('[data-layer="hand-lost"]'),
      'this seat was dealt nothing it can read').toHaveCount(0)
    await expectControlPresent(page, '[data-guide="traitor"], [data-keep]',
      'the traitor cards to choose from')
  })
})
