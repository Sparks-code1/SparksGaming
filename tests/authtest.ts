// Optional accounts linked to roster seats.
//
// Accounts are OPTIONAL: nothing here may make an unclaimed seat behave
// differently, and the campaign must play identically with no account at all.
import {
  createRoster, claimRosterSeat, releaseRosterSeat, rosterMemberForUser,
  playerSignatureCount, validateSeats,
} from '@/lib/roster'
import { validateCredentials } from '@/lib/auth'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const ROSTER = createRoster(['Ryan', 'Chris', 'Alice'], 1)
const USER_A = 'auth-aaa', USER_B = 'auth-bbb'

// ─── 1. Claiming a seat ───────────────────────────────────────────────────
console.log('--- claiming a seat ---')
{
  const r = claimRosterSeat(ROSTER, 'p1', USER_A, 'ryan@example.com')
  check('a free seat can be claimed', r.ok, true)
  check('the account is recorded on that member',
    r.roster.find(m => m.id === 'p1')?.userId, USER_A)
  check('the email is kept for display',
    r.roster.find(m => m.id === 'p1')?.userEmail, 'ryan@example.com')
  check('other members are untouched',
    r.roster.filter(m => m.userId).length, 1)
  check('the account resolves back to its member',
    rosterMemberForUser({ roster: r.roster } as any, USER_A)?.name, 'Ryan')
}

// ─── 2. The rules ─────────────────────────────────────────────────────────
console.log('\n--- one account, one seat ---')
{
  const claimed = claimRosterSeat(ROSTER, 'p1', USER_A).roster
  const second = claimRosterSeat(claimed, 'p2', USER_A)
  check('an account cannot hold two seats', second.ok, false)
  check('...and says which seat it already holds',
    second.reason?.includes('Ryan'), true)
  check('the roster is returned unchanged on refusal', second.roster, claimed)
}
{
  const claimed = claimRosterSeat(ROSTER, 'p1', USER_A).roster
  const stolen = claimRosterSeat(claimed, 'p1', USER_B)
  check('a seat held by another account cannot be taken', stolen.ok, false)
  check('...naming the seat', stolen.reason?.includes('Ryan'), true)
  check('the original claim survives',
    stolen.roster.find(m => m.id === 'p1')?.userId, USER_A)
}
{
  const claimed = claimRosterSeat(ROSTER, 'p1', USER_A).roster
  const again = claimRosterSeat(claimed, 'p1', USER_A)
  check('re-claiming your own seat is a no-op, not an error', again.ok, true)
  check('...and changes nothing', again.roster, claimed)
}
check('an unknown player id is refused',
  claimRosterSeat(ROSTER, 'p9', USER_A).ok, false)

// ─── 3. Releasing ─────────────────────────────────────────────────────────
console.log('\n--- releasing a seat ---')
{
  const claimed = claimRosterSeat(ROSTER, 'p2', USER_A).roster
  const freed = releaseRosterSeat(claimed, USER_A)
  check('the seat is released', freed.find(m => m.id === 'p2')?.userId, null)
  check('the account no longer resolves',
    rosterMemberForUser({ roster: freed } as any, USER_A), undefined)
  check('and it can then be claimed by someone else',
    claimRosterSeat(freed, 'p2', USER_B).ok, true)
}

// ─── 4. Accounts must not change how the game plays ───────────────────────
console.log('\n--- accounts are optional ---')
{
  const claimed = claimRosterSeat(ROSTER, 'p1', USER_A, 'ryan@example.com').roster
  const legacyNoAuth = { roster: ROSTER, victoryLog: [
    { gameNumber: 1, winnerName: 'Ryan', winnerPlayerId: 'p1', factionId: 'f' },
    { gameNumber: 2, winnerName: 'Chris', winnerPlayerId: 'p2', factionId: 'g' },
  ] } as any
  const legacyAuthed = { ...legacyNoAuth, roster: claimed }

  check('signatures are identical with and without an account',
    [playerSignatureCount(legacyNoAuth, 'p1'), playerSignatureCount(legacyAuthed, 'p1')], [1, 1])
  check('seating rules are unaffected by claims',
    [validateSeats(legacyNoAuth, ['p1','p2']).ok, validateSeats(legacyAuthed, ['p1','p2']).ok], [true, true])
  check('an unclaimed member is still fully seatable',
    validateSeats(legacyAuthed, ['p2','p3']).ok, true)
  check('claiming does not alter names or ids',
    claimed.map(m => m.id + ':' + m.name), ROSTER.map(m => m.id + ':' + m.name))
  check('members with no account have no userId',
    claimed.filter(m => !m.userId).map(m => m.name), ['Chris', 'Alice'])
}
{
  // A campaign that predates accounts has no userId anywhere and must work.
  const legacy = { roster: ROSTER, victoryLog: [] } as any
  check('no account claimed anywhere resolves to nothing',
    rosterMemberForUser(legacy, USER_A), undefined)
  check('...and a null user id never matches a member',
    rosterMemberForUser({ roster: claimRosterSeat(ROSTER,'p1',USER_A).roster } as any, null), undefined)
}

// ─── 5. Credential validation happens before any round trip ───────────────
console.log('\n--- credential checks ---')
check('empty email is caught', validateCredentials('', 'password1'), 'Enter your email address.')
check('malformed email is caught', validateCredentials('nope', 'password1'), 'That email address is not valid.')
check('short password is caught',
  validateCredentials('a@b.co', '12345'), 'Password must be at least 6 characters.')
check('valid credentials pass', validateCredentials('a@b.co', '123456'), null)
check('surrounding whitespace is tolerated', validateCredentials('  a@b.co  ', '123456'), null)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
