import { readFileSync, readdirSync } from 'node:fs'
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

// ── The claim crosses the membership boundary in ONE place ────────────────
//
// campaigns is scoped to its roster: a claimed campaign is readable and
// writable only by the accounts on it. A JOINER IS NOT ON IT YET, which makes
// joining the one operation that must cross that line — so it crosses through
// join_campaign_by_code, SECURITY DEFINER, with the code as the credential,
// rather than through a hole in the policy.
//
// Everything below is a claim about the CLIENT. The policies themselves are
// verified by the migration's own DO block when it is applied.
{
  const api = readFileSync('src/lib/legacyApi.ts', 'utf8')
  const at = api.indexOf('export async function joinCampaign(')
  const fn = at < 0 ? '' : api.slice(at, api.indexOf('\n}', at))

  check('the claim goes through the rpc',
    /supabase\.rpc\('join_campaign_by_code', \{[\s\S]{0,120}p_member_id: joinAs\.playerId/.test(fn))

  // THE WRITE IS WHAT THE POLICIES REFUSE. A saveLegacyState on the claim path
  // is the bug coming back, and it would work for whoever tested it — they are
  // usually already a member.
  const claimHalf = fn.slice(0, fn.indexOf('Adding a name that is not on the roster'))
  check('...and the claim path saves nothing through the table',
    !/saveLegacyState\(/.test(claimHalf))

  // A GUEST WRITES NOTHING EITHER. Taking an unclaimed seat changes no field,
  // and it used to save the blob back unchanged — a write a non-member is
  // refused, for a change that was never there.
  check('a guest taking a seat returns without writing',
    /return \{ legacy: current, playerId: joinAs\.playerId \}/.test(fn))

  // AND IT DOES NOT RE-READ THE ROW. loadLegacyState is a plain select, which
  // a joiner cannot do on a claimed campaign — the lookup already fetched it
  // through the rpc, so it is handed in.
  check('the campaign is handed in rather than re-read',
    !/loadLegacyState\(/.test(fn) && /opts: \{ code: string; current: LegacyState \}/.test(api))

  // THE ROSTER RULES STAY IN TYPESCRIPT. The rpc checks two structural things;
  // who may be on a roster is judged here, where it is tested.
  check('the roster rule still runs before the rpc',
    fn.indexOf('claimRosterSeat(') < fn.indexOf("supabase.rpc('join_campaign_by_code'"))
}

// ── The migration is armed, and says what it costs ────────────────────────
{
  const dir = 'supabase/migrations'
  const files = readdirSync(dir)
  check('the policies are no longer held back',
    files.some(f => f.endsWith('_campaigns_rls.sql'))
      && !files.some(f => f.endsWith('.hold')))

  const sql = readFileSync(
    `${dir}/${files.find(f => f.endsWith('_campaigns_rls.sql'))}`, 'utf8')

  // IT MUST SORT AFTER WHAT WAS ALREADY APPLIED. db push goes in timestamp
  // order and treats a file older than the last applied migration as history —
  // an armed policy that never runs is worse than one still held. That is why
  // it was renumbered from 20260816160000.
  //
  // COMPARED AGAINST THE LAST MIGRATION THAT PREDATES THIS WORK, not against
  // "every other file": a first version asserted it sorted LAST of all, which
  // was true until the join-roster migration landed after it — correctly, and
  // the pin failed for it. A test that breaks when the next migration is added
  // is a test nobody keeps.
  const PREDECESSOR = '20260831120000_dune_seat_key_is_the_account.sql'
  check('the predecessor it was renumbered past is still there',
    files.includes(PREDECESSOR))
  const armed = files.find(f => f.endsWith('_campaigns_rls.sql'))!
  check('...and the policies sort after it, so db push runs them',
    armed > PREDECESSOR, `${armed} vs ${PREDECESSOR}`)

  // THE DELETE FOOTGUN, WRITTEN DOWN. An RLS-refused DELETE returns no error,
  // so the picker's ✕ goes quiet rather than failing. Whoever applies this has
  // to know that before a player reports it.
  // Matched on a phrase that survives the comment's line wrapping — the first
  // version of this pinned "appear to work", which the 80-column reflow had
  // already split across two lines and two `--` prefixes.
  check('the silent delete is called out',
    /matches no rows and returns success/.test(sql))
  check('the service-role readers are audited', /SERVICE ROLE/.test(sql))
}


// ── The delete tells the truth, and is not offered ────────────────────────
//
// An RLS-refused DELETE is not an error: it matches no rows and returns
// success. deleteCampaign checked only `error`, so it reported a deletion that
// had not happened — and the picker's ✕ opened a confirmation, took the press,
// refreshed the list, and left the campaign sitting there. A control that
// appeared to do the one irreversible thing in the app and did nothing.
{
  const api = readFileSync('src/lib/legacyApi.ts', 'utf8')
  const at = api.indexOf('export async function deleteCampaign(')
  const fn = at < 0 ? '' : api.slice(at, api.indexOf('\n}', at))

  check('the delete counts what it removed',
    /delete\(\{ count: 'exact' \}\)/.test(fn))
  check('...and raises when that is nothing',
    /if \(!count\)/.test(fn) && /was not deleted/.test(fn))

  // THE OTHER HALF: nobody may delete, so nobody is offered the press. A
  // button whose only outcome is a refusal is worse than a missing one.
  const picker = readFileSync('src/components/CampaignPicker.tsx', 'utf8')
  check('the picker offers no delete', !/deleteCampaign\(/.test(picker))
  check('...and keeps no dead confirmation behind it',
    !/confirmDelete/.test(picker))
}


// ── Joining as a NEW name crosses the same way ────────────────────────────
//
// saveLegacyState upserts, so adding yourself to a claimed roster passed the
// INSERT check (you are on the new roster) and failed the UPDATE USING (you
// were not on the old one) — reported as "(USING expression)", which reads like
// a broken save rather than the rule it is. It is the ordinary way somebody
// joins a campaign they were sent the code for, so it had to keep working.
{
  const api = readFileSync('src/lib/legacyApi.ts', 'utf8')
  const at = api.indexOf('export async function joinCampaign(')
  const fn = at < 0 ? '' : api.slice(at, api.indexOf('\n}', at))
  const newHalf = fn.slice(fn.indexOf('Adding a name that is not on the roster'))

  check('an account joining goes through the rpc',
    /p_roster: added\.roster/.test(newHalf))

  // THE ROSTER, NOT THE CAMPAIGN. Handing the whole blob would let a joiner
  // overwrite scars, stickers and history on the way in, and clobber whatever
  // landed while they were reading it.
  check('...passing the roster rather than the whole campaign',
    !/p_roster: updated/.test(newHalf) && !/p_roster: current/.test(newHalf))

  // THE RULES ARE STILL IN TYPESCRIPT. addRosterMember owns the cap, the
  // duplicates and the name length, and runs before the call so the joiner
  // gets this project's wording.
  check('the roster rule still runs first',
    newHalf.indexOf('addRosterMember(') < newHalf.indexOf('supabase.rpc('))

  // A GUEST HAS NO ACCOUNT TO PUT ON A SEAT, and an unclaimed campaign is
  // writable by anyone holding its id — so that path stays a plain save.
  check('a guest still joins by saving', /if \(!joinAs\.userId\) \{/.test(newHalf))
}

// ── And a refusal reaches the player in words ─────────────────────────────
//
// "new row violates row-level security policy (USING expression) for table
// campaigns" tells a player nothing they can act on, and reads like a broken
// save rather than a campaign that is not open to them.
{
  const api = readFileSync('src/lib/legacyApi.ts', 'utf8')
  const at = api.indexOf('function claimFailure(')
  const fn = at < 0 ? '' : api.slice(at, api.indexOf('\n}', at))

  // THE GUARD, NOT THE PROSE. A first version matched /row-level security/ and
  // stayed green with the branch gutted — the phrase is in the comment above it
  // explaining why the branch exists. Match the test expression itself.
  check('a row-level refusal is translated',
    /if \(\/row-level security\/i\.test\(message\)\)/.test(fn))
  check('...as are the roster rules the function enforces',
    /if \(\/your seat exactly once\/i\.test\(message\)\)/.test(fn)
      && /if \(\/alters a seat claimed\/i\.test\(message\)\)/.test(fn))

  // THE PANEL SHOWS WHAT IT IS GIVEN. joinCampaign throws these, the panel
  // catches and displays — so translating at the source covers every caller.
  const panel = readFileSync('src/components/JoinCampaignPanel.tsx', 'utf8')
  check('the panel shows the thrown message',
    /setError\(e instanceof Error \? e\.message/.test(panel))
}


console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
