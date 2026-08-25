/**
 * A Dune match to point the multi-seat harness at.
 *
 * There is no Dune lobby yet — nothing in the app creates a match — so driving
 * a turn means seeding one, and seeding one by hand means writing rows across
 * four tables with real auth user ids in them. This does that, and then prints
 * the two lines you actually need: the URL, and the VITE_DEV_SEATS value ready
 * to paste.
 *
 * IT SEEDS THE CHARITY PHASE by default, because that is the round trip with
 * both halves wired — a window the server opens, an eligibility check only it
 * can make, and a claim that pays from the bank into a hidden purse. Pass
 * --phase=blow for the spice blow instead.
 *
 * THE SPICE IS THE POINT of the charity fixture. Seats are dealt 0, 1, 2, 3, 7
 * and 12, so some are under the threshold and some are over: a table where
 * everyone qualifies proves nothing about a check that is supposed to refuse.
 *
 * WHAT IT DOES NOT DO. It writes a match, not a game — no forces are placed
 * beyond a token stack or two, no treachery is dealt, no storm is rolled. It is
 * scaffolding for exercising one phase end to end, not a setup routine. When
 * faction setup exists this should be deleted rather than grown into it.
 *
 * It needs, from the environment:
 *
 *   SUPABASE_URL                 project url
 *   SUPABASE_SERVICE_ROLE_KEY    to write the rows; bypasses RLS
 *   DUNE_SEED_ACCOUNTS           comma-separated emails, one per seat, in the
 *                                order the factions are assigned. Two or more.
 *
 * The accounts must already exist — this creates no users, deliberately. An
 * account is a credential, and a script that makes them is a script that leaves
 * them lying around.
 *
 * Every row is tagged `dune-seed-<runid>` so a run is findable. To sweep up:
 *
 *   delete from campaigns where id like 'dune-seed-%';
 *
 * To run it:
 *
 *   node scripts/seed-dune-match.mjs
 *   node scripts/seed-dune-match.mjs --phase=blow
 *   node scripts/seed-dune-match.mjs --drop            (remove earlier seeds)
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
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

const TAG = 'dune-seed'
const RUN = `${TAG}-${Date.now().toString(36)}`
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const PHASE = arg('phase') === 'blow' ? 'blow' : 'charity'

// ── sweeping up ─────────────────────────────────────────────────────────────
if (process.argv.includes('--drop')) {
  const { data, error } = await admin.from('campaigns').delete().like('id', `${TAG}-%`).select('id')
  if (error) { console.error(`could not drop: ${error.message}`); process.exit(1) }
  console.log(`dropped ${data?.length ?? 0} seeded campaign(s); matches cascade from them`)
  process.exit(0)
}

const emails = need('DUNE_SEED_ACCOUNTS').split(',').map(e => e.trim()).filter(Boolean)
if (emails.length < 2) {
  console.error('DUNE_SEED_ACCOUNTS needs at least two emails — one seat cannot play anybody')
  process.exit(2)
}

/**
 * Which factions get seated, in order.
 *
 * The FREMEN ARE SECOND, so a two-account run still has them at the table —
 * they are the seat the spice blow stops for, and a fixture that leaves them
 * out cannot exercise the pause at all.
 */
const FACTIONS = ['atreides', 'fremen', 'harkonnen', 'emperor', 'spacing-guild', 'bene-gesserit']
if (emails.length > FACTIONS.length) {
  console.error(`at most ${FACTIONS.length} seats; got ${emails.length} accounts`)
  process.exit(2)
}

// Under the threshold and over it, so charity has something to refuse.
const STARTING_SPICE = [0, 1, 2, 3, 7, 12]

/**
 * The seats as the whole table sees them.
 *
 * WITHOUT THIS THE BOARD IS EMPTY. DuneGameScreen builds its seating from
 * state.players — `Object.fromEntries(state.players.map(p => [p.seat, p.faction]))`
 * — and SeatLayer draws a circle for each entry. A match seeded with players:
 * [] therefore renders a board with nobody on it, which reads exactly like the
 * harness using some other board component, and is really just a match that
 * never said who was playing.
 *
 * 'player-position-N' HERE, not 'pN'. This is the printed circle a player sits
 * at — the board coordinate — where player_id is the key their secrets row is
 * filed under. The two live in different columns and mean different things, and
 * the harness wants the second one in VITE_DEV_SEATS.
 */
const publicPlayers = seats => seats.map((s, i) => ({
  faction: s.faction,
  seat: `player-position-${i + 1}`,
  reserves: 10,
  // NOT their spice. handCount is a count because the cards are secret; spice
  // is absent entirely for the same reason, and putting it here would publish
  // every purse to every client.
  //
  // A COUNT WORTH LOOKING AT, though. Seeded at zero the HUD drew a row of
  // noughts for every seat and read as broken rather than as empty, which is
  // the wrong impression for scaffolding whose job is to show the screen
  // working. Varied per seat so the column is legibly per-player.
  handCount: [2, 4, 1, 3, 0, 5][i] ?? 0,
  ally: null,
}))

/**
 * Forces on the board, so the HUD has something to total.
 *
 * The four strongholds are Arrakeen, Carthag, Habbanya Sietch and Sietch Tabr,
 * and strongholdsHeld counts only those — a seed that puts every stack in open
 * sand leaves the stronghold column at zero for everybody and looks exactly
 * like a HUD that cannot count. So the first seats get one each.
 *
 * PUBLIC, all of it: forces are pieces on a board. Nothing here is hidden, and
 * nothing hidden goes here.
 */
const STRONGHOLDS = ['territory-13', 'territory-26', 'territory-38', 'territory-40']
const publicForces = seats => seats.flatMap((s, i) => [
  // One stronghold apiece for as many seats as there are strongholds.
  ...(i < STRONGHOLDS.length
    ? [{ faction: s.faction, territoryId: STRONGHOLDS[i], sector: 'sector-10', count: 3 + i }]
    : []),
  // And a stack in open sand, so forces-on-board is not just the stronghold.
  { faction: s.faction, territoryId: 'territory-07', sector: 'sector-3', count: 2 + i },
])

const userIdFor = async email => {
  // listUsers rather than a lookup by email: the admin API has no by-email get,
  // and these projects have few enough users for one page. Same as the privacy
  // check does it.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!found) throw new Error(`no account for ${email} — create it in the dashboard first`)
  return found.id
}

const seats = []
for (const [i, email] of emails.entries()) {
  seats.push({
    email,
    faction: FACTIONS[i],
    // 'p1'.. — match_players.player_id, which is what a secrets row is keyed by
    // and therefore what VITE_DEV_SEATS must carry. NOT the board position.
    playerId: `p${i + 1}`,
    userId: await userIdFor(email),
    spice: STARTING_SPICE[i],
  })
}

const { error: cErr } = await admin.from('campaigns').insert({
  id: RUN,
  world_name: TAG,
  // NOT NULL with no default, like the privacy check found.
  legacy_state: {},
})
if (cErr) throw new Error(`seed campaign: ${cErr.message}`)

const state = PHASE === 'blow'
  ? {
      phase: 'Spice Blow and Nexus', turn: 2, mode: 'advanced', storm: 'sector-18',
      // A card SHOWING on pile A. A worm drawn over an empty discard throws —
      // 'turn 1 must place a territory card first' — so a blow seeded without
      // one refuses before it can pause. Gara Kulon holds no forces here, so
      // the first worm eats nothing and only the Fremen's placement matters.
      spiceDeck: {
        remaining: 0, turn: 1, discardB: [],
        discardA: [{ kind: 'territory', territoryId: 'territory-30', name: 'Gara Kulon', spice: 6, sector: 'sector-8' }],
      },
      forces: [
        { faction: 'harkonnen', territoryId: 'territory-02', sector: 'sector-3', count: 4 },
        { faction: 'atreides', territoryId: 'territory-09', sector: 'sector-9', count: 2 },
      ],
      spiceOnBoard: { 'territory-02': 6 },
      players: publicPlayers(seats), awaiting: null, shieldWall: 'intact',
    }
  : {
      phase: 'CHOAM Charity', turn: 1, mode: 'advanced', storm: 'sector-18',
      spiceDeck: { remaining: 21, discardA: [], discardB: [] },
      forces: publicForces(seats), spiceOnBoard: { 'territory-07': 8 },
      players: publicPlayers(seats), awaiting: null, shieldWall: 'intact',
    }

const { data: match, error: mErr } = await admin.from('matches').insert({
  campaign_id: RUN, game_number: 1, status: 'active', state,
}).select('id').single()
if (mErr) throw new Error(`seed match: ${mErr.message}`)

await admin.from('match_players').insert(seats.map((s, i) => ({
  match_id: match.id, seat: i, player_id: s.playerId,
  user_id: s.userId, name: s.email.split('@')[0], faction_id: s.faction,
})))
await admin.from('match_secrets').insert(seats.map(s => ({
  match_id: match.id, player_id: s.playerId, data: { cards: [], spice: s.spice },
})))

if (PHASE === 'blow') {
  // Two worms then two territories: pile A turns a worm that eats the showing
  // card, a second that is the Fremen's, and then a territory to land on.
  const worm = { kind: 'shai-hulud' }
  await admin.from('match_decks').insert({
    match_id: match.id, deck: 'spice',
    cards: [
      worm, worm,
      { kind: 'territory', territoryId: 'territory-07', name: 'Cielago North', spice: 8, sector: 'sector-3' },
      { kind: 'territory', territoryId: 'territory-04', name: 'Habbanya Erg', spice: 6, sector: 'sector-5' },
    ],
  })
}

// ── what to do with it ──────────────────────────────────────────────────────
console.log(`\nseeded ${PHASE} match ${match.id}  (campaign ${RUN})\n`)
console.log('Put this in .env, then restart the dev server:\n')
console.log(`VITE_DEV_SEATS=${seats.map(s => `${s.faction},${s.playerId},${s.email},<password>`).join(';')}\n`)
console.log('  ...replacing <password> with each account\'s own. They are read by the')
console.log('  browser at dev time only and never committed.\n')
console.log('Then open:\n')
console.log(`  http://localhost:5173/?dune-seats&match=${match.id}\n`)
if (PHASE === 'charity') {
  console.log('Seats hold ' + seats.map(s => `${s.faction}:${s.spice}`).join(', '))
  console.log('Charity tops up to 2, so the seats above that are the ones it must refuse.\n')
} else {
  console.log('The Fremen seat is ' + (seats.find(s => s.faction === 'fremen')?.playerId ?? 'NOT SEATED')
    + '; the blow pauses for it and nobody else may answer until the window shuts.\n')
}
console.log(`When you are done:  node scripts/seed-dune-match.mjs --drop`)
