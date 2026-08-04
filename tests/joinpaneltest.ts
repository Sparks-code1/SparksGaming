// Joining a campaign by code: every refusal is stated BEFORE the click.
//
// The panel already reported all three failures — the server returns them and
// the error box shows them. The defect was timing: `name` is prefilled from the
// signed-in email during lookup, so on a FULL campaign (where the name field is
// not even rendered) the commit button still read "Join as sparksjohnr" and was
// enabled. You had to commit to be told it was impossible.
import { addRosterMember, nextRosterId, MAX_ROSTER, type RosterMember }
  from '@/lib/roster'
import { normalizeJoinCode, isValidJoinCode, generateJoinCode, JOIN_CODE_LENGTH }
  from '@/lib/joinCode'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const member = (id: string, name: string, userId: string | null = null): RosterMember =>
  ({ id, name, joinedInGame: 1, ...(userId ? { userId, userEmail: null } : {}) }) as RosterMember

/** Mirrors the `blocked` derivation in JoinCampaignPanel. */
function blockedReason(
  roster: RosterMember[],
  user: { id: string } | null,
  seatId: string | null,
): string | null {
  const hasRoom = nextRosterId(roster) !== null
  const canAddNew = hasRoom && (!!user || roster.length === 0)
  const mySeat = user ? roster.find(m => m.userId === user.id) : undefined
  if (mySeat) return `You are already in this campaign as ${mySeat.name}.`
  if (!seatId && !canAddNew) {
    return hasRoom
      ? 'Every name here is taken. Sign in to join as someone new.'
      : `This campaign is full — ${MAX_ROSTER} players is the maximum.`
  }
  return null
}
const commitDisabled = (roster: RosterMember[], user: any, seatId: string | null, name: string) =>
  !!blockedReason(roster, user, seatId) || (!seatId && !name.trim())

const RYAN = { id: 'auth-ryan' }
/** The real campaign: five names, none linked to an account. */
const FULL = ['Ryan', 'Chris', 'Hard', 'Medium', 'East'].map((n, i) => member(`p${i + 1}`, n))

console.log('\n— campaign full —')
{
  // The exact state that shipped: signed in, name prefilled, campaign 5/5.
  check('the reason is stated', blockedReason(FULL, RYAN, null)?.includes('full') === true)
  check('and names the limit', blockedReason(FULL, RYAN, null)?.includes(String(MAX_ROSTER)) === true)
  check('the commit button is disabled', commitDisabled(FULL, RYAN, null, 'sparksjohnr'))
  check('...even though a name is prefilled — that was the bug',
    commitDisabled(FULL, RYAN, null, 'sparksjohnr') && 'sparksjohnr'.trim().length > 0)
  check('the server would have refused it anyway',
    addRosterMember(FULL, 'sparksjohnr', 12, { userId: RYAN.id }).ok === false)
  check('with the same meaning',
    addRosterMember(FULL, 'sparksjohnr', 12, { userId: RYAN.id }).reason?.includes('full') === true)

  // Taking an unclaimed seat in a full campaign is still legal — full means no
  // room for a NEW name, not that nobody may play.
  check('taking an existing unclaimed name is still allowed',
    blockedReason(FULL, RYAN, 'p2') === null)
  check('and the button enables', !commitDisabled(FULL, RYAN, 'p2', ''))
}

console.log('\n— already in this campaign —')
{
  const joined = [member('p1', 'Ryan', RYAN.id), member('p2', 'Chris')]
  const reason = blockedReason(joined, RYAN, null)
  check('it says you are already in', reason?.startsWith('You are already in this campaign') === true, String(reason))
  check('and names the seat you hold', reason?.includes('Ryan') === true)
  check('it outranks "full"', blockedReason(
    [member('p1', 'Ryan', RYAN.id), ...FULL.slice(1)], RYAN, null)?.includes('already in') === true)
  check('a DIFFERENT account is not blocked by it',
    blockedReason(joined, { id: 'auth-chris' }, 'p2') === null)
  check('the server refuses a second seat for one account',
    addRosterMember(joined, 'RyanAgain', 3, { userId: RYAN.id }).ok === false)
  check('...and says which name it already plays as',
    addRosterMember(joined, 'RyanAgain', 3, { userId: RYAN.id }).reason?.includes('Ryan') === true)
}

console.log('\n— every name taken, but seats remain —')
{
  // Three linked accounts, room for a 4th — a GUEST has no account to link, so
  // there is no honest name for them to take.
  const claimed = [member('p1', 'Ryan', 'a1'), member('p2', 'Chris', 'a2'), member('p3', 'Hard', 'a3')]
  const guestReason = blockedReason(claimed, null, null)
  check('a guest is told why', guestReason?.includes('Every name here is taken') === true, String(guestReason))
  check('and told what to do about it', guestReason?.includes('Sign in') === true)
  check('a signed-in newcomer is NOT blocked', blockedReason(claimed, { id: 'a4' }, null) === null)
  check('room really does remain', nextRosterId(claimed) === 'p4')
}

console.log('\n— an empty campaign accepts anyone —')
{
  check('a guest may name themselves first', blockedReason([], null, null) === null)
  check('so may an account', blockedReason([], RYAN, null) === null)
  check('but a blank name still does not commit', commitDisabled([], RYAN, null, '   '))
  check('a real name does', !commitDisabled([], RYAN, null, 'Ryan'))
}

console.log('\n— duplicate names are refused —')
{
  check('the same name twice is refused',
    addRosterMember(FULL.slice(0, 2), 'chris', 3, { userId: 'a9' }).ok === false)
  check('and points at the existing seat',
    addRosterMember(FULL.slice(0, 2), 'chris', 3, { userId: 'a9' }).reason?.includes('already on this roster') === true)
  check('a blank name is refused', addRosterMember([], '   ', 1).ok === false)
  check('an over-long name is refused', addRosterMember([], 'x'.repeat(25), 1).ok === false)
}

console.log('\n— the code itself —')
{
  check('lower case is accepted', normalizeJoinCode('81zeq8') === '81ZEQ8')
  check('spaces and dashes are stripped', normalizeJoinCode(' 81-ze q8 ') === '81ZEQ8')
  check('a six-character code is valid', isValidJoinCode('81ZEQ8'))
  check('a short one is not', !isValidJoinCode('81ZE'))
  check('a long one is not', !isValidJoinCode('81ZEQ88'))
  // Ambiguous glyphs are excluded so a code read aloud cannot be mistyped.
  check('I, L, O and U are not in the alphabet',
    ['I', 'L', 'O', 'U'].every(c => !isValidJoinCode('81ZEQ'.slice(0, 5) + c)))
  // generateJoinCode takes a byte source, not a float source.
  const bytes = (n: number) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256))
  const codes = new Set(Array.from({ length: 500 }, () => generateJoinCode(bytes)))
  check('500 generated codes are all valid', [...codes].every(isValidJoinCode))
  check('and all the right length', [...codes].every(c => c.length === JOIN_CODE_LENGTH))
  check('collisions are rare', codes.size > 495, String(codes.size))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
