/**
 * Assertions that cannot pass by accident.
 *
 * A privacy check is a pile of claims that something is ABSENT — B's hand is
 * not in this payload, the deck is not in that result. Absence is the weakest
 * kind of evidence there is: searching an empty result finds nothing, and
 * reports it exactly as though the secret were being kept. A broken mechanism
 * and a working one produce the same green.
 *
 * That is not hypothetical. check-seat-privacy.mjs asserted over realtime
 * frames, received none, and passed its three most important checks — including
 * the one the whole script exists for — by searching `[]`.
 *
 * So an absence claim here must name a CONTROL: something the same mechanism
 * should be able to see. If the control fails, the claim is INCONCLUSIVE and
 * counts as a failure, because the one result it must never produce is a pass.
 *
 * Extracted into its own module so this behaviour can be tested rather than
 * asserted textually. A guard that only reads the source can see that a control
 * is passed; it cannot see whether anything looks at it.
 */

/**
 * @param {(line: string) => void} [log]
 */
export function createChecker(log = console.log) {
  let failures = 0
  let controls = 0
  let inconclusive = 0

  const line = (verdict, label, detail) =>
    log(`${verdict}  ${label}${detail ? `\n        ${detail}` : ''}`)

  /**
   * DETAIL IS ONLY EVER SHOWN ON A FAILURE.
   *
   * A detail is an explanation of what went wrong, and callers write it that
   * way — "read the row but A's own hand was not in it", "no row returned".
   * Printing one under a PASS produces a check that reports success while
   * describing failure, which is worse than either: a reader believes the
   * sentence and not the verdict, or stops trusting both.
   *
   * That happened. A control passed and printed "A's own hand was not in it —
   * the seed shape has drifted" underneath it, because the string was built
   * eagerly and handed over whatever the outcome.
   *
   * A function may be passed instead of a string, so an expensive explanation
   * costs nothing on the path where it is not needed.
   */
  const render = detail => {
    const text = typeof detail === 'function' ? detail() : detail
    return text ?? ''
  }

  /** A plain assertion. Use for controls and for anything that is not an absence. */
  const check = (label, ok, detail = '') => {
    if (!ok) { failures++; line('FAIL', label, render(detail)); return false }
    line('PASS', label, '')
    return true
  }

  /**
   * An absence claim, and the control that gives it meaning.
   *
   * `control` is the result of a check that the mechanism can see something it
   * SHOULD see. False makes this inconclusive, never a pass.
   */
  const checkGiven = (control, label, ok, detail = '') => {
    if (!control) {
      failures++
      inconclusive++
      line('INCONCLUSIVE', label,
        'its control failed — nothing was visible by this route, so finding no secret proves nothing')
      void detail
      return false
    }
    controls++
    return check(label, ok, detail)
  }

  return {
    check,
    checkGiven,
    get failures() { return failures },
    /** How many absence claims were actually backed by a passing control. */
    get controlled() { return controls },
    get inconclusive() { return inconclusive },
  }
}
