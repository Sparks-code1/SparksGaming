/**
 * The devtools check, as a script.
 *
 * Seeds a throwaway match with two seats holding DIFFERENT secrets, connects as
 * one of them, and asserts that nothing belonging to the other is reachable. It
 * reads the wire rather than the app: what a client renders says only what it
 * chose to show, and the question is what crossed the network.
 *
 * WRITTEN TO FAIL FIRST. Run it before the wiring exists and PRIVATE-STATE
 * should be red — that is the leak, reproduced on demand. A check that has never
 * failed has not been shown to catch anything.
 *
 * EVERY ABSENCE CHECK IS PAIRED WITH A CONTROL, and the controls are the reason
 * this script is trustworthy. Looking for a secret in an empty result finds
 * nothing and reports it as though the secret were being kept. The first version
 * of this script did exactly that: it asserted over realtime frames, received
 * none, and passed its three most important checks by searching `[]`. A control
 * that fails makes its dependent check INCONCLUSIVE, which counts as a failure —
 * the one outcome it must never produce is a pass.
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
 * A COMPLETED AUCTION is checked too, at the end. That is where the three
 * stores meet — a card leaves the deck, enters one hand, and spice moves between
 * purses — and every one of those is secret, so the whole event is invisible
 * from outside. It is simulated at the store level rather than by driving the
 * phase: whether the auction picks the right winner is the offline suite's
 * question, and whether its outcome is reachable by the wrong seat is this one's.
 *
 * ATREIDES PRESCIENCE gets its own section, because it is the first power that
 * hands ONE SEAT information nobody else has — every other one moves pieces or
 * spice. The reveal travels on that seat's secrets row; the panel takes it as a
 * prop and cannot fetch a card, so what is checked here is whether the thing
 * handed to that prop was ever anywhere public.
 *
 * SPICE IS CHECKED THE WAY HANDS ARE. It is per-seat and hidden for the same
 * reason and lives in the same rows, so every claim about a hand has one about a
 * purse beside it — including the control that the fixture actually seeded one.
 * A purse nobody seeded is absent from every result, and "B's spice is not here"
 * would be true of a store holding no spice at all.
 *
 * B's password is deliberately not read. The check only needs B to EXIST so a
 * row can be addressed to them; signing in as B would prove nothing that
 * signing in as A does not.
 *
 * WHAT THE SEED PROVES, AND WHAT IT DOES NOT. It writes the SPLIT shape
 * directly with the service role — the public row with counts only, the hands in
 * match_secrets — which is the shape apply-action now writes through publicView.
 * So this exercises the TRANSPORT: the RLS policies, the changefeed, and what a
 * seat can actually reach, given correctly split data.
 *
 * It does NOT prove the server applies publicView, because it never calls the
 * server. It used to seed the hands inline, and PRIVATE-STATE then failed
 * against its own fixture — a hand-written legacy row the server would never
 * produce — which read exactly like the wiring being broken. That publicView is
 * applied on every write is asserted in tests/transportwiringtest.ts against the
 * edge function's source; the end-to-end proof is a turn taken in a real match.
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
 *
 * To leave the match standing and read the row the server wrote by hand:
 *
 *   node scripts/check-seat-privacy.mjs --keep
 *
 * It prints the match id and the queries worth running, including the two
 * separate places a hand lives in that row.
 */
import { createClient } from '@supabase/supabase-js'
import { createChecker } from './lib/controlledCheck.js'
import { diagnoseRealtime } from './lib/diagnoseRealtime.js'
import { probeSeed, PROBE_ACTION } from './lib/probeFixture.js'

const checker = createChecker()

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

// --keep leaves everything standing so the row the SERVER wrote can be read by
// hand. The point of the probe is that row, and a check that tears it down two
// seconds later leaves nothing to look at.
const KEEP = process.argv.includes('--keep')

/**
 * Deep equality, for the checks that compare a structure.
 *
 * controlledCheck takes a BOOLEAN — check(label, ok, detail) — where the test
 * suites take check(label, actual, expected). Writing the second shape here
 * puts the expected value in `detail` and judges the ACTUAL for truthiness,
 * which passes for anything non-empty and fails for 0 and null. Six calls were
 * written that way; two of them reported real failures against a server that
 * was doing exactly the right thing, and four passed no matter what came back.
 *
 * So the comparison is explicit now, and this exists so it can be.
 */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const TAG = 'privacy-check'
// Per-run, because campaigns.id is a TEXT primary key: two runs sharing one id
// would collide, and a crashed run leaves a row somebody has to find by hand.
// Anything matching `privacy-check-%` in campaigns is safe to delete.
const RUN = `${TAG}-${Date.now().toString(36)}`
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// The checker lives in its own module so its BEHAVIOUR can be tested — see
// tests/controlledchecktest.ts. A guard that only reads this file can see that
// a control is passed to checkGiven; it cannot see whether anything looks at it.
const { check, checkGiven } = checker

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
let duneMatchId = null
let campaignId = null
// Set by the diagnosis in section 3; the frame checks are meaningless without it.
let realtimeWorks = false

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
  const DECK_SECRET = `${TAG}-deck-nobodyMaySeeThis`
  // Spice is a NUMBER, so it cannot carry a tagged string the way a hand can.
  // Two values nobody would pick by accident, and different from each other —
  // if A could read B's purse the check has to be able to tell whose it saw.
  const SPICE_A = 1337
  const SPICE_B = 4242

  // matches.campaign_id is NOT NULL and references campaigns(id), so there has
  // to be a campaign before there can be a match. Made fresh rather than
  // borrowed from a real one: this seeds deliberately leaky state and writes
  // into match_secrets, and neither belongs anywhere near a campaign somebody
  // is playing.
  // The public half of the probe board: the fixture with every hand replaced by
  // a count, which is exactly what publicView produces. Written by hand here
  // because this script is plain node and cannot import the TypeScript.
  // Both halves come from probeSeed, which is tested by running it — see
  // probewritepathtest. Built inline, this went wrong twice in one edit, and
  // neither mistake was visible to a guard reading the source: both halves are
  // derived, so the text says `boardCards.territoryDeck` and not a secret.
  const { publicHalf, decks: boardDecks } = probeSeed(RUN, DECK_SECRET)

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
      // THE SPLIT SHAPE — no hand, only counts — which is what apply-action now
      // writes through publicView. See the note at the head of this file about
      // what seeding it directly does and does not prove.
      //
      // It used to seed the hands inline here, and PRIVATE-STATE then failed on
      // its own fixture: a hand-written legacy row that the server would never
      // produce. That failure looked exactly like the wiring being broken.
      //
      // A REAL board rather than two bare players, so the last section can make
      // the server take an actual turn on it. probeState is checked against the
      // real reducer in probewritepathtest.
      state: publicHalf,
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

  // { cards, missionCardId } — the shape hydrateState reads, not a shape of this
  // script's own choosing. It seeded { hand: [...] } before, which no server
  // code has ever looked at: the transport checks passed on it because they only
  // search the payload for a string, and the write-path probe below would have
  // died on the first hand it tried to rebuild.
  const { error: sErr } = await admin.from('match_secrets').insert([
    { match_id: matchId, player_id: 'p1', data: { cards: [SECRET_A], missionCardId: null, legacyHand: [SECRET_A], legacyMission: null, spice: SPICE_A } },
    { match_id: matchId, player_id: 'p2', data: { cards: [SECRET_B], missionCardId: null, legacyHand: [SECRET_B], legacyMission: null, spice: SPICE_B } },
  ])
  if (sErr) throw new Error(`seed match_secrets: ${sErr.message}`)

  // The deck store, if it exists yet. Absent before its migration is applied,
  // which is a red DECK-STORE rather than a crash.
  const { error: dErr } = await admin.from('match_decks')
    .insert(Object.entries(boardDecks).map(([deck, cards]) => ({ match_id: matchId, deck, cards })))
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
    // The control: A's own row must come back. If it does not, A is simply
    // seeing nothing at all and the two checks below would pass for that reason.
    const canReadOwn = !error && rows.some(r => r.player_id === 'p1')
    check('CONTROL  A can read its own secrets row',
      canReadOwn, error?.message ?? `rows=${JSON.stringify(rows)}`)
    checkGiven(canReadOwn, "SECRETS-RLS  A cannot read B's secrets row",
      !rows.some(r => r.player_id === 'p2'),
      `read ${rows.length} row(s): ${JSON.stringify(rows.map(r => r.player_id))}`)
    checkGiven(canReadOwn, "SECRETS-RLS  B's value appears nowhere in what A can read",
      !JSON.stringify(rows).includes(SECRET_B))

    // ── spice, which is a purse rather than a hand ─────────────────────────
    // THE CONTROL FIRST, and it is not a formality: a purse the fixture never
    // seeded is absent from every result, so "B's spice is not here" would be
    // true of a store that held no spice at all. That is exactly how the legacy
    // hands got through — an absence asserted against something never present.
    const own = JSON.stringify(rows.filter(r => r.player_id === 'p1'))
    const sawOwnSpice = own.includes(String(SPICE_A))
    check('CONTROL  A can read its own spice', sawOwnSpice,
      () => `A's row does not hold ${SPICE_A}: ${own.slice(0, 200)}`)
    checkGiven(sawOwnSpice, "SPICE-RLS  B's purse appears nowhere in what A can read",
      !JSON.stringify(rows).includes(String(SPICE_B)),
      "A can read B's spice — the whole of what bidding is built to hide")
  }

  // ── 2. the match row A can simply READ ────────────────────────────────────
  // The most direct form of the question, and the one that depends on nothing
  // but RLS. matches.state is one row shared by every seat, so whatever is in
  // it is readable by all of them — no realtime, no timing, no subscription.
  //
  // This is where PRIVATE-STATE belongs. It was originally asserted only over
  // the socket, which made the most important check in the script the one most
  // easily rendered meaningless.
  {
    const { data, error } = await asA.from('matches').select('state').eq('id', matchId).maybeSingle()
    const stateJson = JSON.stringify(data?.state ?? null)

    // The control cannot be "A's own hand is in the row" any more — under the
    // split it is in nobody's row, which is the point. So it asserts the row is
    // REAL AND PROJECTED instead: both seats present, each with a count. A row
    // that failed to load, or an empty one, contains no secret either and would
    // satisfy everything below for entirely the wrong reason.
    const projected = !error
      && stateJson.includes('"p1"') && stateJson.includes('"p2"')
      && stateJson.includes('cardCount')
    check('CONTROL  A reads the match row and it has the projected shape',
      projected,
      () => error?.message ?? (data
        ? `read the row but it is not the projected shape: ${stateJson.slice(0, 160)}`
        : 'no row returned'))

    checkGiven(projected, "PRIVATE-STATE  B's hand is absent from the match state A can read",
      !stateJson.includes(SECRET_B),
      "B's hand is in the row A reads")
    // The actual rule, which the first claim alone does not state: the shared
    // row carries NOBODY's hand. A projection that kept the reader's own would
    // be right for one seat and wrong for every other seat reading the same
    // bytes, and only this catches that.
    checkGiven(projected, "PRIVATE-STATE  ...and so is A's own — the shared row carries no hand at all",
      !stateJson.includes(SECRET_A),
      "A's own hand is in the shared row, which every other seat receives too")
  }

  // ── 3. why is the socket quiet? ───────────────────────────────────────────
  // A subscribed successfully and then received nothing for ten seconds. Three
  // things produce exactly that, and they are indistinguishable from silence:
  //
  //   SOCKET       the connection never really established
  //   PUBLICATION  matches is not in supabase_realtime, so nothing is emitted
  //   RLS          it is emitted, and the subscriber is not allowed to see it
  //
  // The SERVICE ROLE separates them, because it bypasses RLS entirely. If it
  // receives frames, the socket and the publication are both fine and the cause
  // is RLS — or A's token, which is the same thing seen from the other side,
  // since a socket with no token is evaluated as anon.
  //
  // Worth doing rather than guessing: the publication is asserted by a migration
  // and the browser client receives these frames every day, so the likely answer
  // is the token. "Likely" is not a diagnosis.
  {
    const probe = async (client, label) => {
      const seen = []
      const ch = client
        .channel(`probe-${label}-${matchId}-${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
          p => seen.push(p))
      const status = await new Promise(resolve =>
        ch.subscribe((st, err) => {
          if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(st)) {
            resolve(err ? `${st}: ${err.message}` : st)
          }
        }))
      // SUBSCRIBED can arrive fractionally before the server is routing to it,
      // and an update sent into that gap is simply missed.
      await new Promise(r => setTimeout(r, 750))
      await admin.from('matches').update({ updated_at: new Date().toISOString() }).eq('id', matchId)
      const got = await until(() => seen.length > 0, 8000)
      await client.removeChannel(ch)
      return { status, got, count: seen.length }
    }

    const svc = await probe(admin, 'service')
    const a1 = await probe(asA, 'seat-a')

    // If A heard nothing, hand the socket its token explicitly and ask again.
    // In a browser supabase-js wires auth to realtime for you; under node, with
    // persistSession off and a sign-in that has only just returned, the socket
    // can be up before the token reaches it.
    let a2 = null
    if (!a1.got) {
      const { data: sess } = await asA.auth.getSession()
      const token = sess?.session?.access_token
      if (token) {
        await asA.realtime.setAuth(token)
        a2 = await probe(asA, 'seat-a-authed')
      }
    }

    // The logic lives in scripts/lib/diagnoseRealtime.js and is tested in
    // realtimediagnosistest. It was wrong while it was inline here: it branched
    // on the service probe before looking at A at all, so a probe that missed
    // announced "PUBLICATION — matches is not reaching the changefeed" on a run
    // whose very next lines reported frames arriving for A. Being inline in a
    // script that only runs against a live database is why nothing could see it.
    const d = diagnoseRealtime({ seat: a1, seatAfterAuth: a2, service: svc })
    const diagnosis = d.text
    realtimeWorks = d.working

    console.log(`\nDIAGNOSIS  ${diagnosis}\n`)
    check('CONTROL  A receives realtime frames at all', realtimeWorks, () => diagnosis)

    // The probes disagreeing is worth saying out loud rather than silently
    // resolving in A's favour: A working while the service role does not means
    // the service probe is unreliable, and it is the instrument the other two
    // diagnoses rest on.
    if (a1.got && !svc.got) {
      console.log('        note: A received frames but the service-role probe did not.'
        + ' The diagnosis follows A, which is the observation that matters, but the'
        + ' probe cannot be trusted to distinguish SOCKET from PUBLICATION.')
    }
    // A check on the check, stating exactly the contradiction that was reported:
    // the diagnosis blamed the transport while the checks underneath it watched
    // frames arrive.
    //
    // Not "the diagnosis matches realtimeWorks" — both are computed from the
    // same two probes, so that compares a value with itself and can never fail.
    // This asks the narrower question that can: does it name a broken transport
    // while a frame demonstrably got through?
    const blamesTransport = /^(SOCKET|PUBLICATION|RLS)/.test(diagnosis)
    check('the diagnosis does not blame the transport while frames were arriving',
      !(blamesTransport && realtimeWorks),
      () => `it says "${diagnosis}" while A did receive frames`)
  }

  // ── 4. the realtime frame A receives ──────────────────────────────────────
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
    // Resolve on failure too. Waiting only for SUBSCRIBED means a channel error
    // hangs the script instead of reporting itself.
    const status = await new Promise(resolve =>
      channel.subscribe((st, err) => {
        if (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          resolve(err ? `${st}: ${err.message}` : st)
        }
      }))
    check('CONTROL  A subscribed to the match channel', status === 'SUBSCRIBED', `status=${status}`)

    // Touch BOTH seats. A's own row is touched so there is a frame that SHOULD
    // reach A — without it there is no control for the secrets channel, only an
    // absence that could mean anything.
    await admin.from('match_secrets')
      .update({ data: { cards: [SECRET_A], missionCardId: null, spice: SPICE_A, touched: 1 } })
      .eq('match_id', matchId).eq('player_id', 'p1')
    await admin.from('match_secrets')
      .update({ data: { cards: [SECRET_B], missionCardId: null, spice: SPICE_B, touched: 1 } })
      .eq('match_id', matchId).eq('player_id', 'p2')
    // Split, like the insert. Writing hands here would have put them back on
    // the wire by hand and failed WIRE-STATE for the same wrong reason.
    await admin.from('matches')
      .update({ state: { ...publicHalf, turnNumber: 2 } })
      .eq('id', matchId)

    // Wait for the MATCH frame specifically. "At least one frame" was satisfied
    // by whichever arrived first, and its result was discarded anyway.
    const matchFrames = () => frames.filter(f => f.table === 'matches')
    const arrived = await until(() => matchFrames().length > 0, 10000)

    // The control. Realtime over a websocket in Node is the most fragile part
    // of this script — it can fail on the socket, on the publication, or on RLS
    // for subscribers — and every one of those failures looks like silence.
    // Silence is not evidence that nothing leaked.
    check('CONTROL  a frame for the match reached A', arrived,
      () => realtimeWorks
        ? `realtime works — see the diagnosis above — but no matches frame arrived in 10s (${frames.length} frame(s): ${JSON.stringify(frames.map(f => f.table))})`
        : 'realtime is not delivering to A at all — see the DIAGNOSIS above, which names the cause')

    const wire = JSON.stringify(frames)
    checkGiven(arrived, "WIRE-STATE  B's hand is absent from the match frames A receives",
      !wire.includes(SECRET_B),
      wire.includes(SECRET_B) ? "B's hand crossed the wire to A" : '')
    // Deliberately NOT gated on `arrived`: this one is about match_secrets, and
    // its own control is that A received its own secrets frame. If neither
    // arrived, say so rather than claim B's was kept away.
    const ownSecretFrame = frames.some(f =>
      f.table === 'match_secrets' && JSON.stringify(f.new ?? {}).includes(SECRET_A))
    checkGiven(ownSecretFrame, "SPICE-WIRE  no frame carries B's purse",
      !frames.some(f =>
        f.table === 'match_secrets' && JSON.stringify(f.new ?? {}).includes(String(SPICE_B))),
      "B's spice crossed the wire to A")
    checkGiven(ownSecretFrame, "SECRETS-WIRE  no frame carries B's secrets row",
      !frames.some(f => f.table === 'match_secrets' && JSON.stringify(f.new ?? {}).includes(SECRET_B)),
      `${frames.length} frame(s) seen`)

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
      // The control, on the service role rather than on A: the row has to be
      // THERE for A's inability to see it to mean anything. A missing row reads
      // identical to a well-guarded one.
      const { data: seeded } = await admin.from('match_decks')
        .select('cards').eq('match_id', matchId)
      const rowIsThere = JSON.stringify(seeded ?? []).includes(DECK_SECRET)
      check('CONTROL  the deck row exists and the service role can read it',
        rowIsThere, rowIsThere ? '' : 'nothing was seeded, so nothing being visible proves nothing')

      const rows = data ?? []
      checkGiven(rowIsThere, 'DECK-STORE  an authenticated client reads no deck rows',
        rows.length === 0, error ? `(refused: ${error.message})` : `read ${rows.length} row(s)`)
      checkGiven(rowIsThere, 'DECK-STORE  the deck order appears nowhere in what A can read',
        !JSON.stringify(rows).includes(DECK_SECRET))
    }
  }
  // ── 5. the server's own write ─────────────────────────────────────────────
  // EVERYTHING ABOVE SEEDS THE ROW ITSELF, so none of it can say whether
  // publicView runs. This section makes one real call to apply-action and looks
  // at what the SERVER wrote.
  //
  // It is cheap because END_REINFORCE_PHASE is cheap: on the allow-list, needs
  // no territories or troops, and its whole implementation is "if it is your
  // turn and the phase is reinforce, make it attack". The fixture that satisfies
  // it is checked against the real reducer in probewritepathtest, so a 4xx here
  // means the server, not a bad board.
  //
  // The proof is a squeeze. The row is seeded WITHOUT hands and the hands live
  // in match_secrets, so the server must read them back to run the reducer at
  // all — which means it holds both hands in memory at the moment it writes. If
  // it writes what it holds, they land in the row. If it writes publicView of
  // what it holds, they do not.
  {
    const { data: sess } = await asA.auth.getSession()
    const token = sess?.session?.access_token
    let res = null
    let body = null
    try {
      res = await fetch(`${URL}/functions/v1/apply-action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId, action: PROBE_ACTION }),
      })
      body = await res.json()
    } catch (e) {
      body = { error: String(e) }
    }

    // The control: the server accepted the action and wrote. Without this every
    // claim below is about a row nobody touched, which is the seed again.
    const wrote = !!res && res.ok && typeof body?.version === 'number'
    check('CONTROL  the server accepted one real action and wrote a new version',
      wrote,
      () => `${res ? res.status : 'no response'}: ${JSON.stringify(body).slice(0, 300)}`
        + ' — if this is 404 the function is not deployed; 403 not-your-turn means the fixture drifted')

    const { data: row } = await admin.from('matches').select('state, version').eq('id', matchId).maybeSingle()
    const rowJson = JSON.stringify(row?.state ?? null)

    // A second control: the row is the state the server just computed, not the
    // one seeded. If the phase did not move, the write did not happen and the
    // absence of hands below would be the seed's doing.
    const advanced = row?.state?.phase === 'attack'
    check('CONTROL  the row holds the state the server computed, not the seeded one',
      advanced, () => `phase is ${JSON.stringify(row?.state?.phase)}, expected "attack"`)

    if (wrote) {
      // Printed whatever the verdict, because this is the row the question was
      // about and reading it beats being told about it.
      console.log('\n  the row the server wrote:')
      console.log(`    players       ${JSON.stringify(row?.state?.players)}`)
      console.log(`    legacy hands  ${JSON.stringify(row?.state?.legacySnapshot?.activeGameCards?.playerHands)}\n`)
    }

    const serverWrote = wrote && advanced
    checkGiven(serverWrote, 'SERVER-STRIPS  the row the server wrote carries no hand',
      !rowJson.includes(SECRET_A) && !rowJson.includes(SECRET_B),
      'the server wrote a hand into the shared row — publicView is not being applied')
    // A hand lives in TWO places in this row, and a search of the whole payload
    // above would catch either. This names the second one so a failure says
    // WHICH copy survived, rather than leaving somebody to find out.
    checkGiven(serverWrote, '...including the copy in the legacy snapshot',
      Object.keys(row?.state?.legacySnapshot?.activeGameCards?.playerHands ?? {}).length === 0,
      () => `playerHands still has ${JSON.stringify(row?.state?.legacySnapshot?.activeGameCards?.playerHands)}`)
    checkGiven(serverWrote, '...and the counts survived, so it stripped rather than dropped',
      /cardCount/.test(rowJson), 'no cardCount in the row: the hands went missing rather than being projected')
    // The hands must still EXIST. Stripping them from the row is right; losing
    // them is a different bug that looks identical from the row alone.
    {
      const { data: after } = await admin.from('match_secrets')
        .select('player_id, data').eq('match_id', matchId)
      const kept = JSON.stringify(after ?? [])
      checkGiven(serverWrote, 'SERVER-STRIPS  ...and no purse either',
      !rowJson.includes(String(SPICE_A)) && !rowJson.includes(String(SPICE_B)),
      () => `a spice holding is in the shared row: ${rowJson.slice(0, 200)}`)
    checkGiven(serverWrote, '...and both hands are still in the secrets store',
        kept.includes(SECRET_A) && kept.includes(SECRET_B),
        `match_secrets after the write: ${kept.slice(0, 300)}`)
    }
    // ── the decks ─────────────────────────────────────────────────────────
    // Same squeeze as the hands. The row is seeded with empty piles and the
    // real order lives in match_decks, so the server must read it back to run
    // the reducer — it holds the order at the moment it writes. If it writes
    // what it holds, the order lands in the row.
    checkGiven(serverWrote, 'DECK-ORDER  the row the server wrote carries no draw order',
      !rowJson.includes(DECK_SECRET),
      () => `a deck order is in the shared row: ${rowJson.slice(0, 200)}`)
    checkGiven(serverWrote, '...and the discard is still there, because it is face up',
      rowJson.includes('tc-face-up'),
      'the discard was stripped — it is public by rule and the board reads it')
    {
      const { data: decksAfter } = await admin.from('match_decks')
        .select('deck, cards').eq('match_id', matchId)
      const kept = JSON.stringify(decksAfter ?? [])
      checkGiven(serverWrote, '...and the order is still in the deck store',
        kept.includes(DECK_SECRET), `match_decks after the write: ${kept.slice(0, 300)}`)
      // Stripped, not lost. A server that dropped the pile would also satisfy
      // the first claim, and the game would deal from nothing.
      checkGiven(serverWrote, '...with every pile still present',
        (decksAfter ?? []).length >= 4, `only ${(decksAfter ?? []).length} deck row(s)`)
    }

    // The response is the other copy, and it goes to a known seat, so it may
    // carry that seat's own hand and nobody else's.
    const replyJson = JSON.stringify(body?.state ?? null)
    checkGiven(serverWrote, "SERVER-REPLY  the action response carries A's own hand",
      replyJson.includes(SECRET_A), 'A did not get its own hand back in the response')
    checkGiven(serverWrote, "SERVER-REPLY  ...and not B's purse",
      !replyJson.includes(String(SPICE_B)),
      "B's spice came back in A's action response")
    checkGiven(serverWrote, "SERVER-REPLY  ...and not B's",
      !replyJson.includes(SECRET_B),
      "B's hand came back in A's action response — a private channel is still a channel")
    // Nobody may see a deck, including the seat that just acted. There is no
    // half of a draw pile a player is entitled to.
    checkGiven(serverWrote, 'SERVER-REPLY  ...and no deck order at all',
      !replyJson.includes(DECK_SECRET),
      'the draw order came back in the action response')
  }

  // ── 6. a completed auction ────────────────────────────────────────────────
  // The auction is where the three stores meet: a card comes out of the deck,
  // goes into one hand, and spice moves between purses. Every one of those is
  // secret, so the whole thing is invisible from outside — which is exactly why
  // it is checked rather than played and eyeballed.
  //
  // Simulated at the STORE level rather than by driving the phase. Bidding is
  // fifteen seconds a turn and several round trips; what is being asked here is
  // not whether the auction picks the right winner (that is the offline suite)
  // but whether its OUTCOME, once written, is reachable by the wrong seat.
  {
    const BOUGHT = `${TAG}-card-onlyTheWinnerMaySeeThis`
    const UNSOLD = `${TAG}-card-nobodyBoughtThisOne`
    const LOSER_SPICE = 777

    // A settled auction, written the way the server writes one: the winner's
    // card into their secrets row, the unsold card face up in public state, the
    // deck order untouched in match_decks, and the loser's purse unchanged.
    await admin.from('match_secrets')
      .update({ data: { cards: [SECRET_A, BOUGHT], missionCardId: null, spice: SPICE_A - 3 } })
      .eq('match_id', matchId).eq('player_id', 'p1')
    await admin.from('match_secrets')
      .update({ data: { cards: [SECRET_B], missionCardId: null, spice: LOSER_SPICE } })
      .eq('match_id', matchId).eq('player_id', 'p2')
    await admin.from('matches')
      .update({ state: { ...publicHalf, treacheryDiscard: [UNSOLD] } })
      .eq('id', matchId)

    const { data: row } = await asA.from('matches').select('state').eq('id', matchId).maybeSingle()
    const { data: rows } = await asA.from('match_secrets').select('player_id, data').eq('match_id', matchId)
    const { data: decks } = await asA.from('match_decks').select('deck, cards').eq('match_id', matchId)
    const mine = JSON.stringify((rows ?? []).filter(r => r.player_id === 'p1'))
    const everything = JSON.stringify({ row: row?.state ?? null, rows: rows ?? [], decks: decks ?? [] })

    // THE CONTROL. A won card nobody wrote is absent from everywhere, and every
    // claim below would be true of a match where no auction ever happened.
    const winnerHasIt = mine.includes(BOUGHT)
    check('CONTROL  the winner can read the card they bought', winnerHasIt,
      () => `p1's row does not hold the bought card: ${mine.slice(0, 200)}`)

    checkGiven(winnerHasIt, 'AUCTION-CARD  the card reaches the winner and nobody else',
      !JSON.stringify((rows ?? []).filter(r => r.player_id !== 'p1')).includes(BOUGHT),
      'the bought card is in another seat\'s row')
    checkGiven(winnerHasIt, 'AUCTION-CARD  ...and is not in the shared row either',
      !JSON.stringify(row?.state ?? null).includes(BOUGHT),
      'the bought card is in matches.state, which every client receives')

    // The unsold card IS public — a treachery discard is face up at a table —
    // so this is the one thing here that must be visible. Asserted because
    // stripping it would be the opposite bug, and nothing else would notice.
    checkGiven(winnerHasIt, 'AUCTION-DISCARD  the unsold card is public, being face up',
      JSON.stringify(row?.state ?? null).includes(UNSOLD),
      'the discard was hidden — it is public by rule and the board reads it')

    // The deck the cards came out of is still nobody's to see.
    checkGiven(winnerHasIt, 'AUCTION-DECK  the draw order stays hidden through it all',
      !everything.includes(DECK_SECRET),
      'the deck order is reachable after an auction')

    // The losing bidder's purse is untouched AND unreadable. Two different
    // claims: bidding must not charge somebody who lost, and A must not learn
    // what B has whether it changed or not.
    const { data: asAdmin } = await admin.from('match_secrets')
      .select('player_id, data').eq('match_id', matchId)
    const loser = (asAdmin ?? []).find(r => r.player_id === 'p2')
    check('CONTROL  the loser\'s purse was written', (loser?.data ?? {}).spice === LOSER_SPICE,
      () => `p2 holds ${JSON.stringify((loser?.data ?? {}).spice)}, expected ${LOSER_SPICE}`)
    checkGiven(winnerHasIt, "AUCTION-SPICE  the loser's purse is not readable by the winner",
      !JSON.stringify(rows ?? []).includes(String(LOSER_SPICE)),
      "A can read the losing bidder's spice")
  }

  // ── 7. an auction, run for real ───────────────────────────────────────────
  // OPEN_BIDDING and BID had never executed. Every claim about them rested on
  // the modules they delegate to, which are well covered — and on the glue,
  // which was not covered at all and turned out to hold two faults: the match
  // row was selected without the columns the reshuffle seeds from, and a SEAT
  // id was handed to an auction keyed by FACTION, so every bid would have been
  // refused as not-your-turn forever. Neither is visible from any test that
  // does not make the call.
  //
  // A SECOND MATCH, because Dune's state is a different shape from Risk's and
  // the probe above needs a Risk board. Same campaign, so the same teardown
  // takes it.
  //
  // ONE ELIGIBLE BIDDER, because only seat A's password is read here. With the
  // Harkonnen at their eight-card limit the auction offers one card, the
  // Atreides open it, and their bid wins with nobody left to raise — a whole
  // auction in two calls, both of them A's. It exercises the hand limit live as
  // well, and leaves B as a seat whose purse must come out untouched.
  {
    const CARD_ON_OFFER = `${TAG}-lot-onlyTheWinnerMaySeeThis`
    const CARD_UNDRAWN = `${TAG}-lot-stillInTheDeck`
    const B_SPICE = 909

    const { data: dm, error: dmErr } = await admin.from('matches').insert({
      campaign_id: campaignId,
      game_number: 2,
      status: 'active',
      // Dune's shape, and the phase the action demands.
      state: { phase: 'Bidding', turn: 1, treacheryDiscard: [] },
    }).select('id').single()
    if (dmErr) throw new Error(`seed dune match: ${dmErr.message}`)
    duneMatchId = dm.id

    // Dune factions, not Risk ones: the auction, the hand limits and the
    // Emperor's redirect are all keyed by these.
    await admin.from('match_players').insert([
      { match_id: duneMatchId, seat: 0, player_id: 'p1', user_id: userA, name: `${TAG}-A`, faction_id: 'atreides' },
      { match_id: duneMatchId, seat: 1, player_id: 'p2', user_id: userB, name: `${TAG}-B`, faction_id: 'harkonnen' },
    ])
    await admin.from('match_secrets').insert([
      { match_id: duneMatchId, player_id: 'p1', data: { cards: [], spice: 20 } },
      { match_id: duneMatchId, player_id: 'p2', data: { cards: [], spice: B_SPICE } },
    ])
    await admin.from('match_decks').insert({
      match_id: duneMatchId, deck: 'treachery', cards: [CARD_ON_OFFER, CARD_UNDRAWN],
    })

    const { data: sess2 } = await asA.auth.getSession()
    const token2 = sess2?.session?.access_token
    const call = async (action) => {
      const res = await fetch(`${URL}/functions/v1/dune-action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token2}`,
          apikey: ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId: duneMatchId, action }),
      })
      return { status: res.status, body: await res.json().catch(() => ({})) }
    }

    // The Harkonnen sit at eight cards, so only one card is offered and the
    // Atreides open it.
    const opened = await call({
      type: 'OPEN_BIDDING',
      order: ['atreides', 'harkonnen'],
      hands: { atreides: 0, harkonnen: 8 },
      limits: { atreides: 4, harkonnen: 8 },
    })
    const auctionOpened = opened.status === 200 && !!opened.body?.auction
    check('CONTROL  OPEN_BIDDING ran', auctionOpened,
      () => `${opened.status}: ${JSON.stringify(opened.body).slice(0, 300)}`
        + ' — 404 means dune-action is not deployed')
    checkGiven(auctionOpened, 'BIDDING  one card is offered, the other seat being full',
      opened.body?.auction?.carry?.cardCount === 1,
      () => `cardCount was ${JSON.stringify(opened.body?.auction?.carry?.cardCount)}`)
    checkGiven(auctionOpened, '...and the eligible seat opens it',
      opened.body?.auction?.carry?.toAct === 'atreides',
      () => `the opener is ${JSON.stringify(opened.body?.auction?.carry?.toAct)}`)
    // THE CARD IS NOT IN THE PUBLIC STEP. The auction is card-blind, and this is
    // where that stops being a claim about a module and becomes one about the
    // bytes a client receives.
    checkGiven(auctionOpened, 'BIDDING  the open auction names no card',
      !JSON.stringify(opened.body).includes(CARD_ON_OFFER),
      'the card up for auction is in the response every client will see')

    const bid = await call({ type: 'BID', bid: { kind: 'bid', spice: 3 } })
    const bidTaken = bid.status === 200 && Array.isArray(bid.body?.awards)
    check('CONTROL  BID ran and settled the auction', bidTaken,
      () => `${bid.status}: ${JSON.stringify(bid.body).slice(0, 300)}`
        + ' — not-your-turn here means the seat/faction mapping is wrong again')
    checkGiven(bidTaken, 'BIDDING  the bidder won at their own price',
      same(bid.body?.awards, [{ index: 0, winner: 'atreides', price: 3 }]),
      () => `the awards were ${JSON.stringify(bid.body?.awards)}`)
    checkGiven(bidTaken, '...and the response names no card either',
      !JSON.stringify(bid.body).includes(CARD_ON_OFFER),
      'the won card came back in the response')

    // ── what the server actually wrote ──────────────────────────────────────
    const { data: rows2 } = await admin.from('match_secrets')
      .select('player_id, data').eq('match_id', duneMatchId)
    const p1 = (rows2 ?? []).find(r => r.player_id === 'p1')?.data ?? {}
    const p2 = (rows2 ?? []).find(r => r.player_id === 'p2')?.data ?? {}

    const dealt = JSON.stringify(p1).includes(CARD_ON_OFFER)
    check('CONTROL  the winner\'s row holds the card the server dealt', dealt,
      () => `p1: ${JSON.stringify(p1).slice(0, 200)}`)
    checkGiven(dealt, 'AUCTION-LIVE  the card is in no other seat\'s row',
      !JSON.stringify(p2).includes(CARD_ON_OFFER))
    checkGiven(dealt, 'AUCTION-LIVE  ...and the winner paid for it',
      p1.spice === 17,
      () => `the winner holds ${JSON.stringify(p1.spice)}, expected 20 less the bid of 3`)
    // The card and the payment landed in the same write, which is the invariant
    // the whole settlement exists for. Both being right is the evidence.
    checkGiven(dealt, 'AUCTION-LIVE  ...so no card arrived without its payment',
      dealt && p1.spice === 17, true)
    checkGiven(dealt, 'AUCTION-LIVE  the seat that did not bid is untouched',
      p2.spice === B_SPICE,
      () => `the non-bidder holds ${JSON.stringify(p2.spice)}, expected ${B_SPICE}`)

    // The rest of the deck stays where nobody can read it, and A cannot.
    const { data: asAdminDecks } = await admin.from('match_decks')
      .select('deck, cards').eq('match_id', duneMatchId)
    const undrawnKept = JSON.stringify(asAdminDecks ?? []).includes(CARD_UNDRAWN)
    check('CONTROL  the undrawn card is still in the deck store', undrawnKept,
      () => `decks: ${JSON.stringify(asAdminDecks ?? []).slice(0, 200)}`)
    const { data: seenByA } = await asA.from('match_decks')
      .select('deck, cards').eq('match_id', duneMatchId)
    checkGiven(undrawnKept, 'AUCTION-LIVE  the deck order is still unreadable',
      !JSON.stringify(seenByA ?? []).includes(CARD_UNDRAWN),
      'A can read the deck after an auction')
    // The lot is emptied by the same write that dealt it, so a retry cannot
    // deal the same card twice.
    checkGiven(dealt, 'AUCTION-LIVE  the lot is emptied once dealt',
      ((asAdminDecks ?? []).find(d => d.deck === 'auction-lot')?.cards ?? []).length === 0,
      () => `the lot still holds ${JSON.stringify((asAdminDecks ?? []).find(d => d.deck === 'auction-lot')?.cards)}`)

    // ── Atreides prescience ─────────────────────────────────────────────────
    // The one thing in this phase that shows a card to a player before it is
    // won, and the only faction power so far that hands ONE SEAT information
    // nobody else gets. Every other power moves pieces or spice.
    //
    // It travels on that seat's secrets row and nowhere else. The panel takes
    // it as a prop and cannot fetch a card, so the whole question is whether
    // the thing handed to that prop ever existed anywhere public.
    {
      const PRESCIENT = `${TAG}-prescience-onlyAtreidesMaySeeThis`
      // Written the way the server would: into the entitled seat's own row,
      // beside their hand and their spice.
      await admin.from('match_secrets')
        .update({ data: { ...( (rows2 ?? []).find(r => r.player_id === 'p1')?.data ?? {} ), prescience: PRESCIENT } })
        .eq('match_id', duneMatchId).eq('player_id', 'p1')

      const { data: seatRows } = await asA.from('match_secrets')
        .select('player_id, data').eq('match_id', duneMatchId)
      const own = JSON.stringify((seatRows ?? []).filter(r => r.player_id === 'p1'))

      // THE CONTROL. A reveal nobody wrote is absent from everywhere, and every
      // claim below would hold for a match where prescience never happened.
      const sees = own.includes(PRESCIENT)
      check('CONTROL  the entitled seat can read its own reveal', sees,
        () => `p1's row does not hold the reveal: ${own.slice(0, 200)}`)

      checkGiven(sees, 'PRESCIENCE  it reaches no other seat',
        !JSON.stringify((seatRows ?? []).filter(r => r.player_id !== 'p1')).includes(PRESCIENT),
        'the reveal is in another seat\'s row')

      const { data: pubRow } = await asA.from('matches')
        .select('state').eq('id', duneMatchId).maybeSingle()
      checkGiven(sees, 'PRESCIENCE  ...and is in no shared state at all',
        !JSON.stringify(pubRow?.state ?? null).includes(PRESCIENT),
        'the reveal is in matches.state, which the changefeed delivers to everyone')

      // The auction's own public step is the thing most likely to be reached
      // for, since it is where the rest of the card's context lives.
      checkGiven(sees, 'PRESCIENCE  ...least of all in the auction step',
        !JSON.stringify((pubRow?.state ?? {}).auction ?? null).includes(PRESCIENT),
        'the reveal rode along on the auction state')
    }

    const { data: after } = await asA.from('matches')
      .select('state').eq('id', duneMatchId).maybeSingle()
    checkGiven(dealt, 'AUCTION-LIVE  the public row carries no card',
      !JSON.stringify(after?.state ?? null).includes(CARD_ON_OFFER),
      'the won card is in matches.state, which every client receives')
    checkGiven(dealt, '...and the auction is closed out of it',
      (after?.state?.auction ?? null) === null,
      () => `state.auction is ${JSON.stringify(after?.state?.auction)}`)
  }

} catch (e) {
  // Through the checker, so a crash counts as a failure the same way a leak
  // does. A script that dies mid-way must never exit 0.
  check('the check could not run', false, e.message)
} finally {
  // matches cascade from campaigns, and match_players, match_secrets and
  // match_decks all cascade from matches — so deleting the campaign removes
  // everything. The match is deleted first anyway: if the campaign insert
  // succeeded and something later failed, both still have to go, and a delete
  // of a row that is already gone is not an error.
  if (KEEP) {
    console.log(`\nKEPT — nothing was torn down. The match is ${matchId}\n`)
    console.log('  The row the server wrote, and whether anything of a hand is in it:')
    console.log(`    select state from matches where id = '${matchId}';`)
    console.log('  Both places a hand lives, so a strip of one and not the other shows up:')
    console.log(`    select state->'players' as players,`)
    console.log(`           state->'legacySnapshot'->'activeGameCards'->'playerHands' as legacy_hands`)
    console.log(`      from matches where id = '${matchId}';`)
    console.log('  Where the hands are supposed to be:')
    console.log(`    select player_id, data from match_secrets where match_id = '${matchId}';`)
    console.log('  And when you are done:')
    console.log(`    delete from campaigns where id = '${campaignId}';`)
  } else {
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
    // Said out loud, because a silent teardown is indistinguishable from one
    // that never ran, and this script writes to a live project.
    if (matchId || campaignId) console.log(`\n(torn down ${RUN})`)
  }
}

const failures = checker.failures
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
