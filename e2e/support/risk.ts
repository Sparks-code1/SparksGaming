/**
 * Risk, driven from the front door to a board.
 *
 * WHAT IT IS FOR IS WHAT THE DUNE HELPERS ARE FOR: the unit suites prove the
 * rules compute, and cannot see a control that never rendered, one disabled
 * forever, or one with a notice box laid over it. Risk had no browser coverage
 * at all — every spec in this directory was Dune's — while carrying the one
 * feature nobody has played through, the AI opponents.
 *
 * THE REAL SCREENS, NOT A SEEDED POSITION. The Dune specs seed a match with the
 * service role and open it, because the phases they assert on are unreachable
 * without playing a whole turn first. Risk needs no such thing: the walk from
 * the front door to a live board is a dozen clicks and takes seconds, and it is
 * ITSELF the part nobody has driven. Skipping it with a fixture would skip the
 * only thing here that has never been proven.
 *
 * NO ACCOUNT, DELIBERATELY. A campaign can be created signed out — the form
 * says so — and every screen below works that way. A harness that signed in
 * would be asserting about auth on the way past, which is somebody else's test,
 * and would need an account to say nothing extra.
 *
 * IT CLICKS FOR THE COMPUTER, and that is not a workaround. Setup asks every
 * player in turn for a faction, an ability and an HQ, and asks a computer
 * player exactly as it asks a human — see playSetup. When that changes this
 * helper gets simpler and the specs above it do not change at all.
 */
import { expect, type Page } from '@playwright/test'

/** Long enough for a save to land, short enough that a hang still fails fast. */
const BEAT = 400

/** Every button on screen a player could actually press. */
async function pressable(page: Page): Promise<string[]> {
  return page.$$eval('button:not([disabled])',
    els => els.map(e => (e.textContent ?? '').trim()))
}

/**
 * Press the button whose text matches, and let the screen settle.
 *
 * BY WHAT IT SAYS, because Risk's controls carry no test hooks — Dune's screens
 * grew `data-` attributes as their specs were written and Risk's never did.
 * Text is what a player reads, so a spec that finds a control the way a player
 * finds it fails when a player would be lost, which is the right time to fail.
 * It does mean renaming a button breaks a spec; that is a fair price and a
 * one-line fix.
 */
export async function press(page: Page, text: string | RegExp): Promise<void> {
  const button = page.locator('button', { hasText: text }).first()
  await expect(button, `no pressable button matching ${text}`)
    .toBeEnabled({ timeout: 10_000 })
  await button.click()
  await page.waitForTimeout(BEAT)
}

/**
 * A campaign, created the way the front door creates one.
 *
 * Through Sparks Gaming rather than straight to a screen: the game picker is
 * the first thing anybody meets and nothing else asserts it is there.
 */
export async function newCampaign(page: Page, opts: {
  you?: string; others?: string[]
} = {}): Promise<void> {
  const you = opts.you ?? 'Harness'
  const others = opts.others ?? ['Bot One']

  await page.goto('/')
  await press(page, 'RISK LEGACY')
  await press(page, 'Create Campaign')

  await page.getByPlaceholder('What the board will call you').fill(you)
  await press(page, 'Create Campaign')

  // A game needs two players and a campaign starts with one. Every name added
  // is permanent, which is why the specs use throwaway ones.
  for (const name of others) {
    await page.getByPlaceholder('Add someone to the campaign').fill(name)
    await press(page, /^Add$/)
  }
}

/**
 * From a fresh campaign to the setup screens, with the seats you asked for.
 *
 * `ai` is which slots are computer players, counting from zero — `[1]` is the
 * second seat. The count chip is pressed rather than the rows counted, because
 * pressing the chip is what a player does.
 */
export async function openSlots(page: Page, opts: {
  players?: number; ai?: number[]
} = {}): Promise<void> {
  const players = opts.players ?? 2
  const ai = opts.ai ?? [1]

  await press(page, /Deal Scar Cards & Start Game/)
  await press(page, new RegExp(`^${players}$`))

  // ONE ROW'S WORTH AT A TIME. Every seat draws its own Human / AI pair, so
  // the nth AI button belongs to the nth seat — index, not text.
  for (const seat of ai) {
    await page.locator('button', { hasText: /^🤖 AI$/ }).nth(seat).click()
    await page.waitForTimeout(BEAT)
  }
}

/**
 * Leave the slots screen for the scar deal.
 *
 * SPLIT FROM openSlots, and the split is the point: a helper that arranged the
 * seats AND walked off the screen left nothing to assert about the seats. The
 * first version of the third spec below checked the AI toggles after calling it
 * and found none, because the run was two screens further on by then — a test
 * that failed on its own helper rather than on the app.
 */
export async function leaveSlots(page: Page): Promise<void> {
  await press(page, /Continue/)
}

/** The slots screen, arranged and then left. */
export async function startGame(page: Page, opts: {
  players?: number; ai?: number[]
} = {}): Promise<void> {
  await openSlots(page, opts)
  await leaveSlots(page)
}

/**
 * Walk the setup screens until the board appears.
 *
 * EVERY DECISION, FOR EVERY SEAT. Setup asks each player in turn for a faction,
 * a permanent ability and an HQ, and asks a computer player the same way it
 * asks a human: GameSetupScreen takes an `aiPlayerIds` set and consults it in
 * exactly one place, the alien weakness power. So the human at the keyboard
 * answers for the computer, and so does this.
 *
 * IT TAKES WHATEVER IS OFFERED. Which faction, which ability and which
 * territory are not what these specs are about — that setup can be completed at
 * all is. Choosing deliberately would also encode one dealing of the scar cards
 * and rot the first time the pool changes.
 */
/**
 * Who is being asked, if the screen says.
 *
 * ALL THREE CHOICE SCREENS NAME THEIR PICKER, in three different sentences:
 * "Harness — Pick a Faction", "Bot One (Imperial Balkania) — Choose Permanent
 * Ability", and the HQ map's "Bot One is choosing…". Read as text rather than
 * from a hook because there is none; the names are the players' own, which is
 * what makes them usable here.
 *
 * Null on a screen that asks nobody — the scar deal, the dice.
 */
export async function askedOf(page: Page): Promise<string | null> {
  const said = await page.locator('body').innerText()
  const m = said.match(/^(.+?) — Pick a Faction$/mi)
    ?? said.match(/^(.+?)\s*\([^)]*\) — Choose Permanent Ability$/mi)
    ?? said.match(/^(.+?)is choosing…$/mi)
  return m ? m[1].trim() : null
}

/**
 * Walk the setup screens until the board appears.
 *
 * @param only when given, the harness clicks for THIS player and nobody else.
 * Every other seat has to answer for itself or the walk stalls and fails —
 * which is the assertion, not a convenience. Setup used to put the computer's
 * faction, ability and HQ to the human at the keyboard, and a walk that
 * happily clicked them could not tell the difference before and after.
 */
export async function playSetup(page: Page, cap = 40, only?: string): Promise<void> {
  for (let i = 0; i < cap; i++) {
    if (await onBoard(page)) return

    // SOMEBODY ELSE'S DECISION: wait it out rather than making it. A seat that
    // never answers stalls the loop, runs the cap down and fails naming the
    // screen it died on.
    // CASE-INSENSITIVELY, because two of the three headings are uppercased in
    // CSS and innerText returns what is rendered: the faction screen asks
    // "HARNESS — PICK A FACTION" of a player the roster calls Harness. Compared
    // exactly, the walk waited for the human to answer for herself and ran the
    // cap down on her own turn.
    if (only) {
      const asked = await askedOf(page)
      if (asked && asked.toLowerCase() !== only.toLowerCase()) {
        await page.waitForTimeout(600)
        continue
      }
    }

    // The map stage: a territory is clicked, then confirmed.
    const confirmHQ = page.locator('button', { hasText: /Confirm HQ/ })
    if (await confirmHQ.count() && await confirmHQ.first().isEnabled()) {
      await confirmHQ.first().click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(BEAT)
      continue
    }
    if (await page.locator('text=PLACE YOUR HQ').count()) {
      await clickAnyTerritory(page)
      continue
    }

    // Everything else is a card to pick or a screen to advance past. Advance
    // FIRST where one is offered, so a screen carrying both does not have its
    // choice made twice.
    const names = await pressable(page)
    const forward = names.find(n => /continue|▶|→|confirm|roll|start/i.test(n))
    const target = forward ?? names.find(n => n !== '🔉')
    // A SCREEN MID-ANIMATION IS NOT A STUCK ONE. The dice roll disables both
    // its buttons while a die is tumbling, and the first version of this walk
    // arrived inside that window and declared the game soft-locked. The wait is
    // bounded, so a screen that really has nothing to press still fails — it
    // just has to stay that way for six seconds first.
    if (!target) {
      if (await settles(page)) continue
      throw new Error(`setup offered nothing to press.\n${await where(page)}`)
    }
    // BOUNDED, AND A MISS IS NOT FATAL. The screen is read, a button is chosen
    // by its text, and the button is then located again — and setup moves on
    // its own between those two steps. A tie on the first-player roll re-rolled
    // itself while this was mid-click, the element went stale, and Playwright
    // waited out the whole test for a control that no longer existed. Four
    // minutes to say "the button I saw is gone", which is not a fault.
    //
    // So the click gets a few seconds and the loop goes round again, re-reading
    // whatever is there now. A screen that genuinely offers nothing still fails
    // — at the top, where the message is about the screen.
    await page.locator('button', { hasText: target.slice(0, 24) }).first()
      .click({ timeout: 5000 })
      .catch(() => { /* it moved; look again */ })
    await page.waitForTimeout(BEAT)
  }
  throw new Error(`setup never reached a board in ${cap} steps.\n${await where(page)}`)
}

/**
 * Every territory the HQ picker will currently accept.
 *
 * THE MAP NAMES ITSELF. Each territory is a polygon carrying a `<title>`, which
 * is the browser's own tooltip and the accessible name — and the picker writes
 * the REASON into it when a territory refuses: "Alaska" is open, "Alaska — city"
 * is not. So the open ones are the titles with no dash in them, and no test
 * needs to know the rules to find one.
 *
 * A FIRST VERSION CLICKED POINTS ON A CANVAS, on the assumption that the board
 * was the Pixi one. It is not — this screen's map is SVG, one element per
 * territory, and a grid of blind clicks was both slower and unable to say which
 * territory it had hit.
 */
async function openTerritories(page: Page): Promise<string[]> {
  return page.$$eval('polygon > title',
    els => els.map(t => (t.textContent ?? '').trim())
      .filter(name => name.length > 0 && !name.includes('—')))
}

/**
 * Claim a territory for whoever is being asked.
 *
 * Takes the first one offered: which territory an HQ lands on is a rule these
 * specs do not assert, and naming one would break the first time a scar card
 * blocked it.
 */
async function clickAnyTerritory(page: Page): Promise<void> {
  // BY INDEX AMONG THE POLYGONS, so the click lands on the SHAPE.
  //
  // getByTitle finds the <title> element, which is metadata: it has no box, it
  // is never painted, and clicking it hovered the territory without selecting
  // it. The walk then went round forty times pointing at Peru and wondering why
  // no confirm bar appeared. The shape is the polygon; the title only says
  // which polygon it is.
  const at = await page.$$eval('polygon', els => {
    for (let i = 0; i < els.length; i++) {
      const name = els[i].querySelector('title')?.textContent?.trim() ?? ''
      if (name && !name.includes('—')) return i
    }
    return -1
  })
  if (at < 0) {
    throw new Error(`the HQ map offered no unblocked territory.\n${await where(page)}`)
  }
  await page.locator('polygon').nth(at).click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(BEAT)
}

/**
 * Is the board up, with a turn to take?
 *
 * THE PHASE IS THE TELL. The board is the only screen that names one, and it
 * always names one — whoever's turn it is, human or computer.
 *
 * CASE-INSENSITIVE, AND DRAFT IS IN THE LIST. The first version matched three
 * phases in capitals, and passed for a week's worth of runs because the dice
 * had put the computer first: its banner shouts "⚔ ATTACK". The turn the HUMAN
 * opens starts in DRAFT — which the list did not have — and reads "Begin
 * Attack →" in sentence case, which it did not match either. So the walk
 * declared a perfectly good board unreached, and which way it went depended on
 * a die roll. A flaky test is worse than a missing one: it teaches you to
 * re-run it.
 */
export async function onBoard(page: Page): Promise<boolean> {
  // AND A MAP UNDER IT, which is what keeps the loosened match honest. A
  // faction ability card reads "Imperial Levy — round up draft bonuses", so the
  // word alone is true on the ability screen and the walk would stop three
  // screens early. The board is the only screen in the app that draws to a
  // canvas: setup's map is an SVG of polygons, and every other screen is text.
  if (!(await page.locator('canvas').count())) return false
  return (await page.locator('text=/\\b(draft|attack|fortify|reinforce)\\b/i')
    .count()) > 0
}

/**
 * Wait for a screen with nothing pressable to grow something.
 *
 * Returns false when it does not, which is what makes the throw above mean
 * anything: the difference between busy and stuck is only ever how long it
 * lasts.
 */
async function settles(page: Page, tries = 12): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    await page.waitForTimeout(500)
    if ((await pressable(page)).some(n => n !== '🔉')) return true
  }
  return false
}

/** Where the walk is, for a failure that has to say something useful. */
async function where(page: Page): Promise<string> {
  const said = (await page.locator('body').innerText()).slice(0, 200)
  return `screen said:\n${said}\nbuttons: ${(await pressable(page)).join(' | ')}`
}

/**
 * The whole walk, front door to board.
 *
 * @param only pass a name to make the walk click for that player alone — see
 * playSetup. Left out, it clicks for whoever is asked, which is how it drove
 * setup before the computer answered its own questions.
 */
export async function soloGame(page: Page, opts: {
  players?: number; ai?: number[]; others?: string[]; you?: string; only?: string
} = {}): Promise<void> {
  await newCampaign(page, { you: opts.you, others: opts.others })
  await startGame(page, { players: opts.players, ai: opts.ai })
  await playSetup(page, 40, opts.only)
}
