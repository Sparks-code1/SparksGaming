// The control machinery itself, under test.
//
// transportwiringtest already guards the SHAPE — that every absence claim in
// check-seat-privacy.mjs is made through checkGiven rather than check. That
// guard reads the source, so it can see that a control is passed in. It cannot
// see whether anything looks at it, and a sabotage proved the gap: changing
// `if (!control)` to `if (false)` left every textual assertion satisfied while
// the control did nothing at all.
//
// So the behaviour is tested here instead. These are the three cases that
// matter, and the middle one is the whole reason the module exists.
import { createChecker } from '../scripts/lib/controlledCheck.js'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** A checker whose output is captured rather than printed. */
const quiet = () => {
  const lines: string[] = []
  return { c: createChecker(l => lines.push(l)), lines }
}

// ── a passing control lets the claim be judged on its merits ───────────────
{
  const { c, lines } = quiet()
  check('a true absence, with its control satisfied, passes',
    [c.checkGiven(true, 'absent', true), c.failures], [true, 0])
  check('...and says so', lines[0].startsWith('PASS'), true)
}
{
  const { c } = quiet()
  check('a false absence still fails when the control passed',
    [c.checkGiven(true, 'present after all', false), c.failures], [false, 1])
}

// ── THE CASE THE MODULE EXISTS FOR ─────────────────────────────────────────
// A failed control means the mechanism saw nothing. `ok` is true — the secret
// genuinely was not found — and that must NOT be a pass, because it would be
// true of a completely broken channel.
{
  const { c, lines } = quiet()
  const result = c.checkGiven(false, 'absent from an empty result', true)
  check('a failed control cannot produce a pass, even when the secret is absent',
    result, false)
  check('...it counts as a failure', c.failures, 1)
  check('...and it is reported as inconclusive, not as a failure of the app',
    lines[0].startsWith('INCONCLUSIVE'), true)
  check('...with the reason spelt out',
    /proves nothing/.test(lines[0]), true)
}

// ── the counters distinguish "checked" from "checked meaningfully" ─────────
{
  const { c } = quiet()
  c.checkGiven(true, 'a', true)
  c.checkGiven(true, 'b', true)
  c.checkGiven(false, 'c', true)
  check('only claims with a passing control count as controlled',
    [c.controlled, c.inconclusive, c.failures], [2, 1, 1])
}

// ── check returns its verdict, so one claim can be another's control ───────
// The pattern the script uses throughout: read something A should see, then use
// that result to gate the claim that A cannot see B's.
{
  const { c } = quiet()
  const control = c.check('A can see its own', true)
  check('a plain check reports its verdict for use as a control',
    [control, c.checkGiven(control, "A cannot see B's", true), c.failures],
    [true, true, 0])
}
{
  const { c } = quiet()
  const control = c.check('A can see its own', false)
  check('...and a failed one poisons what depends on it',
    [control, c.checkGiven(control, "A cannot see B's", true), c.failures],
    [false, false, 2])
}

// ── a detail explains a failure, and never accompanies a pass ─────────────
// The bug: a control reported PASS and printed "A's own hand was not in it —
// the seed shape has drifted" underneath it. The string was built eagerly and
// handed over whatever the outcome, so the verdict and the sentence disagreed.
// A reader then believes the sentence, or stops trusting both.
{
  const { c, lines } = quiet()
  c.check('passed', true, 'this explanation belongs to a failure')
  check('a passing check prints no detail',
    lines[0].includes('explanation'), false)
  check('...and is just the verdict and the label', lines[0], 'PASS  passed')
}
{
  const { c, lines } = quiet()
  c.check('failed', false, 'because of the thing')
  check('a failing check prints its detail',
    lines[0], 'FAIL  failed\n        because of the thing')
}
// The same rule through the controlled path, since that is where the bug was.
{
  const { c, lines } = quiet()
  c.checkGiven(true, 'absent', true, 'this explanation belongs to a failure')
  check('a passing controlled claim prints no detail either',
    lines[0].includes('explanation'), false)
}
// A detail may be a function, so an expensive explanation costs nothing when
// there is nothing to explain.
{
  let built = 0
  const { c } = quiet()
  c.check('passed', true, () => { built++; return 'expensive' })
  check('a lazy detail is not built for a passing check', built, 0)
  c.check('failed', false, () => { built++; return 'expensive' })
  check('...and is built for a failing one', built, 1)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
