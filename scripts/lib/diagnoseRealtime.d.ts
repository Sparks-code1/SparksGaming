/** Types for diagnoseRealtime.js — plain JS, because the script that uses it
 *  runs under bare node with no build step. */
export interface Probe {
  /** The channel's terminal subscribe status: 'SUBSCRIBED', 'CHANNEL_ERROR', … */
  status: string
  /** Whether any frame arrived. */
  got: boolean
}

export type RealtimeCause = 'none' | 'token' | 'socket' | 'publication' | 'rls'

export interface RealtimeDiagnosis {
  cause: RealtimeCause
  /** One line, for the operator. */
  text: string
  /** Whether the seat ends up receiving frames at all. */
  working: boolean
}

export function diagnoseRealtime(probes: {
  seat: Probe
  seatAfterAuth?: Probe | null
  service: Probe
}): RealtimeDiagnosis
