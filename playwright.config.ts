/**
 * The browser run: does the app's surface actually work.
 *
 * SCOPED DELIBERATELY. The 107 unit suites read source and call functions —
 * they prove the rules are written and that they compute. They cannot see a
 * control that never rendered, one rendered permanently disabled, or one with
 * a notice box laid over it, because in all three the code under test is fine
 * and the screen is not. That gap has cost two real games. So nothing here
 * re-checks a rule; every assertion is about a control being there, being
 * reachable, and answering.
 *
 * AGAINST THE LOCAL STACK, always — e2e/support/stack refuses anything else.
 * It mints accounts and throws away matches, which against the live project
 * would be someone's real game.
 *
 * ONE WORKER. Six seats share one dealt match and walk it forward through
 * setup, shipment and a battle; running those in parallel would have them
 * racing each other's turn.
 */
import { defineConfig, devices } from '@playwright/test'
import { readStack } from './e2e/support/stack'

/**
 * READ HERE, NOT IN GLOBAL SETUP. Playwright evaluates this file before
 * anything else runs, so the dev server's environment has to be settled by
 * now — an override written in globalSetup arrives after the server it was
 * meant to configure has already started against the LIVE project named in
 * .env. This also fails the run immediately, and says so, when the stack is
 * down; the alternative was a browser quietly testing production.
 */
const stack = readStack()

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // The stack, the deal and six sessions are slow; the assertions are not.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  /**
   * ITS OWN DEV SERVER, on its own port and pointed at the local stack.
   *
   * The app's .env names the LIVE project, and a browser run that signed into
   * that would be playing in it. The env vars here override that for this
   * server only; port 5174 keeps it clear of a dev server already running.
   */
  webServer: {
    // --host 127.0.0.1 IS LOAD-BEARING. Vite's default binding answers on
    // `localhost`, which resolves to ::1 here and not to 127.0.0.1 — so the
    // server came up fine and every poll of it failed, which reads exactly
    // like a server that never started.
    command: 'npx vite --port 5174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: stack.api,
      VITE_SUPABASE_ANON_KEY: stack.anon,
    },
  },
})
