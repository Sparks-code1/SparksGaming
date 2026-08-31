/**
 * Shipment, as the seat whose turn it is meets it.
 *
 * duneshipmenttest already proves the fares, the rates, the Guild's discount
 * and who may land where. None of that is re-checked here. What is checked is
 * that the rail carrying those rules reached the screen at all, that its
 * bubbles answer a click, and that the board's landing spots are reachable
 * rather than sitting under something.
 *
 * THE RAIL IS THE PROP-PASSING CASE. It draws only when the screen is handed a
 * seat, a player row, an onShipReserves and the right phase — four conditions,
 * any of which can quietly stop being true at the call site while ShipRail
 * itself stays perfect and every unit suite stays green.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readRun, stackOf } from './support/run'
import { seedPhase, advanceTo, phaseOf } from './support/stack'
import {
  signInSeat, openMatch, expectControlPresent, expectRespondsToClick, expectNothingOnTop,
} from './support/seat'

const run = readRun()
const stack = stackOf(run)

let matchId = ''
let actor = ''
let bystander = ''

/**
 * EVERYTHING THE SPECS SHARE IS BUILT HERE, not in the first test.
 *
 * A value assigned inside one test and read by the next is only there when the
 * whole file runs in order — run one test on its own to look at a failure and
 * it is suddenly empty, which fails in a way that says nothing about the app.
 */
test.beforeAll(async () => {
  // From the auction's position forward to shipment: Bidding → Revival →
  // Shipment and Movement, pressed rather than written.
  matchId = seedPhase(stack, 'bidding')
  await advanceTo(stack, 'atreides', matchId, 'Shipment and Movement')
  expect(await phaseOf(stack, matchId)).toBe('Shipment and Movement')

  // WHOEVER THE ROTATION LANDED ON. The storm decides it, so it is read off
  // the row rather than assumed — a spec that guessed would fail for a reason
  // that says nothing about the controls.
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  const { data } = await admin.from('matches').select('state').eq('id', matchId).single()
  // THE ROTATION AND A CURSOR INTO IT, the same shape the battles carry uses —
  // not a `toAct` field. Reading one that is not there yields undefined, and a
  // fallback then signs in as a seat whose turn it is not, whose bubbles are
  // correctly dead: a green-looking spec failing for its own reason.
  const shipping = ((data?.state ?? {}) as {
    shipping?: { order?: string[]; at?: number }
  }).shipping
  actor = shipping?.order?.[shipping?.at ?? 0] ?? ''
  expect(actor, 'the shipment phase opened with nobody to act').not.toBe('')
  bystander = stack.factions.find(f => f !== actor)!
})

test('the ship rail reaches the screen for the seat whose window is open', async ({ page, context }) => {
  await signInSeat(context, stack, actor)
  await openMatch(page, matchId)

  // ONE: the rail itself, and its bubbles. If the screen stopped passing
  // onShipReserves this is simply absent, and the seat whose turn it is has
  // nothing to press and no way to know why.
  await expectControlPresent(page, '[data-rail-reserves]', `the ship rail for ${actor}`)
  await expectControlPresent(page, '[data-ship-bubble]', 'a reserve bubble to stage from')

  // THREE: the rail sits between the chat and the board, the busiest strip on
  // the screen and the one where a new overlay would land on top of it.
  await expectNothingOnTop(page, '[data-ship-bubble]', 'the reserve bubble')
})

test('a reserve bubble answers a click and stages a force', async ({ page, context }) => {
  await signInSeat(context, stack, actor)
  await openMatch(page, matchId)

  const before = await page.locator('[data-rail-reserves]').first().innerText()

  // TWO: it is not merely drawn — clicking it moves a force out of the pool
  // and into the staging count. A bubble that renders and swallows its click
  // looks identical until you try to ship.
  await expectRespondsToClick(page, '[data-ship-bubble]', 'the reserve bubble', async () => {
    await expect(page.locator('[data-rail-reserves]').first(),
      'the pool did not move when a force was staged').not.toHaveText(before, { timeout: 10_000 })
  })

  // ...and the board offers somewhere to put it. The targets are drawn INSIDE
  // the board's own svg, so this is also the check that the two halves of one
  // action agree the action is live.
  await expectControlPresent(page, '[data-ship-target]', 'a landing spot on the board')
  await expectNothingOnTop(page, '[data-ship-target]', 'a landing spot on the board')
})

test('a seat outside its window keeps the counter and loses the controls', async ({ page, context }) => {
  await signInSeat(context, stack, bystander)
  await openMatch(page, matchId)

  // THE RAIL IS THE COUNTER, and every seated player is entitled to it all
  // phase — what belongs to the seat whose turn it is are the CONTROLS. So the
  // bubbles are here and dead, which is the honest version of "present but
  // unclickable": deliberate, visible, and reversed the moment the turn comes
  // round. This is what makes the previous test mean something, since a rail
  // that was live for everybody would pass it while being badly wrong.
  await expectControlPresent(page, '[data-rail-reserves]',
    `the counter for ${bystander}`)
  await expect(page.locator('[data-ship-bubble]').first(),
    `${bystander} is not shipping yet the bubbles are live`).toBeDisabled()

  // and no landing spots, because there is nothing staged to land
  await expect(page.locator('[data-ship-target]'),
    `${bystander} was offered somewhere to ship to`).toHaveCount(0)
})
