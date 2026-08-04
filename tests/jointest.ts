import {
  JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH,
  generateJoinCode, normalizeJoinCode, isValidJoinCode, formatJoinCode,
} from '@/lib/joinCode'
import {
  addRosterMember, claimRosterSeat, nextRosterId, unclaimedMembers, createRoster, MAX_ROSTER,
} from '@/lib/roster'
import type { RosterMember } from '@/types/legacy'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

console.log('\n— alphabet —')
{
  check('32 characters', JOIN_CODE_ALPHABET.length === 32, String(JOIN_CODE_ALPHABET.length))
  check('no duplicate characters', new Set(JOIN_CODE_ALPHABET).size === 32)
  for (const ch of ['I', 'L', 'O', 'U']) {
    check(`excludes ${ch}`, !JOIN_CODE_ALPHABET.includes(ch))
  }
  check('keeps 0 and 1 (their look-alikes are excluded)',
    JOIN_CODE_ALPHABET.includes('0') && JOIN_CODE_ALPHABET.includes('1'))
}

console.log('\n— generation —')
{
  const codes = Array.from({ length: 4000 }, () => generateJoinCode())
  check('always 6 characters', codes.every(c => c.length === JOIN_CODE_LENGTH))
  check('always in the alphabet', codes.every(c => [...c].every(ch => JOIN_CODE_ALPHABET.includes(ch))))
  check('always passes its own validator', codes.every(isValidJoinCode))
  check('never emits an excluded letter', !codes.some(c => /[ILOU]/.test(c)))
  const uniq = new Set(codes).size
  check('4000 codes are essentially all distinct', uniq >= 3995, `${uniq} unique`)

  // Every alphabet character should be reachable — a broken index would silently
  // shrink the effective space.
  const seen = new Set(codes.join(''))
  check('every character is reachable', seen.size === 32, `${seen.size}/32 seen`)

  // Rejection sampling must not skew the distribution. With 24000 characters
  // over 32 buckets the expected count is 750; allow a generous ±25%.
  const counts = new Map<string, number>()
  for (const ch of codes.join('')) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  const lo = Math.min(...counts.values()), hi = Math.max(...counts.values())
  check('roughly uniform', lo > 750 * 0.75 && hi < 750 * 1.25, `min=${lo} max=${hi}`)
}

console.log('\n— generation with a stubbed RNG —')
{
  // A byte at or above the rejection limit (256 - 256%32 = 256, so none here)
  // and wrap-around indexing both need to land in the alphabet.
  const all255 = generateJoinCode(n => new Uint8Array(n).fill(255))
  check('byte 255 maps into the alphabet', isValidJoinCode(all255), all255)
  const zeros = generateJoinCode(n => new Uint8Array(n).fill(0))
  check('byte 0 maps to the first character', zeros === '000000', zeros)
}

console.log('\n— normalization —')
{
  check('lower case is accepted', normalizeJoinCode('abc23z') === 'ABC23Z')
  check('dashes are stripped', normalizeJoinCode('ABC-23Z') === 'ABC23Z')
  check('spaces are stripped', normalizeJoinCode(' A B C 2 3 Z ') === 'ABC23Z')
  check('O folds to zero', normalizeJoinCode('OOO234') === '000234')
  check('I folds to one', normalizeJoinCode('III234') === '111234')
  check('l folds to one', normalizeJoinCode('lll234') === '111234')
  check('mixed confusables', normalizeJoinCode('oIl-23Z') === '011' + '23Z')
  check('over-long input is truncated', normalizeJoinCode('ABC23ZEXTRA').length === 6)
  check('U is dropped, not folded', normalizeJoinCode('UABC23') === 'ABC23')
  check('empty stays empty', normalizeJoinCode('') === '')
  check('punctuation only → empty', normalizeJoinCode('---') === '')
  check('is idempotent', normalizeJoinCode(normalizeJoinCode('oIl-23Z')) === normalizeJoinCode('oIl-23Z'))
  // Anything a person types should end up either valid or clearly incomplete —
  // never a 6-char string containing a character the DB check would reject.
  const shapes = ['abc123', 'O0O0O0', 'i-l-1-2-3-4', 'ZZZZZZZZ', 'a b c 1 2 3']
  check('normalized output always satisfies the column constraint',
    shapes.every(s => { const n = normalizeJoinCode(s); return n.length < 6 || /^[0-9A-HJKMNP-TV-Z]{6}$/.test(n) }))
}

console.log('\n— validation & display —')
{
  check('rejects short', !isValidJoinCode('ABC12'))
  check('rejects long', !isValidJoinCode('ABC1234'))
  check('rejects an excluded letter', !isValidJoinCode('ABCIL2'))
  check('accepts a real code', isValidJoinCode('ABC23Z'))
  check('formats in threes', formatJoinCode('ABC23Z') === 'ABC-23Z')
  check('leaves a malformed code alone', formatJoinCode('ABC') === 'ABC')
}

console.log('\n— roster: adding a member —')
{
  const base = createRoster(['Ryan', 'Chris'], 1)
  {
    const r = addRosterMember(base, 'Sam', 3)
    check('appends with the next free seat id', r.ok && r.member?.id === 'p3', JSON.stringify(r.member))
    check('records the game they joined in', r.member?.joinedInGame === 3)
    check('leaves the original roster untouched', base.length === 2)
    check('no account link when none given', r.member?.userId === undefined)
  }
  {
    const r = addRosterMember(base, '  Sam  ', 3)
    check('trims the name', r.member?.name === 'Sam')
  }
  {
    const r = addRosterMember(base, 'chris', 3)
    check('rejects a duplicate name case-insensitively', !r.ok, r.reason)
  }
  {
    const r = addRosterMember(base, '   ', 3)
    check('rejects a blank name', !r.ok)
  }
  {
    const r = addRosterMember(base, 'x'.repeat(25), 3)
    check('rejects an over-long name', !r.ok)
  }
  {
    let roster = createRoster(['A', 'B', 'C', 'D', 'E'], 1)
    check('roster is full at MAX_ROSTER', roster.length === MAX_ROSTER)
    const r = addRosterMember(roster, 'F', 2)
    check('rejects a sixth player', !r.ok, r.reason)
    check('nextRosterId is null when full', nextRosterId(roster) === null)
  }
}

console.log('\n— roster: accounts —')
{
  const base = createRoster(['Ryan', 'Chris'], 1)
  {
    const r = addRosterMember(base, 'Sam', 2, { userId: 'u-sam', userEmail: 's@x.com' })
    check('links the new member to the account', r.member?.userId === 'u-sam')
    check('stores the email for display', r.member?.userEmail === 's@x.com')
  }
  {
    const withSam = addRosterMember(base, 'Sam', 2, { userId: 'u-sam' }).roster
    const again = addRosterMember(withSam, 'Sammy', 2, { userId: 'u-sam' })
    check('an account cannot hold two seats', !again.ok, again.reason)
  }
  {
    // Claiming an existing seat is the other half of the join flow.
    const claimed = claimRosterSeat(base, 'p1', 'u-ryan', 'r@x.com')
    check('claims an unclaimed seat', claimed.ok && claimed.roster[0].userId === 'u-ryan')
    const other = claimRosterSeat(claimed.roster, 'p1', 'u-other')
    check('cannot steal a claimed seat', !other.ok, other.reason)
    const twice = claimRosterSeat(claimed.roster, 'p2', 'u-ryan')
    check('cannot claim a second seat', !twice.ok, twice.reason)
    const idem = claimRosterSeat(claimed.roster, 'p1', 'u-ryan')
    check('re-claiming your own seat is a no-op', idem.ok)
  }
  {
    const roster: RosterMember[] = [
      { id: 'p1', name: 'Ryan', joinedInGame: 1, userId: 'u-ryan' },
      { id: 'p2', name: 'Chris', joinedInGame: 1 },
      { id: 'p3', name: 'Sam', joinedInGame: 1, userId: null },
    ]
    const free = unclaimedMembers({ roster } as never).map(m => m.name)
    check('unclaimed excludes account-linked members', free.join(',') === 'Chris,Sam', free.join(','))
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
