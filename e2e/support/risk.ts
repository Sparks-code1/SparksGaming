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
import {
  TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT,
} from '../../src/data/territoryData'

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
  // A TIMEOUT ON THE CLICK ITSELF, not only on the wait above. No
  // actionTimeout is configured, so Playwright's default is to wait FOREVER —
  // and a control that vanishes between the enabled check and the click does
  // exactly that. Online, where the other browser can move this screen on at
  // any moment, that window is real: an un-ready toggle pressed as the host
  // started the game hung the whole run, and what the report showed was a
  // seven-minute test timeout with no action named. Ten seconds and the
  // button's own text is a failure somebody can read.
  await button.click({ timeout: 10_000 })
  await page.waitForTimeout(BEAT)
}

/**
 * A campaign, created the way the front door creates one.
 *
 * Through Sparks Gaming rather than straight to a screen: the game picker is
 * the first thing anybody meets and nothing else asserts it is there.
 */
export async function newCampaign(page: Page, opts: {
  you?: string; others?: string[]; world?: string
} = {}): Promise<string> {
  const you = opts.you ?? 'Harness'
  const others = opts.others ?? ['Bot One']
  // A NAME OF ITS OWN. Every run leaves its campaign behind — deliberately,
  // the same way the Dune specs leave their matches — and they were all called
  // "New World", so a run that needed to find its way back into its own
  // campaign could not tell it from the ninety before it.
  const world = opts.world ?? `Harness ${Date.now().toString(36)}`

  await page.goto('/')
  await press(page, 'RISK LEGACY')
  await press(page, 'Create Campaign')

  // THE WORLD NAME FIELD carries its default as a VALUE, not a placeholder,
  // so it is found by position among the form's inputs rather than by text.
  await page.locator('input').first().fill(world)
  await page.getByPlaceholder('What the board will call you').fill(you)
  await press(page, 'Create Campaign')

  // A game needs two players and a campaign starts with one. Every name added
  // is permanent, which is why the specs use throwaway ones.
  for (const name of others) {
    await page.getByPlaceholder('Add someone to the campaign').fill(name)
    await press(page, /^Add$/)
  }
  return world
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
export async function playSetup(
  page: Page, cap = 40, only?: string,
): Promise<Record<string, string>> {
  /** Who took which ground, for the seats this walk clicked for. */
  const claimed: Record<string, string> = {}
  for (let i = 0; i < cap; i++) {
    if (await onBoard(page)) return claimed

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
      const who = await askedOf(page)
      const took = await clickAnyTerritory(page)
      if (who) claimed[who.toLowerCase()] = took
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
// Exported for the online walk, whose HQ stage is the same map with a
// different prompt: each player picks on their OWN screen rather than one
// keyboard answering for everybody.
export async function clickAnyTerritory(page: Page): Promise<string> {
  // BY INDEX AMONG THE POLYGONS, so the click lands on the SHAPE.
  //
  // getByTitle finds the <title> element, which is metadata: it has no box, it
  // is never painted, and clicking it hovered the territory without selecting
  // it. The walk then went round forty times pointing at Peru and wondering why
  // no confirm bar appeared. The shape is the polygon; the title only says
  // which polygon it is.
  const found = await page.$$eval('polygon', els => {
    for (let i = 0; i < els.length; i++) {
      const name = els[i].querySelector('title')?.textContent?.trim() ?? ''
      if (name && !name.includes('—')) return { at: i, name }
    }
    return null
  })
  if (!found) {
    throw new Error(`the HQ map offered no unblocked territory.\n${await where(page)}`)
  }
  await page.locator('polygon').nth(found.at).click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(BEAT)
  // WHICH GROUND, reported back. On turn one a player owns their HQ territory
  // and nothing else, so this is the only square a spec can legally click when
  // it comes to place that player's draft.
  return found.name
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
// Exported for the online specs, whose failures are about two pages at once
// and want the same "here is what the screen actually said" tail.
export async function where(page: Page): Promise<string> {
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
} = {}): Promise<Record<string, string>> {
  await newCampaign(page, { you: opts.you, others: opts.others })
  await startGame(page, { players: opts.players, ai: opts.ai })
  return playSetup(page, 40, opts.only)
}

// ── The board ─────────────────────────────────────────────────────────────
//
// EVERYTHING ABOVE THIS LINE GETS TO A BOARD. These play on one, which needs a
// different trick: setup's map is an SVG with an element per territory, and the
// board's is Pixi on a canvas with nothing addressable on it at all — no data
// attributes, no accessible names, and the SVG marker layer over it is
// pointer-events:none. A click at a territory is a click at a POINT.

/**
 * Where a territory sits on screen, in client pixels.
 *
 * THE CANVAS IS object-fit: contain, so the map is scaled to whichever axis
 * runs out first and centred in the leftover. That is four lines of arithmetic
 * and it is done HERE, once, rather than guessed per call — and the caller that
 * uses it checks the click registered, so a wrong mapping fails loudly instead
 * of clicking the ocean forever.
 */
export async function territoryPoint(
  page: Page, territoryId: string,
): Promise<{ x: number; y: number }> {
  const def = TERRITORY_DEFINITIONS.find(t => t.id === territoryId)
  if (!def) throw new Error(`no territory called ${territoryId}`)
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('the board has no map to click on')
  const scale = Math.min(box.width / MAP_WIDTH, box.height / MAP_HEIGHT)
  return {
    x: box.x + (box.width - MAP_WIDTH * scale) / 2 + def.labelX * scale,
    y: box.y + (box.height - MAP_HEIGHT * scale) / 2 + def.labelY * scale,
  }
}

/** Click a territory on the board's map. */
export async function clickTerritory(page: Page, territoryId: string): Promise<void> {
  const { x, y } = await territoryPoint(page, territoryId)
  await page.mouse.click(x, y)
  await page.waitForTimeout(250)
}

/** A territory's id, from the name the setup screens show. */
export function territoryIdNamed(name: string): string {
  const def = TERRITORY_DEFINITIONS.find(t => t.name === name)
  if (!def) throw new Error(`no territory named ${name}`)
  return def.id
}

/**
 * Whose turn the board says it is.
 *
 * TurnControls names the current player above "Turn N" whoever it is, human or
 * computer, so one read covers both. The banner that says a computer is taking
 * their turn is a second witness and only appears for a seat this machine is
 * not playing.
 */
export async function whoseTurn(page: Page): Promise<string | null> {
  const said = await page.locator('body').innerText()
  return said.match(/^(.+?)\s*\n\s*Turn \d+\s*$/m)?.[1].trim()
    ?? said.match(/^(.+?) is taking their turn/m)?.[1].trim()
    ?? null
}

/** How many reinforcements are still in hand, per the draft pill. */
export async function toPlace(page: Page): Promise<number> {
  const m = (await page.locator('body').innerText()).match(/^(\d+) to place$/m)
  return m ? Number(m[1]) : 0
}

/**
 * A territory this player can still draft onto.
 *
 * ASKED OF THE BOARD, not remembered. Over several turns the human loses ground
 * — in a two-seat game against a computer that conquers, they can lose the
 * territory they started on — and a helper that kept clicking their opening HQ
 * would place nothing and blame the coordinate maths.
 *
 * The test for "this one works" is the draft counter going down, which is the
 * board's own answer, so nothing here needs to know who owns what. The hint is
 * tried first because it is nearly always still right; the sweep behind it is
 * the whole map in order and costs a few seconds on the turn after a loss.
 */
export async function draftableTerritory(
  page: Page, hint?: string,
): Promise<{ id: string; owed: number }> {
  const owed = await toPlace(page)
  if (owed === 0) return { id: hint ?? '', owed }
  const tries = [...(hint ? [hint] : []), ...TERRITORY_DEFINITIONS.map(t => t.id)]
  for (const id of tries) {
    await clickTerritory(page, id)
    const now = await toPlace(page)
    if (now < owed) return { id, owed: now }
  }
  throw new Error('no territory on the map accepted a reinforcement.'
    + ' Either this seat owns nothing, or the map point maths is wrong.'
    + `\n${await where(page)}`)
}

/**
 * Play a human turn with no ambition: place the draft, attack nobody, move
 * nothing, hand over.
 *
 * IT EXISTS TO GET TO THE NEXT SEAT. What these specs are about is the turns
 * AFTER this one — nothing here asserts a rule, and choosing targets would make
 * a spec depend on a board the dice laid out.
 *
 * @param hint a territory this player owned last time. Optional, and only a
 *   hint: the board is asked either way.
 * @returns the territory that took the troops, to hand back as the next hint.
 */
export async function passTurn(page: Page, hint?: string): Promise<string> {
  const first = await draftableTerritory(page, hint)
  let owed = first.owed
  for (let i = 0; i < 40 && owed > 0; i++) {
    await clickTerritory(page, first.id)
    const now = await toPlace(page)
    // The territory that worked a moment ago can stop working — a scar, a
    // stack limit — so fall back to asking the board again rather than
    // looping on a square that has gone quiet.
    if (now === owed) { owed = (await draftableTerritory(page, undefined)).owed }
    else owed = now
  }

  // ONE BUTTON, FOUR LABELS. The phase-advance control is a single button whose
  // text is written by the phase it is in: "Begin Attack →" while troops are
  // owed, "✓ Confirm" once they are all down, then "End Attack →", then
  // "End Turn →" (and "🃏 Pick a Card First", disabled, when a card is owed).
  // A first version pressed the three labels in order and never found the first
  // one, because placing the draft had already relabelled it.
  //
  // So: press whatever it currently says, until the seat changes hands. That
  // also survives an interstitial nobody here has met yet.
  const me = await whoseTurn(page)
  for (let i = 0; i < 8; i++) {
    if ((await whoseTurn(page)) !== me) return first.id
    await press(page, /✓ Confirm|Begin Attack|End Attack|End Turn/)
  }
  throw new Error(`${me} could not hand the turn on in eight presses.`
    + `\n${await where(page)}`)
}

/**
 * What each player holds, read off the roster strip.
 *
 * The strip prints one line per seat: the name, the cards in hand, then
 * `🗺 territories` and `⚔ troops`. It is the only place on the board where
 * those numbers are DOM text — everything on the map itself is painted into
 * the canvas — which makes it the only way a spec can ask whether a turn
 * actually did anything.
 *
 * Keyed by lowercased name, because the board shows names as the roster spells
 * them and a spec should not have to match the capitalisation.
 */
export async function holdings(
  page: Page,
): Promise<Record<string, { territories: number; troops: number }>> {
  const said = await page.locator('body').innerText()
  // FROM THE ROSTER ONWARD. Player names appear all over a board — in the turn
  // banner, on scar cards, in the winners list — and only here are they
  // followed by the two counts.
  const tail = said.slice(said.lastIndexOf('CAMPAIGN WINNERS'))
  const out: Record<string, { territories: number; troops: number }> = {}
  for (const m of tail.matchAll(/([^\n🃏]+)🃏[^🗺]*🗺\s*(\d+)\s*⚔\s*(\d+)/g)) {
    out[m[1].trim().toLowerCase()] = {
      territories: Number(m[2]), troops: Number(m[3]),
    }
  }
  return out
}

/** Turn the AI's pacing down to its fast setting, if the button is showing. */
export async function fastForward(page: Page): Promise<void> {
  const ff = page.locator('button', { hasText: /⏩ Fast Forward/ })
  if (await ff.count()) await ff.first().click().catch(() => {})
}

/** Has the game finished — a winner, or the board frozen behind an end screen? */
export async function gameOver(page: Page): Promise<boolean> {
  const said = await page.locator('body').innerText()
  return /WINS|VICTORY|Campaign Victory|GAME OVER/i.test(said)
}

/**
 * Play the game forward for a number of turn hand-overs.
 *
 * WHY SEVERAL AND NOT ONE. A single turn reaches none of the interrupts — no
 * event card, no capture that opens a modal, no elimination — and those are
 * exactly where the AI driver is least proven: it auto-answers its own choice
 * modals, pauses for human-owned ones, and a state with no branch is a wedge.
 * Arguing about which of them are handled gets nowhere. Playing several turns
 * walks into them.
 *
 * IT ANSWERS FOR THE HUMAN AND NOBODY ELSE. Every computer seat has to run its
 * own turn, or the loop notices the seat has not changed and fails.
 *
 * @returns a log of who held each turn, so a caller can say how far it got.
 */
export async function playRounds(page: Page, opts: {
  you: string
  /** How many hand-overs to sit through. */
  turns?: number
  /** Seconds to allow one seat before calling it stalled. */
  patience?: number
}): Promise<string[]> {
  const turns = opts.turns ?? 6
  const patience = (opts.patience ?? 120) * 1000
  const seen: string[] = []
  let hint: string | undefined

  for (let i = 0; i < turns; i++) {
    if (await gameOver(page)) return seen
    const who = await whoseTurn(page)
    if (!who) throw new Error(`nobody holds the turn.\n${await where(page)}`)
    seen.push(who)

    if (who.toLowerCase() === opts.you.toLowerCase()) {
      hint = await passTurn(page, hint)
      continue
    }

    // A COMPUTER SEAT. Fast-forward its pacing — which is also a probe: turn
    // boundaries crossed by shrunken timers is the exact race that once let a
    // stale AI step end a human's reinforce phase under him.
    await fastForward(page)
    const until = Date.now() + patience
    for (;;) {
      if (await gameOver(page)) return seen
      if (await page.locator('button', { hasText: /^Nudge$/ }).count()) {
        throw new Error(`${who} stalled — the board gave up and offered a Nudge`
          + ` on turn ${i + 1}.\n${await where(page)}`)
      }
      if ((await whoseTurn(page)) !== who) break
      if (Date.now() > until) {
        throw new Error(`${who} held the turn for ${patience / 1000}s`
          + ` without finishing it.\n${await where(page)}`)
      }
      await page.waitForTimeout(500)
    }
  }
  return seen
}

// ── The campaign's history ────────────────────────────────────────────────
//
// WHY THIS EXISTS. Four runs of the multi-turn spec — seventy-two hand-overs
// across three seatings — reached captures, card draws and failed attacks, and
// not one event, mission, elimination or milestone. Not because the AI driver
// handles them, but because a GAME-ONE CAMPAIGN CANNOT REACH THEM: GameBoard
// strips the base event cards outright and empties the mission deck unless
// `doubleWinnerMilestoneTriggered`. The rare half of the interrupt matrix is
// gated behind campaign progress, so no amount of replaying the first game
// walks into it.
//
// So the campaign is aged. The row is patched with the service role, which is
// the one thing in this file that reaches past the UI — and it is the honest
// tool for it: a campaign with four games behind it is a thing the app writes
// over hours of play and has no screen for creating.

/** The milestones a campaign can have behind it, as the legacy blob spells them. */
export interface Aged {
  /** Puts the mission deck back in play. */
  missions?: boolean
  /** Aliens, their weakness powers, and Die Humans / Beam Down. */
  aliens?: boolean
  /** Missiles, the nuclear milestone and the Fallout Zone. */
  nuclear?: boolean
  /** The draft-order setup path instead of the plain one. */
  draft?: boolean
}

/**
 * Age the campaign this browser is sitting on, then reload into it.
 *
 * THROUGH THE ROW, NOT THE UI, and only the flags — the board, the roster and
 * the scars are left exactly as the app created them, so what changes is which
 * decks and which interrupts are in play and nothing else.
 */
export async function ageCampaign(
  page: Page, want: Aged, world: string,
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js')
  const { readStack } = await import('./stack')
  const stack = readStack()
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })

  // WHICH CAMPAIGN THIS BROWSER IS IN, asked of the browser rather than
  // guessed from "the newest row" — the specs run one after another against
  // one database and the newest row is not reliably this test's.
  const id = await page.evaluate(() => {
    try { return localStorage.getItem('riskLegacy:activeCampaignId') } catch { return null }
  })
  if (!id) throw new Error('this browser is not in a campaign to age')

  const { data, error } = await admin
    .from('campaigns').select('legacy_state').eq('id', id).single()
  if (error) throw new Error(`could not read the campaign: ${error.message}`)
  const legacy = (data?.legacy_state ?? {}) as Record<string, unknown>

  const patched = {
    ...legacy,
    ...(want.missions ? { doubleWinnerMilestoneTriggered: true } : null),
    ...(want.aliens ? { alienMilestoneTriggered: true } : null),
    ...(want.nuclear ? { nuclearMilestoneTriggered: true } : null),
    ...(want.draft ? { draftOrderUnlocked: true } : null),
  }
  const up = await admin.from('campaigns').update({ legacy_state: patched }).eq('id', id)
  if (up.error) throw new Error(`could not age the campaign: ${up.error.message}`)

  // RELOADED, because the screen is holding the copy it read on the way in —
  // and a reload lands on the front door, so the way back is the way in.
  await page.reload()
  await page.waitForTimeout(BEAT)
  await press(page, 'RISK LEGACY')
  await reopen(page, world)
  return id
}

/**
 * Open a named campaign from the picker.
 *
 * BY NAME, because the picker holds every campaign every run has ever left
 * behind and they are otherwise identical. The row carries its world name and
 * an Open or a Resume depending on whether a game is in progress, so the press
 * is whichever of the two this row has.
 */
export async function reopen(page: Page, world: string): Promise<void> {
  // THE LIST ARRIVES AFTER THE SCREEN DOES. Campaigns are fetched, so pressing
  // through to the picker and looking immediately finds an empty list and
  // reports the campaign missing — which is what it looked like for three
  // runs. Wait for the name itself.
  await expect(page.locator(`text=${world}`).first(),
    `the picker never listed ${world}`).toBeVisible({ timeout: 15_000 })

  // THE BUTTON WHOSE ROW CARRIES THE NAME. A div filtered by text matches
  // every ancestor that contains it, and the innermost of those is the label
  // itself with no button inside — so the walk goes the other way, from each
  // Open/Resume up a few levels looking for the name.
  const at = await page.$$eval('button', (els, w) => {
    for (let i = 0; i < els.length; i++) {
      const t = (els[i].textContent ?? '').trim()
      if (t !== 'Open' && t !== 'Resume') continue
      let n: HTMLElement | null = els[i].parentElement
      for (let up = 0; up < 5 && n; up++, n = n.parentElement) {
        if ((n.textContent ?? '').includes(w)) return i
      }
    }
    return -1
  }, world)
  if (at < 0) throw new Error(`no campaign called ${world} in the picker`)
  await page.locator('button').nth(at).click()
  await page.waitForTimeout(BEAT)
}
