/**
 * The deal writes a split row, and refuses to write a second one.
 *
 * WHAT THIS PROVES. onlineMatch used to write `state: initialState` into the
 * row from the client — every seat's hand on a row the changefeed delivers
 * whole to everybody. It healed on the match's first action, which is to say
 * the hands were public until somebody took a turn. deal-match does that write
 * now, with the service role, through the same apply_match_write the action
 * path uses.
 *
 * The unit suites cannot see this: whether a hand crosses the wire is a fact
 * about a row in a database, not about a function's return value.
 *
 * NEEDS the local stack up AND the functions served:
 *
 *   npx supabase start
 *   npx supabase functions serve            # in another terminal
 *   node scripts/check-deal-split.mjs
 */
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8' })
    .split(/\r?\n/).filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const API = env.API_URL, ANON = env.ANON_KEY, SERVICE = env.SERVICE_ROLE_KEY
if (!/127\.0\.0\.1|localhost/.test(API ?? '')) {
  console.error('local stack only'); process.exit(1)
}

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const admin = createClient(API, SERVICE, { auth: { persistSession: false } })
const PASSWORD = 'deal-check-only'
async function account(email) {
  await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  const c = createClient(API, ANON, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return { client: c, userId: data.user.id, token: data.session.access_token }
}

const host = await account('deal-host@local.test')
const guest = await account('deal-guest@local.test')

/** A board with two seats holding real, distinguishable hands. */
const boardFor = () => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'reinforce', currentPlayerIndex: 0, turnNumber: 1,
  players: [
    { id: 'p1', name: 'Host', factionId: 'khan', cards: ['HOST-CARD-A', 'HOST-CARD-B'], isEliminated: false },
    { id: 'p2', name: 'Guest', factionId: 'balkania', cards: ['GUEST-CARD-A'], isEliminated: false },
  ],
  territories: {}, deck: [], discardPile: [], winnerId: null,
  // THE LEGACY CARD BLOCK is what publicView and decksFromState read —
  // activeCards() looks at legacySnapshot.activeGameCards and nowhere else.
  legacySnapshot: {
    activeGameCards: {
      territoryDeck: ['LEGACY-DECK-1'], resourceDeck: ['LEGACY-COIN-1'],
      playerHands: { p1: ['HOST-CARD-A', 'HOST-CARD-B'], p2: ['GUEST-CARD-A'] },
      playerMissions: {},
    },
  },
  activeHqs: {},
  turn: { placedThisTurn: {}, shieldedTerritoryIds: [] },
  cards: {
    territoryDeck: ['T1', 'T2'], sideboard: [], resourceDeck: ['R1'], territoryDiscard: [],
  },
})

async function deal(who, matchId, state, expectedVersion) {
  const res = await fetch(`${API}/functions/v1/deal-match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${who.token}`,
    },
    body: JSON.stringify({ matchId, state, expectedVersion }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

// A REAL CAMPAIGN ROW, because matches.campaign_id is a foreign key — a random
// uuid is refused at insert, which is the constraint doing its job.
async function campaign() {
  const id = crypto.randomUUID()
  await admin.from('campaigns').insert({
    id, world_name: 'Deal Check',
    legacy_state: { campaignId: id, worldName: 'Deal Check', roster: [] },
  })
  return id
}

async function lobby(owner) {
  const { data, error } = await admin.from('matches')
    .insert({ campaign_id: await campaign(), game_number: 1, status: 'lobby', created_by: owner.userId })
    .select('id, version').single()
  if (error) throw new Error(`could not make a lobby: ${error.message}`)
  await admin.from('match_players').insert([
    { match_id: data.id, seat: 0, player_id: 'p1', user_id: host.userId, name: 'Host', faction_id: 'khan' },
    { match_id: data.id, seat: 1, player_id: 'p2', user_id: guest.userId, name: 'Guest', faction_id: 'balkania' },
  ])
  return data
}

console.log('\n— the deal writes a row with nobody\'s hand on it —')
{
  const m = await lobby(host)
  const res = await deal(host, m.id, boardFor(), m.version)
  check('the host may deal', res.status === 200, JSON.stringify(res.body))

  const { data: row } = await admin.from('matches').select('state, status').eq('id', m.id).single()
  const wire = JSON.stringify(row?.state ?? {})

  // THE ASSERTION THE WHOLE THING IS FOR. Not "cards is absent" — the actual
  // card ids, searched for in the bytes that go over the changefeed.
  check('no hand is on the shared row',
    !wire.includes('HOST-CARD-A') && !wire.includes('GUEST-CARD-A'), wire.slice(0, 160))
  check('...and the counts are there instead',
    row?.state?.players?.every(p => typeof p.cardCount === 'number'), JSON.stringify(row?.state?.players))
  check('the match went active in the same write', row?.status === 'active')

  // AND THE HANDS EXIST, in the rows only their own seat can read. A row with
  // no hands anywhere is not privacy, it is a destroyed deal — and the first
  // action would throw `no secrets for seat` rather than play.
  const { data: secrets } = await admin.from('match_secrets').select('player_id, data').eq('match_id', m.id)
  const byId = Object.fromEntries((secrets ?? []).map(r => [r.player_id, r.data]))
  check('each seat has its own hand in its own row',
    byId.p1?.cards?.includes('HOST-CARD-A') && byId.p2?.cards?.includes('GUEST-CARD-A'),
    JSON.stringify(byId))

  // THE DECKS TOO. Draw order is a secret of the same kind: knowing the next
  // card is knowing everybody's next card.
  check('the legacy deck order is off the shared row',
    !wire.includes('LEGACY-DECK-1'), wire.slice(0, 200))
  {
    const { data: decks } = await admin.from('match_decks')
      .select('deck, cards').eq('match_id', m.id)
    const byDeck = Object.fromEntries((decks ?? []).map(d => [d.deck, d.cards]))
    check('...and is in the deck store instead',
      byDeck.territoryDeck?.includes('LEGACY-DECK-1'), JSON.stringify(byDeck))
  }

  // A SEPARATE GAP, FOUND BY THIS CHECK AND NOT CAUSED BY THE DEAL.
  // GameState.cards — the server card piles — carries territoryDeck, and
  // publicView does not touch it: activeCards() reads legacySnapshot only.
  // So the draw order IS on the shared row for every online match, and has
  // been since the piles moved server-side. leaksDeckOrder has the same
  // blind spot, which is why nothing caught it. Asserted as the CURRENT
  // behaviour so the day it changes, this says so rather than going quiet.
  check('KNOWN GAP: GameState.cards still carries the draw order',
    wire.includes('"T1"'), 'state.cards is projected now — update this check')
}

console.log('\n— and it is dealt exactly once —')
{
  const m = await lobby(host)
  await deal(host, m.id, boardFor(), m.version)
  const again = await deal(host, m.id, boardFor(), m.version)
  check('a second deal is refused', again.status === 409, JSON.stringify(again.body))

  // A RE-DEAL WOULD HAND EVERYONE A FRESH BOARD MID-CAMPAIGN, which is the
  // worst failure available to something that only ever runs at the start.
  const { data: row } = await admin.from('matches').select('state').eq('id', m.id).single()
  check('...and the board it already had is untouched',
    row?.state?.players?.length === 2)
}

console.log('\n— and only by the host —')
{
  const m = await lobby(host)
  const res = await deal(guest, m.id, boardFor(), m.version)
  check('a seated player who is not the host may not deal',
    res.status === 403, JSON.stringify(res.body))

  const { data: row } = await admin.from('matches').select('state, status').eq('id', m.id).single()
  check('...and the lobby is still a lobby', !row?.state && row?.status === 'lobby')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
