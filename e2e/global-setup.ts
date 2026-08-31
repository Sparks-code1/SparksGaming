/**
 * Everything a browser needs before the first assertion.
 *
 * The stack's coordinates go into the environment so the dev server Playwright
 * starts points at the LOCAL project rather than the live one named in .env —
 * that override has to happen here, before the webServer spawns.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { readStack, ensureAccounts, serveFunctions, dealMatch } from './support/stack'

export default async function globalSetup() {
  const started = Date.now()
  const stack = readStack()

  // The dev server reads these; see playwright.config's webServer.env.
  process.env.E2E_SUPABASE_URL = stack.api
  process.env.E2E_SUPABASE_ANON_KEY = stack.anon

  await ensureAccounts(stack)
  const functions = await serveFunctions(stack)
  // The pid, so teardown can end the tree it started.
  process.env.E2E_FUNCTIONS_PID = String(functions.pid ?? '')

  // A DEALT MATCH IN SETUP — the position the setup controls exist for, and one
  // no fixture can write. Six seats, advanced, so the advisor decision is real.
  const matchId = dealMatch(stack)

  mkdirSync('e2e/.state', { recursive: true })
  writeFileSync('e2e/.state/run.json', JSON.stringify({
    api: stack.api, anon: stack.anon, service: stack.service,
    seats: stack.seats, matchId,
  }, null, 2))

  console.log(`\n  e2e: stack ${stack.api}, match ${matchId.slice(0, 8)}…`
    + ` ready in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)
}
