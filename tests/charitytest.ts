// CHOAM Charity. The rule is small; what matters is WHERE it is decided.
// Eligibility depends on hidden spice, so it is settled server-side against a
// seat's secrets and never sent anywhere. The claim is public by rule.
import {
  isEligibleForCharity, charityGrant, applyCharity, openCharityWindow,
  charityWindowIsOpen, refuseCharityClaim, applyCharityClaim, refuseCharityOpen,
  CHARITY_TOPS_UP_TO, CHARITY_WINDOW_MS,
} from '@/lib/dune/charity'
import type { CharityWindow } from '@/lib/dune/charity'
import { readFileSync } from 'node:fs'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const T0 = 1_000_000

// ── eligibility ──────────────────────────────────────────────────────────────
check('broke is eligible', isEligibleForCharity({ spice: 0 }), true)
check('one is eligible', isEligibleForCharity({ spice: 1 }), true)
check('exactly the threshold is eligible', isEligibleForCharity({ spice: 2 }), true)
check('one over is not', isEligibleForCharity({ spice: 3 }), false)
check('rich is not', isEligibleForCharity({ spice: 40 }), false)

// A seat with no secrets row yet holds nothing, which is eligible. That is the
// state a match starts in, so it must not throw or read as ineligible.
check('a seat with no secrets holds nothing', isEligibleForCharity(null), true)
check('...and a row without spice too', isEligibleForCharity({}), true)

// ── the grant tops UP, it does not add ───────────────────────────────────────
check('nothing becomes two', charityGrant({ spice: 0 }), 2)
check('one becomes two', charityGrant({ spice: 1 }), 1)
check('two gains nothing but is still eligible', charityGrant({ spice: 2 }), 0)
check('the ineligible gain nothing', charityGrant({ spice: 9 }), 0)
check('claiming from zero leaves exactly the threshold',
  applyCharity({ spice: 0 }).spice, CHARITY_TOPS_UP_TO)
check('claiming never reduces anyone', applyCharity({ spice: 9 }).spice, 9)

// Other secrets ride along untouched — this is one field of several later.
check('unrelated secrets survive a claim',
  applyCharity({ spice: 1, traitors: ['x'] }), { spice: 2, traitors: ['x'] })

// ── the window ───────────────────────────────────────────────────────────────
const w = openCharityWindow(T0)
check('the window is stamped, not measured', w.expiresAt, T0 + CHARITY_WINDOW_MS)
check('it opens with no claims', w.claims, [])
check('open before the deadline', charityWindowIsOpen(w, T0 + 1), true)
check('shut ON the deadline', charityWindowIsOpen(w, T0 + CHARITY_WINDOW_MS), false)
check('shut after it', charityWindowIsOpen(w, T0 + CHARITY_WINDOW_MS + 1), false)
check('no window is not an open one', charityWindowIsOpen(null, T0), false)

// ── refusals ─────────────────────────────────────────────────────────────────
check('an eligible claim inside the window stands',
  refuseCharityClaim(w, { spice: 0 }, 'p1', T0 + 1), null)
check('no window at all', refuseCharityClaim(null, { spice: 0 }, 'p1', T0), 'no-window')
check('after the deadline',
  refuseCharityClaim(w, { spice: 0 }, 'p1', T0 + CHARITY_WINDOW_MS), 'window-closed')
check('the rich are refused', refuseCharityClaim(w, { spice: 5 }, 'p1', T0 + 1), 'not-eligible')

const claimed: CharityWindow = { ...w, claims: ['p1'] }
check('one claim each', refuseCharityClaim(claimed, { spice: 0 }, 'p1', T0 + 1), 'already-claimed')
check('...but a different seat may still claim',
  refuseCharityClaim(claimed, { spice: 0 }, 'p2', T0 + 1), null)

// The refusal a client cannot be trusted to make. A seat knows its own spice and
// can grey out its own button, but that is a courtesy — only the server sees the
// number, so only the server can refuse a claim from someone holding ten.
check('a client claiming while rich is refused by the server, not the UI',
  refuseCharityClaim(w, { spice: 10 }, 'p1', T0 + 1), 'not-eligible')

// ── applying ─────────────────────────────────────────────────────────────────
const out = applyCharityClaim(w, { spice: 1 }, 'p1')
check('the claim is recorded publicly', out.window.claims, ['p1'])
check('the spice is topped up privately', out.secrets.spice, 2)
check('and the grant is reported', out.granted, 1)
check('the window it came from is untouched', w.claims, [])

const second = applyCharityClaim(out.window, { spice: 0 }, 'p2')
check('claims accumulate in order', second.window.claims, ['p1', 'p2'])

// ── what the public half must NOT contain ────────────────────────────────────
// The whole point: the window is the only thing that goes into shared state, and
// it carries no spice — not an amount, not a total, not even a flag saying who
// was eligible. Only who claimed.
// Three keys now: the turn joined them so a second opening within a turn can be
// refused. It is not a secret — everyone knows what turn it is — and the check
// below still holds the line that matters, which is that no spice appears here.
check('the public window has exactly three keys',
  Object.keys(out.window).sort(), ['claims', 'expiresAt', 'turn'])
check('...and no spice anywhere in it',
  JSON.stringify(out.window).toLowerCase().includes('spice'), false)

// ── the edge function holds a COPY of these rules ────────────────────────────
// Deno cannot import from src/, and Dune has no generated shared bundle yet the
// way Risk's reducer does. So dune-action duplicates these two constants, and a
// duplicate nothing checks is a duplicate that will drift — the server would top
// players up to a different number than the client believes, and the client
// could not notice, because it never sees the spice.
{
  const edge = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const constIn = (src: string, name: string): number | null => {
    const m = src.match(new RegExp(name + '\\s*=\\s*([0-9_]+)'))
    return m ? Number(m[1].replace(/_/g, '')) : null
  }
  // The reader is asserted before it is trusted. A regex that silently matched
  // nothing would report every constant as null and call them equal — which is
  // how a drift check ends up passing forever without reading anything.
  check('the constant reader actually finds something',
    constIn(edge, 'CHARITY_TOPS_UP_TO'), CHARITY_TOPS_UP_TO)
  check('the window length agrees across the boundary',
    constIn(edge, 'CHARITY_WINDOW_MS'), CHARITY_WINDOW_MS)
}

// ── opening the window is guarded ──────────────────────────────────────────
// It was not. Any seat could open it, repeatedly, and each call replaced the
// window with a fresh one — new deadline, empty claims. The spice cost was nil,
// because a repeat claim by someone already at 2 grants 0; what it cost was the
// rule and the public record of who had claimed.
{
  const opened = openCharityWindow(1_000, 4)
  check('a window knows its turn', opened.turn, 4)
  check('the phase must be charity', refuseCharityOpen(null, 'Storm', 4), 'wrong-phase')
  check('...and it opens once there', refuseCharityOpen(null, 'CHOAM Charity', 4), null)
  check('a second opening in the same turn is refused',
    refuseCharityOpen(opened, 'CHOAM Charity', 4), 'already-opened')
  check('...but the next turn gets its own',
    refuseCharityOpen(opened, 'CHOAM Charity', 5), null)
  check('an expired window still blocks a reopen in its own turn',
    refuseCharityOpen({ ...opened, expiresAt: 0 }, 'CHOAM Charity', 4), 'already-opened')
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
