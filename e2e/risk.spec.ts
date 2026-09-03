/**
 * Risk reaches a board, and the board can be played.
 *
 * THE FIRST BROWSER COVERAGE RISK HAS EVER HAD. Every spec beside this one is
 * Dune's, and the feature this walk goes through — a game against a computer
 * opponent — is the one nobody has played end to end.
 *
 * WHAT IT ASSERTS IS THE WALK, not the rules. Which faction was taken, which
 * territory an HQ landed on and how the dice fell are all somebody else's test
 * and all of them already have one. This asks the three questions the unit
 * suites cannot: did the screen arrive, is what is on it pressable, and is
 * anything lying on top of it.
 */
import { test, expect } from '@playwright/test'
import { soloGame, newCampaign, openSlots, playSetup, startGame, onBoard } from './support/risk'

/**
 * The walk is a dozen screens with a save behind several of them.
 *
 * Longer than the file default because this one test IS the fixture the others
 * would have shared — there is no seeded position to open.
 */
test.setTimeout(240_000)

test('the front door opens Risk, and Risk opens a campaign', async ({ page }) => {
  await newCampaign(page)

  // THE JOIN CODE IS THE PROOF THE SERVER TOOK IT. A campaign that only lived
  // in the tab would render this screen just as well; the code is minted on
  // the row, so its presence says a write landed.
  //
  // .first() ON EVERY ONE. A text locator that resolves to five elements is a
  // strict-mode violation, not a pass — and "JOIN CODE" appears in the heading,
  // the label and the help line beneath it. What is being asked is whether the
  // screen says it at all.
  await expect(page.locator('text=JOIN CODE').first()).toBeVisible()
  await expect(page.locator('text=CAMPAIGN ROSTER').first()).toBeVisible()

  // Two names, which is the minimum a game needs — the screen says so itself
  // until the second one is added.
  await expect(page.locator('text=Harness').first()).toBeVisible()
  await expect(page.locator('text=Bot One').first()).toBeVisible()
  await expect(page.locator('text=A game needs at least 2 players')).toHaveCount(0)
})

test('a game against the computer reaches a board with a turn on it', async ({ page }) => {
  await soloGame(page)

  expect(await onBoard(page), 'setup finished but no phase controls arrived').toBe(true)

  // THE MAP IS THE GAME. A board that renders its panels and not its map looks
  // like a working app right up until you try to click a territory.
  //
  // A CANVAS HERE, POLYGONS IN THE HQ PICKER. The two maps in this app are not
  // the same map: setup draws an SVG with one polygon per territory, and the
  // board draws Pixi over a grey canvas base with an SVG layer for markers
  // only. A first version of this assertion counted polygons — the number the
  // picker gives — and found none on a board that was up and being played.
  const map = page.locator('canvas').first()
  await expect(map, 'the board arrived without a map to play on').toBeVisible()
  const box = await map.boundingBox()
  expect(box !== null && box.width > 200 && box.height > 150,
    `the map is present but ${box?.width ?? 0}x${box?.height ?? 0}`).toBe(true)

  // AND SOMETHING TO PRESS. A board arriving with no enabled control is a
  // soft-lock — the game is up, it is your turn, and there is nothing you can
  // do — which is the failure this whole run exists to catch.
  const live = page.locator('button:not([disabled])')
  expect(await live.count(), 'the board has no pressable control').toBeGreaterThan(0)
})

test('the player count chip sets the seats it names', async ({ page }) => {
  // A SEPARATE CAMPAIGN, because roster names are permanent and a second game
  // in the first one would be Game #2 with a roster of four.
  await newCampaign(page, { others: ['Bot One', 'Bot Two'] })

  // openSlots, NOT startGame: the assertion is about the slots screen, and
  // startGame leaves it. The first version of this test called startGame and
  // then counted AI toggles on the scar deal two screens later, where there
  // are none — it failed on its own helper and said nothing about the app.
  await openSlots(page, { players: 3, ai: [1, 2] })

  // Three seats asked for, three seats offered. The chips and the rows are
  // separate state, and a chip that highlights without moving the rows is a
  // control that looks like it worked.
  await expect(page.locator('button', { hasText: /^🤖 AI$/ })).toHaveCount(3)

  // AND THE TWO THAT WERE SET ARE THE TWO THAT ARE ON. Counting rows alone
  // would pass with every seat still human, which is the whole thing this
  // test is named for.
  //
  // aria-pressed, WHICH THE TOGGLE DID NOT HAVE. Its state lived only in a
  // background colour — unreadable to a screen reader and unassertable here
  // without matching rgba strings.
  await expect(page.locator('button[aria-pressed="true"]', { hasText: /^🤖 AI$/ }))
    .toHaveCount(2)
  await expect(page.locator('button[aria-pressed="true"]', { hasText: /^🧑 Human$/ }))
    .toHaveCount(1)
})

test('the computer makes its own setup choices', async ({ page }) => {
  // THE HARNESS CLICKS FOR "Harness" AND NOBODY ELSE. Every screen that asks
  // Bot One something has to be answered by Bot One, or the walk runs its cap
  // down waiting and fails naming the screen it stalled on.
  //
  // That is the whole assertion. Setup used to put the computer's faction, its
  // permanent ability and its HQ to the human at the keyboard — a solo player
  // made all of their opponents' opening decisions before playing against
  // them — and a walk that cheerfully clicked those could not tell the
  // difference before and after.
  await soloGame(page, { you: 'Harness', only: 'Harness', ai: [1] })

  expect(await onBoard(page), 'the computer never answered for itself').toBe(true)
})

test('two computers set up a game with nobody clicking for them', async ({ page }) => {
  // THREE SEATS, TWO OF THEM BOTS, and the walk still only answers for the
  // human. One bot answering could be a lucky ordering; two, in turn, through
  // faction, ability and HQ, is the sequencing working.
  await newCampaign(page, { others: ['Bot One', 'Bot Two'] })
  await startGame(page, { players: 3, ai: [1, 2] })
  await playSetup(page, 40, 'Harness')

  expect(await onBoard(page), 'two computers did not finish their own setup').toBe(true)

  // AND THE BOARD KNOWS ALL THREE. A bot that answered nothing would still let
  // the walk through if the screen simply skipped it; three seats on the board
  // is the proof each one actually took a faction and a piece of ground.
  const said = await page.locator('body').innerText()
  for (const who of ['Harness', 'Bot One', 'Bot Two']) {
    expect(said.includes(who), `${who} is not on the board`).toBe(true)
  }
})
