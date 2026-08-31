// Setup as a window beside the board, answered ON the board.
//
// The panel this replaces held steppers and dropdowns — numbers describing
// places, floating in front of the places themselves. Now the map takes the
// clicks, so the claims worth this file changed shape:
//
//   The board offers targets ONLY where a click means something: the Fremen's
//   three territories to the Fremen, the whole board to the Bene Gesserit, and
//   only once the Fremen have answered. A target on somebody else's screen is
//   a button whose one outcome is a refusal.
//
//   Starred forces and advisors draw as what they are — a star badge on the
//   bubble, a checkered fill — because setup is where both first exist and the
//   preview must look like the real pieces it becomes.
//
//   The traitor choice is the actual cards, off this seat's own row and no
//   other route. Ready closes this column — gated on what THIS seat owes, so
//   nobody declares themselves done with an advisor still to stand, but never
//   on the prediction, where declining is a real choice and a gate would
//   charge seven minutes of waiting for it — while the deadline's escape hatch
//   stays ungated, because that is what stops a table of held buttons wedging
//   when somebody walks away.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { SetupWindow, SetupBoardTargets } from '@/components/dune/SetupWindow'
import type { SetupWindowProps } from '@/components/dune/SetupWindow'
import { DuneGameScreen, dealtTraitors } from '@/components/dune/DuneGameScreen'
import type { DuneGameScreenProps } from '@/components/dune/DuneGameScreen'
import { PlayerHud } from '@/components/dune/PlayerHud'
import { DuneBoard } from '@/components/dune/DuneBoard'
import { hudRows } from '@/lib/dune/hud'
import { openingPosition, distributeAmong, KEEPS_ALL_TRAITORS } from '@/lib/dune/setup'
import type { SetupDecision, SetupSeat } from '@/lib/dune/setup'
import { FACTION_IDS, factionById } from '@/data/dune/factions'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { DuneGameState, DunePlayerPublic, Force } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** Source with comments stripped, so a claim cannot be satisfied by a note. */
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── the fixture: a real deal ──────────────────────────────────────────────
const counter = (start = 0) => { let n = start; return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648) }
const seats: SetupSeat[] = FACTION_IDS.map((faction, i) => ({
  faction, playerId: `p${i + 1}`, seat: `player-position-${i + 1}`,
}))
const opening = openingPosition({ seats, mode: 'advanced', rng: counter(7), closesAt: 90_000 })
const OUTSTANDING = opening.state.setup.outstanding
const DEALT = ['Piter De Vries', 'Feyd-Rautha', 'Duncan Idaho', 'Alia']
const answered = (kind: SetupDecision['kind']) => OUTSTANDING.filter(d => d.kind !== kind)

const base: SetupWindowProps = {
  seat: 'fremen',
  mode: 'advanced',
  outstanding: OUTSTANDING,
  ready: [],
  seated: FACTION_IDS,
  dealt: DEALT,
  pending: [],
  onRemove: () => {},
  onConfirmPlacement: () => {},
  advisorPending: null,
  advisorPosture: null,
  onConfirmAdvisor: () => {},
  onPrediction: () => {},
  onTraitor: () => {},
  onReady: () => {},
}

const draw = (over: Partial<SetupWindowProps> = {}) =>
  renderToStaticMarkup(createElement(SetupWindow, { ...base, ...over }))

// ── the window says; the board does ───────────────────────────────────────
{
  const fremen = draw({ seat: 'fremen' })
  // THE BUBBLE GRAMMAR, shared with shipping: stage on the bubbles by the
  // board, the star is the Fedaykin, a territory click drops the group.
  check('the Fremen are pointed at the bubbles',
    fremen.includes('bubbles by the board'), true)
  check('...with the running count in the window',
    /data-left="10"/.test(fremen), true)
  check('...and the Fedaykin counted beside it', /data-stars-left="3"/.test(fremen), true)
  // NO TOGGLE: the starred bubble replaced it — the same action looks the
  // same at setup as it does at shipment.
  check('...with no toggle left behind',
    /type="checkbox"/.test(fremen), false)
  // NO STEPPERS. The old panel's per-territory +/− rows are gone; the map is
  // the input, and the window only takes back.
  check('...and no add buttons in the window',
    /aria-label="One more in/.test(fremen), false)

  // THE SETUP RAIL: the same ForceBubble the shipping rail uses, staging the
  // ten with the Fedaykin on the starred bubble, and the territory click
  // dropping the whole staged group — one grammar for one kind of action.
  const game = code('src/components/dune/DuneGameScreen.tsx')
  check('setup stages on the shipping rail',
    /\{setupActive && owesFremen && seat === 'fremen' && \(/.test(game), true)
  check('...and the click drops the staged group',
    /const count = Math\.max\(1, setupStaged\.plain \+ setupStaged\.starred\)/.test(game), true)
  check('...which resets the stage',
    /setSetupStaged\(\{ plain: 0, starred: 0 \}\)\s*[\r\n]+\s*\}/.test(game), true)
  check('the bubble is one component, shared',
    /export function ForceBubble/.test(code('src/components/dune/ShipRail.tsx')), true)

  // ONE RAIL AT A TIME, and now BY PHASE: the shipping rail belongs to the
  // Shipment and Movement phase alone. Setup sits in phase Storm, so the
  // phase gate keeps this rail clear of the Fremen's placement without a
  // second guard — the old Fremen exception would be dead code beneath it.
  check('the shipping rail is the shipment phase\'s alone',
    /seat && mine && onShipReserves && state\.phase === 'Shipment and Movement' && \(/.test(game), true)
  // HONEST ARITHMETIC. The rail subtracts the staged itself, so it must be
  // fed the pool BEFORE staging — pre-subtracting here counted every click
  // twice: the bubble said 1 while the pool dropped 2. The ten are one pool,
  // so only the staged Fedaykin (spent from the same ten, shown on their own
  // bubble) comes off the plain figure.
  check('the setup rail is fed the pool before staging',
    /reserves=\{fremenTotal - fremenPlaced - setupStaged\.starred\}/.test(game), true)
  check('...and the Fedaykin figure likewise',
    /reservesStarred=\{fremenStars - fremenStarsPlaced\}/.test(game), true)
  // NOT A RESERVE YET: the pool has its own name at setup.
  check('the setup pool is called Starting troops',
    /poolLabel="Starting troops"/.test(game), true)

  // A HALF-MADE PLACEMENT IS NARRATED with a take-back per stack.
  const partway = draw({
    seat: 'fremen',
    pending: [{ territoryId: distributeAmong('fremen')[0], sector: 'sector-13', count: 4, starred: 2 }],
  })
  check('a pending stack is listed', /data-pending=/.test(partway), true)
  check('...with its stars beside its plain', partway.includes('+2★'), true)
  check('...and six still to place', /data-left="6"/.test(partway), true)

  // BASIC GAME: no Fedaykin anywhere.
  const basic = draw({ seat: 'fremen', mode: 'basic' })
  check('the basic game never mentions the Fedaykin', basic.includes('Fedaykin'), false)

  // The window exists for a seat that owes nothing — it says so, and points at
  // Ready rather than drawing empty controls.
  const hark = draw({ seat: KEEPS_ALL_TRAITORS, dealt: [] })
  check('a seat owing nothing is told so', hark.includes('Nothing is owed'), true)
  check('...and pointed at Ready', hark.includes('Ready'), true)
  check('...with no guides drawn', /data-guide=/.test(hark), false)

  // READY IS COUNTED IN THE HEADER; the names live on the HUD.
  const counted = draw({ ready: ['atreides', 'emperor'] as FactionId[] })
  check('the header counts the ready', /data-ready-count="2"/.test(counted), true)
}

// ── the board's targets, only where a click means something ───────────────
{
  const targets = (over: Partial<Parameters<typeof SetupBoardTargets>[0]> = {}) =>
    renderToStaticMarkup(createElement(SetupBoardTargets, {
      seat: 'fremen' as FactionId, fremen: true, advisor: false,
      onPlaceCell: () => {}, onAdvisorCell: () => {}, ...over,
    }))

  const fremen = targets()
  const among = distributeAmong('fremen')
  const cells = DUNE_TERRITORIES.filter(t => among.includes(t.id))
    .reduce((n, t) => n + t.cells.length, 0)
  check('the Fremen get one ring per cell of their three territories',
    (fremen.match(/data-place-target=/g) ?? []).length, cells)
  check('...and nowhere else', fremen.includes('territory-13'), false)
  check('...and no advisor targets', fremen.includes('data-advisor-target'), false)

  const advisor = targets({ seat: 'bene-gesserit' as FactionId, fremen: false, advisor: true })
  const allCells = DUNE_TERRITORIES.reduce((n, t) => n + t.cells.length, 0)
  check('the advisor may click every cell on the board',
    (advisor.match(/data-advisor-target=/g) ?? []).length, allCells)
}

// ── the advisor waits on the Fremen ───────────────────────────────────────
{
  const blocked = draw({ seat: 'bene-gesserit' })
  check('the advisor guide is shut while the Fremen are placing',
    blocked.includes('data-blocked="advisor-placement"'), true)
  check('...and says why', blocked.includes('The Fremen have not placed yet'), true)

  const open = draw({
    seat: 'bene-gesserit', outstanding: answered('fremen-placement'),
    advisorPending: { territoryId: 'territory-40', sector: 'sector-13' },
    advisorPosture: 'advisor',
  })
  check('once they have placed, the click is narrated',
    open.includes('Sietch Tabr'), true)
  check('...with the posture the board dictates',
    /data-posture="advisor"/.test(open), true)
  check('...as a checkered piece, said in words', open.includes('checkered'), true)
  const alone = draw({
    seat: 'bene-gesserit', outstanding: answered('fremen-placement'),
    advisorPending: { territoryId: 'territory-23', sector: 'sector-14' },
    advisorPosture: 'fighter',
  })
  check('alone it is a fighter, said before confirming',
    alone.includes('takes the field as a fighter'), true)
}

// ── the traitor choice is the cards themselves ────────────────────────────
{
  const shown = draw({ seat: 'emperor' })
  check('the four dealt render as actual cards',
    DEALT.filter(n => !shown.includes(`data-traitor="${n}"`)).filter(n => findable(n)), [])
  function findable(n: string) {
    // A name with no leader entry renders as text, not a card — tolerated, but
    // the fixture uses real leaders so none should fall through.
    return !!DEALT.includes(n)
  }
  check('...each with its own keep button',
    DEALT.filter(n => !shown.includes(`data-keep="${n}"`)), [])
  check('...under a prompt to pick one', shown.includes('Keep one traitor'), true)

  const waiting = draw({ seat: 'emperor', dealt: [] })
  check('a seat whose row has not arrived is told so',
    waiting.includes('have not reached this browser yet'), true)
  const everyLeader = FACTION_IDS.flatMap(f => factionById(f)!.leaders.map(l => l.name))
  check('a window handed no traitors names no leader',
    everyLeader.filter(n => waiting.includes(n)), [])
}

// ── starred forces and advisors draw as what they are ─────────────────────
{
  const board = renderToStaticMarkup(createElement(DuneBoard, {
    storm: 'sector-1' as DuneGameState['storm'],
    stacks: [
      { territoryId: 'territory-40', sector: 'sector-13', faction: 'fremen' as FactionId, count: 7, starred: 3 },
      { territoryId: 'territory-13', sector: 'sector-10', faction: 'bene-gesserit' as FactionId, count: 1, posture: 'advisor' as const },
      { territoryId: 'territory-26', sector: 'sector-3', faction: 'harkonnen' as FactionId, count: 10 },
    ],
    spice: {}, seating: {}, deck: { remaining: 0, discardA: [], discardB: [] },
    mode: 'advanced' as const,
  }))
  check('a stack with Fedaykin wears a star badge',
    /data-starred="3"/.test(board) && board.includes('★3'), true)
  check('an advisor stack is checkered',
    /data-posture="advisor"/.test(board) && board.includes('advisor-check-bene-gesserit'), true)
  check('...with the pattern defined in that faction\'s colour',
    /<pattern id="advisor-check-bene-gesserit"/.test(board), true)
  // SCOPED TO THE STACK'S OWN GROUP. Splitting the whole render on the
  // territory id worked only while nothing else mentioned it — the contested
  // outline and the tether now draw per territory and carry the same id, so
  // the tail of that split is no longer this stack's markup.
  const plain = /<g[^>]*data-cell="territory-26\|sector-3"[^>]*>/.exec(board)?.[0] ?? ''
  check('the plain stack is there to check', plain.length > 20, true)
  check('a plain stack is neither', /data-posture|data-starred/.test(plain), false)
}

// ── the HUD splits elite reserves, and carries Ready ──────────────────────
{
  const player = (faction: FactionId, seat: string, over: Partial<DunePlayerPublic> = {}): DunePlayerPublic =>
    ({ faction, seat, reserves: 7, handCount: 1, ally: null, ...over })
  const state: DuneGameState = {
    storm: 'sector-1', turn: 1, phase: 'Storm', shieldWall: 'intact', mode: 'advanced',
    spiceDeck: { remaining: 30, discardA: [], discardB: [] },
    players: [
      player('emperor', 'player-position-1', { reserves: 15, reservesStarred: 5 }),
      player('fremen', 'player-position-2', { reserves: 9, reservesStarred: 1 }),
      player('atreides', 'player-position-3'),
    ],
    forces: [], spiceOnBoard: {}, awaiting: null,
  }
  const rows = hudRows(state)
  const hud = renderToStaticMarkup(createElement(PlayerHud, {
    rows, awaiting: null, seat: 'emperor' as FactionId,
    ready: ['fremen'] as FactionId[],
  }))
  check('the Emperor\'s reserve reads fifteen plus five',
    hud.includes('15') && /data-starred="5"/.test(hud) && hud.includes('+5★'), true)
  check('...named for what they are', hud.includes('Sardaukar'), true)
  check('a held-back Fedaykin shows in the Fremen reserve', hud.includes('+1★'), true)
  check('a plain reserve is one number',
    /data-stat="reserve"[^>]*data-starred/.test(
      hud.split('data-faction="atreides"')[1] ?? ''), false)

  // READY: THE TAG IS THE HUD'S, THE BUTTON IS THE SETUP COLUMN'S. The button
  // used to sit in this column's bottom corner, diagonally across the screen
  // from the questions it answers. What stays here is the status.
  check('a ready seat is tagged', /data-ready="yes"/.test(hud), true)
  check('the players column no longer carries the button',
    /data-layer="setup-ready"/.test(hud), false)
}

// ── ready, at the foot of the column that asked ───────────────────────────
// It closes the setup column now, and it is gated on what THIS seat still
// owes: Ready means "I have finished", so a seat with an advisor still to
// stand or a traitor still to keep cannot truthfully press it.
{
  const nothingOwed = answered('fremen-placement')
    .filter(d => d.faction !== 'fremen')
  const free = draw({ outstanding: nothingOwed })
  check('the button closes the setup column',
    /data-layer="setup-ready"/.test(free), true)
  check('...offered live to a seat that owes nothing',
    /data-layer="setup-ready"(?![^>]*disabled)/.test(free), true)
  // BELOW THE QUESTIONS AND OUTSIDE THE LIST THAT SCROLLS — the traitor cards
  // make this column taller than the screen, and a Ready that scrolled away
  // with them is the covered-button wedge again.
  const asking = draw()
  const guideAt = asking.indexOf('data-guide=')
  const scrollAt = asking.indexOf('overflow-y:auto')
  const readyAt = asking.indexOf('data-layer="setup-ready"')
  check('...and it sits below the questions, outside the scrolling list',
    [guideAt > 0, scrollAt > 0, guideAt < readyAt,
      asking.slice(scrollAt, readyAt).split('</div>').length > 1],
    [true, true, true, true])

  // THE GATE. The fixture's Fremen owe their ten; the Bene Gesserit owe an
  // advisor they cannot even place until the Fremen have gone.
  const owing = draw()
  check('a seat that still owes cannot press it',
    /data-layer="setup-ready"[^>]*disabled/.test(owing), true)
  check('...and is told what it is still owed',
    /data-ready-blocked="yes"/.test(owing) && owing.includes('your ten forces'), true)
  const bg = draw({ seat: 'bene-gesserit' })
  check('the Bene Gesserit are held until their advisor stands',
    /data-layer="setup-ready"[^>]*disabled/.test(bg) && bg.includes('your advisor'), true)
  const bgDone = draw({
    seat: 'bene-gesserit',
    outstanding: OUTSTANDING.filter(d => d.faction !== 'bene-gesserit'),
  })
  check('...and freed once it has', /data-layer="setup-ready"(?![^>]*disabled)/.test(bgDone), true)

  // THE PREDICTION DOES NOT HOLD READY DOWN. Declining is a real choice whose
  // cost — no prediction — is already the default, so gating it would price a
  // legitimate decision at the whole seven-minute deadline. Warn, don't hold.
  const onlyPredicting = OUTSTANDING.filter(
    d => d.faction === 'bene-gesserit' && d.kind === 'prediction')
  check('the fixture leaves a prediction to decline', onlyPredicting.length, 1)
  const declining = draw({ seat: 'bene-gesserit', outstanding: onlyPredicting })
  check('a seat owing only a prediction may still press Ready',
    [/data-layer="setup-ready"(?![^>]*disabled)/.test(declining),
      /data-ready-blocked/.test(declining)],
    [true, false])
  check('...and is told what declining costs, not what it is waiting for',
    [declining.includes('sealed no prediction'),
      declining.includes('Still to answer')],
    [true, false])
  // AND IT IS STILL A GATE. A prediction alongside something that does hold
  // keeps the button dead, and the dead-button line names only the holder.
  const bgHeld = draw({ seat: 'bene-gesserit' })
  check('a prediction beside a real holder does not soften the gate',
    [/data-layer="setup-ready"[^>]*disabled/.test(bgHeld),
      bgHeld.includes('your prediction')],
    [true, false])

  // PRESSED: disabled into a confirmation rather than vanishing, so its
  // presser can see it registered.
  const pressed = draw({ outstanding: nothingOwed, ready: ['fremen'] as FactionId[] })
  check('a pressed Ready confirms and disables',
    pressed.includes('✓ Ready')
      && /data-layer="setup-ready"[^>]*disabled/.test(pressed), true)
  check('...and says what it is waiting for', pressed.includes('Waiting on the rest'), true)

  // THE WAY OUT MUST NOT BE GATED. Ready is now dead for any seat with a
  // decision outstanding, so past the deadline a table could hold nothing but
  // dead Ready buttons. What saves it is the escape hatch in the notices,
  // which sends a bare Ready and takes the defaults — and it is offered on the
  // clock alone: seated, not spectating, past closesAt, and NOTHING about what
  // anybody owes. Gate that on `outstanding` and the wedge is back.
  const match = code('src/components/dune/DuneMatchScreen.tsx')
  const hatchAt = match.indexOf('push the game along')
  const hatch = match.slice(Math.max(0, hatchAt - 400), hatchAt)
  check('the deadline\'s escape hatch is offered on the clock alone',
    [hatchAt > 0,
      /now >= setup\.closesAt/.test(hatch),
      /!spectating/.test(hatch),
      /outstanding|owed/.test(hatch)],
    [true, true, true, false])
  check('...and it sends a bare Ready, which the server takes from any seat',
    /SETUP_ANSWER'?,?\s*answer: 'ready'/.test(hatch.replace(/\s+/g, ' '))
      || /answer: 'ready'/.test(match.slice(hatchAt - 400, hatchAt + 120)), true)
}

// ── on the screen, wired together ─────────────────────────────────────────
{
  const player = (faction: FactionId, seat: string): DunePlayerPublic =>
    ({ faction, seat, reserves: 7, handCount: 1, ally: null })
  const state: DuneGameState & { setup: { closesAt: number; outstanding: SetupDecision[]; ready?: FactionId[] } } = {
    storm: 'sector-1', turn: 1, phase: 'Storm', shieldWall: 'intact', mode: 'advanced',
    spiceDeck: { remaining: 30, discardA: [], discardB: [] },
    players: FACTION_IDS.map((f, i) => player(f, `player-position-${i + 1}`)),
    forces: [] as Force[],
    spiceOnBoard: {},
    awaiting: 'fremen',
    setup: { closesAt: 90_000, outstanding: [...OUTSTANDING], ready: ['atreides'] as FactionId[] },
  }
  const own: DuneSecrets = { spice: 5, cards: [], traitorsDealt: DEALT }
  const handlers = {
    onFremenPlacement: () => {}, onPrediction: () => {},
    onTraitor: () => {}, onAdvisorPlacement: () => {}, onReady: () => {},
  }
  const screen = (over: Partial<DuneGameScreenProps> = {}) => renderToStaticMarkup(
    createElement(DuneGameScreen, {
      state, seat: 'fremen', own, chat: [], now: 60_000, setup: handlers, ...over,
    }))

  // THE COLUMN SITS BETWEEN THE CHAT AND THE BOARD, in that order.
  const mine = screen()
  const chatAt = mine.indexOf('data-layer="chat"')
  const windowAt = mine.indexOf('data-layer="setup-window"')
  const boardAt = mine.indexOf('data-layer="board"')
  check('the window is on the screen', windowAt > 0, true)
  check('...between the chat and the board',
    chatAt < windowAt && windowAt < boardAt, true)

  // THE MAP TAKES THE CLICKS for the seat that owes them — and only that seat.
  check('the Fremen see rings on their three territories',
    /data-place-target=/.test(mine), true)
  check('...but no advisor targets', /data-advisor-target=/.test(mine), false)
  const bg = screen({ seat: 'bene-gesserit' })
  check('the Bene Gesserit see no targets while the Fremen owe theirs',
    /data-place-target=|data-advisor-target=/.test(bg), false)
  const openState: typeof state = {
    ...state, setup: { ...state.setup, outstanding: answered('fremen-placement') },
  }
  const bgOpen = screen({ seat: 'bene-gesserit', state: openState })
  check('...and the whole board once they have answered',
    /data-advisor-target=/.test(bgOpen), true)

  // The traitors reach the window off this seat's own row, and only that way.
  check('the four dealt reach the window',
    DEALT.filter(n => !mine.includes(`data-keep="${n}"`)), [])
  const blind = screen({ own: null })
  check('with no secrets row, no traitor is named',
    DEALT.filter(n => blind.includes(n)), [])
  check('dealtTraitors reads that row and nothing else',
    [dealtTraitors(null), dealtTraitors({ spice: 0 } as DuneSecrets), dealtTraitors(own)],
    [[], [], DEALT])

  // READY, WIRED: the tag from public state on the HUD, the button at the
  // foot of the setup column — and on this screen the Fremen owe their ten,
  // so it is there and dead.
  check('the ready seat is tagged in the HUD', /data-ready="yes"/.test(mine), true)
  check('...and this seat is offered the button', /data-layer="setup-ready"/.test(mine), true)
  check('...inside the setup column, not the players column',
    mine.indexOf('data-layer="setup-ready"') > mine.indexOf('data-layer="setup-window"')
      && mine.indexOf('data-layer="setup-ready"') < mine.indexOf('data-layer="board"'), true)
  check('...and dead while this seat still owes its ten',
    /data-layer="setup-ready"[^>]*disabled/.test(mine), true)

  // NO HANDLERS, NO COLUMN — a spectator watches setup, never answers it.
  check('a screen given no setup handlers draws no window',
    screen({ setup: null }).includes('data-layer="setup-window"'), false)
  check('...and neither does a spectator holding no seat',
    screen({ seat: null }).includes('data-layer="setup-window"'), false)

  // The deadline stays on the board, for everyone.
  check('the setup deadline is counted on the board',
    /data-layer="phase-timer"[^>]*data-remaining-ms="30000"/.test(mine), true)
  check('...for every seat, window or no window',
    /data-layer="phase-timer"/.test(screen({ seat: null })), true)
}

// ── the answers go to the server ──────────────────────────────────────────
// READ FROM THE SOURCE, like gamescreentest reads the drawer wiring: what a
// click POSTs is not reachable from a static render, and every other check in
// this file passed while the handlers were stubs.
{
  const kinds = ['fremen-placement', 'prediction', 'traitor', 'advisor-placement', 'ready']
  const screenSrc = code('src/components/dune/DuneMatchScreen.tsx')
  check('the match screen posts every setup answer, ready included',
    kinds.filter(k => !screenSrc.includes(`answer: '${k}'`)), [])
  const harness = code('src/components/dune/DuneMultiSeatView.tsx')
  check('the six-seat harness posts them too',
    kinds.filter(k => !harness.includes(`answer: '${k}'`)), [])
  // THE STARS RIDE IN THE PLACEMENT, not in a side channel: the payload's
  // entries carry starred and the screen builds them from the map state.
  const gameScreen = code('src/components/dune/DuneGameScreen.tsx')
  check('the placement payload carries the Fedaykin',
    /starred: e\.starred/.test(gameScreen), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
if (!pass) process.exit(1)
