/**
 * The local stack's coordinates, its accounts, and a real dealt match.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE UNIT SUITES. Those read source and call
 * functions, so they prove a rule is written and that it computes. What they
 * cannot see is whether the control that fires it ever reached the screen: a
 * prop that stopped being passed, a button rendered disabled forever, a notice
 * box laid over the one thing you have to press. Each of those leaves every
 * suite green. Two of them have already cost a real game.
 *
 * SO THIS DRIVES THE APP. It needs what a browser needs: a running stack, real
 * accounts with real sessions, a served edge function, and a match that was
 * DEALT rather than written — because the setup controls only exist for a match
 * in setup, and no fixture can produce one (the four decisions, the deadline,
 * the six secrets rows and the three decks are one write or nothing).
 *
 * LOCAL ONLY, AND IT REFUSES OTHERWISE. Every account here has a known
 * password and every match is disposable; pointed at the live project it would
 * be creating users and tables in somebody's real game.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

export interface Stack {
  api: string
  anon: string
  service: string
  /** faction → { email, password } */
  seats: Record<string, { email: string; password: string }>
  factions: string[]
}

export const FACTIONS = [
  'atreides', 'fremen', 'harkonnen', 'emperor', 'spacing-guild', 'bene-gesserit',
]
const PASSWORD = 'e2e-harness-only'
const EMAILS = FACTIONS.map((_, i) => `e2e-${i + 1}@local.test`)

/**
 * `supabase status`, parsed — the same source the invariant harness reads.
 *
 * ASKED ONCE. The CLI writes a telemetry file on every invocation and two runs
 * of it racing each other fail on Windows with EPERM renaming that file — which
 * surfaces as a stack trace about telemetry and says nothing about the three
 * callers who all wanted the same four strings.
 */
let cached: Stack | null = null
export function readStack(): Stack {
  if (cached) return cached
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const env = Object.fromEntries(
    out.split(/\r?\n/).filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(),
        l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
  )
  const api = env.API_URL
  const anon = env.ANON_KEY
  const service = env.SERVICE_ROLE_KEY
  if (!api || !anon || !service) {
    throw new Error('supabase status gave no API_URL / ANON_KEY / SERVICE_ROLE_KEY — is the stack up?'
      + '\nStart it with:  npx supabase start')
  }
  // THE GUARD THAT MATTERS. Everything below mints accounts and throws away
  // matches; against the live project that is somebody's real game.
  if (!/127\.0\.0\.1|localhost/.test(api)) {
    throw new Error(`refusing to run against a non-local API: ${api}`)
  }
  cached = {
    api, anon, service, factions: FACTIONS,
    seats: Object.fromEntries(
      FACTIONS.map((f, i) => [f, { email: EMAILS[i], password: PASSWORD }])),
  }
  return cached
}

/** Six accounts, created idempotently. Local passwords, thrown away with the db. */
export async function ensureAccounts(stack: Stack): Promise<void> {
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  for (const email of EMAILS) {
    const { error } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    })
    if (error && !/already/i.test(error.message)) {
      throw new Error(`createUser ${email}: ${error.message}`)
    }
  }
}

/**
 * The edge function, served for the run.
 *
 * The app calls dune-action for every action, so without this the board reads
 * fine and nothing can be DONE on it — which would make every interaction
 * assertion below fail for a reason that has nothing to do with the app.
 */
export async function serveFunctions(stack: Stack): Promise<ChildProcess> {
  const envFile = 'supabase/.local-functions.env'
  execSync(`node -e "require('node:fs').writeFileSync('${envFile}', 'DUNE_DEV_SEEDING=on')"`)
  const proc = spawn('npx', ['supabase', 'functions', 'serve', '--env-file', envFile],
    { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  proc.stdout?.on('data', d => { log += d })
  proc.stderr?.on('data', d => { log += d })

  // AN ANSWER FROM OUR HANDLER, not merely an answer, and not merely a status
  // that is not 502.
  //
  // THE GATEWAY IS UP LONG BEFORE THE RUNTIME BEHIND IT. Waiting for "the
  // fetch did not throw" returned instantly on a 502 and the deal that
  // followed failed with one; waiting for "not a 502" returned in ONE SECOND
  // on the gateway's own 401, because an unauthenticated POST never reaches
  // the function at all. Both looked exactly like a broken import in the
  // bundle, which cost real time to rule out twice.
  //
  // WITH THE ANON KEY the request gets past the gateway, and an empty body is
  // refused by our own first line with 400 — before it asks who is calling, so
  // no session is needed. 400 on this route is a thing only the function can
  // say.
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${stack.api}/functions/v1/dune-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${stack.anon}`,
        },
        body: '{}',
      })
      if (res.status === 400) return proc
    } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`functions serve never came up.\n${log.slice(-2000)}`)
}

export function killTree(proc: ChildProcess | null): void {
  if (!proc?.pid) return
  try {
    execSync(process.platform === 'win32'
      ? `taskkill /pid ${proc.pid} /T /F`
      : `kill -TERM -${proc.pid}`, { stdio: 'ignore' })
  } catch { /* already gone */ }
}

/**
 * A dealt match, opened the way six people open one.
 *
 * THROUGH THE LOBBY, not the seeder: the host opens a table, the others join by
 * code, and the SERVER deals. That is the only way to reach setup, and it also
 * means the seat keys are whatever the real code path assigns — which is the
 * point, since the harness reading a key it guessed instead of asking is
 * exactly the bug this run is here to catch.
 */
export function dealMatch(stack: Stack, opts: { seats?: number; mode?: string } = {}): string {
  const devSeats = FACTIONS
    .map((f, i) => `${f},p${i + 1},${EMAILS[i]},${PASSWORD}`)
    .join(';')
  const args = ['scripts/seat-dune-lobby.mjs']
  if (opts.seats) args.push(`--seats=${opts.seats}`)
  if (opts.mode) args.push(`--mode=${opts.mode}`)
  const out = execSync(`node ${args.join(' ')}`, {
    encoding: 'utf8',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: stack.api,
      VITE_SUPABASE_ANON_KEY: stack.anon,
      VITE_DEV_SEATS: devSeats,
    },
  })
  const m = /opened ([0-9a-f-]{36})/.exec(out)
  if (!m) throw new Error(`the lobby seater printed no match id:\n${out}`)
  return m[1]
}

/**
 * A match parked in a phase no opening deal reaches.
 *
 * The lobby gives setup and nothing else; getting from there to a battle means
 * playing a whole turn, including an auction six seats have to bid in. The
 * seeder writes the position directly with the service role, which is what it
 * is for — and these specs are about the controls in a phase, not about the
 * route taken to arrive in it.
 */
export function seedPhase(stack: Stack, phase: 'charity' | 'blow' | 'bidding' | 'battle'): string {
  const out = execSync(`node scripts/seed-dune-match.mjs --phase=${phase}`, {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_URL: stack.api,
      SUPABASE_SERVICE_ROLE_KEY: stack.service,
      DUNE_SEED_ACCOUNTS: EMAILS.join(','),
    },
  })
  const m = /seeded \w+ match ([0-9a-f-]{36})/.exec(out)
  if (!m) throw new Error(`the seeder printed no match id:\n${out}`)
  return m[1]
}

/** One action, as a signed-in seat — the same call the browser makes. */
export async function act(
  stack: Stack, faction: string, matchId: string, action: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { email, password } = stack.seats[faction]
  const client = createClient(stack.api, stack.anon, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`sign-in ${faction}: ${error?.message ?? 'none'}`)
  const res = await fetch(`${stack.api}/functions/v1/dune-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ matchId, action }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

/** The public row's phase, read with the service role. */
export async function phaseOf(stack: Stack, matchId: string): Promise<string> {
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  const { data } = await admin.from('matches').select('state').eq('id', matchId).single()
  return ((data?.state ?? {}) as { phase?: string }).phase ?? '?'
}

/**
 * Walk a match forward to a named phase, through the endpoint.
 *
 * Presses the same ADVANCE_PHASE a host presses. Deliberately NOT a database
 * write: a phase entered by hand skips the work entering it is supposed to do,
 * and the controls this run asserts on are drawn from what that work wrote.
 */
export async function advanceTo(
  stack: Stack, faction: string, matchId: string, want: string, cap = 8,
): Promise<void> {
  for (let i = 0; i < cap; i++) {
    if (await phaseOf(stack, matchId) === want) return
    const { status, body } = await act(stack, faction, matchId, { type: 'ADVANCE_PHASE' })
    if (status >= 400) {
      throw new Error(`could not reach ${want}: the endpoint refused at `
        + `${await phaseOf(stack, matchId)} with ${body.code ?? status}`)
    }
  }
  if (await phaseOf(stack, matchId) !== want) {
    throw new Error(`gave up short of ${want}, stuck at ${await phaseOf(stack, matchId)}`)
  }
}

/**
 * Open an auction on a seeded Bidding fixture.
 *
 * OPEN_BIDDING is told the storm's rotation, what each seat already holds and
 * each seat's limit — without them the endpoint concludes every hand is full
 * and auctions nothing. The rotation comes from the game's OWN walk, off the
 * same bundle the server runs, so the fixture cannot disagree with the entry
 * it imitates about who bids first.
 */
export async function openBidding(stack: Stack, matchId: string): Promise<void> {
  const { stormOrder } = await import(
    '../../supabase/functions/_shared/dunePhase.gen.ts') as {
      stormOrder: (storm: string, players: unknown[]) => string[]
    }
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  const { data } = await admin.from('matches').select('state').eq('id', matchId).single()
  const state = (data?.state ?? {}) as {
    storm: string; players: { faction: string; handCount?: number }[]
  }
  const order = stormOrder(state.storm, state.players)
  const hands = Object.fromEntries(state.players.map(p => [p.faction, p.handCount ?? 0]))
  const limits = {
    atreides: 4, fremen: 4, harkonnen: 8, emperor: 4,
    'spacing-guild': 4, 'bene-gesserit': 4,
  }
  const res = await act(stack, order[0], matchId, { type: 'OPEN_BIDDING', order, hands, limits })
  if (res.status >= 400) {
    throw new Error(`the auction would not open: ${JSON.stringify(res.body).slice(0, 200)}`)
  }
}

/** The auction's carry, as the public row has it. */
export async function auctionOf(stack: Stack, matchId: string): Promise<{
  toAct?: string; closesAt?: number; status?: string
} | null> {
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  const { data } = await admin.from('matches').select('state').eq('id', matchId).single()
  const a = ((data?.state ?? {}) as {
    auction?: { status?: string; closesAt?: number; carry?: { toAct?: string } }
  }).auction
  return a ? { toAct: a.carry?.toAct, closesAt: a.closesAt, status: a.status } : null
}

/** Push an auction's bid deadline into the past, without touching anything else. */
export async function expireBidWindow(stack: Stack, matchId: string): Promise<void> {
  const admin = createClient(stack.api, stack.service, { auth: { persistSession: false } })
  const { data } = await admin.from('matches').select('state').eq('id', matchId).single()
  const state = (data?.state ?? {}) as Record<string, unknown>
  const auction = state.auction as Record<string, unknown> | undefined
  if (!auction) throw new Error('no auction to expire')
  await admin.from('matches')
    .update({ state: { ...state, auction: { ...auction, closesAt: Date.now() - 1000 } } })
    .eq('id', matchId)
}
