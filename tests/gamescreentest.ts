// The game screen: what is on it, and — mostly — what is not.
//
// The layout claims are ordinary and easy: nine phases in order, one row per
// player, allies adjacent, the tracker only where it belongs.
//
// The claims worth the file are the other kind. This screen is the first place
// public and private state are rendered SIDE BY SIDE, six inches apart on one
// page, and the only thing keeping them apart is which prop each component
// takes. A leak here would not look like anything: the spice would simply be in
// the HUD, and the HUD would render it exactly as happily as the strip does.
// So the tests below say where each secret is allowed to appear and check it
// appears nowhere else.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { DuneGameScreen, handOf, revealedFor } from '@/components/dune/DuneGameScreen'
import type { DuneGameScreenProps } from '@/components/dune/DuneGameScreen'
import { PlayerHud } from '@/components/dune/PlayerHud'
import { OwnStrip, PrivateView, FactionCard } from '@/components/dune/OwnStrip'
import { CARD_THUMB, CARD_ZOOM } from '@/components/dune/OwnStrip'
import { ChatPanel } from '@/components/dune/ChatPanel'
import { hudRows, pairAllies, allyOf, strongholdsHeld } from '@/lib/dune/hud'
import { DUNE_TRACK } from '@/data/dune/boardData'
import { DUNE_PHASES, KWISATZ_HADERACH_AT } from '@/types/Dune/Game'
import type { DuneGameState, DunePlayerPublic, Force } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { factionById, findLeader } from '@/data/dune/factions'
import { TraitorCard, TraitorCardBack, TRAITOR_RULES } from '@/components/dune/TraitorCard'
import { FACTION_LOOK } from '@/components/dune/SeatLayer'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// ── the fixture ───────────────────────────────────────────────────────────
const player = (
  faction: FactionId, seat: string, over: Partial<DunePlayerPublic> = {},
): DunePlayerPublic => ({ faction, seat, reserves: 7, handCount: 2, ally: null, ...over })

const force = (faction: FactionId, territoryId: string, sector: string, count: number): Force =>
  ({ faction, territoryId: territoryId as Force['territoryId'],
     sector: sector as Force['sector'], count })

// territory-13 is Arrakeen, a stronghold. territory-01 is not.
const state: DuneGameState = {
  storm: 'sector-1', turn: 3, phase: 'Bidding', shieldWall: 'intact', mode: 'basic',
  spiceDeck: { remaining: 14, discardA: [], discardB: [] },
  players: [
    player('atreides', 'player-position-1', { handCount: 3 }),
    player('harkonnen', 'player-position-2'),
    player('emperor', 'player-position-3'),
    player('fremen', 'player-position-4'),
  ],
  forces: [
    force('atreides', 'territory-13', 'sector-10', 6),
    force('atreides', 'territory-13', 'sector-9', 2),
    force('atreides', 'territory-01', 'sector-1', 1),
    force('harkonnen', 'territory-13', 'sector-10', 4),
  ],
  spiceOnBoard: { 'territory-01': 8 },
  awaiting: 'harkonnen',
}

// Values chosen to be unmistakable in a wall of markup. If any of these turns
// up somewhere it should not, the assertion names the exact secret that leaked.
const SECRET_SPICE = 4242
const SECRET_CARD = TREACHERY_CARDS[0]
const SECRET_TRAITOR = 'Piter De Vries'          // Harkonnen, so not this seat's own
const own: DuneSecrets = {
  spice: SECRET_SPICE, cards: [SECRET_CARD.id], traitors: [SECRET_TRAITOR],
}

const base: DuneGameScreenProps = {
  state, seat: 'atreides', own, chat: [], now: 1_000,
}
const draw = (over: Partial<DuneGameScreenProps> = {}) =>
  renderToStaticMarkup(createElement(DuneGameScreen, { ...base, ...over }))

// ── the secrets appear in exactly one place ───────────────────────────────
// Not "the HUD does not show spice" — that is one component's word for it. The
// whole screen is rendered, every secret is looked for, and the ONLY subtree
// allowed to hold one is the strip along the bottom.
{
  const full = draw()
  const stripAt = full.indexOf('data-layer="own-strip"')
  check('the own strip is rendered and can be located', stripAt > 0, true)
  const abovePublic = full.slice(0, stripAt)

  for (const [what, needle] of [
    ['spice', String(SECRET_SPICE)],
    ['a card name', SECRET_CARD.name],
    ['a traitor', SECRET_TRAITOR],
  ] as const) {
    check(`${what} appears nowhere above the strip`, abovePublic.includes(needle), false)
  }
  // And the strip does show the spice, or the check above passes on a screen
  // that simply never renders it.
  check('...while the strip itself shows the spice',
    full.slice(stripAt).includes(String(SECRET_SPICE)), true)
}

// ── a spectator holds nothing, and is shown nothing ───────────────────────
{
  const watching = draw({ seat: null, own: null })
  check('a spectator gets no own strip', watching.includes('data-layer="own-strip"'), false)
  check('...and still gets the board', watching.includes('data-layer="board"'), true)
  check('...and the HUD', watching.includes('data-layer="player-hud"'), true)
  // The screen is handed the secrets anyway. Somebody WILL pass them one day —
  // a spectating player, a stale prop — and the seat is what decides, not the
  // absence of data.
  // The likely way this breaks is not a deleted guard but a helpful fallback —
  // `?? rows[0]` so the strip "has something to render" — which quietly hands
  // the watcher the first player's strip filled with whatever secrets were
  // passed. The check below is on the RENDERED SECRET, so any route there fails
  // it however reasonable the code looked.
  const leaky = draw({ seat: null, own })
  for (const [what, needle] of [
    ['spice', String(SECRET_SPICE)],
    ['a card name', SECRET_CARD.name],
    ['a traitor', SECRET_TRAITOR],
  ] as const) {
    check(`a seatless screen handed secrets still shows no ${what}`,
      leaky.includes(needle), false)
  }
}

// ── the hand is face down until it is asked for ───────────────────────────
{
  const rows = hudRows(state)
  const mine = rows.find(r => r.faction === 'atreides')!
  const strip = renderToStaticMarkup(createElement(OwnStrip, {
    seat: 'atreides' as FactionId, mode: 'basic' as const, own, player: mine, ally: null,
  }))
  check('a closed hand names no card', strip.includes(SECRET_CARD.name), false)
  check('...and no traitor', strip.includes(SECRET_TRAITOR), false)
  // The count IS shown — it is public, and it is what the button is for.
  check('...but says how many there are', strip.includes('aria-label="Treachery cards: 1"'), true)
  check('...and how many traitors', strip.includes('aria-label="Traitor cards: 1"'), true)

  // The absence above is only worth something if presence is reachable.
  const opened = renderToStaticMarkup(createElement(PrivateView, {
    kind: 'treachery' as const, hand: [SECRET_CARD], traitors: [],
  }))
  check('the opened view does name the card', opened.includes(SECRET_CARD.name), true)
  const traitorsOpen = renderToStaticMarkup(createElement(PrivateView, {
    kind: 'traitors' as const, hand: [], traitors: [SECRET_TRAITOR],
  }))
  check('...and the opened traitors name the leader',
    traitorsOpen.includes(SECRET_TRAITOR), true)
}

// ── the HUD carries no secret, by shape ───────────────────────────────────
// A derived row is the only thing the HUD is given, so a secret would have to
// be added to the public player type to get there. This is what would fail if
// somebody did.
{
  const rows = hudRows(state)
  const json = JSON.stringify(rows)
  check('no row holds a spice figure', /"spice"/.test(json), false)
  check('...or a card list', /"cards"/.test(json), false)
  check('...or a traitor', /"traitors"/.test(json), false)

  // Pollute the public state with a secret and confirm the derivation drops it.
  // The row is BUILT field by field rather than spread from the player, which is
  // what makes this true — a spread would carry anything anyone ever added.
  const polluted = {
    ...state,
    players: state.players.map(p => ({ ...p, spice: SECRET_SPICE, traitors: [SECRET_TRAITOR] })),
  }
  check('a secret smuggled into the public row does not reach the HUD',
    JSON.stringify(hudRows(polluted)).includes(String(SECRET_SPICE)), false)
}

// ── the numbers are the board's ───────────────────────────────────────────
{
  const rows = hudRows(state)
  const atreides = rows.find(r => r.faction === 'atreides')!
  check('forces are summed across every sector', atreides.forcesOnBoard, 9)
  // Arrakeen in two sectors is ONE stronghold. Counting stacks scores it twice,
  // and strongholds held is how the game is won.
  check('a stronghold in two sectors counts once', atreides.strongholds, 1)
  check('...and a plain territory is not a stronghold',
    strongholdsHeld([force('fremen', 'territory-01', 'sector-1', 5)], 'fremen'), 0)
  // An emptied stack lingers in the array until something prunes it.
  check('a stack of zero holds nothing',
    strongholdsHeld([force('fremen', 'territory-13', 'sector-10', 0)], 'fremen'), 0)
  check('a faction with nothing on the board reads zero',
    rows.find(r => r.faction === 'emperor')!.forcesOnBoard, 0)
}

// ── the phase is marked on the board's own nine ──────────────────────────
// The board prints the nine medallions along its top edge, left to right, one
// per phase. There is no strip: a second list of the same nine across the top
// of the screen said the same thing worse, without the symbols.
{
  // The claim the whole mark rests on. DUNE_TRACK is generated by walking the
  // artwork, and if that walk ever came back in a different order the ring
  // would land on a confidently wrong circle — which looks exactly like a
  // correct one.
  check('the nine stops run left to right', DUNE_TRACK.length, 9)
  check('...in ascending x, so index n is phase n+1',
    DUNE_TRACK.every((t, i) => i === 0 || t.x > DUNE_TRACK[i - 1].x), true)

  const full = draw()
  check('exactly one medallion is marked',
    full.split('data-layer="phase-track"').length - 1, 1)
  check('...the one the state names', /data-phase="Bidding"/.test(full), true)
  // Bidding is the fourth phase, so the mark belongs on the fourth circle.
  check('...which is the fourth', /data-phase-number="4"/.test(full), true)
  check('...and it is drawn at that circle\'s coordinates',
    full.includes(`cx="${DUNE_TRACK[3].x}"`), true)

  // Each phase lands on its own circle, and no two share one.
  const marked = DUNE_PHASES.map(phase => {
    const m = draw({ state: { ...state, phase } }).match(/data-phase-number="(\d+)"/)
    return m ? Number(m[1]) : null
  })
  check('every phase marks a different circle, in order',
    marked, [1, 2, 3, 4, 5, 6, 7, 8, 9])

  // The turn number lived on the strip. It has to live somewhere still.
  //
  // SCOPED TO THE HUD. `data-turn` is on the board's dial mark as well, which
  // was added after this check and quietly satisfied it — hiding the HUD's turn
  // entirely left the suite green, because the dial was answering for it.
  const hudMarkup = full.slice(full.indexOf('data-layer="player-hud"'),
                              full.indexOf('data-layer="own-strip"'))
  check('the turn is still shown', hudMarkup.includes('data-turn="3"'), true)
  check('...in the HUD, which is a different element from the board dial',
    /data-layer="turn-dial"[^>]*data-turn="3"/.test(full), true)
}

// ── allies read as a pair ─────────────────────────────────────────────────
{
  const allied: DunePlayerPublic[] = [
    player('atreides', 'player-position-1', { ally: 'fremen' }),
    player('harkonnen', 'player-position-2'),
    player('emperor', 'player-position-3'),
    player('fremen', 'player-position-4', { ally: 'atreides' }),
  ]
  const rows = hudRows({ players: allied, forces: [] })
  const order = pairAllies(rows).map(r => r.faction)
  check('allies are moved next to each other',
    Math.abs(order.indexOf('atreides') - order.indexOf('fremen')), 1)
  check('...and nobody is dropped or duplicated', order.length, 4)
  check('...and the pair keeps the earlier one\'s place', order[0], 'atreides')

  // With the pair in the MIDDLE, anything that stops or restarts the walk after
  // placing them loses the rows below. Allying the first and last hid that: by
  // the time the mate came round there was nothing left to drop.
  const midPair = hudRows({
    players: [
      player('atreides', 'player-position-1', { ally: 'emperor' }),
      player('harkonnen', 'player-position-2'),
      player('emperor', 'player-position-3', { ally: 'atreides' }),
      player('fremen', 'player-position-4'),
    ],
    forces: [],
  })
  const midOrder = pairAllies(midPair).map(r => r.faction)
  check('a pair in the middle keeps everyone below it',
    midOrder, ['atreides', 'emperor', 'harkonnen', 'fremen'])

  const hud = renderToStaticMarkup(createElement(PlayerHud, {
    rows, awaiting: null, seat: 'atreides' as FactionId,
  }))
  // ONE mark, BETWEEN the two bubbles — an alliance is a pair, and a decoration
  // drawn on each of them separately says something weaker.
  check('the pair is joined, once', hud.split('data-bracket="yes"').length - 1, 1)
  check('...and named', hud.includes('ALLIED WITH FREMEN'), true)

  // AN ALLIANCE IS A PAIR. One side claiming it alone is a bug, not a
  // relationship — bracketing on one seat's word draws a mark round somebody
  // who has not agreed to it.
  const oneSided = [
    player('atreides', 'player-position-1', { ally: 'fremen' }),
    player('fremen', 'player-position-4'),
  ]
  check('a one-sided claim is not an alliance',
    allyOf(oneSided, oneSided[0]), null)
  const half = renderToStaticMarkup(createElement(PlayerHud, {
    rows: hudRows({ players: oneSided, forces: [] }), awaiting: null, seat: null,
  }))
  check('...and is not bracketed', half.includes('data-bracket="yes"'), false)
}

// ── whose turn it is, where everyone is looking ───────────────────────────
{
  const full = draw()
  check('the awaited seat is ringed on the board',
    full.includes('data-awaiting="harkonnen"'), true)
  check('...and marked in the HUD',
    /data-faction="harkonnen" data-awaiting="true"/.test(full), true)
  const idle = draw({ state: { ...state, awaiting: null } })
  check('with nobody awaited, nothing is ringed', idle.includes('data-layer="awaiting"'), false)
}

// ── the faction card has two faces ──────────────────────────────────────
// FRONT: the advantages every game has, plus the two numbers a player asks for
// every turn. BACK: everything the advanced game adds, behind a control that
// says so.
//
// The split is the point. The Atreides' advanced prose runs to 854 characters
// about the Kwisatz Haderach and used to drown the three advantages above it;
// the Karama power is not a standing advantage at all but a thing you may spend
// a card on. Neither belongs in front of somebody reading their basic
// advantages mid-turn, and both are worth having.
{
  const atreides = factionById('atreides')!
  const card = renderToStaticMarkup(createElement(FactionCard, { faction: atreides }))

  // The front.
  check('the front carries the advantages every game has',
    card.includes(atreides.abilities.bidding!), true)
  check('...says how many free revivals the faction gets',
    card.includes(`data-free-revivals="${atreides.freeRevivals}"`), true)
  // The NUMBER, not just the attribute — an attribute nothing renders beside it
  // is a fact only a test can see.
  check('...in words a player can read',
    new RegExp(`${atreides.freeRevivals} Force`).test(card), true)
  // FIRST on the card. It is the one line here that is looked up rather than
  // read — once every Revival phase — and at the foot of four paragraphs of
  // rules it was the hardest thing on the card to find.
  check('...and before the rules, not after them',
    card.indexOf('FREE REVIVAL') < card.indexOf('BIDDING'), true)
  check('...and what the faction brings to an alliance',
    card.includes(atreides.alliance.slice(0, 40)), true)
  check('...and the faction mark, beside the name',
    card.includes('<title>Atreides</title>'), true)
  check('...and nothing from the advanced game',
    card.includes(atreides.advanced.kwisatzHaderach!.slice(0, 60))
      || card.includes('use a Karama Card to look at'), false)
  check('...marked as the front', card.includes('data-face="front"'), true)

  // The way through to the back has to SAY what is on it. A bare arrow is a
  // gesture; this is a promise about the other side.
  check('the front offers the advanced advantages',
    card.includes('See advanced game advantages'), true)
  check('...naming the faction for a screen reader',
    card.includes('aria-label="Atreides advanced game advantages"'), true)

  // The back. Only reachable through a click, so it is rendered on its own —
  // the same argument as PrivateView: a claim about what is hidden is worth
  // nothing unless the thing it hides can be shown.
  const back = renderToStaticMarkup(createElement(FactionCard, { faction: atreides }))
  check('the front is what renders before anything is clicked',
    back.includes('data-face="advanced"'), false)
}

// ── the two cards open as panels rather than sitting in the strip ─────────
// They are paragraphs of rules text, and a paragraph squeezed into a strip is a
// paragraph nobody reads. Buttons open them into a floating panel the player can
// drag, resize and leave up.
{
  const rows = hudRows(state)
  const mine = rows.find(r => r.faction === 'atreides')!
  const strip = renderToStaticMarkup(createElement(OwnStrip, {
    seat: 'atreides' as FactionId, mode: 'advanced' as const, own,
    player: mine, ally: 'fremen' as FactionId,
  }))
  const atreides = factionById('atreides')!
  const fremen = factionById('fremen')!

  check('the strip offers the faction card', strip.includes('aria-label="Faction card"'), true)
  check('...and the alliance card when allied',
    strip.includes('aria-label="Alliance card"'), true)
  // SHUT UNTIL ASKED FOR. The point of moving them out was that the strip stops
  // carrying paragraphs; a strip that renders them anyway has gained a button
  // and changed nothing.
  check('the strip carries no faction prose',
    strip.includes(atreides.abilities.bidding!), false)
  check('...and no alliance prose', strip.includes(fremen.alliance.slice(0, 40)), false)

  // No ally, no alliance card — an empty one is an offer of nothing.
  const alone = renderToStaticMarkup(createElement(OwnStrip, {
    seat: 'atreides' as FactionId, mode: 'advanced' as const, own, player: mine, ally: null,
  }))
  check('an unallied seat is offered no alliance card',
    alone.includes('aria-label="Alliance card"'), false)
}

// ── a treachery card opens big enough to read ────────────────────────────
// The thumbnails are drawn at a fifth of the size the card was designed at, so
// their rules text is a grey smudge. The thumbnail says WHICH card; opening it
// says what the card does.
{
  const opened = renderToStaticMarkup(createElement(PrivateView, {
    kind: 'treachery' as const, hand: [SECRET_CARD], traitors: [], onOpenCard: () => {},
  }))
  check('each card in the hand can be opened',
    opened.includes(`aria-label="Open ${SECRET_CARD.name}"`), true)
  // Given nothing to call, the cards are inert rather than pretending.
  const inert = renderToStaticMarkup(createElement(PrivateView, {
    kind: 'treachery' as const, hand: [SECRET_CARD], traitors: [],
  }))
  check('...and are not clickable when nothing is listening',
    /cursor:zoom-in/.test(inert), false)
  // The ratio IS the feature. Opening a card at the size it already was would
  // look implemented and do nothing, and the markup would not say so.
  check('an opened card is meaningfully bigger than the thumbnail',
    CARD_ZOOM >= CARD_THUMB * 2, true)
}

// ── the board fills the column, and the tray sits under the board ────────
// Neither of these is visible to a static render — they are questions about
// LAYOUT, and renderToStaticMarkup does no layout. What CAN be checked is the
// arithmetic they rest on, which is where both of them went wrong:
//
//   The board was given a width and left to work its height out from it, so it
//   sized itself off the column's width and spilled to 174% of the column's
//   height. Given both, its own viewBox scales it to the largest size that fits.
//
//   The tray was laid under the whole window while the board sat in a column
//   between two panels, so its centre and the board's were 530px apart at 1920
//   — and further whenever the chat was shut, because the window's centre does
//   not move when the board's does.
{
  const full = draw()
  // Both layers of the board get BOTH dimensions. One without the other is what
  // makes an SVG size itself off its viewBox instead of fitting its box.
  check('the board overlay is given both dimensions',
    /position:absolute;inset:0;width:100%;height:100%/.test(full), true)
  const boardSrc = readFileSync('src/components/dune/DuneBoard.tsx', 'utf8')
  check('...and so is the board image it sits on',
    boardSrc.includes('width="100%" height="100%"'), true)
  // Read from the board root's OWN style block, not from the file at large:
  // the inner image div is pinned too, so looking anywhere passed on a root
  // that had gone back to being a floating, content-sized box. Matched on the
  // properties rather than the exact line, which broke the moment the line was
  // reflowed to take another rule.
  const rootAt = boardSrc.indexOf('data-layer="board"')
  const boardRoot = boardSrc.slice(rootAt, rootAt + boardSrc.slice(rootAt).indexOf('}}>'))
  // THE COLUMN RESERVES THE BOARD'S IDEAL WIDTH — the width a board as tall as
  // the window would need. Without that basis the side columns' flex-grow takes
  // width the board still wants, and it ends up SMALLER than before they were
  // allowed to grow at all: 510x578 at 1280x720, against 539x611 before. The
  // ratio is the board's own, so the reservation cannot drift from the shape it
  // is reserving for.
  check('the board column reserves the width a full-height board needs',
    full.includes('calc(100vh * ' + (970 / 1099) + ')'), true)

  check('...both pinned to the column, so the percentages resolve',
    /position: 'absolute'/.test(boardRoot) && /inset: 0/.test(boardRoot), true)

  // THE TRAY IS IN THE RIGHT-HAND COLUMN, under the HUD, and no longer across
  // the bottom of the window. That is not a tidying-up: the board is bound by
  // HEIGHT — it is taller than it is wide — so anything laid across the bottom
  // comes straight off it. The tray cost it 153px and 36% of its area.
  //
  // Which is also why widening the side panels was the wrong answer to the same
  // complaint: it would have handed the board width it cannot use.
  const hudAt = full.indexOf('data-layer="player-hud"')
  const trayAt = full.indexOf('data-layer="own-strip"')
  check('the HUD and the tray are both on the screen', hudAt > 0 && trayAt > 0, true)
  check('...with the tray after the HUD, in one column', trayAt > hudAt, true)
  // Nothing between them but the column's own markup: a board, a chat panel or
  // a main element in the gap would mean they are not in the same column.
  const gap = full.slice(hudAt, trayAt)
  check('...and nothing else between them',
    /data-layer="board"|<main|data-layer="chat"/.test(gap), false)
  check('the tray no longer spans the window under the panels',
    /margin-left:\d+px;margin-right:\d+px/.test(full), false)

}

// ── the HUD is bubbles, and says why one is red ──────────────────────────
{
  const rows = hudRows(state)
  const hud = renderToStaticMarkup(createElement(PlayerHud, {
    rows, awaiting: 'harkonnen' as FactionId, seat: 'atreides' as FactionId, turn: 3,
  }))
  check('every player is a bubble',
    (hud.match(/border-radius:999px/g) ?? []).length, rows.length)
  check('...carrying their own mark, not just their colour',
    rows.filter(r => !hud.includes(`<title>${FACTION_LOOK[r.faction].name}</title>`)), [])

  // THE RED RING IS EXPLAINED. It marks the seat the table is waiting on, and
  // the first question anyone asked of this screen was why one player was red —
  // so it says so in words rather than relying on the colour being known.
  check('the awaited seat is marked', /data-faction="harkonnen" data-awaiting="true"/.test(hud), true)
  check('...and says what the mark means', hud.includes('WAITING ON THEM'), true)
  check('...on that seat alone', (hud.match(/WAITING ON THEM/g) ?? []).length, 1)
  const idle = renderToStaticMarkup(createElement(PlayerHud, {
    rows, awaiting: null, seat: null, turn: 3,
  }))
  check('with nobody awaited, nothing says it', idle.includes('WAITING ON THEM'), false)
}

// ── the drawer is wired to the enlarged card ─────────────────────────────
// READ FROM THE SOURCE, like transportwiringtest reads the edge functions, and
// for the same reason. Both claims below are about state that only exists after
// a click, and renderToStaticMarkup does not click: the drawer opens on internal
// state, so a static render can never reach the branch that wires the card to
// the panel. Dropping `onOpenCard` and never rendering `zoom` both left every
// other check in this file green.
//
// This asserts the WIRING, not the behaviour. Whether an opened card is bigger
// than a thumbnail is checked above, and whether the panel renders one is
// checked on PrivateView; whether either RUNS AT ALL is only here.
{
  const src = readFileSync('src/components/dune/OwnStrip.tsx', 'utf8')
  check('the strip can be read', src.length > 0, true)
  check('the drawer hands its cards somewhere to open',
    /onOpenCard=\{setZoom\}/.test(src), true)
  check('...and the opened card is actually rendered',
    /\{zoom && \(/.test(src), true)
  check('...into a panel the player can move',
    /<DraggableResizable[^>]*[\s\S]{0,400}data-layer="card-zoom"/.test(src), true)
  // The two cards are panels, not panes: opened from a button, not inlined.
  check('the faction card is opened from a button',
    /showFaction && \(/.test(src), true)
  check('...and the alliance card too', /showAlliance && allyFaction && \(/.test(src), true)
}

// ── a traitor is a card, not a counter ──────────────────────────────────
// A disc is what a leader is ON THE BOARD: a counter you move and put in the
// tanks. A traitor is a card in your hand, and it has to carry four sentences
// that decide a battle — which is the whole reason it cannot stay a disc.
{
  const found = findLeader(SECRET_TRAITOR)!
  const card = renderToStaticMarkup(createElement(TraitorCard, {
    leader: found.leader, faction: found.faction,
  }))
  check('the card names the leader', card.includes(SECRET_TRAITOR), true)
  check("...and whose leader they are", card.includes('HARKONNEN'), true)
  // The strength is what you are PAID in spice when they turn, so it is a
  // number the card has to carry rather than a decoration.
  check('...and their fighting strength',
    card.includes(`data-strength="${found.leader.strength}"`), true)
  // THE FRONT IS THE FACE. Fitting the rules on it too left the portrait a
  // nineteen percent band with the top of a head in it — cropped past the point
  // where one leader can be told from another, which is the only job the front
  // has. They are on the back, which has the whole card for them.
  check('the front does not try to carry the rules as well',
    TRAITOR_RULES.some(line => card.includes(line.slice(0, 40))), false)
  check('...and shows the whole portrait rather than a crop of it',
    card.includes('object-fit:contain'), true)

  // The back, rendered on its own — it only exists after a click, and a claim
  // about what a card says is worth nothing if the side saying it is unreachable.
  const rules = renderToStaticMarkup(createElement(TraitorCardBack, {
    faction: found.faction,
  }))
  check('every line of what happens when they turn is on the back',
    TRAITOR_RULES.filter(line => !rules.includes(line.slice(0, 40))), [])

  // A leader with no portrait yet still gets a card rather than a broken image.
  const noArt = renderToStaticMarkup(createElement(TraitorCard, {
    leader: { name: 'Nobody At All', strength: 3 }, faction: 'atreides' as FactionId,
  }))
  check('a leader with no portrait still gets a card',
    noArt.includes('Nobody At All') && !noArt.includes('<img'), true)
}

// ── both hands travel, and the ally's card is his own ───────────────────
// Read from the source: these open on internal state, which no static render
// reaches. Same argument as the enlarged card above.
{
  const src = readFileSync('src/components/dune/OwnStrip.tsx', 'utf8')
  // MOVABLE. A hand you can only read in a drawer pinned to the bottom of a
  // column is a hand you cannot hold beside the territory you are thinking
  // about, and these two are what a player reads WHILE looking at the board.
  check('the treachery hand opens into a panel that moves',
    /open === 'treachery' && \([\s\S]{0,200}<DraggableResizable/.test(src), true)
  check('...and so does the traitor hand',
    /open === 'traitors' && \([\s\S]{0,200}<DraggableResizable/.test(src), true)
  check('...each remembering its own place',
    src.includes('dune-hand-') && src.includes('dune-traitors-'), true)

  // The ally's card carries the ALLY's mark, not this seat's — it is their
  // card, and the whole point of it is that it is somebody else's.
  check("the alliance card carries the ally's own mark",
    /showAlliance && allyFaction && \([\s\S]{0,900}SeatMark faction=\{allyFaction\.id\}/.test(src),
    true)
}
// ── the leader discs are readable ────────────────────────────────────────
// Every battle in Dune is a leader and a number, and the number is on the disc.
// At 28px across it was a smudge; this is the room the faction card gave back.
{
  const rows = hudRows(state)
  const mine = rows.find(r => r.faction === 'atreides')!
  const strip = renderToStaticMarkup(createElement(OwnStrip, {
    seat: 'atreides' as FactionId, mode: 'basic' as const, own, player: mine, ally: null,
  }))
  const atreides = factionById('atreides')!
  check('every leader is on the strip',
    atreides.leaders.filter(l => !strip.includes(`${l.name} — strength ${l.strength}`)), [])
  check('...with the strength drawn, not just in a tooltip',
    atreides.leaders.every(l => strip.includes(`>${l.strength}</text>`)), true)
  // A floor on the size. The discs are laid out 62 apart, so the row's own
  // viewBox is what says how big they are allowed to be.
  check('...at a size a number can be read at',
    strip.includes(`viewBox="0 0 ${atreides.leaders.length * 62} 62"`), true)
  // The viewBox alone is not the size on screen. The panel's own allotment is
  // what the discs are drawn into, and shrinking that shrinks them however
  // generous the viewBox is — which is exactly what a sabotage did while every
  // other check here stayed green.
  check('...in a box wide enough to hold them',
    strip.includes(`max-width:${atreides.leaders.length * 62}px`), true)
}

// ── the Kwisatz Haderach, in the one game he exists in ────────────────────
{
  const row = (faction: FactionId, battleLosses: number) =>
    hudRows({
      players: [player(faction, 'player-position-1', { battleLosses })], forces: [],
    })[0]
  const strip = (faction: FactionId, mode: 'basic' | 'advanced', battleLosses: number) =>
    renderToStaticMarkup(createElement(OwnStrip, {
      seat: faction, mode, own, player: row(faction, battleLosses), ally: null,
    }))

  check('the advanced Atreides get the tracker',
    strip('atreides', 'advanced', 3).includes('data-layer="kwisatz-haderach"'), true)
  // The condition that gets forgotten: he does not exist in the basic game, so
  // a tracker there is a promise the rules will not keep.
  check('the basic game has none',
    strip('atreides', 'basic', 3).includes('data-layer="kwisatz-haderach"'), false)
  check('and nor does anybody else',
    strip('harkonnen', 'advanced', 3).includes('data-layer="kwisatz-haderach"'), false)

  const three = strip('atreides', 'advanced', 3)
  check('he unlocks at seven, and the tests know the number', KWISATZ_HADERACH_AT, 7)
  check('the pips count the losses', three.split('data-pip="lit"').length - 1, 3)
  check('...and there are seven of them', three.split(/data-pip="(lit|dark)"/).length - 1, 14)
  check('six losses is not enough',
    strip('atreides', 'advanced', 6).includes('Kwisatz Haderach available'), false)
  check('...out of the seven that unlock him',
    three.split(/data-pip="(lit|dark)"/).length - 1, KWISATZ_HADERACH_AT * 2)
  check('...and he is not available yet', three.includes('available'), false)
  check('at seven he is', strip('atreides', 'advanced', KWISATZ_HADERACH_AT)
    .includes('Kwisatz Haderach available'), true)
}

// ── the auction floats, it does not replace ───────────────────────────────
{
  const bidding: NonNullable<DuneGameScreenProps['bidding']> = {
    ask: {
      kind: 'treachery-bid', index: 0, cardCount: 4,
      high: null, minimum: 1,
      hands: { atreides: 3, harkonnen: 2, emperor: 2, fremen: 2 },
    },
    order: ['atreides', 'harkonnen', 'emperor', 'fremen'],
    toAct: 'atreides', passed: [], closesAt: 15_000,
    onBid: () => {}, onPass: () => {},
  }
  const running = draw({ bidding })
  check('the board is still there under the auction',
    running.includes('data-layer="board"'), true)
  check('...and the panel is over it',
    running.includes('aria-label="treachery bidding"'), true)
  check('...on a scrim, so the board is dimmed', /background:#000000a8/.test(running), true)

  // PRESCIENCE. The panel's revealed card comes off this seat's own secrets row
  // and from nowhere else — the auction props have no field for it.
  const asked = JSON.stringify(bidding)
  check('the auction props name no card',
    TREACHERY_CARDS.filter(c => asked.includes(c.id) || asked.includes(c.name)).map(c => c.id), [])
  check('a seat with no reveal sees no card face up',
    revealedFor({ spice: 0 }), null)
  check('...and one with a reveal sees exactly that card',
    revealedFor({ spice: 0, prescience: SECRET_CARD.id })?.id, SECRET_CARD.id)
  check('the hand comes off the same row',
    handOf({ spice: 0, cards: [SECRET_CARD.id] }).map(c => c.id), [SECRET_CARD.id])
  check('...and an unopened channel is an empty hand, not a crash',
    handOf(null), [])
}

// ── chat opens and shuts ──────────────────────────────────────────────────
{
  const messages = [
    { id: 'm1', faction: 'fremen' as FactionId, text: 'Water for the dead', at: 1 },
  ]
  const open = renderToStaticMarkup(createElement(ChatPanel, {
    messages, collapsed: false, onToggle: () => {}, onSend: () => {},
  }))
  check('an open panel shows what was said', open.includes('Water for the dead'), true)
  check('...and lets you answer', open.includes('aria-label="Message"'), true)

  const shut = renderToStaticMarkup(createElement(ChatPanel, {
    messages, collapsed: true, onToggle: () => {}, onSend: () => {}, unread: 3,
  }))
  check('a collapsed panel hides what was said', shut.includes('Water for the dead'), false)
  check('...but says something arrived', shut.includes('data-unread="3"'), true)

  // A spectator may read and not speak. No composer at all, rather than a
  // disabled one: a box that cannot be typed in is an invitation then a refusal.
  const watching = renderToStaticMarkup(createElement(ChatPanel, {
    messages, collapsed: false, onToggle: () => {},
  }))
  check('a spectator gets no composer', watching.includes('aria-label="Message"'), false)
  check('...but still reads the table', watching.includes('Water for the dead'), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
