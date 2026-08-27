// The setup controls: what each seat is offered, and what it is not.
//
// All four decisions used to be answered by the clock. The panel is the other
// half — and it is the first control in this game that has to be BOTH filtered
// by seat and blocked by another seat's answer, which is two ways to offer a
// button the server will refuse.
//
// The claims worth the file:
//
//   Only what this seat owes. The outstanding list is public, so a panel that
//   rendered it whole would show the Bene Gesserit a Fremen distribution — a
//   control whose one outcome is `not-outstanding`.
//
//   The advisor stays shut until the Fremen have placed. That is not politeness:
//   the Bene Gesserit choose knowing where those ten went, because it decides
//   whether their own force is an advisor or a fighter.
//
//   The four traitors reach the panel by ONE route, `dealt`, which comes off
//   this browser's own secrets row. Nothing else in the tree can produce a
//   leader's name, which is checked by rendering the whole screen with the same
//   public state and no secrets at all.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { SetupPanel } from '@/components/dune/SetupPanel'
import type { SetupPanelProps } from '@/components/dune/SetupPanel'
import { DuneGameScreen, dealtTraitors } from '@/components/dune/DuneGameScreen'
import type { DuneGameScreenProps } from '@/components/dune/DuneGameScreen'
import { openingPosition, SETUP_SECONDS, KEEPS_ALL_TRAITORS } from '@/lib/dune/setup'
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

// ── the fixture ───────────────────────────────────────────────────────────
// A real deal, not a hand-written list of decisions: what the panel is asked to
// draw is what openingPosition produces, so a change to which decisions exist
// reaches this file rather than passing it by.
const counter = (start = 0) => { let n = start; return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648) }
const seats: SetupSeat[] = FACTION_IDS.map((faction, i) => ({
  faction, playerId: `p${i + 1}`, seat: `player-position-${i + 1}`,
}))
const opening = openingPosition({ seats, mode: 'advanced', rng: counter(7), closesAt: 90_000 })
const OUTSTANDING = opening.state.setup.outstanding

const DEALT = ['Piter De Vries', 'Feyd Rautha', 'Duncan Idaho', 'Alia']

const base: SetupPanelProps = {
  seat: 'fremen',
  outstanding: OUTSTANDING,
  dealt: DEALT,
  seated: FACTION_IDS,
  forces: opening.state.forces,
  onFremenPlacement: () => {},
  onPrediction: () => {},
  onTraitor: () => {},
  onAdvisorPlacement: () => {},
}

const draw = (over: Partial<SetupPanelProps> = {}) =>
  renderToStaticMarkup(createElement(SetupPanel, { ...base, ...over }))

const answered = (kind: SetupDecision['kind']) => OUTSTANDING.filter(d => d.kind !== kind)

// ── ONLY THE DECISIONS THIS SEAT OWES ─────────────────────────────────────
{
  const fremen = draw({ seat: 'fremen' })
  const bg = draw({ seat: 'bene-gesserit' })
  const emperor = draw({ seat: 'emperor' })

  // Sietch Tabr, False Wall South and False Wall West, off the faction data.
  const among = factionById('fremen')!.forces.placement
  const names = among.kind === 'distribute'
    ? among.among.map(id => DUNE_TERRITORIES.find(t => t.id === id)!.displayName)
    : []
  check('the Fremen are offered their three territories',
    names.filter(n => !fremen.includes(n)), [])
  check('...and all ten of their forces to spread over them',
    fremen.includes('10 still to place'), true)
  check('...but not a prediction', fremen.includes('Your prediction'), false)
  check('...and not an advisor', fremen.includes('Your advisor'), false)

  // The Bene Gesserit owe three of the four: a prediction, a traitor and an
  // advisor. They owe no placement, and the panel must not offer one — the
  // server would refuse it as `not-outstanding`.
  check('the Bene Gesserit are offered their prediction', bg.includes('Your prediction'), true)
  check('...and their advisor', bg.includes('Your advisor'), true)
  check('...and never the Fremen\'s territories',
    names.filter(n => bg.includes(n)), [])

  // EVERY SEAT OWES A TRAITOR except the Harkonnen, whose power is keeping all
  // four — so they have nothing to choose and get no chooser.
  check('an ordinary seat is offered its traitor choice',
    emperor.includes('Keep one traitor'), true)
  const harkonnen = draw({ seat: KEEPS_ALL_TRAITORS, dealt: [] })
  check('the Harkonnen are offered nothing at all', harkonnen, '')

  // A seat that has answered everything gets no panel — not an empty one. A
  // frame saying "nothing to do" over the board is a frame in the way.
  check('a seat with nothing outstanding draws nothing',
    draw({ seat: 'fremen', outstanding: OUTSTANDING.filter(d => d.faction !== 'fremen') }), '')
  check('...and so does a table with no setup running',
    draw({ outstanding: [] }), '')
}

// ── THE ADVISOR WAITS ON THE FREMEN ───────────────────────────────────────
// The one dependency in setup, and the reason it exists: an advisor alone in a
// territory has nobody to advise and takes the field as a fighter, so whether
// their single force is an advisor at all depends on who else is standing
// there — and the Fremen's ten are the last thing at setup that can put
// somebody there.
{
  const blocked = draw({ seat: 'bene-gesserit' })
  check('the advisor control is shut while the Fremen are still placing',
    blocked.includes('data-blocked="advisor-placement"'), true)
  check('...with no territory to choose from',
    blocked.includes('Territory for your advisor'), false)
  check('...and it says why rather than just refusing',
    blocked.includes('The Fremen have not placed yet'), true)

  const open = draw({ seat: 'bene-gesserit', outstanding: answered('fremen-placement') })
  check('once they have placed, the choice opens',
    open.includes('Territory for your advisor'), true)
  // BY ID, not by name: Tuek's Sietch has an apostrophe in it, which the
  // renderer escapes, and a test that matched on rendered names would be
  // asserting something about HTML entities rather than about the board.
  check('...over the whole board, not a list of three',
    DUNE_TERRITORIES.filter(t => !open.includes(`value="${t.id}"`)).map(t => t.id), [])
  check('...and nothing is left saying it is blocked',
    open.includes('data-blocked'), false)

  // WITH NO FREMEN AT THE TABLE there is nothing to wait for. The block is on
  // the presence of a placement in the list, not on a faction being named, so
  // a game without them opens the control immediately — which is what the
  // server does too.
  const noFremen = openingPosition({
    seats: seats.filter(s => s.faction !== 'fremen'), mode: 'advanced', rng: counter(3),
  })
  const alone = draw({
    seat: 'bene-gesserit', outstanding: noFremen.state.setup.outstanding,
  })
  check('a table without the Fremen never blocks it',
    alone.includes('Territory for your advisor'), true)
}

// ── THE FOUR TRAITORS COME IN, OR THEY ARE NOT THERE ──────────────────────
{
  const shown = draw({ seat: 'emperor' })
  check('the four handed in are the four offered',
    DEALT.filter(n => !shown.includes(n)), [])
  // WHOSE LEADERS THEY ARE, which is the whole reason a traitor is worth
  // holding: a name alone says nothing about who it can be played against.
  check('...named with the faction they belong to', shown.includes('Harkonnen'), true)

  // NOT FOUR BLANKS while the secrets channel is still opening. A chooser with
  // four empty slots in it is a panel that looks dealt before it is.
  const waiting = draw({ seat: 'emperor', dealt: [] })
  check('a seat whose row has not arrived is told so',
    waiting.includes('have not reached this browser yet'), true)
  check('...and offered nothing to choose', waiting.includes('data-leader='), false)

  // THE ONLY ROUTE IN. Every leader in the game, checked against a panel that
  // was handed none: if any name can be derived, looked up or defaulted here,
  // it appears without being dealt.
  const everyLeader = FACTION_IDS.flatMap(f => factionById(f)!.leaders.map(l => l.name))
  check('a panel handed no traitors names no leader',
    everyLeader.filter(n => waiting.includes(n)), [])
}

// ── WHAT SILENCE MEANS, SAID PER DECISION ─────────────────────────────────
// The board carries the clock; what it cannot carry is what happens when the
// clock wins. Each control says its own default, because that is the fact a
// player weighs when deciding whether to answer at all.
{
  const fremen = draw({ seat: 'fremen' })
  const bg = draw({ seat: 'bene-gesserit', outstanding: answered('fremen-placement') })
  const emperor = draw({ seat: 'emperor' })
  check('the placement says where silence puts the ten',
    fremen.includes('Silence puts all 10 in Sietch Tabr'), true)
  check('the prediction says silence costs a route to victory',
    bg.includes('Silence is no prediction'), true)
  check('the advisor says silence is the Polar Sink',
    bg.includes('Silence puts it in the Polar Sink'), true)
  check('the traitor says silence keeps the first of the four',
    emperor.includes('Silence keeps the first of the four'), true)

  // AND NO CLOCK OF ITS OWN. The deadline is on the board where the whole
  // table reads the same one — a second countdown here would be a second
  // answer to how long is left. Checked as the absence of a seconds reading,
  // which is what a countdown in this codebase renders.
  check('the panel counts nothing down itself', /\d+s</.test(fremen), false)
}

// ── THE SEAT'S OWN PREDICTION LIST ────────────────────────────────────────
{
  const bg = draw({ seat: 'bene-gesserit', outstanding: answered('fremen-placement') })
  // THEY MAY NOT PREDICT THEMSELVES — predicting your own victory is just
  // playing the game — so the option is absent rather than offered and refused.
  check('every other faction may be predicted',
    FACTION_IDS.filter(f => f !== 'bene-gesserit')
      .filter(f => !bg.includes(`value="${f}"`)), [])
  check('...and they are not on their own list',
    bg.includes('value="bene-gesserit"'), false)

  // A TABLE OF FOUR OFFERS FOUR, not six. Predicting a faction that is not
  // playing is a prediction that can never come true.
  const small = draw({
    seat: 'bene-gesserit', seated: ['bene-gesserit', 'atreides', 'fremen'],
    outstanding: answered('fremen-placement'),
  })
  check('only the factions at the table may be named',
    FACTION_IDS.filter(f => small.includes(`value="${f}"`)), ['atreides', 'fremen'])
}

// ── ON THE SCREEN, WITH THE REST OF IT ────────────────────────────────────
// The panel is assembled inside DuneGameScreen so that no caller ever holds a
// seat's traitors — the same rule the Atreides prescience card follows. These
// checks are about the wiring, not the panel.
{
  const player = (faction: FactionId, seat: string): DunePlayerPublic =>
    ({ faction, seat, reserves: 7, handCount: 1, ally: null })
  const state: DuneGameState & { setup: { closesAt: number; outstanding: SetupDecision[] } } = {
    storm: 'sector-1', turn: 1, phase: 'Storm', shieldWall: 'intact', mode: 'advanced',
    spiceDeck: { remaining: 30, discardA: [], discardB: [] },
    players: FACTION_IDS.map((f, i) => player(f, `player-position-${i + 1}`)),
    forces: [] as Force[],
    spiceOnBoard: {},
    awaiting: 'fremen',
    setup: { closesAt: 90_000, outstanding: [...OUTSTANDING] },
  }
  const own: DuneSecrets = { spice: 5, cards: [], traitorsDealt: DEALT }
  const handlers = {
    onFremenPlacement: () => {}, onPrediction: () => {},
    onTraitor: () => {}, onAdvisorPlacement: () => {},
  }
  const screen = (over: Partial<DuneGameScreenProps> = {}) => renderToStaticMarkup(
    createElement(DuneGameScreen, {
      state, seat: 'emperor', own, chat: [], now: 60_000, setup: handlers, ...over,
    }))

  const mine = screen()
  check('the panel is on the screen for a seat that owes something',
    mine.includes('data-layer="setup-panel"'), true)
  check('...carrying the four out of that seat\'s own row',
    DEALT.filter(n => !mine.includes(n)), [])

  // THE SAME PUBLIC STATE, NO SECRETS. A spectator, or this seat before its
  // own row has arrived — either way there is no route from `state` to a
  // leader's name, and this is what says so.
  const blind = screen({ own: null })
  check('with no secrets row, no traitor is named',
    DEALT.filter(n => blind.includes(n)), [])
  check('...and the chooser says it is still waiting',
    blind.includes('have not reached this browser yet'), true)
  check('dealtTraitors reads that row and nothing else',
    [dealtTraitors(null), dealtTraitors({ spice: 0 } as DuneSecrets), dealtTraitors(own)],
    [[], [], DEALT])

  // NO HANDLERS, NO PANEL. A spectator is handed none — the same shape as the
  // charity modal, and the reason a watcher never sees a control.
  check('a screen given no setup handlers draws no panel',
    screen({ setup: null }).includes('data-layer="setup-panel"'), false)
  check('...and neither does a spectator holding no seat',
    screen({ seat: null }).includes('data-layer="setup-panel"'), false)

  // THE DEADLINE IS ON THE BOARD, where the whole table reads the same one —
  // including the seats that owe nothing and have no panel to read. Thirty
  // seconds left of the fixture's window, and the phase it is counting is the
  // one the match is about to play.
  check('the setup deadline is counted on the board',
    /data-layer="phase-timer"[^>]*data-remaining-ms="30000"/.test(mine), true)
  check('...for every seat, panel or no panel',
    /data-layer="phase-timer"/.test(screen({ seat: null })), true)
  check('...and the window it counts against is the setup window',
    SETUP_SECONDS * 1000 > 30_000, true)
}

// ── THE ANSWERS GO TO THE SERVER ──────────────────────────────────────────
// READ FROM THE SOURCE, like gamescreentest reads the drawer wiring and for the
// same reason: what a click POSTs is not reachable from a static render, and
// every other check in this file passed while the panel's handlers were stubs.
// The claim is about the wiring, not the behaviour — the behaviour is the
// server's, and dunesetuptest checks that end.
{
  const screen = code('src/components/dune/DuneMatchScreen.tsx')
  check('the match screen posts a setup answer', screen.includes('SETUP_ANSWER'), true)
  const kinds: SetupDecision['kind'][] =
    ['fremen-placement', 'prediction', 'traitor', 'advisor-placement']
  check('...one for each of the four decisions',
    kinds.filter(k => !screen.includes(`answer: '${k}'`)), [])
  // THE ACTING SEAT IS THE TOKEN, never a field. duneDispatch throws on a
  // payload carrying one; this checks the four new payloads never tempt it.
  check('...and never says which seat is answering',
    /playerId|actAs|onBehalfOf/.test(screen.slice(screen.indexOf('answerSetup'), screen.indexOf('answerSetup') + 1400)), false)
  // AND THE HARNESS DRIVES THE SAME ACTION, which is the only way to play a
  // whole setup through: six real sessions, one page.
  const harness = code('src/components/dune/DuneMultiSeatView.tsx')
  check('the six-seat harness can answer them too',
    kinds.filter(k => !harness.includes(`answer: '${k}'`)), [])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
if (!pass) process.exit(1)
