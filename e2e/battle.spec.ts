/**
 * A battle, as the aggressor and their opponent meet it.
 *
 * dunebattletest covers the arithmetic, the traitors, the leaders and the
 * capture. What it cannot see is whether the aggressor was actually offered a
 * choice of battle, whether the dial the plan needs accepts a number, and
 * whether the fight opened for the seat opposite. Those are prop-passing and
 * reachability questions, and the battle screen is the busiest overlay in the
 * app — the likeliest place for one control to end up under another.
 */
import { test, expect } from '@playwright/test'
import { readRun, stackOf } from './support/run'
import { seedPhase } from './support/stack'
import {
  signInSeat, openMatch, expectControlPresent, expectRespondsToClick, expectNothingOnTop,
} from './support/seat'
import { createClient } from '@supabase/supabase-js'

const run = readRun()
const stack = stackOf(run)

let matchId = ''
let aggressor = ''

test.beforeAll(async () => {
  // The fixture is built for this: two contested territories, real hands and
  // traitors crossed, with the aggressor already picking.
  matchId = seedPhase(stack, 'battle')
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  const { data } = await admin.from('matches').select('state').eq('id', matchId).single()
  const state = (data?.state ?? {}) as {
    battles?: { order?: string[]; at?: number }
  }
  // THE ROTATION'S, not the roster's. The storm decides who fights first, and
  // a spec that assumed seats[0] would be testing its own guess.
  aggressor = state.battles?.order?.[state.battles?.at ?? 0] ?? 'atreides'
})

test('the aggressor is offered the battles to choose between', async ({ page, context }) => {
  await signInSeat(context, stack, aggressor)
  await openMatch(page, matchId)

  // ONE: the picker. Every one of these buttons exists only because the screen
  // passed onBattlePick down; without it the aggressor sits looking at a board
  // with nothing to press and no indication anything is expected of them.
  await expectControlPresent(page, '[data-pick]', 'the choice of battle')
  const picks = await page.locator('[data-pick]').count()
  expect(picks, 'the aggressor was offered no opponent to fight').toBeGreaterThan(0)

  // THREE: the battle screen is the app's densest overlay stack. This is the
  // check that the choice is not underneath one of the others.
  await expectNothingOnTop(page, '[data-pick]', 'the choice of battle')
})

test('a seat that is not the aggressor is offered no pick', async ({ page, context }) => {
  const bystander = stack.factions.find(f => f !== aggressor)!
  await signInSeat(context, stack, bystander)
  await openMatch(page, matchId)

  // A control whose one outcome is a refusal is worse than no control, and it
  // is also what makes the previous test mean something.
  await expect(page.locator('[data-pick]'),
    `${bystander} is not the aggressor yet was offered the pick`).toHaveCount(0)
})

test('picking a battle opens the plan, and the dial takes a number', async ({ page, context }) => {
  await signInSeat(context, stack, aggressor)
  await openMatch(page, matchId)

  // TWO: the pick is pressed, and the server answers — the plan controls only
  // exist once the battle it opened came back on the public row.
  await expectRespondsToClick(page, '[data-pick]', 'the choice of battle', async () => {
    await expect(page.locator('[data-dial-number]').first(),
      'the battle was picked and no plan opened').toBeVisible({ timeout: 30_000 })
  })

  // The dial is the one control a plan cannot be submitted without, and it is
  // a wheel drawn in svg rather than a field — so "does it work" means a click
  // on a number lands on that number, and the panel says so back.
  await expectNothingOnTop(page, '[data-dial-number="2"]', 'the battle dial')
  await page.locator('[data-dial-number="2"]').first().click()
  await expect(page.locator('[data-dial-shown]').first(),
    'the dial was clicked and the plan did not take the number').toHaveText('2', { timeout: 10_000 })

  // ...and the half-step beside it, which is the advanced game's whole reason
  // for a wheel instead of a number — present, enabled, and it moves the same
  // reading.
  const half = page.locator('[data-dial-half]').first()
  if (await half.count() > 0) {
    await expectNothingOnTop(page, '[data-dial-half]', 'the half-step')
    await expect(half, 'the half-step is drawn but dead').toBeEnabled()
    await half.click()
    await expect(page.locator('[data-dial-shown]').first(),
      'the half-step did not reach the dial').toHaveText('2½', { timeout: 10_000 })
  }
})
