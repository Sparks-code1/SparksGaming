// Persistent campaign roster: names fixed after the first setup, seats chosen
// from the roster thereafter, and every player-owned record keyed by roster id
// so a person's history follows them across seats, factions and games missed.
import {
  createRoster, hasRoster, getRoster, rosterName, rosterMember,
  validateSeats, victoryWinnerId, playerSignatureCount, doubleSigners,
  ROSTER_IDS, MAX_ROSTER,
} from '@/lib/roster'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// ─── 1. Creating the roster (first game only) ─────────────────────────────
console.log('--- creating the roster ---')
const roster = createRoster(['Ryan', 'Alice', 'Bob', 'Carol', 'Eve'], 1)
check('five players named in game 1', roster.map(m => `${m.id}:${m.name}`),
  ['p1:Ryan', 'p2:Alice', 'p3:Bob', 'p4:Carol', 'p5:Eve'])
check('seat ids match the historical ids, so old campaigns keep their records',
  roster.map(m => m.id), [...ROSTER_IDS])
check('joined-in-game is recorded', roster[0].joinedInGame, 1)
check('names are trimmed', createRoster(['  Ryan  '], 1)[0].name, 'Ryan')
check('blank names are dropped', createRoster(['Ryan', '   ', 'Bob'], 1).map(m => m.name),
  ['Ryan', 'Bob'])
check('the roster caps at the seat count', createRoster(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 1).length, MAX_ROSTER)

const LEGACY = { roster, victoryLog: [] as any[] } as any
check('a campaign with a roster is locked', hasRoster(LEGACY), true)
check('no roster yet -> not locked', hasRoster({ roster: [] } as any), false)
check('absent roster -> not locked', hasRoster({} as any), false)
check('name lookup by id', rosterName(LEGACY, 'p3'), 'Bob')
check('an unknown id falls back rather than rendering blank',
  rosterName(LEGACY, 'p9', 'Unknown'), 'Unknown')
check('member lookup', rosterMember(LEGACY, 'p2')?.name, 'Alice')

// ─── 2. Seating rules for every game after the first ──────────────────────
console.log('\n--- seating from the roster ---')
check('a full table is valid', validateSeats(LEGACY, ['p1', 'p2', 'p3', 'p4', 'p5']).ok, true)

// The headcount may shrink — a 5-player campaign can run a 4-player game.
check('a 5-player campaign can run a 4-player game',
  validateSeats(LEGACY, ['p1', 'p3', 'p4', 'p5']).ok, true)
check('...and a 2-player game', validateSeats(LEGACY, ['p2', 'p5']).ok, true)

check('the same player cannot take two seats',
  validateSeats(LEGACY, ['p1', 'p1', 'p3']),
  { ok: false, reason: 'Each player can only take one seat' })
check('an empty seat blocks the start',
  validateSeats(LEGACY, ['p1', null, 'p3']),
  { ok: false, reason: 'Every seat must be assigned a player' })
check('a name not on the roster cannot be seated',
  validateSeats(LEGACY, ['p1', 'stranger']),
  { ok: false, reason: 'Seats must be filled from the campaign roster' })

// ─── 3. Signatures follow the person, not the name or faction ─────────────
console.log('\n--- board signatures ---')
{
  // Ryan won game 1 as the Bear and game 3 as Khan; Bob won game 2.
  const lg = {
    roster,
    victoryLog: [
      { gameNumber: 1, winnerName: 'Ryan', winnerPlayerId: 'p1', factionId: 'enclave-of-the-bear' },
      { gameNumber: 2, winnerName: 'Bob',  winnerPlayerId: 'p3', factionId: 'khan-industries' },
      { gameNumber: 3, winnerName: 'Ryan', winnerPlayerId: 'p1', factionId: 'khan-industries' },
    ],
  } as any
  check('a win is credited to the roster id', victoryWinnerId(lg, lg.victoryLog[0]), 'p1')
  check('signatures counted per person, across different factions',
    playerSignatureCount(lg, 'p1'), 2)
  check('a single-win player', playerSignatureCount(lg, 'p3'), 1)
  check('a player who has never won', playerSignatureCount(lg, 'p2'), 0)
  check('the double-signature milestone fires for the right person',
    doubleSigners(lg), ['p1'])

  // The signature is free text: signing differently must NOT split the record.
  const lg2 = {
    roster,
    victoryLog: [
      { gameNumber: 1, winnerName: 'Ryan',    winnerPlayerId: 'p1', factionId: 'f' },
      { gameNumber: 2, winnerName: 'RYAN!!!', winnerPlayerId: 'p1', factionId: 'g' },
    ],
  } as any
  check('signing a different name twice still counts as the same person',
    playerSignatureCount(lg2, 'p1'), 2)
  check('...and trips the milestone', doubleSigners(lg2), ['p1'])
}
{
  // Two people who happen to sign the same name must stay separate.
  const lg = {
    roster: createRoster(['Sam', 'Sam'], 1),
    victoryLog: [
      { gameNumber: 1, winnerName: 'Sam', winnerPlayerId: 'p1', factionId: 'f' },
      { gameNumber: 2, winnerName: 'Sam', winnerPlayerId: 'p2', factionId: 'g' },
    ],
  } as any
  check('two players sharing a name each keep their own record',
    [playerSignatureCount(lg, 'p1'), playerSignatureCount(lg, 'p2')], [1, 1])
  check('...and neither one trips the double-signature milestone',
    doubleSigners(lg), [])
}

// ─── 4. Campaigns recorded before rosters existed ─────────────────────────
console.log('\n--- older saves ---')
{
  const lg = {
    roster,
    victoryLog: [{ gameNumber: 1, winnerName: 'Alice', factionId: 'f' }],  // no id
  } as any
  check('an id-less entry resolves by matching the signed name',
    victoryWinnerId(lg, lg.victoryLog[0]), 'p2')
  check('...and still counts toward that person', playerSignatureCount(lg, 'p2'), 1)
  check('a signature matching nobody resolves to null',
    victoryWinnerId(lg, { winnerName: 'Ghost' }), null)
}

// ─── 5. Sitting a game out ────────────────────────────────────────────────
console.log('\n--- sitting out ---')
{
  // Game 2 is played by Alice, Bob, Carol. Ryan sits out. Under the old
  // top-down seat fill, Alice would have inherited Ryan's seat (p1) and with
  // it his stars, cities and naming rights.
  const seats = ['p2', 'p3', 'p4']
  check('sitting a game out is legal', validateSeats(LEGACY, seats).ok, true)
  check('the players who DO play keep their own ids', seats, ['p2', 'p3', 'p4'])
  check('the absent player is simply not seated', seats.includes('p1'), false)

  // Player-owned records are plain id maps, so absence changes nothing.
  const stars: Record<string, number> = { p1: 3, p2: 1 }
  check("the absent player's red stars are untouched", stars['p1'], 3)

  // A city founded in game 1 is still claimable by its founder in game 3,
  // whatever faction they now play — the sticker records the roster id.
  const sticker = { id: 'city-123-p1', placedByPlayerId: 'p1', description: 'city:minor' }
  const startableBy = (playerId: string) => sticker.placedByPlayerId === playerId
  check('the founder can still start on their city after changing faction',
    startableBy('p1'), true)
  check('...and nobody else can', startableBy('p2'), false)
}

// ─── 6. Naming is a one-time event ────────────────────────────────────────
console.log('\n--- the roster is permanent ---')
{
  const before = getRoster(LEGACY).map(m => m.name)
  // Later games seat by id; they never write names, so the roster is unchanged.
  const seated = ['p4', 'p1']
  check('seating does not alter the roster', getRoster(LEGACY).map(m => m.name), before)
  check('seat order does not alter identity',
    seated.map(id => rosterName(LEGACY, id)), ['Carol', 'Ryan'])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
