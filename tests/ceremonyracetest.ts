// The end-of-game ceremony is the one moment two machines are guaranteed to
// write the campaign within seconds of each other: the winner records their
// signature, major city and fortification; each runner-up then records a
// minor city and a card upgrade; the winner's machine finally carries the
// campaign into the next game.
//
// The first live run lost almost all of it â€” one city survived, no signature,
// no fortification, no major city, and the campaign still said "Game 1". The
// refusal protocol was doing its job (a stale write was refused) but the
// ceremony's writes carried no way to rebuild themselves, so the loser simply
// adopted the winner's copy and its own rewards evaporated.
//
// These asserts pin the rebuild, against the real merge used by both reward
// screens.
import { mergeLegacyEdits, reapplyLegacyEdits } from '@/lib/gameLogic'
import type { LegacyState } from '@/types/legacy'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const sticker = (name: string, kind: string) => ({
  id: name, name, description: kind, placement: 'territory' as const,
  targetId: name, appliedInGame: 1,
})

const base = (): LegacyState => ({
  campaignId: 'c1', worldName: 'W', currentGameNumber: 1,
  historyLog: [], stickers: [], scars: [], dealtScars: [],
  removedCardIds: [], continentBonusModifiers: [], purchasedStars: {},
  victoryLog: [],
} as never)

/** The campaigns row: CAS, plus the re-apply protocol on a refusal. */
function fakeRow(initial: LegacyState) {
  let version = 1
  let value = initial
  return {
    get version() { return version },
    get value() { return value },
    save(expected: number, next: LegacyState, reapply?: (fresh: LegacyState) => LegacyState) {
      if (expected === version) { version += 1; value = next; return { ok: true, version, adopt: next } }
      if (reapply) { const merged = reapply(value); version += 1; value = merged; return { ok: true, version, adopt: merged } }
      return { ok: false, version, adopt: value }
    },
  }
}

const cityNames = (s: LegacyState) => s.stickers.map(x => x.name).sort()
const signed = (s: LegacyState) => (s.victoryLog ?? []).map(v => v.winnerName)

// â”€â”€â”€ 1. The loss, as it happened â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('--- without a rebuild, the winner\'s whole slice is lost ---')
{
  const row = fakeRow(base())
  const winnerBaseline = row.value
  const testBaseline = row.value

  // Ryan's win screen: signature, major city, fortification.
  const winnerEdited: LegacyState = {
    ...winnerBaseline,
    stickers: [sticker('Ryanopolis', 'city:major'), sticker('Ryanopolis-fort', 'fortification:10')],
    victoryLog: [{ gameNumber: 1, winnerName: 'Ryan', winnerPlayerId: 'p1', factionId: 'khan', winCondition: 'mission' }] as never,
  }
  // test's machine wrote first (its own bookkeeping), so Ryan's save is stale.
  row.save(row.version, { ...row.value, worldName: 'W2' })

  const refused = row.save(1, mergeLegacyEdits(winnerBaseline, winnerBaseline, winnerEdited))
  check('the stale write is refused', refused.ok, false)
  check('and the signature never landed', signed(row.value), [])

  // The runner-up then writes its city from the copy it holds.
  const testEdited: LegacyState = { ...testBaseline, stickers: [sticker('Testburg', 'city:minor')] }
  row.save(refused.version, mergeLegacyEdits(refused.adopt, testBaseline, testEdited))
  check('exactly one city survives â€” the reported bug', cityNames(row.value), ['Testburg'])
}

// â”€â”€â”€ 2. With the rebuild â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('\n--- re-applying the diff keeps every reward ---')
{
  const row = fakeRow(base())
  const winnerBaseline = row.value
  const winnerEdited: LegacyState = {
    ...winnerBaseline,
    stickers: [sticker('Ryanopolis', 'city:major'), sticker('Ryanopolis-fort', 'fortification:10')],
    victoryLog: [{ gameNumber: 1, winnerName: 'Ryan', winnerPlayerId: 'p1', factionId: 'khan', winCondition: 'mission' }] as never,
  }
  const applyWinner = (b: LegacyState) => reapplyLegacyEdits(b, winnerBaseline, winnerEdited)

  row.save(row.version, { ...row.value, worldName: 'W2' })          // someone else, first
  const res = row.save(1, applyWinner(winnerBaseline), applyWinner)
  check('the rebuilt write is accepted', res.ok, true)
  check('the signature is on the board', signed(row.value), ['Ryan'])
  check('the major city and fortification are there',
    cityNames(row.value), ['Ryanopolis', 'Ryanopolis-fort'])
  check("the other machine's edit was not trampled", row.value.worldName, 'W2')

  // Now the runner-up, from a copy read BEFORE the winner's write landed.
  const staleBaseline = base()
  const testEdited: LegacyState = { ...staleBaseline, stickers: [sticker('Testburg', 'city:minor')] }
  const applyRunnerUp = (b: LegacyState) => reapplyLegacyEdits(b, staleBaseline, testEdited)
  row.save(1, applyRunnerUp(staleBaseline), applyRunnerUp)
  check('the minor city lands too', cityNames(row.value).includes('Testburg'), true)
  check("and it did NOT erase the winner's rewards",
    cityNames(row.value), ['Ryanopolis', 'Ryanopolis-fort', 'Testburg'])
  check('the signature is still there', signed(row.value), ['Ryan'])
}

// â”€â”€â”€ 3. Finalize is idempotent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('\n--- carrying the campaign forward cannot happen twice ---')
{
  // Mirrors applyFinalize's guard: a base already past this game is untouched,
  // so a re-applied finalize can never double-bump or double-charge missiles.
  const gameNumber = 1
  const applyFinalize = (b: LegacyState): LegacyState => {
    if (b.currentGameNumber !== gameNumber) return b
    return { ...b, currentGameNumber: b.currentGameNumber + 1, purchasedStars: {}, gameInProgress: false }
  }
  const once = applyFinalize(base())
  check('the campaign advances a game', once.currentGameNumber, 2)
  const twice = applyFinalize(once)
  check('applying it again changes nothing', twice.currentGameNumber, 2)
  check('and it is the same object', twice === once, true)
}

// â”€â”€â”€ 4. The DEFAULT rebuild, for writes that never asked for one â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('\n--- an ordinary append survives without naming a rebuild ---')
{
  // What performSave now does when a write is refused and the caller gave no
  // `reapply`: replay the diff between the copy this client last agreed with
  // and the write it attempted, onto the winner's copy. Scars are the case
  // that reported it â€” one placed on each machine, one surviving.
  const row = fakeRow(base())
  const knownToTest = row.value                     // both machines read v1

  // The host places theirs first.
  const hostScar = { ...row.value, scars: [{ territoryId: 'ukraine', type: 'bunker', appliedInGame: 1 }] as never }
  row.save(row.version, hostScar)

  // test's write was built on v1 and is refused; the default rebuild replays
  // only what test changed.
  const testScar: LegacyState = {
    ...knownToTest,
    scars: [{ territoryId: 'brazil', type: 'bunker', appliedInGame: 1 }] as never,
  }
  const defaultRebuild = (f: LegacyState) => reapplyLegacyEdits(f, knownToTest, testScar)
  const res = row.save(1, testScar, defaultRebuild)
  check('the rebuilt write is accepted', res.ok, true)
  check('both scars are on the board',
    (row.value.scars ?? []).map(s => s.territoryId).sort(), ['brazil', 'ukraine'])
}

// ─── 4. A MAP is not one value; it is one value per player ──────────────────
//
// The list merge above was written because two machines grow `scars` at once.
// Seventeen LegacyState fields are Record<string, …> — missiles, purchasedStars,
// playerWins, cardResources, comebackPowers, missilePowers, activeGameCards and
// the rest — and those were still taken WHOLESALE: the rebuild replayed a map
// built from whatever the losing machine happened to be holding, so every key
// the winner had just written was destroyed. Two players spending a missile in
// the same window is two keys of one map, and one of them was going home.
console.log('--- two machines writing different keys of one map ---')
{
  const row = fakeRow({ ...base(), missiles: { p1: 3, p2: 3 } } as LegacyState)
  const knownToTest = row.value                     // both machines read v1

  // The host spends p1's missile and lands first.
  row.save(row.version, { ...row.value, missiles: { p1: 2, p2: 3 } } as LegacyState)

  // test's machine spent p2's, computed against v1 — so its map still says
  // p1: 3, and taking it whole would hand the host their missile back.
  const testSpend = { ...knownToTest, missiles: { p1: 3, p2: 2 } } as LegacyState
  const rebuild = (f: LegacyState) => reapplyLegacyEdits(f, knownToTest, testSpend)
  const res = row.save(1, testSpend, rebuild)
  check('the rebuilt write is accepted', res.ok, true)
  check('both spends survive — neither player is refunded',
    row.value.missiles, { p1: 2, p2: 2 })
}

console.log('--- and a key one machine deleted stays deleted ---')
{
  const row = fakeRow({ ...base(), comebackPowers: { p1: 'aggressive' } } as LegacyState)
  const known = row.value
  row.save(row.version, { ...row.value, comebackPowers: { p1: 'aggressive', p2: 'resourceful' } } as LegacyState)

  // This machine cleared p1's power. A merge that only ADDED keys would resurrect it.
  const cleared = { ...known, comebackPowers: {} } as LegacyState
  const res = row.save(1, cleared, (f: LegacyState) => reapplyLegacyEdits(f, known, cleared))
  check('the rebuilt write is accepted', res.ok, true)
  check("p1's power is gone and p2's is untouched",
    row.value.comebackPowers, { p2: 'resourceful' })
}

console.log('--- null is a value, not an empty map ---')
{
  // activeGameCards is null between games, and that is a statement. Merging it
  // key-by-key would turn "no card block" into "the winner's card block".
  const row = fakeRow({ ...base(), activeGameCards: { missionDeck: ['m1'] } } as never)
  const known = row.value
  row.save(row.version, { ...row.value, activeGameCards: { missionDeck: ['m2'] } } as never)
  const ended = { ...known, activeGameCards: null } as LegacyState
  row.save(1, ended, (f: LegacyState) => reapplyLegacyEdits(f, known, ended))
  check('clearing the card block still clears it', row.value.activeGameCards, null)
}

console.log(pass ? '\nceremonyracetest: all passed' : '\nceremonyracetest: FAILURES PRESENT')
if (!pass) process.exit(1)
