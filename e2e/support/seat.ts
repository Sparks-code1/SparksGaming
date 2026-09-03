/**
 * A signed-in seat in a browser, and the three assertions this run exists for.
 *
 * SIGNING IN OUT OF BAND. The session is minted with supabase-js in node and
 * written into localStorage under the key the app's own client reads, so a run
 * spends no time driving a login form it is not testing. It is a real session:
 * the same access token, the same RLS, the same refusal if it is wrong.
 */
import { expect, type Page, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Stack } from './stack'

/**
 * The key supabase-js persists a session under.
 *
 * Derived the way the library derives it — from the project host's first
 * label — so this cannot drift from what the app reads without the app also
 * changing. For a local stack that host is 127.0.0.1 and the label is '127'.
 */
export const storageKey = (api: string) =>
  `sb-${new URL(api).hostname.split('.')[0]}-auth-token`

/** Sign a seat in and give the browser its session before the app boots. */
export async function signInSeat(
  context: BrowserContext, stack: Stack, faction: string,
): Promise<void> {
  const { email, password } = stack.seats[faction]
  const client = createClient(stack.api, stack.anon, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`sign-in ${faction}: ${error?.message ?? 'no session'}`)

  // BEFORE THE APP BOOTS, so its client finds a session on its first read
  // rather than rendering a signed-out screen and correcting itself.
  await context.addInitScript(
    ([key, session]) => {
      try { window.localStorage.setItem(key as string, session as string) } catch { /* ignore */ }
    },
    [storageKey(stack.api), JSON.stringify(data.session)] as const,
  )
}

/** The match screen for one seat, loaded and past its first paint. */
export async function openMatch(page: Page, matchId: string): Promise<void> {
  await page.goto(`/?dune-match=${matchId}`)
  await expect(page.locator('[data-layer="dune-game"], [data-layer="dune-notices"]').first())
    .toBeVisible({ timeout: 30_000 })
}

// ── the three failures the unit suites cannot see ──────────────────────────

/**
 * ONE: A CONTROL THAT RENDERS NOTHING.
 *
 * The commonest shape is a prop that stopped being passed — the screen still
 * compiles, every rule still computes, and the button is simply not there.
 * A source pin on the component cannot see it, because the component is fine;
 * what changed is the call site.
 *
 * Asserted as VISIBLE rather than present: a control in the DOM with no size,
 * or under `display: none`, is not a control anybody can use.
 */
export async function expectControlPresent(page: Page, selector: string, what: string) {
  const control = page.locator(selector).first()
  await expect(control, `${what} never reached the screen — the control is missing, not refusing`)
    .toBeVisible({ timeout: 15_000 })
}

/**
 * TWO: A BUTTON THAT IS THERE AND CANNOT BE PRESSED.
 *
 * Disabled forever is the same as absent, except that it looks like the app is
 * working. This asserts the control is enabled AND that pressing it actually
 * changes something the caller names — a button that swallows its click is the
 * same failure one layer down.
 */
export async function expectRespondsToClick(
  page: Page, selector: string, what: string, changed: () => Promise<unknown>,
) {
  const control = page.locator(selector).first()
  await expect(control, `${what} is on screen but disabled`).toBeEnabled({ timeout: 15_000 })
  await expectNothingOnTop(page, selector, what)
  await control.click({ timeout: 15_000 })
  await changed()
}

/**
 * THREE: SOMETHING SITTING ON TOP OF IT.
 *
 * This one has already happened: a fixed-position notice box was laid over the
 * corner where a small table keeps its Ready button, so nobody could press it,
 * so no setup answer ever reached the server, so the window never closed and
 * the match wedged. Every test was green — the button was rendered, enabled,
 * and correct.
 *
 * Playwright's own click would eventually catch it (it refuses to click through
 * an overlay), but only as a timeout naming no culprit. This asks the DOM
 * directly what is at the control's centre and NAMES what it found, because the
 * useful half of that failure is which layer is doing the covering.
 */
export async function expectNothingOnTop(page: Page, selector: string, what: string) {
  const control = page.locator(selector).first()
  await expect(control).toBeVisible({ timeout: 15_000 })
  // SCROLLED FIRST, because a click scrolls. Playwright brings a control into
  // view before pressing it, so measuring where the control sits BEFORE that
  // asks a question no click ever asks — and answers it with a layout
  // complaint about a button that would have been pressed perfectly well. What
  // survives this is the real thing: still off screen after the page has done
  // everything it can to show it.
  await control.scrollIntoViewIfNeeded({ timeout: 15_000 }).catch(() => {})
  const verdict = await control.evaluate((el: Element) => {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const view = { w: window.innerWidth, h: window.innerHeight }
    // OFF-SCREEN IS NOT COVERED, and saying so mattered: elementFromPoint
    // returns null for a point outside the viewport, and folding that into
    // the covered branch produced "covered by nothing — the point is outside
    // the viewport — it is on screen and cannot be clicked", which is three
    // contradictions in one sentence and sent the reader looking for an
    // overlay that was never there. They are different faults with different
    // fixes: one is a z-index, the other is a layout that does not fit.
    const off = x < 0 || y < 0 || x > view.w || y > view.h
    if (off) {
      const past = y > view.h ? `${Math.round(y - view.h)}px below the fold`
        : y < 0 ? `${Math.round(-y)}px above the top`
        : x > view.w ? `${Math.round(x - view.w)}px past the right edge`
        : `${Math.round(-x)}px past the left edge`
      return {
        verdict: 'offscreen' as const,
        by: `${past} (viewport ${view.w}x${view.h}, its centre at ` +
          `${Math.round(x)},${Math.round(y)})`,
      }
    }
    const top = document.elementFromPoint(x, y)
    // Null with the point INSIDE the viewport is a different thing again —
    // nothing hit-tests there at all, which usually means a zero-size or
    // pointer-events:none ancestor rather than either fault above.
    if (!top) return { verdict: 'no-hit' as const, by: 'nothing hit-tests at its centre' }
    if (el.contains(top) || top.contains(el)) return { verdict: 'clear' as const, by: '' }
    const name = (n: Element) => {
      const layer = n.getAttribute('data-layer')
      if (layer) return `[data-layer="${layer}"]`
      const id = n.id ? `#${n.id}` : ''
      const cls = typeof n.className === 'string' && n.className
        ? `.${n.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
      return `${n.tagName.toLowerCase()}${id}${cls}`
    }
    // the covering element AND its nearest named ancestor, which is usually
    // the layer actually responsible
    const chain: string[] = []
    for (let n: Element | null = top; n && chain.length < 4; n = n.parentElement) {
      chain.push(name(n))
      if (n.getAttribute('data-layer')) break
    }
    return { verdict: 'covered' as const, by: chain.join(' inside ') }
  })
  // EACH FAULT IN ITS OWN WORDS. The reader of a failing browser run is
  // deciding what to go and look at, and "scroll to reach it" and "something
  // is on top of it" send them to different files.
  const said: Record<string, string> = {
    offscreen: `${what} is off screen — ${verdict.by}. `
      + 'A player at this window size would have to scroll to reach it.',
    covered: `${what} is on screen but covered at its own centre by ${verdict.by}`,
    'no-hit': `${what} is within the viewport but ${verdict.by} — check for a `
      + 'zero-size box or a pointer-events:none ancestor',
  }
  expect(said[verdict.verdict] ?? '', said[verdict.verdict] ?? '').toBe('')
}
