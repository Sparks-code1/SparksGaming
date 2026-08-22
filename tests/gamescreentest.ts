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
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { DuneGameScreen, handOf, revealedFor } from '@/components/dune/DuneGameScreen'
import type { DuneGameScreenProps } from '@/components/dune/DuneGameScreen'
import { PhaseStrip } from '@/components/dune/PhaseStrip'
import { PlayerHud } from '@/components/dune/PlayerHud'
import { OwnStrip, PrivateView } from '@/components/dune/OwnStrip'
import { ChatPanel } from '@/components/dune/ChatPanel'
import { hudRows, pairAllies, allyOf, strongholdsHeld } from '@/lib/dune/hud'
import { DUNE_PHASES, KWISATZ_HADERACH_AT } from '@/types/Dune/Game'
import type { DuneGameState, DunePlayerPublic, Force } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
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

// ── the phase strip shows all nine ────────────────────────────────────────
{
  const strip = renderToStaticMarkup(createElement(PhaseStrip, { phase: 'Bidding', turn: 3 }))
  check('every phase is on the strip',
    DUNE_PHASES.filter(p => !strip.includes(`data-phase="${p}"`)), [])
  check('...in the order the turn runs them',
    DUNE_PHASES.map(p => strip.indexOf(`data-phase="${p}"`))
      .every((at, i, all) => i === 0 || at > all[i - 1]), true)
  // Exactly one, and the right one. Marking none is a strip that says nothing;
  // marking several is worse, because it looks like it is saying something.
  check('exactly one phase is current', strip.split('data-current="true"').length - 1, 1)
  check('...and it is the one the state names',
    /data-phase="Bidding" data-current="true"/.test(strip), true)
  check('the current phase is red', strip.includes('background:#c9542a'), true)
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
  check('the pair is bracketed', hud.split('data-bracket="yes"').length - 1, 2)
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
