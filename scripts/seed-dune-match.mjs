/**
 * A Dune match to point the multi-seat harness at.
 *
 * A MID-GAME POSITION, which is the only thing left for it to be. There is a
 * lobby now, and scripts/seat-dune-lobby.mjs opens a table through it with six
 * signed-in accounts and lets the server deal — so a match that starts at the
 * beginning is that script's job and not this one's. What this still does is
 * drop a match into a phase you cannot reach from setup without playing to it,
 * by writing rows across four tables with the service role. It prints the two
 * lines you need: the URL, and the VITE_DEV_SEATS value ready to paste.
 *
 * IT SEEDS THE CHARITY PHASE by default, because that is the round trip with
 * both halves wired — a window the server opens, an eligibility check only it
 * can make, and a claim that pays from the bank into a hidden purse.
 * --phase=blow gives the spice blow, --phase=bidding the treachery auction,
 * --phase=battle the Battles phase — two contested territories, real hands,
 * and traitors crossed so the beat is testable from the first reveal.
 *
 * THE SPICE IS THE POINT of the charity fixture. Seats are dealt 0, 1, 2, 3, 7
 * and 12, so some are under the threshold and some are over: a table where
 * everyone qualifies proves nothing about a check that is supposed to refuse.
 *
 * WHAT IT DOES NOT DO. It writes a match, not a game — no forces are placed
 * beyond a token stack or two, no treachery is dealt, no storm is rolled. It is
 * scaffolding for exercising one phase end to end, not a setup routine. It said
 * it should be deleted when faction setup existed; setup exists, and what took
 * its place is seat-dune-lobby.mjs. This survives only for the three fixtures —
 * charity, blow, bidding — which begin at positions no opening deal produces.
 * Each one that becomes reachable by playing to it should take its fixture out
 * of here with it.
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
// THE GAME'S OWN LAW, off the same bundles the server runs. Node strips the
// types on import, and the gen files carry no aliases and no runtime deps —
// so the seed cannot disagree with the entry it imitates about who goes
// first or which way the walk runs.
import { stormOrder } from '../supabase/functions/_shared/dunePhase.gen.ts'
import { pendingBattles, nextAggressor } from '../supabase/functions/_shared/duneBattle.gen.ts'
import { readFileSync } from 'node:fs'

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
// RUN was the id of the campaign this script used to mint. It mints none now.
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const PHASES = ['charity', 'blow', 'bidding', 'battle']
const PHASE = PHASES.includes(arg('phase')) ? arg('phase') : 'charity'

// ── sweeping up ─────────────────────────────────────────────────────────────
if (process.argv.includes('--drop')) {
  // MATCHES DIRECTLY, not campaigns. Seeded matches used to hang off a campaign
  // row and cascade from it; they belong to no campaign now, so they are found
  // by what they are — a Dune match whose seats are this script's test accounts.
  //
  // The old campaign rows are swept too, for anybody dropping after upgrading.
  //
  // LOBBIES AS WELL AS ACTIVE MATCHES. scripts/seat-dune-lobby.mjs opens real
  // tables, and --no-start leaves one sitting in the lobby — which this used to
  // walk straight past, so the tables it could not clear were exactly the ones
  // that go on showing up in everybody's list of open games.
  const { data, error } = await admin
    .from('matches').delete().eq('game_type', 'dune').in('status', ['active', 'lobby'])
    .is('campaign_id', null).select('id')
  if (error) { console.error(`could not drop matches: ${error.message}`); process.exit(1) }
  const { data: old } = await admin
    .from('campaigns').delete().like('id', `${TAG}-%`).select('id')
  console.log(`dropped ${data?.length ?? 0} seeded match(es)`
    + `${old?.length ? ` and ${old.length} campaign row(s) from before they stopped being made` : ''}`)
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

/**
 * Hand limits, mirroring factions.ts.
 *
 * COPIED, because this is a plain node script and cannot import the TS data.
 * A small copy, but a copy — if a limit ever changes, the fixture below stops
 * putting a seat exactly AT its limit and quietly stops showing the case it
 * exists to show. The run prints which seat is at its limit so that is visible
 * rather than silent.
 */
const HAND_LIMITS = {
  atreides: 4, fremen: 4, harkonnen: 8, emperor: 4,
  'spacing-guild': 4, 'bene-gesserit': 4,
}

// Under the threshold and over it, so charity has something to refuse.
const CHARITY_SPICE = [0, 1, 2, 3, 7, 12]
/**
 * Purses for the auction, which wants the opposite spread.
 *
 * Charity's fixture is deliberately poor — its whole point is seats the
 * threshold refuses — and a table where nobody holds more than three cannot
 * hold an auction worth watching. These are varied and mostly solvent, with
 * one seat down at 1 so a bid it cannot afford is one keypress away and the
 * refusal path shows without contriving anything.
 */
const BIDDING_SPICE = [12, 8, 5, 20, 1, 15]
const STARTING_SPICE = PHASE === 'bidding' || PHASE === 'battle' ? BIDDING_SPICE : CHARITY_SPICE

/**
 * The battle fixture's hands and traitors, by faction. REAL card ids so the
 * wheel renders real faces, and traitors CROSSED — each names an opposing
 * leader that fixture battles can actually field, so the beat is testable
 * from the first reveal. handCount in the public row is derived from these,
 * never guessed.
 */
const BATTLE_HANDS = {
  atreides: ['crysknife', 'shield'],
  harkonnen: ['chaumas', 'snooper', 'cheaphero'],
  emperor: ['lasgun'],
  fremen: ['shield'],
  'bene-gesserit': [],
  'spacing-guild': ['stunner'],
}
const BATTLE_TRAITORS = {
  atreides: ['Umman Kudu'],
  harkonnen: ['Duncan Idaho'],
}

/** The battle fixture's board, named so the rotation can be computed from
 *  it rather than duplicated beside it. A STRONGHOLD HOLDS AT MOST TWO
 *  factions — the shipping and movement gates enforce it — so the fixture
 *  must not conjure a position play cannot reach: the two-sider sits in
 *  Arrakeen, and the three-sider on the open sand of the Great Flat. */
const BATTLE_FORCES = [
  { faction: 'atreides', territoryId: 'territory-13', sector: 'sector-10', count: 5 },
  { faction: 'harkonnen', territoryId: 'territory-13', sector: 'sector-10', count: 4 },
  { faction: 'emperor', territoryId: 'territory-22', sector: 'sector-15', count: 3, starred: 1 },
  { faction: 'fremen', territoryId: 'territory-22', sector: 'sector-15', count: 6, starred: 2 },
  { faction: 'harkonnen', territoryId: 'territory-22', sector: 'sector-15', count: 2 },
]

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
  handCount: handCountFor(s.faction, i),
  ally: null,
}))

/**
 * How many cards a seat holds.
 *
 * ONE SEAT AT ITS LIMIT in the bidding fixture, and that is the point of it.
 * cardsOnOffer counts only seats UNDER their limit, so a table where everyone
 * has room auctions one card per seat and never shows the case that matters —
 * a seat the auction skips because it cannot hold another card.
 *
 * The SECOND seat is the one filled, whichever faction happens to sit there,
 * so the fixture survives reordering DUNE_SEED_ACCOUNTS.
 */
const handCountFor = (faction, i) => {
  if (PHASE !== 'bidding') return [2, 4, 1, 3, 0, 5][i] ?? 0
  if (i === 1) return HAND_LIMITS[faction] ?? 4
  return [1, 0, 2, 0, 3, 1][i] ?? 0
}

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

/**
 * Every treachery card id, read out of the data the client renders from.
 *
 * PARSED RATHER THAN COPIED. This is a plain node script and cannot import the
 * TS module, and a hand-written list of card ids is a list that goes wrong the
 * first time one is renamed — the auction would then deal a card the client
 * cannot draw, which looks like a rendering fault rather than a stale fixture.
 * Reading the ids keeps one source.
 */
const treacheryIds = () => {
  const src = readFileSync('src/data/dune/treachery.ts', 'utf8')
  const ids = [...src.matchAll(/\bid: '([^']+)'/g)].map(m => m[1])
  if (ids.length < 10) {
    throw new Error(`only found ${ids.length} treachery ids — has the file's shape changed?`)
  }
  return ids
}

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

// NO CAMPAIGN. This used to mint one per run, because matches.campaign_id was
// NOT NULL and a Dune match had to be filed under something. It is nullable now
// — a Dune match is one game rather than game N of a legacy campaign.
//
// WHAT THAT COST, and the reason this is worth a note rather than a quiet
// deletion: those campaign rows were written with `legacy_state: {}`, they
// showed up in RISK'S campaign picker alongside real campaigns, and opening one
// put a state with no `scars` in front of a screen that reads
// `legacy.scars.length`. React unmounts the tree on a render error, so the app
// went white — reported as a hang, because the last frame stays on screen.
//
// Ten of them accumulated, one per seed run. The loader is hardened now (see
// hydrateLegacyState) so nothing can crash that way again; this is the other
// half, which is not creating them in the first place.
//
// Rows from before this change are still there. To clear them:
//   delete from campaigns where id like 'dune-seed-%';
// which cascades to their matches.

const state = PHASE === 'bidding'
  ? {
      // The phase OPEN_BIDDING demands, and a discard the reshuffle can read.
      phase: 'Bidding', turn: 1, mode: 'advanced', storm: 'sector-18',
      treacheryDiscard: [],
      spiceDeck: { remaining: 21, discardA: [], discardB: [] },
      forces: publicForces(seats), spiceOnBoard: { 'territory-07': 8 },
      players: publicPlayers(seats), awaiting: null, shieldWall: 'intact',
    }
  : PHASE === 'blow'
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
  : PHASE === 'battle'
  ? {
      // The Battles phase, mid-fight-ready: a plain two-sider in Arrakeen
      // and a three-sider in Carthag, so the aggressor's choice of opponent
      // is a real one. The battles object is what the phase entry writes —
      // aggressor picking, nothing open.
      phase: 'Battles', turn: 3, mode: 'advanced', storm: 'sector-18',
      treacheryDiscard: [],
      spiceDeck: { remaining: 21, turn: 3, discardA: [], discardB: [] },
      forces: BATTLE_FORCES,
      spiceOnBoard: {},
      players: publicPlayers(seats).map(p => ({
        ...p, handCount: (BATTLE_HANDS[p.faction] ?? []).length,
      })),
      // THE ROTATION IS THE STORM'S, computed by the same walk the phase
      // entry runs — counter-clockwise from the marker — and the first
      // aggressor is the first seat on it with a battle, never seats[0].
      battles: (() => {
        const order = stormOrder('sector-18', publicPlayers(seats))
        const first = nextAggressor(order, pendingBattles(BATTLE_FORCES, 'sector-18'), 0)
        return {
          turn: 3, order, at: first?.at ?? 0,
          current: null, fought: [], usedLeaders: {},
          closesAt: Date.now() + 120_000,
        }
      })(),
      awaiting: stormOrder('sector-18', publicPlayers(seats))[
        nextAggressor(
          stormOrder('sector-18', publicPlayers(seats)),
          pendingBattles(BATTLE_FORCES, 'sector-18'), 0)?.at ?? 0],
      shieldWall: 'intact',
    }
  : {
      phase: 'CHOAM Charity', turn: 1, mode: 'advanced', storm: 'sector-18',
      spiceDeck: { remaining: 21, discardA: [], discardB: [] },
      forces: publicForces(seats), spiceOnBoard: { 'territory-07': 8 },
      players: publicPlayers(seats), awaiting: null, shieldWall: 'intact',
    }

const { data: match, error: mErr } = await admin.from('matches').insert({
  campaign_id: null, game_number: 1, status: 'active', state,
  // WITHOUT THIS THE ROW IS A RISK MATCH. It is seeded 'active', which used to
  // be apply-action's only gate — so a Dune match was one POST away from being
  // handed to the Risk reducer. Both endpoints check this now, and dune-action
  // refuses a row that does not say 'dune'.
  game_type: 'dune',
}).select('id').single()
if (mErr) throw new Error(`seed match: ${mErr.message}`)

await admin.from('match_players').insert(seats.map((s, i) => ({
  match_id: match.id, seat: i, player_id: s.playerId,
  user_id: s.userId, name: s.email.split('@')[0], faction_id: s.faction,
})))
await admin.from('match_secrets').insert(seats.map(s => ({
  match_id: match.id, player_id: s.playerId,
  data: PHASE === 'battle'
    ? {
      cards: BATTLE_HANDS[s.faction] ?? [], spice: s.spice,
      traitors: BATTLE_TRAITORS[s.faction] ?? [],
    }
    : { cards: [], spice: s.spice },
})))

if (PHASE === 'bidding') {
  /**
   * Real card ids, so the cards dealt are cards the client can render.
   *
   * DRAWN BY THE SERVER, not here. OPEN_BIDDING takes them off this pile and
   * parks them under 'auction-lot' where nobody may read them; seeding a lot
   * directly would skip the one step that proves the order is fixed before a
   * bid is made.
   *
   * Enough for several auctions — a pile that runs out mid-run turns a phase
   * into a reshuffle, which is a different thing to be watching.
   */
  await admin.from('match_decks').insert({
    match_id: match.id, deck: 'treachery', cards: treacheryIds(),
  })
} else if (PHASE === 'battle') {
  // THE ECONOMY STAYS CLOSED: the battle fixture deals hands, so the deck
  // holds the printed set MINUS exactly those cards. Dealt without stocking,
  // a later Bidding phase asked the store for cards that did not exist and
  // deadlocked the turn on deck-exhausted.
  const pile = [...treacheryIds()]
  for (const id of Object.values(BATTLE_HANDS).flat()) {
    const i = pile.indexOf(id)
    if (i >= 0) pile.splice(i, 1)
  }
  await admin.from('match_decks').insert({
    match_id: match.id, deck: 'treachery', cards: pile,
  })
} else if (PHASE === 'blow') {
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
console.log(`\nseeded ${PHASE} match ${match.id}  (no campaign — Dune is one game)\n`)
console.log('Put this in .env, then restart the dev server:\n')
console.log(`VITE_DEV_SEATS=${seats.map(s => `${s.faction},${s.playerId},${s.email},<password>`).join(';')}\n`)
console.log('  ...replacing <password> with each account\'s own. They are read by the')
console.log('  browser at dev time only and never committed.\n')
console.log('Then open:\n')
console.log(`  http://localhost:5173/?dune-seats&match=${match.id}\n`)
if (PHASE === 'bidding') {
  const atLimit = seats[1]
  console.log('Seats hold ' + seats.map(s => `${s.faction}:${s.spice}`).join(', ') + ' spice')
  console.log(`${atLimit.faction} is at its hand limit (${HAND_LIMITS[atLimit.faction] ?? 4}),`
    + ' so the auction offers one card fewer and skips that seat.')
  console.log(`${seats.find(x => x.spice <= 2)?.faction ?? 'nobody'} is nearly broke,`
    + ' so a bid it cannot afford shows the refusal path.')
  // PRESCIENCE IS THE ATREIDES', and they are seated first, so it always
  // renders somewhere. The reveal is written by OPEN_BIDDING into that seat's
  // own row — nothing seeds it here, and nothing else can read it.
  console.log('The Atreides see the card up for auction face up; no other seat does.\n')
  console.log('Open the auction from the dev panel, then bid as each seat.\n')
} else if (PHASE === 'charity') {
  console.log('Seats hold ' + seats.map(s => `${s.faction}:${s.spice}`).join(', '))
  console.log('Charity tops up to 2, so the seats above that are the ones it must refuse.\n')
} else {
  console.log('The Fremen seat is ' + (seats.find(s => s.faction === 'fremen')?.playerId ?? 'NOT SEATED')
    + '; the blow pauses for it and nobody else may answer until the window shuts.\n')
}
console.log(`When you are done:  node scripts/seed-dune-match.mjs --drop`)
