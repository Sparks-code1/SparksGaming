/**
 * The devtools check, as a script.
 *
 * Seeds a throwaway match with two seats holding DIFFERENT secrets, connects as
 * one of them, and asserts that nothing belonging to the other is reachable. It
 * reads the wire rather than the app: what a client renders says only what it
 * chose to show, and the question is what crossed the network.
 *
 * WRITTEN TO FAIL FIRST. Run it before the wiring exists and PRIVATE-STATE and
 * DECK-STORE should both go red — that is the leak, reproduced on demand. A
 * check that has never failed has not been shown to catch anything.
 *
 * It needs credentials, and takes them only from the environment so they are
 * never written down here:
 *
 *   SUPABASE_URL                 project url
 *   SUPABASE_SERVICE_ROLE_KEY    to seed and to clean up; bypasses RLS
 *   SEAT_A_EMAIL / SEAT_A_PASSWORD   an account that will hold seat p1
 *   SEAT_B_EMAIL                 an account for seat p2 — no password needed,
 *                                nothing ever signs in as B
 *
 * B's password is deliberately not read. The check only needs B to EXIST so a
 * row can be addressed to them; signing in as B would prove nothing that
 * signing in as A does not.
 *
 * IT WRITES TO A LIVE PROJECT. It creates its own campaign — matches.campaign_id
 * is NOT NULL — plus a match, two seats, their secrets and a deck row, and tears
 * the lot down in a finally block by deleting the campaign, which everything
 * else cascades from. It never touches a campaign anybody is playing: this seeds
 * deliberately leaky state, which has no business near real data.
 *
 * Every row it makes is tagged `privacy-check-<runid>`, so a crashed run leaves
 * something findable. To sweep up after one:
 *
 *   delete from campaigns where id like 'privacy-check-%';
 *
 * To run it:
 *
 *   node scripts/check-seat-privacy.mjs
 */
import { createClient } from '@supabase/supabase-js'

const need = name => {
  const v = process.env[name]
  if (!v) {
    console.error(`missing ${name} — see the header of this file for what it wants`)
    process.exit(2)
  }
  return v
}

const URL = need('SUPABASE_URL')
const SERVICE = need('SUPABASE_SERVICE_ROLE_KEY')
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
if (!ANON) { console.error('missing SUPABASE_ANON_KEY'); process.exit(2) }

const TAG = 'privacy-check'
// Per-run, because campaigns.id is a TEXT primary key: two runs sharing one id
// would collide, and a crashed run leaves a row somebody has to find by hand.
// Anything matching `privacy-check-%` in campaigns is safe to delete.
const RUN = `${TAG}-${Date.now().toString(36)}`
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n        ${detail}` : ''}`)
}

/** Wait for a condition, or give up. Realtime is asynchronous and a check that
 *  reads too early passes for the wrong reason. */
const until = async (fn, ms = 4000) => {
  const started = Date.now()
  while (Date.now() - started < ms) {
    if (fn()) return true
    await new Promise(r => setTimeout(r, 100))
  }
  return false
}

const userIdFor = async email => {
  // listUsers rather than a lookup by email: the admin API has no by-email get,
  // and these projects have few enough users for one page.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!found) throw new Error(`no account for ${email} — create it, or point SEAT_*_EMAIL at ones that exist`)
  return found.id
}

let matchId = null
let campaignId = null

try {
  const emailA = need('SEAT_A_EMAIL')
  const passwordA = need('SEAT_A_PASSWORD')
  const emailB = need('SEAT_B_EMAIL')
  const [userA, userB] = [await userIdFor(emailA), await userIdFor(emailB)]
  if (userA === userB) throw new Error('SEAT_A_EMAIL and SEAT_B_EMAIL are the same account')

  // ── seed ──────────────────────────────────────────────────────────────────
  // Two seats, each holding something the other must never see. The values are
  // distinctive strings so a hit in a payload is unambiguous.
  const SECRET_A = `${TAG}-A-onlyAmaySeeThis`
  const SECRET_B = `${TAG}-B-onlyBmaySeeThis`

  // matches.campaign_id is NOT NULL and references campaigns(id), so there has
  // to be a campaign before there can be a match. Made fresh rather than
  // borrowed from a real one: this seeds deliberately leaky state and writes
  // into match_secrets, and neither belongs anywhere near a campaign somebody
  // is playing.
  campaignId = RUN
  const { error: cErr } = await admin.from('campaigns').insert({
    id: campaignId,
    world_name: TAG,
    // NOT NULL with no default.
    legacy_state: {},
  })
  if (cErr) throw new Error(`seed campaign: ${cErr.message}`)

  const { data: match, error: mErr } = await admin
    .from('matches')
    .insert({
      campaign_id: campaignId,
      game_number: 1,
      // 'active' rather than 'lobby' so the row is shaped like one a player
      // really holds — the check is about what a real seat receives. It is
      // visible to the two accounts for the few seconds the script runs.
      status: 'active',
      state: {
        // Deliberately shaped like the state the app writes today, hands and
        // all. If the app has stopped putting hands here, this seeding is what
        // needs updating — not the assertion below.
        players: [
          { id: 'p1', name: TAG, cards: [SECRET_A], cardCount: 1 },
          { id: 'p2', name: TAG, cards: [SECRET_B], cardCount: 1 },
        ],
      },
    })
    .select('id')
    .single()
  if (mErr) throw new Error(`seed match: ${mErr.message}`)
  matchId = match.id

  // seat, name and faction_id are all NOT NULL. Leaving them out was the next
  // failure after the campaign one, so they are here rather than discovered.
  const { error: pErr } = await admin.from('match_players').insert([
    { match_id: matchId, seat: 0, player_id: 'p1', user_id: userA, name: `${TAG}-A`, faction_id: 'khan-industries' },
    { match_id: matchId, seat: 1, player_id: 'p2', user_id: userB, name: `${TAG}-B`, faction_id: 'imperial-balkania' },
  ])
  if (pErr) throw new Error(`seed match_players: ${pErr.message}`)

  const { error: sErr } = await admin.from('match_secrets').insert([
    { match_id: matchId, player_id: 'p1', data: { hand: [SECRET_A] } },
    { match_id: matchId, player_id: 'p2', data: { hand: [SECRET_B] } },
  ])
  if (sErr) throw new Error(`seed match_secrets: ${sErr.message}`)

  // The deck store, if it exists yet. Absent before its migration is applied,
  // which is a red DECK-STORE rather than a crash.
  const DECK_SECRET = `${TAG}-deck-nobodyMaySeeThis`
  const { error: dErr } = await admin.from('match_decks')
    .insert({ match_id: matchId, deck: 'treachery', cards: [DECK_SECRET] })
  const deckStoreExists = !dErr
  if (dErr) console.log(`        (match_decks not seeded: ${dErr.message})`)

  // ── connect as A, and only as A ───────────────────────────────────────────
  const asA = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: authErr } = await asA.auth.signInWithPassword({ email: emailA, password: passwordA })
  if (authErr) throw new Error(`sign in as A: ${authErr.message}`)

  // ── 1. match_secrets: A sees its own row and nothing else ─────────────────
  {
    const { data, error } = await asA.from('match_secrets').select('player_id, data').eq('match_id', matchId)
    const rows = data ?? []
    check('SECRETS-RLS  A can read its own secrets row',
      !error && rows.some(r => r.player_id === 'p1'), error?.message ?? `rows=${JSON.stringify(rows)}`)
    check("SECRETS-RLS  A cannot read B's secrets row",
      !rows.some(r => r.player_id === 'p2'),
      `read ${rows.length} row(s): ${JSON.stringify(rows.map(r => r.player_id))}`)
    check("SECRETS-RLS  B's value appears nowhere in what A can read",
      !JSON.stringify(rows).includes(SECRET_B))
  }

  // ── 2. the realtime frame A receives ──────────────────────────────────────
  // The actual devtools question: what came down the socket. Anything reachable
  // here is reachable from the Network tab.
  {
    const frames = []
    const channel = asA
      .channel(`privacy-check-${matchId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        p => frames.push(p))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'match_secrets', filter: `match_id=eq.${matchId}` },
        p => frames.push(p))
    await new Promise(resolve => channel.subscribe(s => { if (s === 'SUBSCRIBED') resolve() }))

    // Touch both seats so a frame for each is produced.
    await admin.from('match_secrets')
      .update({ data: { hand: [SECRET_B], touched: 1 } })
      .eq('match_id', matchId).eq('player_id', 'p2')
    await admin.from('matches')
      .update({ state: {
        players: [
          { id: 'p1', name: TAG, cards: [SECRET_A], cardCount: 1 },
          { id: 'p2', name: TAG, cards: [SECRET_B], cardCount: 1 },
        ],
      } })
      .eq('id', matchId)

    await until(() => frames.length >= 1)
    const wire = JSON.stringify(frames)

    check("SECRETS-WIRE  no frame carries B's secrets row",
      !frames.some(f => f.table === 'match_secrets' && JSON.stringify(f.new ?? {}).includes(SECRET_B)),
      `${frames.length} frame(s) seen`)

    // THE ONE THAT IS RED TODAY. Hands live in matches.state, and that row is
    // delivered whole to every subscriber, so B's hand is on A's socket.
    check("PRIVATE-STATE  B's hand is absent from the match state A receives",
      !wire.includes(SECRET_B),
      wire.includes(SECRET_B)
        ? "B's hand crossed the wire to A — this is the leak, and it is what the wiring has to remove"
        : '')

    await asA.removeChannel(channel)
  }

  // ── 3. the deck store: nobody at all ──────────────────────────────────────
  {
    const { data, error } = await asA.from('match_decks').select('deck, cards').eq('match_id', matchId)
    if (!deckStoreExists) {
      check('DECK-STORE  the deck store exists', false, 'match_decks is missing — apply its migration')
    } else {
      // An error here is a PASS: with RLS on and no policy the table is not
      // reachable at all. Zero rows is equally good. Either way A learns nothing.
      const rows = data ?? []
      check('DECK-STORE  an authenticated client reads no deck rows',
        rows.length === 0, error ? `(refused: ${error.message})` : `read ${rows.length} row(s)`)
      check('DECK-STORE  the deck order appears nowhere in what A can read',
        !JSON.stringify(rows).includes(DECK_SECRET))
    }
  }
} catch (e) {
  failures++
  console.log(`FAIL  the check could not run\n        ${e.message}`)
} finally {
  // matches cascade from campaigns, and match_players, match_secrets and
  // match_decks all cascade from matches — so deleting the campaign removes
  // everything. The match is deleted first anyway: if the campaign insert
  // succeeded and something later failed, both still have to go, and a delete
  // of a row that is already gone is not an error.
  if (matchId) {
    const { error } = await admin.from('matches').delete().eq('id', matchId)
    if (error) console.log(`        cleanup failed for match ${matchId}: ${error.message}`)
  }
  if (campaignId) {
    const { error } = await admin.from('campaigns').delete().eq('id', campaignId)
    if (error) {
      console.log(`        cleanup failed for campaign ${campaignId}: ${error.message}`)
      console.log(`        remove it by hand: delete from campaigns where id = '${campaignId}';`)
    }
  }
  // Said out loud, because a silent teardown is indistinguishable from one that
  // never ran, and this script writes to a live project.
  if (matchId || campaignId) console.log(`\n(torn down ${RUN})`)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
