/**
 * End the edge function this run started.
 *
 * The match rows are left where they are: they live in a local database that is
 * thrown away by `supabase db reset`, and a failed run is far easier to read
 * with its match still on disk.
 */
import { execSync } from 'node:child_process'

export default async function globalTeardown() {
  const pid = process.env.E2E_FUNCTIONS_PID
  if (!pid) return
  try {
    execSync(process.platform === 'win32'
      ? `taskkill /pid ${pid} /T /F`
      : `kill -TERM -${pid}`, { stdio: 'ignore' })
  } catch { /* already gone */ }
}
