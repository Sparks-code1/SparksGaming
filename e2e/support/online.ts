/**
 * Two seats, two browsers, one match.
 *
 * WHY THIS EXISTS AND NOTHING ELSE COVERS IT. Every online bug in this project
 * has been found by a person playing: the phantom board, the stale-turn skip,
 * the reinforcement pool arriving empty, the ghost territories, the joiner
 * stuck on NOT CONNECTED, and — this week — a crash that took both browsers
 * down at HQ placement. None of them are visible to a unit suite, and none of
 * them are visible to a ONE-page browser suite either: they are all failures of
 * the hand-off, where a thing that happened on one machine has to become true
 * on another.
 *
 * So the assertion here is never "the button worked". It is "the button worked
 * THERE, and the other browser now agrees".
 *
 * TWO CONTEXTS, NOT TWO PAGES. A context is the isolation boundary that carries
 * its own storage, so two contexts is two signed-in accounts. Two pages in one
 * context would share a session and be the same player twice.
 *
 * REAL ACCOUNTS, SIGNED IN OUT OF BAND, the same way the Dune specs do it: the
 * session is minted with supabase-js and written into localStorage under the
 * key the app's own client reads, so a run spends no time driving a login form
 * it is not testing.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readStack, type Stack } from './stack'
import { storageKey } from './seat'
import { press, whoseTurn, where } from './risk'

/** Long enough for a save to land, short enough that a hang still fails fast. */
const BEAT = 400

/** One player at the table: their browser, their account, their name. */
export interface Seat {
  context: BrowserContext
  page: Page
  name: string
  email: string
  userId: string
}

/**
 * Two accounts the online specs own.
 *
 * SEPARATE FROM THE DUNE SIX. Those are seated in Dune matches by faction and
 * their rows are reused across that suite; borrowing them here would tangle two
 * suites' fixtures together for the sake of not typing two strings.
 */
const ONLINE_ACCOUNTS = [
  { email: 'risk-host@local.test', name: 'Host' },
  { email: 'risk-guest@local.test', name: 'Guest' },
] as const
const PASSWORD = 'risk-online-harness'

/** Mint the two accounts, idempotently. Local passwords, thrown away with the db. */
export async function ensureOnlineAccounts(stack: Stack): Promise<void> {
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  for (const { email } of ONLINE_ACCOUNTS) {
    const { error } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    })
    if (error && !/already/i.test(error.message)) {
      throw new Error(`createUser ${email}: ${error.message}`)
    }
  }
}

/**
 * A browser signed in as one of the two, with its page open on the front door.
 *
 * The session goes in through addInitScript so it is present BEFORE the app
 * boots — otherwise the first render is a signed-out screen correcting itself,
 * and a spec that raced that correction would be testing the correction.
 */
export async function openSeat(
  browser: Browser, which: 0 | 1,
  opts: {
    /**
     * Hold every realtime frame from the server for this many milliseconds
     * before the page sees it. Zero or absent is the real network.
     *
     * WHY A SPEC WOULD WANT A SLOWER NETWORK. matchSync drops any echo at or
     * below the version this client has already applied, and the client
     * records a version the moment its own POST returns. So whether the echo
     * of your OWN action ever reaches your handlers is a race between the HTTP
     * response and the websocket push — and on localhost the push wins every
     * time, which is the one ordering in which the stale-board bug cannot
     * happen. On a real network the response routinely wins. Delaying the
     * frames makes the response win here too, so the spec exercises the
     * ordering a real player gets rather than the one a loopback gives.
     */
    slowRealtime?: number
  } = {},
): Promise<Seat> {
  const stack = readStack()
  const { email, name } = ONLINE_ACCOUNTS[which]

  const client = createClient(stack.api, stack.anon, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) {
    throw new Error(`sign-in ${email}: ${error?.message ?? 'no session'}`)
  }

  const context = await browser.newContext()
  await context.addInitScript(
    ([key, session]) => {
      try { window.localStorage.setItem(key as string, session as string) } catch { /* ignore */ }
    },
    [storageKey(stack.api), JSON.stringify(data.session)] as const,
  )
  const page = await context.newPage()
  if (opts.slowRealtime) {
    const delay = opts.slowRealtime
    // BEFORE goto, or the socket is already open and unrouted. Client→server
    // frames pass straight through; only what the server pushes is held.
    await page.routeWebSocket(/realtime\/v1/, ws => {
      const server = ws.connectToServer()
      ws.onMessage(m => server.send(m))
      server.onMessage(m => { setTimeout(() => ws.send(m), delay) })
    })
  }
  await page.goto('/')
  return { context, page, name, email, userId: data.user.id }
}

/**
 * The host opens a campaign and hosts a game in it.
 *
 * THROUGH THE REAL SCREENS, including the join code — which is the thing the
 * other seat will be given, and the credential that lets them reach a campaign
 * they are not yet on. Returns the code and the world name.
 */
export async function hostCampaign(host: Seat): Promise<{ code: string; world: string }> {
  const world = `Online ${Date.now().toString(36)}`

  await press(host.page, 'RISK LEGACY')
  await press(host.page, 'Create Campaign')
  // PLAIN `input`, matching newCampaign — the world-name field has no explicit
  // type attribute, so an [type="text"] selector waits forever for it.
  await host.page.locator('input').first().fill(world)
  await host.page.getByPlaceholder('What the board will call you').fill(host.name)
  await press(host.page, 'Create Campaign')

  // THE CODE, off the campaign screen where a host would read it to somebody.
  const said = await host.page.locator('body').innerText()
  const m = said.match(/^([0-9A-HJKMNP-TV-Z]{3})-([0-9A-HJKMNP-TV-Z]{3})$/m)
    ?? said.match(/\b([0-9A-HJKMNP-TV-Z]{3})-([0-9A-HJKMNP-TV-Z]{3})\b/)
  if (!m) throw new Error(`no join code on the campaign screen.\n${said.slice(0, 300)}`)
  const code = `${m[1]}${m[2]}`

  await press(host.page, /Host Game #\d+ Online/)
  return { code, world }
}

/**
 * The other seat reaches that campaign with the code, then enters the lobby.
 *
 * TWO CROSSINGS IN ONE WALK, and both were broken this week. Reaching the
 * campaign is join_campaign_by_code — the joiner is not on the roster, so they
 * can neither read the row nor write it, and the code is the credential.
 * Entering the lobby is takeSeat, which is a different table and a different
 * rule.
 */
export async function joinByCode(guest: Seat, code: string): Promise<void> {
  await press(guest.page, 'RISK LEGACY')
  await press(guest.page, 'Join with a Code')
  await guest.page.locator('input').first().fill(code)
  await press(guest.page, /Find|Look|Continue|→/)

  // The joiner is not on this roster, so the panel offers them a new name.
  const nameField = guest.page.getByPlaceholder(/name/i).first()
  if (await nameField.count()) await nameField.fill(guest.name)
  await press(guest.page, /Join/)

  // AND THEN THE LOBBY, which is a second press on the campaign screen — the
  // panel says a game is being hosted right now.
  await expect(guest.page.locator('text=/being hosted right now/'),
    'the joiner never saw the open lobby').toBeVisible({ timeout: 15_000 })
  // THREE LABELS FOR ONE BUTTON, chosen by whether this account already holds
  // a roster seat: "Join as X →" for a name typed here, "Join This Game as X
  // →" once the seat is claimed, and "Return to Your Lobby →" for the host.
  // The joiner has just claimed, so it is the middle one — matched loosely
  // enough to survive all three rather than pinned to the one seen once.
  await press(guest.page, /Join (This Game )?as .+ →/)
}

/**
 * Wait until BOTH pages agree on whose turn it is.
 *
 * THE ASSERTION THIS FILE EXISTS FOR. A move is not made until the other
 * machine knows about it, and every online bug here has been a machine that
 * never found out — or found out and then had it taken away again by an echo.
 * Asking one page is the mistake that made all of them invisible.
 *
 * @returns the name both pages settled on.
 */
export async function bothAgreeItIs(
  seats: Seat[], who: string, timeoutMs = 45_000,
): Promise<void> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const seen = await Promise.all(seats.map(s => whoseTurn(s.page)))
    if (seen.every(n => (n ?? '').toLowerCase() === who.toLowerCase())) return
    if (Date.now() > until) {
      const detail = seats.map((s, i) => `  seat ${i}: ${seen[i] ?? 'nobody'}`).join('\n')
      throw new Error(
        `the two browsers never agreed the turn was ${who}'s.\n${detail}\n`
        + `The hand-off is the thing this run exists to catch: one machine\n`
        + `moved and the other did not find out.\n${await where(seats[0].page)}`)
    }
    await seats[0].page.waitForTimeout(500)
  }
}

/** Close both browsers' contexts, whatever happened. */
export async function closeSeats(seats: Seat[]): Promise<void> {
  for (const s of seats) await s.context.close().catch(() => {})
}

export { BEAT }

/**
 * Chrome: buttons that are on every screen and never the way forward.
 *
 * A BLIND "press whatever is enabled" WALK IS A LIABILITY, and this list is
 * what it cost to learn. Signed in, the account button is labelled with the
 * player's own NAME — `👤 Host`, not `👤 My Account` — so an exclusion list
 * written against the signed-out screen let the host open their account panel
 * and sit in it for sixty steps while the spec reported "never reached a
 * board".
 *
 * `✓ Ready` is the same button as `I'm Ready` wearing its other label, and
 * pressing it UNDOES the ready that startFromLobby just cast. A walk that
 * reached the lobby before the host's start had propagated took it as
 * progress, un-readied the seat, and then hung on it as the screen moved on
 * underneath. Nothing whose only effect is to undo a step this file has
 * already taken belongs in a forward walk.
 */
const CHROME = /^(👤|🔉|📜|←|Save$|Sign out$|Sign in$|Account|✓ Ready)/

/**
 * The lobby, driven explicitly: the joiner readies, the host starts.
 *
 * NOT LEFT TO THE GENERIC WALK. Both presses are named controls with a
 * precondition — the host's Start is disabled until the table is ready, and it
 * reads "Waiting…" until then — so pressing "whatever looks like progress"
 * either fires early or fires the wrong thing.
 */
export async function startFromLobby(host: Seat, guest: Seat): Promise<void> {
  await press(guest.page, /I'm Ready/)

  // THE READY HAS TO REACH THE HOST before their Start means anything: it is
  // the host's own copy of the lobby that decides whether the button is live.
  await expect(host.page.locator('button', { hasText: /Start Game #\d+ →/ }),
    'the host never saw the table go ready').toBeEnabled({ timeout: 30_000 })
  await press(host.page, /Start Game #\d+ →/)
}

/** Is this a control worth pressing to move a screen along? */
export function isForward(label: string): boolean {
  if (CHROME.test(label)) return false
  return true
}

/**
 * Place this seat's HQ, verifying the click actually selected something.
 *
 * A CLICK THAT ONLY HOVERS LOOKS EXACTLY LIKE ONE THAT MISSED. The map paints a
 * highlight on hover and another on selection, and the difference is not in the
 * polygon — it is the confirm bar appearing underneath. So the test for "that
 * worked" is the bar, and a click that does not produce one is retried on the
 * next territory rather than waited on.
 *
 * The solo walk gets away with a single click because it retries through its
 * outer loop; online, the two browsers move at different speeds and a seat that
 * silently failed to select sat on a live prompt until the budget ran out.
 */
export async function placeHQ(page: Page): Promise<void> {
  // ── THE STAGE CAN END UNDERNEATH THIS ──────────────────────────────────
  // settleOnto reads the screen, decides it is this seat's pick, and only then
  // calls here — and between those two the pick can land and the whole setup
  // can complete, because the other browser is moving at its own speed. Then
  // the map is gone, the twelve clicks go to detached nodes, and thirty
  // seconds later this reports that the map took the click as a hover. It did
  // not: there was no map. Re-asked before every click, so leaving the stage
  // is a quiet return and the caller's own loop sees the board on its next
  // pass, while a map that IS still there and still refuses is the failure it
  // always was.
  const stillPlacing = async () =>
    /PLACE YOUR HQ/.test(await page.locator('body').innerText())
  if (!await stillPlacing()) return

  const open = await page.$$eval('polygon', els => {
    const out: number[] = []
    for (let i = 0; i < els.length; i++) {
      const name = els[i].querySelector('title')?.textContent?.trim() ?? ''
      if (name && !name.includes('—')) out.push(i)
    }
    return out
  })
  if (!open.length) {
    if (!await stillPlacing()) return
    throw new Error('the HQ map offered no unblocked territory')
  }

  const confirm = page.locator('button', { hasText: /Confirm HQ/ })
  // WHY THE CLICK WAS REFUSED, not just that it was. Swallowing these made a
  // pointer-events refusal, a detached node and a bbox centre landing outside
  // a concave polygon all look identical: twelve silent misses and a guess.
  const refusals: string[] = []
  for (const at of open.slice(0, 12)) {
    if (!await stillPlacing()) return
    await page.locator('polygon').nth(at).click({ timeout: 2500 })
      .catch((e: Error) => { refusals.push(`#${at}: ${e.message.split('\n')[0]}`) })
    await page.waitForTimeout(250)
    if (await confirm.count()) {
      await confirm.first().click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(BEAT)
      return
    }
  }
  throw new Error(
    `clicked ${Math.min(open.length, 12)} open territories and none selected — `
    + 'the map took the click as a hover.\n'
    + (refusals.length
      ? `the clicks were REFUSED:\n  ${refusals.slice(0, 4).join('\n  ')}\n`
      : 'every click landed and none selected.\n')
    + await where(page))
}
