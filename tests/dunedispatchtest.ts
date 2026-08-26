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

/**
 * A source file with its comments stripped.
 *
 * CODE, NOT PROSE. Checks here ask whether a file DOES something, and a file
 * that explains at length why it no longer does that thing answers yes to a
 * plain search. It has happened four times in this codebase: a comment saying
 * "carries no spice" matching a search for spice, a header explaining that the
 * live branch is gone matching a search for matchId. Comment lines come out
 * before anything is asked.
 */
const code = (path: string) => readFileSync(path, 'utf8')
  .split('\n')
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

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

// ── the charity decision, where it is actually made ───────────────────────
// This used to be a corner panel that dispatched for itself. It is a modal
// over the board now, and the split moved with it: the modal DRAWS the
// decision and the harness SENDS it, because dispatching belongs to whoever
// owns the session rather than to a component that draws a dialog.
{
  const modal = readFileSync('src/components/dune/CharityModal.tsx', 'utf8')
  const view = readFileSync('src/components/dune/DuneMultiSeatView.tsx', 'utf8')

  // IT COVERS THE BOARD rather than dimming it, unlike the auction. Charity is
  // two words and a number for fifteen seconds and the board says nothing
  // about it; an auction is a card you are spending real spice on.
  check('the modal is drawn over the board', /position: 'absolute', inset: 0/.test(modal), true)
  check('...opaquely, rather than scrimmed', /background: '#0d1220f2'/.test(modal), true)
  check('...as a dialog', /role="dialog"/.test(modal) && /aria-modal="true"/.test(modal), true)

  // Claim OR Pass, the two answers there are.
  check('it offers a claim', modal.includes('Claim CHOAM'), true)
  check('...and a pass', /onClick=\{onPass\}/.test(modal), true)

  // NO CLOCK OF ITS OWN. The countdown is on the board, between the two
  // off-board boxes, where the whole table reads the same one — a second
  // countdown here would be a second answer to how long is left.
  check('it runs no countdown of its own',
    /closesAt|toFixed|setInterval/.test(modal), false)

  // IT JUDGES ITS OWN SEAT, from its own row, and asks the shared rule rather
  // than comparing a number — which is what keeps the Bene Gesserit working.
  check('the modal works out its own eligibility',
    modal.includes('isEligibleForCharity(own, faction)'), true)
  check('...from the same rule the server pays out from',
    modal.includes("from '@/lib/dune/charity'"), true)
  check('...rather than comparing spice to the threshold itself',
    /readSpice\([^)]*\)\s*[<>]/.test(modal), false)
  check('...and offers no claim to a seat that cannot claim',
    /eligible \? \(/.test(modal), true)

  // AND IT SENDS NOTHING ITSELF. Handlers in, actions out — the component that
  // draws a dialog has no session and no business having one.
  check('the modal dispatches nothing', /dispatchDuneAction|fetch\(/.test(modal), false)

  // The harness does, through the acting seat's client.
  check('the harness sends the claim', view.includes("'CLAIM_CHARITY'"), true)
  // THE CLIENT ARGUMENT, not the whole call. Pinning the exact call text
  // failed the moment send() grew a payload for OPEN_BIDDING, which is not
  // the rule — the rule is that EVERY action goes out on the acting seat's
  // own session, and counting them says that where matching one string did
  // not: a second call added without a client would slip past a check that
  // only looks for the first.
  check('...through that seat\'s own session',
    (view.match(/dispatchDuneAction\(/g) ?? []).length > 0
      && (view.match(/client: session\.client/g) ?? []).length
         === (view.match(/dispatchDuneAction\(/g) ?? []).length, true)

  const rowLib = code('src/lib/dune/publicRow.ts')

  // PASSING SENDS NOTHING, and there is no PASS action on the server: a claim
  // declined and a claim never made are the same thing to the rules. What it
  // does is take the modal down for that seat — which has to be per seat,
  // because the harness holds six of them in one page and a single flag would
  // dismiss it for everybody the moment one passed.
  check('passing sends no action', /'PASS_CHARITY'|type: 'PASS'/.test(view), false)
  // THE RECORD IS THE HARNESS'S, THE COMPARISON IS THE READER'S. openCharity
  // lives in lib/dune/publicRow because the real screen asks the same question
  // — and it is the same question only while both hand it the same thing.
  check('...and is remembered per seat',
    /openCharity\(publicRow, answered\[session\.login\.faction\]\)/.test(view), true)
  check('...for that turn only, so next turn asks again',
    /\[session\.login\.faction\]: window_\.turn/.test(view), true)
  check('...with the reader comparing it against the window\'s own turn',
    /answeredTurn === window_\.turn/.test(rowLib), true)

  // The corner block that used to hold all this is gone from the chat's column.
  check('the harness no longer renders the old panel',
    view.includes('CharityPanel'), false)
  const block = view.slice(view.indexOf("position: 'fixed'"), view.indexOf("position: 'fixed'") + 200)
  check('what is left of it is out of the chat\'s column', /right: \d+/.test(block), true)
}

// ── and the old panel keeps only what the dev board uses ──────────────────
// Its live branch is gone rather than left unreachable. Nothing passed a
// matchId once the harness moved to the modal, so half the file was code no
// caller could reach — with tests asserting it, which is the worse half: a
// check guarding a path nothing runs cannot fail for a real reason.
{
  const panel = code('src/components/dune/CharityPanel.tsx')
  check('the dev panel dispatches nothing', /dispatchDuneAction/.test(panel), false)
  check('...and takes no match or client', /matchId|SupabaseClient/.test(panel), false)
  check('...keeping the seat picker the simulation needs', /<select/.test(panel), true)
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
  // READ WHERE THE TYPE LIVES, which is now beside the row it describes —
  // src/lib/dune/publicRow. The panel re-exports it, and a check pointed at the
  // re-export would be reading an import line rather than a shape.
  const row = readFileSync('src/lib/dune/publicRow.ts', 'utf8')
  // The client is typed to the ASK, so it could not render a deck if it tried.
  const pauseShape = row.slice(row.indexOf('export interface SpiceBlowPause'),
    row.indexOf('export interface LastAuction'))
  check('the pause type is where the row is described', pauseShape.length > 0, true)
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
  // EVERY fixture, however many there are. Written as a count of two when
  // there were two phases, which quietly stopped meaning "all of them" the
  // moment a third arrived — the new one could have shipped with an empty
  // roster and this would still have passed.
  check('...in every fixture the script can seed',
    (seed.match(/players: publicPlayers\(seats\)/g) ?? []).length,
    (seed.match(/phase: '[^']+'/g) ?? []).length)
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

// ── the seeded match gives the screen something to draw ───────────────────
// A fixture of zeroes renders a HUD of noughts and reads as broken rather than
// as empty, which is the wrong impression for scaffolding whose whole job is to
// show the screen working.
{
  const seed = code('scripts/seed-dune-match.mjs')

  check('the seed puts forces on the board', /forces: publicForces\(seats\)/.test(seed), true)
  // STRONGHOLDS ARE FOUR NAMED TERRITORIES and strongholdsHeld counts only
  // those, so a seed that puts every stack in open sand leaves that column at
  // zero for everybody and looks exactly like a HUD that cannot count.
  check('...including stronghold territories',
    /territory-13|territory-26|territory-38|territory-40/.test(seed), true)
  check('...and hands that are not all empty', /handCountFor\(/.test(seed), true)

  // STILL NO SPICE, and still only a COUNT of cards. Public state reaches every
  // client; the reason those are absent does not change because the fixture got
  // richer.
  const roster = seed
    .slice(seed.indexOf('const publicPlayers'), seed.indexOf('}))', seed.indexOf('const publicPlayers')))
  check('the public roster still assigns no spice', /\bspice\s*:/.test(roster), false)
  check('...nor anyone\'s cards', /\bcards\s*:/.test(roster), false)
}

// ── a seat the match does not seat says so ────────────────────────────────
// The tray is gated on finding this faction in state.players — no row, no
// faction card, no leader discs, no spice. A VITE_DEV_SEATS naming a faction
// the match never seated therefore produces a screen with its middle missing
// and nothing at all saying why, which reads as a rendering fault.
//
// Easy to arrive at: the seed assigns factions by POSITION in
// DUNE_SEED_ACCOUNTS, so reordering the emails or editing the printed line by
// hand is enough.
{
  const view = code('src/components/dune/DuneMultiSeatView.tsx')
  const rowLib = code('src/lib/dune/publicRow.ts')
  check('the harness notices a seat that is not in the match',
    /const notSeated =/.test(view), true)
  check('...by comparing the acting faction against the published roster',
    /seatedIn\(publicRow, active\)/.test(view), true)
  check('...which is the public players list and nothing else',
    /row\.players\.some\(p => p\.faction === faction\)/.test(rowLib), true)
  check('...and says so rather than rendering nothing',
    view.includes('is not seated in this match'), true)
  // NAMING WHO IS SEATED, because "not seated" alone leaves the reader to guess
  // whether the match is wrong or the env var is.
  check('...listing who the match does seat', /seatedFactions\.join/.test(view), true)
}

// ── the harness drives the auction ────────────────────────────────────────
{
  const view = code('src/components/dune/DuneMultiSeatView.tsx')
  const rowLib = code('src/lib/dune/publicRow.ts')

  check('the harness builds the auction from public state',
    /openAuction\(publicRow\)/.test(view), true)
  // AND THE READER TAKES IT OFF THE STEP, which is where the server writes it.
  // A reader that invented any of this would be inventing whose turn it is.
  check('...off the step the server published',
    /const step = row\?\.auction/.test(rowLib), true)
  check('...only while it is actually waiting on somebody',
    /step\.status !== 'awaiting'/.test(rowLib), true)
  check('...and passes it to the screen', /bidding=\{biddingFor\(mine\)\}/.test(view), true)
  check('...sending bids and passes as actions',
    view.includes("type: 'BID'"), true)
  check('...and opening the auction', view.includes("'OPEN_BIDDING'"), true)

  // HAND SIZES, NOT CONTENTS. Sizes are public at a table; what is in a hand is
  // not, and OPEN_BIDDING is given only the counts already in public state.
  check('what it sends about hands is the published count',
    /hands = Object\.fromEntries\(publicRow\.players\.map\(p => \[p\.faction, p\.handCount\]\)\)/.test(view),
    true)

  // A REFUSAL IS PRIVATE AND PER SEAT. It announces roughly what a bidder
  // holds, which is most of what bidding hides — and the harness holds six
  // seats in one page, so a single value would show one seat's refusal to the
  // next one switched to.
  check('a bid refusal is kept per seat',
    /setBidRefusal\(r => \(\{ \.\.\.r, \[session\.login\.faction\]/.test(view), true)
  check('...and handed only to that seat',
    /refusal: bidRefusal\[session\.login\.faction\]/.test(view), true)
  // The server writes nothing on a refusal, so neither does this.
  const bidFn = view.slice(view.indexOf('const bid = async'), view.indexOf('const openBidding'))
  check('the bid helper is there to check', bidFn.length > 100, true)
  check('...and advances nothing itself', /setPublicRow|setAnswered/.test(bidFn), false)
}

// ── the bidding fixture is worth opening ──────────────────────────────────
{
  const seed = code('scripts/seed-dune-match.mjs')

  check('the seed offers a bidding phase', /'bidding'/.test(seed), true)
  check('...at the phase OPEN_BIDDING demands', /phase: 'Bidding'/.test(seed), true)
  check('...with a discard the reshuffle can read', /treacheryDiscard: \[\]/.test(seed), true)

  // ONE SEAT AT ITS LIMIT, which is the case the fixture exists to show:
  // cardsOnOffer counts only seats UNDER their limit, so a table where everyone
  // has room never demonstrates a seat the auction skips.
  // SOME seat, not a particular one. Pinning the index failed when the seat at
  // the limit moved, which is not the rule — the rule is that one of them is.
  check('one seat is seeded at its hand limit',
    /return HAND_LIMITS\[faction\]/.test(seed), true)

  // AND THE PURSES ARE WORTH BIDDING WITH. Asserting the constant merely
  // EXISTS passed when its values were replaced with charity's — a table where
  // nobody holds more than three cannot hold an auction worth watching, and
  // the check said nothing about it.
  const purses = (seed.match(/const BIDDING_SPICE = \[([^\]]*)\]/)?.[1] ?? '')
    .split(',').map(n => Number(n.trim())).filter(n => Number.isFinite(n))
  check('the bidding purses are there to read', purses.length >= 4, true)
  check('...and somebody can afford a real bid', Math.max(...purses) >= 5, true)
  check('...and they differ, so it is a contest', new Set(purses).size > 1, true)
  // One seat nearly broke, so the refusal path is one keypress away.
  check('...with one seat that cannot afford much', Math.min(...purses) <= 2, true)
  // The Atreides are seated first in every run, so prescience always has
  // somebody to render for.
  check('the Atreides are always seated', /const FACTIONS = \['atreides'/.test(seed), true)

  // CARDS THE CLIENT CAN DRAW. A hand-written list of ids goes wrong the first
  // time one is renamed, and the auction would then deal a card that renders as
  // nothing — which looks like a rendering fault rather than a stale fixture.
  // READ, not just mentioned. The first version checked that the file was
  // opened — which stayed true when the ids underneath were replaced with a
  // hand-written pair, so the check passed on exactly the fixture it exists to
  // forbid.
  const idsFn = seed.slice(seed.indexOf('const treacheryIds'), seed.indexOf('const userIdFor'))
  check('the treachery pile is read from the card data',
    /readFileSync\('src\/data\/dune\/treachery\.ts'/.test(idsFn), true)
  check('...and the ids come out of it', /matchAll\(/.test(idsFn), true)
  check('...rather than being listed by hand',
    /\[\s*'[a-z-]+'\s*,\s*'[a-z-]+'/.test(idsFn), false)
  check('...and refuses a shape it does not recognise',
    /has the file's shape changed/.test(seed), true)
  // DRAWN BY THE SERVER. Seeding a lot directly would skip the step that fixes
  // the order before a single bid is made.
  check('...and no auction lot is seeded directly', /'auction-lot'/.test(seed), false)
}

// ── the winner's purse is re-read, not waited for ─────────────────────────
// Winning an auction spends spice, and the row that changes is the winner's
// own. The changefeed is the normal path, but a client that has just POSTed
// the action knows something changed and should not sit waiting on a frame to
// find out what — a dropped or delayed UPDATE shows up as spice that never
// leaves the purse, which is right in the database and wrong on the screen.
{
  const view = code('src/components/dune/DuneMultiSeatView.tsx')
  const harness = code('src/dev/multiSeat.ts')

  check('the harness can re-read one seat\'s row', /refresh\(faction: FactionId\)/.test(harness), true)
  // ON THAT SEAT'S OWN CLIENT, so it reads under the same RLS as everything
  // else and can only ever see its own row.
  const refreshFn = harness.slice(harness.indexOf('async refresh('), harness.indexOf('publish()', harness.indexOf('async refresh(')))
  check('...through that seat\'s own session', /session\.client/.test(refreshFn), true)
  // THE READER IS SHARED with the real screen — see readOwnSecrets — so the
  // check follows it there. What the harness supplies is its own seat and its
  // own client; what the reader does is ask for that seat's row.
  check('...for that seat\'s row alone',
    /readOwnSecrets\(matchId, session\.login\.seat, session\.client\)/.test(refreshFn), true)
  const reader = code('src/lib/secretsSync.ts')
  check('...and the reader asks for exactly that row',
    /\.eq\('player_id', playerId\)/.test(reader), true)
  // WHAT MAKES IT SAFE IS THE SESSION, not that narrowing. A client-side filter
  // that looked like it was doing the work would be the more dangerous thing to
  // have written, so the reader takes the caller's client and defaults to the
  // app's rather than reaching for anything privileged.
  check('...on the caller\'s own session', /client \?\? supabase/.test(reader), true)
  // THE SAME OBJECTS the changefeed mutates. A copy kept beside them would be
  // a second answer, and the next published frame would silently win.
  check('...writing where the changefeed writes', /session\.secrets =/.test(refreshFn), true)

  check('a bid re-reads the purse it may have spent',
    /await seats\.current\?\.refresh\(session\.login\.faction\)/.test(view), true)
  check('...and so does a charity claim',
    (view.match(/seats\.current\?\.refresh/g) ?? []).length >= 2, true)
}

// ── a win reaches the whole table, off the public row ─────────────────────
// Who won and what they paid are public: six people round a table all watch a
// card go for nine spice. Six people in six browsers do not, unless the row
// says so.
//
// THIS WAS COMPOSED LOCALLY, by whichever client made the closing bid, out of
// the response only that client received. So the winner — the one seat that
// already knew — was the only seat told, and on separate machines nobody else
// would ever see the line. Every client receives the row; every client now
// derives the same line from it.
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const view = code('src/components/dune/DuneMultiSeatView.tsx')

  // The server has to publish it before anyone can derive it.
  // \b, or _lastAuction slips past — an underscore is a word character, so the
  // boundary is what distinguishes the real field from a disabled copy of it.
  check('the settlement is written to public state', /\blastAuction: \{/.test(fn), true)
  const published = fn.slice(fn.indexOf('lastAuction: {'), fn.indexOf('treacheryDiscard', fn.indexOf('lastAuction: {')))
  check('...the block is there to check', published.length > 40, true)
  // The award is named directly now rather than mapped over a list: settlement
  // happens per card, so there is one award to publish, not a batch.
  check('...naming the winner', /winner: justClosed\.winner/.test(published), true)
  check('...and the price', /price: justClosed\.price/.test(published), true)

  // WINNER AND PRICE ONLY. Not the card, which the auction is blind to and
  // which now sits in a hand nobody else may read; not the lot index either,
  // which is a position in a pile clients cannot see.
  check('...and no card', /\bcards?\b/.test(published), false)
  check('...nor the lot index', /\bindex\b/.test(published), false)

  // A KEY THAT SAYS WHICH SETTLEMENT. The row is re-delivered on every later
  // change, so a client needs to tell "the one I announced" from "another card
  // just sold" — and two cards in one turn can go to the same seat for the same
  // price, which makes the awards themselves an unreliable key.
  check('...stamped so a client can tell one settlement from the next',
    /at: now/.test(published), true)

  // And the client derives it rather than being handed it.
  // THE ASSIGNMENT, not a mention. The effect's dependency array names the
  // same field, so a body gutted to `const last = null` still matched a search
  // for it and the check passed on a harness announcing nothing.
  check('the harness announces off the row',
    /const last = publicRow\?\.lastAuction/.test(view), true)
  check('...once per settlement', /announced\.current = last\.at/.test(view), true)

  // AND THE GUARD IS SET FIRST. announce() calls setChat, which re-renders; a
  // guard written after the loop lets the second pass through and the table
  // hears every sale twice.
  const effect = view.slice(view.indexOf('const last = publicRow'), view.indexOf('}, [publicRow'))
  check('...with the guard set before anything is said',
    effect.indexOf('announced.current = last.at') < effect.indexOf('for (const line'), true)

  // PUBLIC, unlike say(). Most of what this harness reports is private — a
  // charity refusal says roughly what a seat holds — so the announcement has
  // its own path, and that path must not acquire a recipient.
  const announceFn = view.slice(view.indexOf('const announce ='), view.indexOf('const say ='))
  check('the announcement is there to check', announceFn.length > 60, true)
  check('...and addresses nobody in particular', /\bto\b/.test(announceFn), false)
  check('...and no longer off its own response',
    /res\.data as \{ awards/.test(view), false)
}


// ── the bid box follows the standing bid ──────────────────────────────────
// useState(minimum) reads its argument once, so the box kept whatever the
// minimum was when the panel mounted — through every raise by everybody else —
// and the next bidder had to retype a number the auction already knew.
//
// A SOURCE CHECK, DELIBERATELY. This suite renders to static markup, which
// mounts fresh every time; on a fresh mount useState(minimum) alone already
// yields the right number, so a rendered assertion passes just as happily
// against the bug. What distinguishes them is a re-render with a NEW minimum
// and no remount, which needs a live renderer this suite does not have.
{
  const panel = code('src/components/dune/BiddingPanel.tsx')
  check('the amount follows the minimum', /useEffect\(\(\) => \{ setAmount\(minimum\) \}, \[minimum\]\)/.test(panel), true)
  check('...keyed on the minimum alone, so typing survives until a raise',
    /\}, \[minimum\]\)/.test(panel), true)
}

// ── an action re-reads the row it changed ─────────────────────────────────
// The changefeed is the normal path, but a client that has just POSTed knows
// the row moved. Waiting to be told is how a pass looks like a pass that never
// registered: the seat that passed still sees its own clock running, the seat
// that should now be acting still sees itself waiting on somebody who has
// already answered, nobody can move, and nothing says why.
//
// The same argument as the purse, one table over — that one was the seat's own
// secrets row, this is the public one.
{
  const view = code('src/components/dune/DuneMultiSeatView.tsx')

  check('the harness can re-read the shared row',
    /rereadRow\.current = feed\.reread/.test(view), true)
  check('...and a bid does', /await rereadRow\.current\?\.\(\)/.test(view), true)
  // EVERY action, not just the one that prompted this. A dev control that
  // opens an auction changes the row exactly as a bid does.
  check('...as does every action the harness sends',
    (view.match(/await rereadRow\.current\?\.\(\)/g) ?? []).length >= 3, true)
  // Cleared on teardown, so a stale closure cannot write into an unmounted view.
  check('...and it is dropped when the view goes', /rereadRow\.current = null/.test(view), true)
}

// ── a bid window that expires answers itself ──────────────────────────────
// awaitingBy says what a timed-out required stop means and names this phase as
// the case: the phase cannot go on until an answer exists, and if none arrives
// by closesAt the caller supplies the one the rule says silence means. For
// bidding that is a pass.
//
// Nothing supplied it. answerBid takes closesAt only to stamp the NEXT stop and
// never reads the current one, and the endpoint did not check either — so an
// expired window stayed open for ever, waiting on a seat whose time was up.
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const bidCase = fn.slice(fn.indexOf("case 'BID'"), fn.indexOf("case 'SPICE_BLOW'") > fn.indexOf("case 'BID'")
    ? fn.indexOf("case 'SPICE_BLOW'") : fn.length)

  check('the bid case is there to check', bidCase.length > 400, true)
  check('the endpoint notices its own deadline',
    /const expired = typeof step\.closesAt === 'number' && now >= step\.closesAt/.test(bidCase), true)
  // SILENCE IS A PASS, whoever asked and whatever they sent. Honouring a late
  // bid would make the deadline advisory, and a window that only sometimes
  // shuts is not a window.
  check('...and answers a pass for the seat that did not',
    /const answer = expired \? \{ kind: 'pass' \} : action\.bid/.test(bidCase), true)
  check('...on behalf of whoever was to act',
    /const actingFaction = expired \? step\.carry\.toAct : myFaction/.test(bidCase), true)
  // The purse is read for the CALLER, who on this path is not the seat being
  // answered for. A pass spends nothing, so no balance stands in for another's.
  check('...without one seat\'s purse standing in for another\'s',
    /const againstPurse = expired \? 0 : purse/.test(bidCase), true)

  // AND SOMETHING HAS TO ASK. The panel offers Bid and Pass only to the seat
  // whose turn it is, so a seat that has walked away leaves nobody able to
  // press anything — the server resolving correctly is no use unwitnessed.
  const view = code('src/components/dune/DuneMultiSeatView.tsx')
  check('the harness can push an expired auction along',
    /biddingExpired &&/.test(view), true)
  check('...deciding that off the stamped deadline, not its own clock',
    /auctionExpired\(publicRow, now\)/.test(view), true)
  check('...which is a comparison against the server\'s moment',
    /now >= step\.closesAt/.test(code('src/lib/dune/publicRow.ts')), true)
}

// ── the auction's server wiring for all of this ───────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const view = code('src/components/dune/DuneMultiSeatView.tsx')

  // THE PAUSE IS ENFORCED WHERE THE CLOCK IS. The module stamps the moment and
  // owns no clock; the endpoint decides whether it has come.
  check('the endpoint refuses a bid inside the pause',
    /code: 'between-cards'/.test(fn), true)
  check('...comparing its own clock to the stamped moment',
    /now < pausedUntil/.test(fn), true)
  check('...and stamps the next card\'s opening', /const opensAt = now \+ BETWEEN_CARDS_SECONDS/.test(fn), true)
  // THE PAUSE DOES NOT EAT THE NEXT BIDDER'S TIME.
  check('...with a full window starting after it',
    /thenClosesAt: opensAt \+ BID_SECONDS \* 1000/.test(fn), true)

  // THE HARKONNEN SECOND CARD comes off the draw pile, which only the server
  // can see — the lot holds exactly one card per eligible bidder.
  check('the endpoint works out what the bonus faction is owed',
    /bonusCardsDue\(/.test(fn), true)
  check('...draws exactly that many rather than drawing and putting back',
    /if \(bonusDue > 0\)/.test(fn), true)
  check('...and shortens the pile in the same write as the hand',
    /treachery: bonusDraw\.draw/.test(fn), true)
  // PER CARD, not per auction. The bonus is drawn for the card that just
  // closed, so a seat winning two gets one with each rather than both at the
  // end — and cannot be handed a card the limit no longer has room for.
  check('...for the card that just closed',
    /bonusCardsDue\(\s*\[justClosed\]/.test(fn), true)
  // A reshuffle for the bonus moves the discard, so the unsold join what that
  // left rather than what was there before it.
  check('...with the unsold added to the discard the draw left',
    /discardUnsold\(\s*bonusDraw\.discard/.test(fn), true)

  // ── PAID WHEN THE HAMMER FALLS ─────────────────────────────────────────
  // At the table the spice moves as each card is won. Settling the whole
  // auction at the end left a winner's purse reading full while they bid on the
  // next card — they could not see what they had left to bid WITH.
  check('the endpoint settles one card at a time', /settleCard\(/.test(fn), true)
  // THE GUARD, not just the call. Disabling it to `if (false)` leaves
  // settleCard sitting there unreachable, which every search for the name
  // still finds — the fourth or fifth time a check here has confirmed a
  // mention rather than something that runs.
  check('...when a card actually closed', /if \(justClosed\) \{/.test(fn), true)
  check('...and no longer only at the end', /settleAuction\(/.test(fn), false)
  // WHICH card closed: the awards list only grows, so one more than before
  // means this answer ended a card, and the last entry is that card.
  check('...working out which card just closed',
    /awardsNow\.length > step\.carry\.awards\.length/.test(fn), true)
  check('...from the carry or the result, whichever this answer produced',
    /outcome\.step\.status === 'awaiting'\s*\?\s*outcome\.step\.carry\.awards/.test(fn), true)
  // AND IT IS WRITTEN ON THE CONTINUING WRITE, not held back to the end —
  // which is the entire point of the change.
  check('...writing the payment while the auction goes on',
    /p_secrets: paidSecrets,/.test(fn), true)
  // THE REVEAL IS MERGED ONTO IT. A seat that just won and is also the
  // prescient one would otherwise have its new hand and purse overwritten by a
  // row carrying only the reveal.
  check('...with the reveal merged onto the payment, not written over it',
    /withReveal\(\s*\(paidSecrets\[seatId\] \?\? byId\[seatId\]/.test(fn), true)

  // THE EXPIRED-BID RESOLUTION IS SEAT-AGNOSTIC. It sent the pass from the
  // ACTIVE session, which worked only when the seat on screen happened to be
  // the seat to act, and was refused as not-your-turn the rest of the time —
  // so it looked like a bug in one faction.
  check('the harness resolves as the seat being waited on',
    /sessions\.find\(x => x\.login\.faction === waitingOn\)/.test(view), true)
  check('...falling back to the viewed seat only when that seat is not held',
    /\?\? mine/.test(view), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
