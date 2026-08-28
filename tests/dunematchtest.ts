// One seat, one session, a real match: the screen, the feed and the readers.
//
// WHY THIS EXISTS. Until now the only thing that rendered a live Dune match was
// the dev harness, which holds six sessions in one page and is excluded from
// production builds. Everything it proved was proved about a page no player can
// open. This suite is about the one they can.
//
// The three claims worth the most here are privacy claims, and none of them is
// about this component being careful:
//
//   Which seat you hold comes from the DATABASE — match_players' row for the
//   signed-in user — and never from the URL, which anybody can edit.
//
//   Your hand and spice come from match_secrets on THIS BROWSER'S OWN session.
//   RLS is what makes another seat's row unreachable; the screen has no
//   credentials with which to ask for one.
//
//   Nothing it sends names a seat. The token in the header says who is acting,
//   and duneDispatch refuses a payload that tries to say otherwise.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { watchDuneMatch } from '@/lib/dune/matchFeed'
import {
  openAuction, openCharity, auctionExpired, seatedIn, winLines,
} from '@/lib/dune/publicRow'
import type { PublicRow } from '@/lib/dune/publicRow'
import type { BidAsk, AuctionCarry } from '@/lib/dune/bidding'
import { DuneMatchScreen } from '@/components/dune/DuneMatchScreen'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/**
 * Source with its comments stripped.
 *
 * A CHECK THAT MATCHES A COMMENT PROVES NOTHING. This suite reads source in
 * places — the wiring claims cannot be reached any other way without a browser
 * — and prose describing the right thing has passed for the right thing here
 * before, more than once.
 */
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const EMPTY: PublicRow = {
  storm: 'sector-1', turn: 1, phase: 'Bidding', shieldWall: 'intact', mode: 'advanced',
  spiceDeck: { remaining: 3, discardA: [], discardB: [] },
  players: [], forces: [], spiceOnBoard: {}, awaiting: null,
}

// ── the readers, which both screens share ─────────────────────────────────
// They are in lib/dune/publicRow precisely so the harness and the real screen
// cannot come to different conclusions about the same row. That is only worth
// anything if the conclusions are right.
{
  const order = ['atreides', 'harkonnen'] as FactionId[]
  const hands = { atreides: 0, harkonnen: 0 }
  const carry: AuctionCarry = {
    turn: 1, order, hands, limits: { atreides: 4, harkonnen: 8 },
    cardCount: 2, index: 0, high: null, passed: [],
    toAct: 'atreides' as FactionId, awards: [], unsold: [],
  }
  const ask: BidAsk = {
    kind: 'treachery-bid', index: 0, cardCount: 2, high: null, minimum: 1, hands,
  }

  check('no auction, nothing to bid on', openAuction(EMPTY), null)
  check('a settled auction is not open',
    openAuction({ ...EMPTY, auction: { status: 'settled', ask, carry } } as PublicRow), null)
  // BOTH HALVES REQUIRED. A step awaiting with no ask is a panel with no
  // question on it, and the screen would render a bid box for nothing.
  check('an awaiting step with no ask is not open',
    openAuction({ ...EMPTY, auction: { status: 'awaiting', carry } } as PublicRow), null)
  const open = openAuction({
    ...EMPTY, auction: { status: 'awaiting', ask, carry, closesAt: 99 },
  } as PublicRow)
  check('an awaiting step with an ask is', open?.closesAt, 99)
  check('...carrying whose turn it is', open?.carry.toAct, 'atreides')

  // ── the deadline is the server's, not this clock's ──────────────────────
  const running = { ...EMPTY, auction: { status: 'awaiting', ask, carry, closesAt: 1_000 } } as PublicRow
  check('before the moment, the window is live', auctionExpired(running, 999), false)
  check('at the moment, it has run out', auctionExpired(running, 1_000), true)
  check('after it, still run out', auctionExpired(running, 5_000), true)
  // NO DEADLINE IS NOT AN EXPIRED ONE. A step without closesAt would otherwise
  // read as permanently timed out and every seat would be offered the button
  // that ends somebody else's turn.
  check('a step with no deadline never expires',
    auctionExpired({ ...EMPTY, auction: { status: 'awaiting', ask, carry } } as PublicRow, 9e12), false)
  check('no auction never expires', auctionExpired(EMPTY, 9e12), false)

  // ── charity ─────────────────────────────────────────────────────────────
  const window_ = { turn: 4, expiresAt: 500, claims: [] }
  const withCharity = { ...EMPTY, charity: window_ } as PublicRow
  check('an open window with no answer yet is open', openCharity(withCharity, null)?.turn, 4)
  check('...and shut once this seat has answered it', openCharity(withCharity, 4), null)
  // THE TURN, NOT A FLAG. Next turn's window must open by itself, or a seat
  // that passed once never sees charity again.
  check('...but open again next turn', openCharity(withCharity, 3)?.turn, 4)
  check('no window, nothing to answer', openCharity(EMPTY, null), null)

  // ── who is in the match ─────────────────────────────────────────────────
  const seated = {
    ...EMPTY,
    players: [{ faction: 'atreides', seat: 'player-position-1', handCount: 0 }],
  } as unknown as PublicRow
  check('a seated faction is seated', seatedIn(seated, 'atreides' as FactionId), true)
  check('...and one that is not, is not', seatedIn(seated, 'fremen' as FactionId), false)
  check('a spectator is in nobody\'s roster', seatedIn(seated, null), false)
}

// ── what the table is told about a sale ───────────────────────────────────
// WINNER AND PRICE, NEVER THE CARD. The auction is card-blind by construction
// and the winner's hand is theirs alone; a line naming the card would hand the
// table something no seat is entitled to, in the one place everybody reads.
{
  const name = (f: FactionId) => (f === 'atreides' ? 'Atreides' : String(f))
  const lines = winLines({
    turn: 1, at: 17,
    awards: [{ winner: 'atreides' as FactionId, price: 9 }],
  }, name)
  check('a sale is announced', lines, ['Atreides wins a card for 9 spice.'])
  check('nothing to announce is no lines', winLines(null, name), [])
  // TWO CARDS IN ONE TURN, which the Harkonnen bonus makes ordinary.
  check('every award gets a line', winLines({
    turn: 1, at: 17,
    awards: [{ winner: 'harkonnen' as FactionId, price: 2 }, { winner: 'harkonnen' as FactionId, price: 2 }],
  }, name).length, 2)

  const rowLib = code('src/lib/dune/publicRow.ts')
  check('the line is built from the winner and the price alone',
    /\$\{nameOf\(a\.winner\)\} wins a card for \$\{a\.price\} spice/.test(rowLib), true)
  // The public row type must not name a card in the settlement at all — a
  // field cannot leak if the server has nowhere to put it.
  const lastAuction = rowLib.slice(rowLib.indexOf('export interface LastAuction'),
    rowLib.indexOf('export interface AuctionStep'))
  check('...and the settlement it reads has no card on it',
    /card|lot|index/.test(lastAuction), false)
}

// ── the feed drops what it has already applied ────────────────────────────
// A VERSION GUARD IS NOT OPTIONAL. Realtime can deliver out of order, and the
// acting client also gets its state back from its own POST — without this, a
// late echo of an older row rolls the board backwards, which looks exactly like
// somebody else undoing a move.
{
  const rows: Array<{ state: unknown; version: number } | null> = []
  const seen: Array<{ turn: number; version: number }> = []
  let reads = 0
  // Initialised to a no-op rather than null: the callbacks are handed to the
  // stub and stored, which narrowing cannot see, so a nullable one types as
  // never by the time it is called.
  let notify: (s: string) => void = () => {}

  // The changefeed handler is captured, so a frame can be delivered directly —
  // which is the only way to prove a stopped feed IGNORES one rather than
  // merely never being sent one.
  let deliver: (payload: { new: unknown }) => void = () => {}
  const channel = {
    on(_e: string, _f: unknown, cb: (payload: { new: unknown }) => void) { deliver = cb; return channel },
    subscribe(cb: (s: string) => void) { notify = cb; return channel },
  }
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => { reads++; return { data: rows.shift() ?? null, error: null } },
        }),
      }),
    }),
    channel: () => channel,
    removeChannel: () => {},
  }

  const tick = () => new Promise(r => setTimeout(r, 0))
  const feed = watchDuneMatch('m1', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: client as any,
    onRow: (row, version) => seen.push({ turn: row.turn, version }),
    pollMs: 60_000,          // the poll is checked separately; not here
  })

  await tick()
  check('an empty table reports nothing', seen.length, 0)

  rows.push({ state: { ...EMPTY, turn: 5 }, version: 3 })
  await feed.reread(); await tick()
  check('a row arrives', seen.map(s => s.turn), [5])

  // THE OLD ECHO, which is the whole point.
  rows.push({ state: { ...EMPTY, turn: 4 }, version: 2 })
  await feed.reread(); await tick()
  check('an older version is dropped', seen.map(s => s.turn), [5])

  // The same version twice is also an echo — the acting client's POST response
  // and the changefeed frame for the same write.
  rows.push({ state: { ...EMPTY, turn: 5 }, version: 3 })
  await feed.reread(); await tick()
  check('...and so is the same one again', seen.map(s => s.turn), [5])

  rows.push({ state: { ...EMPTY, turn: 6 }, version: 4 })
  await feed.reread(); await tick()
  check('a newer one goes through', seen.map(s => s.turn), [5, 6])

  // ── resync on connect ───────────────────────────────────────────────────
  // Messages sent while the socket was down are gone and never replayed, so
  // every subscribe — the first and every reconnect — reads the row outright.
  const before = reads
  rows.push({ state: { ...EMPTY, turn: 7 }, version: 5 })
  notify('SUBSCRIBED')
  await tick()
  check('connecting reads the row rather than waiting to be told', reads > before, true)
  check('...and catches up on what it missed', seen.map(s => s.turn), [5, 6, 7])

  // A LATE FRAME, delivered straight to the handler after teardown — this is
  // the real shape of the bug: the socket closes, one more message is already
  // in flight, and it lands in a component that is gone.
  feed.stop()
  const afterStop = reads
  deliver({ new: { state: { ...EMPTY, turn: 8 }, version: 6 } })
  await tick()
  check('a stopped feed ignores a frame still in flight', seen.map(s => s.turn), [5, 6, 7])
  // AND ASKS FOR NOTHING MORE. A torn-down screen holding a request open is a
  // response that arrives for nobody.
  rows.push({ state: { ...EMPTY, turn: 9 }, version: 7 })
  await feed.reread(); await tick()
  check('...and does not read again either', reads, afterStop)
  check('...so nothing new is applied', seen.map(s => s.turn), [5, 6, 7])
}

// ── the status is published, because a stalled board looks like a quiet one ──
{
  let status: string[] = []
  // Initialised to a no-op rather than null: the callbacks are handed to the
  // stub and stored, which narrowing cannot see, so a nullable one types as
  // never by the time it is called.
  let notify: (s: string) => void = () => {}
  const channel = {
    on() { return channel },
    subscribe(cb: (s: string) => void) { notify = cb; return channel },
  }
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    channel: () => channel,
    removeChannel: () => {},
  }
  const feed = watchDuneMatch('m1', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: client as any, onRow: () => {}, onStatus: s => status.push(s), pollMs: 60_000,
  })
  check('it starts by saying it is connecting', status.includes('connecting'), true)
  status = []
  notify('SUBSCRIBED')
  check('a live channel says so', status, ['live'])
  status = []
  notify('CHANNEL_ERROR')
  check('a broken one says that instead', status, ['offline'])
  feed.stop()
}

// ── the standing poll ─────────────────────────────────────────────────────
// SUBSCRIBED proves a channel exists, not that events reach it: delivery is
// RLS-filtered per subscriber, and a socket that authenticated before the
// session finished restoring is an anonymous subscriber — every event dropped,
// no error anywhere, and the badge still says live. The poll reads over REST,
// which always carries the JWT.
{
  let reads = 0
  const channel = { on() { return channel }, subscribe() { return channel } }
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { reads++; return { data: null, error: null } } }) }) }),
    channel: () => channel,
    removeChannel: () => {},
  }
  const feed = watchDuneMatch('m1', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: client as any, onRow: () => {}, pollMs: 5,
  })
  const first = reads
  await new Promise(r => setTimeout(r, 40))
  check('the row is read again without being told to', reads > first, true)
  feed.stop()
  const stopped = reads
  await new Promise(r => setTimeout(r, 30))
  check('...and stops when the feed does', reads, stopped)
  // THE TIMER ITSELF, which nothing outside can see. read() returns early once
  // the feed is stopped, so an interval left running reads nothing and is
  // behaviourally invisible — while still firing for the life of the tab, on
  // every match screen ever mounted. Sabotage removing the clearInterval walked
  // straight through the check above.
  check('...and the interval is actually cleared, not just made harmless',
    /clearInterval\(timer\)/.test(code('src/lib/dune/matchFeed.ts')), true)
}

// ── the screen: what it shows before it knows anything ────────────────────
// Effects do not run in static rendering, so this is the very first frame — and
// the claim is that the first frame is NOT a board. A screen that draws a
// plausible table before hearing from the server cannot tell a slow connection
// from a working one.
{
  const first = renderToStaticMarkup(createElement(DuneMatchScreen, { matchId: 'm1' }))
  check('it says it is finding your seat', first.includes('Finding your seat'), true)
  check('...and draws no board yet', first.includes('data-layer="dune-game"'), false)
  check('...and no tray', first.includes('data-layer="own-strip"'), false)

  const none = renderToStaticMarkup(createElement(DuneMatchScreen, { matchId: '' }))
  check('no match id is said out loud', none.includes('No match'), true)
}

// ── the wiring the screen cannot be asked about any other way ─────────────
{
  const view = code('src/components/dune/DuneMatchScreen.tsx')

  // WHICH SEAT, FROM THE DATABASE. The match id is in the address bar and can
  // be anything; the seat is a row matched against the signed-in user. A screen
  // that read its faction from the URL would let anyone play anyone.
  check('the seat comes from match_players', /from\('match_players'\)/.test(view), true)
  check('...matched against the signed-in user', /\.eq\('user_id', user\.id\)/.test(view), true)
  check('...and never from the query string',
    /searchParams|location\.search/.test(view), false)

  // THE PRIVATE HALF comes from the secrets channel and from nowhere else. If
  // it ever comes out of the public row the whole design is gone, and nothing
  // on screen would look any different.
  check('the tray is fed by the secrets channel', /startSecretsSync\(/.test(view), true)
  check('...for this seat\'s own row', /expectPlayerId: seat\.playerId/.test(view), true)
  check('...and never off the public row',
    /own=\{(row|publicRow)/.test(view), false)

  // THE HEAL. The own-row channel reads once and then trusts realtime; a
  // seat opening the match at the moment of the deal can read before the
  // rows land, with the channel not yet up when the insert fires — that
  // event is then gone for good, and setup shows "your four have not
  // reached this browser" until the clock answers. It happened, to the
  // Guild. Every public delivery now re-reads the own row: the public feed
  // has a version guard and a poll, and every secrets write bumps the
  // public row in the same transaction, so a missed event is at most one
  // public change behind instead of permanent.
  check('every public delivery re-reads the own row',
    /onRow: \(r, v\) => \{ setRow\(r\); setRowVersion\(v\) \}/.test(view), true)
  check('...through the read-your-own path',
    /if \(rowVersion < 0 \|\| !seat\) return/.test(view), true)
  check('...and the harness heals every seat the same way',
    /seats\.current\?\.refresh\(s\.login\.faction\)/.test(
      code('src/components/dune/DuneMultiSeatView.tsx')), true)

  // NOTHING IT SENDS NAMES A SEAT. The token says who is acting. duneDispatch
  // throws on a payload carrying identity, and this is what says the screen
  // never tries — including by handing dispatch another session.
  //
  // SCOPED TO THE CALLS, not to the file. A first draft searched the whole
  // source for 'playerId:' and matched the line that reads this seat OUT of
  // match_players — which is the correct code doing the correct thing, failing
  // a check aimed at payloads.
  const calls: string[] = []
  for (let i = view.indexOf('dispatchDuneAction('); i >= 0;
       i = view.indexOf('dispatchDuneAction(', i + 1)) {
    let depth = 0, j = i + 'dispatchDuneAction'.length
    for (; j < view.length; j++) {
      if (view[j] === '(') depth++
      else if (view[j] === ')') { depth--; if (depth === 0) break }
    }
    calls.push(view.slice(i, j + 1))
  }
  check('the screen does dispatch actions', calls.length >= 2, true)
  check('actions carry no seat',
    calls.filter(c => /actAs|asSeat|impersonate|onBehalfOf|playerId|userId|faction/.test(c)), [])
  // AND NO SECOND SESSION. dispatchDuneAction falls back to the app's own
  // client when none is given, which is the only one this page has — passing
  // one would mean this screen had built a session, and it has not.
  check('...and no second session',
    calls.filter(c => /client/.test(c)), [])

  // READ-YOUR-OWN-WRITES on both halves, AT EVERY PLACE THAT ACTS. A dropped
  // frame otherwise leaves the screen showing the state before this seat's own
  // move — a purse that never empties, a pass that never registers.
  //
  // PER CALL SITE, because there are two: send() for charity and the like, and
  // bid() for the auction. Searching the whole file for the re-reads passed
  // while either one of them had lost both, since the other still had them.
  const body = (from: string, to: string) => view.slice(view.indexOf(from), view.indexOf(to))
  const sendFn = body('const send = async', 'const claimCharity')
  const bidFn = body('const bid = async', 'if (!matchId) {')
  check('both action paths are there to check',
    sendFn.length > 100 && bidFn.length > 100, true)
  for (const [what, fn] of [['an action', sendFn], ['a bid', bidFn]] as const) {
    check(`${what} re-reads the public row`,
      /await live\.current\?\.reread\(\)/.test(fn), true)
    check(`...and this seat's own row after ${what}`,
      /await rereadOwn\(\)/.test(fn), true)
  }

  // AND SOMETHING CAN END A DEAD WINDOW. The bid panel offers Bid and Pass only
  // to the seat whose turn it is, so a player who walks away leaves nobody able
  // to press anything. The server answers for whoever is to act regardless of
  // who asked — but on six separate machines, somebody still has to ask.
  check('an expired auction can be pushed along', /expired && !spectating/.test(view), true)
  check('...off the stamped deadline', /auctionExpired\(row, now\)/.test(view), true)
}

// ── it is not the harness ─────────────────────────────────────────────────
// The harness is excluded from production builds because it holds several
// accounts' credentials in one page. This ships, so it must be nothing like it.
{
  const view = code('src/components/dune/DuneMatchScreen.tsx')
  check('no seat credentials', /password|VITE_DEV_SEATS|seatLoginsFromEnv/.test(view), false)
  check('no second client is built', /createClient|createSeatClient/.test(view), false)
  check('...and it does not reach into the dev harness', /@\/dev\//.test(view), false)
  // A DEV-ONLY GUARD WOULD BE WRONG HERE, and its absence should be deliberate
  // rather than forgotten: this is the screen a player opens.
  check('and it is not gated to dev builds', /import\.meta\.env\.DEV/.test(view), false)

  const main = code('src/main.tsx')
  check('the route reaches it', /has\('dune-match'\)/.test(main), true)
  check('...passing the id from the query string',
    /get\('dune-match'\)/.test(main), true)
  // The harness's own route stays behind the DEV flag it has always had.
  check('...while the harness stays dev-only',
    /DuneMultiSeatView && new URLSearchParams/.test(main), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
