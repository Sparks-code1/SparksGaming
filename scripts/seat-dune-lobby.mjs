/**
 * A Dune match, opened and seated the way six people would open and seat it.
 *
 * THE DIFFERENCE FROM seed-dune-match.mjs, which is the whole reason this
 * exists: that script writes a match with the service role, straight past
 * every policy, into whatever mid-game position a fixture wants. This one signs
 * in as each account and makes that account's own writes — the host opens a
 * table, the others join by code through join_dune_lobby, each takes a faction
 * on its own row, and the host posts START_DUNE. Nothing here bypasses RLS,
 * and nothing here deals: the server deals, from openingPosition, exactly as it
 * would for six browsers.
 *
 * WHICH MEANS THE RESULT IS A MATCH IN SETUP. That is the state no fixture can
 * produce — the four decisions, one deadline, six secrets rows and three decks
 * are written together by START_DUNE or not at all — and it is the state the
 * setup controls exist for. Seeding one by hand would mean dealing traitors in
 * a terminal, which is the one thing the whole hidden-state design is for.
 *
 * It is also what the seed script's own header asks for: "When faction setup
 * exists this should be deleted rather than grown into it." Setup exists. The
 * seed script still has the three phase fixtures — charity, blow, bidding —
 * which start from positions no lobby produces, so it stays until those phases
 * can be reached by playing to them.
 *
 * IT NEEDS, from the environment or from .env / .env.local, which it reads:
 *
 *   VITE_SUPABASE_URL        project url
 *   VITE_SUPABASE_ANON_KEY   the ANON key, deliberately — a service-role key
 *                            would make every write below a lie about which
 *                            policies allow it
 *   VITE_DEV_SEATS           the harness's own line: entries of
 *                            `faction,seat,email,password` separated by ';'.
 *                            The same value the browser reads, so a run needs
 *                            no second copy of the credentials.
 *
 * The accounts must already exist. This creates none — an account is a
 * credential, and a script that mints them is a script that leaves them lying
 * around. Same rule as seed-dune-match.mjs.
 *
 * To run it:
 *
 *   node scripts/seat-dune-lobby.mjs
 *   node scripts/seat-dune-lobby.mjs --seats=4
 *   node scripts/seat-dune-lobby.mjs --mode=basic     (no advisor decision)
 *   node scripts/seat-dune-lobby.mjs --no-start       (leave it in the lobby)
 *
 * To sweep up afterwards:
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed-dune-match.mjs --drop
 *
 * which deletes campaign-less Dune matches, lobbies and dealt games alike —
 * these among them. IT NEEDS THE SERVICE ROLE, which this script deliberately
 * never holds: there is no delete policy on `matches` and there should not be.
 * A table you are sitting at is not yours to destroy, and the five other people
 * at it would find out by the board vanishing.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

// ── the environment, including the file the dev server reads ────────────────
// VITE_DEV_SEATS lives in .env because that is where the browser can see it,
// and a script that made you export it again would be a second place for the
// same six passwords to be wrong. Anything already exported wins.
for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m || process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const need = name => {
  const v = process.env[name]
  if (!v) {
    console.error(`missing ${name} — see the header of this file for what it wants`)
    process.exit(2)
  }
  return v
}

const URL_ = need('VITE_SUPABASE_URL')
const ANON = need('VITE_SUPABASE_ANON_KEY')

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const MODE = arg('mode') === 'basic' ? 'basic' : 'advanced'
const START = !process.argv.includes('--no-start')

/**
 * The seats, off the harness's own line.
 *
 * `seat` IS match_players.player_id — 'p1', 'p2' — and not the board position.
 * It is passed to the join as the player's NAME, because that is the column
 * join_dune_lobby files player_id from; carrying the harness's ids through
 * unchanged is what lets VITE_DEV_SEATS stay as it is from one run to the next
 * while only the match id in the URL moves.
 */
const seats = need('VITE_DEV_SEATS').split(';')
  .map(entry => entry.split(',').map(s => s.trim()))
  .filter(parts => parts.length === 4)
  .map(([faction, seat, email, password]) => ({ faction, seat, email, password }))

/**
 * Which of them are playing.
 *
 * A COUNT OR A LIST. `--seats=4` takes the first four, which is what you want
 * when you only care how many; `--seats=p1,p6` or `--seats=fremen,bene-gesserit`
 * names them, which is what you want when you care WHICH — three of the four
 * setup decisions belong to two factions, and a table picked by counting from
 * the top can easily contain neither.
 */
const pick = arg('seats')
const table = !pick ? seats
  : /^\d+$/.test(pick) ? seats.slice(0, Number(pick))
  : (() => {
      const names = pick.split(',').map(s => s.trim()).filter(Boolean)
      const chosen = names.map(n => seats.find(s => s.seat === n || s.faction === n))
      const missing = names.filter((n, i) => !chosen[i])
      if (missing.length) {
        console.error(`VITE_DEV_SEATS has no seat or faction called ${missing.join(', ')}`)
        console.error(`it carries: ${seats.map(s => `${s.seat}/${s.faction}`).join(', ')}`)
        process.exit(2)
      }
      return chosen
    })()

if (table.length < 2) {
  console.error(`VITE_DEV_SEATS yielded ${table.length} usable seat(s) — a table needs two.`)
  console.error('Each entry is `faction,seat,email,password`, separated by semicolons.')
  process.exit(2)
}
if (table.length > 6) {
  console.error(`a Dune table seats six; got ${table.length}`)
  process.exit(2)
}
const duplicate = table.map(s => s.faction)
  .find((f, i, all) => all.indexOf(f) !== i)
if (duplicate) {
  console.error(`two seats claim ${duplicate} — the faction is the seat, and the server will refuse the second`)
  process.exit(2)
}

/**
 * The share code alphabet, read out of the module that mints them.
 *
 * PARSED RATHER THAN COPIED, like the seed script reads the treachery ids: a
 * code from a different alphabet is not refused for being malformed, it is
 * refused for matching no table, which reads as "the RPC is broken" from here.
 * One source, so it cannot drift.
 */
const codeAlphabet = () => {
  const src = readFileSync('src/lib/dune/duneLobby.ts', 'utf8')
  const found = /CODE_ALPHABET = '([^']+)'/.exec(src)?.[1]
  if (!found || found.length < 16) {
    throw new Error('could not read CODE_ALPHABET out of src/lib/dune/duneLobby.ts')
  }
  return found
}
const newJoinCode = () => {
  const alphabet = codeAlphabet()
  return Array.from({ length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

/**
 * One signed-in client per account.
 *
 * SEPARATE CLIENTS, not one client signing in six times: the point of the run
 * is that six different tokens make six different writes, and a single client
 * would leave every row created by whoever was signed in last. The browser
 * harness does the same thing with the same accounts — see src/dev/multiSeat.
 */
const signIn = async ({ email, password }) => {
  const client = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { failed: error?.message ?? 'no session came back' }
  return { client, userId: data.user.id, token: data.session?.access_token }
}

// EVERY ACCOUNT BEFORE ANY ROW IS WRITTEN, and every failure at once. A stale
// password four seats in used to leave a half-seated table behind and a stack
// trace on the way out; the fix for that is one edit to .env, and you would
// rather be told about all of them before making it than one per run.
console.log(`\nsigning in ${table.length} account(s)…`)
const refused = []
for (const seat of table) {
  const out = await signIn(seat)
  if (out.failed) {
    refused.push(`${seat.seat} ${seat.email}: ${out.failed}`)
    console.log(`  ${seat.seat.padEnd(3)} ${seat.faction.padEnd(14)} ${seat.email}  ✗`)
    continue
  }
  Object.assign(seat, out)
  console.log(`  ${seat.seat.padEnd(3)} ${seat.faction.padEnd(14)} ${seat.email}`)
}
if (refused.length) {
  console.error(`\n${refused.length} account(s) would not sign in:\n`)
  for (const line of refused) console.error(`  ${line}`)
  console.error('\nNothing was written. Fix the password in .env — VITE_DEV_SEATS carries')
  console.error('`faction,seat,email,password` per entry — or leave that seat out:\n')
  const usable = table.filter(s => s.client).map(s => s.seat)
  console.error(`  node scripts/seat-dune-lobby.mjs --seats=${usable.join(',') || 'p1,p2'}\n`)
  process.exit(2)
}

const [host, ...guests] = table

// ── the host opens a table ──────────────────────────────────────────────────
// The same two writes createDuneLobby makes, in the same order and on the
// host's own session: the match, then the host's seat. Not a copy of the rules
// so much as a copy of the CALLS — this is a node script and cannot import the
// TS module, so what is worth watching is that neither write is anything a
// browser could not make.
const joinCode = newJoinCode()
const { data: match, error: mErr } = await host.client.from('matches').insert({
  campaign_id: null,
  game_number: 1,
  status: 'lobby',
  created_by: host.userId,
  human_slots: table.length,
  game_type: 'dune',
  game_mode: MODE,
  join_code: joinCode,
}).select('id, join_code').single()
if (mErr || !match) {
  console.error(`could not open the table: ${mErr?.message ?? 'no row returned'}`)
  process.exit(1)
}

const { error: hostErr } = await host.client.from('match_players').insert({
  match_id: match.id, seat: 0, player_id: host.seat, user_id: host.userId,
  name: host.seat, faction_id: 'unassigned', is_ai: false, ai_difficulty: null, ready: false,
})
if (hostErr) {
  console.error(`could not seat the host: ${hostErr.message}`)
  process.exit(1)
}
console.log(`\nopened ${match.id}  code ${match.join_code}  (${MODE})`)

// ── everybody else joins by code ────────────────────────────────────────────
// THROUGH THE RPC, which is the path a real player takes: they hold a code and
// nothing else, and the function checks the code, the room and the seat count
// before writing a row they could not have written themselves. A script that
// inserted their match_players rows directly would prove nothing about it.
for (const guest of guests) {
  const { data, error } = await guest.client.rpc('join_dune_lobby', {
    p_code: match.join_code, p_name: guest.seat, p_faction: null,
  })
  if (error) {
    console.error(`${guest.email} could not join: ${error.message}`)
    process.exit(1)
  }
  if (!data) {
    // The RPC says no more than that, on purpose — telling somebody guessing
    // codes that they have found a real table is most of what a code prevents.
    console.error(`${guest.email} was refused: no open table with that code, or it is full`)
    process.exit(1)
  }
  console.log(`  ${guest.seat} joined`)
}

// ── each seat takes its faction ─────────────────────────────────────────────
// ITS OWN ROW AND NOBODY ELSE'S, which is what the policy allows and what
// chooseFaction does. Six updates on six sessions rather than one update from
// here over all of them.
for (const seat of table) {
  const { error } = await seat.client.from('match_players')
    .update({ faction_id: seat.faction })
    .eq('match_id', match.id).eq('user_id', seat.userId)
  if (error) {
    console.error(`${seat.seat} could not take ${seat.faction}: ${error.message}`)
    process.exit(1)
  }
}
console.log(`  factions taken: ${table.map(s => s.faction).join(', ')}`)

// WHAT THIS TABLE CAN AND CANNOT EXERCISE, said before it is dealt rather than
// discovered as an empty panel. Three of the four decisions belong to two
// factions, and a table without them deals a setup with almost nothing in it.
const has = f => table.some(s => s.faction === f)
if (!has('fremen')) {
  console.log('\n  ! no Fremen at this table — nothing will exercise the ten forces,')
  console.log('    and the advisor placement will not be blocked on anybody.')
}
if (!has('bene-gesserit')) {
  console.log('\n  ! no Bene Gesserit — no prediction and no advisor, so the only')
  console.log('    decisions dealt will be the traitors.')
} else if (MODE === 'basic') {
  console.log('\n  ! basic game — the Bene Gesserit go in the Polar Sink by rule,')
  console.log('    so there is no advisor decision to answer. --mode=advanced for it.')
}

// ── and the host deals ──────────────────────────────────────────────────────
// THROUGH dune-action, on the host's token, because the deal writes
// match_secrets and match_decks and no client may write either. The endpoint
// resolves the acting seat from the token and refuses anybody but the host —
// so this is posted as the host for a reason, not by convention.
if (!START) {
  console.log(`\nleft in the lobby, as asked. Six seats, nobody dealt.`)
  console.log(`\n  http://localhost:5173/?dune-match=${match.id}\n`)
  console.log(`Press Start there as the host to deal it.\n`)
  process.exit(0)
}

const res = await fetch(`${URL_}/functions/v1/dune-action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${host.token}` },
  body: JSON.stringify({ matchId: match.id, action: { type: 'START_DUNE', mode: MODE } }),
})
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`\nthe server would not deal it: ${body.error ?? res.status} (${body.code ?? 'no code'})`)
  process.exit(1)
}

// ── what came back ──────────────────────────────────────────────────────────
// READ OFF THE PUBLIC ROW, not off the response, so what is printed is what the
// six browsers are about to receive. The four decisions are public — who is
// being waited on and for what — and nothing else about them is.
const { data: dealt } = await host.client
  .from('matches').select('state').eq('id', match.id).single()
const setup = dealt?.state?.setup
const outstanding = setup?.outstanding ?? []

console.log(`\ndealt. ${outstanding.length} decision(s) outstanding:\n`)
for (const seat of table) {
  const owed = outstanding.filter(d => d.faction === seat.faction).map(d => d.kind)
  console.log(`  ${seat.seat.padEnd(3)} ${seat.faction.padEnd(14)} ${owed.join(', ') || '—'}`)
}
if (setup?.closesAt) {
  const left = Math.round((setup.closesAt - Date.now()) / 1000)
  console.log(`\nthe window shuts in ${left}s, and then the defaults apply to whatever is left.`)
}

console.log('\nOpen the harness:\n')
console.log(`  http://localhost:5173/?dune-seats&match=${match.id}\n`)
console.log('  ...and switch seats to answer as each. One browser, six sessions.')
console.log('\nOr one seat at a time, signed in as that account:\n')
console.log(`  http://localhost:5173/?dune-match=${match.id}\n`)
console.log('VITE_DEV_SEATS is unchanged — the seat ids are the ones it already carries.')
console.log('\nWhen you are done:  node scripts/seed-dune-match.mjs --drop\n')
