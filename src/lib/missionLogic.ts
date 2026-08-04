import type { Territory } from '@/types/territory'
import type { GameState } from '@/types/game'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'
import { ISLAND_TERRITORY_IDS } from '@/data/seaLines'
import { totalContinentBonus, continentsHeldInFull, countCitiesOn, livingCities } from '@/lib/gameLogic'

const CONTINENT_SIZES: Record<string, number> = TERRITORY_DEFINITIONS.reduce(
  (acc, d) => ({ ...acc, [d.continentId]: (acc[d.continentId] ?? 0) + 1 }),
  {} as Record<string, number>,
)

export interface TurnConquestState {
  /** Territory IDs taken by combat this turn (not empty-territory advances) */
  conqueredIds: string[]
  /** Territory IDs taken by combat this turn that were attacked across a sea line */
  conqueredViaSeaIds: string[]
}

/**
 * Check whether the player has completed their active mission.
 * Called after every combat capture and at the end of attack phase.
 */
export function checkMission(
  missionId: string,
  playerId: string,
  territories: Record<string, Territory>,
  gameState: GameState,
  conquest: TurnConquestState,
  /** cardState.resourceDeck.length — used for world-capital check */
  resourceDeckCount: number,
  /** Campaign context: what the World Capital is, and what continents are worth. */
  opts?: {
    worldCapitalTerritoryId?: string | null
    namedContinents?: Record<string, { namedByPlayerId: string }>
    continentBonusModifiers?: Array<{ continentId: string; bonusDelta: number }>
  },
): boolean {
  const owned = Object.values(territories).filter(t => t.occupyingPlayerId === playerId)
  const turn = gameState?.turn

  switch (missionId) {
    // ── Standard missions ────────────────────────────────────────────────────

    case 'mc-6-cities': {
      // The World Capital counts as one city — it replaced the city it sits on,
      // so not counting it made this mission HARDER to complete after founding it.
      const wcId = opts?.worldCapitalTerritoryId ?? null
      const cityCount = owned.reduce((n, t) => n + countCitiesOn(t, wcId), 0)
      return cityCount >= 6
    }

    case 'mc-4-cities-turn': {
      // Cities on territories conquered this turn. Counted with the same helper
      // as every other city mission: an HQ sticker also lives in `t.cities`, and
      // filtering only `!isDestroyed` let four captured enemy HQs complete this.
      const wcId = opts?.worldCapitalTerritoryId ?? null
      let citiesConquered = 0
      for (const id of conquest.conqueredIds) {
        const t = territories[id]
        if (t?.occupyingPlayerId === playerId) citiesConquered += countCitiesOn(t, wcId)
      }
      return citiesConquered >= 4
    }

    case 'mc-9-territories-turn':
      return conquest.conqueredIds.length >= 9

    case 'mc-4-sea-turn':
      return conquest.conqueredViaSeaIds.length >= 4

    case 'mc-continent-turn': {
      // Must have conquered at least 1 territory this turn, AND now control all of some continent
      if (conquest.conqueredIds.length === 0) return false
      const continentCount: Record<string, number> = {}
      for (const t of owned) {
        continentCount[t.continentId] = (continentCount[t.continentId] ?? 0) + 1
      }
      const conqueredContinents = new Set(
        conquest.conqueredIds
          .map(id => territories[id]?.continentId)
          .filter(c => c !== undefined),
      )
      return Object.entries(continentCount).some(
        ([cId, count]) =>
          count >= (CONTINENT_SIZES[cId] ?? Infinity) && (conqueredContinents as Set<string>).has(cId),
      )
    }

    case 'mc-7-continent-bonus':
      // Judged on the troops the player actually collects, which is what the
      // board shows: printed bonus + the campaign's winner-reward and unlock
      // modifiers + 1 for a continent they named. Same helper as
      // `calcReinforcements`, so the mission can never disagree with the payout.
      return totalContinentBonus(playerId, territories, {
        namedContinents: opts?.namedContinents,
        continentBonusModifiers: opts?.continentBonusModifiers,
      }) >= 7

    // ── Special missions ─────────────────────────────────────────────────────

    case 'mc-world-capital': {
      // "Be ELIGIBLE to take a resource card worth 4 or more coins." Territory
      // cards are the resource cards here and carry their coin value, so the
      // condition is real eligibility — evaluated when the card draw is earned,
      // against live (upgraded) coin values.
      //
      // The player never takes that card: qualifying consumes the draw, and the
      // red stars plus the World Capital are the reward instead. The Capital is
      // founded on THAT card's territory — GameBoard records the qualifying
      // territories in `turn.richCardTerritoryIds` at the same moment this flag
      // is set, because the face-up row has moved on by the time it is claimed.
      //
      // (Previously this only checked that 4+ cards remained in the deck — a
      // proxy that let the mission complete with no rich card in sight.)
      void resourceDeckCount
      return !!turn?.eligibleForRichCard && owned.length > 0
    }

    case 'mc-7-islands': {
      const islandCount = owned.filter(t => ISLAND_TERRITORY_IDS.has(t.id)).length
      return islandCount >= 7
    }

    // ── Private missions (unlocked with the World Capital) ───────────────────
    // The first three fire on an ACTION taken earlier in the turn, so they read
    // the per-turn counters rather than the board.

    case 'pm-advanced-tactics':
      // 2+ territory cards, each worth 4 or more resources, turned in this turn.
      return (turn?.richCardsTradedIn ?? 0) >= 2

    case 'pm-advanced-training':
      // 10+ total resources turned in this turn.
      return (turn?.resourcesTradedIn ?? 0) >= 10

    case 'pm-forced-occupation':
      // Eliminated a player holding a 3+ resource card this turn.
      return !!turn?.knockedOutRichPlayer

    case 'pm-guerrilla-warfare': {
      // Every Bunker (fortified) and Mercenary territory on the board is yours.
      // Vacuously true if none exist, so require at least one to be on the map.
      const marked = Object.values(territories).filter(t =>
        (t.scars ?? []).some(s => s.type === 'fortified' || s.type === 'mercenary'),
      )
      if (marked.length === 0) return false
      return marked.every(t => t.occupyingPlayerId === playerId)
    }

    case 'pm-urban-troop-surge': {
      // The World Capital PLUS 3 separate major cities. The Capital's own
      // stickers don't count toward the 3 — same no-double-dip rule it uses
      // for population and entry cost.
      const wcId = opts?.worldCapitalTerritoryId ?? null
      if (!wcId) return false
      if (territories[wcId]?.occupyingPlayerId !== playerId) return false
      let majors = 0
      for (const t of owned) {
        if (t.id === wcId) continue
        majors += livingCities(t).filter(c => c.isMajor).length
      }
      return majors >= 3
    }

    case 'pm-wide-border':
      // 2 whole continents held at the START of the turn (snapshot taken then,
      // so conquering a second continent mid-turn does not count until next turn).
      return (turn?.continentsAtTurnStart ?? 0) >= 2

    // ── Legacy missions (backward compatibility) ─────────────────────────────

    case 'mc-asia':
      return owned.filter(t => t.continentId === 'asia').length >= 12
    case 'mc-americas':
      return (
        owned.filter(t => t.continentId === 'north-america').length >= 9 &&
        owned.filter(t => t.continentId === 'south-america').length >= 4
      )
    case 'mc-europe':
      return owned.filter(t => t.continentId === 'europe').length >= 7
    case 'mc-4-continents': {
      const cc: Record<string, number> = {}
      for (const t of owned) cc[t.continentId] = (cc[t.continentId] ?? 0) + 1
      return Object.entries(cc).filter(([c, n]) => n >= (CONTINENT_SIZES[c] ?? Infinity)).length >= 4
    }
    case 'mc-24-territories':
      return owned.length >= 24
    case 'mc-2-hqs': {
      const hqCount = owned.reduce((n, t) => {
        return n + t.cities.filter(
          c => c.headquartersFactionId && c.headquartersFactionId !== playerId && !c.isDestroyed,
        ).length
      }, 0)
      return hqCount >= 2
    }

    default:
      return false
  }
}

/**
 * Compute each faction's homeland: the continent they started in most often.
 * Returns null for a faction if there's a tie for most-started continent.
 */
export function computeHomelands(
  history: Array<{ gameNumber: number; factionId: string; continentId: string }>,
): Record<string, string | null> {
  const result: Record<string, string | null> = {}

  // Group by faction
  const byFaction: Record<string, Record<string, number>> = {}
  for (const entry of history) {
    if (!byFaction[entry.factionId]) byFaction[entry.factionId] = {}
    byFaction[entry.factionId][entry.continentId] =
      (byFaction[entry.factionId][entry.continentId] ?? 0) + 1
  }

  for (const [factionId, counts] of Object.entries(byFaction)) {
    const maxCount = Math.max(...Object.values(counts))
    const winners = Object.entries(counts).filter(([, n]) => n === maxCount)
    result[factionId] = winners.length === 1 ? winners[0][0] : null
  }

  return result
}

/** Does this player's faction have a homeland, and does this territory belong to it? */
export function isHomelandTerritory(
  factionId: string,
  territoryId: string,
  factionHomelands: Record<string, string | null>,
  territories: Record<string, Territory>,
): boolean {
  const homeland = factionHomelands[factionId]
  if (!homeland) return false
  return territories[territoryId]?.continentId === homeland
}

/** How many WHOLE continents a player controls right now (Wide Border). */
export function wholeContinentsControlled(
  playerId: string,
  territories: Record<string, Territory>,
): number {
  return continentsHeldInFull(playerId, territories).length
}

/** The slice of LegacyState the homeland rules read. */
export interface HomelandLegacyInfo {
  doubleWinnerMilestoneTriggered?: boolean
  factionHomelands?: Record<string, string | null>
}

/**
 * A faction's homeland continent, or null if they have none.
 *
 * Returns null until the double-winner milestone unlocks the feature, even
 * though the start tally itself runs from game 1 — so a campaign that has not
 * yet seen a repeat champion behaves exactly as before.
 */
export function homelandContinentFor(
  legacy: HomelandLegacyInfo | null | undefined,
  factionId: string,
): string | null {
  if (!legacy?.doubleWinnerMilestoneTriggered) return null
  return (legacy.factionHomelands ?? {})[factionId] ?? null
}

/**
 * May this player claim the face-up territory card for `territoryId`?
 *
 * The base rule is "only cards for territories you occupy". A faction with a
 * homeland may ALSO claim any card in that whole continent, held or not.
 *
 * Shared by every eligibility check (the draw modal, the two GameBoard
 * backstops and the AI picker) so they cannot drift apart — if they disagree,
 * the modal offers a card the backstop then refuses.
 */
export function canClaimTerritoryCard(
  playerId: string,
  territoryId: string,
  territories: Record<string, Territory>,
  homelandContinentId: string | null,
): boolean {
  const t = territories[territoryId]
  if (!t) return false
  if (t.occupyingPlayerId === playerId) return true
  return !!homelandContinentId && t.continentId === homelandContinentId
}
