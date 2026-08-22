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
import { probeState, PROBE_ACTION, PROBE_EXPECTED_PHASE, PROBE_ACTOR } from '../scripts/lib/probeFixture.js'

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

// ── the fixture seeds no hands ────────────────────────────────────────────
// It is the PUBLIC half. The hands go to match_secrets and the server merges
// them back. Seeding them here would plant the very leak being tested for,
// which this check has done once already.
{
  const s = probeState()
  check('no seat carries cards in the public fixture',
    s.players.map(p => p.cards.length), [0, 0])
  check('...and nothing in it looks like a secret',
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

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
