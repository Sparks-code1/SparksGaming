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
  BATTLE_VOICE_SECONDS, BATTLE_PRESCIENCE_SECONDS,
  planPlaysTarget, canComplyWithVoice, voiceViolation, judgeVoiceCommand,
  prescienceAnswer,
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
  check('...harvesting the whole territory, bystanders included',
    /if \(outcome\.explosion\) \{\s*[\r\n]+\s*for \(const lift of explosionLosses\(forces as never, c\.territoryId\)\)/.test(beat), true)
  check('...and never lifting the sides twice',
    /const lifts = outcome\.explosion \? \[\] : battleLosses\(/.test(beat), true)
  check('the fought-out phase clears itself',
    /: undefined[\s\S]{0,700}battles: battlesAfter \} : \{ battles: undefined \}/.test(beat), true)

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
  check('the pick opens the Voice when the Bene Gesserit fight',
    /\(aggressor === 'bene-gesserit' \|\| opponent === 'bene-gesserit'\)/.test(pick)
      && /by: 'bene-gesserit', done: false,/.test(pick), true)
  const planCase = fn.slice(fn.indexOf("case 'BATTLE_PLAN'"), fn.indexOf("case 'BATTLE_VOICE'"))
  check('the voiced seat waits for the command',
    /if \(voiceNow && !voiceNow\.done && myFaction !== voiceNow\.by\)/.test(planCase)
      && /code: 'voiced-first',/.test(planCase), true)
  check('...silence past the window declines it',
    /voiceNow = \{ \.\.\.voice, done: true, command: null \}/.test(planCase), true)
  check('...and the judge is handed the command, aimed away from its speaker',
    /voiced: voiceNow\?\.done && voiceNow\.command && myFaction !== voiceNow\.by/.test(planCase), true)
  check('an expired silence is written to the row the foresight reads',
    /battlePlan: \{ territoryId: c\.territoryId, dial: 0 \},/.test(planCase), true)
  check('the question opens when the opponent commits',
    /const presNow = hasAtreides && opponentIn && !pres/.test(planCase), true)
  check('...and the reveal WAITS on it',
    /const mayReveal = allIn && \(!hasAtreides \|\| \(presNow\?\.done \?\? false\)\)/.test(planCase), true)
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

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
