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
  phaseAfter, advanceHold, phaseWindowOpen, autoAdvanceDelay, autoPushDelay,
  shiftDeadlines, DEADLINE_KEYS,
  AUTO_ADVANCE_HOST_MS, AUTO_ADVANCE_SEAT_MS, AUTO_ADVANCE_STEP_MS, rollStorm, stormEntry, cityIncome,
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

  // A DEFAULT CARRIES THE ALLY. Both cards say the allies win too — the
  // faction named first — and an ally the table no longer seats does not.
  const pairUp = (factions: string[], a: string, b: string) =>
    factions.map((x, i) => ({
      ...player(x, `player-position-${i + 1}`),
      ally: x === a ? b : x === b ? a : null,
    }))
  check('the Fremen default crowns the ally with them',
    mentatVerdict(at('Mentat Pause', {
      turn: TURN_LIMIT, forces: fremenHold,
      players: pairUp(fremenTable, 'fremen', 'atreides') as never,
    }), null),
    { factions: ['fremen', 'atreides'], reason: 'fremen-default', turn: TURN_LIMIT })
  check('...and the Guild default theirs',
    mentatVerdict(at('Mentat Pause', {
      turn: TURN_LIMIT, forces: [f('harkonnen', SIETCH_TABR, 'sector-13')],
      players: pairUp(fremenTable, 'spacing-guild', 'harkonnen') as never,
    }), null),
    { factions: ['spacing-guild', 'harkonnen'], reason: 'guild-default', turn: TURN_LIMIT })
  check('...never an ally who is not seated',
    mentatVerdict(at('Mentat Pause', {
      turn: TURN_LIMIT, forces: [],
      players: [
        { ...player('spacing-guild', 'player-position-1'), ally: 'emperor' },
        { ...player('atreides', 'player-position-2'), ally: null },
      ] as never,
    }), null)?.factions,
    ['spacing-guild'])

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

  // ── THE SPICE TIEBREAK, as ruled ────────────────────────────────────────
  // A tie on strongholds is broken by MOST SPICE AMONG THE TIED; still tied
  // shares. The purses come from match_secrets — the caller reads them with
  // the service role and hands them in — so the verdict must give back who
  // and why and NOTHING an amount could ride out on.
  {
    const noGuild = tenth([
      f('atreides', 'territory-13', 'sector-10'),
      f('harkonnen', 'territory-26', 'sector-11'),
    ], ['atreides', 'harkonnen', 'fremen'])
    // THE CHAIN, in the ruled order: the Fremen are seated but a rival in a
    // sietch breaks their claim, no Guild is at the table, and the count is
    // clear — two strongholds beat one without ever asking a purse.
    const broken = { ...noGuild, forces: [...noGuild.forces, f('harkonnen', SIETCH_TABR, 'sector-13')] }
    check('a broken desert claim falls through to the count',
      mentatVerdict(broken, null, { atreides: 8, harkonnen: 5, fremen: 20 }),
      { factions: ['harkonnen'], reason: 'most-strongholds', turn: TURN_LIMIT })

    const tie = tenth([
      f('atreides', 'territory-13', 'sector-10'),
      f('harkonnen', SIETCH_TABR, 'sector-13'),
    ], ['atreides', 'harkonnen'])
    check('...the fuller purse takes a real tie',
      mentatVerdict(tie, null, { atreides: 8, harkonnen: 5 }),
      { factions: ['atreides'], reason: 'most-spice', turn: TURN_LIMIT })
    // AMONG THE TIED ONLY: the richest purse outside the tie is not in the
    // question.
    const third = tenth([
      f('atreides', 'territory-13', 'sector-10'),
      f('harkonnen', SIETCH_TABR, 'sector-13'),
    ], ['atreides', 'harkonnen', 'bene-gesserit'])
    check('...counting only the tied',
      mentatVerdict(third, null, { atreides: 3, harkonnen: 2, 'bene-gesserit': 99 })?.factions,
      ['atreides'])
    // EQUAL PURSES SHARE — and the reason says strongholds, not spice: naming
    // the spice would announce the purses came out equal, which is a fact
    // about holdings the shared result does not otherwise reveal.
    check('...and equal purses share, said as strongholds',
      mentatVerdict(tie, null, { atreides: 5, harkonnen: 5 }),
      { factions: ['atreides', 'harkonnen'], reason: 'most-strongholds', turn: TURN_LIMIT })
    // NO PURSES, NO TIEBREAK: a caller without the secrets — a replay of
    // public state — still gets a lawful verdict.
    check('...and with no purses handed in, the tie shares',
      mentatVerdict(tie, null)?.factions, ['atreides', 'harkonnen'])
    // A CLEAR STRONGHOLD WIN NEVER ASKS THE PURSES.
    check('a clear count ignores the purses',
      mentatVerdict(tenth([
        f('atreides', 'territory-13', 'sector-10'), f('atreides', 'territory-26', 'sector-11'),
      ], ['atreides', 'harkonnen']), null, { atreides: 0, harkonnen: 99 })?.factions,
      ['atreides'])
    // THE PREDICTION STILL OUTRANKS a purse-broken win.
    check('the prediction can steal a spice-broken win',
      mentatVerdict({ ...tie, players: [...tie.players, player('bene-gesserit', 'player-position-5')] },
        { faction: 'atreides', turn: TURN_LIMIT }, { atreides: 8, harkonnen: 5 })?.factions,
      ['bene-gesserit'])

    // AND THE VERDICT CARRIES NO AMOUNT. The shape is the privacy contract:
    // whatever the purses said, the object that leaves is who, why, when.
    const out = mentatVerdict(tie, null, { atreides: 8, harkonnen: 5 })!
    check('the verdict carries who, why, when, and nothing else',
      Object.keys(out).sort(), ['factions', 'reason', 'turn'])
  }

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
  // THE ADVANCE IS A FUNCTION NOW, not a case body: the sweep that rolls a
  // finished phase forward off somebody else's action calls the same code the
  // button does, so it was lifted out rather than copied. Everything below is
  // a claim about that function.
  const advAt = fn.indexOf('async function advancePhase(')
  const advCase = fn.slice(advAt, fn.indexOf('  switch (action.type) {', advAt))
  check('the endpoint has the advance', advAt > 0 && advCase.length > 800, true)

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
    /await plainly\(\{ winner: verdict, spiceRevealed: held\.spice \}, 'complete'\)/.test(advCase), true)
  // SCREENS COME DOWN WITH THE WINNER, and only with the winner: the reveal
  // rides the finishing write or not at all. A second place writing
  // spiceRevealed would be a purse published mid-game.
  check('...and the purses are published there alone',
    (advCase.match(/spiceRevealed/g) ?? []).length, 1)
  check('...never anywhere else in the endpoint',
    (fn.match(/spiceRevealed/g) ?? []).length, 1)
  // THE SECRETS ARE READ FOR THE JUDGING AND NOTHING ELSE: purses through
  // the ledger's own reader, the prediction off the one row it belongs to,
  // both handed to the pure verdict — which is held, below, to return no
  // shape that could carry an amount back out.
  check('...judged with the purses',
    /mentatVerdict\(onState as never, held\.prediction, held\.spice\)/.test(advCase), true)
  check('...read through the ledger\'s reader', /spice\[fac\] = readSpice\(d\)/.test(advCase), true)
  check('...with the prediction still theirs alone',
    /if \(fac === 'bene-gesserit'\) prediction = d\.prediction/.test(advCase), true)
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

// ── the harvest ───────────────────────────────────────────────────────────
// Phase 8's basic half: 3 a force with Arrakeen or Carthag held, else 2; by
// the marker's own sector; capped by the pile; the rest stays. Advisors
// neither collect nor grant the city rate.
{
  const { spiceHarvest, stormOrder: order } = await import('@/lib/dune/phaseAdvance')
  const P = (faction: string, i: number) =>
    ({ faction, seat: `player-position-${i}`, reserves: 0, handCount: 0, ally: null })
  const players = [P('atreides', 1), P('harkonnen', 2)] as never
  const F = (faction: string, territoryId: string, sector: string, count: number,
    over: Record<string, unknown> = {}) =>
    ({ faction, territoryId, sector, count, ...over })
  const base = { storm: 'sector-3' as never, players }

  check('two a force from the marker they stand on',
    spiceHarvest({ ...base, forces: [F('atreides', 'territory-22', 'sector-15', 3)] as never,
      spiceOnBoard: { 'territory-22': 8 } }).collected,
    [{ faction: 'atreides', territoryId: 'territory-22', amount: 6 }])
  check('...and the rest stays where it lies',
    spiceHarvest({ ...base, forces: [F('atreides', 'territory-22', 'sector-15', 3)] as never,
      spiceOnBoard: { 'territory-22': 8 } }).spiceOnBoard,
    { 'territory-22': 2 })
  check('three a force with Arrakeen held',
    spiceHarvest({ ...base, forces: [
      F('atreides', 'territory-22', 'sector-15', 3),
      F('atreides', 'territory-13', 'sector-10', 1),
    ] as never, spiceOnBoard: { 'territory-22': 20 } }).collected,
    [{ faction: 'atreides', territoryId: 'territory-22', amount: 9 }])
  check('...and with Carthag held the same',
    spiceHarvest({ ...base, forces: [
      F('harkonnen', 'territory-22', 'sector-15', 2),
      F('harkonnen', 'territory-26', 'sector-11', 1),
    ] as never, spiceOnBoard: { 'territory-22': 20 } }).collected,
    [{ faction: 'harkonnen', territoryId: 'territory-22', amount: 6 }])
  check('a stack takes only what is there, and empties the marker',
    spiceHarvest({ ...base, forces: [F('atreides', 'territory-22', 'sector-15', 3)] as never,
      spiceOnBoard: { 'territory-22': 4 } }),
    { collected: [{ faction: 'atreides', territoryId: 'territory-22', amount: 4 }],
      spiceOnBoard: {} })
  check('the marker\'s own sector collects, the territory\'s others walk past',
    spiceHarvest({ ...base, forces: [F('atreides', 'territory-11', 'sector-12', 5)] as never,
      spiceOnBoard: { 'territory-11': 6 } }).collected, [])
  check('an advisor on the marker collects nothing',
    spiceHarvest({ ...base, forces: [
      F('atreides', 'territory-22', 'sector-15', 3, { posture: 'advisor' }),
    ] as never, spiceOnBoard: { 'territory-22': 8 } }).collected, [])
  check('...and an advisor in Arrakeen buys nobody the city rate',
    spiceHarvest({ ...base, forces: [
      F('atreides', 'territory-22', 'sector-15', 3),
      F('atreides', 'territory-13', 'sector-10', 1, { posture: 'advisor' }),
    ] as never, spiceOnBoard: { 'territory-22': 20 } }).collected,
    [{ faction: 'atreides', territoryId: 'territory-22', amount: 6 }])
  check('starred forces collect as one force each',
    spiceHarvest({ ...base, forces: [
      F('atreides', 'territory-22', 'sector-15', 2, { starred: 2 }),
    ] as never, spiceOnBoard: { 'territory-22': 20 } }).collected,
    [{ faction: 'atreides', territoryId: 'territory-22', amount: 4 }])
  check('a shared marker drains in storm order',
    (() => {
      const forces = [
        F('atreides', 'territory-22', 'sector-15', 2),
        F('harkonnen', 'territory-22', 'sector-15', 2),
      ] as never
      const out = spiceHarvest({ ...base, forces, spiceOnBoard: { 'territory-22': 5 } })
      const first = order('sector-3' as never, players)[0]
      return [out.collected[0].faction, out.collected[0].amount,
        out.collected[1].amount, Object.keys(out.spiceOnBoard).length, first]
    })(),
    (() => {
      const first = order('sector-3' as never, players)[0]
      return [first, 4, 1, 0, first]
    })())

  // ── the server slice ────────────────────────────────────────────────────
  const fn = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const cut = fn.slice(fn.indexOf("case 'Spice Collection'"), fn.indexOf("case 'Mentat Pause'"))
  check('the phase entry harvests and pays in ONE write',
    [/const harvest = spiceHarvest\(base as never\)/.test(cut),
      /reason: 'spice-harvest'/.test(cut),
      /reason: 'city-income'/.test(cut),
      /spiceOnBoard: harvest\.spiceOnBoard,/.test(cut)],
    [true, true, true, true])
  check('...and passes straight through when nothing is owed',
    /if \(harvest\.collected\.length === 0 && paid\.length === 0\) return await plainly\(\)/.test(cut),
    true)
}

// ── the Mentat Pause ──────────────────────────────────────────────────────
// Three strongholds win alone. An ALLIANCE is judged together at four —
// each stronghold counted once however many allies stand in it — and an
// allied player at three alone wins nothing. A winnerless pause holds the
// turn marker for one minute while the table readies.
{
  const { mentatVerdict: verdict, advanceHold: hold2, resetDeadlines: reset2,
    ALLIANCE_WIN_STRONGHOLDS, MENTAT_READY_SECONDS } =
    await import('@/lib/dune/phaseAdvance')
  const P = (faction: string, ally: string | null = null) =>
    ({ faction, seat: 's', reserves: 0, handCount: 0, ally })
  const S = (faction: string, territoryId: string) =>
    ({ faction, territoryId, sector: 'sector-10', count: 1 })
  const allies = [P('atreides', 'fremen'), P('fremen', 'atreides'), P('harkonnen')] as never

  check('the thresholds and the minute',
    [ALLIANCE_WIN_STRONGHOLDS, MENTAT_READY_SECONDS], [4, 60])
  check('an alliance wins at four strongholds between them',
    verdict({ turn: 3, players: allies, forces: [
      S('atreides', 'territory-13'), S('atreides', 'territory-26'),
      S('fremen', 'territory-38'), S('fremen', 'territory-40'),
    ] as never } as never, null),
    { factions: ['atreides', 'fremen'], reason: 'strongholds', turn: 3 })
  check('...an allied player at three alone wins nothing',
    verdict({ turn: 3, players: allies, forces: [
      S('atreides', 'territory-13'), S('atreides', 'territory-26'),
      S('atreides', 'territory-38'),
    ] as never } as never, null), null)
  check('...and a stronghold both allies stand in counts once',
    verdict({ turn: 3, players: allies, forces: [
      S('atreides', 'territory-13'), S('fremen', 'territory-13'),
      S('atreides', 'territory-26'), S('fremen', 'territory-38'),
    ] as never } as never, null), null)
  check('a solo player keeps the three-stronghold win beside them',
    verdict({ turn: 3, players: allies, forces: [
      S('harkonnen', 'territory-13'), S('harkonnen', 'territory-26'),
      S('harkonnen', 'territory-38'),
    ] as never } as never, null),
    { factions: ['harkonnen'], reason: 'strongholds', turn: 3 })
  check('...and the prediction steals an alliance win too',
    verdict({
      turn: 3, players: [...(allies as never[]), P('bene-gesserit')] as never,
      forces: [
        S('atreides', 'territory-13'), S('atreides', 'territory-26'),
        S('fremen', 'territory-38'), S('fremen', 'territory-40'),
      ] as never,
    } as never, { faction: 'atreides', turn: 3 }),
    { factions: ['bene-gesserit'], reason: 'prediction', turn: 3 })

  // ── turn ten ties score the pair together ───────────────────────────────
  // Harkonnen stand in both sietches so the Fremen default cannot fire, no
  // Guild is seated, and nobody is at a winning threshold: the tie is real.
  const tenBase = (forces: unknown[], spice?: Record<string, number>) =>
    verdict({ turn: 10, players: allies, forces: forces as never } as never,
      null, spice ?? null)
  check('at ten, an alliance tallies its strongholds as one pair',
    tenBase([
      S('atreides', 'territory-13'), S('atreides', 'territory-26'),
      S('fremen', 'territory-33'),
      S('harkonnen', 'territory-40'), S('harkonnen', 'territory-38'),
    ]),
    { factions: ['atreides', 'fremen'], reason: 'most-strongholds', turn: 10 })
  check('...a full tie of pair and solo shares the crown',
    tenBase([
      S('atreides', 'territory-13'), S('fremen', 'territory-26'),
      S('harkonnen', 'territory-40'), S('harkonnen', 'territory-38'),
    ]),
    { factions: ['harkonnen', 'atreides', 'fremen'], reason: 'most-strongholds', turn: 10 })
  check('...an allied seat never doubles as its own solo unit',
    tenBase([
      S('atreides', 'territory-13'), S('atreides', 'territory-26'),
      S('harkonnen', 'territory-40'), S('harkonnen', 'territory-38'),
    ]),
    { factions: ['harkonnen', 'atreides', 'fremen'], reason: 'most-strongholds', turn: 10 })
  check('...and the spice tiebreak counts the two purses combined',
    tenBase([
      S('atreides', 'territory-13'), S('fremen', 'territory-26'),
      S('harkonnen', 'territory-40'), S('harkonnen', 'territory-38'),
    ], { atreides: 3, fremen: 3, harkonnen: 5 }),
    { factions: ['atreides', 'fremen'], reason: 'most-spice', turn: 10 })
  check('...which a richer solo purse still beats',
    tenBase([
      S('atreides', 'territory-13'), S('fremen', 'territory-26'),
      S('harkonnen', 'territory-40'), S('harkonnen', 'territory-38'),
    ], { atreides: 1, fremen: 1, harkonnen: 5 }),
    { factions: ['harkonnen'], reason: 'most-spice', turn: 10 })

  const held = (mentat: unknown) => hold2({
    phase: 'Mentat Pause', turn: 3, mode: 'basic', storm: 'sector-1',
    shieldWall: 'intact', forces: [], players: allies, mentat,
  } as never, 1000)
  check('a winnerless pause holds the turn marker for its minute',
    held({ closesAt: 61_000, ready: [] }),
    { code: 'mentat-pause', until: 61_000 })
  check('...everyone ready clears it',
    held({ closesAt: 61_000, ready: ['atreides', 'fremen', 'harkonnen'] }), null)
  check('...and so does the clock', held({ closesAt: 999 }), null)
  check('...and the reset restamps its minute',
    (() => {
      const out = reset2({
        phase: 'Mentat Pause', turn: 3, mode: 'basic', storm: 'sector-1',
        shieldWall: 'intact', forces: [], players: allies,
        mentat: { closesAt: 5, ready: [] },
      } as never, 1_000_000, {
        setupSeconds: 1, charityMs: 1, wormSeconds: 1, bidSeconds: 1,
        shipmentSeconds: 1, battlePickSeconds: 1, battlePlanSeconds: 1,
        battleTraitorSeconds: 1, battleVoiceSeconds: 1,
        battlePrescienceSeconds: 1, battleAllocateSeconds: 1,
        battleCaptureSeconds: 1, mentatSeconds: MENTAT_READY_SECONDS,
        nexusSeconds: 1, karamaGiveSeconds: 1,
      })
      return [(out.patch.mentat as { closesAt: number }).closesAt, out.reset]
    })(),
    [1_000_000 + MENTAT_READY_SECONDS * 1000, ['mentat']])

  // ── the server slice ────────────────────────────────────────────────────
  const fn = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const pauseCut = fn.slice(fn.indexOf("case 'Mentat Pause'"), fn.indexOf("case 'Shipment and Movement'"))
  check('a winnerless pause opens the minute',
    /mentat: \{ turn, closesAt: now \+ MENTAT_READY_SECONDS \* 1000, ready: \[\] \}/.test(pauseCut),
    true)
  check('...cleared by the advance that moves the marker',
    /if \(state\.phase === 'Mentat Pause'\) delete base\.mentat/.test(fn), true)
  const readyCase = fn.slice(fn.indexOf("case 'MENTAT_READY'"), fn.indexOf("case 'BATTLE_CAPTURE'"))
  check('a seat readies once, and it is written',
    [/code: 'already-ready' \}, 409\)/.test(readyCase),
      /mentat: \{ \.\.\.m, ready: \[\.\.\.ready, myFaction\] \}/.test(readyCase)],
    [true, true])
  check('...and RESET_CLOCK passes the minute along',
    /mentatSeconds: MENTAT_READY_SECONDS,/.test(fn), true)

  // ── the table's bar ─────────────────────────────────────────────────────
  const mentatRail = readFileSync('src/components/dune/MentatRail.tsx', 'utf8')
  const game = readFileSync('src/components/dune/DuneGameScreen.tsx', 'utf8')
  check('the screen offers Ready, says when a seat is, and counts the minute',
    [/<MentatRail/.test(game), /data-mentat-waiting=""/.test(mentatRail),
      /state\.mentat\?\.closesAt/.test(game)], [true, true, true])
  // AND IT IS A BUBBLE, which is the rail's grammar — a plain rectangle in
  // that column reads as something that arrived from somewhere else.
  check('...as a bubble in the rail, not a button on the board',
    [/<ForceBubble/.test(mentatRail), /data-mentat-count=""/.test(mentatRail),
      /data-layer="mentat-bar"/.test(game)],
    [true, true, false])
  const match = readFileSync('src/components/dune/DuneMatchScreen.tsx', 'utf8')
  const harness = readFileSync('src/components/dune/DuneMultiSeatView.tsx', 'utf8')
  check('both drivers post the ready, and the hold has its sentence',
    [/MENTAT_READY/.test(match), /MENTAT_READY/.test(harness),
      /'mentat-pause': /.test(match)], [true, true, true])
}

// ── the Nexus holds the blow phase ────────────────────────────────────────
{
  const { advanceHold: hold3, resetDeadlines: reset3 } =
    await import('@/lib/dune/phaseAdvance')
  const { NEXUS_SECONDS } = await import('@/lib/dune/spiceBlow')
  const blowState = (over: object) => ({
    phase: 'Spice Blow and Nexus', turn: 3, mode: 'basic', storm: 'sector-1',
    shieldWall: 'intact', forces: [], players: [],
    spiceDeck: { turn: 3 }, ...over,
  } as never)
  check('an open Nexus holds the phase for its five minutes',
    hold3(blowState({ nexus: { turn: 3, closesAt: 400_000, ready: [] } }), 1000),
    { code: 'nexus-open', until: 400_000 })
  check('...the worm ride is the nearer clock while both run',
    hold3(blowState({
      wormRide: { turn: 3, territories: [], closesAt: 100_000 },
      nexus: { turn: 3, closesAt: 400_000, ready: [] },
    }), 1000),
    { code: 'worm-ride', until: 100_000 })
  check('...and past its clock the Nexus holds nothing',
    hold3(blowState({ nexus: { turn: 3, closesAt: 400_000, ready: [] } }), 500_000),
    null)
  check('the reset restamps the five minutes',
    (() => {
      const out = reset3(blowState({ nexus: { turn: 3, closesAt: 5, ready: [] } }),
        1_000_000, {
          setupSeconds: 1, charityMs: 1, wormSeconds: 1, bidSeconds: 1,
          shipmentSeconds: 1, battlePickSeconds: 1, battlePlanSeconds: 1,
          battleTraitorSeconds: 1, battleVoiceSeconds: 1,
          battlePrescienceSeconds: 1, battleAllocateSeconds: 1,
          battleCaptureSeconds: 1, mentatSeconds: 1, nexusSeconds: NEXUS_SECONDS,
          karamaGiveSeconds: 1,
        })
      return [(out.patch.nexus as { closesAt: number }).closesAt, out.reset]
    })(),
    [1_000_000 + NEXUS_SECONDS * 1000, ['nexus']])
}

// ── the storm cards ───────────────────────────────────────────────────────
// The storm advances in its two printed beats when a detonation could
// answer: calculated, a window, then moved. Weather Control writes the
// calculation; Family Atomics answers it from the Wall's reach.
{
  const { mayAtomics, STORM_CARD_SECONDS, WEATHER_CONTROL_MAX,
    SHIELD_WALL_TERRITORY, advanceHold: hold4 } =
    await import('@/lib/dune/phaseAdvance')
  check('the constants are the card\'s', [WEATHER_CONTROL_MAX, STORM_CARD_SECONDS], [10, 45])

  const wall = DUNE_TERRITORIES.find(t => t.id === SHIELD_WALL_TERRITORY)!
  check('the Wall is where the board prints it', wall.displayName, 'Shield Wall')
  const row4 = (territoryId: string, sector: string) =>
    ({ faction: 'atreides', territoryId, sector, count: 1 })
  check('a force ON the Wall is in reach, storm or no storm',
    [mayAtomics([row4(SHIELD_WALL_TERRITORY, wall.sectors[0])] as never,
      'atreides' as never, 'sector-18' as never),
      mayAtomics([row4(SHIELD_WALL_TERRITORY, wall.sectors[0])] as never,
        'atreides' as never, wall.sectors[0] as never)],
    [true, true])
  // A NEIGHBOUR IN REACH: found from the geography rather than hard-coded,
  // then the SAME cell refused when its own sector is stormed — "no storm
  // between your sector and the Wall".
  const doorstep = wall.adjacent.flatMap(adj =>
    (DUNE_TERRITORIES.find(t => t.id === adj)?.sectors ?? []).map(s => ({ adj, s })))
    .find(({ adj, s }) => mayAtomics([row4(adj, s)] as never,
      'atreides' as never, 'sector-18' as never))
  check('a neighbour with a clear way in is in reach', !!doorstep, true)
  check('...and the same cell, stormed, is not',
    doorstep ? mayAtomics([row4(doorstep.adj, doorstep.s)] as never,
      'atreides' as never, doorstep.s as never) : 'no doorstep',
    false)
  check('...nobody anywhere is not', mayAtomics([] as never, 'atreides' as never, 'sector-18' as never), false)

  // THE STORM HOLDS NOTHING NOW. It used to publish its roll and wait a beat
  // so Weather Control could steer before the marker moved and Family Atomics
  // could answer once the number was known. Both cards are played at the
  // Mentat Pause — the moment immediately before the next storm, so the
  // sequence is unchanged — and the window had nothing left to hold open.
  check('nothing holds the storm, at any moment',
    [hold4(at('Storm', {}), 1000), hold4(at('Storm', {}), 500_000)],
    [null, null])

  // ── the server slice ────────────────────────────────────────────────────
  const fns = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  // ── ONE PRESS, AND BOTH CARDS AT THE PAUSE ────────────────────────────
  // The storm used to publish its roll and wait a beat: Weather Control
  // steered before the marker moved, Family Atomics answered once the number
  // was known. Both are played at the Mentat Pause now, for the storm of the
  // turn after — the moment immediately following — so the sequence is
  // unchanged in practice and the beat had nothing left to hold.
  check('nothing publishes a calculation and waits',
    [/stormCalculated: roll/.test(fns), /stormCarry/.test(fns)],
    [false, false])
  check('...the storm rolls and moves in one press',
    /const roll = await stormRollFor\(Number\(state\.turn\)\)/.test(fns), true)

  const wc = fns.slice(fns.indexOf("case 'WEATHER_CONTROL'"), fns.indexOf("case 'FAMILY_ATOMICS'"))
  check('Weather Control is played at the Pause, for the storm after',
    [/state\.phase !== 'Mentat Pause'/.test(wc),
      /const wcFor = Number\(state\.turn\) \+ 1/.test(wc),
      /stormSteer: \{ turn: wcFor, sectors, by: myFaction \}/.test(wc),
      /code: 'bad-sectors'/.test(wc),
      /'weathercontrol',\s*[\r\n]+\s*\]/.test(wc)],
    [true, true, true, true, true])
  // AND THE FREMEN ARE TOLD AGAIN. Their advanced rule promised them next
  // turn's distance at the end of this turn's storm, and this card has just
  // changed it — a promise quietly overtaken is worse than none.
  check('...and it corrects the promise it just broke',
    [/stormAhead: \{ turn: wcFor, roll: sectors \}/.test(wc),
      /p_decks: \{ storm: \[\{ turn: wcFor, roll: sectors \}\] \}/.test(wc)],
    [true, true])

  const fa = fns.slice(fns.indexOf("case 'FAMILY_ATOMICS'"), fns.indexOf("case 'TLEILAXU_GHOLA'"))
  check('Family Atomics kills the Wall\'s occupants, opens the three, and leaves the game',
    [/state\.phase !== 'Mentat Pause'/.test(fa),
      /code: 'already-detonated'/.test(fa), /code: 'not-in-reach'/.test(fa),
      /shieldWall: 'destroyed',/.test(fa),
      /tanks: bankDead\(/.test(fa),
      /removedFromPlay: \[/.test(fa)],
    [true, true, true, true, true, true])
  // NO ROLL TO WEIGH IT AGAINST. The printed card is played after the storm
  // is calculated; at the Pause it has not been. That is the one thing this
  // departure actually changes about the decision, so it is asserted.
  check('...and it is played blind, with no calculation in reach',
    /stormCarry|carried\.roll/.test(fa), false)
  check('...and is NEVER discarded — removed is the economy\'s word for it',
    /treacheryDiscard/.test(fa), false)
  const bag9 = readFileSync('scripts/local-invariants.mjs', 'utf8')
  check('the harness counts the removed as part of the economy',
    /\.\.\.\(snap\.state\.removedFromPlay \?\? \[\]\),/.test(bag9), true)
}

// ── the phase moves without a press ───────────────────────────────────────
// Nothing here can happen on a timer, so a finished phase used to sit until
// the host pressed a button between every single one. It now rolls forward off
// whatever action arrived next — the same trick setup uses to close an expired
// window — and the press stays for moving EARLY.
{
  const src = code('supabase/functions/dune-action/index.ts')

  // ONE IMPLEMENTATION, TWO CALLERS. The press and the sweep must not be able
  // to disagree about what advancing means, so the case body was lifted into a
  // function rather than copied.
  check('advancing is one function',
    [/async function advancePhase\(/.test(src),
      (src.match(/await advancePhase\(/g) ?? []).length],
    [true, 2])
  // Past the guard that refuses a press naming a phase the match has left.
  check('...which the deliberate press calls',
    [src.includes("case 'ADVANCE_PHASE': {"),
      src.indexOf("case 'ADVANCE_PHASE': {")
        < src.indexOf("return await advancePhase(state, match)")],
    [true, true])

  // THE SWEEP'S GATES ARE THE BUTTON'S GATES.
  const sweepAt = src.indexOf("if (answer.ok && action.type !== 'ADVANCE_PHASE')")
  check('the sweep runs after the action, and never after a press',
    sweepAt > 0, true)
  const sweep = src.slice(sweepAt, sweepAt + 900)
  check('...only when the phase owes nothing and the look window has shut',
    [/!advanceHold\(fresh as never, at\)/.test(sweep),
      /!phaseWindowOpen\(fresh as never, at\)/.test(sweep)],
    [true, true])
  // ON THE ROW AS IT IS NOW. The action just wrote: the version to build on and
  // the action_seq the storm is seeded from have both moved.
  check('...on the row as it stands after the action wrote',
    [/from\('matches'\)/.test(sweep), /action_seq/.test(sweep),
      /await advancePhase\(fresh, after as never\)/.test(sweep)],
    [true, true, true])
  // AND IT NEVER TURNS A COMMITTED ACTION INTO AN ERROR.
  check('a failed sweep leaves the action standing',
    [/try \{/.test(sweep), /\} catch \{/.test(sweep),
      /return answer/.test(src.slice(sweepAt, sweepAt + 1200))],
    [true, true, true])
  // A REFUSED ACTION SWEEPS NOTHING: answer.ok is the whole test.
  check('a refused action moves no phase', /answer\.ok &&/.test(src), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// ── the phase advances with nobody pressing anything ──────────────────────
// The server sweeps a finished phase forward off any successful action — but
// a quiet phase produces none, and Storm and Spice Collection can never
// produce one at all: their whole content is the write that ENTERS them, so
// once it returns there is no further event. There is no scheduler behind the
// server, so the browsers are the clock.
{
  const D = (over: Record<string, unknown> = {}) => autoAdvanceDelay({
    seated: true, spectating: false, isHost: false, held: false,
    windowOpen: false, gameOver: false, seatIndex: 0, ...over,
  } as never)

  // A SPECTATOR NEVER FIRES IT. They hold no seat, the server would refuse
  // them, and a watcher silently driving somebody else game is wrong even
  // where the server would catch it.
  check('a spectator never fires the advance', D({ spectating: true }), null)
  check('...and neither does a client holding no seat', D({ seated: false }), null)

  // THE HOLDS AND THE LOOK WINDOW STOP IT, exactly as they stop the button:
  // a hold is a pause somebody is owed, and the window is the table getting
  // to see where the turn is before it moves.
  check('a hold stops it', D({ held: true }), null)
  check('an open look window stops it', D({ windowOpen: true }), null)
  check('a finished game stops it', D({ gameOver: true }), null)

  // STAGGERED, so six machines do not all fire at once. The host goes first;
  // the others follow in board order and normally never reach their timer.
  check('the host goes first', D({ isHost: true }), AUTO_ADVANCE_HOST_MS)
  check('...and the host is not staggered by where they sit',
    D({ isHost: true, seatIndex: 4 }), AUTO_ADVANCE_HOST_MS)
  check('every other seat waits longer than the host',
    (D({ seatIndex: 0 }) ?? 0) > AUTO_ADVANCE_HOST_MS, true)
  check('...and they queue behind each other in board order',
    [D({ seatIndex: 0 }), D({ seatIndex: 1 }), D({ seatIndex: 2 })],
    [AUTO_ADVANCE_SEAT_MS,
      AUTO_ADVANCE_SEAT_MS + AUTO_ADVANCE_STEP_MS,
      AUTO_ADVANCE_SEAT_MS + 2 * AUTO_ADVANCE_STEP_MS])
  // A SEAT THE ROSTER DOES NOT LIST comes back as -1 from findIndex; it must
  // not become a negative delay that fires instantly, ahead of the host.
  check('an unplaced seat does not jump the queue',
    D({ seatIndex: -1 }), AUTO_ADVANCE_SEAT_MS)

  // WIRED, AND KEYED ON PRIMITIVES. `now` ticks every second; an effect that
  // depended on it would restart its timer on every tick and never fire — the
  // same reset that once stopped the storm animation dead.
  const screen = code('src/components/dune/DuneMatchScreen.tsx')
  check('the screen fires it on a timer',
    screen.includes('setTimeout(') && screen.includes("ADVANCE_PHASE'"), true)
  check('...asking the rule who may, and how long they wait',
    screen.includes('const delay = autoAdvanceDelay({'), true)
  check('...once per phase, not once per refusal',
    screen.includes('advanceFired.current === key'), true)
  check('...and never keyed on the ticking clock',
    screen.includes('[row?.turn, row?.phase, windowShut, holdCode, watchingOnly, amHost, seat?.faction])'),
    true)

  // THE BUTTON IS THE HOST'S ALONE now — an override for moving a finished
  // phase on EARLY. The protection the old anyone-may-press rule gave did not
  // go away; it moved into the stagger above, where nobody presses anything.
  check('only the host is offered the button',
    screen.includes('const mayAdvance = !!seat && !!row && !row.winner && !hold && amHost'), true)
}

// ── the expired auction pushes itself ─────────────────────────────────────
// The phase sweep cannot help here and must not: a live auction is a HOLD,
// and advancing over one would throw a lot away mid-sale. So the auction has
// its own deadline and its own push — silence is a pass, and the server
// applies it for whoever it is waiting on regardless of who asked. Bid and
// Pass reach only the seat to act, so one absence could stall five people.
{
  const P = (over: Record<string, unknown> = {}) => autoPushDelay({
    seated: true, spectating: false, isHost: false,
    expired: true, gameOver: false, seatIndex: 0, ...over,
  } as never)

  // IT NEVER FIRES EARLY. The auction's own clock is the only thing that
  // says a seat has run out of time, and nothing here shortens it.
  check('a live auction is never pushed', P({ expired: false }), null)
  check('a finished game is never pushed', P({ gameOver: true }), null)

  // AND A WATCHER NEVER DRIVES — the same rule the phase advance obeys, and
  // it matters more here, because this one spends somebody's turn to bid.
  check('a spectator never pushes the auction', P({ spectating: true }), null)
  check('...and neither does a client holding no seat', P({ seated: false }), null)

  // THE SAME STAGGER, so the two nudges cannot disagree about who goes first.
  check('the host pushes first', P({ isHost: true }), AUTO_ADVANCE_HOST_MS)
  check('...and the other seats queue behind in board order',
    [P({ seatIndex: 0 }), P({ seatIndex: 1 })],
    [AUTO_ADVANCE_SEAT_MS, AUTO_ADVANCE_SEAT_MS + AUTO_ADVANCE_STEP_MS])
  check('...an unplaced seat does not jump the queue',
    P({ seatIndex: -1 }), AUTO_ADVANCE_SEAT_MS)
  // ONE RULE, TWO CALLERS: whoever the advance sends first, the push sends
  // first too. Two staggers drifting apart would put a race back in.
  check('both nudges agree on who goes first',
    [P({ isHost: true }), autoAdvanceDelay({
      seated: true, spectating: false, isHost: true, held: false,
      windowOpen: false, gameOver: false, seatIndex: 0,
    } as never)],
    [AUTO_ADVANCE_HOST_MS, AUTO_ADVANCE_HOST_MS])

  // WIRED, once per window and never on the ticking clock.
  const screen2 = code('src/components/dune/DuneMatchScreen.tsx')
  check('the screen pushes the auction on a timer',
    screen2.includes('const delay = autoPushDelay({'), true)
  check('...sending a pass, which is what silence already means',
    screen2.includes("void bid({ kind: 'pass' })"), true)
  check('...once per deadline, keyed on the auction own clock',
    screen2.includes('pushFired.current === key'), true)
  check('...and never keyed on the ticking clock',
    screen2.includes('[row?.turn, auction?.closesAt, expired, watchingOnly, amHost, seat?.faction, row?.winner])'),
    true)

  // THE BUTTON IS THE HOST'S NOW. The walked-away case it existed for is
  // covered by the stagger above, with nobody clicking. The seat check stays
  // because amHost defaults TRUE on a match dealt before hosts existed, so
  // without it a spectator at such a table would be offered the button.
  check('only the host is offered the end-the-wait button',
    screen2.includes('{expired && !spectating && amHost && ('), true)
}

// ── a press names the phase it meant to end ───────────────────────────────
// FOUND IN THE LOG, which is what the log was added for. Three rows, a second
// and a half apart: a bid settles the auction; the server sweep moves Bidding
// to Revival off that same bid; and then a client advance lands on Revival
// and is ACCEPTED. Revival had been open for one and a half of its thirty
// seconds.
//
// Nothing was wrong with the clock or with the check. The client scheduled
// that advance while Bidding was genuinely finished and its window genuinely
// shut, and the phase moved in the few hundred milliseconds before the timer
// fired. React cancels a stale timer when the new row arrives — the timer
// fires in the gap before it does. And the server took it because the sender
// was the host, and the host may move on early, so the fresh window never
// protected the phase that inherited the press.
//
// So the intent travels with the press. Risk reached the same answer when its
// phase advances were landing on whichever turn happened to be live.
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const at = fn.indexOf('const meant = action.at')
  check('the press may name a phase', at > 0, true)
  const guard = fn.slice(at, at + 700)
  check('...and a press for a phase the match has left is refused',
    [/meant\.phase !== state\.phase/.test(guard),
      /Number\(meant\.turn\) !== Number\(state\.turn\)/.test(guard),
      /code: .phase-moved./.test(guard)],
    [true, true, true])
  // THE TURN AS WELL AS THE PHASE: nine phases repeat every turn, so a press
  // held over a whole turn would otherwise match the same phase one turn on.
  check('...matching on turn and phase together, not either alone',
    guard.includes("Number(meant.turn) !== Number(state.turn)"), true)
  // BEFORE ANYTHING IS ADVANCED. A guard after the work has already advanced
  // the phase it was meant to stop.
  check('...refused before the advance runs',
    at < fn.indexOf('return await advancePhase(state, match)'), true)
  // NAMING NOTHING IS STILL ALLOWED — an older client, and the sweep, which
  // re-reads the row itself and is current by construction.
  check('a press that names nothing still advances',
    /if \(meant &&/.test(guard), true)

  const screen3 = code('src/components/dune/DuneMatchScreen.tsx')
  check('the auto-press names the phase it was scheduled against',
    screen3.includes("void send({ type: 'ADVANCE_PHASE', at: { turn: row.turn, phase: row.phase } })"),
    true)
  // THE BUTTON TOO: a click is a click on what the screen was showing, and
  // the screen can be a moment behind.
  check('...and so does the button',
    screen3.includes("at: { turn: row.turn, phase: row.phase }")
      && (screen3.match(/at: \{ turn: row\.turn, phase: row\.phase \}/g) ?? []).length >= 2,
    true)
}

// ── the pause stops the clocks, not just the screen ───────────────────────
// A banner over a match whose deadlines went on running is worse than no
// pause: the table comes back to an auction that timed out, a charity window
// that shut and a phase that swept itself on. So resuming moves every
// deadline forward by exactly as long as the game stood still.
{
  // EVERY DEADLINE THE STATE ACTUALLY CARRIES, at the depth it carries it.
  // This fixture is the point of the test: a shift that missed any one of
  // these would leave that window expiring during the pause.
  const before = {
    turn: 4, phase: 'Bidding', storm: 'sector-7',
    setup: { closesAt: 1_000 },
    charity: { expiresAt: 2_000, turn: 4 },
    auction: { status: 'awaiting', closesAt: 3_000, pausedUntil: 3_500 },
    spiceBlow: { closesAt: 4_000 },
    wormRide: { closesAt: 5_000, territories: ['territory-11'] },
    nexus: { closesAt: 6_000 },
    mentat: { closesAt: 7_000, ready: [] },
    phaseClock: { turn: 4, phase: 'Bidding', closesAt: 8_000 },
    karamaGiveBack: { closesAt: 9_000 },
    shipping: { closesAt: 10_000, at: 0 },
    stormCarry: { closesAt: 11_000, roll: 3, turn: 4 },
    battles: {
      closesAt: 12_000,
      current: {
        closesAt: 13_000,
        revealed: {
          traitor: { closesAt: 14_000 },
          allocate: { closesAt: 15_000, by: 'atreides' },
        },
        voice: { closesAt: 16_000, done: false },
      },
    },
  }
  const after = shiftDeadlines(before, 1_234) as typeof before

  // WALKED, NOT LISTED. Gather every deadline-shaped key at any depth from
  // the fixture itself and require each one to have moved — so a deadline
  // added to the game tomorrow is covered without editing this test.
  // WRITTEN OUT, not imported. A scanner that asked the implementation which
  // keys are deadlines would go blind the moment the implementation forgot
  // one — which is the failure this whole block exists to catch.
  const KNOWN_DEADLINES = ['closesAt', 'expiresAt', 'opensAt', 'pausedUntil']
  const deadlines = (o: unknown, path = ''): [string, number][] => {
    if (Array.isArray(o)) return o.flatMap((v, i) => deadlines(v, `${path}[${i}]`))
    if (!o || typeof o !== 'object') return []
    return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      KNOWN_DEADLINES.includes(k) && typeof v === 'number'
        ? [[`${path}.${k}`, v] as [string, number]]
        : deadlines(v, `${path}.${k}`))
  }
  const was = deadlines(before)
  const now2 = deadlines(after)
  check('the fixture carries every deadline the game has', was.length, 17)
  check('...and every one of them moves by the pause',
    now2.map(([, v], i) => v - was[i][1]).filter(d => d !== 1_234), [])
  check('...naming the same fields, in the same places',
    now2.map(([k]) => k), was.map(([k]) => k))

  // AND NOTHING ELSE MOVES. A turn is not a time, and neither is a roll.
  check('the turn and the board are untouched',
    [after.turn, after.phase, after.storm, after.stormCarry.roll,
      after.battles.current.revealed.allocate.by],
    [4, 'Bidding', 'sector-7', 3, 'atreides'])
  check('...and arrays inside it survive', after.wormRide.territories, ['territory-11'])
  // A ZERO PAUSE CHANGES NOTHING AT ALL.
  // AND THE TWO LISTS ARE HELD TOGETHER. Written out above so the scanner is
  // independent; compared here so a key added to one and not the other is a
  // failure rather than a quiet gap.
  check('the scanner knows exactly the keys the shift moves',
    [...KNOWN_DEADLINES].sort(), [...DEADLINE_KEYS].sort())
  check('a pause of no length moves nothing',
    shiftDeadlines(before, 0), before)

  // THE HOLD. A paused match advances nothing, and this outranks every other
  // hold — whatever the board is in the middle of, it is not in the middle of
  // it right now. It carries no `until`: a pause ends when somebody ends it.
  check('a paused match holds the turn',
    advanceHold(at('Revival', { paused: { at: 1, by: 'atreides' } } as never), 9e12),
    { code: 'paused' })
  check('...ahead of a hold that would otherwise answer',
    advanceHold(at('Bidding', {
      paused: { at: 1, by: 'atreides' },
      auction: { status: 'awaiting', closesAt: 9e12 },
    } as never), 1_000)?.code,
    'paused')
  check('...and an unpaused match is unaffected',
    advanceHold(at('Revival'), 9e12), null)

  // THE ENDPOINT: anybody stops it, anybody starts it again.
  const fn2 = code('supabase/functions/dune-action/index.ts')
  check('the endpoint takes a pause and a resume',
    [fn2.includes("case 'PAUSE': {"), fn2.includes("case 'RESUME': {")],
    [true, true])
  check('...with no host check on either',
    /case .PAUSE.: \{[\s\S]{0,700}?isHost/.test(fn2), false)
  check('...and resuming shifts the clocks by how long it stood still',
    [fn2.includes('const stood = Math.max(0, now - Number(was.at))'),
      fn2.includes('shiftDeadlines(')],
    [true, true])

  // THE CLIENT: a key, not a button, and never while somebody is typing.
  const screen4 = code('src/components/dune/DuneMatchScreen.tsx')
  check('P toggles the pause',
    screen4.includes("if (e.key !== 'p' && e.key !== 'P') return"), true)
  check('...and stands down for anything that takes text',
    [screen4.includes('el.isContentEditable'),
      screen4.includes("['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)"),
      screen4.includes('e.isComposing')],
    [true, true, true])
  check('...and lives in the menu rather than on the board',
    [screen4.includes('data-layer="pause-toggle"'),
      screen4.includes('role="menuitem"')],
    [true, true])
  // AND THE AUCTION PUSH STANDS DOWN TOO: its clock has not moved, so an
  // expired-looking window is only expired because the shift has not run yet.
  check('a paused match pushes no auction',
    screen4.includes('expired: expired && !paused'), true)
}

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
