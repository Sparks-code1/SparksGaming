// CHOAM Charity. The rule is small; what matters is WHERE it is decided.
// Eligibility depends on hidden spice, so it is settled server-side against a
// seat's secrets and never sent anywhere. The claim is public by rule.
import {
  isEligibleForCharity, charityGrant, applyCharity, openCharityWindow,
  charityWindowIsOpen, refuseCharityClaim, applyCharityClaim, refuseCharityOpen,
  CHARITY_TOPS_UP_TO, CHARITY_WINDOW_MS, readSpice,
} from '@/lib/dune/charity'
import type { FactionId } from '@/types/Dune/Faction'
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
const w = openCharityWindow(T0, 1)
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
    // Exponent notation too: the bundle is esbuild output, which writes
    // 15_000 as 15e3. A reader that only understood underscores returned
    // null for it, and the check then failed on the formatting rather than
    // on the value — the drift it exists to catch would have looked the same.
    const m = src.match(new RegExp(name + '\\s*=\\s*([0-9_.e+]+)'))
    return m ? Number(m[1].replace(/_/g, '')) : null
  }
  // THEY ARE NOT DUPLICATED ANY MORE, so there is nothing left to drift. The
  // endpoint carried its own copy of the threshold, the window and the grant,
  // on the argument that they were small and had no logic in them. The grant
  // had exactly enough logic to matter — the Bene Gesserit ignore the threshold
  // entirely — so charity is bundled into _shared like the reducer and the
  // auction, and the server imports what the client runs.
  //
  // The check therefore changes shape rather than being deleted: agreement by
  // construction still has to be verified as construction.
  check('the endpoint imports the charity rules rather than restating them',
    edge.includes("from '../_shared/duneCharity.gen.ts'"), true)
  check('...and defines neither constant of its own',
    constIn(edge, 'const CHARITY_TOPS_UP_TO'), null)
  check('...nor its own grant', /const charityGrant = /.test(edge), false)
  // The bundle is the client's own file, so the numbers cannot disagree.
  const gen = readFileSync('supabase/functions/_shared/duneCharity.gen.ts', 'utf8')
  check('the shared bundle carries the threshold',
    constIn(gen, 'CHARITY_TOPS_UP_TO'), CHARITY_TOPS_UP_TO)
  check('the window length agrees across the boundary',
    constIn(gen, 'CHARITY_WINDOW_MS'), CHARITY_WINDOW_MS)
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


// ── the Bene Gesserit ignore the threshold ────────────────────────────────
// "You always receive CHOAM charity of 2 spice regardless of how many spice you
// already have" — their advanced advantage. It sat in the faction data,
// described and unimplemented, while both the client and the server topped
// everyone up to two alike.
//
// A FLAT TWO, NOT A TOP-UP, and the difference is the whole advantage. Everyone
// else is brought UP TO two, so a seat already holding two gets nothing;
// reading the exception as a top-up would give them exactly what everybody else
// gets and quietly delete it.
{
  const bg = 'bene-gesserit' as FactionId
  const other = 'atreides' as FactionId

  check('a rich seat is not eligible', isEligibleForCharity({ spice: 9 }, other), false)
  // AT the threshold is eligible and gets nothing, which is not the same as
  // being refused — the Harkonnen seat in the harness fixture sits exactly
  // here, and a rule that conflated the two would offer it no button at all.
  check('...a seat at the threshold is eligible', isEligibleForCharity({ spice: 2 }, other), true)
  check('...and its claim is not refused',
    refuseCharityClaim({ expiresAt: 10_000, claims: [], turn: 1 }, { spice: 2 }, 'p1', 0, other), null)
  check('...but a rich Bene Gesserit is', isEligibleForCharity({ spice: 9 }, bg), true)
  check('...and a poor one still is', isEligibleForCharity({ spice: 0 }, bg), true)

  check('the ordinary grant tops up to the threshold',
    charityGrant({ spice: 1 }, other), CHARITY_TOPS_UP_TO - 1)
  check('...and is nothing at the threshold', charityGrant({ spice: 2 }, other), 0)
  check('...and nothing above it', charityGrant({ spice: 9 }, other), 0)

  check('the Bene Gesserit get the full two however rich',
    charityGrant({ spice: 9 }, bg), CHARITY_TOPS_UP_TO)
  check('...including at the threshold, where everyone else gets nothing',
    charityGrant({ spice: 2 }, bg), CHARITY_TOPS_UP_TO)
  check('...and it is added, not topped up to',
    readSpice(applyCharity({ spice: 9 }, bg)), 11)

  // THE GRANT NO LONGER DECIDES ELIGIBILITY, which is what forced the rule to
  // be asked separately. A rich seat and a rich Bene Gesserit used to come out
  // at zero together, and only one of them is being refused.
  check('a claim by a rich Bene Gesserit is not refused',
    refuseCharityClaim({ expiresAt: 10_000, claims: [], turn: 1 }, { spice: 9 }, 'p1', 0, bg), null)
  check('...where the same claim by anyone else is',
    refuseCharityClaim({ expiresAt: 10_000, claims: [], turn: 1 }, { spice: 9 }, 'p1', 0, other),
    'not-eligible')

  // WITHOUT A FACTION the ordinary rule applies. Callers that do not know who
  // is asking should not accidentally get the exception — and the server always
  // knows, so this is the safe default rather than the common path.
  check('an unknown faction gets the ordinary rule',
    isEligibleForCharity({ spice: 9 }), false)
  check('...and the ordinary grant', charityGrant({ spice: 9 }), 0)

  // The other refusals still come first: being always eligible is not being
  // able to claim twice, or after the window has shut.
  check('always-eligible does not mean twice',
    refuseCharityClaim({ expiresAt: 10_000, claims: ['p1'], turn: 1 }, { spice: 9 }, 'p1', 0, bg),
    'already-claimed')
  check('...nor after the window closes',
    refuseCharityClaim({ expiresAt: 10_000, claims: [], turn: 1 }, { spice: 9 }, 'p1', 20_000, bg),
    'window-closed')
}

// ── the server asks the same question ─────────────────────────────────────
// The endpoint used to carry its own charityGrant, on the argument that it was
// small and had no logic in it. It had exactly enough: this exception.
{
  const edge = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('the endpoint asks eligibility directly',
    /isEligibleForCharity\(secrets, myFaction\)/.test(edge), true)
  check('...and grants by faction too',
    /charityGrant\(secrets, myFaction\)/.test(edge), true)
  // FROM THE TOKEN, never the payload. A faction in the request body would let
  // any seat claim to be the one faction that always qualifies.
  check('...with the faction it derived, not one it was sent',
    /charityGrant\(secrets, action\./.test(edge), false)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
