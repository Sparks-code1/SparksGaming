// The loop: nine phases, ten turns, and who may push the match along.
//
// WHY THIS EXISTS. The deal writes `phase: 'Storm'` and for a month nothing
// ever moved it — the match screen's own header admitted no real match could
// leave the phase it was dealt into. The loop is the difference between a
// board and a game, so what is checked here is the loop's whole contract:
// which phases resolve themselves, which pauses hold everybody, who may press
// early and who may press at all, that the turn ends after the Mentat Pause,
// and that the game ends on turn ten and not before or after.
import { readFileSync } from 'node:fs'
import {
  phaseAfter, advanceHold, phaseWindowOpen, rollStorm, stormEntry, cityIncome,
  mentatVerdict, biddingOpening, PHASE_SECONDS, TURN_LIMIT, WIN_STRONGHOLDS,
  SIETCH_TABR, HABBANYA_SIETCH, TUEKS_SIETCH,
} from '@/lib/dune/phaseAdvance'
import type { AdvanceState } from '@/lib/dune/phaseAdvance'
import { DUNE_PHASES } from '@/types/Dune/Game'
import type { Force, GamePhase, DunePlayerPublic } from '@/types/Dune/Game'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { factionById } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const counter = (start = 0) => {
  let n = start
  return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648)
}

const f = (faction: string, territoryId: string, sector: string, count = 3,
  over: Partial<Force> = {}): Force =>
  ({ faction, territoryId, sector, count, ...over } as Force)

const player = (faction: string, seat: string): DunePlayerPublic =>
  ({ faction, seat, reserves: 10, handCount: 0, battleLosses: 0 } as unknown as DunePlayerPublic)

/** A quiet advanced match mid-game, for the holds to be tested against. */
const at = (phase: GamePhase, over: Partial<AdvanceState> = {}): AdvanceState => ({
  phase, turn: 4, mode: 'advanced', storm: 'sector-7', shieldWall: 'intact',
  forces: [], players: [player('atreides', 'player-position-1'), player('harkonnen', 'player-position-3')],
  spiceDeck: { turn: 4 },
  ...over,
})

// ── nine phases, in the board's order, and then the next turn ─────────────
{
  const walked: string[] = []
  let p: GamePhase = 'Storm'
  for (let i = 0; i < DUNE_PHASES.length; i++) {
    walked.push(p)
    p = phaseAfter(p).phase
  }
  check('the loop walks the nine phases the board prints', walked, [...DUNE_PHASES])
  check('...and comes back round to the Storm', p, 'Storm')

  // THE TURN ENDS AFTER THE MENTAT PAUSE, and nowhere else: a turn boundary
  // anywhere else would roll a second storm mid-turn.
  check('only the Mentat Pause ends the turn',
    DUNE_PHASES.filter(ph => phaseAfter(ph).newTurn), ['Mentat Pause'])
  let threw = false
  try { phaseAfter('Teatime' as GamePhase) } catch { threw = true }
  check('a phase the board does not print is refused', threw, true)
}

// ── what holds the turn, and for whom ─────────────────────────────────────
{
  const now = 1_000_000

  // SETUP PARKS EVERYTHING. It is not a phase, but until it closes the match
  // has not started and there is nothing legal to advance to.
  check('setup holds the turn',
    advanceHold(at('Storm', { setup: { closesAt: now + 60_000 } }), now),
    { code: 'setup-not-finished', until: now + 60_000 })
  // AND SO DOES THE END. A finished game has no next phase.
  check('...and so does a winner',
    advanceHold(at('Storm', { winner: { factions: [], reason: 'strongholds', turn: 10 } }), now)?.code,
    'game-over')

  // THE BLOW. Unturned holds; a worm pause holds harder, with its deadline.
  check('an unturned blow holds the phase',
    advanceHold(at('Spice Blow and Nexus', { spiceDeck: { turn: 3 } }), now)?.code, 'blow-not-turned')
  check('...a pause on the Fremen holds it with a clock',
    advanceHold(at('Spice Blow and Nexus', { spiceDeck: { turn: 3 }, spiceBlow: { closesAt: now + 5000 } }), now),
    { code: 'worms-pending', until: now + 5000 })
  check('...and a turned blow releases it',
    advanceHold(at('Spice Blow and Nexus'), now), null)

  // CHARITY. Open holds until the deadline; expired is the advance's to close.
  check('an open charity window holds the phase',
    advanceHold(at('CHOAM Charity', { charity: { expiresAt: now + 9000, turn: 4 } }), now),
    { code: 'charity-open', until: now + 9000 })
  check('...an expired one does not', advanceHold(at('CHOAM Charity', { charity: { expiresAt: now - 1, turn: 4 } }), now), null)
  // A WINDOW FROM ANOTHER TURN IS DEBRIS, not a hold — holding on it would
  // wedge every later charity phase on the first one's leftovers.
  check('...nor does a stale one from an earlier turn',
    advanceHold(at('CHOAM Charity', { charity: { expiresAt: now + 9000, turn: 2 } }), now), null)

  // BIDDING. A live auction holds even past its bid clock: the expired path
  // is BID's — any seat passes for the silent — never the advance's, which
  // would throw away a lot mid-sale.
  check('a running auction holds the phase',
    advanceHold(at('Bidding', { auction: { status: 'awaiting', closesAt: now - 1 } }), now)?.code,
    'auction-running')
  check('...and a settled one releases it', advanceHold(at('Bidding', { auction: null }), now), null)

  // PLACEHOLDERS HOLD NOTHING. Skippable is the whole of what they are.
  for (const ph of ['Revival', 'Shipment and Movement', 'Battles', 'Spice Collection', 'Mentat Pause'] as GamePhase[]) {
    check(`${ph} does not block`, advanceHold(at(ph), now), null)
  }
}

// ── the look-window: the host passes, the table waits ─────────────────────
{
  const now = 1_000_000
  const clock = { turn: 4, phase: 'Revival' as GamePhase, closesAt: now + 10_000 }
  check('a fresh phase window is open', phaseWindowOpen(at('Revival', { phaseClock: clock }), now), true)
  check('...and shuts on its clock', phaseWindowOpen(at('Revival', { phaseClock: clock }), now + 10_000), false)
  // A CLOCK OUTLIVING ITS PHASE READS AS EXPIRED. Without the (turn, phase)
  // stamp, last phase's window would gate this phase's advance.
  check('...and one from another phase is not open',
    phaseWindowOpen(at('Battles', { phaseClock: clock }), now), false)
  check('...nor another turn\'s',
    phaseWindowOpen(at('Revival', { turn: 5, phaseClock: clock }), now), false)
  check('...nor no clock at all', phaseWindowOpen(at('Revival'), now), false)
}

// ── the storm rolls itself ────────────────────────────────────────────────
{
  // TURN ONE IS THE TWO-DIAL ROLL, 0..20 — enough to lap the board. Later
  // turns are the small roll, whose floor the advanced game drops to 1.
  const rolls = (turn: number, mode: 'basic' | 'advanced') => {
    const rng = counter(turn * 7 + (mode === 'basic' ? 1 : 2))
    return Array.from({ length: 200 }, () => rollStorm(turn, mode, rng))
  }
  const first = rolls(1, 'advanced')
  // BOTH ENDS OF THE REACH, because the bounds alone prove nothing: the small
  // dice sit comfortably inside 0..20, so a first storm quietly rolled on them
  // passed a min>=0/max<=20 check every time. And BELOW THE FLOOR means zero,
  // not merely small: the advanced dice roll 1s too, so "under 2" told the two
  // apart in the basic game only. A storm that can stand still — six times in
  // this seeded sequence — is the two dials and nothing else.
  check('the first storm can stand still', Math.min(...first), 0)
  check('...and can lap the board', Math.max(...first) > 6, true)
  check('...within the two dials', [Math.min(...first) >= 0, Math.max(...first) <= 20], [true, true])
  const basic = rolls(3, 'basic')
  check('a later basic roll is 2 to 6', [Math.min(...basic) >= 2, Math.max(...basic) <= 6], [true, true])
  const adv = rolls(3, 'advanced')
  check('...and the advanced floor is 1', Math.min(...adv), 1)
  check('the roll replays from its seed',
    rollStorm(3, 'advanced', counter(9)), rollStorm(3, 'advanced', counter(9)))

  // THE ENTRY RESOLVES THE BOARD. Sand burns, the Polar Sink does not, and
  // the report says what happened in public — the dials are rolled in the
  // open at a table.
  const state = at('Storm', {
    storm: 'sector-1',
    forces: [
      // Harg Pass is sand in sector-4/5 — a roll of 4 from sector-1 sweeps it.
      f('harkonnen', 'territory-02', 'sector-4', 5),
      f('atreides', 'territory-03', 'sector-1', 6),      // the Polar Sink shelters
    ],
  })
  const { patch } = stormEntry(state, 4)
  check('the storm moves where the roll says', patch.storm, 'sector-5')
  check('...kills what stood on swept sand',
    patch.forces.some(x => x.faction === 'harkonnen'), false)
  check('...spares the Polar Sink',
    patch.forces.find(x => x.faction === 'atreides')?.count, 6)
  check('...stamps the turn it moved for', patch.stormMoved, 4)
  check('...and reports the roll and the dead',
    [patch.stormReport.roll, patch.stormReport.killed.length], [4, 1])
}

// ── bidding's inputs come from the match ──────────────────────────────────
{
  // Storm at sector-7: positions walk counter-clockwise from it. The player
  // markers sit one per printed circle, so the first player is whoever the
  // storm approaches next — and the rest follow in storm order, not seat
  // order.
  const players = [
    player('atreides', 'player-position-1'),
    player('harkonnen', 'player-position-3'),
    player('fremen', 'player-position-5'),
  ]
  const opening = biddingOpening({ storm: 'sector-7', players, cards: { harkonnen: 2 } })
  check('every seated faction is in the order', [...opening.order].sort(),
    ['atreides', 'fremen', 'harkonnen'])
  check('...exactly once', opening.order.length, 3)
  check('the hands come from the counted cards',
    [opening.hands.harkonnen, opening.hands.atreides], [2, 0])
  // THE LIMITS COME OFF THE FACTION CARDS, which is the one number a client
  // must never supply: the Harkonnen hold eight where everyone else holds
  // four, and a payload could quietly level that.
  check('the limits come off the faction cards',
    [opening.limits.harkonnen, opening.limits.atreides], [8, 4])
  check('the order is stable for a fixed storm',
    biddingOpening({ storm: 'sector-7', players, cards: {} }).order, opening.order)
  check('...and rotates when the storm moves',
    biddingOpening({ storm: 'sector-16', players, cards: {} }).order === undefined
    || biddingOpening({ storm: 'sector-16', players, cards: {} }).order[0]
      !== opening.order[0], true)
}

// ── the documented half of spice collection ───────────────────────────────
{
  const cities = at('Spice Collection', {
    forces: [
      f('atreides', 'territory-13', 'sector-10', 4),      // Arrakeen — 2
      f('harkonnen', 'territory-33', 'sector-4', 2),      // Tuek's — 1
      f('emperor', 'territory-33', 'sector-4', 3),        // disputing Tuek's — each collects
      f('fremen', 'territory-40', 'sector-13', 5),        // Sietch Tabr — no income printed
      { ...f('bene-gesserit', 'territory-26', 'sector-11', 1), posture: 'advisor' as const },
    ],
  })
  const paid = cityIncome(cities)
  check('each occupant of a paying city collects',
    paid.map(p => `${p.faction}:${p.amount}`).sort(),
    ['atreides:2', 'emperor:1', 'harkonnen:1'])
  // AN ADVISOR DOES NOT OCCUPY — the same rule the stronghold count applies.
  check('...an advisor collects nothing', paid.some(p => p.faction === 'bene-gesserit'), false)
  // THE PAYOUT IS THE BOARD'S, not a table here: spiceIncome is printed per
  // territory by the generator, so a redrawn board repays itself.
  check('...at the rate the board prints',
    DUNE_TERRITORIES.filter(t => t.spiceIncome).map(t => t.spiceIncome), [2, 2, 1])
  // ADVANCED ONLY: the payout is listed among the advanced changes.
  check('the basic game pays no city income', cityIncome({ ...cities, mode: 'basic' }), [])
}

// ── the Mentat Pause counts strongholds ───────────────────────────────────
{
  const hold3 = [
    f('atreides', 'territory-13', 'sector-10'),
    f('atreides', 'territory-26', 'sector-11'),
    f('atreides', 'territory-40', 'sector-13'),
  ]
  const seated = {
    players: [player('atreides', 'player-position-1'), player('harkonnen', 'player-position-3'),
      player('bene-gesserit', 'player-position-5')],
  }

  check('three strongholds at the pause wins',
    mentatVerdict(at('Mentat Pause', { forces: hold3, ...seated }), null),
    { factions: ['atreides'], reason: 'strongholds', turn: 4 })
  check('...two does not', mentatVerdict(at('Mentat Pause', { forces: hold3.slice(0, 2), ...seated }), null), null)
  check('...and the count that wins is the named constant', WIN_STRONGHOLDS, 3)

  // THE PREDICTION OUTRANKS THE BOARD — on the right turn, and only then.
  check('a foreseen win is the Bene Gesserit\'s alone',
    mentatVerdict(at('Mentat Pause', { forces: hold3, ...seated }), { faction: 'atreides', turn: 4 }),
    { factions: ['bene-gesserit'], reason: 'prediction', turn: 4 })
  check('...on the wrong turn it is not',
    mentatVerdict(at('Mentat Pause', { forces: hold3, ...seated }), { faction: 'atreides', turn: 5 })?.reason,
    'strongholds')

  // TURN TEN ENDS THE GAME WHATEVER THE BOARD SAYS. The Fremen default first,
  // the Guild's after it, and — a table the printed rules assume cannot exist —
  // most strongholds when neither is seated.
  const tenth = (forces: Force[], factions: string[]) => at('Mentat Pause', {
    turn: TURN_LIMIT, forces,
    players: factions.map((x, i) => player(x, `player-position-${i + 1}`)),
  })
  check('turn nine without a win plays on',
    mentatVerdict(at('Mentat Pause', { turn: 9, forces: [], ...seated }), null), null)
  // THE CARD'S SHAPE, part by part. "You (or no one) occupies Sietch Tabr
  // and Habbanya Sietch, and neither Harkonnen, Atreides nor Emperor occupies
  // Tuek's Sietch." Each clause below breaks or satisfies exactly one part.
  const fremenTable = ['fremen', 'harkonnen', 'atreides', 'spacing-guild']
  const fremenHold = [
    f('fremen', SIETCH_TABR, 'sector-13'), f('fremen', HABBANYA_SIETCH, 'sector-16')]
  check("the Fremen default: both sietches and Tuek's unclaimed",
    mentatVerdict(tenth(fremenHold, fremenTable), null)?.reason, 'fremen-default')
  // "OR NO ONE": the desert wins with the sietches standing empty too. The
  // old reading required Fremen boots in both, which turned "or no one" into
  // a Guild win.
  check('...and with both sietches empty, still the Fremen',
    mentatVerdict(tenth([], fremenTable), null)?.reason, 'fremen-default')
  check('...one sietch each way is fine',
    mentatVerdict(tenth([f('fremen', SIETCH_TABR, 'sector-13')], fremenTable), null)?.reason,
    'fremen-default')
  // A RIVAL'S FIGHTERS IN A SIETCH break it —
  check('...a rival standing in a sietch breaks it',
    mentatVerdict(tenth([f('harkonnen', SIETCH_TABR, 'sector-13')], fremenTable), null)?.reason,
    'guild-default')
  // — BUT AN ADVISOR DOES NOT. An advisor does not occupy, here as everywhere.
  check('...but a watching advisor does not',
    mentatVerdict(tenth(
      [{ ...f('bene-gesserit', SIETCH_TABR, 'sector-13', 1), posture: 'advisor' as const }],
      [...fremenTable, 'bene-gesserit']), null)?.reason, 'fremen-default')
  // TUEK'S: the card names three rivals, and only three.
  for (const rival of ['harkonnen', 'atreides', 'emperor']) {
    check(`...broken by ${rival} sitting in Tuek's`,
      mentatVerdict(tenth([...fremenHold, f(rival, TUEKS_SIETCH, 'sector-4')],
        [...new Set([...fremenTable, rival])]), null)?.reason, 'guild-default')
  }
  check("...while the Guild in their own Tuek's breaks nothing",
    mentatVerdict(tenth([...fremenHold, f('spacing-guild', TUEKS_SIETCH, 'sector-4')],
      fremenTable), null)?.reason, 'fremen-default')

  // PINNED TO THE CARD. The wording this code implements is in factions.ts,
  // and if that text changes the code must follow — so the phrases the two
  // corrections came from are asserted, not assumed.
  const card = factionById('fremen' as FactionId)?.specialVictory ?? ''
  check('the code follows the printed card',
    ['you (or no one)', 'Harkonnen, Atreides nor Emperor'].filter(p => !card.includes(p)), [])
  check('the Guild wins a game nobody won',
    mentatVerdict(tenth([], ['atreides', 'spacing-guild']), null),
    { factions: ['spacing-guild'], reason: 'guild-default', turn: TURN_LIMIT })
  check('without them, the most strongholds takes it',
    mentatVerdict(tenth([f('harkonnen', 'territory-13', 'sector-10')], ['atreides', 'harkonnen']), null),
    { factions: ['harkonnen'], reason: 'most-strongholds', turn: TURN_LIMIT })
  check('...shared when shared',
    mentatVerdict(tenth([], ['atreides', 'harkonnen']), null)?.factions, ['atreides', 'harkonnen'])

  // THE NAMED TERRITORIES ARE THE ONES THE RULES NAME. Ids are pinned rather
  // than looked up, so a regenerated board that renumbers is caught here and
  // not by the Fremen quietly losing their default.
  const nameOf = (id: string) => DUNE_TERRITORIES.find(t => t.id === id)?.displayName
  check('the pinned ids carry the names the rules use',
    [nameOf(SIETCH_TABR), nameOf(HABBANYA_SIETCH), nameOf(TUEKS_SIETCH)],
    ['Sietch Tabr', 'Habbanya Sietch', "Tuek's Sietch"])
}

// ── the endpoint drives it ────────────────────────────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const advCase = fn.slice(fn.indexOf("case 'ADVANCE_PHASE'"), fn.indexOf("case 'SEED_SPICE'"))
  check('the endpoint has the advance', advCase.length > 800, true)

  // WHO. The host's faction from the state; the row's creator for a match
  // dealt before hosts existed; anybody for a row with neither.
  check('the host is read from the state',
    /myFaction === hostFaction/.test(advCase), true)
  check('...falling back to the row\'s creator',
    /match\.created_by === user\.id/.test(advCase), true)

  // THE HOLDS COME FROM THE SHARED BUNDLE — the same one the client's button
  // reads, so what looks pressable is what the server permits.
  check('the holds are the bundle\'s, not a second opinion',
    /advanceHold\(state as never, now\)/.test(advCase), true)
  check('...refused with their deadline attached',
    /\.\.\.\(hold\.until \? \{ until: hold\.until \} : null\)/.test(advCase), true)
  // THE LOOK-WINDOW STOPS ONLY THE TABLE.
  // THE GUARD, NOT THE EXPRESSION: sabotage prefixed it with `false &&` and
  // a substring match stayed green while everyone advanced early.
  check('the look-window refuses non-hosts alone',
    /if \(!isHost && phaseWindowOpen\(state as never, now\)\)/.test(advCase), true)

  // THE OWED STORM: a match is dealt into Storm, so the first press rolls and
  // stays put rather than moving on over weather that never happened.
  check('a dealt-in storm is rolled before it is left',
    /state\.phase === 'Storm' && state\.stormMoved !== state\.turn/.test(advCase), true)

  // ENTRIES DO THE PHASE'S WORK IN THE POINTER'S WRITE.
  check('entering the blow turns it under the moved pointer',
    /baseState = base\s*[\r\n]+\s*return await turnTheBlow\(\)/.test(advCase), true)
  check('entering bidding computes its inputs from the match',
    /biddingOpening\(\{/.test(advCase), true)
  // NOTHING FROM THE PAYLOAD, not merely not-these-three-fields: the case
  // takes no arguments, so any `action.` read inside it is a client deciding
  // something the match must decide.
  check('...never from the payload', /\baction\.\w/.test(advCase), false)
  check('...and a turn with every hand full skips rather than wedges',
    /biddingSkipped: true/.test(advCase), true)
  check('entering charity opens the window',
    /charity: \{ expiresAt: now \+ CHARITY_WINDOW_MS, claims: \[\], turn \}/.test(advCase), true)

  // COLLECTION PAYS THROUGH THE LEDGER, like charity: one mover, auditable.
  check('city income moves through the ledger',
    /reason: 'city-income'/.test(advCase), true)
  check('...merged into each row, never replacing it',
    /\{ \.\.\.d, spice: moved\.purses\[id\] \}/.test(advCase), true)

  // THE END. The verdict and the row's status land in one transaction, and
  // the prediction is read from the Bene Gesserit's own row alone.
  check('the verdict ends the match in the same write',
    /await plainly\(\{ winner: verdict \}, 'complete'\)/.test(advCase), true)
  check('...reading the prediction from their own row',
    /seatOfFaction\['bene-gesserit'\]/.test(advCase), true)
  // A MATCH FROM BEFORE THE LOOP can sit at Mentat ten unfinished; leaving it
  // must end the game it missed, not play an eleventh turn.
  check('an overrun match is ended, not extended',
    /target\.newTurn && Number\(state\.turn\) >= TURN_LIMIT/.test(advCase), true)

  // THE HARNESS CAN DRIVE THE LOOP. Six seats in one page was the only way to
  // test the refusals without six browsers, and its phase buttons stopped at
  // charity and bidding — which read as the whole game to anybody testing.
  check('the six-seat harness posts the advance',
    /send\(mine, 'ADVANCE_PHASE'\)/.test(code('src/components/dune/DuneMultiSeatView.tsx')), true)

  // THE MIGRATION. Status rides the same CAS write, and only the one
  // transition a state write may make.
  const sql = readFileSync('supabase/migrations/20260827180000_match_write_status.sql', 'utf8')
  check('the write RPC can complete a match',
    /status\s+=\s+coalesce\(p_status, m\.status\)/.test(sql), true)
  check('...and only complete it', /p_status <> 'complete'/.test(sql), true)
  check('...dropping the old arity so calls cannot go ambiguous',
    /drop function if exists apply_match_write\(uuid, int, jsonb, jsonb, jsonb\);/.test(sql), true)
}

// ── the look-window is long enough to look at ─────────────────────────────
check('the phase window is seconds, not minutes', PHASE_SECONDS >= 10 && PHASE_SECONDS <= 60, true)
check('a game is ten turns', TURN_LIMIT, 10)

// ── the notice board cannot cover the controls ────────────────────────────
//
// WHY THIS EXISTS. The notices were a fixed overlay pinned to the top right —
// the corner the HUD column occupies — and being opaque they sat ON the Ready
// button of any table small enough to keep it high in the column. Nobody could
// press Ready, so no answer reached the server, so the expired window was
// never pushed closed, so the Storm never advanced: one box over one button
// wedged a whole match, reported as "storm won't advance".
{
  const match = code('src/components/dune/DuneMatchScreen.tsx')
  const game = code('src/components/dune/DuneGameScreen.tsx')

  // IN FLOW, NOT PINNED. Siblings in flow have no z-order: the board can push
  // the HUD down but can never sit on it.
  const board = match.slice(match.indexOf('const notices ='), match.indexOf('data-layer="dune-notices"'))
  check('the notice board is there to check', board.length > 50, true)
  check('the notices are not pinned over the column',
    /position: 'fixed'/.test(match.slice(match.indexOf('const notices ='),
      match.indexOf('const notices =') + 2200)), false)
  check('...they are handed to the screen instead', /notices=\{notices\}/.test(match), true)
  // ABOVE THE PLAYERS, inside their column: pushed-down controls stay
  // reachable; covered ones do not.
  const column = game.slice(game.indexOf('{notices}'), game.indexOf('<PlayerHud'))
  check('the screen seats them above the players', column.length > 0 && column.length < 600, true)

  // ── AND AN EXPIRED WINDOW CAN ALWAYS BE PUSHED ──────────────────────────
  // Once every reachable seat has answered and one seat has walked away, the
  // clock expires with nobody holding a button that still works — Ready is
  // disabled once pressed. The push is a repeated 'ready', which the server
  // accepts idempotently and which triggers the expired close like any other
  // answer. Scoped to the notices, where the button lives.
  const notice = match.slice(match.indexOf('const notices ='), match.indexOf('<DuneGameScreen'))
  // THE WHOLE GUARD, brace included: `false &&` prefixed to it left the
  // substring intact and the button dead, and the spectator clause appears
  // in the auction block too, so each piece alone proves nothing.
  check('an expired setup offers the push',
    /\{setup\.closesAt != null && now >= setup\.closesAt && !spectating && \(/.test(notice), true)
  check('...which is a repeated ready',
    /send\(\{ type: 'SETUP_ANSWER', answer: 'ready' \}\)/.test(notice), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
