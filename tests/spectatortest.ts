// A battle fought on one machine must be watchable from every other one.
//
// The report is built from the live match_actions broadcast (action + effects)
// against whatever board the spectator currently holds — which may or may not
// already include the battle's outcome, since the state UPDATE and the action
// INSERT race each other onto the socket. These asserts pin the rules:
// dice ride the action, names survive the race, walking into empty land shows
// nothing, and an auto-resolved slog becomes a summary instead of a dozen
// sequential animations.
import { buildSpectatorReport, spectatorDisplayMs, SPECTATE_ANIMATE_MAX_ROUNDS } from '@/lib/spectatorCombat'
import { clampCombatResolution, type Action, type Effect } from '@/lib/gameReducer'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

// Typed from the parameter it feeds rather than cast to `never`, which is what
// it used to be: never satisfies every parameter and can be spread into
// nothing, so the later "board already shows the capture" case could not
// build its variant board.
const state = {
  players: [
    { id: 'p1', name: 'Ryan' },
    { id: 'p2', name: 'Chris' },
  ],
  territories: {
    src: { id: 'src', name: 'Alaska', occupyingPlayerId: 'p1', troops: 8 },
    tgt: { id: 'tgt', name: 'Kamchatka', occupyingPlayerId: 'p2', troops: 3 },
  },
} as unknown as Parameters<typeof buildSpectatorReport>[2]

const round = (a: number[], d: number[], aLoss = 0, dLoss = 1) => ({ atkDice: a, defDice: d, aLoss, dLoss })

const resolve = (over: object = {}): Action => ({
  type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
  totalAtkLoss: 1, totalDefLoss: 3, captured: true, troopsToAdvance: 2,
  entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  rounds: [round([6, 5, 2], [4, 3]), round([3, 1], [6, 2], 1, 1)],
  ...over,
} as Action)

const capturedEffect: Effect = {
  kind: 'territory-captured', territoryId: 'tgt',
  fromPlayerId: 'p2', byPlayerId: 'p1', firstCaptureThisTurn: true,
}

console.log('\n— a remote battle becomes a watchable report —')
{
  const r = buildSpectatorReport(resolve(), [capturedEffect], state)!
  check('a report is built', !!r)
  check('the attacker is named', r.attackerName === 'Ryan')
  check('the defender is named', r.defenderName === 'Chris')
  check('the territories are named', [r.srcName, r.tgtName].join('→') === 'Alaska→Kamchatka')
  check('the dice ride along, in order',
    JSON.stringify(r.rounds[0].atkDice) === '[6,5,2]' && JSON.stringify(r.rounds[1].defDice) === '[6,2]')
  check('the outcome rides along', r.captured === true && r.troopsToAdvance === 2)
  check('two rounds animate rather than summarize', r.summary === false)
}

console.log('\n— the race: the board may already show the capture —')
{
  // The state row can land before the action does. tgt now belongs to the
  // ATTACKER — the pre-battle defender is only knowable from the effect.
  const applied = {
    ...state,
    territories: {
      src: { id: 'src', name: 'Alaska', occupyingPlayerId: 'p1', troops: 5 },
      tgt: { id: 'tgt', name: 'Kamchatka', occupyingPlayerId: 'p1', troops: 2 },
    },
  } as never
  const r = buildSpectatorReport(resolve(), [capturedEffect], applied)!
  check('the defender name survives the race', r.defenderName === 'Chris', String(r.defenderName))
  check('the attacker is still right', r.attackerName === 'Ryan')
}

console.log('\n— nothing to watch —')
{
  check('an uncontested walk into empty land shows nothing',
    buildSpectatorReport(resolve({ uncontested: true }), [], state) === null)
  check('a non-combat action shows nothing',
    buildSpectatorReport({ type: 'END_TURN', endTerritories: {} } as Action, [], state) === null)
  check('a battle over territories this client has never heard of shows nothing',
    buildSpectatorReport(resolve({ srcId: 'nope' }), [], state) === null)
}

console.log('\n— auto-resolve becomes a summary, not a dice marathon —')
{
  const many = Array.from({ length: SPECTATE_ANIMATE_MAX_ROUNDS + 3 }, () => round([6, 6], [1]))
  const r = buildSpectatorReport(resolve({ rounds: many }), [capturedEffect], state)!
  check('too many rounds flips to summary', r.summary === true)
  check('the totals still tell the story', r.totalAtkLoss === 1 && r.totalDefLoss === 3)

  const bare = buildSpectatorReport(resolve({ rounds: undefined }), [capturedEffect], state)!
  check('an action without dice still reports — as a summary', bare.summary === true)

  check('a summary shows long enough to read', spectatorDisplayMs(r) >= 4000)
  const two = buildSpectatorReport(resolve(), [capturedEffect], state)!
  check('an animated report holds the stage per round',
    spectatorDisplayMs(two) > 2_500, String(spectatorDisplayMs(two)))
}

console.log('\n— the round log is bounded before it ever reaches the audience —')
{
  // clampCombatResolution runs on the server: whatever JSON arrives, at most
  // 40 rounds of at most 3 dice each leave, every die 1–6.
  const board = { territories: { src: { troops: 10 }, tgt: { troops: 3 } } } as never
  const junk = clampCombatResolution(board, {
    srcId: 'src', tgtId: 'tgt', totalAtkLoss: 0, totalDefLoss: 3, captured: true, troopsToAdvance: 2,
    rounds: [
      { atkDice: [99, -5, 3, 3, 3, 3], defDice: [2, 'six'], aLoss: NaN, dLoss: 1 },
      { atkDice: 'not dice', defDice: [1] },
      null,
      ...Array.from({ length: 60 }, () => ({ atkDice: [1], defDice: [1], aLoss: 0, dLoss: 0 })),
    ],
  } as never)
  const rounds = (junk as { rounds?: Array<{ atkDice: number[]; defDice: number[]; aLoss: number }> }).rounds!
  check('garbage dice clamp into 1–6 and at most 3 per side',
    JSON.stringify(rounds[0].atkDice) === '[6,1,3]', JSON.stringify(rounds[0].atkDice))
  check("a 'six' is a 1, not a crash", JSON.stringify(rounds[0].defDice) === '[2,1]')
  check('NaN losses collapse to 0', rounds[0].aLoss === 0)
  check('rounds without dice are dropped entirely', rounds.every(r => r.atkDice.length > 0 && r.defDice.length > 0))
  check('the log is capped at 40 rounds', rounds.length <= 40, String(rounds.length))

  const walk = clampCombatResolution({ territories: { src: { troops: 10 }, tgt: { troops: 0 } } } as never, {
    srcId: 'src', tgtId: 'tgt', totalAtkLoss: 0, totalDefLoss: 0, captured: true, troopsToAdvance: 2,
    uncontested: true, rounds: [round([6], [6])],
  } as never)
  check('an uncontested move sheds any round log — no dice were rolled',
    (walk as { rounds?: unknown }).rounds === undefined)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
