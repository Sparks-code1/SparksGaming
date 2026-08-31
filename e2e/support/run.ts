/** What global-setup left behind for the specs to use. */
import { readFileSync } from 'node:fs'
import type { Stack } from './stack'
import { FACTIONS } from './stack'

export interface Run {
  api: string
  anon: string
  /**
   * The LOCAL stack's service key, which the specs need to read a match's
   * public row directly (whose shipment window is open, which phase it is in).
   * It is the CLI's own fixed development key, it reaches nothing outside this
   * machine, and e2e/.state is gitignored regardless.
   */
  service: string
  seats: Record<string, { email: string; password: string }>
  matchId: string
}

export function readRun(): Run {
  return JSON.parse(readFileSync('e2e/.state/run.json', 'utf8')) as Run
}

/** The run, in the shape the seat helpers want. */
export function stackOf(run: Run): Stack {
  return {
    api: run.api, anon: run.anon, service: run.service,
    seats: run.seats, factions: [...FACTIONS],
  }
}
