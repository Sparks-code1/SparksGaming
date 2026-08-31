/**
 * What one harness dispatch actually proved.
 *
 * The invariant harness speaks to the endpoint through a local gateway that
 * sometimes fails WHILE THE WRITE LANDS — at-least-once delivery. So an
 * answer is evidence only when the endpoint spoke in its own voice (JSON
 * naming error/code, or a 2xx body); a gateway's 502 proves nothing either
 * way, and counting it as a refusal once cost a violation nobody could
 * trust. The version column is the tiebreaker the gateway cannot fake:
 * whether the write landed is asked of the database, not of the answer.
 *
 * Pure and imported by both the harness and its tests, so the trust rules
 * here are the ones actually enforced.
 */
export function classifyDispatch(r: {
  /** 'ok', or the refusal code expected. */
  expect: string
  /** The endpoint answered in its own shape (2xx body, or JSON naming error/code). */
  spoke: boolean
  /** HTTP 2xx on the final attempt. */
  ok: boolean
  code: string | undefined
  error: string | undefined
  /** Some attempt died in the gateway. */
  blipped: boolean
  /** Match version before the dispatch, and after it — the database's word. */
  before: number
  after: number
  /**
   * Whether the turn pointer moved — phase or turn number — across this
   * dispatch. The endpoint sweeps a finished phase forward off whatever action
   * arrived, so an accepted action can legitimately write TWICE: its own write
   * and the advance behind it. Nothing else may.
   */
  phaseMoved?: boolean
}): { verdict: 'ok' | 'ok-swept' | 'ok-through-blip' | 'refused' | 'violation' | 'unreachable'
  detail?: string } {
  const moved = r.after - r.before

  if (r.expect === 'ok') {
    if (r.spoke && r.ok) {
      if (moved === 1) return { verdict: 'ok' }
      // TWO WRITES, AND ONLY FOR THE ONE REASON. A finished phase rolls
      // forward off whatever action arrived — the endpoint's answer to having
      // no scheduler — so the action's own write is followed by the advance.
      // The second bump is allowed only with the turn pointer actually moved
      // to show for it: an extra write with the phase standing still is the
      // thing this invariant exists to catch, and loosening it to "one or two"
      // would have stopped catching it.
      if (moved === 2 && r.phaseMoved) return { verdict: 'ok-swept' }
      return moved === 2
        ? { verdict: 'violation', detail: `accepted write moved the version ${r.before} → ${r.after} without moving the phase` }
        : { verdict: 'violation', detail: `accepted write moved the version ${r.before} → ${r.after}, not by one` }
    }
    // THE BLIP'S WRITE MAY HAVE LANDED while its answer died in the
    // gateway; the retry of an already-applied action is then refused in
    // the endpoint's own voice. Either way the version bump is the proof.
    if (r.blipped && moved === 1) return { verdict: 'ok-through-blip' }
    if (r.spoke) {
      // a genuine refusal, in the endpoint's own shape
      return { verdict: 'violation', detail: `expected ok, refused: ${r.error ?? '?'} (${r.code ?? '?'})` }
    }
    // NEVER THE ENDPOINT'S VOICE AND NO WRITE LANDED: the action never
    // reached the law. Not a refusal, not an acceptance — infrastructure.
    if (moved === 0) return { verdict: 'unreachable' }
    return { verdict: 'violation', detail: `unreadable answers while the version moved ${r.before} → ${r.after}` }
  }

  // a refusal was expected
  if (moved !== 0) {
    return { verdict: 'violation', detail: `expected refusal '${r.expect}', but the version moved ${r.before} → ${r.after}` }
  }
  if (!r.spoke) return { verdict: 'unreachable' }
  if (r.ok) return { verdict: 'violation', detail: `expected refusal '${r.expect}', the server accepted it` }
  if (r.code !== r.expect) {
    return { verdict: 'violation', detail: `expected refusal '${r.expect}', got '${r.code}'` }
  }
  return { verdict: 'refused' }
}
