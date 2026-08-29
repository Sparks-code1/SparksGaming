// Battles: hidden plans, one reveal, and a resolution in spice and tanks.
//
// WHY THIS EXISTS. Combat is where every other phase's work gets spent —
// shipped forces, bought cards, dealt traitors — and each rule below is a
// place a battle could be quietly wrong: a battle across the storm that the
// rules forbid, a leader fighting in two territories at once, a weapon
// killing through its matching defence, a traitor who somehow still pays the
// side that was betrayed. The resolution is checked as behaviour on the same
// functions the server bundles; the server slice is pinned beneath.
import { readFileSync } from 'node:fs'
import {
  pendingBattles, battlesFor, nextAggressor, forcesInBattle, judgePlan,
  resolveBattle, battleLosses, CHEAP_HERO_ID,
  BATTLE_PICK_SECONDS, BATTLE_PLAN_SECONDS, BATTLE_TRAITOR_SECONDS,
} from '@/lib/dune/battle'
import type { BattlePlan } from '@/lib/dune/battle'
import { factionById } from '@/data/dune/factions'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { BattlePanel } from '@/components/dune/BattlePanel'
import type { Force, SectorId } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const f = (faction: string, territoryId: string, sector: string, count = 5,
  over: Partial<Force> = {}): Force =>
  ({ faction, territoryId, sector, count, ...over } as Force)

const CALM: SectorId = 'sector-12'

// Leader names and strengths come off the sheets, never hardcoded twice.
const A = factionById('atreides')!.leaders   // Lady Jessica 5 ... Dr. Yueh 1
const H = factionById('harkonnen')!.leaders  // Feyd-Rautha 6 ... Umman Kudu 1
const JESSICA = A[0].name
const FEYD = H[0].name
const KUDU = H[4].name

// ── where battles are ─────────────────────────────────────────────────────
{
  const board = [
    f('atreides', 'territory-13', 'sector-10', 4),
    f('harkonnen', 'territory-13', 'sector-10', 3),
    f('emperor', 'territory-22', 'sector-15', 2),
  ]
  const found = pendingBattles(board, CALM)
  check('two factions in one territory is a battle',
    found.map(b => [b.territoryId, b.factions]),
    [['territory-13', ['atreides', 'harkonnen']]])
  check('a faction alone fights nobody',
    battlesFor(found, 'emperor'), [])

  // THE POLAR SINK IS SANCTUARY, by name.
  check('the Polar Sink holds no battles',
    pendingBattles([
      f('atreides', 'territory-03', 'sector-1'),
      f('harkonnen', 'territory-03', 'sector-1'),
    ], CALM), [])

  // THE STORM SPLITS A TERRITORY into pieces that cannot reach each other.
  const split = [
    f('atreides', 'territory-01', 'sector-5', 3),
    f('harkonnen', 'territory-01', 'sector-9', 3),
  ]
  check('forces parted by the storm do not fight',
    pendingBattles(split, 'sector-7'), [])
  check('...and fight when it moves on',
    pendingBattles(split, CALM).map(b => b.factions), [['atreides', 'harkonnen']])
  check('...or when both stand on the same side of it',
    pendingBattles([
      f('atreides', 'territory-01', 'sector-8', 3),
      f('harkonnen', 'territory-01', 'sector-9', 3),
    ], 'sector-6').map(b => b.sectors), [['sector-7', 'sector-8', 'sector-9']])

  // With three in one place the aggressor picks whom to fight; the pending
  // battle just names everybody standing there.
  check('three factions stand as one pending battle',
    pendingBattles([
      f('atreides', 'territory-13', 'sector-10'),
      f('harkonnen', 'territory-13', 'sector-10'),
      f('emperor', 'territory-13', 'sector-10'),
    ], CALM).map(b => b.factions),
    [['atreides', 'emperor', 'harkonnen']])
}

// ── the rotation ──────────────────────────────────────────────────────────
{
  const order: FactionId[] = ['fremen', 'atreides', 'harkonnen']
  const board = [
    f('atreides', 'territory-13', 'sector-10'),
    f('harkonnen', 'territory-13', 'sector-10'),
  ]
  const pending = pendingBattles(board, CALM)
  check('the first seat in storm order with a battle is aggressor',
    nextAggressor(order, pending, 0), { at: 1, faction: 'atreides' })
  check('...the walk continues from where it stood',
    nextAggressor(order, pending, 2), { at: 2, faction: 'harkonnen' })
  check('...and a fought-out phase has no aggressor',
    nextAggressor(order, [], 0), null)
}

// ── the plan, judged ──────────────────────────────────────────────────────
{
  const battle = { territoryId: 'territory-13', sectors: ['sector-10'] }
  const board = [
    f('atreides', 'territory-13', 'sector-10', 4),
    f('harkonnen', 'territory-13', 'sector-10', 3),
  ]
  const judge = (plan: BattlePlan, over: Record<string, unknown> = {}) => judgePlan({
    faction: 'atreides', battle, forces: board,
    hand: ['crysknife', 'shield', CHEAP_HERO_ID],
    deadLeaders: [], usedLeaders: {}, plan, ...over,
  } as never)

  check('a lawful plan stands',
    judge({ dial: 4, leader: JESSICA, weapon: 'crysknife', defence: 'shield' }), { ok: true })
  check('the dial cannot exceed the forces standing there',
    (judge({ dial: 5 }) as { refusal: string }).refusal, 'dial-out-of-range')
  check('...nor go below zero',
    (judge({ dial: -1 }) as { refusal: string }).refusal, 'dial-out-of-range')
  check('a seat not in the battle has no plan to make',
    (judgePlan({
      faction: 'emperor', battle, forces: board, hand: [],
      deadLeaders: [], usedLeaders: {}, plan: { dial: 0 },
    } as never) as { refusal: string }).refusal, 'not-in-this-battle')
  check('a dead leader cannot be committed',
    (judge({ dial: 0, leader: JESSICA }, { deadLeaders: [JESSICA] }) as { refusal: string }).refusal,
    'leader-in-the-tanks')
  check('a leader already fighting elsewhere stays there',
    (judge({ dial: 0, leader: JESSICA },
      { usedLeaders: { [JESSICA]: 'territory-26' } }) as { refusal: string }).refusal,
    'leader-fights-elsewhere')
  check('...but may fight again where it stands',
    judge({ dial: 0, leader: JESSICA }, { usedLeaders: { [JESSICA]: 'territory-13' } }),
    { ok: true })
  check('another faction\'s leader is no leader of yours',
    (judge({ dial: 0, leader: FEYD }) as { refusal: string }).refusal, 'no-such-leader')
  check('leader and hero cannot both lead',
    (judge({ dial: 0, leader: JESSICA, cheapHero: true }) as { refusal: string }).refusal,
    'two-leaders')
  check('the Cheap Hero must be held to be played',
    (judge({ dial: 0, cheapHero: true }, { hand: [] }) as { refusal: string }).refusal,
    'card-not-held')
  check('no leader and no hero means no cards at all',
    (judge({ dial: 2, weapon: 'crysknife' }) as { refusal: string }).refusal,
    'no-leader-no-cards')
  check('a defence is not a weapon',
    (judge({ dial: 0, leader: JESSICA, weapon: 'shield' }) as { refusal: string }).refusal,
    'not-a-weapon')
  check('a weapon is not a defence',
    (judge({ dial: 0, leader: JESSICA, defence: 'crysknife' }) as { refusal: string }).refusal,
    'not-a-defence')
  check('a card unheld cannot be played',
    (judge({ dial: 0, leader: JESSICA, weapon: 'lasgun' }) as { refusal: string }).refusal,
    'card-not-held')
}

// ── the resolution ────────────────────────────────────────────────────────
const side = (faction: FactionId, plan: BattlePlan, calledTraitor = false) => {
  return { faction, plan, calledTraitor }
}
{
  // Highest dial plus leader wins; the loser loses everything, the winner
  // the dial; nobody died, so nobody is paid.
  const plain = resolveBattle({
    aggressor: side('atreides', { dial: 3, leader: JESSICA }),   // 3 + 5 = 8
    defender: side('harkonnen', { dial: 4, leader: KUDU }),      // 4 + 1 = 5
  })
  check('highest dial plus leader wins', plain.winner, 'atreides')
  check('...the loser loses every force there',
    plain.sides[1], {
      faction: 'harkonnen', losesAll: true, losses: 0, leaderDies: false,
      discards: [], spice: [],
    })
  check('...the winner pays the dial and keeps the field',
    [plain.sides[0].losesAll, plain.sides[0].losses], [false, 3])
  check('...and a bloodless battle pays nobody',
    plain.sides.flatMap(s => s.spice), [])

  // Ties to the aggressor.
  check('a tie is the aggressor\'s',
    resolveBattle({
      aggressor: side('atreides', { dial: 2, leader: A[3].name }),  // 2 + 2
      defender: side('harkonnen', { dial: 3, leader: KUDU }),       // 3 + 1
    }).winner, 'atreides')

  // A weapon kills through nothing; the matching defence stops it; the dead
  // leader counts nothing and pays the winner.
  const stabbed = resolveBattle({
    aggressor: side('atreides', { dial: 1, leader: JESSICA, weapon: 'crysknife' }), // 1+5
    defender: side('harkonnen', { dial: 2, leader: FEYD }),                          // 2+0, dead
  })
  check('an unguarded leader dies to the weapon',
    [stabbed.winner, stabbed.sides[1].leaderDies], ['atreides', true])
  check('...counts nothing toward the total', stabbed.sides[1].losses, 0)
  check('...and pays the winner its strength',
    stabbed.sides[0].spice, [{ amount: 6, for: FEYD }])
  check('the matching defence holds the blade',
    resolveBattle({
      aggressor: side('atreides', { dial: 1, leader: JESSICA, weapon: 'crysknife' }), // 1+5
      defender: side('harkonnen', { dial: 2, leader: FEYD, defence: 'shield' }),      // 2+6
    }).winner, 'harkonnen')
  check('...but the wrong one does not',
    resolveBattle({
      aggressor: side('atreides', { dial: 1, leader: JESSICA, weapon: 'chaumas' }),   // poison
      defender: side('harkonnen', { dial: 2, leader: FEYD, defence: 'shield' }),      // projectile
    }).sides[1].leaderDies, true)

  // Both can die — and the winner is paid for their OWN dead leader too.
  const mutual = resolveBattle({
    aggressor: side('atreides', { dial: 4, leader: JESSICA, weapon: 'crysknife' }),
    defender: side('harkonnen', { dial: 1, leader: FEYD, weapon: 'chaumas' }),
  })
  check('both leaders can die', mutual.sides.map(s => s.leaderDies), [true, true])
  check('...the totals fall to the dials', mutual.winner, 'atreides')
  check('...and the winner collects for both bodies',
    mutual.sides[0].spice.map(s => s.amount).sort(), [5, 6])

  // The Cheap Hero fights at nothing, dies for free, and is always spent.
  const heroic = resolveBattle({
    aggressor: side('atreides', { dial: 3, cheapHero: true, weapon: 'crysknife' }),
    defender: side('harkonnen', { dial: 1, leader: KUDU }),
  })
  check('a Cheap Hero leads at strength zero', heroic.winner, 'atreides')
  check('...and is spent by being played',
    heroic.sides[0].discards, [CHEAP_HERO_ID])
  check('...never dying into the tanks',
    resolveBattle({
      aggressor: side('atreides', { dial: 0, cheapHero: true }),
      defender: side('harkonnen', { dial: 1, leader: KUDU, weapon: 'chaumas' }),
    }).sides[0].leaderDies, false)

  // ── the lasgun and the shield ───────────────────────────────────────────
  const boom = resolveBattle({
    aggressor: side('atreides', { dial: 1, leader: JESSICA, weapon: 'lasgun' }),
    defender: side('harkonnen', { dial: 4, leader: FEYD, defence: 'shield' }),
  })
  check('lasgun and shield is nobody\'s victory', boom.winner, null)
  check('...an explosion', boom.explosion, true)
  check('...that kills everything on both sides',
    boom.sides.map(s => [s.losesAll, s.leaderDies]), [[true, true], [true, true]])
  check('...pays nobody', boom.sides.flatMap(s => s.spice), [])
  check('...and burns the spice lying there', boom.clearSpice, true)

  // ── traitors ────────────────────────────────────────────────────────────
  // The caller DIALLED TWO — a zero dial here would let "loses nothing"
  // pass on a resolution that quietly charged the dial, because zero lost
  // and nothing lost look identical.
  const betrayed = resolveBattle({
    aggressor: side('atreides', { dial: 2, leader: JESSICA }, true),
    defender: side('harkonnen', { dial: 3, leader: FEYD, weapon: 'crysknife' }),
  })
  check('a revealed traitor wins outright', betrayed.winner, 'atreides')
  check('...losing nothing, not even the dial',
    [betrayed.sides[0].losesAll, betrayed.sides[0].losses, betrayed.sides[0].leaderDies],
    [false, 0, false])
  check('...the betrayed side loses everything',
    [betrayed.sides[1].losesAll, betrayed.sides[1].leaderDies], [true, true])
  check('...their cards with it', betrayed.sides[1].discards, ['crysknife'])
  check('...and the traitor\'s strength is paid',
    betrayed.sides[0].spice, [{ amount: 6, for: `the traitor ${FEYD}` }])
  check('...through any explosion',
    resolveBattle({
      aggressor: side('atreides', { dial: 0, leader: JESSICA, defence: 'shield' }, true),
      defender: side('harkonnen', { dial: 3, leader: FEYD, weapon: 'lasgun' }),
    }).winner, 'atreides')

  const bothCalled = resolveBattle({
    aggressor: side('atreides', { dial: 2, leader: JESSICA }, true),
    defender: side('harkonnen', { dial: 3, leader: FEYD }, true),
  })
  check('both traitors is mutual destruction', bothCalled.winner, null)
  check('...both sides lose forces and leaders',
    bothCalled.sides.map(s => [s.losesAll, s.leaderDies]), [[true, true], [true, true]])
  check('...and neither is paid', bothCalled.sides.flatMap(s => s.spice), [])
}

// ── what leaves the board ─────────────────────────────────────────────────
{
  const board = [
    f('atreides', 'territory-01', 'sector-8', 3, { starred: 1 }),
    f('atreides', 'territory-01', 'sector-9', 2),
  ]
  check('a loser\'s losses are everything in the slice',
    battleLosses(board, 'atreides', 'territory-01', ['sector-8', 'sector-9'],
      { losesAll: true, losses: 0 }),
    [{ sector: 'sector-8', count: 3, starred: 1 }, { sector: 'sector-9', count: 2, starred: 0 }])
  check('a winner\'s dial comes off plain-first, in sector order',
    battleLosses(board, 'atreides', 'territory-01', ['sector-8', 'sector-9'],
      { losesAll: false, losses: 4 }),
    [{ sector: 'sector-8', count: 2, starred: 0 }, { sector: 'sector-9', count: 2, starred: 0 }])
  check('...reaching the elites only when the plain are spent',
    battleLosses(board, 'atreides', 'territory-01', ['sector-8', 'sector-9'],
      { losesAll: false, losses: 5 }),
    [{ sector: 'sector-8', count: 3, starred: 1 }, { sector: 'sector-9', count: 2, starred: 0 }])
  check('forces in the slice are counted for the dial cap',
    forcesInBattle(board, 'atreides', 'territory-01', ['sector-8', 'sector-9']), 5)
}

// ── the deadlines are real numbers ────────────────────────────────────────
check('the three windows have their seconds',
  [BATTLE_PICK_SECONDS, BATTLE_PLAN_SECONDS, BATTLE_TRAITOR_SECONDS], [60, 120, 30])

// ── the server slice ──────────────────────────────────────────────────────
// The rules above ride the shared bundle; what the endpoint owns is pinned:
// the hidden plan's row, the simultaneous publish, the beat that always
// opens, and the one write that settles everything.
{
  const fn = code('supabase/functions/dune-action/index.ts')
  // 'Spice Collection' sits EARLIER in the switch, so the slice ends at the
  // default arm that follows the Battles entry instead.
  const bStart = fn.indexOf("case 'Battles': {")
  const advCase = fn.slice(bStart, fn.indexOf('default:', bStart))
  check('the phase entry derives the battles from the board',
    /const pending = pendingBattles\(/.test(advCase), true)
  check('...and passes straight through when there are none',
    /if \(!first\) return await plainly\(\)/.test(advCase), true)

  const pick = fn.slice(fn.indexOf("case 'BATTLE_PICK'"), fn.indexOf("case 'BATTLE_PLAN'"))
  check('the aggressor picks, until the clock frees anyone',
    /if \(!expired && myFaction !== aggressor\)/.test(pick), true)
  check('...and an expired pick is the deterministic first',
    /expired \? theirs\[0\]\.territoryId/.test(pick), true)

  const plan = fn.slice(fn.indexOf("case 'BATTLE_PLAN'"), fn.indexOf("case 'BATTLE_TRAITOR'"))
  check('a plan is judged by the shared law', /judgePlan\(\{/.test(plan), true)
  check('...and lives in the committing seat\'s own row',
    /secretsPatch\[playerId\] = \{ \.\.\.mine, battlePlan: \{ territoryId: c\.territoryId, \.\.\.plan \} \}/.test(plan), true)
  check('...revealed together only when both are in',
    /const allIn = combatants\.every\(\(f\) => !!plans\[f\]\)/.test(plan), true)
  check('...with silence dialling zero past the deadline',
    /\} else if \(expired\) \{\s*[\r\n]+\s*plans\[f\] = \{ dial: 0 \}/.test(plan), true)

  const beat = fn.slice(fn.indexOf("case 'BATTLE_TRAITOR'"), fn.indexOf("case 'SEED_SPICE'"))
  check('a false traitor call is refused privately',
    /return json\(\{ error: 'that call is not yours to make', code: 'no-traitor' \}, 409\)/.test(beat), true)
  check('the resolution rides the shared law', /resolveBattle\(\{/.test(beat), true)
  check('...banks the dead', /bankDead\(tanks, killed/.test(beat), true)
  check('...remembers a revived leader falls face down',
    /wasRevived: revived\.includes\(plan\.leader\)/.test(beat), true)
  check('...pays the winner from the bank alone',
    /moves\.push\(\{ from: BANK, to: seatId, amount: s\.amount, reason: 'battle' \}\)/.test(beat), true)
  check('...spends a called traitor card',
    /\(row\.traitors \?\? \[\]\)\.filter\(\(n\) => n !== theirLeader\)/.test(beat), true)
  check('...and the explosion burns the territory\'s spice',
    /if \(outcome\.clearSpice\) delete spiceOnBoard\[c\.territoryId\]/.test(beat), true)
  check('the fought-out phase clears itself',
    /: undefined[\s\S]{0,700}battles: battlesAfter \} : \{ battles: undefined \}/.test(beat), true)

  check('a revived leader is remembered for good',
    /revivedLeaders: \[\.\.\.new Set\(\[/.test(fn), true)

  const hold = code('src/lib/dune/phaseAdvance.ts')
  check('battles hold the phase while they stand',
    /code: 'battles-underway',/.test(hold), true)
}

// ── the panel ─────────────────────────────────────────────────────────────
{
  const battles = {
    turn: 3, order: ['atreides', 'harkonnen'] as FactionId[], at: 0,
    current: null, fought: [], usedLeaders: {}, closesAt: 9_999_999_999_999,
  }
  const board = [
    f('atreides', 'territory-13', 'sector-10', 4),
    f('harkonnen', 'territory-13', 'sector-10', 3),
  ]
  const draw = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(BattlePanel, {
      battles, forces: board, storm: CALM, tanks: null, seat: 'atreides' as FactionId,
      hand: ['crysknife', 'shield', CHEAP_HERO_ID], traitors: [FEYD], now: 1,
      busy: false, onPick: () => {}, onPlan: () => {}, onAnswer: () => {},
      ...over,
    } as never))

  const picking = draw()
  check('the aggressor is offered their battles',
    picking.includes(`data-pick="territory-13|harkonnen"`), true)
  check('...and nobody else is',
    draw({ seat: 'harkonnen' }).includes('data-pick='), false)

  const current = {
    territoryId: 'territory-13', sectors: ['sector-10'],
    aggressor: 'atreides', defender: 'harkonnen',
    committed: [], closesAt: 9_999_999_999_999,
  }
  const planning = draw({ battles: { ...battles, current } })
  check('a combatant gets the plan form',
    [/id="battle-dial"/.test(planning), /data-plan-commit/.test(planning)], [true, true])
  check('...their leaders priced on the buttons',
    planning.includes(`data-plan-leader="${JESSICA}"`), true)
  check('...the hand filtered to weapons and defences',
    [planning.includes('data-plan-weapon="crysknife"'),
      planning.includes('data-plan-defence="shield"'),
      planning.includes('data-plan-weapon="shield"')], [true, true, false])
  check('...and the Cheap Hero offered when held',
    /data-plan-hero/.test(planning), true)
  check('a committed seat waits without a form',
    /data-plan-commit/.test(draw({
      battles: { ...battles, current: { ...current, committed: ['atreides'] } },
    })), false)

  const revealed = {
    ...current, committed: ['atreides', 'harkonnen'],
    revealed: {
      plans: {
        atreides: { dial: 2, leader: JESSICA },
        harkonnen: { dial: 3, leader: FEYD, weapon: 'crysknife' },
      },
      traitor: { answered: [], calls: [], closesAt: 9_999_999_999_999 },
    },
  }
  const beat = draw({ battles: { ...battles, current: revealed } })
  check('the reveal shows both plans to everyone',
    [/data-revealed-plan="atreides"/.test(beat), /data-revealed-plan="harkonnen"/.test(beat)],
    [true, true])
  check('the traitor call lights only for a holder of the name',
    /data-call-traitor/.test(beat), true)
  check('...and stays dark for everyone else',
    /data-call-traitor/.test(draw({
      battles: { ...battles, current: revealed }, traitors: [],
    })), false)
  check('...while continue is always offered',
    /data-no-traitor/.test(draw({
      battles: { ...battles, current: revealed }, traitors: [],
    })), true)

  // the game screen carries the panel, and every driver feeds it
  const game = code('src/components/dune/DuneGameScreen.tsx')
  check('the game screen raises the panel at the phase',
    /state\.phase === 'Battles' && state\.battles && seat/.test(game), true)
  const match = code('src/components/dune/DuneMatchScreen.tsx')
  check('the match screen posts the three battle moves',
    [/BATTLE_PICK/.test(match), /BATTLE_PLAN/.test(match), /BATTLE_TRAITOR/.test(match)],
    [true, true, true])
  const harness = code('src/components/dune/DuneMultiSeatView.tsx')
  check('...and so does the harness, as the selected seat',
    [/BATTLE_PICK/.test(harness), /BATTLE_PLAN/.test(harness), /BATTLE_TRAITOR/.test(harness)],
    [true, true, true])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
