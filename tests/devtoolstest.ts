// Dev scaffolding: the clock reset, the grant, and the battle seed.
//
// WHY THIS EXISTS. Playtesting needs to reach positions and re-run windows
// without playing whole matches, and the tools that make that possible are
// exactly the tools that must never reach a real table: each is gated by the
// same dev switch as seeding, wired into the harness alone, and the real
// match screen is pinned to know nothing of them. The reset's semantics live
// in the shared library so a reset window is indistinguishable from a fresh
// one — each window gets its OWN full length, never a shared guess.
import { readFileSync } from 'node:fs'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { resetDeadlines, PHASE_SECONDS } from '@/lib/dune/phaseAdvance'
import { SHIPMENT_SECONDS } from '@/lib/dune/shipment'
import { BID_SECONDS } from '@/lib/dune/bidding'
import { CHARITY_WINDOW_MS } from '@/lib/dune/charity'
import { WORM_SECONDS } from '@/lib/dune/spiceBlow'
import { SETUP_SECONDS } from '@/lib/dune/setup'
import {
  BATTLE_PICK_SECONDS, BATTLE_PLAN_SECONDS, BATTLE_TRAITOR_SECONDS,
} from '@/lib/dune/battle'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const NOW = 1_000_000
const LENGTHS = {
  setupSeconds: SETUP_SECONDS,
  charityMs: CHARITY_WINDOW_MS,
  wormSeconds: WORM_SECONDS,
  bidSeconds: BID_SECONDS,
  shipmentSeconds: SHIPMENT_SECONDS,
  battlePickSeconds: BATTLE_PICK_SECONDS,
  battlePlanSeconds: BATTLE_PLAN_SECONDS,
  battleTraitorSeconds: BATTLE_TRAITOR_SECONDS,
}
const base = {
  phase: 'Storm', turn: 2, mode: 'basic', storm: 'sector-3',
  shieldWall: 'intact', forces: [], players: [],
} as never

// ── each window gets its own full length ──────────────────────────────────
{
  const shipping = resetDeadlines({
    ...(base as object),
    shipping: { closesAt: 5 },
    phaseClock: { turn: 2, phase: 'Shipment and Movement', closesAt: 5 },
  } as never, NOW, LENGTHS)
  check('an expired shipping clock is re-stamped at its own length',
    (shipping.patch.shipping as { closesAt: number }).closesAt,
    NOW + SHIPMENT_SECONDS * 1000)
  check('...and the look-window with it',
    [(shipping.patch.phaseClock as { closesAt: number }).closesAt, shipping.reset],
    [NOW + PHASE_SECONDS * 1000, ['shipping', 'phase-clock']])

  check('charity in its milliseconds',
    (resetDeadlines({ ...(base as object), charity: { expiresAt: 5, turn: 2 } } as never,
      NOW, LENGTHS).patch.charity as { expiresAt: number }).expiresAt,
    NOW + CHARITY_WINDOW_MS)
  check('the worm pause at its minute',
    (resetDeadlines({ ...(base as object), spiceBlow: { closesAt: 5 } } as never,
      NOW, LENGTHS).patch.spiceBlow as { closesAt: number }).closesAt,
    NOW + WORM_SECONDS * 1000)
  check('a live bid at the bid clock',
    (resetDeadlines({ ...(base as object), auction: { status: 'awaiting', closesAt: 5 } } as never,
      NOW, LENGTHS).patch.auction as { closesAt: number }).closesAt,
    NOW + BID_SECONDS * 1000)
  check('...but a settled auction resets nothing',
    resetDeadlines({ ...(base as object), auction: { status: 'settled' } } as never,
      NOW, LENGTHS).reset, [])
  check('setup at its seven minutes',
    (resetDeadlines({ ...(base as object), setup: { closesAt: 5 } } as never,
      NOW, LENGTHS).patch.setup as { closesAt: number }).closesAt,
    NOW + SETUP_SECONDS * 1000)

  // THE BATTLES: whichever window is LIVE, one at a time.
  const pick = resetDeadlines({
    ...(base as object),
    battles: { closesAt: 5, current: null },
  } as never, NOW, LENGTHS)
  check('an aggressor\'s pick at the pick clock',
    [(pick.patch.battles as { closesAt: number }).closesAt, pick.reset],
    [NOW + BATTLE_PICK_SECONDS * 1000, ['battle-pick']])
  const plan = resetDeadlines({
    ...(base as object),
    battles: { closesAt: 5, current: { closesAt: 5 } },
  } as never, NOW, LENGTHS)
  check('an open battle\'s plans at their five minutes',
    [(plan.patch.battles as { current: { closesAt: number } }).current.closesAt, plan.reset],
    [NOW + BATTLE_PLAN_SECONDS * 1000, ['battle-plan']])
  const beat = resetDeadlines({
    ...(base as object),
    battles: {
      closesAt: 5,
      current: { closesAt: 5, revealed: { traitor: { closesAt: 5 } } },
    },
  } as never, NOW, LENGTHS)
  check('a revealed battle\'s traitor beat at its minute',
    [(beat.patch.battles as {
      current: { revealed: { traitor: { closesAt: number } } }
    }).current.revealed.traitor.closesAt, beat.reset],
    [NOW + BATTLE_TRAITOR_SECONDS * 1000, ['traitor-beat']])

  check('a state with no clock resets nothing',
    resetDeadlines(base, NOW, LENGTHS).reset, [])
}

// ── the server slice ──────────────────────────────────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const reset = fn.slice(fn.indexOf("case 'RESET_CLOCK'"), fn.indexOf("case 'DEV_GRANT'"))
  check('the reset is dev-gated',
    /if \(Deno\.env\.get\('DUNE_DEV_SEEDING'\) !== 'on'\) \{/.test(reset), true)
  check('...and rides the shared semantics',
    /resetDeadlines\(state as never, now, \{/.test(reset), true)
  check('...refusing a state with no clock',
    /code: 'no-clock'/.test(reset), true)

  const grant = fn.slice(fn.indexOf("case 'DEV_GRANT'"), fn.indexOf("case 'SEED_SPICE'"))
  check('the grant is dev-gated too',
    /if \(Deno\.env\.get\('DUNE_DEV_SEEDING'\) !== 'on'\) \{/.test(grant), true)
  check('...lands granted forces like any arrival',
    /forces = landForces\(/.test(grant), true)
  check('...banks granted leaders through the revival cycle',
    /returnLeaderToTanks\(\s*[\r\n]+\s*tanks, myFaction as never, name,\s*[\r\n]+\s*\{ wasRevived: revived\.includes\(name\) \}/.test(grant), true)
  check('...keeps the public hand count honest',
    /handCount: p\.handCount \+ giveCards\.length,/.test(grant), true)
  check('...and withdraws a granted card from the deck it exists in',
    /const i = pile\.indexOf\(id\)/.test(grant)
      && /p_decks: grantDecks,/.test(grant), true)

  // AN EXHAUSTED DECK DEGRADES, NEVER DEADLOCKS: the row is as long as the
  // cards that exist, and a deck with none skips the phase outright.
  const auction = fn.slice(fn.indexOf('const openTheAuction'), fn.indexOf("case 'OPEN_CHARITY'"))
  check('the auction offers only what exists',
    /const offered = Math\.min\(count, available\)/.test(auction), true)
  check('...capping the row at the deck\'s truth',
    /cardCap: offered,/.test(auction), true)
  check('...and a dry deck skips the phase, not the turn',
    /if \(offered === 0\) \{/.test(auction)
      && /reason: 'deck-exhausted'/.test(auction), true)
  check('...and refuses an empty grant',
    /code: 'nothing-asked'/.test(grant), true)
}

// ── harness-only, by pin ──────────────────────────────────────────────────
{
  const harness = code('src/components/dune/DuneMultiSeatView.tsx')
  check('the harness offers the reset',
    /send\(mine, 'RESET_CLOCK', \{\}, 'reset the phase clock\.'\)/.test(harness), true)
  check('...and the grant, on the selected seat',
    [/send\(mine, 'DEV_GRANT', \{ spice: grantSpice \}/.test(harness),
      /send\(mine, 'DEV_GRANT', \{ tankLeaders: \[grantLeader\] \}/.test(harness),
      /territoryId: grantTerritory, sector, count: grantCount,/.test(harness)],
    [true, true, true])

  // THE REAL SCREEN KNOWS NOTHING OF EITHER. A dev tool on the surface real
  // players hold is a dev tool one mis-click from a real match.
  const match = code('src/components/dune/DuneMatchScreen.tsx')
  check('the real match screen never posts a reset',
    /RESET_CLOCK/.test(match), false)
  check('...nor a grant', /DEV_GRANT/.test(match), false)

  // THE SWITCHER CLEARS THE CHAT INPUT: pinned at 10 it sat exactly on the
  // box people type in.
  const switcher = code('src/components/dune/DevSeatSwitcher.tsx')
  check('the seat switcher rides above the chat input',
    /bottom: 62,/.test(switcher), true)
}

// ── the seed script reaches the battle phase ──────────────────────────────
{
  const seed = readFileSync('scripts/seed-dune-match.mjs', 'utf8')
  check('--phase=battle is a fixture now',
    /const PHASES = \['charity', 'blow', 'bidding', 'battle'\]/.test(seed), true)
  // THE ROTATION IS THE STORM'S, computed by the same bundles the server
  // runs — a seed that hardcoded seat order started with the wrong
  // aggressor and walked the wrong way round the board.
  check('...its rotation walked by the server\'s own stormOrder',
    /from '\.\.\/supabase\/functions\/_shared\/dunePhase\.gen\.ts'/.test(seed)
      && /const order = stormOrder\('sector-18', publicPlayers\(seats\)\)/.test(seed), true)
  check('...and its first aggressor found by the same walk',
    /nextAggressor\(order, pendingBattles\(BATTLE_FORCES, 'sector-18'\), 0\)/.test(seed), true)
  check('...seeding the Battles phase with the aggressor picking',
    /phase: 'Battles', turn: 3/.test(seed) && /current: null, fought: \[\], usedLeaders: \{\},/.test(seed), true)
  check('...hand counts derived from the dealt hands, never guessed',
    /handCount: \(BATTLE_HANDS\[p\.faction\] \?\? \[\]\)\.length,/.test(seed), true)
  check('...and traitors crossed so the beat is testable',
    /traitors: BATTLE_TRAITORS\[s\.faction\] \?\? \[\],/.test(seed), true)

  // THE FIXTURE OBEYS THE STRONGHOLD CAP. A stronghold holds at most two
  // factions — the shipping and movement gates enforce it in play — so a
  // seeded position with three in one is a position play cannot reach, and
  // whatever it proves proves nothing. The forces array is read out of the
  // script and swept for real, so an edited fixture is re-judged.
  const forcesMatch = seed.match(/const BATTLE_FORCES = (\[[\s\S]*?\n\])/)
  check('the battle fixture is extractable for judging', !!forcesMatch, true)
  const fixtureForces = new Function(`return ${forcesMatch![1]}`)() as {
    faction: string; territoryId: string
  }[]
  const overfull = DUNE_TERRITORIES
    .filter(t => t.stronghold)
    .map(t => ({
      id: t.id,
      factions: [...new Set(fixtureForces
        .filter(x => x.territoryId === t.id).map(x => x.faction))],
    }))
    .filter(x => x.factions.length > 2)
  check('...and no seeded stronghold holds more than two factions', overfull, [])

  // THE ECONOMY STAYS CLOSED. The battle fixture deals hands, so the deck
  // must hold the printed set minus exactly those cards — dealt without
  // stocking, a later Bidding asked the store for cards that did not exist
  // and deadlocked the turn.
  check('the battle seed stocks the deck it dealt from',
    /const pile = \[\.\.\.treacheryIds\(\)\]/.test(seed)
      && /for \(const id of Object\.values\(BATTLE_HANDS\)\.flat\(\)\)/.test(seed)
      && /deck: 'treachery', cards: pile,/.test(seed), true)
  check('...the three-sider standing on open sand instead',
    [...new Set(fixtureForces
      .filter(x => x.territoryId === 'territory-22').map(x => x.faction))].length, 3)

  // THE DEAL'S OWN INVARIANT: one kept traitor per faction, FOUR for the
  // Harkonnen — the fixture must leave nobody traitor-less, because a
  // playtest that meets an empty traitor row reads it as a broken deal.
  const traitorsMatch = seed.match(/const BATTLE_TRAITORS = (\{[\s\S]*?\n\})/)
  check('the battle traitors are extractable for judging', !!traitorsMatch, true)
  const fixtureTraitors = new Function(`return ${traitorsMatch![1]}`)() as
    Record<string, string[]>
  check('...every faction keeps at least one',
    ['atreides', 'harkonnen', 'emperor', 'fremen', 'bene-gesserit', 'spacing-guild']
      .filter(f => (fixtureTraitors[f] ?? []).length < 1), [])
  check('...and the Harkonnen their four',
    (fixtureTraitors.harkonnen ?? []).length, 4)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
