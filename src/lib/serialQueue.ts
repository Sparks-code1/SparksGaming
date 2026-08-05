/**
 * Run async work one item at a time, per key.
 *
 * Written for campaign saves. `legacy_state` is written as one whole blob under
 * a compare-and-swap on a version column, and GameBoard saves on phase changes,
 * turn ends and reward resolutions — which overlap. Two overlapping saves both
 * read the same cached version, so the second was guaranteed to lose the swap
 * and be refused as "another player changed this campaign", with no other player
 * anywhere. Running them in order means each one sees what the one before it
 * actually wrote.
 *
 * Keyed so a client holding two campaigns does not serialise one behind the
 * other for no reason.
 */
export class SerialQueue {
  private tails = new Map<string, Promise<unknown>>()

  /**
   * Queue `work` behind anything already running for `key`.
   *
   * A failure must NOT cancel the work queued behind it. Naive chaining does
   * exactly that: one rejected save propagates down the chain and every later
   * save is skipped without running — persistence ends for the session while
   * the game carries on, which is precisely the symptom this was written for.
   *
   * Two things prevent it, and either alone is enough: `then(work, work)` runs
   * the next item whichever way the previous one settled, and the stored tail
   * has its rejection swallowed. Both are kept — the second also stops an
   * unobserved tail from surfacing as an unhandled rejection. The caller's own
   * promise is never caught here, so a failed save still reaches whoever asked
   * for it.
   */
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const prior = this.tails.get(key) ?? Promise.resolve()
    const mine = prior.then(work, work)
    this.tails.set(key, mine.catch(() => {}))
    return mine
  }

  /** True while anything is queued or running for `key`. Diagnostics only. */
  isBusy(key: string): boolean {
    return this.tails.has(key)
  }

  /** Resolves once everything queued for `key` has settled. */
  async drain(key: string): Promise<void> {
    await (this.tails.get(key) ?? Promise.resolve())
  }
}
