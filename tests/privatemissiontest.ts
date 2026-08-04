// Private missions: 6 sealed missions unlocked when the World Capital is placed.
import { checkMission, wholeContinentsControlled } from '@/lib/missionLogic'
import { PRIVATE_MISSION_CARDS, PRIVATE_MISSION_IDS, isPrivateMission, seedPrivateMissions, CARD_LOOKUP }
  from '@/data/cards'
import { initialTurnState } from '@/types/game'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const T = (id: string, continentId: string, owner: string | null, extra: any = {}) => ({
  id, name: id, continentId, occupyingPlayerId: owner, troops: 2,
  scars: [], cities: [], adjacentIds: [], ...extra,
})
const city = (isMajor: boolean) => ({ name: 'c', isMajor, isDestroyed: false })

/** Run checkMission with a synthetic turn state / board. */
const run = (missionId: string, territories: any, turn: any = {}, wcId: string | null = null) =>
  checkMission(missionId, 'me', territories, { turn: { ...initialTurnState(), ...turn } } as any,
    { conqueredIds: [], conqueredViaSeaIds: [] }, 99, { worldCapitalTerritoryId: wcId })

const EMPTY = { a: T('a', 'asia', 'me') }

// ── all 6 exist and are wired into the lookup ─────────────────────────────
check('6 private missions defined', PRIVATE_MISSION_CARDS.length, 6)
check('each awards 1 star and is destroyed on completion',
  PRIVATE_MISSION_CARDS.every(m => m.stars === 1 && m.singleUse), true)
check('all are registered in CARD_LOOKUP',
  PRIVATE_MISSION_IDS.every(id => !!CARD_LOOKUP.get(id)), true)
check('isPrivateMission distinguishes them',
  [isPrivateMission('pm-wide-border'), isPrivateMission('mc-6-cities')], [true, false])

// ── 1. Advanced Tactics: 2+ territory cards worth 4+ resources each ───────
check('Advanced Tactics: 2 rich cards traded -> complete',
  run('pm-advanced-tactics', EMPTY, { richCardsTradedIn: 2 }), true)
check('Advanced Tactics: only 1 rich card -> not complete',
  run('pm-advanced-tactics', EMPTY, { richCardsTradedIn: 1 }), false)
check('Advanced Tactics: nothing traded -> not complete',
  run('pm-advanced-tactics', EMPTY, {}), false)

// ── 2. Advanced Training: 10+ resources turned in ────────────────────────
check('Advanced Training: 10 resources -> complete',
  run('pm-advanced-training', EMPTY, { resourcesTradedIn: 10 }), true)
check('Advanced Training: 9 resources -> not complete',
  run('pm-advanced-training', EMPTY, { resourcesTradedIn: 9 }), false)

// ── 3. Forced Occupation: knocked out a player holding a 3+ resource card ─
check('Forced Occupation: rich player knocked out -> complete',
  run('pm-forced-occupation', EMPTY, { knockedOutRichPlayer: true }), true)
check('Forced Occupation: no such knockout -> not complete',
  run('pm-forced-occupation', EMPTY, {}), false)

// ── 4. Guerrilla Warfare: control every Bunker + Mercenary territory ──────
{
  const bunker = (owner: string | null) => T('b', 'asia', owner, { scars: [{ type: 'fortified' }] })
  const merc   = (owner: string | null) => T('m', 'europe', owner, { scars: [{ type: 'mercenary' }] })
  check('Guerrilla: holds every bunker + mercenary -> complete',
    run('pm-guerrilla-warfare', { b: bunker('me'), m: merc('me'), x: T('x', 'asia', 'enemy') }), true)
  check('Guerrilla: one mercenary held by an enemy -> not complete',
    run('pm-guerrilla-warfare', { b: bunker('me'), m: merc('enemy') }), false)
  check('Guerrilla: NO scarred territories exist -> not complete (not vacuously true)',
    run('pm-guerrilla-warfare', EMPTY), false)
}

// ── 5. Urban Troop Surge: the World Capital AND 3 separate major cities ───
{
  const board = (majors: number, wcOwner: string | null) => {
    const t: any = { wc: T('wc', 'asia', wcOwner, { cities: [city(true)] }) }
    for (let i = 0; i < majors; i++) t['m' + i] = T('m' + i, 'europe', 'me', { cities: [city(true)] })
    return t
  }
  check('Urban Surge: WC + 3 majors -> complete',
    run('pm-urban-troop-surge', board(3, 'me'), {}, 'wc'), true)
  check('Urban Surge: WC + only 2 majors -> not complete (WC does NOT count as one)',
    run('pm-urban-troop-surge', board(2, 'me'), {}, 'wc'), false)
  check('Urban Surge: 3 majors but WC held by an enemy -> not complete',
    run('pm-urban-troop-surge', board(3, 'enemy'), {}, 'wc'), false)
  check('Urban Surge: World Capital not placed yet -> not complete',
    run('pm-urban-troop-surge', board(3, 'me'), {}, null), false)
  check('Urban Surge: minor cities do not count',
    run('pm-urban-troop-surge', {
      wc: T('wc', 'asia', 'me', { cities: [city(true)] }),
      a: T('a', 'europe', 'me', { cities: [city(false), city(false), city(false)] }),
    }, {}, 'wc'), false)
}

// ── 6. Wide Border: 2 whole continents at the START of your turn ──────────
check('Wide Border: 2 continents at turn start -> complete',
  run('pm-wide-border', EMPTY, { continentsAtTurnStart: 2 }), true)
check('Wide Border: only 1 at turn start -> not complete',
  run('pm-wide-border', EMPTY, { continentsAtTurnStart: 1 }), false)

// the snapshot helper itself, against the real continent sizes
{
  const all: any = {}
  for (const d of TERRITORY_DEFINITIONS) all[d.id] = T(d.id, d.continentId, 'enemy')
  check('wholeContinentsControlled: none', wholeContinentsControlled('me', all), 0)
  for (const d of TERRITORY_DEFINITIONS) {
    if (d.continentId === 'australia' || d.continentId === 'south-america') all[d.id].occupyingPlayerId = 'me'
  }
  check('wholeContinentsControlled: Australia + South America = 2',
    wholeContinentsControlled('me', all), 2)
  // Drop one territory -> that continent no longer counts
  const oneShort = { ...all }
  const auId = TERRITORY_DEFINITIONS.find(d => d.continentId === 'australia')!.id
  oneShort[auId] = { ...oneShort[auId], occupyingPlayerId: 'enemy' }
  check('wholeContinentsControlled: one territory short drops to 1',
    wholeContinentsControlled('me', oneShort), 1)
}

// ── seeding into the deck on World Capital placement ─────────────────────
{
  const base = ['mc-6-cities', 'mc-4-sea-turn']
  const seeded = seedPrivateMissions(base, [], 'g2:brazil')
  check('all 6 private missions shuffled into the existing deck', seeded.length, 8)
  check('standard missions survive the shuffle',
    base.every(id => seeded.includes(id)), true)
  check('deterministic — same seed gives the same order',
    seedPrivateMissions(base, [], 'g2:brazil'), seeded)
  const withDestroyed = seedPrivateMissions(base, ['pm-wide-border', 'pm-advanced-tactics'], 'g2:brazil')
  check('already-claimed private missions are never re-added', withDestroyed.length, 6)
  check('...and specifically excluded',
    withDestroyed.includes('pm-wide-border') || withDestroyed.includes('pm-advanced-tactics'), false)
  check('re-seeding an already-seeded deck adds nothing',
    seedPrivateMissions(seeded, [], 'g2:brazil').length, 8)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// ── Aliens / Mutants are excluded from taking a star power ────────────────
import { canClaimStarPower, STAR_POWER_EXCLUDED_FACTIONS }
  from '@/data/cards'

console.log('\n--- star power exclusions ---')
let pass2 = true
const check2 = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass2 = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
check2('Aliens cannot claim a star power', canClaimStarPower('aliens'), false)
check2('Mutants cannot claim a star power', canClaimStarPower('mutants'), false)
check2('the 5 base factions all can', [
  'khan-industries','enclave-of-the-bear','imperial-balkania','saharan-republic','die-mechaniker',
].map(canClaimStarPower), [true, true, true, true, true])
check2('exactly two factions are excluded', STAR_POWER_EXCLUDED_FACTIONS.size, 2)

// The completion branch: claim vs recycle, mirroring completeSharedMissionIfEarned
const outcome = (factionId: string, missionId: string) => {
  const isPriv = isPrivateMission(missionId)
  const claims = isPriv && canClaimStarPower(factionId)
  const recycles = isPriv && !claims
  return { claims, recycles, destroyed: isPriv && !recycles }
}
check2('Khan completing a private mission -> claims power, card destroyed',
  outcome('khan-industries', 'pm-wide-border'), { claims: true, recycles: false, destroyed: true })
check2('Aliens completing it -> NO power, card recycled, NOT destroyed',
  outcome('aliens', 'pm-wide-border'), { claims: false, recycles: true, destroyed: false })
check2('Mutants completing it -> NO power, card recycled, NOT destroyed',
  outcome('mutants', 'pm-wide-border'), { claims: false, recycles: true, destroyed: false })
check2('a STANDARD mission is unaffected for everyone',
  [outcome('aliens', 'mc-6-cities'), outcome('khan-industries', 'mc-6-cities')],
  [{ claims: false, recycles: false, destroyed: false },
   { claims: false, recycles: false, destroyed: false }])

console.log(pass2 ? '\nEXCLUSIONS ALL PASS' : '\nEXCLUSION FAILURES')

// ─── Private missions survive into later games ────────────────────────────────
//
// They are shuffled into the LIVE deck when the World Capital is placed, and
// `privateMissionsSeeded` then blocks that from happening twice. But each new
// game rebuilds the deck from buildMissionDeck, which only knew about the 8
// standard missions — so the private missions appeared for the rest of one game
// and silently left the campaign at the next new game. That is exactly what
// happened here: seeded in Game 5, absent from Game 6 onward, never claimed.
import { buildMissionDeck, MISSION_CARDS }
  from '@/data/cards'

let pass3 = true
const check3 = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass3 = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const privCount = (deck: string[]) => deck.filter(isPrivateMission).length
const SEED = 12345

// The real campaign: double-winner reached, World Capital on Brazil, two
// standard missions retired, no private mission ever claimed.
const live = {
  doubleWinnerMilestoneTriggered: true,
  destroyedMissionIds: ['mc-world-capital', 'mc-7-islands'],
  privateMissionsSeeded: true,
}

check3('the campaign deck now carries all 6 private missions',
  privCount(buildMissionDeck(SEED, live)), 6)
check3('and still every standard mission that is left',
  buildMissionDeck(SEED, live).filter(id => !isPrivateMission(id)).length,
  MISSION_CARDS.length - 2)
check3('12 cards in total — 6 standard left plus the 6 private',
  buildMissionDeck(SEED, live).length, MISSION_CARDS.length - 2 + 6)
check3('the retired standard missions stay retired',
  buildMissionDeck(SEED, live).filter(id => live.destroyedMissionIds.includes(id)), [])

// Before the World Capital is placed they must NOT appear.
check3('unseeded campaigns get no private missions',
  privCount(buildMissionDeck(SEED, { ...live, privateMissionsSeeded: false })), 0)
check3('...and that was the OLD behaviour for every game',
  privCount(buildMissionDeck(SEED, { doubleWinnerMilestoneTriggered: true,
    destroyedMissionIds: live.destroyedMissionIds })), 0)

// A claimed private mission is recorded in destroyedMissionIds, so the same
// filter that retires a used single-use mission keeps it out for good.
const afterClaim = { ...live, destroyedMissionIds: [...live.destroyedMissionIds, 'pm-wide-border'] }
check3('a claimed private mission never comes back',
  buildMissionDeck(SEED, afterClaim).includes('pm-wide-border'), false)
check3('the other five still do', privCount(buildMissionDeck(SEED, afterClaim)), 5)
check3('all six claimed leaves only standard cards',
  privCount(buildMissionDeck(SEED, { ...live, destroyedMissionIds: [...live.destroyedMissionIds, ...PRIVATE_MISSION_IDS] })), 0)

// Missions are gated on the double-winner milestone regardless.
check3('no milestone means no deck at all',
  buildMissionDeck(SEED, { ...live, doubleWinnerMilestoneTriggered: false }), [])

// Deterministic: the same seed deals the same deck, so a reload cannot reshuffle.
check3('the deal is reproducible',
  buildMissionDeck(SEED, live), buildMissionDeck(SEED, live))
check3('a different seed orders it differently',
  JSON.stringify(buildMissionDeck(SEED, live)) === JSON.stringify(buildMissionDeck(SEED + 1, live)), false)
check3('no duplicates', new Set(buildMissionDeck(SEED, live)).size, buildMissionDeck(SEED, live).length)

console.log(pass3 ? '\nCARRY-FORWARD ALL PASS' : '\nCARRY-FORWARD FAILURES')

// This suite used to end without an exit code, so a failure printed and the
// runner still counted it green.
process.exit(pass && pass2 && pass3 ? 0 : 1)
