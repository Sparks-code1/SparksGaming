// Resourceful comeback power: expanding into a CITY territory earns the same
// end-of-turn card a conquest would — but never a second card.
import { initialTurnState } from '@/types/game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// ── the two rules the feature is built from ───────────────────────────────

/** Does an uncontested advance onto this territory flag `expandedIntoCity`?
 *  Mirrors handleAdvanceConfirm. */
const flagsCity = (cities: Array<{ isDestroyed?: boolean }>) =>
  cities.some(c => !c.isDestroyed)

/** Does the end-of-turn check award a card? Mirrors handleNextPhase. */
const awards = (power: string | undefined, turn: { expandedIntoCity: boolean; captured: boolean }) =>
  power === 'resourceful' && turn.expandedIntoCity && !turn.captured

const T = (expandedIntoCity: boolean, captured: boolean) => ({ expandedIntoCity, captured })

// ── which expansions flag a city ──────────────────────────────────────────
check('expanding into a minor city flags it', flagsCity([{ isDestroyed: false }]), true)
check('expanding into a major city flags it', flagsCity([{ isDestroyed: false }, { isDestroyed: false }]), true)
check('an empty territory does NOT flag it', flagsCity([]), false)
check('a DESTROYED city does not count', flagsCity([{ isDestroyed: true }]), false)
check('a destroyed city beside a standing one still counts',
  flagsCity([{ isDestroyed: true }, { isDestroyed: false }]), true)

// ── the award rule ────────────────────────────────────────────────────────
check('THE POWER: expanded into a city, conquered nothing -> card',
  awards('resourceful', T(true, false)), true)
check('NOT AN EXTRA CARD: conquered as well -> no second card',
  awards('resourceful', T(true, true)), false)
check('expanded into an empty (city-less) territory -> no card',
  awards('resourceful', T(false, false)), false)
check('quiet turn — no expansion, no conquest -> no card',
  awards('resourceful', T(false, false)), false)

// ── only this power, only its holder ──────────────────────────────────────
check('a player without the power gets nothing', awards(undefined, T(true, false)), false)
check('a different comeback power does not trigger it', awards('expand', T(true, false)), false)

// ── turn state plumbing ───────────────────────────────────────────────────
{
  const fresh = initialTurnState()
  check('a fresh turn starts with the flag clear', fresh.expandedIntoCity, false)
  check('...and the flag is JSON-safe for persistence',
    JSON.parse(JSON.stringify(fresh)).expandedIntoCity, false)
}
{
  // Old saves predate the field; the restore path merges over defaults.
  const oldSave: any = { captured: true, captureCount: 2, conqueredIds: [], conqueredViaSeaIds: [],
                         bearTrapTerritoryId: null, attackedTerritoryIds: [], shieldedTerritoryIds: [] }
  const restored = { ...initialTurnState(), ...oldSave }
  check('restoring a save from before this power defaults the flag to false',
    restored.expandedIntoCity, false)
  check('...without clobbering the saved fields', restored.captureCount, 2)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
