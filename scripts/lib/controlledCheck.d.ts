/**
 * Types for controlledCheck.js, which is plain JS because the script that uses
 * it runs under bare node with no build step.
 */
/** An explanation of a failure. Rendered only when there is one. */
export type Detail = string | (() => string)

export interface Checker {
  /** A plain assertion. Returns whether it passed, so it can BE a control. */
  check(label: string, ok: unknown, detail?: Detail): boolean
  /**
   * An absence claim. `control` false makes it INCONCLUSIVE — counted as a
   * failure, never a pass.
   */
  checkGiven(control: unknown, label: string, ok: unknown, detail?: Detail): boolean
  readonly failures: number
  readonly controlled: number
  readonly inconclusive: number
}

export function createChecker(log?: (line: string) => void): Checker
