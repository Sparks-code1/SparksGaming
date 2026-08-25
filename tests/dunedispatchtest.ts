// Posting a Dune action, and who the server thinks is posting it.
//
// Dune has no local mode: every action goes to dune-action, because the server
// is the only party that can see hidden state. So the interesting question is
// not whether the request is sent, it is WHOSE it is — and the answer has to be
// "the session's", in exactly one place, with nothing in the payload competing
// to say otherwise.
//
// That matters more here than it would elsewhere. The multi-seat harness holds
// six authenticated clients in one page. Every tempting shortcut for letting it
// act as each seat — an actAs field, a seat id in the body, one privileged
// session — moves the acting seat out of the token and into data the caller
// controls, in code that ships. The client-as-a-parameter design is what avoids
// that, and these checks are about it staying that way.
import { readFileSync } from 'node:fs'
import { dispatchDuneAction } from '@/lib/dune/duneDispatch'
import type { SupabaseClient } from '@supabase/supabase-js'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** A client that reports one seat's session, and nothing else. */
const clientFor = (token: string | null): SupabaseClient =>
  ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } }) as unknown as SupabaseClient

interface Sent { url: string; init: RequestInit }
const recorder = (status = 200, body: unknown = { ok: true }) => {
  const sent: Sent[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return {
      ok: status < 400,
      status,
      json: async () => body,
    } as unknown as Response
  }) as unknown as typeof fetch
  return { sent, fetchImpl }
}
const bodyOf = (s: Sent) => JSON.parse(String(s.init.body))

// ── the acting seat is the session, and only the session ──────────────────
{
  const { sent, fetchImpl } = recorder()
  const res = await dispatchDuneAction('match-1', { type: 'CLAIM_CHARITY' },
    { client: clientFor('token-for-p3'), fetchImpl })

  check('the action reaches dune-action', sent.length, 1)
  check('...at that endpoint and no other',
    sent[0].url.endsWith('/functions/v1/dune-action'), true)
  check('...as a POST', sent[0].init.method, 'POST')
  check('...bearing THIS client\'s token',
    (sent[0].init.headers as Record<string, string>).Authorization, 'Bearer token-for-p3')
  check('...and it succeeded', res.ok, true)

  // THE PAYLOAD NAMES NO SEAT. The server derives it from the token; a seat in
  // the body would be a second source of truth for the one fact the whole
  // hidden-state design rests on, and it would be supplied by the party whose
  // identity is in question.
  const body = bodyOf(sent[0])
  check('the body carries the match and the action', Object.keys(body).sort(), ['action', 'matchId'])
  check('...and names no seat anywhere in it',
    /\b(p[1-6]|actAs|asSeat|playerId|userId|impersonate)\b/.test(JSON.stringify(body)), false)
}

// ── a different seat means a different client, not a different field ──────
// This is the harness's whole mechanism: same code, same payload, different
// session. If acting as another seat required anything else, that thing would
// be a way to act as another seat — which is the property being avoided.
{
  const { sent, fetchImpl } = recorder()
  for (const token of ['token-a', 'token-b']) {
    await dispatchDuneAction('match-1', { type: 'OPEN_CHARITY' }, { client: clientFor(token), fetchImpl })
  }
  check('two seats send two requests', sent.length, 2)
  check('...distinguished only by the token', [
    (sent[0].init.headers as Record<string, string>).Authorization,
    (sent[1].init.headers as Record<string, string>).Authorization,
  ], ['Bearer token-a', 'Bearer token-b'])
  check('...with byte-identical bodies',
    String(sent[0].init.body) === String(sent[1].init.body), true)
}

// ── an impersonation field is refused at the caller ───────────────────────
// The server ignores these already, so this changes no outcome on the wire. It
// exists because a caller that sets one has misunderstood the model, and the
// useful moment to find that out is at the mistake rather than three hundred
// miles away where the field is silently dropped.
{
  for (const field of ['actAs', 'asSeat', 'impersonate', 'onBehalfOf', 'playerId', 'userId']) {
    const { sent, fetchImpl } = recorder()
    let threw = false
    try {
      await dispatchDuneAction('m', { type: 'CLAIM_CHARITY', [field]: 'p2' },
        { client: clientFor('t'), fetchImpl })
    } catch { threw = true }
    check(`${field} in the payload is refused`, threw, true)
    check(`...and nothing was sent`, sent.length, 0)
  }

  // A CONTROL. OPEN_BIDDING legitimately carries a bidding ORDER of seats —
  // that is about the auction, not about who is asking — so the rule must not
  // be "no seat-shaped string may appear in a payload".
  const { sent, fetchImpl } = recorder()
  const res = await dispatchDuneAction('m', { type: 'OPEN_BIDDING', order: ['atreides', 'harkonnen'] },
    { client: clientFor('t'), fetchImpl })
  check('an auction order is not impersonation', res.ok, true)
  check('...and goes out intact', bodyOf(sent[0]).action.order, ['atreides', 'harkonnen'])
}

// ── refusals are outcomes, not exceptions ─────────────────────────────────
// "already claimed", "not eligible", "the window has closed" are all things the
// server is supposed to say. A helper that threw on them would push every
// caller into a try/catch to handle the normal course of a game.
{
  const { fetchImpl } = recorder(409, { error: 'not eligible for charity', code: 'not-eligible' })
  const res = await dispatchDuneAction('m', { type: 'CLAIM_CHARITY' }, { client: clientFor('t'), fetchImpl })
  check('a refusal comes back as a result', res.ok, false)
  check('...carrying the server\'s own code', res.error?.code, 'not-eligible')
  check('...and its message', res.error?.message, 'not eligible for charity')

  // An unknown code passes through rather than being flattened into something
  // familiar — the caller can at least show it.
  const odd = recorder(409, { error: 'nope', code: 'a-code-from-the-future' })
  const res2 = await dispatchDuneAction('m', { type: 'X' }, { client: clientFor('t'), fetchImpl: odd.fetchImpl })
  check('an unrecognised code is not flattened', res2.error?.code, 'a-code-from-the-future')
}

// ── nothing is attempted without a session ────────────────────────────────
{
  const { sent, fetchImpl } = recorder()
  const res = await dispatchDuneAction('m', { type: 'OPEN_CHARITY' }, { client: clientFor(null), fetchImpl })
  check('a signed-out client sends nothing', sent.length, 0)
  check('...and says so', res.error?.code, 'unauthenticated')
}

// ── a network failure advances nothing ────────────────────────────────────
// The action may or may not have been applied. A client that guesses either way
// desyncs the match, which is the rule lib/actionDispatch already follows.
{
  const fetchImpl = (async () => { throw new Error('offline') }) as unknown as typeof fetch
  const res = await dispatchDuneAction('m', { type: 'OPEN_CHARITY' }, { client: clientFor('t'), fetchImpl })
  check('a network failure is a refusal, not a throw', res.ok, false)
  check('...marked as such', res.error?.code, 'network')
}

// ── the charity panel actually uses it ────────────────────────────────────
// The helper existing is not the same as the panel calling it, and a panel that
// still simulated everything would leave the round trip untested in the one
// place a person can press it.
{
  const panel = readFileSync('src/components/dune/CharityPanel.tsx', 'utf8')
  check('the panel dispatches', panel.includes('dispatchDuneAction'), true)
  for (const type of ['OPEN_CHARITY', 'CLAIM_CHARITY', 'CLOSE_CHARITY']) {
    check(`...including ${type}`, panel.includes(`'${type}'`), true)
  }
  // AND PASSES THE CLIENT THROUGH, or the harness is back to acting as one seat.
  check('...through the seat\'s own client', /\{ client \}/.test(panel), true)

  // The seat picker is simulation-only. Live it would imply a choice that does
  // not exist: the session decides, and offering a dropdown beside it invites
  // exactly the "why did my claim go out as p1" confusion.
  check('the seat dropdown is not offered in live mode',
    /live \? \([\s\S]{0,400}\) : \([\s\S]{0,200}<select/.test(panel), true)

  // THE BUTTON JUDGES ITS OWN SEAT, and only its own. This used to offer Claim
  // to everyone on the grounds that eligibility depends on a purse the client
  // cannot read — true of every OTHER seat, false of this one, whose spice
  // arrives on its own secrets channel. A Claim whose only outcome is
  // 'not-eligible' is not caution, it is a button that lies.
  check('the panel works out its own eligibility',
    panel.includes('isEligibleForCharity(own ?? null, faction ?? null)'), true)
  check('...from the same rule the server pays out from',
    panel.includes("from '@/lib/dune/charity'"), true)
  // AND IT ASKS THE RULE RATHER THAN COMPARING A NUMBER, which is what keeps
  // the Bene Gesserit working: they are eligible whatever they hold, so any
  // check written as a comparison against the threshold would refuse them.
  check('...rather than comparing spice to the threshold itself',
    /spice\s*<=\s*CHARITY_TOPS_UP_TO|readSpice\([^)]*\)\s*[<>]/.test(panel), false)
  // Claim OR Pass, because declining is a decision and the alternative is
  // staring at an eligible phase until the window shuts.
  check('an eligible seat is offered a pass as well as a claim',
    /<button onClick=\{pass\}/.test(panel), true)
  check('...and an ineligible one is offered no claim at all',
    /canClaim \? \(/.test(panel), true)
}

// ── the harness drives, rather than only watching ─────────────────────────
// The helper taking a client is the mechanism; the harness using it is the
// point. Before this the harness could switch which seat's SECRETS fed the
// screen and nothing else — every action still went out on the app's session,
// so a turn could be watched from six seats and played from one.
{
  const view = readFileSync('src/components/dune/DuneMultiSeatView.tsx', 'utf8')

  check('the harness renders something that can act', view.includes('CharityPanel'), true)
  check('...on the ACTIVE seat\'s client', /client=\{mine\.client\}/.test(view), true)

  // AND NOT ON A FALLBACK. dispatchDuneAction defaults to the app's own session
  // when handed none — correct for the app, wrong here: a seat mid-sign-in would
  // post as whoever this browser happens to be, and the action would SUCCEED
  // under the wrong seat rather than fail. Acting as the wrong seat is possible
  // in exactly one place, and this is it.
  check('...never on the app\'s session by default',
    /mine\?\.client\s*\n?\s*\? <CharityPanel/.test(view), true)

  // The public row is read, not invented. A seat that posts an action and
  // watches a fixture cannot tell a working round trip from a broken one — and
  // the fixture's `remaining: 21` was the literal permanent "21 LEFT".
  check('the harness reads the shared row', /from\('matches'\)/.test(view), true)
  // THE SHAPE, not the word. This matched `/postgres_changes/` alone, which a
  // sabotage walked straight through: `.on('nothing' as 'postgres_changes', …)`
  // still contains the string and subscribes to nothing at all.
  check('...and watches it for changes',
    /\.on\('postgres_changes',\s*\n?\s*\{ event: 'UPDATE', schema: 'public', table: 'matches'/.test(view),
    true)
  check('...and actually subscribes', /\.subscribe\(\)/.test(view), true)
  check('...rendering it rather than the fixture',
    /state=\{publicRow \?\? PUBLIC_FIXTURE\}/.test(view), true)

  // THE PUBLIC ROW IS READ ON ANY SEAT'S CLIENT, and that is fine — it is
  // public, identical for everyone. The check is that it does NOT go the other
  // way: secrets must never be read on a shared or arbitrary client, because
  // there WHICH session asks is the entire mechanism.
  check('the harness does not fetch secrets itself',
    /from\('match_secrets'\)/.test(view), false)
}

// ── the Fremen answer the pause, and only they ────────────────────────────
// Worms after the first in a pile are theirs to place, and the rule says they
// CAN be placed — so declining is a legal answer, not a timeout. A phase that
// resolved on silence would be deciding for them, which is what the pause is
// for.
{
  const panel = readFileSync('src/components/dune/WormPlacementPanel.tsx', 'utf8')

  check('the panel answers through the dispatcher', panel.includes('dispatchDuneAction'), true)
  check('...with the action the server names', panel.includes("'PLACE_WORMS'"), true)
  check('...through the acting seat\'s client', /\{ client \}/.test(panel), true)

  // DECLINING IS AN ANSWER, and it needs its own control. Without one the only
  // way past a pause is to use worms you may not want to use.
  check('declining is offered', /send\(\[\]\)/.test(panel), true)

  // THE PANEL NAMES NO SEAT. Whether this client may answer is decided by the
  // token; `mine` only chooses whether to draw the buttons.
  check('the payload says who is asking nowhere',
    /(seat|faction|playerId|actAs)\s*:/.test(panel.slice(panel.indexOf('PLACE_WORMS') - 200, panel.indexOf('PLACE_WORMS') + 200)),
    false)

  // SHOWN TO EVERYONE, ANSWERABLE BY ONE. Six people round a table can all see
  // who is being waited on, and hiding it is how a play-by-network game ends up
  // with everybody waiting on everybody.
  check('the pause is drawn whether or not it is yours',
    /\{!mine && ' Waiting on them\.'\}/.test(panel), true)
  check('...and the controls are not', /\{mine && \(/.test(panel), true)

  // FEWER IS LEGAL, MORE IS NOT — the server refuses an over-placement too, so
  // this only saves a round trip to be told so.
  check('more worms than were offered cannot be chosen',
    /c\.length >= worms \? c :/.test(panel), true)

  const view = readFileSync('src/components/dune/DuneMultiSeatView.tsx', 'utf8')
  check('the harness can answer a pause', view.includes('WormPlacementPanel'), true)
  check('...as the Fremen when it is that seat',
    /mine=\{mine\.login\.faction === 'fremen'\}/.test(view), true)
}

// ── the pause cannot carry the deck to the table ──────────────────────────
// The one property worth checking twice. A Step is a single object and it
// CANNOT be written to a single place: the ask is public, the carry holds the
// remaining deck in order. Writing the step whole into matches.state would
// publish the spice deck to every client through the back door of a phase that
// happens to pause — defeating match_decks without touching it.
{
  const panel = readFileSync('src/components/dune/WormPlacementPanel.tsx', 'utf8')
  // The panel is typed to the ASK, so it could not render a deck if it tried.
  const pauseShape = panel.slice(panel.indexOf('export interface SpiceBlowPause'),
    panel.indexOf('export interface WormPlacementPanelProps'))
  check('the pause the client knows about is the ask alone',
    /deck|cards|carry/.test(pauseShape), false)
  check('...naming only the pile and the count',
    /pile\?: 'A' \| 'B'/.test(pauseShape) && /worms\?: number/.test(pauseShape), true)
}

// ── the seeded match is a match somebody can look at ──────────────────────
// The seed script is scaffolding, and scaffolding nothing checks is scaffolding
// that quietly stops working. Both of these were live faults found by sabotage
// after being fixed by hand — which is to say, nothing would have noticed them
// coming back.
{
  const seed = readFileSync('scripts/seed-dune-match.mjs', 'utf8')

  // WITHOUT PLAYERS THE BOARD IS EMPTY. DuneGameScreen builds its seating from
  // state.players, so a match seeded with none renders a board with nobody on
  // it — which reads as the harness using some other board component, and is
  // really just a match that never said who was playing.
  check('the seeded match publishes its players',
    /players: publicPlayers\(seats\)/.test(seed), true)
  check('...in both fixtures', (seed.match(/players: publicPlayers\(seats\)/g) ?? []).length, 2)
  check('...and never seeds an empty roster', /players: \[\]/.test(seed), false)
  // The board coordinate, not the secrets key. These are different columns
  // meaning different things and the harness wants the other one.
  check('...at their printed board positions',
    /seat: `player-position-\$\{i \+ 1\}`/.test(seed), true)

  // AND THE PUBLIC ROSTER CARRIES NO SPICE. state.players reaches every client;
  // a purse in it is every purse published to the whole table, which is the one
  // thing the three-store split exists to prevent. handCount is a COUNT for the
  // same reason — the cards are secret, so only their number is public.
  // COMMENTS STRIPPED FIRST. The function explains in prose that it carries no
  // spice, and a search for the word matched the explanation — the third time
  // in this codebase a check has confirmed a mention rather than a use. What is
  // being asked is whether a FIELD is assigned, so the fields are what is read.
  const roster = seed
    .slice(seed.indexOf('const publicPlayers'), seed.indexOf('}))', seed.indexOf('const publicPlayers')))
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  check('the public roster is there to check', roster.length > 60, true)
  check('...and assigns no spice', /\bspice\s*:/.test(roster), false)
  check('...nor anyone\'s cards', /\bcards\s*:/.test(roster), false)
  check('...only a hand COUNT', /handCount\s*:/.test(roster), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
