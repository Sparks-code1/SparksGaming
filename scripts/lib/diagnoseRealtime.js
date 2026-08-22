/**
 * Why a realtime subscription is silent.
 *
 * A client subscribes, reports SUBSCRIBED, and then receives nothing. Three
 * different faults produce exactly that, and silence looks identical in all
 * three:
 *
 *   SOCKET       the connection never really established
 *   PUBLICATION  the table is not in supabase_realtime, so nothing is emitted
 *   RLS          it is emitted, and the subscriber may not see it
 *
 * The service role separates them, because it bypasses RLS: if it receives
 * frames, the socket and the publication are both fine. A fourth cause sits
 * underneath RLS — a socket that was never given an access token is judged
 * `anon`, which is RLS refusing a request nobody made properly.
 *
 * PURE, AND IN ITS OWN FILE, because this is where the mistake was. The first
 * version asked "did the service role hear anything" FIRST, so a service probe
 * that missed announced "PUBLICATION — matches is not reaching the changefeed"
 * while the checks printed underneath it watched frames arrive for the seat. A
 * confident diagnosis pointing at the wrong half of the system is worse than
 * none at all, and it survived review because the logic lived inline in a script
 * that could only be exercised against a live database.
 *
 * The rule it now follows: WHAT THE SEAT DID is asked first. The service probe
 * only ever EXPLAINS a failure of the seat's. It can never overrule the seat
 * succeeding.
 */

/**
 * @typedef {{ status: string, got: boolean }} Probe
 * @param {{ seat: Probe, seatAfterAuth?: Probe | null, service: Probe }} probes
 * @returns {{ cause: 'none' | 'token' | 'socket' | 'publication' | 'rls', text: string, working: boolean }}
 */
export function diagnoseRealtime({ seat, seatAfterAuth = null, service }) {
  if (seat.got) {
    return { cause: 'none', working: true, text: 'none — the seat receives frames' }
  }
  if (seatAfterAuth && seatAfterAuth.got) {
    return {
      cause: 'token',
      working: true,
      text: "TOKEN — the seat's realtime socket had no access token, so RLS judged it anon and "
        + 'filtered everything. setAuth fixed it; a browser wires this up automatically',
    }
  }
  if (!service.got) {
    return service.status !== 'SUBSCRIBED'
      ? {
        cause: 'socket',
        working: false,
        text: `SOCKET — the seat heard nothing, and even the service role could not subscribe (${service.status})`,
      }
      : {
        cause: 'publication',
        working: false,
        text: 'PUBLICATION — the seat heard nothing, and neither did the service role, which '
          + 'bypasses RLS. So RLS is excluded and the table is not reaching the changefeed',
      }
  }
  return {
    cause: 'rls',
    working: false,
    text: `RLS-FOR-SUBSCRIBERS — the service role receives frames and the seat does not, `
      + `even with its token set (seat: ${seat.status})`,
  }
}
