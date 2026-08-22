// The fixture the live write-path probe uses, run through the REAL reducer.
//
// scripts/check-seat-privacy.mjs can make one genuine apply-action call instead
// of playing a game to get to one, but only if the state it seeds is a state the
// server will accept. If it is not, the call comes back 4xx and the run reports
// something that looks like a privacy result and is actually a bad fixture.
//
// So the fixture is checked here, against the same reducer the server runs —
// the edge function imports a generated copy of this exact module, which is
// what makes "it works locally" mean anything at all.
import { gameReducer, createMathRng } from '@/lib/gameReducer'
import {
  probeState, probeSeed, PROBE_ACTION, PROBE_EXPECTED_PHASE, PROBE_ACTOR,
} from '../scripts/lib/probeFixture.js'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const rng = createMathRng()

// ── the probe does something ───────────────────────────────────────────────
// A no-op would still exercise the write path, but it could not be told apart
// from the server refusing the action: both leave the state as it was.
{
  const before = probeState()
  const { state: after } = gameReducer(before, PROBE_ACTION, rng)
  check('the fixture starts in the phase the probe expects', before.phase, 'reinforce')
  check('the reducer accepts the probe action', after.phase, PROBE_EXPECTED_PHASE)
  check('...which is a visible change, so a no-op cannot be mistaken for success',
    before.phase === after.phase, false)
}

// ── the server's turn gate is satisfied ───────────────────────────────────
// apply-action refuses with 'not-your-turn' unless the caller's seat is
// players[currentPlayerIndex]. The fixture has to put the acting seat there or
// the probe never reaches the reducer at all.
{
  const s = probeState()
  check('the acting seat is the current player',
    s.players[s.currentPlayerIndex].id, PROBE_ACTOR)
  check('...and the action names that same seat',
    (PROBE_ACTION as { playerId?: string }).playerId, PROBE_ACTOR)
}

// ── the board is the whole state ──────────────────────────────────────────
// It carries hands, in both places a hand lives, and draw orders. probeSeed
// derives the public half from it, and a projection needs something to strip:
// with empty hands here, every "the row carries no hand" claim below would be
// true because nothing ever had one. That is exactly the vacuity that let the
// legacy snapshot leak through.
{
  const s = probeState('c', 'mk')
  check('the board carries a hand on each seat', s.players.map(p => p.cards.length), [1, 1])
  check('...and the second copy of them in the legacy snapshot',
    Object.keys((s as unknown as { legacySnapshot: { activeGameCards: { playerHands: object } } })
      .legacySnapshot.activeGameCards.playerHands).sort(), ['p1', 'p2'])
  // The live run's secrets are the script's own tagged pair, seeded into
  // match_secrets. These are only here so the derivation can be tested.
  check('...and none of it is the live check\'s own secret',
    /onlyAmaySeeThis|onlyBmaySeeThis/.test(JSON.stringify(s)), false)
}

// ── it survives a JSON round trip ─────────────────────────────────────────
// It goes into a jsonb column and comes back out before the reducer sees it, so
// anything that does not survive that is not really in the fixture.
{
  const s = probeState()
  const round = JSON.parse(JSON.stringify(s))
  check('the fixture is plain data', JSON.stringify(round), JSON.stringify(s))
  const { state: after } = gameReducer(round, PROBE_ACTION, rng)
  check('...and still works after the round trip', after.phase, PROBE_EXPECTED_PHASE)
}

// ── the two halves of the seed ────────────────────────────────────────────
// The script seeds matches.state and match_decks itself, and getting that shape
// wrong is indistinguishable from the server getting it wrong: the check reads
// back what it wrote. It went wrong twice in one edit — a crash reaching into an
// activeGameCards that was not there, and territoryDeck declared TWICE in one
// literal, emptied first and restored second, the later one winning silently.
//
// Neither was catchable by reading the script's source. Both halves are DERIVED,
// so the text says `boardCards.territoryDeck` and a guard searching it for a
// secret finds nothing. Three sabotages walked straight past that guard. So the
// derivation is RUN here instead.
{
  const MARK = 'probe-mark'
  const { board, publicHalf, decks } = probeSeed('c', MARK)
  const cardsOf = (v: unknown) =>
    (v as { legacySnapshot: { activeGameCards: Record<string, unknown> } })
      .legacySnapshot.activeGameCards

  // THE CONTROL. Everything below asserts an absence, and an absence is free if
  // the board never carried the thing in the first place.
  check('the board carries a real draw order to begin with',
    (cardsOf(board).territoryDeck as string[]).length > 0, true)
  check('...tagged, so a caller can search for its own',
    (cardsOf(board).territoryDeck as string[])[0].includes(MARK), true)

  // THE INVARIANT THAT CATCHES THE DUPLICATE KEY. Every pile handed to the store
  // must be empty in the row. Stated over the store's own keys rather than a
  // list written out here, so a pile that reaches one and not the other fails.
  check('every pile given to the store is empty in the row',
    Object.keys(decks).filter(k => (cardsOf(publicHalf)[k] as string[]).length > 0), [])
  check('...and the store has all four',
    Object.keys(decks).sort(), ['eventDeck', 'missionDeck', 'resourceDeck', 'territoryDeck'])
  check('...holding the real order', decks.territoryDeck, cardsOf(board).territoryDeck)
  check('no deck order survives anywhere in the row',
    JSON.stringify(publicHalf).includes(MARK), false)

  // The row is the public half, so it carries no hand either — and the face-up
  // piles must SURVIVE, or the projection is stripping the wrong things.
  // Both copies, and the control that the board had them.
  check('the board had hands to strip',
    Object.keys(cardsOf(board).playerHands as object).length, 2)
  check('the row carries no hand', cardsOf(publicHalf).playerHands, {})
  check('...nor the legacy missions', cardsOf(publicHalf).playerMissions, {})
  check('...and no cards on the players',
    (publicHalf as unknown as { players: { cards?: string[] }[] }).players.map(p => p.cards),
    [undefined, undefined])
  check('...so no hand survives anywhere in the row',
    JSON.stringify(publicHalf).includes(MARK + '-hand'), false)
  check('the discards survive, because they are face up',
    cardsOf(publicHalf).territoryDiscard, ['tc-face-up'])
  check('...and so does the sideboard', cardsOf(publicHalf).sideboard, ['tc-sideboard'])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
