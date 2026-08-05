// The campaign roster is settled at CAMPAIGN SETUP, not by the first game.
//
// Everything that identifies a person hangs off it — the name a joiner claims,
// the seat an account links to, and whose turn the server believes it is — and
// all three are needed before a board exists. This suite pins the rules the
// setup form and `createCampaign` both depend on, and the compatibility that
// campaigns created the old way still rely on.
import {
  validateRosterNames, createRoster, claimRosterSeat, addRosterMember,
  hasRoster, validateSeats, unclaimedMembers, nextRosterId,
  MAX_ROSTER, MIN_ROSTER, MAX_ROSTER_NAME, ROSTER_IDS,
} from '@/lib/roster'
import type { RosterMember } from '@/types/legacy'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// ─── 1. What the setup form will accept ───────────────────────────────────
console.log('--- validating the names typed at campaign setup ---')
check('a normal four-player campaign', validateRosterNames(['Ryan', 'Chris', 'Ana', 'Bo']).ok, true)
check('two is the minimum', validateRosterNames(['Ryan', 'Chris']).ok, true)
check('one person is not a campaign', validateRosterNames(['Ryan']).ok, false)
check('five is the maximum', validateRosterNames(['a', 'b', 'c', 'd', 'e']).ok, true)
check('six will not fit the board',
  validateRosterNames(['a', 'b', 'c', 'd', 'e', 'f']).reason, `A campaign holds at most ${MAX_ROSTER} players`)
check('a blank seat is refused', validateRosterNames(['Ryan', '   ']).reason, 'Every player needs a name')

// The rule that matters most years later: a duplicate name makes every
// signature, city claim and naming right on the board ambiguous.
check('duplicate names are refused',
  validateRosterNames(['Chris', 'Chris']).reason, 'Each player needs a different name')
check('duplicates are caught regardless of case',
  validateRosterNames(['Chris', 'CHRIS']).ok, false)
check('and regardless of surrounding space',
  validateRosterNames(['Chris', ' Chris ']).ok, false)
check('a name longer than the cap is refused',
  validateRosterNames(['Ryan', 'x'.repeat(MAX_ROSTER_NAME + 1)]).ok, false)
check('exactly the cap is fine',
  validateRosterNames(['Ryan', 'x'.repeat(MAX_ROSTER_NAME)]).ok, true)

// The setup form and the join-by-code path must agree about legal names, or a
// name one accepts is a name the other refuses to add.
check('setup and join agree that duplicates are illegal',
  addRosterMember(createRoster(['Chris'], 1), 'chris', 1).ok, false)

// ─── 2. The roster a new campaign is created with ─────────────────────────
console.log('\n--- the roster exists before any game ---')
const names = ['Ryan', 'Chris', 'Ana', 'Bo']
const roster = createRoster(names, 1)
check('everyone is on it from game 1', roster.map(m => `${m.id}:${m.name}`),
  ['p1:Ryan', 'p2:Chris', 'p3:Ana', 'p4:Bo'])
check('joined-in-game is 1 for all of them', roster.every(m => m.joinedInGame === 1), true)
check('a campaign created this way is already locked',
  hasRoster({ roster } as any), true)
check('nobody is claimed until an account claims them',
  roster.every(m => !m.userId), true)

// This is the whole point of moving it earlier: game one seats from the roster
// exactly like game seven does, instead of inventing it.
console.log('\n--- game one seats from the roster like any other game ---')
check('a full table is seatable', validateSeats({ roster } as any, ['p1', 'p2', 'p3', 'p4']).ok, true)
check('a smaller game is seatable — sitting out is allowed',
  validateSeats({ roster } as any, ['p1', 'p3']).ok, true)
check('nobody may take two seats',
  validateSeats({ roster } as any, ['p1', 'p1']).reason, 'Each player can only take one seat')
check('a seat may not be filled by someone off the roster',
  validateSeats({ roster } as any, ['p1', 'p9']).reason, 'Seats must be filled from the campaign roster')

// ─── 3. The host links their own seat at creation ─────────────────────────
console.log('\n--- the host claims their own name ---')
{
  const claimed = claimRosterSeat(roster, 'p1', 'user-ryan', 'ryan@example.com')
  check('the host links to the name they picked', claimed.ok, true)
  check('and only that one', claimed.roster.filter(m => m.userId).map(m => m.name), ['Ryan'])
  check('the others are left free for whoever joins',
    unclaimedMembers({ roster: claimed.roster } as any).map(m => m.name), ['Chris', 'Ana', 'Bo'])

  // Without this the host is the one unclaimed seat blocking their own game
  // from going online — the exact thing the argument exists to prevent.
  check('a host claiming a seat that is not there is refused, not ignored',
    claimRosterSeat(roster, 'p9', 'user-ryan').ok, false)
  check('one account cannot hold two names',
    claimRosterSeat(claimed.roster, 'p2', 'user-ryan').reason,
    'This account is already linked to Ryan')
}

// ─── 4. Joining by code claims an unclaimed name ──────────────────────────
console.log('\n--- joining by code ---')
{
  let r: RosterMember[] = claimRosterSeat(roster, 'p1', 'user-ryan', 'ryan@x.com').roster

  const chris = claimRosterSeat(r, 'p2', 'user-chris', 'chris@x.com')
  check('a joiner takes an unclaimed name rather than adding one', chris.ok, true)
  r = chris.roster
  check('the roster did not grow — the name was already there', r.length, 4)
  check('Chris is now linked', r.find(m => m.id === 'p2')?.userEmail, 'chris@x.com')

  check('a name someone else already claimed cannot be taken',
    claimRosterSeat(r, 'p2', 'user-ana').reason, 'Chris is already linked to another account')
  check('re-claiming your own seat is a no-op, not an error',
    claimRosterSeat(r, 'p2', 'user-chris').ok, true)

  // A campaign named for four has one free id; a campaign named for five has
  // none, so a stranger cannot quietly become a sixth player.
  check('a four-name campaign still has room for a late addition', nextRosterId(r), 'p5')
  const full = createRoster(['a', 'b', 'c', 'd', 'e'], 1)
  check('a five-name campaign is full', nextRosterId(full), null)
  check('and refuses a sixth by name',
    addRosterMember(full, 'Frank', 1).reason, `This campaign is full (${MAX_ROSTER} players)`)
}

// ─── 5. Campaigns created the old way still work ──────────────────────────
console.log('\n--- campaigns already in progress are untouched ---')
{
  // Created before this change: the row exists, the roster does not, and the
  // first game is still the thing that names people. That path must survive.
  const old = { roster: [] as RosterMember[], currentGameNumber: 1 } as any
  check('an old campaign is not locked', hasRoster(old), false)
  check('so the first-game naming path is still reachable',
    validateRosterNames(['Ryan', 'Chris']).ok, true)

  const built = createRoster(['Ryan', 'Chris'], old.currentGameNumber)
  check('and produces the same ids it always did', built.map(m => m.id), ['p1', 'p2'])
  check('which is what keeps its existing red stars and cities attached',
    built.map(m => m.id), ROSTER_IDS.slice(0, 2))

  // A campaign mid-way through, already rostered, must not be re-created.
  const running = { roster: createRoster(['Ryan', 'Chris', 'Ana'], 1), currentGameNumber: 7 } as any
  check('a running campaign stays locked', hasRoster(running), true)
  check('and its roster keeps the game it was formed in',
    running.roster.every((m: RosterMember) => m.joinedInGame === 1), true)
}

// ─── 6. The roster can GROW — names are permanent, the size is not ────────
console.log('\n--- adding someone mid-campaign ---')
{
  // The stuck state this exists to fix: one name, claimed, nothing to join as.
  const stuck = createRoster(['Ryan'], 1)
  const stuckClaimed = claimRosterSeat(stuck, 'p1', 'user-ryan', 'r@x.com').roster
  check('a one-name roster is below the minimum a game needs',
    stuckClaimed.length < MIN_ROSTER, true)
  check('and offers a joiner nothing to claim',
    unclaimedMembers({ roster: stuckClaimed } as any).length, 0)
  check('yet it is not full, so the way out is to add someone',
    nextRosterId(stuckClaimed), 'p2')

  const rescued = addRosterMember(stuckClaimed, 'Chris', 4)
  check('adding works on a fully claimed roster', rescued.ok, true)
  check('the new entry is UNCLAIMED — that is the point',
    rescued.roster.find(m => m.id === 'p2')?.userId ?? null, null)
  check('so the join code now has something to hand out',
    unclaimedMembers({ roster: rescued.roster } as any).map(m => m.name), ['Chris'])
  check('and a game can finally be seated', rescued.roster.length >= MIN_ROSTER, true)

  // Arriving at game four is recorded as arriving at game four.
  check('joinedInGame records when they actually arrived',
    rescued.roster.find(m => m.id === 'p2')?.joinedInGame, 4)
  check('the people already there keep their own joinedInGame',
    rescued.roster.find(m => m.id === 'p1')?.joinedInGame, 1)

  // Adding must not disturb anyone's identity — every red star, city claim and
  // signature in the campaign is keyed to these ids.
  check('existing ids are untouched by the addition',
    rescued.roster.map(m => m.id), ['p1', 'p2'])
  check('and existing links survive',
    rescued.roster.find(m => m.id === 'p1')?.userId, 'user-ryan')

  // The rules that still apply to a late arrival.
  check('a late arrival cannot duplicate an existing name',
    addRosterMember(rescued.roster, 'ryan', 4).ok, false)
  check('nor exceed the name length cap',
    addRosterMember(rescued.roster, 'x'.repeat(MAX_ROSTER_NAME + 1), 4).ok, false)
  check('nor be blank', addRosterMember(rescued.roster, '   ', 4).reason, 'Enter a name to join with')

  // Growing stops at the board's limit.
  let grown = rescued.roster
  for (const n of ['Ana', 'Bo', 'Dee']) grown = addRosterMember(grown, n, 4).roster
  check('the roster grows to the maximum', grown.length, MAX_ROSTER)
  check('and refuses the one after that',
    addRosterMember(grown, 'Eve', 4).reason, `This campaign is full (${MAX_ROSTER} players)`)
  check('a full roster reports no room', nextRosterId(grown), null)

  // Seating still works after growing — the added ids are real seats.
  check('a game can seat the late arrival',
    validateSeats({ roster: grown } as any, ['p1', 'p5']).ok, true)
}

// ─── 7. A campaign can never be CREATED in the stuck state ────────────────
console.log('\n--- setup cannot produce a dead campaign ---')
check('one name is refused at setup',
  validateRosterNames(['Ryan']).reason, `A campaign needs at least ${MIN_ROSTER} players`)
check('zero names is refused at setup', validateRosterNames([]).ok, false)
check('the minimum is what a game can actually seat',
  validateSeats({ roster: createRoster(['A', 'B'], 1) } as any, ['p1', 'p2']).ok, true)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
