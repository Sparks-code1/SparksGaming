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
  resolveBattle, battleLosses, explosionLosses, CHEAP_HERO_ID,
  BATTLE_PICK_SECONDS, BATTLE_PLAN_SECONDS, BATTLE_TRAITOR_SECONDS,
  BATTLE_VOICE_SECONDS, BATTLE_PRESCIENCE_SECONDS, BATTLE_ALLOCATE_SECONDS,
  planPlaysTarget, canComplyWithVoice, voiceViolation, judgeVoiceCommand,
  prescienceAnswer,
  piecesInBattle, eliteWorth, fullWithoutSpice, battleStrengthCap,
  allocationsFor, judgeAllocation, firstAllocation, allocationLosses,
  BATTLE_CAPTURE_SECONDS, capturePool, leaderOwner, allOwnLeadersDead,
  KWISATZ_HADERACH, KWISATZ_STRENGTH, kwisatzHaderachAvailable,
  allyInterrogator,
} from '@/lib/dune/battle'
import { reviveLeader, returnLeaderToTanks } from '@/lib/dune/revival'
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
      discards: [], spice: [], spends: 0, kwisatzDies: false,
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
  // THE EXPLOSION TAKES THE TERRITORY: the card reads "all forces,
  // leaders, and spice in this battle's territory" — so a bystander faction
  // standing in another sector of it burns with the combatants, and a force
  // one territory over does not.
  check('the explosion harvests every force in the territory',
    explosionLosses([
      f('atreides', 'territory-01', 'sector-8', 3),
      f('harkonnen', 'territory-01', 'sector-9', 2),
      f('emperor', 'territory-01', 'sector-6', 4, { starred: 1 }),
      f('fremen', 'territory-22', 'sector-15', 5),
    ], 'territory-01'),
    [
      { faction: 'atreides', sector: 'sector-8', count: 3, starred: 0 },
      { faction: 'emperor', sector: 'sector-6', count: 4, starred: 1 },
      { faction: 'harkonnen', sector: 'sector-9', count: 2, starred: 0 },
    ])

  check('...reaching the elites only when the plain are spent',
    battleLosses(board, 'atreides', 'territory-01', ['sector-8', 'sector-9'],
      { losesAll: false, losses: 5 }),
    [{ sector: 'sector-8', count: 3, starred: 1 }, { sector: 'sector-9', count: 2, starred: 0 }])
  check('forces in the slice are counted for the dial cap',
    forcesInBattle(board, 'atreides', 'territory-01', ['sector-8', 'sector-9']), 5)
}

// ── the deadlines are real numbers ────────────────────────────────────────
// FIVE MINUTES A BATTLE: the plan is the game's deepest decision. Each
// pick stamps its own fresh window, so an aggressor with three battles gets
// five minutes at each wheel — pinned on the server slice below.
check('the three windows have their seconds',
  [BATTLE_PICK_SECONDS, BATTLE_PLAN_SECONDS, BATTLE_TRAITOR_SECONDS], [120, 300, 60])

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
  check('...and every battle stamps its own fresh five minutes',
    /closesAt: now \+ BATTLE_PLAN_SECONDS \* 1000/.test(pick), true)
  check('...and an expired pick is the deterministic first',
    /expired \? theirs\[0\]\.territoryId/.test(pick), true)

  const plan = fn.slice(fn.indexOf("case 'BATTLE_PLAN'"), fn.indexOf("case 'BATTLE_TRAITOR'"))
  check('a plan is judged by the shared law', /judgePlan\(\{/.test(plan), true)
  check('...and answers ONE battle, by name',
    /if \(action\.territoryId && String\(action\.territoryId\) !== c\.territoryId\)/.test(plan)
      && /code: 'battle-moved-on',/.test(plan), true)
  check('...and lives in the committing seat\'s own row',
    /secretsPatch\[playerId\] = \{ \.\.\.mine, battlePlan: \{ territoryId: c\.territoryId, \.\.\.plan \} \}/.test(plan), true)
  check('...revealed together only when both are in',
    /const allIn = combatants\.every\(\(f\) => !!plans\[f\]\)/.test(plan), true)
  check('...with silence dialling zero past the deadline',
    /\} else if \(expired\) \{\s*[\r\n]+\s*plans\[f\] = \{ dial: 0 \}/.test(plan), true)

  const beat = fn.slice(fn.indexOf("case 'BATTLE_TRAITOR'"), fn.indexOf("case 'SEED_SPICE'"))
    + fn.slice(fn.indexOf('const settleBattle'), fn.indexOf('switch (action.type)'))
  check('a false traitor call is refused privately',
    /return json\(\{ error: 'that call is not yours to make', code: 'no-traitor' \}, 409\)/.test(beat), true)
  check('the resolution rides the shared law', /resolveBattle\(\{/.test(beat), true)
  check('...banks the dead', /bankDead\(tanks, killed/.test(beat), true)
  check('...remembers a revived leader falls face down',
    /wasRevived: revived\.includes\(plan\.leader\)/.test(beat), true)
  check('...pays the winner from the bank alone — or the proxy caller',
    /moves\.push\(\{ from: BANK, to, amount: s\.amount, reason: 'battle' \}\)/.test(beat)
      && /\? seatOfFaction\['harkonnen'\] : seatId/.test(beat), true)
  check('...spends a called traitor card',
    /\(row\.traitors \?\? \[\]\)\.filter\(\(n\) => n !== theirLeader\)/.test(beat), true)
  check('...and the explosion burns the territory\'s spice',
    /if \(outcome\.clearSpice\) delete spiceOnBoard\[c\.territoryId\]/.test(beat), true)
  check('...harvesting the whole territory, bystanders included',
    /if \(outcome\.explosion\) \{\s*[\r\n]+\s*for \(const lift of explosionLosses\(forces as never, c\.territoryId\)\)/.test(beat), true)
  check('...and never lifting the sides twice',
    /const lifts = outcome\.explosion \? \[\]/.test(beat), true)
  check('the fought-out phase clears itself',
    /: undefined[\s\S]{0,900}battles: battlesOut \} : \{ battles: undefined \}/.test(beat), true)

  check('...and the resolution moves the public count with the hand',
    /handCounts\[f\] = hand\.length/.test(beat)
      && /handCount: handCounts\[p\.faction\]/.test(beat), true)

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
  // THE WHEEL, not a number field: numbers round the rim as far as the
  // forces standing there, a pointer, and a hub waiting for a face.
  check('a combatant gets the wheel',
    [/data-layer="battle-wheel"/.test(planning), /data-plan-commit/.test(planning)], [true, true])
  check('...its numbers running only as far as the forces there',
    (planning.match(/data-dial-number="/g) ?? []).length, 5)
  check('...the hub empty until a disc is placed',
    /data-wheel-leader=""/.test(planning), true)
  // THE DISC CARRIES THE FACE. The leader row is LeaderDisc art, and the
  // chosen one renders INTO the hub — pinned in source because placing it
  // is a click away from a static render.
  check('...their leaders offered as discs',
    planning.includes(`data-plan-leader="${JESSICA}"`)
      && /data-leader-disc/.test(planning) === false
      ? planning.includes('leader-clip-') || /data-face/.test(planning)
      : false, true)
  check('...and the chosen disc slots into the hub',
    /\{leader \? \(\s*[\r\n]+\s*<LeaderDisc leader=\{leader\} faction=\{faction\} r=\{52\} \/>/.test(
      readFileSync('src/components/dune/BattlePanel.tsx', 'utf8')), true)
  // THE CARDS ARE CARDS: rules text on the face, a magnifier to the tray's
  // floating view, and no card offered as a bare name in a list.
  check('...the hand drawn as readable card faces',
    [planning.includes('CRYSKNIFE'), planning.includes('SHIELD'),
      planning.includes('aria-label="Read Crysknife"')], [true, true, true])
  check('...weapons and defences filtered to their rows',
    [planning.includes('data-plan-weapon="crysknife"'),
      planning.includes('data-plan-defence="shield"'),
      planning.includes('data-plan-weapon="shield"')], [true, true, false])
  check('...and the Cheap Hero offered as its card when held',
    /data-plan-hero/.test(planning), true)

  // ── A REFUSAL NAMES ITS REASON ──────────────────────────────────────────
  // "that plan is not legal" on a legal-looking plan was unactionable: the
  // code always named the illegal part, and the panel dropped it. Now every
  // code has its sentence, an unknown code shows itself, and silence means
  // nothing was refused. The plan also posts WHICH battle it answers, so a
  // form drawn against the last battle is refused as battle-moved-on rather
  // than judged against ground it never saw — the exact shape of the live
  // failure: the wheel capped by the OLD territory's bigger stack posted a
  // dial out of range in the new one.
  const refusedDial = draw({
    battles: { ...battles, current }, refusal: 'dial-out-of-range',
  })
  check('a refusal is named in the panel',
    refusedDial.includes('The dial is more than the forces you have standing here.'), true)
  check('...as an alert carrying its code',
    /data-battle-refusal="dial-out-of-range"/.test(refusedDial), true)
  check('...the stale-battle case in its own words',
    draw({ battles: { ...battles, current }, refusal: 'battle-moved-on' })
      .includes('The table has moved to another battle'), true)
  check('...an unknown code shows itself rather than nothing',
    draw({ battles: { ...battles, current }, refusal: 'mystery-code' })
      .includes('Refused: mystery-code'), true)
  // THE REFUSAL NAMES ITS ACTION AND CARRIES ITS CODE. "Every button gives
  // the same refusal" was one frozen alert with no owner: other buttons'
  // failures — and clicks swallowed by busy — left a single code standing
  // over everything.
  check('...and names the action it came from, code attached',
    draw({
      battles: { ...battles, current },
      refusal: 'card-not-held', refusedAction: 'BATTLE_PLAN',
    }).includes('BATTLE_PLAN: ') && draw({
      battles: { ...battles, current },
      refusal: 'card-not-held', refusedAction: 'BATTLE_PLAN',
    }).includes('(card-not-held)'), true)

  // ── A HAND THE TABLE DISOWNS IS NOT OFFERED ─────────────────────────────
  // The public handCount is the row's truth by another route. When this
  // client's hand disagrees, its secrets are stale — every card it offered
  // was a card-not-held waiting, which is exactly how the Fremen came to be
  // "refused on everything". Cards are held back and said so; the dial and
  // leader still commit.
  const stale = draw({ battles: { ...battles, current }, handCount: 1 })
  check('a disagreeing hand is held back, and says so',
    [/data-hand-stale/.test(stale), /data-plan-weapon/.test(stale),
      /data-plan-commit/.test(stale)],
    [true, false, true])
  check('...while an agreeing one offers as before',
    /data-plan-weapon="crysknife"/.test(
      draw({ battles: { ...battles, current }, handCount: 3 })), true)
  check('...and no refusal means no alert',
    /data-battle-refusal/.test(planning), false)

  const panelSrc = readFileSync('src/components/dune/BattlePanel.tsx', 'utf8')
  check('the commit posts the battle it answered',
    /territoryId: c\.territoryId,\s*[\r\n]+\s*dial,/.test(panelSrc), true)
  const gameSrc = readFileSync('src/components/dune/DuneGameScreen.tsx', 'utf8')
  check('the panel starts fresh for every battle',
    /key=\{state\.battles\.current/.test(gameSrc), true)
  // THE BEAT READS THE KEPT TRAITORS. dealtTraitors is the setup-time offer
  // of four, consumed by the keep-one choice — the server validates a call
  // against the KEPT list, and a panel reading the offer never lit.
  check('the beat is fed the kept traitors, not the setup offer',
    /traitors=\{own\?\.traitors \?\? \[\]\}/.test(gameSrc), true)
  const harnessSrc = readFileSync('src/components/dune/DuneMultiSeatView.tsx', 'utf8')
  check('the harness hands the code to the panel',
    /battleRefusal=\{refusedBy\?\.startsWith\('BATTLE'\) && refused/.test(harnessSrc), true)
  check('...and says it in the narration too',
    /refused: \$\{res\.error\?\.message \?\? 'unknown'\} \(\$\{res\.error\?\.code \?\? '\?'\}\)/.test(harnessSrc), true)
  // The refusal's OWNER rides beside its code, the panel gets only battle
  // refusals, a hung wire times out instead of sticking busy forever, and a
  // busy-swallowed click says so instead of doing silent nothing. Both
  // drivers, same discipline.
  check('the harness names the refusing action',
    /setRefused\(res\.error\?\.code \?\? 'refused'\)\s*[\r\n]+\s*setRefusedBy\(type\)/.test(harnessSrc), true)
  check('...races the wire against a watchdog',
    /no answer after 15s/.test(harnessSrc), true)
  check('...and says when a click is swallowed',
    /if \(busy\) \{ say\('still waiting on the last action…'\); return \}/.test(harnessSrc), true)
  const matchScreenSrc = readFileSync('src/components/dune/DuneMatchScreen.tsx', 'utf8')
  check('the match screen holds the same discipline',
    [/setRefusedBy\(action\.type\)/.test(matchScreenSrc),
      /battleRefusal=\{refusedBy\?\.startsWith\('BATTLE'\) && refused/.test(matchScreenSrc),
      /no answer after 15s/.test(matchScreenSrc)],
    [true, true, true])
  const matchSrc = readFileSync('src/components/dune/DuneMatchScreen.tsx', 'utf8')
  check('the match screen hands the code over as well',
    /battleRefusal=\{refusedBy\?\.startsWith\('BATTLE'\) && refused/.test(matchSrc), true)
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
      traitor: { answered: [], calls: [], closesAt: 50_000 },
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

  // ── THE REVEAL LANDS IN STAGES ──────────────────────────────────────────
  // Leaders face up and counted; then weapons; then defences, each pairing
  // resolved — blocked does nothing, unblocked slays and zeroes the count;
  // then the forces committed bring both counts to the judged totals, and
  // only then do the beat's controls light. The clock is the SERVER'S
  // reveal stamp, so a given closesAt IS a stage: with now=1 and a
  // 60-second beat, closesAt 60_000 is the instant of reveal and closesAt
  // 53_001 is seven seconds in.
  const stagePlans = {
    atreides: { dial: 2, leader: JESSICA, weapon: 'crysknife' },
    harkonnen: { dial: 3, leader: FEYD, defence: 'shield' },
  }
  const killPlans = {
    atreides: { dial: 2, leader: JESSICA, weapon: 'crysknife' },
    harkonnen: { dial: 3, leader: FEYD },
  }
  const boomPlans = {
    atreides: { dial: 2, leader: JESSICA, weapon: 'lasgun' },
    harkonnen: { dial: 3, leader: FEYD, defence: 'shield' },
  }
  const atStage = (closesAt: number, plans: Record<string, unknown> = stagePlans) =>
    draw({
      battles: {
        ...battles,
        current: {
          ...current, committed: ['atreides', 'harkonnen'],
          revealed: { plans, traitor: { answered: [], calls: [], closesAt } },
        },
      },
    })

  const s0 = atStage(60_000)
  check('at the reveal the counts are blank and nothing has landed',
    [s0.includes('data-strength-count="atreides">—<'),
      /data-reveal-leader/.test(s0), /data-no-traitor/.test(s0)],
    [true, false, false])
  const s1 = atStage(59_001)
  check('the leaders land first, face up and counted',
    [/data-reveal-leader="atreides"/.test(s1),
      s1.includes('data-strength-count="atreides">5<'),
      s1.includes('data-strength-count="harkonnen">6<'),
      /data-reveal-weapon/.test(s1)],
    [true, true, true, false])
  const s2 = atStage(57_001)
  check('then the weapons, defences still down',
    [/data-reveal-weapon="atreides"/.test(s2), /data-reveal-defence/.test(s2)],
    [true, false])
  check('...drawn as the CARDS they are, faces not names',
    [s2.includes('CRYSKNIFE'),
      atStage(55_001).includes('SHIELD')], [true, true])
  const s3 = atStage(55_001)
  check('then the defences: a blocked weapon does nothing',
    [/data-reveal-defence="harkonnen"/.test(s3), s3.includes('blocked'),
      /data-reveal-slain/.test(s3),
      s3.includes('data-strength-count="atreides">5<'),
      /data-reveal-forces/.test(s3)],
    [true, true, false, true, false])
  const s3kill = atStage(55_001, killPlans)
  check('...and an unblocked one slays the leader and zeroes the count',
    [/data-reveal-slain="harkonnen"/.test(s3kill),
      s3kill.includes(`slays ${FEYD}`),
      s3kill.includes('data-strength-count="harkonnen">0<'),
      s3kill.includes('data-strength-count="atreides">5<')],
    [true, true, true, true])
  check('...lasgun on shield burns the whole board of it',
    [/data-reveal-explosion/.test(atStage(55_001, boomPlans)),
      atStage(55_001, boomPlans).includes('data-strength-count="atreides">0<')],
    [true, true])
  const s4 = atStage(53_001)
  check('last the forces committed bring the judged totals',
    [/data-reveal-forces="atreides"/.test(s4),
      s4.includes('data-strength-count="atreides">7<'),
      s4.includes('data-strength-count="harkonnen">9<'),
      /data-no-traitor/.test(s4)],
    [true, true, true, true])
  check('...totals that remember the slain',
    [atStage(53_001, killPlans).includes('data-strength-count="harkonnen">3<'),
      atStage(53_001, killPlans).includes('data-strength-count="atreides">7<')],
    [true, true])

  const preview = code('src/components/dune/DuneGameScreenPreview.tsx')
  check('the preview can stage a revealed battle, at ?dune-game&battle',
    [/q\.has\('battle'\)/.test(preview),
      /traitor: \{ answered: \[\], calls: \[\], closesAt: battleAt \+ 60_000 \}/.test(preview)],
    [true, true])

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

// ── the Voice and the foresight ───────────────────────────────────────────
// Pass two: the Bene Gesserit command a plan before it is made, and the
// Atreides see one element of a plan after it is. Both are BASIC rules.
// The compliance law is ONE function shared by the server's judge and the
// plan form, so the form can never bless what the judge strikes down.
{
  // what a plan plays
  check('a shield answers to shield, not projectile',
    [planPlaysTarget({ dial: 0, defence: 'shield' }, 'shield'),
      planPlaysTarget({ dial: 0, defence: 'shield' }, 'projectile')], [true, false])
  check('a worthless card in a slot answers to worthless',
    planPlaysTarget({ dial: 0, weapon: 'baliset' }, 'worthless'), true)
  check('the Cheap Hero answers to its own name',
    planPlaysTarget({ dial: 0, cheapHero: true }, 'cheap-hero'), true)

  // when obedience is possible
  check('forbidding can always be obeyed',
    canComplyWithVoice({ mode: 'not-play', target: 'lasgun' }, [], false), true)
  check('a demand binds only a hand that holds the thing',
    [canComplyWithVoice({ mode: 'play', target: 'projectile' }, ['crysknife'], true),
      canComplyWithVoice({ mode: 'play', target: 'projectile' }, ['chaumas'], true)],
    [true, false])
  check('...and only a seat that can field a leader to carry it',
    canComplyWithVoice({ mode: 'play', target: 'projectile' }, ['crysknife'], false), false)
  check('...except the hero demand, which carries itself',
    canComplyWithVoice({ mode: 'play', target: 'cheap-hero' }, [CHEAP_HERO_ID], false), true)

  // the violation — the judge and the form share it
  check('a forbidden play is a violation',
    voiceViolation({ dial: 0, leader: JESSICA, weapon: 'crysknife' },
      { mode: 'not-play', target: 'projectile' }, ['crysknife'], true), 'voice-forbids')
  check('an unmet demand an able hand could meet is one too',
    voiceViolation({ dial: 0, leader: JESSICA },
      { mode: 'play', target: 'projectile' }, ['crysknife'], true), 'voice-demands')
  check('...but beyond compliance the plan is free',
    voiceViolation({ dial: 0 },
      { mode: 'play', target: 'projectile' }, ['chaumas'], true), null)
  check('an obedient plan stands',
    voiceViolation({ dial: 0, leader: JESSICA, weapon: 'crysknife' },
      { mode: 'play', target: 'projectile' }, ['crysknife'], true), null)
  check('a command is the sheet\'s shape and nothing else',
    [judgeVoiceCommand({ mode: 'play', target: 'lasgun' }),
      judgeVoiceCommand({ mode: 'sing', target: 'lasgun' }),
      judgeVoiceCommand({ mode: 'play', target: 'kanly' })], [true, false, false])

  // the judge carries the Voice
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
  check('the judge refuses in the Voice\'s name',
    (judge({ dial: 0, leader: JESSICA, weapon: 'crysknife' },
      { voiced: { mode: 'not-play', target: 'projectile' } }) as { refusal: string }).refusal,
    'voice-forbids')
  check('...and demands what the hand can give',
    (judge({ dial: 0, leader: JESSICA },
      { voiced: { mode: 'play', target: 'projectile' } }) as { refusal: string }).refusal,
    'voice-demands')
  check('a worthless card may ride the weapon slot',
    judge({ dial: 0, leader: JESSICA, weapon: 'baliset' }, { hand: ['baliset'] }), { ok: true })
  check('...and the defence slot',
    judge({ dial: 0, leader: JESSICA, defence: 'baliset' }, { hand: ['baliset'] }), { ok: true })

  // the worthless card in the fight: it does nothing, and is spent
  const balisetFight = resolveBattle({
    aggressor: side('atreides', { dial: 3, leader: JESSICA, weapon: 'baliset' }),
    defender: side('harkonnen', { dial: 1, leader: KUDU }),
  })
  check('a worthless weapon cuts nobody',
    balisetFight.sides[1].leaderDies, false)
  check('...and the winner discards it',
    balisetFight.sides[0].discards, ['baliset'])
  check('a worthless defence stops nothing',
    resolveBattle({
      aggressor: side('atreides', { dial: 1, leader: JESSICA, weapon: 'crysknife' }),
      defender: side('harkonnen', { dial: 2, leader: FEYD, defence: 'baliset' }),
    }).sides[1].leaderDies, true)
  check('...and never reads as a shield to the lasgun',
    [resolveBattle({
      aggressor: side('atreides', { dial: 1, leader: JESSICA, weapon: 'lasgun' }),
      defender: side('harkonnen', { dial: 2, leader: FEYD, defence: 'baliset' }),
    }).explosion,
    resolveBattle({
      aggressor: side('atreides', { dial: 1, leader: JESSICA, weapon: 'lasgun' }),
      defender: side('harkonnen', { dial: 2, leader: FEYD, defence: 'shield' }),
    }).explosion], [false, true])

  // the foresight reads the committed plan, truthfully
  check('the four asks read the committed plan',
    [prescienceAnswer({ dial: 3, leader: JESSICA, weapon: 'crysknife' }, 'weapon'),
      prescienceAnswer({ dial: 3, leader: JESSICA }, 'defence'),
      prescienceAnswer({ dial: 3, cheapHero: true }, 'leader'),
      prescienceAnswer({ dial: 3 }, 'dial')],
    ['crysknife', 'none', 'cheap-hero', 3])
  check('an empty slot answers none — and that IS the answer',
    prescienceAnswer({ dial: 0 }, 'weapon'), 'none')
  check('the two windows have their minute',
    [BATTLE_VOICE_SECONDS, BATTLE_PRESCIENCE_SECONDS], [60, 60])

  // ── the server slice ────────────────────────────────────────────────────
  const fn = code('supabase/functions/dune-action/index.ts')
  const pick = fn.slice(fn.indexOf("case 'BATTLE_PICK'"), fn.indexOf("case 'BATTLE_PLAN'"))
  check('the pick opens the Voice when the Bene Gesserit fight — or their ally does',
    /aggressor === 'bene-gesserit' \|\| opponent === 'bene-gesserit'/.test(pick)
      && /by: 'bene-gesserit', done: false,/.test(pick)
      && /over: inFight/.test(pick)
      && /: proxy!\.over,/.test(pick), true)
  const planCase = fn.slice(fn.indexOf("case 'BATTLE_PLAN'"), fn.indexOf("case 'BATTLE_VOICE'"))
  check('the voiced seat waits for the command — the side it stands over, alone',
    /if \(voiceNow && !voiceNow\.done && myFaction === voiceOver\)/.test(planCase)
      && /voice\.over \?\? combatants\.find\(\(f\) => f !== voice\.by\)/.test(planCase)
      && /code: 'voiced-first',/.test(planCase), true)
  check('...silence past the window declines it',
    /voiceNow = \{ \.\.\.voice, done: true, command: null \}/.test(planCase), true)
  check('...and the judge is handed the command, aimed at the side it stands over',
    /voiced: voiceNow\?\.done && voiceNow\.command && myFaction === voiceOver/.test(planCase), true)
  check('an expired silence is written to the row the foresight reads',
    /battlePlan: \{ territoryId: c\.territoryId, dial: 0 \},/.test(planCase), true)
  check('the question opens when the plan it reads commits — ally battles included, karama-stoppable',
    /const presWanted = \(hasAtreides \|\| !!presProxy\)/.test(planCase)
      && /const presNow = presWanted && opponentIn && !pres/.test(planCase)
      && /'abilities\.battle' as never,/.test(planCase)
      && /over: presOver, done: false,/.test(planCase), true)
  check('...and the reveal WAITS on it — never on a window a stop keeps shut',
    /const mayReveal = allIn && \(!presWanted \|\| \(presNow\?\.done \?\? false\)\)/.test(planCase), true)
  const voiceCase = fn.slice(fn.indexOf("case 'BATTLE_VOICE'"), fn.indexOf("case 'BATTLE_PRESCIENCE'"))
  check('the Voice is its speaker\'s alone until the clock frees anyone',
    /code: 'not-your-voice'/.test(voiceCase) && /if \(!expired\) \{/.test(voiceCase), true)
  check('...a command is judged by the sheet',
    /if \(!judgeVoiceCommand\(action\.command\)\)/.test(voiceCase)
      && /code: 'bad-command'/.test(voiceCase), true)
  check('...and closes spoken or silent',
    /voice: \{ \.\.\.voice, done: true, command \}/.test(voiceCase), true)
  const presCase = fn.slice(fn.indexOf("case 'BATTLE_PRESCIENCE'"), fn.indexOf("case 'BATTLE_TRAITOR'"))
  check('the question is the Atreides\' alone, from the sheet\'s four',
    /code: 'not-your-question'/.test(presCase)
      && /PRESCIENCE_ASKS\.includes\(ask as never\)/.test(presCase), true)
  check('...answered truthfully off the committed row',
    /const answer = prescienceAnswer\(theirPlan as never, ask as never\)/.test(presCase), true)
  check('...into the asker\'s own row and nowhere public',
    /battlePrescience: \{ territoryId: c\.territoryId, ask, answer \},/.test(presCase), true)
  check('...never before their plan is in',
    /code: 'nothing-to-see'/.test(presCase), true)
  check('...and the settled question can complete the table',
    /const current = bothIn/.test(presCase)
      && /prescience: presDone,\s*[\r\n]+\s*revealed: \{/.test(presCase), true)

  // ── the panel ───────────────────────────────────────────────────────────
  const battles = {
    turn: 3, order: ['bene-gesserit', 'harkonnen'] as FactionId[], at: 0,
    current: null, fought: [], usedLeaders: {}, closesAt: 9_999_999_999_999,
  }
  const bgBoard = [
    f('bene-gesserit', 'territory-13', 'sector-10', 4),
    f('harkonnen', 'territory-13', 'sector-10', 3),
  ]
  const draw = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(BattlePanel, {
      battles, forces: bgBoard, storm: CALM, tanks: null,
      seat: 'bene-gesserit' as FactionId,
      hand: [], traitors: [], now: 1, busy: false,
      onPick: () => {}, onPlan: () => {}, onAnswer: () => {},
      onVoice: () => {}, onPrescience: () => {},
      ...over,
    } as never))

  const voiceOpen = {
    territoryId: 'territory-13', sectors: ['sector-10'],
    aggressor: 'bene-gesserit', defender: 'harkonnen',
    committed: [], closesAt: 9_999_999_999_999,
    voice: { by: 'bene-gesserit', done: false, closesAt: 9_999_999_999_999 },
  }
  const speaking = draw({ battles: { ...battles, current: voiceOpen } })
  check('the Bene Gesserit get the command form',
    [/data-voice-speak/.test(speaking), /data-voice-target="projectile"/.test(speaking),
      /data-voice-decline/.test(speaking)], [true, true, true])
  const voicedWait = draw({ battles: { ...battles, current: voiceOpen }, seat: 'harkonnen' })
  check('...their opponent waits for it, formless',
    [/data-voice-waits/.test(voicedWait), /data-plan-commit/.test(voicedWait)], [true, false])
  check('...and may push an expired silence closed',
    /data-voice-push/.test(draw({
      battles: {
        ...battles,
        current: { ...voiceOpen, voice: { ...voiceOpen.voice, closesAt: 0 } },
      },
      seat: 'harkonnen',
    })), true)

  const spoken = (command: unknown) => ({
    ...voiceOpen,
    voice: { by: 'bene-gesserit', done: true, closesAt: 1, command },
  })
  const bound = draw({
    battles: { ...battles, current: spoken({ mode: 'not-play', target: 'projectile' }) },
    seat: 'harkonnen', hand: ['crysknife', 'shield'], handCount: 2,
  })
  check('a forbidding command banners the form and greys its target',
    [/data-voice-banner="not-play"/.test(bound),
      bound.includes('The Voice forbids: projectile'),
      /title="The Voice forbids this card"/.test(bound)], [true, true, true])
  const demanded = draw({
    battles: { ...battles, current: spoken({ mode: 'play', target: 'projectile' }) },
    seat: 'harkonnen', hand: ['crysknife'], handCount: 1,
  })
  check('a demanding Voice holds the commit until the plan obeys',
    [/data-voice-banner="play"/.test(demanded),
      /data-voice-violation="voice-demands"/.test(demanded),
      /disabled="" data-plan-commit/.test(demanded)], [true, true, true])
  const freed = draw({
    battles: { ...battles, current: spoken({ mode: 'play', target: 'lasgun' }) },
    seat: 'harkonnen', hand: ['crysknife'], handCount: 1,
  })
  check('...and an unmeetable demand frees the plan, and says so',
    [freed.includes('you cannot comply, so you plan freely'),
      /data-voice-violation/.test(freed)], [true, false])

  const presOpen = {
    territoryId: 'territory-13', sectors: ['sector-10'],
    aggressor: 'atreides', defender: 'harkonnen',
    committed: ['harkonnen'], closesAt: 9_999_999_999_999,
    prescience: { by: 'atreides', done: false, closesAt: 9_999_999_999_999 },
  }
  const asking = draw({ battles: { ...battles, current: presOpen }, seat: 'atreides' })
  check('the Atreides get the four asks and a decline',
    [/data-prescience-ask="weapon"/.test(asking), /data-prescience-ask="dial"/.test(asking),
      /data-prescience-decline/.test(asking)], [true, true, true])
  check('...everyone else waits on the peering',
    /data-prescience-waits/.test(
      draw({ battles: { ...battles, current: presOpen }, seat: 'harkonnen' })), true)
  check('...and an expired question can be pushed shut',
    /data-prescience-push/.test(draw({
      battles: {
        ...battles,
        current: { ...presOpen, prescience: { ...presOpen.prescience, closesAt: 0 } },
      },
      seat: 'harkonnen',
    })), true)

  const answered = {
    ...presOpen,
    prescience: { by: 'atreides', done: true, closesAt: 1, asked: 'weapon' },
  }
  const foreseen = draw({
    battles: { ...battles, current: answered }, seat: 'atreides',
    forces: [
      f('atreides', 'territory-13', 'sector-10', 4),
      f('harkonnen', 'territory-13', 'sector-10', 3),
    ],
    prescienceAnswer: { ask: 'weapon', answer: 'crysknife' },
  })
  check('the foreseen element is drawn for the asker, by card name',
    [/data-foresight/.test(foreseen), foreseen.includes('Crysknife')], [true, true])
  check('...and a seat handed no answer draws none',
    /data-foresight/.test(
      draw({ battles: { ...battles, current: answered }, seat: 'harkonnen' })), false)

  // the wiring: shared law in the form, the row-read in the screen, both drivers
  const panelSrc = code('src/components/dune/BattlePanel.tsx')
  check('the new refusals have their sentences',
    [/'voiced-first': /.test(panelSrc), /'voice-demands': /.test(panelSrc),
      /'voice-forbids': /.test(panelSrc)], [true, true, true])
  check('the form and the judge share one violation law',
    /voiceViolation\(draftPlan, cmd,/.test(panelSrc), true)
  const game = code('src/components/dune/DuneGameScreen.tsx')
  check('the screen reads the answer from this seat\'s own row',
    /battlePrescience/.test(game)
      && /p\.territoryId === state\.battles\.current\.territoryId/.test(game), true)
  check('...and the clock knows the two windows',
    [/BATTLE_PRESCIENCE_SECONDS \* 1000/.test(game),
      /BATTLE_VOICE_SECONDS \* 1000/.test(game)], [true, true])
  const matchSrc2 = code('src/components/dune/DuneMatchScreen.tsx')
  const harnessSrc2 = code('src/components/dune/DuneMultiSeatView.tsx')
  check('both drivers post the two windows',
    [/BATTLE_VOICE/.test(matchSrc2), /BATTLE_PRESCIENCE/.test(matchSrc2),
      /BATTLE_VOICE/.test(harnessSrc2), /BATTLE_PRESCIENCE/.test(harnessSrc2)],
    [true, true, true, true])
}

// ── advanced combat: spice, elites, and the winner's choice ───────────────
// Pass three. Each force counts FULL on a spice and HALF without; elites are
// double (Sardaukar single against the Fremen); the Fremen are full for free;
// and the winner CHOOSES which pieces die, constrained to pay exactly the
// dial with exactly the spice — the rulebook's example is tested verbatim.
{
  check('elites are double, except Sardaukar facing the Fremen',
    [eliteWorth('fremen', 'emperor'), eliteWorth('emperor', 'atreides'),
      eliteWorth('emperor', 'fremen')], [2, 2, 1])
  check('only the Fremen count full for free',
    [fullWithoutSpice('fremen'), fullWithoutSpice('emperor')], [true, false])
  check('the cap is every piece at full',
    [battleStrengthCap({ plain: 5, elite: 1 }, 2),
      battleStrengthCap({ plain: 5, elite: 1 }, 1)], [7, 6])

  // THE RULEBOOK'S EMPEROR: 1 Sardaukar and 5 ordinary, dialling 3 on 1
  // spice. The law enumerates every way to pay it — both of the book's
  // options are members, and so is the third the same constraint admits
  // (the spice on an ordinary, the Sardaukar dying at half).
  const book = allocationsFor(
    { pieces: { plain: 5, elite: 1 }, dial: 3, spice: 1, worth: 2, freeFull: false })
  check('the rulebook example enumerates its options',
    book, [
      { plainFull: 1, plainHalf: 4, eliteFull: 0, eliteHalf: 0 },
      { plainFull: 1, plainHalf: 2, eliteFull: 0, eliteHalf: 1 },
      { plainFull: 0, plainHalf: 2, eliteFull: 1, eliteHalf: 0 },
    ])
  check('...the choice must be a member, whole and exact',
    [judgeAllocation({ plainFull: 0, plainHalf: 2, eliteFull: 1, eliteHalf: 0 },
      { pieces: { plain: 5, elite: 1 }, dial: 3, spice: 1, worth: 2, freeFull: false }),
      judgeAllocation({ plainFull: 3, plainHalf: 0, eliteFull: 0, eliteHalf: 0 },
        { pieces: { plain: 5, elite: 1 }, dial: 3, spice: 1, worth: 2, freeFull: false }),
      judgeAllocation({ plainFull: 1, plainHalf: 4.5, eliteFull: 0, eliteHalf: 0 },
        { pieces: { plain: 5, elite: 1 }, dial: 3, spice: 1, worth: 2, freeFull: false })],
    [true, false, false])
  check('...and the expired push is the enumeration\'s first',
    firstAllocation(
      { pieces: { plain: 5, elite: 1 }, dial: 3, spice: 1, worth: 2, freeFull: false }),
    { plainFull: 1, plainHalf: 4, eliteFull: 0, eliteHalf: 0 })

  check('Sardaukar facing the Fremen pay at one',
    [allocationsFor({ pieces: { plain: 0, elite: 2 }, dial: 2, spice: 2, worth: 1, freeFull: false }),
      allocationsFor({ pieces: { plain: 0, elite: 2 }, dial: 2, spice: 0, worth: 1, freeFull: false })],
    [[{ plainFull: 0, plainHalf: 0, eliteFull: 2, eliteHalf: 0 }], []])
  check('the Fremen pay full for free, and their dials are whole',
    [allocationsFor({ pieces: { plain: 3, elite: 2 }, dial: 5, spice: 0, worth: 2, freeFull: true }),
      allocationsFor({ pieces: { plain: 3, elite: 2 }, dial: 5, spice: 1, worth: 2, freeFull: true }),
      allocationsFor({ pieces: { plain: 3, elite: 2 }, dial: 2.5, spice: 0, worth: 2, freeFull: true })],
    [[{ plainFull: 3, plainHalf: 0, eliteFull: 1, eliteHalf: 0 },
      { plainFull: 1, plainHalf: 0, eliteFull: 2, eliteHalf: 0 }], [], []])

  check('pieces are counted by class, inside the battle\'s slice',
    piecesInBattle([
      f('emperor', 'territory-13', 'sector-10', 4, { starred: 1 }),
      f('emperor', 'territory-13', 'sector-09', 2, { starred: 1 }),
      f('emperor', 'territory-22', 'sector-15', 3, { starred: 3 }),
    ], 'emperor', 'territory-13', ['sector-10']),
    { plain: 3, elite: 1 })

  // the judge, in advanced mode
  const battle = { territoryId: 'territory-13', sectors: ['sector-10'] }
  const board = [
    f('atreides', 'territory-13', 'sector-10', 4),
    f('harkonnen', 'territory-13', 'sector-10', 3),
  ]
  const adv = (plan: BattlePlan, over: Record<string, unknown> = {}) => judgePlan({
    faction: 'atreides', battle, forces: board, hand: [],
    deadLeaders: [], usedLeaders: {}, plan,
    mode: 'advanced', opponent: 'harkonnen', purse: 5, ...over,
  } as never)
  check('a half dial the pieces can pay stands',
    adv({ dial: 2.5, spice: 1 }), { ok: true })
  check('...a quarter dial is no dial',
    (adv({ dial: 2.25, spice: 1 }) as { refusal: string }).refusal, 'dial-out-of-range')
  check('...a dial past every piece at full is out of range',
    (adv({ dial: 5, spice: 4 }) as { refusal: string }).refusal, 'dial-out-of-range')
  check('a dial no pieces can pay with that spice is refused by name',
    (adv({ dial: 3, spice: 0 }) as { refusal: string }).refusal, 'dial-spice-mismatch')
  check('spice past the purse is refused privately',
    (adv({ dial: 3, spice: 6 }, { purse: 5 }) as { refusal: string }).refusal,
    'more-spice-than-you-hold')
  check('the Fremen may not spend what they do not need',
    (judgePlan({
      faction: 'fremen', battle,
      forces: [f('fremen', 'territory-13', 'sector-10', 4),
        f('harkonnen', 'territory-13', 'sector-10', 3)],
      hand: [], deadLeaders: [], usedLeaders: {},
      plan: { dial: 2, spice: 1 }, mode: 'advanced', opponent: 'harkonnen', purse: 5,
    } as never) as { refusal: string }).refusal, 'fremen-need-no-spice')
  check('basic battles take no spice and no halves',
    [(judge => (judge as { refusal: string }).refusal)(judgePlan({
      faction: 'atreides', battle, forces: board, hand: [],
      deadLeaders: [], usedLeaders: {}, plan: { dial: 1, spice: 1 },
    } as never)),
    (judge => (judge as { refusal: string }).refusal)(judgePlan({
      faction: 'atreides', battle, forces: board, hand: [],
      deadLeaders: [], usedLeaders: {}, plan: { dial: 2.5 },
    } as never))], ['spice-is-advanced', 'dial-out-of-range'])
  check('a broken spice number is refused in any mode',
    (adv({ dial: 1, spice: -1 }) as { refusal: string }).refusal, 'spice-out-of-range')

  // what is spent, and who is excused
  const spent = resolveBattle({
    aggressor: side('atreides', { dial: 3, leader: JESSICA, spice: 2 }),
    defender: side('harkonnen', { dial: 1, leader: KUDU, spice: 1 }),
  })
  check('spice spent leaves for the bank win or lose',
    spent.sides.map(s => s.spends), [2, 1])
  const betrayedFight = resolveBattle({
    aggressor: side('atreides', { dial: 3, leader: JESSICA, spice: 2 }, true),
    defender: side('harkonnen', { dial: 1, leader: FEYD, spice: 1 }),
  })
  check('...except a traitor-calling winner, who spends nothing',
    [betrayedFight.winner, betrayedFight.sides.map(s => s.spends)],
    ['atreides', [0, 1]])
  check('...while mutual ruin spends both',
    resolveBattle({
      aggressor: side('atreides', { dial: 3, spice: 2 }, true),
      defender: side('harkonnen', { dial: 1, spice: 1 }, true),
    }).sides.map(s => s.spends), [2, 1])

  // the chosen dead leave by class, cells in sector order
  check('an allocation lifts what it names, in sector order',
    allocationLosses([
      f('atreides', 'territory-13', 'sector-10', 4, { starred: 1 }),
      f('atreides', 'territory-13', 'sector-11', 2, { starred: 1 }),
    ], 'atreides', 'territory-13', ['sector-10', 'sector-11'],
    { plainFull: 1, plainHalf: 2, eliteFull: 1, eliteHalf: 1 }),
    [{ sector: 'sector-10', count: 4, starred: 1 },
      { sector: 'sector-11', count: 1, starred: 1 }])

  check('the window has its two minutes', BATTLE_ALLOCATE_SECONDS, 120)

  // ── the server slice ────────────────────────────────────────────────────
  const fn = code('supabase/functions/dune-action/index.ts')
  const planCase = fn.slice(fn.indexOf("case 'BATTLE_PLAN'"), fn.indexOf("case 'BATTLE_VOICE'"))
  check('the plan carries its spice into the row',
    /\.\.\.\(action\.spice != null \? \{ spice: Number\(action\.spice\) \} : null\),/.test(planCase), true)
  check('...and the judge is told the mode, the facing, and the purse',
    [/mode: \(state\.mode === 'advanced' \? 'advanced' : 'basic'\) as never,/.test(planCase),
      /opponent: combatants\.find\(\(f\) => f !== myFaction\) as never,/.test(planCase),
      /purse: readSpice\(mine as never\),/.test(planCase)], [true, true, true])
  const beatCase = fn.slice(fn.indexOf("case 'BATTLE_TRAITOR'"), fn.indexOf("case 'BATTLE_ALLOCATE'"))
  check('the beat opens the winner\'s window exactly when a choice exists',
    [beatCase.includes("const winnerChoices"),
      beatCase.includes("if (winnerChoices.length > 1) {")],
    [true, true])
  check('...and cannot reopen it over the winner\'s head',
    /code: 'allocation-open' \}, 409\)/.test(beatCase), true)
  const allocCase = fn.slice(fn.indexOf("case 'BATTLE_ALLOCATE'"), fn.indexOf('// ── The Fremen ride'))
  check('the choice is the winner\'s alone until the clock frees anyone',
    [/code: 'not-your-choice' \}, 403\)/.test(allocCase),
      /if \(!judgeAllocation\(choice, constraint\)\)/.test(allocCase),
      /choice = firstAllocation\(constraint\)/.test(allocCase)], [true, true, true])
  check('...and both triggers settle through ONE implementation',
    [/return await settleBattle\(/.test(allocCase),
      beatCase.includes("return await settleBattle(b as never, c as never, calls as never,")],
    [true, true])
  const settle = fn.slice(fn.indexOf('const settleBattle'), fn.indexOf('switch (action.type)'))
  check('the winner\'s named dead replace the dial-count rule',
    /allocation && f === outcome\.winner/.test(settle)
      && /allocationLosses\(/.test(settle), true)
  check('...and the spent spice moves to the bank in the same write',
    /moves\.push\(\{ from: seatId, to: BANK, amount: side\.spends, reason: 'battle-spice' \}\)/.test(settle),
    true)
  const hold = code('src/lib/dune/phaseAdvance.ts')
  check('the phase holds for the winner\'s window',
    /until: c\?\.revealed\?\.allocate\?\.closesAt/.test(hold), true)

  // ── the panel ───────────────────────────────────────────────────────────
  const battles2 = {
    turn: 3, order: ['emperor', 'harkonnen'] as FactionId[], at: 0,
    current: null, fought: [], usedLeaders: {}, closesAt: 9_999_999_999_999,
  }
  const advBoard = [
    f('emperor', 'territory-13', 'sector-10', 6, { starred: 1 }),
    f('harkonnen', 'territory-13', 'sector-10', 3),
  ]
  const drawAdv = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(BattlePanel, {
      battles: battles2, forces: advBoard, storm: CALM, tanks: null,
      seat: 'emperor' as FactionId,
      hand: [], traitors: [], now: 1, busy: false,
      onPick: () => {}, onPlan: () => {}, onAnswer: () => {},
      onVoice: () => {}, onPrescience: () => {}, onAllocate: () => {},
      mode: 'advanced', purse: 5,
      ...over,
    } as never))

  const advCurrent = {
    territoryId: 'territory-13', sectors: ['sector-10'],
    aggressor: 'emperor', defender: 'harkonnen',
    committed: [], closesAt: 9_999_999_999_999,
  }
  const advForm = drawAdv({ battles: { ...battles2, current: advCurrent } })
  check('the advanced form offers the half-dial and the spice stepper',
    [/data-dial-half/.test(advForm), /data-plan-spice-up/.test(advForm),
      /data-plan-spice="0"/.test(advForm)], [true, true, true])
  check('...which basic battles never see',
    (() => {
      const b = drawAdv({ battles: { ...battles2, current: advCurrent }, mode: 'basic' })
      return [/data-dial-half/.test(b), /data-plan-spice-up/.test(b)]
    })(), [false, false])
  check('...and the Fremen see neither, being full for free',
    (() => {
      const fr = drawAdv({
        battles: {
          ...battles2,
          current: { ...advCurrent, aggressor: 'fremen' },
        },
        forces: [f('fremen', 'territory-13', 'sector-10', 4),
          f('harkonnen', 'territory-13', 'sector-10', 3)],
        seat: 'fremen',
      })
      return [/data-fremen-free/.test(fr), /data-dial-half/.test(fr)]
    })(), [true, false])

  const advRevealed = {
    ...advCurrent, committed: ['emperor', 'harkonnen'],
    revealed: {
      plans: {
        emperor: { dial: 3, spice: 1, leader: KUDU },
        harkonnen: { dial: 2.5, leader: FEYD },
      },
      traitor: { answered: ['emperor', 'harkonnen'], calls: [], closesAt: 1 },
      allocate: { by: 'emperor', closesAt: 9_999_999_999_999 },
    },
  }
  const choosing = drawAdv({ battles: { ...battles2, current: advRevealed } })
  check('the reveal prints the spice and the half-dial',
    [/data-plan-spice-shown/.test(choosing), choosing.includes('2½')], [true, true])
  check('...and the winner\'s window keeps the same scene',
    /data-backdrop="Arrakeen\.jpg"/.test(choosing), true)
  check('the winner is offered every legal way to pay, and only those',
    [(choosing.match(/data-allocate-option="/g) ?? []).length,
      choosing.includes('1 Sardaukar at full + 2 ordinary at half'),
      choosing.includes('1 ordinary at full + 4 ordinary at half')], [3, true, true])
  check('...everyone else waits on the choice',
    (() => {
      const w = drawAdv({ battles: { ...battles2, current: advRevealed }, seat: 'harkonnen' })
      return [/data-allocate-waits/.test(w), /data-allocate-option/.test(w),
        /data-call-traitor|data-no-traitor/.test(w)]
    })(), [true, false, false])
  check('...and an expired choice can be pushed to the first lawful one',
    /data-allocate-push/.test(drawAdv({
      battles: {
        ...battles2,
        current: {
          ...advRevealed,
          revealed: {
            ...advRevealed.revealed,
            allocate: { by: 'emperor', closesAt: 0 },
          },
        },
      },
      seat: 'harkonnen',
    })), true)
  check('an unpayable pair is stopped at the form, by name',
    (() => {
      const s = drawAdv({
        battles: { ...battles2, current: advCurrent },
        forces: [f('emperor', 'territory-13', 'sector-10', 6, { starred: 1 }),
          f('harkonnen', 'territory-13', 'sector-10', 3)],
        purse: 0,
      })
      // dial 0 spice 0 is payable; the pin is that the gate EXISTS and the
      // commit reads it — the unpayable state needs a click, so the source
      // is pinned instead.
      return /data-dial-unsupported/.test(s)
    })(), false)
  const panelSrc2 = code('src/components/dune/BattlePanel.tsx')
  // A PURSE THAT ARRIVES LATE cannot leave staged spice above it: the form
  // clamps at use, so the commit can never post more spice than the ceiling
  // the same render showed.
  check('the staged spice is clamped to the purse at use',
    [/const spiceStaged = Math\.min\(spiceSpent, spiceMax\)/.test(panelSrc2),
      /data-plan-spice=\{spiceStaged\}/.test(panelSrc2),
      /\? \{ spice: spiceStaged \} : null\),/.test(panelSrc2)], [true, true, true])
  check('...the commit is gated on the same law the server judges by',
    /disabled=\{busy \|\| !!violation \|\| !supported\} data-plan-commit=""/.test(panelSrc2)
      && /const supported = !advanced \|\| allocationsFor\(\{/.test(panelSrc2), true)
  const game2 = code('src/components/dune/DuneGameScreen.tsx')
  check('the clock knows the winner\'s window, and the screen feeds the purse',
    [/BATTLE_ALLOCATE_SECONDS \* 1000/.test(game2),
      /purse=\{own\?\.spice \?\? 0\}/.test(game2)], [true, true])
  const match2 = code('src/components/dune/DuneMatchScreen.tsx')
  const harness2 = code('src/components/dune/DuneMultiSeatView.tsx')
  check('both drivers post the choice',
    [/BATTLE_ALLOCATE/.test(match2), /BATTLE_ALLOCATE/.test(harness2)], [true, true])
}

// ── the Kwisatz Haderach and the Harkonnen's prisoners ────────────────────
// Pass four. The sleeper wakes at seven losses and rides ONE territory a
// turn for +2 — powerless when its carrier dies, traitor-proof, killed only
// by the explosion, revived like a leader while counting for nothing. The
// Harkonnen take a prisoner from every battle they win: kill it for two
// spice, or field it once and send it home.
{
  check('the sleeper wakes at seven',
    [kwisatzHaderachAvailable(6), kwisatzHaderachAvailable(7),
      kwisatzHaderachAvailable(undefined)], [false, true, false])
  check('...worth two, for a minute of the clock',
    [KWISATZ_STRENGTH, BATTLE_CAPTURE_SECONDS], [2, 60])
  check('a leader\'s owner is found by name',
    [leaderOwner(JESSICA), leaderOwner(FEYD), leaderOwner('nobody')],
    ['atreides', 'harkonnen', null])

  // the judge
  const battle = { territoryId: 'territory-13', sectors: ['sector-10'] }
  const board = [
    f('atreides', 'territory-13', 'sector-10', 4),
    f('harkonnen', 'territory-13', 'sector-10', 3),
  ]
  const kw = (plan: BattlePlan, over: Record<string, unknown> = {}) => judgePlan({
    faction: 'atreides', battle, forces: board, hand: [],
    deadLeaders: [], usedLeaders: {}, plan,
    mode: 'advanced', opponent: 'harkonnen', purse: 5,
    kwisatz: { available: true, dead: false, usedTerritory: null },
    ...over,
  } as never)
  check('an awakened sleeper rides a leader',
    kw({ dial: 1, leader: JESSICA, kwisatz: true }), { ok: true })
  check('...and may ride the same territory again',
    kw({ dial: 1, leader: JESSICA, kwisatz: true },
      { kwisatz: { available: true, dead: false, usedTerritory: 'territory-13' } }),
    { ok: true })
  check('...but never alone',
    (kw({ dial: 1, kwisatz: true }) as { refusal: string }).refusal, 'kwisatz-alone')
  check('...never asleep',
    (kw({ dial: 1, leader: JESSICA, kwisatz: true },
      { kwisatz: { available: false, dead: false } }) as { refusal: string }).refusal,
    'kwisatz-asleep')
  check('...never from the tanks',
    (kw({ dial: 1, leader: JESSICA, kwisatz: true },
      { kwisatz: { available: true, dead: true } }) as { refusal: string }).refusal,
    'kwisatz-in-the-tanks')
  check('...never a second territory in a turn',
    (kw({ dial: 1, leader: JESSICA, kwisatz: true },
      { kwisatz: { available: true, dead: false, usedTerritory: 'territory-26' } }) as { refusal: string }).refusal,
    'kwisatz-elsewhere')
  check('...never in the basic game',
    (kw({ dial: 1, leader: JESSICA, kwisatz: true },
      { mode: 'basic', kwisatz: { available: true, dead: false } }) as { refusal: string }).refusal,
    'kwisatz-is-advanced')
  check('...and never another faction\'s',
    (judgePlan({
      faction: 'harkonnen', battle, forces: board, hand: [],
      deadLeaders: [], usedLeaders: {},
      plan: { dial: 1, leader: FEYD, kwisatz: true },
      mode: 'advanced', opponent: 'atreides', purse: 5,
      kwisatz: { available: true, dead: false },
    } as never) as { refusal: string }).refusal, 'kwisatz-not-yours')

  check('a borrowed leader is a legal leader, for its captor alone',
    [judgePlan({
      faction: 'harkonnen', battle, forces: board, hand: [],
      deadLeaders: [], usedLeaders: {}, plan: { dial: 1, leader: JESSICA },
      mode: 'advanced', opponent: 'atreides', purse: 5, borrowed: [JESSICA],
    } as never), (judgePlan({
      faction: 'harkonnen', battle, forces: board, hand: [],
      deadLeaders: [], usedLeaders: {}, plan: { dial: 1, leader: JESSICA },
      mode: 'advanced', opponent: 'atreides', purse: 5,
    } as never) as { refusal: string }).refusal],
    [{ ok: true }, 'no-such-leader'])

  // the resolution
  const YUEH = A[4].name  // Dr. Wellington Yueh, strength 1
  check('the +2 turns a losing total into a winning one',
    [resolveBattle({
      aggressor: side('atreides', { dial: 1, leader: YUEH, kwisatz: true }),
      defender: side('harkonnen', { dial: 3, leader: KUDU }),
    }).winner, resolveBattle({
      aggressor: side('atreides', { dial: 1, leader: YUEH }),
      defender: side('harkonnen', { dial: 3, leader: KUDU }),
    }).winner], ['atreides', 'harkonnen'])
  check('...and dies with its carrier\'s effect, not its life',
    (() => {
      // Jessica falls to the unanswered Chaumas: her 5 AND the token's 2 go
      // with her, 2 against 3 — a +2 that outlived its carrier would win.
      const out = resolveBattle({
        aggressor: side('atreides', { dial: 2, leader: JESSICA, kwisatz: true }),
        defender: side('harkonnen', { dial: 3, cheapHero: true, weapon: 'chaumas' }),
      })
      return [out.winner, out.sides[0].kwisatzDies]
    })(), ['harkonnen', false])
  check('only the explosion kills the Kwisatz Haderach',
    resolveBattle({
      aggressor: side('atreides', { dial: 1, leader: JESSICA, weapon: 'lasgun', kwisatz: true }),
      defender: side('harkonnen', { dial: 2, leader: FEYD, defence: 'shield' }),
    }).sides.map(s => s.kwisatzDies), [true, false])
  check('a guarded leader cannot turn traitor',
    (() => {
      const out = resolveBattle({
        aggressor: side('atreides', { dial: 3, leader: JESSICA, kwisatz: true }),
        defender: side('harkonnen', { dial: 1, leader: KUDU }, true),
      })
      return [out.traitors, out.winner]
    })(), [[], 'atreides'])
  check('a borrowed leader fights at its own strength',
    resolveBattle({
      aggressor: side('atreides', { dial: 2, leader: YUEH }),
      defender: side('harkonnen', { dial: 0, leader: JESSICA }),
    }).winner, 'harkonnen')

  // the pool
  check('the pool spares the dead, the elsewhere-used, and the already-taken',
    capturePool({
      loser: 'atreides',
      tanks: [{ name: JESSICA }],
      usedLeaders: { 'Thufir Hawat': 'territory-26', 'Gurney Halleck': 'territory-13' },
      territoryId: 'territory-13',
      alreadyCaptured: ['Duncan Idaho'],
    }), ['Gurney Halleck', 'Dr. Wellington Yueh'])
  check('all own leaders dead means every prisoner goes home',
    [allOwnLeadersDead('harkonnen',
      factionById('harkonnen')!.leaders.map(l => ({ name: l.name }))),
    allOwnLeadersDead('harkonnen',
      factionById('harkonnen')!.leaders.slice(1).map(l => ({ name: l.name })))],
    [true, false])

  // revival: like any other leader, counting for nothing
  let fourDead = { forces: {}, leaders: {} } as Parameters<typeof returnLeaderToTanks>[0]
  for (const l of factionById('atreides')!.leaders.slice(0, 4)) {
    fourDead = returnLeaderToTanks(fourDead, 'atreides', l.name)
  }
  const withToken = returnLeaderToTanks(fourDead, 'atreides', KWISATZ_HADERACH)
  check('the token in the tanks does not open the leaders\' gate',
    (withToken.leaderRevivalOpen ?? []).includes('atreides'), false)
  const fifthToo = returnLeaderToTanks(
    withToken, 'atreides', factionById('atreides')!.leaders[4].name)
  check('...the fifth sheet leader still does',
    (fifthToo.leaderRevivalOpen ?? []).includes('atreides'), true)
  check('...and the token revives at its own two',
    (() => {
      const out = reviveLeader({
        faction: 'atreides', tanks: fifthToo, leader: KWISATZ_HADERACH,
        soFar: { forces: 0, starred: 0 }, spice: 5,
      } as never)
      return 'ok' in out && out.ok ? out.cost : out
    })(), 2)

  // ── the server slice ────────────────────────────────────────────────────
  const fn = code('supabase/functions/dune-action/index.ts')
  const planCase = fn.slice(fn.indexOf("case 'BATTLE_PLAN'"), fn.indexOf("case 'BATTLE_VOICE'"))
  check('the plan carries the sleeper, and the judge is told everything',
    [/\.\.\.\(action\.kwisatz \? \{ kwisatz: true \} : null\),/.test(planCase),
      /available: kwisatzHaderachAvailable\(/.test(planCase),
      /borrowed: \(\(mine as \{ capturedLeaders/.test(planCase)],
    [true, true, true])
  const beatAll = fn.slice(fn.indexOf("case 'BATTLE_TRAITOR'"), fn.indexOf("case 'SEED_SPICE'"))
    + fn.slice(fn.indexOf('const settleBattle'), fn.indexOf('switch (action.type)'))
  check('the guarded leader cannot be called at the door either',
    /code: 'kwisatz-guards',/.test(beatAll), true)
  check('a dead leader is banked under its OWNER\'S name',
    /tanks, \(leaderOwner\(plan\.leader\) \?\? f\) as never, plan\.leader,/.test(beatAll), true)
  check('a fielded prisoner goes home, alive or dead',
    /capturedLeaders: kept!\.filter\(\(x\) => x\.name !== plan\.leader\)/.test(beatAll), true)
  check('the explosion reaches the token',
    /if \(side\.kwisatzDies\) \{/.test(beatAll)
      && /KWISATZ_HADERACH,/.test(beatAll), true)
  check('a wiped-out Harkonnen returns every prisoner',
    /if \(hkSeat && allOwnLeadersDead\(/.test(beatAll)
      && /capturedLeaders: \[\] \}/.test(beatAll), true)
  check('the losses counter moves with every settle',
    /lostNow\[k\.faction\] = \(lostNow\[k\.faction\] \?\? 0\) \+ k\.count/.test(beatAll)
      && /battleLosses: \(p\.battleLosses \?\? 0\) \+ lostNow\[p\.faction\]/.test(beatAll),
    true)
  check('the ridden territory is stamped for the turn',
    /const khRode = \[c\.aggressor, c\.defender\]\.some\(\(x\) => !!planOf\(x\)\.kwisatz\)/.test(beatAll)
      && /kwisatzUsed: c\.territoryId/.test(beatAll), true)
  check('a Harkonnen win opens the prisoner window',
    [/const captiveFrom = state\.mode === 'advanced' && outcome\.winner === 'harkonnen'/.test(beatAll),
      /capturePool\(\{/.test(beatAll),
      /capture, spent: true,/.test(beatAll)], [true, true, true])
  const pickCase = fn.slice(fn.indexOf("case 'BATTLE_PICK'"), fn.indexOf("case 'BATTLE_PLAN'"))
  check('...and the next pick waits on it',
    /code: 'capture-first',/.test(pickCase), true)
  const capCase = fn.slice(fn.indexOf("case 'BATTLE_CAPTURE'"), fn.indexOf('// ── The Fremen ride'))
  check('the choice is the Harkonnen\'s until the clock frees anyone',
    [/code: 'not-your-prisoner',/.test(capCase),
      /shuffleWithSeed\(Number\(match\.rng_seed\) \+ match\.action_seq, pool\)\[0\]/.test(capCase),
      /amount: 2, reason: 'captured-leader'/.test(capCase),
      /\(b as \{ spent\?: boolean \}\)\.spent/.test(capCase)],
    [true, true, true, true])
  const hold2 = code('src/lib/dune/phaseAdvance.ts')
  check('the phase holds for the prisoner window',
    /state\.battles\.capture\?\.closesAt/.test(hold2), true)

  // ── the panel ───────────────────────────────────────────────────────────
  const battles4 = {
    turn: 3, order: ['atreides', 'harkonnen'] as FactionId[], at: 0,
    current: null, fought: [], usedLeaders: {}, closesAt: 9_999_999_999_999,
  }
  const kwBoard = [
    f('atreides', 'territory-13', 'sector-10', 4),
    f('harkonnen', 'territory-13', 'sector-10', 3),
  ]
  const draw4 = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(BattlePanel, {
      battles: battles4, forces: kwBoard, storm: CALM, tanks: null,
      seat: 'atreides' as FactionId,
      hand: [], traitors: [], now: 1, busy: false,
      onPick: () => {}, onPlan: () => {}, onAnswer: () => {},
      onVoice: () => {}, onPrescience: () => {}, onAllocate: () => {},
      onCapture: () => {},
      mode: 'advanced', purse: 5,
      ...over,
    } as never))

  const kwCurrent = {
    territoryId: 'territory-13', sectors: ['sector-10'],
    aggressor: 'atreides', defender: 'harkonnen',
    committed: [], closesAt: 9_999_999_999_999,
  }
  check('an awakened sleeper appears on the form, waiting for a leader',
    /data-plan-kwisatz="" aria-pressed="false" disabled=""/.test(draw4({
      battles: { ...battles4, current: kwCurrent },
      kwisatz: { available: true, dead: false, usedTerritory: null },
    })), true)
  check('...says when it lies in the tanks',
    /data-kwisatz-dead=""/.test(draw4({
      battles: { ...battles4, current: kwCurrent },
      kwisatz: { available: true, dead: true, usedTerritory: null },
    })), true)
  check('...and when it has ridden elsewhere',
    /data-kwisatz-elsewhere=""/.test(draw4({
      battles: { ...battles4, current: kwCurrent },
      kwisatz: { available: true, dead: false, usedTerritory: 'territory-26' },
    })), true)
  check('...and an asleep one shows nothing at all',
    /data-plan-kwisatz/.test(draw4({
      battles: { ...battles4, current: kwCurrent }, kwisatz: null,
    })), false)
  check('a prisoner is offered as the disc it is',
    draw4({
      battles: { ...battles4, current: { ...kwCurrent, aggressor: 'harkonnen', defender: 'atreides' } },
      seat: 'harkonnen',
      captured: [{ name: JESSICA, from: 'atreides' }],
    }).includes(`data-plan-borrowed="${JESSICA}"`), true)

  const kwReveal = {
    ...kwCurrent, committed: ['atreides', 'harkonnen'],
    revealed: {
      plans: {
        atreides: { dial: 2, leader: JESSICA, kwisatz: true },
        harkonnen: { dial: 3, leader: FEYD },
      },
      traitor: { answered: [], calls: [], closesAt: 59_001 },
    },
  }
  check('the reveal stands before the scene its battle resolves to',
    [/data-backdrop="Arrakeen-Atreides\.jpg"/.test(
      draw4({ battles: { ...battles4, current: kwReveal } })),
    /data-backdrop="Dune-Sand\.png"/.test(draw4({
      battles: {
        ...battles4,
        current: {
          ...kwReveal, territoryId: 'territory-22', sectors: ['sector-15'],
          aggressor: 'emperor', defender: 'fremen',
          revealed: {
            plans: { emperor: { dial: 1 }, fremen: { dial: 0 } },
            traitor: { answered: [], calls: [], closesAt: 50_000 },
          },
        },
      },
      forces: [
        f('emperor', 'territory-22', 'sector-15', 3),
        f('fremen', 'territory-22', 'sector-15', 4),
      ],
    }))], [true, true])

  check('the reveal names the rider and counts its two',
    (() => {
      const s = draw4({ battles: { ...battles4, current: kwReveal } })
      return [/data-reveal-kwisatz="atreides"/.test(s),
        s.includes('data-strength-count="atreides">7<')]
    })(), [true, true])
  check('...and the guarded leader offers no traitor call',
    /data-call-traitor/.test(draw4({
      battles: {
        ...battles4,
        current: {
          ...kwReveal,
          revealed: { ...kwReveal.revealed, traitor: { answered: [], calls: [], closesAt: 50_000 } },
        },
      },
      seat: 'harkonnen', traitors: [JESSICA],
    })), false)

  const capBattles = {
    ...battles4,
    capture: { from: 'atreides' as FactionId, closesAt: 9_999_999_999_999 },
  }
  check('the Harkonnen are asked about their prisoner',
    (() => {
      const s = draw4({ battles: capBattles, seat: 'harkonnen' })
      return [/data-capture-kill/.test(s), /data-capture-keep/.test(s),
        /data-capture-decline/.test(s)]
    })(), [true, true, true])
  check('...everyone else waits on the cell door',
    (() => {
      const s = draw4({ battles: capBattles, seat: 'atreides' })
      return [/data-capture-waits/.test(s), /data-capture-kill/.test(s)]
    })(), [true, false])
  check('...and an expired window can be pushed shut',
    /data-capture-push/.test(draw4({
      battles: { ...capBattles, capture: { from: 'atreides' as FactionId, closesAt: 0 } },
      seat: 'atreides',
    })), true)

  const strip = code('src/components/dune/OwnStrip.tsx')
  check('a Harkonnen seat lists its prisoners, from its own row',
    /data-captured-leaders=""/.test(strip)
      && /own\?\.capturedLeaders/.test(strip), true)
  const game4 = code('src/components/dune/DuneGameScreen.tsx')
  check('the screen feeds the sleeper, the prisoners, and the clock',
    [/onCapture=\{onBattleCapture\}/.test(game4),
      /captured=\{own\?\.capturedLeaders \?\? \[\]\}/.test(game4),
      /kwisatzHaderachAvailable\(/.test(game4),
      /BATTLE_CAPTURE_SECONDS \* 1000/.test(game4)], [true, true, true, true])
  const match4 = code('src/components/dune/DuneMatchScreen.tsx')
  const harness4 = code('src/components/dune/DuneMultiSeatView.tsx')
  check('both drivers post the choice over the prisoner',
    [/BATTLE_CAPTURE/.test(match4), /BATTLE_CAPTURE/.test(harness4)], [true, true])
}

// ── the alliance's interrogators ──────────────────────────────────────────
// The Voice, the question and the traitor call reach into an ALLY'S battle:
// the third seat is admitted when seated, outside the fight, and allied to
// a combatant — and each power lands on the ally's opponent.
{
  const table3 = [
    { faction: 'atreides', ally: 'harkonnen' },
    { faction: 'harkonnen', ally: 'atreides' },
    { faction: 'emperor', ally: null },
    { faction: 'bene-gesserit', ally: null },
  ] as never
  check('an interrogator is seated, outside the battle, and allied within it',
    [allyInterrogator({ faction: 'harkonnen', aggressor: 'atreides', defender: 'emperor', players: table3 } as never),
      allyInterrogator({ faction: 'harkonnen', aggressor: 'emperor', defender: 'atreides', players: table3 } as never),
      allyInterrogator({ faction: 'bene-gesserit', aggressor: 'atreides', defender: 'emperor', players: table3 } as never),
      allyInterrogator({ faction: 'harkonnen', aggressor: 'harkonnen', defender: 'atreides', players: table3 } as never),
      allyInterrogator({ faction: 'fremen', aggressor: 'atreides', defender: 'emperor', players: table3 } as never)],
    [{ ally: 'atreides', over: 'emperor' }, { ally: 'atreides', over: 'emperor' },
      null, null, null])

  // ── the server's three doors ────────────────────────────────────────────
  const fn9 = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('the beat seats the proxy, waits on them, and their call lands over the ally\'s opponent',
    [/const eligible = hkProxy \? \[\.\.\.combatants, 'harkonnen'\] : combatants/.test(fn9),
      /if \(answered\.length < eligible\.length\) \{/.test(fn9),
      /answered = eligible as never/.test(fn9),
      /\? hkProxy\.over/.test(fn9)],
    [true, true, true, true])
  check('the question reads the side its window stands over',
    /const other = \(\(pres as \{ over\?: string \}\)\.over\s*[\r\n]+\s*\?\? combatants\.find\(\(f\) => f !== pres\.by\)\)!/.test(fn9),
    true)
  check('the settlement books the proxy call to the ally\'s side',
    [/const hkCalled = !!hkProxy2 && calls\.includes\('harkonnen'\)/.test(fn9),
      /\|\| \(hkCalled && hkProxy2!\.ally === c\.aggressor\)/.test(fn9),
      /\|\| \(hkCalled && hkProxy2!\.ally === c\.defender\)/.test(fn9)],
    [true, true, true])
  check('...spends the Harkonnen card and seats their purse for the bounty',
    [/traitors: \(hkRow0\.traitors \?\? \[\]\)\.filter\(\(n\) => n !== overLeader\)/.test(fn9),
      /purses\[hkSeat0\] = readSpice\(hkRow0 as never\)/.test(fn9)],
    [true, true])

  // ── the beat's third chair, on the panel ────────────────────────────────
  const revealAt = 60_000
  const beatBattles = (over: object = {}, planOver: object = {}) => ({
    turn: 4, at: 0, fought: [], usedLeaders: {},
    order: ['atreides', 'emperor', 'harkonnen'],
    closesAt: 600_000,
    current: {
      territoryId: 'territory-13', sectors: ['sector-10'],
      aggressor: 'atreides', defender: 'emperor',
      committed: ['atreides', 'emperor'],
      closesAt: 600_000,
      revealed: {
        plans: {
          atreides: { dial: 2, leader: 'Duncan Idaho' },
          emperor: { dial: 3, leader: 'Hasimir Fenring', ...planOver },
        },
        traitor: {
          answered: [], calls: [],
          closesAt: revealAt + BATTLE_TRAITOR_SECONDS * 1000, ...over,
        },
      },
    },
  })
  const drawBeat = (battles9: object, overProps: object = {}) =>
    renderToStaticMarkup(createElement(BattlePanel, {
      battles: battles9, forces: [], storm: 'sector-1', tanks: null,
      seat: 'harkonnen' as FactionId, hand: [], traitors: ['Hasimir Fenring'],
      now: revealAt + 10_000, busy: false,
      onPick: () => {}, onPlan: () => {}, onAnswer: () => {},
      ...overProps,
    } as never))

  const proxySeat = drawBeat(beatBattles(), { traitorProxy: 'emperor', beatEligible: 3 })
  check('the proxy is offered the call, named, and the decline beside it',
    [/data-call-traitor/.test(proxySeat), /Hasimir Fenring/.test(proxySeat),
      /data-no-traitor/.test(proxySeat)],
    [true, true, true])
  check('...a mere spectator is offered neither',
    [/data-call-traitor/.test(drawBeat(beatBattles())),
      /data-no-traitor/.test(drawBeat(beatBattles()))],
    [false, false])
  check('...and the Kwisatz Haderach guards the proxy call too',
    [/data-call-traitor/.test(drawBeat(beatBattles({}, { kwisatz: true }),
      { traitorProxy: 'emperor', beatEligible: 3 })),
      /data-no-traitor/.test(drawBeat(beatBattles({}, { kwisatz: true }),
        { traitorProxy: 'emperor', beatEligible: 3 }))],
    [false, true])
  const twoOfThree = beatBattles({ answered: ['atreides', 'emperor'], closesAt: 61_000 })
  check('an expired beat two-of-three answered still offers the push',
    [/data-beat-push/.test(drawBeat(twoOfThree, { beatEligible: 3 })),
      /data-beat-push/.test(drawBeat(twoOfThree, { beatEligible: 2 }))],
    [true, false])

  // ── the screen's wiring ─────────────────────────────────────────────────
  const screen9 = readFileSync('src/components/dune/DuneGameScreen.tsx', 'utf8')
  check('the screen computes the third chair from public facts alone',
    [/traitorProxy: seat === 'harkonnen' \? hk\?\.over \?\? null : null,/.test(screen9),
      /beatEligible: hk \? 3 : 2,/.test(screen9)],
    [true, true])
}

// ── advisors do not fight ─────────────────────────────────────────────────
{
  const rows9 = (posture?: string) => [
    { faction: 'harkonnen', territoryId: 'territory-13', sector: 'sector-10', count: 3 },
    { faction: 'bene-gesserit', territoryId: 'territory-13', sector: 'sector-10',
      count: 2, ...(posture ? { posture } : null) },
  ] as never
  check('no battle opens over an advisor — and one does over a fighter',
    [pendingBattles(rows9('advisor'), 'sector-1' as never).length,
      pendingBattles(rows9(), 'sector-1' as never).length],
    [0, 1])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
// ── the allocation window opens on a CHOICE, not on a dial ────────────────
// Found by playing: every battle stopped for a "choose your losses" window,
// including ones where the winner held nothing but ordinary forces and spent
// no spice — where any dial has exactly one way to be paid. The window was
// gated on there being a dial at all, which is a different question from
// there being an answer to pick between.
//
// The fix is not a rule about which factions get asked. Elites and spice are
// only the commonest way to have options; what decides it is how many legal
// allocations exist, and allocationsFor already says.
{
  const plainOnly = { plain: 6, elite: 0 }
  const withElites = { plain: 5, elite: 1 }

  // ORDINARY FORCES, NO SPICE: one way to pay any dial it can pay.
  // Six ordinary at half each pay three and no more, so these are the dials
  // such a winner can actually meet.
  for (const dial of [0.5, 1, 2, 3]) {
    check(`a plain-only winner has one way to pay ${dial}`,
      allocationsFor({ pieces: plainOnly, dial, spice: 0, worth: 1, freeFull: false }).length,
      1)
  }
  // ...AND THE RULEBOOK CASE STILL HAS SEVERAL. The Emperor with one
  // Sardaukar and five ordinary, dialling 3 on 1 spice, may lose the
  // Sardaukar full plus two ordinary at half, or one ordinary full plus four
  // at half — so this must go on asking.
  check('the rulebook Emperor still has a real choice',
    allocationsFor({ pieces: withElites, dial: 3, spice: 1, worth: 2, freeFull: false }).length > 1,
    true)

  // AND THE ENDPOINT ASKS THAT QUESTION rather than counting the dial.
  const fn = code('supabase/functions/dune-action/index.ts')
  const at = fn.indexOf('const winnerChoices')
  check('the endpoint enumerates the winner choices', at > 0, true)
  const gate = fn.slice(at, at + 900)
  check('...from the same enumeration that admitted the plan',
    [gate.includes('allocationsFor({'), gate.includes('piecesInBattle(')],
    [true, true])
  check('...and opens the window only when more than one exists',
    fn.includes('if (winnerChoices.length > 1) {'), true)
  // A SINGLE OPTION IS APPLIED, not discarded and recomputed.
  check('...settling a lone option with that option',
    fn.includes('winnerChoices.length === 1 ? winnerChoices[0] as never : null'), true)
}

process.exit(pass ? 0 : 1)
