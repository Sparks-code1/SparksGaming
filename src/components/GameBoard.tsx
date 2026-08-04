import React, { useEffect, useRef, useState } from 'react'
import * as PIXI from 'pixi.js'
import type { Territory, ScarType } from '@/types/territory'
import type { GameState } from '@/types/game'
import { initialTurnState } from '@/types/game'
import type { LegacyState } from '@/types/legacy'
import type { Player } from '@/types/player'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT, buildTerritory } from '@/data/territoryData'
import { FACTION_COLORS, NEUTRAL_COLOR } from '@/data/mockGameState'
import { playerSignatureCount, doubleSigners, rosterName } from '@/lib/roster'
import type { FactionId } from '@/types/faction'
import TerritoryPanel from './TerritoryPanel'
import SVGMapLayer from './SVGMapLayer'
import AttackModal, { type CombatResolution } from './AttackModal'
import TurnControls from './TurnControls'
import FortifyPanel from './FortifyPanel'
import AdvancePanel from './AdvancePanel'
import ScarModal from './ScarModal'
import CityModal from './CityModal'
import WinScreen from './WinScreen'
import LegacyPanel from './LegacyPanel'
import CampaignCompleteScreen from './CampaignCompleteScreen'
import { campaignOutcome, applyCampaignCompletion, championLabel, type CampaignOutcome } from '@/lib/campaign'
import { connectedOwnedIds, injectAlienIslandTerritory, applyCustomSeaLines, ALIEN_ISLAND_TERRITORY_ID, calcDraftTroops, applyHqReserveTroops, expandClickAction, legalJoinWarTerritoryIds, cardCoinValue, leadFactionId, resolveResourceDepletion, type ResourceDepletion, troopsAfterEntry, minTroopsToEnter, LEAD_FACTION_WORLD_CAPITAL_TROOPS, worldCapitalReplacedCities, citiesLostOn, mergeLegacyEdits, countCitiesOn, FORTIFICATION_SUPPLY, fortificationsPlaced, canPlaceFortification, FORTIFY_EVENT_TROOPS, FORTIFY_EVENT_CITIES } from '@/lib/gameLogic'
import {
  defaultLegacyState, saveLegacyState, loadLegacyState, awardRedStars,
  applyLegacyToTerritories, pickUnlocks, SCAR_META,
  type LegacyEvent, type UnlockOption,
} from '@/lib/legacyApi'
import { getScarCard, type ScarCard, MERCENARY_CARD_IDS, BIOHAZARD_CARD_IDS } from '@/data/scarCards'
import CardHand from './CardHand'
import JoinTheWarModal from './JoinTheWarModal'
import CardDrawModal from './CardDrawModal'
import EventCardDisplay from './EventCardDisplay'
import SoundSettings from './SoundSettings'
import ComebackPowerModal, { COMEBACK_POWERS } from './ComebackPowerModal'
import { MILESTONES } from '@/data/milestones'
import NinthCityUnlockModal from './NinthCityUnlockModal'
import FirstEliminationMilestoneModal from './FirstEliminationMilestoneModal'
import BiohazardIcon from './BiohazardIcon'
import DoubleWinnerMilestoneModal from './DoubleWinnerMilestoneModal'
import JoinTheCauseModal from './JoinTheCauseModal'
import WorldCapitalModal from './WorldCapitalModal'
import AlienMilestoneModal from './AlienMilestoneModal'
import DieHumansModal from './DieHumansModal'
import BeamDownModal from './BeamDownModal'
import NuclearMilestoneModal from './NuclearMilestoneModal'
import MissilePowerModal from './MissilePowerModal'
import MutantsEvolveModal from './MutantsEvolveModal'
import { MassHypnosisModal, MindshackleModal } from './MutantPowerModals'
import { MISSILE_POWERS } from '@/data/missilePowers'
import {
  buildInitialGameCards, findBestTradeIn,
  getEventCard, getTerritoryCard, getCoinCard, COIN_CARDS,
  TERRITORY_CARDS, EVENT_EFFECTS, CARD_LOOKUP, type ActiveGameCards,
  CARD_TRADE_IN_VALUES, isPrivateMission, seedPrivateMissions, canClaimStarPower,
  shuffle,
} from '@/data/cards'
import { checkMission, computeHomelands, homelandContinentFor, canClaimTerritoryCard, wholeContinentsControlled, type TurnConquestState } from '@/lib/missionLogic'
import { isSeaLine, registerCustomSeaLines } from '@/data/seaLines'
import SeaLinePlacementModal from './SeaLinePlacementModal'
import { AI_DIFFICULTY_LABEL, AI_DIFFICULTY_BADGE } from '@/types/ai'
import { aiReinforcePlacements, aiAttackPlan, aiFortifyMove, aiTradeInDecision, rivalsOnMatchPoint, aiBonusTroopTarget } from '@/lib/ai'
import { playVictory, playElimination, playCoin, playCity, playMilestone, playTroop, startAmbient, stopAmbient } from '@/lib/sounds'
import ConfettiBurst from './ConfettiBurst'
import TurnBanner, { type TurnBannerInfo } from './TurnBanner'
import {
  gameReducer, checkReinforcementPlacement, createMathRng, resolveCombat,
  canStartAttack, canStartFortify, computeTurnAdvance, applyEndOfTurnScarEffects,
  type Action, type Effect,
} from '@/lib/gameReducer'

// ─── Colours ─────────────────────────────────────────────────────────────────


// ─── Polygon helpers ──────────────────────────────────────────────────────────

function parsePolygon(shape: string): number[][] {
  return JSON.parse(shape) as number[][]
}

// ─── Scar & city indicators ───────────────────────────────────────────────────


function drawIndicators(g: PIXI.Graphics, t: Territory, lx: number, ly: number) {
  g.clear()
  // HQ crowns and the World Capital marker are rendered in SVGMapLayer at exact
  // territory center coords

  t.scars.forEach((scar, i) => {
    const sx = lx + 10 + i * 11, sy = ly - 11
    switch (scar.type) {
      case 'nuclear-fallout': g.beginFill(0xFFFF00, 0.9); g.drawCircle(sx, sy, 4); g.endFill(); break
      case 'fortified':       break
      case 'fortification':  break  // rendered as SVG ring in SVGMapLayer
      case 'biological':      break  // rendered as ☣ icon in SVGMapLayer
      case 'wasteland':       break  // rendered as 💀 icon in SVGMapLayer — no canvas dot
      case 'mercenary':       break  // rendered as 🧍 icon in SVGMapLayer
    }
  })
  t.cities.forEach((city, i) => {
    // Active cities and HQs are rendered in SVGMapLayer (blue dot + crown);
    // only destroyed cities keep a canvas marker
    if (!city.isDestroyed) return
    const cx = lx - 8 + i * 8, cy = ly - 11
    g.lineStyle(0)
    g.beginFill(0x881010, 0.92)
    g.drawCircle(cx, cy, 2.8); g.endFill()
  })
}

// ─── Territory ID → SVG path ID mapping ──────────────────────────────────────
const SVG_ID_MAP: Record<string, string> = {
  'alaska':             'alaska',
  'northwest-territory':'northwest_territory',
  'alberta':            'alberta',
  'ontario':            'ontario',
  'quebec':             'quebec',
  'greenland':          'greenland',
  'western-us':         'western_united_states',
  'eastern-us':         'eastern_united_states',
  'central-america':    'central_america',
  'venezuela':          'venezuela',
  'peru':               'peru',
  'brazil':             'brazil',
  'argentina':          'argentina',
  'iceland':            'iceland',
  'great-britain':      'great_britain',
  'scandinavia':        'scandinavia',
  'northern-europe':    'northern_europe',
  'western-europe':     'western_europe',
  'southern-europe':    'southern_europe',
  'ukraine':            'ukraine',
  'north-africa':       'north_africa',
  'egypt':              'egypt',
  'east-africa':        'east_africa',
  'congo':              'congo',
  'south-africa':       'south_africa',
  'madagascar':         'madagascar',
  'ural':               'ural',
  'siberia':            'siberia',
  'yakutsk':            'yakursk',   // SVG has a typo: yakursk
  'irkutsk':            'irkutsk',
  'kamchatka':          'kamchatka',
  'mongolia':           'mongolia',
  'japan':              'japan',
  'afghanistan':        'afghanistan',
  'china':              'china',
  'middle-east':        'middle_east',
  'india':              'india',
  'southeast-asia':     'siam',
  'indonesia':          'indonesia',
  'new-guinea':         'new_guinea',
  'western-australia':  'western_australia',
  'eastern-australia':  'eastern_australia',
}

// ─── Territory body drawing ───────────────────────────────────────────────────

interface BodyOpts {
  hovered?:       boolean
  selected?:      boolean
  attackSrc?:     boolean   // orange — attack source
  attackTgt?:     boolean   // red — valid attack target
  reinforceDrop?: boolean   // green — can receive troops in draft phase
  fortifySrc?:    boolean   // blue-purple — fortify source
  fortifyDst?:    boolean   // teal — valid fortify destination
}

function drawTerritoryBody(
  g: PIXI.Graphics,
  _rough: number[],
  _fillColor: number,
  _fillAlpha: number,
  _opts: BodyOpts = {},
) {
  // All fills and highlights are handled by the SVG layers; PixiJS just clears here
  // so hit-area polygon remains correct without drawing visible geometry.
  g.clear()
}

// ─── Per-territory PixiJS handles ────────────────────────────────────────────

interface TerritoryHandles {
  body: PIXI.Graphics
  indicators: PIXI.Graphics
  flatPoly: number[]
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PlayerSetup {
  playerId: string
  name: string
  factionId: string
  startingTerritoryId: string
  /** Drafted starting troops (improved draft) — defaults to 8 when absent */
  startingTroops?: number
  /** Drafted starting coin cards (improved draft) — dealt from the resource deck */
  startingCoins?: number
  /** True when this slot is played by the computer */
  isAI?: boolean
  /** AI difficulty for this slot (only when isAI) */
  aiDifficulty?: import('@/types/ai').AIDifficulty
}

/** Improved draft: deal drafted starting coin cards from the front of the fresh
 *  resource deck. Deterministic so the player-state and card-state initializers agree. */
function computeStartingCoinHands(setups: PlayerSetup[]): Record<string, string[]> {
  const deck = COIN_CARDS.map(c => c.id)
  const hands: Record<string, string[]> = {}
  for (const s of setups) {
    const count = s.startingCoins ?? 0
    if (count > 0) hands[s.playerId] = deck.splice(0, count)
  }
  return hands
}

interface GameBoardProps {
  initialLegacy: LegacyState | null
  playerOrder: string[]
  playerSetups: PlayerSetup[]
  /** When provided, restore this saved game instead of building a fresh one from playerSetups. */
  restoredGameState?: Omit<GameState, 'legacySnapshot'> | null
  onReturnToLobby: () => void
}

/** Faction ability ids that apply in combat (used to avoid re-reading legacy in every render) */
type AbilityId = string

export default function GameBoard({ initialLegacy, playerOrder, playerSetups, restoredGameState, onReturnToLobby }: GameBoardProps) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const appRef         = useRef<PIXI.Application | null>(null)
  const handlesRef     = useRef<Map<string, TerritoryHandles>>(new Map())

  // ── Pure rules engine (multiplayer refactor, Step 1) ──────────────────────
  // Draft-phase state transitions are delegated to the pure gameReducer. Side
  // effects (sounds, animations, the troopsToPlace / placementHistory counters)
  // stay here and are applied around each dispatch. `rng` is injected so the
  // reducer never touches Math.random directly.
  const rngRef = useRef(createMathRng())
  // Effect interpreter — reducer actions can emit `Effect`s (consequences that
  // touch legacy/deck/modal state the pure reducer can't own). It's kept in a
  // ref so the stable `dispatch` can call the latest closure each render.
  const applyEffectRef = useRef<(e: Effect) => void>(() => {})
  // dispatch: run the reducer from the current state, commit the next state
  // (mirroring gameStateRef synchronously so same-tick reads see it, like
  // setTurn), then interpret any emitted effects.
  const dispatchRef = useRef((action: Action) => {
    const { state, effects } = gameReducer(gameStateRef.current, action, rngRef.current)
    gameStateRef.current = state
    setGameState(state)
    for (const e of effects) applyEffectRef.current(e)
  })
  const dispatch = dispatchRef.current

  // Synchronous per-turn state writer. Updates GameState.turn AND mirrors
  // gameStateRef immediately, so PIXI/timer closures that read the value later
  // in the same tick see it before React re-renders — exactly the old
  // setState()+ref.current= dual-write these fields used before they moved into
  // GameState. (Interim shim: RESOLVE_COMBAT/END_TURN will own these writes.)
  const setTurnRef = useRef((patch: Partial<GameState['turn']>) => {
    setGameState(prev => ({ ...prev, turn: { ...prev.turn, ...patch } }))
    gameStateRef.current = { ...gameStateRef.current, turn: { ...gameStateRef.current.turn, ...patch } }
  })
  const setTurn = setTurnRef.current

    // Player ids must be unique — an older bug could persist a duplicated player
    // into a saved game, producing duplicate React keys in the roster. Heal it.
    const dedupePlayers = <T extends { id: string }>(list: T[]): T[] => {
      const seen = new Set<string>()
      return list.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    }

  // Build initial game state — either restore from a saved snapshot or construct fresh.
  const initialState = (() => {
    if (restoredGameState) {
      // Reattach legacySnapshot (not persisted to avoid circular nesting in JSON)
      const restored = { ...restoredGameState, legacySnapshot: initialLegacy ?? defaultLegacyState() } as GameState
      // Backfill per-turn state. Merge over defaults so BOTH old saves (no turn)
      // and partial saves written between turn-field migrations (turn present but
      // missing newer fields like attackedTerritoryIds) get a complete object.
      restored.turn = { ...initialTurnState(), ...(restored.turn ?? {}) }
      restored.players = dedupePlayers(restored.players)
      // Alien Island: ensure the territory exists on restores from before it was placed
      if (initialLegacy?.alienIsland) {
        restored.territories = injectAlienIslandTerritory(restored.territories, initialLegacy.alienIsland)
      }
      // Campaign sea lines: ensure adjacencies + sea-route registration on restore
      registerCustomSeaLines(initialLegacy?.customSeaLines)
      restored.territories = applyCustomSeaLines(restored.territories, initialLegacy?.customSeaLines)
      return restored
    }

    // Improved draft: drafted starting coin cards go straight into hands
    const startingCoinHands = computeStartingCoinHands(playerSetups)

    const uniqueOrder = [...new Set(playerOrder)]
    const players = uniqueOrder.map(id => {
      const s = playerSetups.find(ps => ps.playerId === id)!
      return {
        id,
        name: s.name,
        factionId: s.factionId as FactionId,
        // The account that claimed this roster seat, if any. Null for
        // unclaimed seats and AI — accounts are optional.
        userId: (initialLegacy?.roster ?? []).find(m => m.id === id)?.userId ?? null,
        isAI: s.isAI ?? false,
        aiDifficulty: s.aiDifficulty,
        troops: 0,
        cards: [...(startingCoinHands[id] ?? [])],
        missionCardId: null as null,
        isEliminated: false,
        holdsHq: false,
        wins: 0,
        winHistory: [] as number[],
      }
    })

    const territories: Record<string, Territory> = Object.fromEntries(
      TERRITORY_DEFINITIONS.map(def => [def.id, buildTerritory(def)])
    )

    if (initialLegacy) {
      Object.assign(territories, applyLegacyToTerritories(territories, initialLegacy))
      // Alien Island becomes a real occupiable territory once placed
      if (initialLegacy.alienIsland) {
        Object.assign(territories, injectAlienIslandTerritory(territories, initialLegacy.alienIsland))
      }
      // Campaign sea lines drawn in earlier games
      registerCustomSeaLines(initialLegacy.customSeaLines)
      Object.assign(territories, applyCustomSeaLines(territories, initialLegacy.customSeaLines))
    }

    const activeHqs: Record<string, string> = {}
    for (const s of playerSetups) {
      if (territories[s.startingTerritoryId]) {
        territories[s.startingTerritoryId] = {
          ...territories[s.startingTerritoryId],
          occupyingPlayerId: s.playerId,
          troops: s.startingTroops ?? 8,
          activeHqPlayerId: s.playerId,
        }
        activeHqs[s.playerId] = s.startingTerritoryId
      }
    }

    // ── Lead faction claims the World Capital ────────────────────────────
    // The faction with the most campaign wins (none if 2+ tie) starts owning
    // the World Capital with 3 troops, ON TOP of their normal starting troops
    // and HQ placement. No HQ sits there — the Capital is marked ground and is
    // never a starting location — so the "no HQ adjacent to another" rule does
    // not apply to it, and the lead faction keeps these troops even if another
    // player started next door.
    const leadFaction = leadFactionId(initialLegacy?.victoryLog)
    const wcId = initialLegacy?.worldCapitalTerritoryId
    if (leadFaction && wcId && territories[wcId]) {
      const leadPlayer = players.find(p => p.factionId === leadFaction)
      // Only if nobody's HQ landed there (it is blocked in the picker, but a
      // legacy save could still carry one — never overwrite an HQ).
      if (leadPlayer && !territories[wcId].activeHqPlayerId) {
        territories[wcId] = {
          ...territories[wcId],
          occupyingPlayerId: leadPlayer.id,
          troops: LEAD_FACTION_WORLD_CAPITAL_TROOPS,
        }
      }
    }

    // Khan Industries — Strategic Reserve for the player taking turn 1. Every
    // later turn gets this at the END_TURN hand-off, but the first player never
    // passes through one. Safe to do here: this branch builds a FRESH game, so
    // a reload takes the `restoredGameState` path above and never re-applies.
    const firstPlayer = players[0]
    if (firstPlayer) {
      const reserve = applyHqReserveTroops(
        territories,
        firstPlayer.id,
        (initialLegacy?.chosenFactionAbilities ?? {})[firstPlayer.factionId] ?? null,
      )
      Object.assign(territories, reserve.territories)
    }

    return {
      id: 'game-1',
      campaignId: initialLegacy?.campaignId ?? 'new-campaign',
      gameNumber: initialLegacy?.currentGameNumber ?? 1,
      phase: 'reinforce' as const,
      currentPlayerIndex: 0,
      turnNumber: 1,
      players,
      territories,
      deck: [],
      discardPile: [],
      activeHqs,
      winnerId: null as null,
      legacySnapshot: initialLegacy ?? defaultLegacyState(),
      lastDiceRoll: null as null,
      cardTradeInIndex: 0,
      turn: initialTurnState(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })()

  const gameStateRef   = useRef<GameState>(initialState)
  const hoveredIdRef   = useRef<string | null>(null)
  const selectedIdRef  = useRef<string | null>(null)
  // refs for pixi callbacks (stale-closure safe)
  const attackSrcRef   = useRef<string | null>(null)
  const attackTgtRef   = useRef<string | null>(null)
  const phaseRef       = useRef<string>('reinforce')
  const troopsRef      = useRef(0)
  const fortifyDoneRef = useRef(false)
  const fortifySrcRef  = useRef<string | null>(null)
  const activeCardIdRef = useRef<string | null>(null)
  // Ref for faction abilities (stale-closure-safe for Pixi handlers)
  const abilitiesRef = useRef<Record<string, AbilityId>>({})

  // ── Legacy state ─────────────────────────────────────────────────────────
  const [legacyState, setLegacyState] = useState<LegacyState>(initialLegacy ?? defaultLegacyState())
  const legacyStateRef = useRef<LegacyState>(initialLegacy ?? defaultLegacyState())
  const [legacyEvents, setLegacyEvents] = useState<LegacyEvent[]>([])
  // Legacy UI modals
  const [showLegacyPanel,  setShowLegacyPanel]  = useState(false)
  const [scarTarget,       setScarTarget]       = useState<Territory | null>(null)
  const [cityTarget,       setCityTarget]       = useState<Territory | null>(null)
  const [showWinScreen,    setShowWinScreen]    = useState(false)
  const [showNinthCityUnlock,     setShowNinthCityUnlock]     = useState(false)
  const [pendingReturnLegacy,     setPendingReturnLegacy]     = useState<LegacyState | null>(null)
  // Set when the final game of the campaign has been decided. Drives the
  // celebration overlay; once dismissed it leaves the finished board on screen.
  const [campaignOutcomeState,    setCampaignOutcome]         = useState<CampaignOutcome | null>(null)
  const [campaignCelebrated,      setCampaignCelebrated]      = useState(false)
  const [showDoubleWinnerModal,   setShowDoubleWinnerModal]   = useState(false)
  const [doubleWinnerName,        setDoubleWinnerName]        = useState<string>('')
  const [showAlienMilestone,      setShowAlienMilestone]      = useState(false)
  const [dieHumansPendingCardId,  setDieHumansPendingCardId]  = useState<string | null>(null)
  const [beamDownActive,          setBeamDownActive]          = useState(false)
  const [alienStarBanner,         setAlienStarBanner]         = useState<string | null>(null)
  // Nuclear milestone (3 missiles on one combat roll)
  interface PendingNuclear { bringerPlayerId: string; bringerFactionId: string; falloutTerritoryId: string }
  const [pendingNuclear,          setPendingNuclear]          = useState<PendingNuclear | null>(null)
  const pendingNuclearRef = useRef<PendingNuclear | null>(null)
  const [missilePowerPendingPlayerId, setMissilePowerPendingPlayerId] = useState<string | null>(null)
  // Resistance event: the player with the fewest territories places bonus troops
  const [resistancePlacement, setResistancePlacement] = useState<{ playerId: string; troopsLeft: number } | null>(null)
  const resistancePlacementRef = useRef<{ playerId: string; troopsLeft: number } | null>(null)
  /**
   * Join the Cause troop reward: the LARGEST-POPULATION player places 3 troops
   * in cities they control. That player is often not the one taking the turn,
   * and the troops are restricted to cities, so it cannot just be added to the
   * current player's draft pool.
   */
  const [joinCausePlacement, setJoinCausePlacement] = useState<{ playerId: string; troopsLeft: number } | null>(null)
  const joinCausePlacementRef = useRef<{ playerId: string; troopsLeft: number } | null>(null)
  /**
   * Fortify event: the LARGEST-POPULATION player chooses between troops and a
   * permanent fortification.
   *
   * One state machine rather than three loose flags, because `cardId` has to
   * survive all the way to the end: the choice decides the card's fate. Taking
   * the fortification destroys it for the whole campaign; taking the troops
   * only discards it, so it comes back in later games.
   *
   * It used to go to the DRAWER and hand them 2 troops on one territory, which
   * is why it was cleared at END_TURN. Now that it belongs to a player the
   * board picks — usually not the one taking the turn — it must survive the
   * hand-off like the other board-picked rewards.
   */
  type FortifyEvent =
    | { phase: 'choice'; playerId: string; cardId: string }
    /** +2 troops into each of 2 DIFFERENT cities. `usedCityIds` enforces the difference. */
    | { phase: 'troops'; playerId: string; cardId: string; citiesLeft: number; usedCityIds: string[] }
    /** Pick one city to fortify permanently. */
    | { phase: 'fortification'; playerId: string; cardId: string }
  const [fortifyEvent, setFortifyEvent] = useState<FortifyEvent | null>(null)
  const fortifyEventRef = useRef<FortifyEvent | null>(null)
  /** Both writes at once — PIXI click handlers read the ref mid-tick. */
  function updateFortifyEvent(next: FortifyEvent | null) {
    fortifyEventRef.current = next
    setFortifyEvent(next)
  }
  // Control the People event: the largest-population player chooses a reward —
  // 5 troops in one of their cities, or an immediate maneuver.
  const [controlPeopleChoice, setControlPeopleChoice] = useState<string | null>(null) // playerId choosing
  // "5 troops in a city" placement mode
  const [controlTroopsPlayerId, setControlTroopsPlayerId] = useState<string | null>(null)
  const controlTroopsRef = useRef<string | null>(null)
  // "Immediate maneuver" mode — pick source, then a connected owned destination
  const [controlManeuver, setControlManeuver] = useState<{ playerId: string; srcId: string | null } | null>(null)
  const controlManeuverRef = useRef<{ playerId: string; srcId: string | null } | null>(null)
  const [controlManeuverDstId, setControlManeuverDstId] = useState<string | null>(null)
  // Riot event: die-roll results modal, then the loser removes 2 troops
  const [riotResult, setRiotResult] = useState<{ rolls: Array<{ playerId: string; name: string; roll: number }>; loserId: string; loserName: string } | null>(null)
  const [riotRemovalPlayerId, setRiotRemovalPlayerId] = useState<string | null>(null)
  const riotRemovalRef = useRef<string | null>(null)
  // Players who drew a card this turn — they cannot claim the shared mission
  const drewCardPlayerIdsRef = useRef<Set<string>>(new Set())
  /**
   * Draws granted by an EVENT rather than earned by conquest — currently only
   * Mysterious Island, which hands the Alien Island's controller a card the
   * moment the event fires.
   *
   * These are a separate grant from the card you collect for conquering, so they
   * do not forfeit the mission and are not cancelled when one is earned. Counted
   * rather than flagged, because a player can have an event draw and a normal
   * draw queued at the same time.
   */
  const eventDrawCreditsRef = useRef<Map<string, number>>(new Map())
  function grantEventDrawCredit(playerId: string) {
    eventDrawCreditsRef.current.set(playerId, (eventDrawCreditsRef.current.get(playerId) ?? 0) + 1)
  }
  /** Spends a credit if the player has one; true means this draw was an event's. */
  function consumeEventDrawCredit(playerId: string): boolean {
    const n = eventDrawCreditsRef.current.get(playerId) ?? 0
    if (n <= 0) return false
    eventDrawCreditsRef.current.set(playerId, n - 1)
    return true
  }
  const [mutantsEvolvePendingCardId, setMutantsEvolvePendingCardId] = useState<string | null>(null)
  // Missile power activations (each discards a missile; one use per power per turn)
  const [usedMissilePowersThisTurn, setUsedMissilePowersThisTurn] = useState<Set<string>>(new Set())
  const usedMissilePowersRef = useRef<Set<string>>(new Set())
  // EMP: territories whose combat dice can't be modified for the rest of the turn
  const [empTerritoryIds, setEmpTerritoryIds] = useState<Set<string>>(new Set())
  // Stealthy: recruits may be placed into one unmarked, unoccupied territory
  const [stealthyMode, setStealthyMode] = useState(false)
  const stealthyModeRef = useRef(false)
  const [stealthyTargetId, setStealthyTargetId] = useState<string | null>(null)
  const stealthyTargetRef = useRef<string | null>(null)
  // Recon: active for the current sideboard draw
  const [reconDrawActive, setReconDrawActive] = useState(false)
  // Mutant Mass Hypnosis: protected territory can't be attacked until protector's next turn
  const [hypnosisProtected, setHypnosisProtected] = useState<{ territoryId: string; playerId: string } | null>(null)
  const hypnosisProtectedRef = useRef<{ territoryId: string; playerId: string } | null>(null)
  const [hypnosisChoiceIds, setHypnosisChoiceIds] = useState<string[] | null>(null)
  // Mutant Mindshackle: offer to trade a just-collected coin card
  const [mindshackleOffer, setMindshackleOffer] = useState<{ coinCardId: string; playerId: string } | null>(null)
  // Players whose territories were conquered this turn (Mindshackle targets)
  const conqueredFromPlayerIdsRef = useRef<Set<string>>(new Set())
  // Game-star totals at game start — in-game earns (not starting tokens) trigger missile power picks
  const redStarBaselineRef = useRef<Record<string, number>>({ ...(initialLegacy?.purchasedStars ?? {}) })
  // Mysterious Island: an immediate (non-fortify-phase) sideboard draw is pending
  const [eventDrawActive,         setEventDrawActive]         = useState(false)
  const [showJoinTheCause,        setShowJoinTheCause]        = useState(false)
  const [unlockOptions,    setUnlockOptions]    = useState<UnlockOption[]>([])
  const [winnerPlayerId,   setWinnerPlayerId]   = useState<string | null>(null)
  const [winCondition,     setWinCondition]     = useState<'mission' | 'elimination'>('elimination')
  /** Set the moment the game is finalised — stops the in-progress autosave. */
  const gameFinishedRef = useRef(false)
  // "← Menu" sits beside Legacy in the toolbar and is easy to hit by accident,
  // so it confirms first. The game is never lost either way — it autosaves on
  // every phase boundary and can be resumed from the campaign screen.
  const [showMenuConfirm, setShowMenuConfirm] = useState(false)

  // Resource-deck depletion notice: either a star awarded to the territory
  // leader, or a shared lead in which case no star is given.
  const [coinDeckStarWinner, setCoinDeckStarWinner] = useState<
    | { kind: 'award'; name: string; count: number }
    | { kind: 'tie'; names: string[]; count: number }
    | null
  >(null)

  // Canvas map system: grey base PNG; SVG overlay for ownership colors + interaction tints
  const greyCanvasRef   = useRef<HTMLCanvasElement>(null)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const svgElemsRef     = useRef<Map<string, SVGElement>>(new Map())
  const [svgReady, setSvgReady] = useState(false)

  // Keep legacyStateRef in sync for use in PixiJS / stale-closure contexts
  useEffect(() => { legacyStateRef.current = legacyState }, [legacyState])

  // One-time: load PNG and grey-convert it for the base map display
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight
      const gc = greyCanvasRef.current
      if (!gc) return
      gc.width = W; gc.height = H
      const ctx = gc.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, W, H)
      const d = imgData.data
      const GREY = 200
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        if (r < 110 && g < 110 && b < 110) continue
        if (r > 215 && g > 215 && b > 215) continue
        d[i] = d[i + 1] = d[i + 2] = GREY
      }
      ctx.putImageData(imgData, 0, 0)
    }
    img.src = '/Risk_board.svg.png'
  }, [])

  // Tense ambient background loop while the board is up
  useEffect(() => {
    startAmbient()
    return () => stopAmbient()
  }, [])

  // Scar cards held by players this game (unplaced)
  const [heldCards, setHeldCards] = useState<Array<{ cardId: string; playerId: string }>>(() => {
    const ls = initialLegacy ?? defaultLegacyState()
    const gn = ls.currentGameNumber
    // One scar card per hand — if a save was corrupted by double-dealing, keep
    // only the first card dealt to each player.
    const seen = new Set<string>()
    return ls.dealtScars
      .filter(d => d.gameNumber === gn && !d.placed)
      .filter(d => !seen.has(d.playerId) && (seen.add(d.playerId), true))
      .map(d => ({ cardId: d.cardId, playerId: d.playerId }))
  })
  // Card placement mode: player clicked "Play Card" for an immediate card
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  // Card triggered by capture/eliminate — auto-targets scarTarget
  const [triggeredCard, setTriggeredCard] = useState<ScarCard | null>(null)

  // ── Risk card system ─────────────────────────────────────────────────────
  const [cardState, setCardState] = useState<ActiveGameCards>(() => {
    const ls = initialLegacy ?? defaultLegacyState()
    const legacyOpts = {
      eventsUnlocked: ls.currentGameNumber > 1,
      ninthCityUnlocked: ls.ninthCityUnlocked,
      doubleWinnerMilestoneTriggered: ls.doubleWinnerMilestoneTriggered,
      alienMilestoneTriggered: ls.alienMilestoneTriggered,
      nuclearMilestoneTriggered: ls.nuclearMilestoneTriggered,
      destroyedEventCardIds: ls.destroyedEventCardIds,
      destroyedMissionIds: ls.destroyedMissionIds,
      // The World Capital has been placed, so the private missions belong in
      // every deck from here on — not only the game that unlocked them.
      privateMissionsSeeded: ls.privateMissionsSeeded,
    }
    if (ls.activeGameCards && ls.activeGameCards.gameNumber === ls.currentGameNumber) {
      let cards = ls.activeGameCards
      // Migrate older saves that lack sideboard/resourceDeck. Rebuild from the
      // deal seed this game was dealt with so the backfill matches the rest of
      // the save rather than dealing an unrelated hand.
      if (!cards.sideboard || !cards.resourceDeck) {
        const fresh = buildInitialGameCards(ls.currentGameNumber, legacyOpts, cards.dealSeed)
        cards = {
          ...cards,
          sideboard: cards.sideboard ?? fresh.sideboard,
          resourceDeck: cards.resourceDeck ?? cards.coinDeck ?? fresh.resourceDeck,
          // Record the seed the backfill came from, so the effect below persists
          // it and a later reload cannot deal a different one.
          dealSeed: cards.dealSeed ?? fresh.dealSeed,
        }
      }
      // Strip base event cards — they've been removed from the game
      const BASE_EVENT_IDS = new Set(['ec-boom','ec-ammo','ec-ceasefire','ec-arms-race','ec-epidemic','ec-fallout','ec-march','ec-famine'])
      cards = {
        ...cards,
        eventDeck: cards.eventDeck.filter(id => !BASE_EVENT_IDS.has(id)),
        eventDiscard: cards.eventDiscard.filter(id => !BASE_EVENT_IDS.has(id)),
      }
      // Strip missions if double-winner milestone not yet reached
      if (!ls.doubleWinnerMilestoneTriggered) {
        cards = { ...cards, missionDeck: [], playerMissions: {} }
      }
      return cards
    }
    const fresh = buildInitialGameCards(ls.currentGameNumber, legacyOpts)
    // Improved draft: move drafted starting coin cards from the resource deck into hands
    const coinHands = computeStartingCoinHands(playerSetups)
    const dealtCoinIds = new Set(Object.values(coinHands).flat())
    if (dealtCoinIds.size === 0) return fresh
    return {
      ...fresh,
      resourceDeck: fresh.resourceDeck.filter(id => !dealtCoinIds.has(id)),
      playerHands: { ...fresh.playerHands, ...coinHands },
    }
  })
  const [currentEventCardId, setCurrentEventCardId] = useState<string | null>(null)
  const [showEventCard, setShowEventCard] = useState(false)
  const [showCardHand, setShowCardHand] = useState(false)
  /** Board-cards table blown up to a centre-screen overlay. */
  const [cardsExpanded, setCardsExpanded] = useState(false)

  /** An AI turn that has stopped making progress. */
  const [aiStalled, setAiStalled] = useState(false)
  /** Bumped by the Nudge button; any re-render re-enters the (dep-free) driver. */
  const [aiNudge, setAiNudge] = useState(0)

  // Escape closes the blown-up board cards. Bound only while it is open so the
  // key stays free for everything else.
  useEffect(() => {
    if (!cardsExpanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCardsExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cardsExpanded])
  // Pending card draws: queue of playerIds waiting to draw from sideboard
  const [pendingCardDrawsState, setPendingCardDrawsState] = useState<string[]>([])
  // Mirrored synchronously: a capture and the end of the attack phase can land
  // in the same tick (AI fast-forward), and the mission check that cancels a
  // draw has to see the queue as it stands right now, not last render's copy.
  const pendingCardDrawsRef = useRef<string[]>([])
  const pendingCardDraws = pendingCardDrawsState
  const setPendingCardDraws = (update: string[] | ((prev: string[]) => string[])) => {
    const next = typeof update === 'function' ? update(pendingCardDrawsRef.current) : update
    pendingCardDrawsRef.current = next
    setPendingCardDrawsState(next)
  }
  // Join the War: playerId of eliminated player whose turn it is to choose
  const [joinTheWarPlayerId, setJoinTheWarPlayerId] = useState<string | null>(null)
  // Lead faction rule: that faction picks which mission starts face-up.
  const [leadMissionPick, setLeadMissionPick] = useState<{ playerId: string; options: string[] } | null>(null)
  // Round-long active effects (ceasefire, ammo-shortage, nuclear-fallout-round, forced-march)
  const [activeEffects, setActiveEffects] = useState<Set<string>>(new Set())
  const activeEffectsRef = useRef<Set<string>>(new Set())
  const [fortifyMovesLeft, setFortifyMovesLeft] = useState(1)
  // Comeback power modal
  const [comebackEliminatedPlayer, setComebackEliminatedPlayer] = useState<Player | null>(null)
  const [isFirstElimination, setIsFirstElimination] = useState(false)
  // First Blood milestone screen — shown before the comeback power choice
  const [firstElimInfo, setFirstElimInfo] = useState<{ eliminatedName: string; factionId: string; conquerorName: string } | null>(null)
  // Mobile HQ comeback power: one HQ move per turn, at any point in the turn.
  // Refs mirror the state because the PIXI click handler is a long-lived
  // closure and must read the live values (same pattern as fortify/expand).
  const [mobileHqUsed, setMobileHqUsed] = useState(false)
  const mobileHqUsedRef = useRef(false)
  const [mobileHqMode, setMobileHqMode] = useState(false)
  const mobileHqModeRef = useRef(false)
  const [mobileHqSrcId, setMobileHqSrcId] = useState<string | null>(null)
  const mobileHqSrcRef = useRef<string | null>(null)
  // Expand comeback power: target territory for troop placement during reinforce.
  // `expandUsedRef` locks the choice once a troop lands — the power grants ONE
  // territory per turn, so the target must not be switchable afterwards.
  const [expandTargetId, setExpandTargetId] = useState<string | null>(null)
  const expandTargetRef = useRef<string | null>(null)
  const expandUsedRef = useRef(false)
  // Balkania 4th-capture bonus: show card pick modal immediately during attack phase
  const [balkExpansionPending, setBalkExpansionPending] = useState<string | null>(null)
  // Special mission completion modals
  const [showWorldCapitalModal,      setShowWorldCapitalModal]      = useState(false)
  const [worldCapitalCompletingId,   setWorldCapitalCompletingId]   = useState<string | null>(null)
  /** Territories the Capital may go to — the 4+ coin cards that earned it. */
  const [worldCapitalCandidates,     setWorldCapitalCandidates]     = useState<string[]>([])
  /**
   * The win screen snapshots campaign state the moment it mounts, so it must not
   * mount while a mission reward is still unplaced — the Island Empire sea line
   * and the World Capital both open modals ABOVE it. Latched once armed, so a
   * later modal can never unmount it and lose the winner's choices.
   */
  const [winScreenArmed, setWinScreenArmed] = useState(false)
  const [showSeaLinePlacement,       setShowSeaLinePlacement]       = useState(false)
  const [seaLineMissionPlayerId,     setSeaLineMissionPlayerId]     = useState<string | null>(null)

  // initialState is computed above (before gameStateRef)

  const [gameState,    setGameState]    = useState<GameState>(initialState)

  // Load the Risk board SVG once and inject it inline for DOM-level path access
  useEffect(() => {
    fetch('/Risk_board_wiki.svg')
      .then(r => r.text())
      .then(text => {
        const container = svgContainerRef.current
        if (!container) return
        container.innerHTML = text
        const svgEl = container.querySelector('svg')
        if (!svgEl) return
        svgEl.setAttribute('viewBox', '0 0 749.81909 519.06781')
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        svgEl.setAttribute('width', '100%')
        svgEl.setAttribute('height', '100%')
        // Scope to this SVG only — bare `*` bleeds out into the whole document
        svgEl.id = 'risk-board-wiki-svg'
        const hideStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style')
        hideStyle.textContent = '#risk-board-wiki-svg * { fill: transparent !important; stroke: none !important; }'
        svgEl.insertBefore(hideStyle, svgEl.firstChild)
        // Cache element references for fast per-frame updates
        const cache = svgElemsRef.current
        cache.clear()
        for (const [id, svgId] of Object.entries(SVG_ID_MAP)) {
          const el = container.querySelector(`#${svgId}`) as SVGElement | null
          if (el) {
            // Smooth color transition when ownership changes (territory capture)
            el.style.transition = 'fill 0.45s ease'
            cache.set(id, el)
          }
        }
        setSvgReady(true)
      })
  }, [])

  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [hoveredId,    setHoveredId]    = useState<string | null>(null)
  // attack phase
  const [attackSrcId,  setAttackSrcId]  = useState<string | null>(null)
  const [attackTgtId,  setAttackTgtId]  = useState<string | null>(null)
  const [showCombat,   setShowCombat]   = useState(false)
  const [showAdvance,  setShowAdvance]  = useState(false)
  const advanceSrcRef = useRef<string | null>(null)
  const advanceTgtRef = useRef<string | null>(null)
  // draft phase
  const [troopsToPlace, setTroopsToPlace] = useState(() => {
    // Compute for the CURRENT player, not always players[0]. On a fresh game
    // currentPlayerIndex is 0 so this is unchanged, but on resume/reload mid-game
    // it must reflect whoever's turn it actually is — otherwise the current
    // player gets player 0's reinforcements (losing their own continent/city
    // bonus). (troopsToPlace isn't persisted, so a reload mid-placement still
    // grants the full amount again — fixed later by moving it into GameState.)
    const cp = initialState.players[initialState.currentPlayerIndex] ?? initialState.players[0]
    if (!cp) return 0
    return calcDraftTroops({
      playerId: cp.id,
      factionId: cp.factionId,
      territories: initialState.territories,
      legacy: initialLegacy ?? null,
      ability: (initialLegacy?.chosenFactionAbilities ?? {})[cp.factionId] ?? null,
    })
  })
  const [placementHistory, setPlacementHistory] = useState<string[]>([])
  // Draft placement badges: territoryId → troops placed there this draft phase.
  // Kept separate from placementHistory because that array only records the
  // placements Undo can reverse (Expand/Stealthy drops are excluded), whereas
  // the badge must show every troop that went down.
  const [draftPlaced, setDraftPlaced] = useState<Record<string, number>>({})
  /** Adjust a territory's draft badge. Safe from stale closures — the setter is
   *  stable and the update is functional. */
  const bumpDraftPlaced = (territoryId: string, delta = 1) => {
    setDraftPlaced(prev => {
      const n = (prev[territoryId] ?? 0) + delta
      if (n <= 0) {
        const { [territoryId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [territoryId]: n }
    })
  }
  const placementHistoryRef = useRef<string[]>([])
  // Weakness power enforcement feedback (auto-clearing banner)
  const [weaknessNotice, setWeaknessNotice] = useState<string | null>(null)
  const weaknessNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // fortify phase
  const [fortifySrcId,  setFortifySrcId]  = useState<string | null>(null)
  const [fortifyDstId,  setFortifyDstId]  = useState<string | null>(null)
  const [fortifyDone,   setFortifyDone]   = useState(false)
  const [showFortify,   setShowFortify]   = useState(false)
  const [lastFortify,   setLastFortify]   = useState<{ srcId: string; dstId: string; troops: number } | null>(null)
  // Saharan Republic Mobile Forces: early-fortify mode active during reinforce/attack
  const [saharaFortifyMode, setSaharaFortifyMode] = useState(false)
  const saharaFortifyModeRef = useRef(false)

  // Repaint SVG territory fills + interaction tints whenever state changes
  useEffect(() => {
    if (!svgReady) return
    const elems = svgElemsRef.current
    if (elems.size === 0) return

    const phase = gameState.phase
    const currentPlayerId = gameState.players[gameState.currentPlayerIndex]?.id
    const currentPlayerAbility = (() => {
      const p = gameState.players[gameState.currentPlayerIndex]
      return p ? ((legacyState.chosenFactionAbilities ?? {})[p.factionId] ?? null) : null
    })()
    const saharaAnytime = currentPlayerAbility === 'sahara-anytime-fortify'
    const saharaFreeMove = currentPlayerAbility === 'sahara-free-fortify'
    const shortSightedWeakness = (() => {
      const p = gameState.players[gameState.currentPlayerIndex]
      return p ? (legacyState.alienWeaknessPowers ?? {})[p.factionId] === 'wp-short-sighted' : false
    })()

    const attackTgtIds = new Set<string>()
    if (phase === 'attack' && attackSrcId) {
      const src = gameState.territories[attackSrcId]
      src?.adjacentIds.forEach(adjId => {
        if (adjId === hypnosisProtected?.territoryId) return  // Mass Hypnosis
        if (gameState.territories[adjId]?.occupyingPlayerId !== currentPlayerId) attackTgtIds.add(adjId)
      })
    }
    const fortifyActive = !fortifyDone && fortifySrcId && currentPlayerId
    const fortifyDstIds = new Set<string>()
    const saharaEarlyActive = saharaAnytime && (phase === 'reinforce' || phase === 'attack') && saharaFortifyMode
    if (fortifyActive && (phase === 'fortify' || saharaEarlyActive)) {
      if (shortSightedWeakness) {
        // Short Sighted weakness: only directly adjacent owned territories
        const src = gameState.territories[fortifySrcId!]
        src?.adjacentIds.forEach(adjId => {
          if (gameState.territories[adjId]?.occupyingPlayerId === currentPlayerId && adjId !== fortifySrcId)
            fortifyDstIds.add(adjId)
        })
      } else if (saharaFreeMove) {
        Object.values(gameState.territories).forEach(t => {
          if (t.occupyingPlayerId === currentPlayerId && t.id !== fortifySrcId) fortifyDstIds.add(t.id)
        })
      } else {
        const fzBlockId = legacyState.falloutZoneTerritoryId
        const highlightMoverIsMutant = gameState.players.find(p => p.id === currentPlayerId)?.factionId === 'mutants'
        const visited = new Set<string>()
        const stack = [fortifySrcId!]
        visited.add(fortifySrcId!)
        while (stack.length) {
          const cur = stack.pop()!
          // Fallout Zone is reachable but never traversable — except by Mutants
          if (!highlightMoverIsMutant && fzBlockId && cur === fzBlockId && cur !== fortifySrcId) continue
          gameState.territories[cur]?.adjacentIds.forEach(adj => {
            if (!visited.has(adj) && gameState.territories[adj]?.occupyingPlayerId === currentPlayerId) {
              visited.add(adj); stack.push(adj)
            }
          })
        }
        visited.forEach(id => { if (id !== fortifySrcId) fortifyDstIds.add(id) })
        const src = gameState.territories[fortifySrcId!]
        src?.adjacentIds.forEach(adjId => {
          if (gameState.territories[adjId]?.occupyingPlayerId === currentPlayerId && adjId !== fortifySrcId)
            fortifyDstIds.add(adjId)
        })
      }
    }

    for (const [id, territory] of Object.entries(gameState.territories)) {
      const el = elems.get(id)
      if (!el) continue

      const player = territory.occupyingPlayerId
        ? gameState.players.find(p => p.id === territory.occupyingPlayerId)
        : null

      // Base ownership color
      let baseR = 0, baseG = 0, baseB = 0, baseA = 0
      if (player) {
        const hex = FACTION_COLORS[player.factionId as FactionId] ?? 0x888888
        baseR = (hex >> 16) & 0xff; baseG = (hex >> 8) & 0xff; baseB = hex & 0xff
        baseA = 0.82
      }

      // Interaction tint
      const isHov = hoveredId === id
      const isAttackTgt = phase === 'attack' && attackTgtIds.has(id)
      const isReinforceDrop = phase === 'reinforce' && territory.occupyingPlayerId === currentPlayerId && troopsToPlace > 0
      const isFortifyDst = (phase === 'fortify' || saharaEarlyActive) && fortifyDstIds.has(id)
      const isAttackSrc = phase === 'attack' && attackSrcId === id
      const isFortifySrc = (phase === 'fortify' || saharaEarlyActive) && fortifySrcId === id

      const isSelected = selectedId === id
      let tR = 255, tG = 255, tB = 255, tA = 0
      if (isAttackTgt)            { tR=204; tG=16;  tB=16;  tA = isHov ? 0.45 : 0.28 }
      else if (isAttackSrc || isFortifySrc) { tR=255; tG=255; tB=255; tA = 0.22 }
      else if (isReinforceDrop)   { tR=39;  tG=174; tB=96;  tA = isHov ? 0.38 : 0.20 }
      else if (isFortifyDst)      { tR=26;  tG=188; tB=156; tA = isHov ? 0.45 : 0.25 }
      else if (isSelected)        { tR=200; tG=148; tB=10;  tA = 0.35 }
      else if (isHov)             { tR=255; tG=255; tB=255; tA = 0.20 }

      let fill: string
      if (tA > 0 && baseA > 0) {
        // Blend tint over ownership color
        const r = Math.round(tA * tR + (1 - tA) * baseR)
        const g = Math.round(tA * tG + (1 - tA) * baseG)
        const b = Math.round(tA * tB + (1 - tA) * baseB)
        fill = `rgba(${r},${g},${b},${baseA})`
      } else if (tA > 0) {
        fill = `rgba(${tR},${tG},${tB},${tA})`
      } else if (baseA > 0) {
        fill = `rgba(${baseR},${baseG},${baseB},${baseA})`
      } else {
        fill = 'transparent'
      }
      el.style.setProperty('fill', fill, 'important')
    }
  }, [svgReady, gameState, hoveredId, selectedId, attackSrcId, fortifySrcId, fortifyDone, troopsToPlace, legacyState, saharaFortifyMode])


  // keep refs in sync
  gameStateRef.current  = gameState
  attackSrcRef.current  = attackSrcId
  attackTgtRef.current  = attackTgtId
  phaseRef.current      = gameState.phase
  troopsRef.current     = troopsToPlace
  placementHistoryRef.current = placementHistory
  fortifyDoneRef.current      = fortifyDone
  fortifySrcRef.current       = fortifySrcId
  saharaFortifyModeRef.current = saharaFortifyMode
  activeCardIdRef.current = activeCardId
  abilitiesRef.current          = legacyState.chosenFactionAbilities ?? {}
  hypnosisProtectedRef.current = hypnosisProtected

  // ── Persist game state on every phase/turn boundary ──────────────────────
  // This runs after render whenever the phase, current player, or turn number changes.
  // legacyStateRef.current is always current (synced above), so the save includes the
  // latest card state, legacy changes, etc. from this render.
  // Existing saveLegacyState calls inside setLegacyState updaters will also include
  // activeGameState via the {...prev} spread, since we update legacyState React state here too.
  const _saveKey = `${gameState.phase}:${gameState.currentPlayerIndex}:${gameState.turnNumber}`
  useEffect(() => {
    if (gameState.phase === 'game-over') return  // handled at game end
    // Once the game has been finalised, this autosave must never run again: it
    // writes gameInProgress:true with the whole board, and landing after the
    // finalise write would resurrect the finished game — the app would then
    // resume it on next load instead of opening the lobby.
    if (gameFinishedRef.current) return
    const { legacySnapshot: _snap, ...saved } = gameState
    // Use updater so we never overwrite purchasedStars or other fields written concurrently
    setLegacyState(prev => {
      const next: LegacyState = { ...prev, gameInProgress: true, activeGameState: saved as Record<string, unknown> }
      legacyStateRef.current = next
      saveLegacyState(next).catch(() => {})
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_saveKey])

  /** A player's homeland continent, or null. Null until the double-winner
   *  milestone unlocks homelands, and null for a faction with a tied tally. */
  function playerHomeland(playerId: string): string | null {
    const faction = gameStateRef.current.players.find(p => p.id === playerId)?.factionId ?? ''
    return homelandContinentFor(legacyStateRef.current, faction)
  }

  /** Returns the chosen ability id for a player (by their factionId). */
  function playerAbility(playerId: string): AbilityId | null {
    const player = gameState.players.find(p => p.id === playerId)
    if (!player) return null
    return (legacyState.chosenFactionAbilities ?? {})[player.factionId] ?? null
  }

  // ── PixiJS setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const app = new PIXI.Application({
      resizeTo: containerRef.current,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    appRef.current = app
    containerRef.current.appendChild(app.view as HTMLCanvasElement)

    const mapStage = new PIXI.Container()
    app.stage.addChild(mapStage)

    function scaleMap() {
      const sw = app.screen.width, sh = app.screen.height
      const scale = Math.min(sw / MAP_WIDTH, sh / MAP_HEIGHT)
      mapStage.scale.set(scale)
      mapStage.x = (sw - MAP_WIDTH * scale) / 2
      mapStage.y = (sh - MAP_HEIGHT * scale) / 2
    }
    scaleMap()
    app.renderer.on('resize', scaleMap)

    // ── Territory layer ─────────────────────────────────────────────────────
    const territoryLayer = new PIXI.Container()
    const indicatorLayer = new PIXI.Container()
    mapStage.addChild(territoryLayer)
    mapStage.addChild(indicatorLayer)

    const state = gameStateRef.current

    // Alien Island: synthetic definition so it gets a hit area + handlers like any territory.
    // Its octagonal hit polygon lives in territory.shape (set by injectAlienIslandTerritory).
    const islandT = state.territories[ALIEN_ISLAND_TERRITORY_ID]
    const allDefs = islandT
      ? [...TERRITORY_DEFINITIONS, {
          id: ALIEN_ISLAND_TERRITORY_ID, name: 'Alien Island', continentId: 'alien-island' as const,
          shape: islandT.shape, labelX: islandT.labelX, labelY: islandT.labelY,
          polygon: [] as number[][], adjacentIds: [...islandT.adjacentIds],
        }]
      : TERRITORY_DEFINITIONS

    allDefs.forEach(def => {
      const territory = state.territories[def.id]
      if (!territory) return

      // Hit areas come from the current definitions, not the saved territory shape —
      // saved games would otherwise pin stale hit rects after calibration fixes.
      // (Alien Island has no static def polygon; its octagon lives in territory.shape.)
      const points   = def.polygon.length > 0 ? def.polygon : parsePolygon(territory.shape)
      const flatPoly = points.flat()

      // Main body — transparent hit area; Risk board image is visible underneath
      const body = new PIXI.Graphics()
      body.interactive = true; body.cursor = 'pointer'
      body.hitArea = new PIXI.Polygon(flatPoly)

      drawTerritoryBody(body, flatPoly, 0x888888, 0, {})
      territoryLayer.addChild(body)

      // Indicators — explicitly non-interactive so they don't block clicks on the territory body
      const indicators = new PIXI.Graphics()
      indicators.interactive = false
      drawIndicators(indicators, territory, def.labelX, def.labelY)
      indicatorLayer.addChild(indicators)

      handlesRef.current.set(def.id, { body, indicators, flatPoly })

      body.on('pointerover', () => { hoveredIdRef.current = def.id; setHoveredId(def.id) })
      body.on('pointerout',  () => { if (hoveredIdRef.current === def.id) { hoveredIdRef.current = null; setHoveredId(null) } })
      // Use pointerdown instead of pointertap — pointertap requires press+release on the exact same
      // pixel, causing missed clicks on small territories like Iceland when the mouse moves slightly.
      body.on('pointerdown', () => {
        const state     = gameStateRef.current
        const phase     = phaseRef.current
        const currentPlayerId = state.players[state.currentPlayerIndex]?.id
        const t         = state.territories[def.id]
        const isOwn     = t.occupyingPlayerId === currentPlayerId

        // ── MOBILE HQ (comeback power) ────────────────────────────────────────
        // Move one HQ token you control to an ADJACENT territory you control,
        // once per turn, at any point during the turn. First click picks the HQ,
        // second click picks the destination.
        if (mobileHqModeRef.current && !mobileHqUsedRef.current) {
          const srcId = mobileHqSrcRef.current
          if (!srcId) {
            if (isOwn && t.activeHqPlayerId) {
              mobileHqSrcRef.current = def.id; setMobileHqSrcId(def.id)
            } else {
              showWeaknessNotice('🏰 Pick one of your HQ territories to move')
            }
            return
          }
          if (def.id === srcId) {
            // Clicking the HQ again de-selects it
            mobileHqSrcRef.current = null; setMobileHqSrcId(null)
            return
          }
          const src = state.territories[srcId]
          if (!isOwn) {
            showWeaknessNotice('🏰 The HQ can only move to a territory you control')
            return
          }
          if (!(src?.adjacentIds ?? []).includes(def.id)) {
            showWeaknessNotice('🏰 The HQ can only move to an ADJACENT territory')
            return
          }
          if (t.activeHqPlayerId) {
            showWeaknessNotice('🏰 That territory already holds an HQ')
            return
          }
          const hqOwnerId = src.activeHqPlayerId!
          setGameState(prev => {
            const next: GameState = {
              ...prev,
              territories: {
                ...prev.territories,
                [srcId]:  { ...prev.territories[srcId],  activeHqPlayerId: undefined },
                [def.id]: { ...prev.territories[def.id], activeHqPlayerId: hqOwnerId },
              },
              activeHqs: { ...prev.activeHqs, [hqOwnerId]: def.id },
            }
            gameStateRef.current = next
            return next
          })
          mobileHqUsedRef.current = true;  setMobileHqUsed(true)
          mobileHqModeRef.current = false; setMobileHqMode(false)
          mobileHqSrcRef.current = null;   setMobileHqSrcId(null)
          showWeaknessNotice(`🏰 HQ moved to ${t.name}`)
          return
        }

        // ── CARD PLACEMENT MODE (immediate / eliminate trigger) ───────────────
        if (activeCardIdRef.current) {
          const card = getScarCard(activeCardIdRef.current)
          if (card && t) {
            // The Fallout Zone is destroyed ground — no scars may be placed there
            if (def.id === legacyStateRef.current?.falloutZoneTerritoryId) {
              showWeaknessNotice('☢ You cannot place a scar on the Fallout Zone')
              return
            }
            // Only one scar per territory
            if ((t.scars?.length ?? 0) > 0) {
              showWeaknessNotice('⚠ This territory already has a scar — only one scar per territory')
              return
            }
            // Bunker and Ammo Shortage cannot be placed on territories that have already had combat this turn
            if ((card.type === 'fortified' || card.type === 'wasteland') && gameStateRef.current.turn.attackedTerritoryIds.includes(def.id)) {
              showWeaknessNotice(`⚠ ${card.name} can't be placed on a territory that had combat this turn`)
              return
            }
            setTriggeredCard(card)
            setScarTarget({ ...t })
          }
          return
        }

        // ── RESISTANCE EVENT PLACEMENT (any phase) ───────────────────────────
        const resistance = resistancePlacementRef.current
        if (resistance && resistance.troopsLeft > 0) {
          if (t.occupyingPlayerId !== resistance.playerId) {
            const rp = state.players.find(p => p.id === resistance.playerId)
            showWeaknessNotice(`✊ Resistance — ${rp?.name ?? 'the resistance player'} must place on their OWN territories`)
            return
          }
          setGameState(prev => ({
            ...prev,
            territories: {
              ...prev.territories,
              [def.id]: { ...prev.territories[def.id], troops: prev.territories[def.id].troops + 1 },
            },
          }))
          const remaining = resistance.troopsLeft - 1
          if (remaining <= 0) {
            resistancePlacementRef.current = null
            setResistancePlacement(null)
          } else {
            resistancePlacementRef.current = { ...resistance, troopsLeft: remaining }
            setResistancePlacement({ ...resistance, troopsLeft: remaining })
          }
          return
        }

        // ── JOIN THE CAUSE: 3 troops, in CITIES the winner controls ──────────
        const joinCause = joinCausePlacementRef.current
        if (joinCause && joinCause.troopsLeft > 0) {
          const jp = state.players.find(p => p.id === joinCause.playerId)
          if (t.occupyingPlayerId !== joinCause.playerId) {
            showWeaknessNotice(`🫂 Join the Cause — ${jp?.name ?? 'the winner'} must place in their OWN cities`)
            return
          }
          // Asked of the same function that builds the eligible list, so a
          // territory can never be highlighted as legal and then refused.
          if (!ownedCityIds(joinCause.playerId).includes(def.id)) {
            showWeaknessNotice(`🫂 Join the Cause — troops go in a CITY; ${t.name} has none`)
            return
          }
          setGameState(prev => ({
            ...prev,
            territories: {
              ...prev.territories,
              [def.id]: { ...prev.territories[def.id], troops: prev.territories[def.id].troops + 1 },
            },
          }))
          const remaining = joinCause.troopsLeft - 1
          if (remaining <= 0) {
            joinCausePlacementRef.current = null
            setJoinCausePlacement(null)
          } else {
            joinCausePlacementRef.current = { ...joinCause, troopsLeft: remaining }
            setJoinCausePlacement({ ...joinCause, troopsLeft: remaining })
          }
          return
        }

        // ── FORTIFY EVENT ────────────────────────────────────────────────────
        // Two placement modes off one choice: troops into two different cities,
        // or a single permanent fortification.
        const fe = fortifyEventRef.current
        if (fe && fe.phase !== 'choice') {
          const fp = state.players.find(p => p.id === fe.playerId)
          const eligible = ownedCityIds(fe.playerId)
          if (!eligible.includes(def.id)) {
            showWeaknessNotice(t.occupyingPlayerId === fe.playerId
              ? `⛨ Fortify — ${t.name} has no city; choose a city you control`
              : `⛨ Fortify — ${fp?.name ?? 'the player'} must choose a CITY they control`)
            return
          }

          if (fe.phase === 'fortification') {
            placeFortifyEventFortification(fe.playerId, fe.cardId, def.id)
            return
          }

          // Troops: two DIFFERENT cities, so a city already used is refused
          // rather than silently stacking the whole reward in one place.
          if (fe.usedCityIds.includes(def.id)) {
            showWeaknessNotice(`⛨ Fortify — ${t.name} already took its troops; choose a different city`)
            return
          }
          setGameState(prev => ({
            ...prev,
            territories: {
              ...prev.territories,
              [def.id]: { ...prev.territories[def.id], troops: prev.territories[def.id].troops + FORTIFY_EVENT_TROOPS },
            },
          }))
          const left = fe.citiesLeft - 1
          showWeaknessNotice(
            `⛨ Fortify — ${fp?.name ?? 'Player'} reinforced ${t.name} with ${FORTIFY_EVENT_TROOPS} troops`
            + (left > 0 ? ` — ${left} more ${left === 1 ? 'city' : 'cities'} to choose` : ''))
          if (left <= 0) finishFortifyTroops(fe.cardId)
          else updateFortifyEvent({ ...fe, citiesLeft: left, usedCityIds: [...fe.usedCityIds, def.id] })
          return
        }

        // ── CONTROL THE PEOPLE: place 5 troops in one owned city ─────────────
        const ctrlTroopsPid = controlTroopsRef.current
        if (ctrlTroopsPid) {
          if (t.occupyingPlayerId !== ctrlTroopsPid) {
            const cp = state.players.find(p => p.id === ctrlTroopsPid)
            showWeaknessNotice(`🏛 Control the People — ${cp?.name ?? 'the player'} must choose a city they control`)
            return
          }
          // Same eligible list the modal offered, so a territory can never be
          // counted as a city there and refused here.
          if (!ownedCityIds(ctrlTroopsPid).includes(def.id)) {
            showWeaknessNotice('🏛 Control the People — that territory has no city; choose a city you control')
            return
          }
          setGameState(prev => ({
            ...prev,
            territories: { ...prev.territories, [def.id]: { ...prev.territories[def.id], troops: prev.territories[def.id].troops + 5 } },
          }))
          const cp = state.players.find(p => p.id === ctrlTroopsPid)
          showWeaknessNotice(`🏛 Control the People — ${cp?.name ?? 'Player'} raised 5 troops in ${t.name}`)
          controlTroopsRef.current = null
          setControlTroopsPlayerId(null)
          return
        }

        // ── CONTROL THE PEOPLE: immediate maneuver (source → connected dest) ──
        const ctrlMan = controlManeuverRef.current
        if (ctrlMan) {
          const owned = t.occupyingPlayerId === ctrlMan.playerId
          if (!ctrlMan.srcId) {
            // Picking the source
            if (!owned || (t.troops ?? 0) <= 1) {
              showWeaknessNotice('⟳ Maneuver — pick a territory you control with more than 1 troop')
              return
            }
            controlManeuverRef.current = { ...ctrlMan, srcId: def.id }
            setControlManeuver({ ...ctrlMan, srcId: def.id })
            return
          }
          // Picking the destination
          if (def.id === ctrlMan.srcId) { // clicking source again cancels the source
            controlManeuverRef.current = { ...ctrlMan, srcId: null }
            setControlManeuver({ ...ctrlMan, srcId: null })
            return
          }
          const reachable = connectedOwnedIds(ctrlMan.srcId, ctrlMan.playerId, state.territories, fzNoTraverse())
          if (!owned || !reachable.has(def.id)) {
            showWeaknessNotice('⟳ Maneuver — pick a connected territory you control')
            return
          }
          setControlManeuverDstId(def.id)
          return
        }

        // ── RIOT EVENT: the losing player removes 2 troops from one territory ─
        const riotPid = riotRemovalRef.current
        if (riotPid) {
          if (t.occupyingPlayerId !== riotPid) {
            const rp = state.players.find(p => p.id === riotPid)
            showWeaknessNotice(`🔥 Riot — ${rp?.name ?? 'the player'} must remove troops from their OWN territory`)
            return
          }
          if ((t.troops ?? 0) <= 1) {
            showWeaknessNotice('🔥 Riot — choose a territory with more than 1 troop')
            return
          }
          const removed = Math.min(2, t.troops - 1)
          setGameState(prev => ({
            ...prev,
            territories: {
              ...prev.territories,
              [def.id]: { ...prev.territories[def.id], troops: prev.territories[def.id].troops - removed },
            },
          }))
          const rp = state.players.find(p => p.id === riotPid)
          showWeaknessNotice(`🔥 Riot — ${rp?.name ?? 'Player'} lost ${removed} troop${removed !== 1 ? 's' : ''} at ${t.name}`)
          riotRemovalRef.current = null
          setRiotRemovalPlayerId(null)
          return
        }

        // ── SAHARA EARLY FORTIFY (reinforce or attack phase) ─────────────────
        if (saharaFortifyModeRef.current && !fortifyDoneRef.current && (phase === 'reinforce' || phase === 'attack')) {
          const currentAbility = currentPlayerId ? abilitiesRef.current[
            state.players.find(p => p.id === currentPlayerId)?.factionId ?? ''
          ] : null
          if (currentAbility === 'sahara-anytime-fortify') {
            // No Desert Network branch here. This block only runs for the
            // ANYTIME ability — the enclosing check narrows it, and the button
            // that turns this mode on is gated on the same ability — so a
            // `currentAbility === 'sahara-free-fortify'` test was always false.
            // It came in with a copy of the normal fortify path below, where it
            // is meaningful. Reachability is connectivity, or adjacency when
            // Short Sighted applies.
            const saharaShortSighted = factionWeaknessOf(
              state.players.find(p => p.id === currentPlayerId)?.factionId ?? '',
            ) === 'wp-short-sighted'
            const srcId = fortifySrcRef.current
            if (srcId) {
              const src = state.territories[srcId]
              const isReachable = saharaShortSighted
                ? (isOwn && (src?.adjacentIds ?? []).includes(def.id))
                : connectedOwnedIds(srcId, currentPlayerId ?? '', state.territories, fzNoTraverse()).has(def.id)
              if (def.id === srcId) {
                fortifySrcRef.current = null; setFortifySrcId(null)
              } else if (isOwn && isReachable && (src?.troops ?? 0) > 1) {
                setFortifyDstId(def.id); setShowFortify(true)
              } else if (isOwn && (t.troops ?? 0) > 1) {
                fortifySrcRef.current = def.id; setFortifySrcId(def.id)
              } else {
                fortifySrcRef.current = null; setFortifySrcId(null)
              }
            } else {
              if (isOwn && (t.troops ?? 0) > 1) {
                fortifySrcRef.current = def.id; setFortifySrcId(def.id)
              }
            }
            return
          }
        }

        // ── REINFORCE / DRAFT ────────────────────────────────────────────────
        if (phase === 'reinforce') {
          const currentPId = state.players[state.currentPlayerIndex]?.id
          const currentFaction = state.players.find(p => p.id === currentPId)?.factionId ?? ''
          const hasComebackExpand = (legacyStateRef.current?.comebackPowers ?? {})[currentFaction] === 'expand'

          // Expand power: designate ONE unoccupied unmarked territory, then drop
          // recruits into it. Decision logic lives in `expandClickAction` — see
          // the note there on why "place" must be tested before "select".
          const isUnoccupied = !t.occupyingPlayerId
          const isUnmarked = !t.scars?.length && !t.cities?.length
          const expandAction = expandClickAction({
            hasPower: hasComebackExpand,
            troopsLeft: troopsRef.current,
            alreadyPlaced: expandUsedRef.current,
            isOwn, isUnoccupied, isUnmarked,
            isCurrentTarget: def.id === expandTargetRef.current,
          })
          if (expandAction === 'select') {
            expandTargetRef.current = def.id; setExpandTargetId(def.id)
            return
          }
          if (expandAction === 'place') {
            dispatch({ type: 'PLACE_REINFORCEMENT', playerId: currentPId!, territoryId: def.id })
            setTroopsToPlace(prev => prev - 1)
            bumpDraftPlaced(def.id)
            expandUsedRef.current = true
            return
          }

          // Stealthy missile power: pick ONE unmarked, unoccupied territory, then drop recruits there
          if (stealthyModeRef.current && troopsRef.current > 0) {
            const isFalloutZone = def.id === legacyStateRef.current?.falloutZoneTerritoryId
            if (!stealthyTargetRef.current && !isOwn && isUnoccupied && isUnmarked && !isFalloutZone) {
              stealthyTargetRef.current = def.id
              setStealthyTargetId(def.id)
              return
            }
            if (def.id === stealthyTargetRef.current) {
              dispatch({ type: 'PLACE_REINFORCEMENT', playerId: currentPId!, territoryId: def.id })
              setTroopsToPlace(prev => prev - 1)
              bumpDraftPlaced(def.id)
              return
            }
          }

          if (isOwn && troopsRef.current > 0) {
            // Placement validity (Fallout Zone, Cautious weakness) is enforced by
            // the pure rules engine; show its rejection notice on failure.
            const check = checkReinforcementPlacement(state, def.id, {
              falloutZoneTerritoryId: legacyStateRef.current?.falloutZoneTerritoryId,
              playerFactionId: state.players.find(p => p.id === currentPlayerId)?.factionId ?? '',
              isCautiousWeakness: factionWeaknessOf(currentFaction) === 'wp-cautious',
              placementHistory: placementHistoryRef.current,
            })
            if (!check.ok) { showWeaknessNotice(check.reason); return }
            playTroop()
            dispatch({ type: 'PLACE_REINFORCEMENT', playerId: currentPId!, territoryId: def.id })
            setTroopsToPlace(prev => prev - 1)
            setPlacementHistory(prev => [...prev, def.id])
            bumpDraftPlaced(def.id)
          } else {
            selectedIdRef.current = def.id; setSelectedId(def.id)
          }
          return
        }

        // ── ATTACK ───────────────────────────────────────────────────────────
        if (phase === 'attack') {
          if (def.id === 'iceland') {
            console.log('[Iceland ATTACK] clicked', {
              id: def.id,
              occupyingPlayerId: t.occupyingPlayerId,
              currentPlayerId,
              isOwn,
              troops: t.troops,
              attackSrc: attackSrcRef.current,
            })
          }
          // Sahara Mobile Forces: allow fortify click during attack phase
          const currentAbility = currentPlayerId ? abilitiesRef.current[
            state.players.find(p => p.id === currentPlayerId)?.factionId ?? ''
          ] : null
          if (def.id === 'iceland') console.log('[Iceland ATTACK] ability:', currentAbility, 'fortifyDone:', fortifyDoneRef.current, 'fortifySrc:', fortifySrcRef.current)
          if (currentAbility === 'sahara-anytime-fortify') {
            if (fortifyDoneRef.current) { /* already fortified */ }
            else {
              const fortifySrc = fortifySrcRef.current
              const attackSrc  = attackSrcRef.current
              if (fortifySrc) {
                // A fortify source is already selected — resolve the fortify move
                const src = state.territories[fortifySrc]
                const isReachable = factionWeaknessOf(state.players.find(p => p.id === currentPlayerId)?.factionId ?? '') === 'wp-short-sighted'
                  ? (isOwn && (src?.adjacentIds ?? []).includes(def.id))
                  : connectedOwnedIds(fortifySrc, currentPlayerId ?? '', state.territories, fzNoTraverse()).has(def.id)
                if (def.id === fortifySrc) {
                  fortifySrcRef.current = null; setFortifySrcId(null)
                } else if (isOwn && isReachable && (src?.troops ?? 0) > 1) {
                  setFortifyDstId(def.id); setShowFortify(true)
                } else if (isOwn && (t.troops ?? 0) > 1) {
                  fortifySrcRef.current = def.id; setFortifySrcId(def.id)
                } else {
                  fortifySrcRef.current = null; setFortifySrcId(null)
                }
                return
              } else if (attackSrc && isOwn && (t.troops ?? 0) > 1) {
                // Attack source is set but player clicks another own territory → start Sahara fortify
                fortifySrcRef.current = def.id; setFortifySrcId(def.id)
                return
              }
              // No fortify src and no attack src: fall through to normal attack source selection
            }
          }

          const srcId = attackSrcRef.current
          if (srcId) {
            if (def.id === srcId) {
              attackSrcRef.current = null; setAttackSrcId(null)
            } else if (canStartAttack(state, srcId, def.id, currentPlayerId ?? '')) {
              // DM Iron Shield: shielded territories cannot be attacked again this turn
              if (gameStateRef.current.turn.shieldedTerritoryIds.includes(def.id)) return
              // Ceasefire event: no attacks allowed this round
              if (activeEffectsRef.current.has('ceasefire')) return
              // Mutant Mass Hypnosis: protected territory can't be attacked
              if (hypnosisProtectedRef.current?.territoryId === def.id) {
                showWeaknessNotice('🌀 Mass Hypnosis — this territory cannot be attacked until the Mutants\' next turn')
                return
              }
              // Uncontested move: defender has 0 troops — show advance slider
              if ((t.troops ?? 0) === 0) {
                advanceSrcRef.current = srcId
                advanceTgtRef.current = def.id
                setShowAdvance(true)
                return
              }
              showAttackFlight(srcId, def.id, 'attack')
              attackTgtRef.current = def.id; setAttackTgtId(def.id); setShowCombat(true)
            } else if (isOwn && (t.troops ?? 0) > 1) {
              attackSrcRef.current = def.id; setAttackSrcId(def.id)
            } else {
              attackSrcRef.current = null; setAttackSrcId(null)
              selectedIdRef.current = def.id; setSelectedId(def.id)
            }
          } else {
            if (isOwn && (t.troops ?? 0) > 1) {
              attackSrcRef.current = def.id; setAttackSrcId(def.id)
            }
            selectedIdRef.current = def.id; setSelectedId(def.id)
          }
          return
        }

        // ── FORTIFY ──────────────────────────────────────────────────────────
        if (phase === 'fortify') {
          if (fortifyDoneRef.current) return
          const fortifyFaction = state.players.find(p => p.id === currentPlayerId)?.factionId ?? ''
          const currentAbility = currentPlayerId ? abilitiesRef.current[fortifyFaction] : null
          // Sahara Desert Network: can fortify to any owned territory (not just connected)
          const saharaFreeMove = currentAbility === 'sahara-free-fortify'
          // Short Sighted weakness power: destination must be directly adjacent to the source
          const shortSighted = factionWeaknessOf(fortifyFaction) === 'wp-short-sighted'
          const srcId = fortifySrcRef.current
          if (srcId) {
            const src = state.territories[srcId]
            const isReachable = shortSighted
              ? (isOwn && (src?.adjacentIds ?? []).includes(def.id))
              : saharaFreeMove
              ? (isOwn && def.id !== srcId)
              : connectedOwnedIds(srcId, currentPlayerId ?? '', state.territories, fzNoTraverse()).has(def.id)
            if (def.id === srcId) {
              fortifySrcRef.current = null; setFortifySrcId(null)
            } else if (isOwn && isReachable && (src?.troops ?? 0) > 1) {
              setFortifyDstId(def.id); setShowFortify(true)
            } else if (isOwn && (t.troops ?? 0) > 1) {
              fortifySrcRef.current = def.id; setFortifySrcId(def.id)
            } else {
              fortifySrcRef.current = null; setFortifySrcId(null)
              selectedIdRef.current = def.id; setSelectedId(def.id)
            }
          } else {
            if (canStartFortify(state, def.id, currentPlayerId ?? '')) {
              fortifySrcRef.current = def.id; setFortifySrcId(def.id)
            } else {
              selectedIdRef.current = def.id; setSelectedId(def.id)
            }
          }
          return
        }

        // ── DEFAULT (show panel) ─────────────────────────────────────────────
        selectedIdRef.current = def.id === selectedIdRef.current ? null : def.id
        setSelectedId(prev => prev === def.id ? null : def.id)
      })
    })

    return () => {
      app.destroy(true, { children: true })
      appRef.current = null
      handlesRef.current.clear()
    }
    // Rebuilds once if Alien Island is placed mid-game so it gains a hit area
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!legacyState.alienIsland])

  // ── Redraw on state changes ───────────────────────────────────────────────
  useEffect(() => {
    const state = gameStateRef.current
    const phase = state.phase
    const currentPlayerId = state.players[state.currentPlayerIndex]?.id

    // Pre-compute valid highlight sets per phase
    const attackTgtIds = new Set<string>()
    if (phase === 'attack' && attackSrcId) {
      const src = state.territories[attackSrcId]
      src?.adjacentIds.forEach(adjId => {
        if (adjId === hypnosisProtectedRef.current?.territoryId) return  // Mass Hypnosis
        if (state.territories[adjId]?.occupyingPlayerId !== currentPlayerId) attackTgtIds.add(adjId)
      })
    }

    const currentPlayerAbility = currentPlayerId
      ? abilitiesRef.current[state.players.find(p => p.id === currentPlayerId)?.factionId ?? ''] ?? null
      : null
    const saharaFreeMove = currentPlayerAbility === 'sahara-free-fortify'
    const saharaAnytime  = currentPlayerAbility === 'sahara-anytime-fortify'
    const fortifyActive  = !fortifyDone && fortifySrcId && currentPlayerId
    const fortifyDstIds: Set<string> = fortifyActive
      ? ((phase === 'fortify' || (phase === 'attack' && saharaAnytime))
          ? saharaFreeMove
            ? new Set(Object.values(state.territories).filter(tt => tt.occupyingPlayerId === currentPlayerId && tt.id !== fortifySrcId).map(tt => tt.id))
            : connectedOwnedIds(fortifySrcId, currentPlayerId, state.territories, fzNoTraverse())
          : new Set<string>())
      : new Set<string>()

    handlesRef.current.forEach(({ body, indicators, flatPoly }, id) => {
      const territory = state.territories[id]
      if (!territory) return
      const isOwn = territory.occupyingPlayerId === currentPlayerId
      const isHov = hoveredId === id

      const opts: BodyOpts = {
        hovered:       isHov,
        selected:      selectedId === id,
        attackSrc:     phase === 'attack'   && attackSrcId === id,
        attackTgt:     phase === 'attack'   && attackTgtIds.has(id),
        reinforceDrop: phase === 'reinforce' && isOwn && troopsToPlace > 0,
        fortifySrc:    (phase === 'fortify' || (phase === 'attack' && saharaAnytime)) && fortifySrcId === id,
        fortifyDst:    (phase === 'fortify' || (phase === 'attack' && saharaAnytime)) && fortifyDstIds.has(id),
      }
      drawTerritoryBody(body, flatPoly, 0x888888, 0, opts)

      body.cursor = (opts.attackTgt || opts.fortifyDst) ? 'crosshair'
                  : (opts.reinforceDrop && troopsToPlace > 0 && isOwn) ? 'cell'
                  : 'pointer'
      body.hitArea = new PIXI.Polygon(flatPoly)

      drawIndicators(indicators, territory, territory.labelX, territory.labelY)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId, selectedId, attackSrcId, fortifySrcId, fortifyDone, troopsToPlace, gameState])

  // ── Win detection ─────────────────────────────────────────────────────────
  function checkWin(territories: Record<string, Territory>, players: GameState['players']) {
    const ownerCounts = new Map<string, number>()
    for (const t of Object.values(territories)) {
      if (t.occupyingPlayerId) ownerCounts.set(t.occupyingPlayerId, (ownerCounts.get(t.occupyingPlayerId) ?? 0) + 1)
    }
    const total = Object.keys(territories).length
    for (const [pid, count] of ownerCounts) {
      if (count === total) return pid
    }
    // also check if any player has 0 territories — if only one remains, they win
    const alive = players.filter(p => (ownerCounts.get(p.id) ?? 0) > 0)
    if (alive.length === 1) return alive[0].id
    return null
  }

  // In-game stars: HQ tokens on controlled territories + stars purchased with coins this game.
  // Shown on the HUD. Does not include permanent campaign stars.
  function countStars(playerId: string, territories: Record<string, Territory>) {
    const hqStars = Object.values(territories).filter(
      t => t.occupyingPlayerId === playerId && !!t.activeHqPlayerId,
    ).length
    const purchased = (legacyState.purchasedStars ?? {})[playerId] ?? 0
    return hqStars + purchased
  }

  // ── Apply combat result to game state ────────────────────────────────────
  // ── Resource initialisation — every territory card starts with 1 coin; 12 random cards start with 2 ──
  useEffect(() => {
    const existing = legacyState.cardResources ?? {}
    const removed = new Set(legacyState.removedCardIds ?? [])
    const missing = TERRITORY_CARDS.filter(c => !removed.has(c.id) && !(c.id in existing))
    if (missing.length === 0) return
    // On first init (all cards missing), randomly pick 12 to start with 2 coins
    const isFirstInit = Object.keys(existing).length === 0
    const twoCoinsSet = new Set<string>()
    if (isFirstInit && missing.length >= 12) {
      const shuffled = shuffle(missing)
      for (let i = 0; i < 12; i++) twoCoinsSet.add(shuffled[i].id)
    }
    setLegacyState(prev => {
      const cardResources = { ...prev.cardResources }
      for (const c of missing) cardResources[c.id] = twoCoinsSet.has(c.id) ? 2 : 1
      const next = { ...prev, cardResources }
      saveLegacyState(next).catch(() => {})
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Unsigned-player bonus star (game 2+) ─────────────────────────────────
  // Any player who has never won a previous game starts with 1 purchased red star.
  // Keys off the roster id, so signing the board follows the person across
  // faction changes, seat changes, and games they sat out.
  useEffect(() => {
    if (!initialLegacy || initialLegacy.currentGameNumber < 2) return
    const bonusPlayerIds = playerSetups
      .filter(s => playerSignatureCount(initialLegacy, s.playerId) === 0)
      .map(s => s.playerId)
    if (bonusPlayerIds.length === 0) return
    setLegacyState(prev => {
      const existing = prev.purchasedStars ?? {}
      // Only add the star if they don't already have it — prevents double-award on remount
      const merged: Record<string, number> = { ...existing }
      let changed = false
      for (const pid of bonusPlayerIds) {
        if ((merged[pid] ?? 0) !== 1) { merged[pid] = 1; changed = true }
      }
      if (!changed) return prev
      const next = { ...prev, purchasedStars: merged }
      saveLegacyState(next).catch(() => {})
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Shared mission placement (once per game, on mount) ───────────────────
  // ONE mission card is placed face up for the whole table. Any player may
  // complete it at the end of their turn (see completeSharedMissionIfEarned).
  useEffect(() => {
    // Missions are locked until any player has signed the board twice
    if (!legacyState.doubleWinnerMilestoneTriggered) return
    if (cardState.currentMissionId) return
    // Older saves dealt missions secretly per player — reclaim those into
    // the shared deck (skipping destroyed ones) before flipping one face up
    const destroyed = new Set(legacyStateRef.current.destroyedMissionIds ?? [])
    const deck = [...new Set([
      ...(cardState.missionDeck ?? []),
      ...Object.values(cardState.playerMissions ?? {}),
    ])].filter(id => !destroyed.has(id))
    if (deck.length === 0) return
    // Lead faction rule: the faction with the most campaign wins CHOOSES which
    // mission starts face-up. Defer the flip and open the picker instead; the
    // normal "first card off the deck" applies when there is no lead faction
    // (or its faction is not in this game).
    const lead = leadFactionId(legacyStateRef.current?.victoryLog)
    const leadPlayer = lead
      ? gameStateRef.current.players.find(p => p.factionId === lead)
      : undefined
    if (leadPlayer) {
      setCardState({ ...cardState, missionDeck: deck, playerMissions: {} })
      setLeadMissionPick({ playerId: leadPlayer.id, options: deck })
      return
    }
    const first = deck.shift() ?? null
    const next: ActiveGameCards = { ...cardState, missionDeck: deck, currentMissionId: first, playerMissions: {} }
    setCardState(next)
    setLegacyState(prev => {
      const newLegacy: LegacyState = { ...prev, activeGameCards: next }
      legacyStateRef.current = newLegacy
      saveLegacyState(newLegacy).catch(() => {})
      return newLegacy
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Persist the deal as soon as it is made ───────────────────────────────
  // Deals are random now, so an unsaved one is a different deal after a reload:
  // the four face-up cards would change, and reloading until you like them would
  // be a free re-roll. Writing it on mount pins the shuffle to this game.
  useEffect(() => {
    const stored = legacyStateRef.current.activeGameCards
    if (stored?.gameNumber === cardState.gameNumber && stored?.dealSeed === cardState.dealSeed) return
    setLegacyState(prev => {
      const next: LegacyState = { ...prev, activeGameCards: cardState }
      legacyStateRef.current = next
      saveLegacyState(next).catch(() => {})
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hold the win screen back until every mission reward has been placed.
  useEffect(() => {
    if (!showWinScreen) { setWinScreenArmed(false); return }
    if (showSeaLinePlacement || showWorldCapitalModal) return
    setWinScreenArmed(true)
  }, [showWinScreen, showSeaLinePlacement, showWorldCapitalModal])

  // Mysterious Island: clear the immediate-draw flag once the queued draw resolves
  useEffect(() => {
    if (pendingCardDraws.length === 0 && eventDrawActive) setEventDrawActive(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCardDraws])

  // ── Aliens star power: control every city on the board → 2 red stars ─────
  useEffect(() => {
    if (legacyState.alienStarPowerClaimed) return
    const alienPlayer = gameState.players.find(p => p.factionId === 'aliens' && !p.isEliminated)
    if (!alienPlayer) return
    // Active cities = city stickers that aren't destroyed and aren't on ruined territories
    const destroyedCityIds = new Set((legacyState.destroyedCities ?? []).map(d => d.cityId))
    const ruinIds = new Set(legacyState.ruinTerritoryIds ?? [])
    const cityTerritoryIds = [...new Set(
      legacyState.stickers
        .filter(s =>
          s.placement === 'territory' &&
          s.description.startsWith('city:') &&
          !destroyedCityIds.has(s.id) &&
          !ruinIds.has(s.targetId),
        )
        .map(s => s.targetId),
    )]
    if (cityTerritoryIds.length === 0) return
    const controlsAll = cityTerritoryIds.every(
      tid => gameState.territories[tid]?.occupyingPlayerId === alienPlayer.id,
    )
    if (!controlsAll) return
    setLegacyState(prev => {
      if (prev.alienStarPowerClaimed) return prev
      let next: LegacyState = { ...prev, alienStarPowerClaimed: true }
      next = awardRedStars(next, alienPlayer.id, 2, alienPlayer.name, gameState.gameNumber)
      saveLegacyState(next).catch(() => {})
      return next
    })
    setAlienStarBanner(`👽 TOTAL DOMINATION — ${alienPlayer.name} controls every city on the board and earns 2 red stars!`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.territories])

  // ── Missile powers: earned when a player gains a red star during a game ──
  useEffect(() => {
    if (!legacyState.nuclearMilestoneTriggered) return
    if (missilePowerPendingPlayerId) return
    const current = legacyState.purchasedStars ?? {}
    for (const [pid, count] of Object.entries(current)) {
      const base = redStarBaselineRef.current[pid] ?? 0
      if (count <= base) continue
      redStarBaselineRef.current = { ...redStarBaselineRef.current, [pid]: count }
      const player = gameState.players.find(p => p.id === pid)
      if (!player) continue
      // Aliens and Mutants are not eligible to earn missile powers
      if (player.factionId === 'aliens' || player.factionId === 'mutants') continue
      // One missile power MAX per faction — skip factions that already have one
      if (((legacyState.missilePowers ?? {})[player.factionId] ?? []).length >= 1) continue
      const claimed = legacyState.claimedMissilePowers ?? []
      if (claimed.length >= MISSILE_POWERS.length) continue  // all powers taken
      setMissilePowerPendingPlayerId(pid)
      break
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyState.purchasedStars])

  // Milestone unlock sound + full-screen confetti burst — fires when any
  // milestone/legacy modal appears
  const [confettiSeq, setConfettiSeq] = useState(0)
  useEffect(() => {
    if (showNinthCityUnlock || showDoubleWinnerModal || showAlienMilestone || pendingNuclear || firstElimInfo) {
      playMilestone()
      setConfettiSeq(s => s + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNinthCityUnlock, showDoubleWinnerModal, showAlienMilestone, !!pendingNuclear, !!firstElimInfo])

  // ── Faction homelands ────────────────────────────────────────────────────
  // Record where each faction's starting HQ landed this game, then re-derive
  // every faction's homeland (most-started continent; a tie means none).
  // Runs once per game: entries are keyed by gameNumber+factionId, so a reload
  // re-derives the same result instead of double-counting a start.
  useEffect(() => {
    const ls = legacyStateRef.current
    const history = ls.factionStartHistory ?? []
    const already = new Set(history.map(h => `${h.gameNumber}:${h.factionId}`))

    const additions: Array<{ gameNumber: number; factionId: string; continentId: string }> = []
    for (const p of gameState.players) {
      const key = `${gameState.gameNumber}:${p.factionId}`
      if (already.has(key)) continue
      // The starting HQ territory — recorded at setup and never moved by the
      // Mobile HQ power, which only relocates the token, not the origin.
      const hqId = gameState.activeHqs[p.id]
      const continentId = hqId ? gameState.territories[hqId]?.continentId : undefined
      if (!continentId) continue
      additions.push({ gameNumber: gameState.gameNumber, factionId: p.factionId, continentId })
      already.add(key)
    }

    const nextHistory = additions.length > 0 ? [...history, ...additions] : history
    const nextHomelands = computeHomelands(nextHistory)
    const unchanged =
      additions.length === 0 &&
      JSON.stringify(nextHomelands) === JSON.stringify(ls.factionHomelands ?? {})
    if (unchanged) return

    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        factionStartHistory: nextHistory,
        factionHomelands: nextHomelands,
      }
      legacyStateRef.current = next
      saveLegacyState(next).catch(() => {})
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.gameNumber, gameState.players.length])

  // ── Milestone unlock log ─────────────────────────────────────────────────
  // Milestone flags are set from ~8 different places; rather than tag each one,
  // watch the flags and stamp the game number the first time each flips. That
  // stamp is what lets the Legacy history read "Game 3 — The Ninth City".
  useEffect(() => {
    const ls = legacyStateRef.current
    const recorded = ls.milestoneUnlockGames ?? {}
    const newly = MILESTONES.filter(m => m.isUnlocked(ls) && recorded[m.id] === undefined)
    if (newly.length === 0) return
    setLegacyState(prev => {
      const games = { ...(prev.milestoneUnlockGames ?? {}) }
      let changed = false
      for (const m of newly) {
        if (games[m.id] === undefined) { games[m.id] = gameState.gameNumber; changed = true }
      }
      if (!changed) return prev
      const next: LegacyState = { ...prev, milestoneUnlockGames: games }
      legacyStateRef.current = next
      saveLegacyState(next).catch(() => {})
      return next
    })
  }, [
    legacyState.firstEliminationTriggered,
    legacyState.doubleWinnerMilestoneTriggered,
    legacyState.ninthCityUnlocked,
    legacyState.alienMilestoneTriggered,
    legacyState.nuclearMilestoneTriggered,
    gameState.gameNumber,
  ])

  // Draft badges live only for the duration of a draft phase. Clearing them on
  // the phase leaving 'reinforce' covers every exit (human, AI, end of turn)
  // from one place, so no new exit path can forget to reset them.
  useEffect(() => {
    if (gameState.phase !== 'reinforce') setDraftPlaced({})
  }, [gameState.phase])

  // Turn-change banner — announces whose turn it is at the start of each draft phase
  const [turnBanner, setTurnBanner] = useState<TurnBannerInfo | null>(null)
  useEffect(() => {
    if (gameState.phase !== 'reinforce') return
    const p = gameState.players[gameState.currentPlayerIndex]
    if (!p || p.isEliminated) return
    setTurnBanner({ playerName: p.name, factionId: p.factionId, isAI: p.isAI, seq: Date.now() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.currentPlayerIndex, gameState.phase === 'reinforce', gameState.turnNumber])

  // ── 4-star victory watcher: any award path (missions, Agent of Chaos, star
  // powers, bought stars) that pushes a player to 4 stars ends the game ──────
  useEffect(() => {
    if (gameState.phase === 'game-over' || showWinScreen) return
    for (const p of gameState.players) {
      if (p.isEliminated) continue
      const hqStars = Object.values(gameState.territories).filter(
        t => t.occupyingPlayerId === p.id && !!t.activeHqPlayerId,
      ).length
      const purchased = (legacyState.purchasedStars ?? {})[p.id] ?? 0
      if (hqStars + purchased >= 4) {
        setWinnerPlayerId(p.id)
        setWinCondition('mission')
        setUnlockOptions(pickUnlocks(gameState.gameNumber))
        setGameState(prev => ({ ...prev, phase: 'game-over', winnerId: p.id }))
        setTimeout(() => setShowWinScreen(true), 300)
        break
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyState.purchasedStars])

  // ── AI turn driver ────────────────────────────────────────────────────────
  // Drives an AI player's whole turn through the SAME mechanics humans use, one
  // action at a time with a visible delay. Auto-resolves the AI's own choice
  // modals; pauses (does nothing) whenever a human-owned modal is open.
  const aiBusyRef = useRef(false)
  const aiAttacksThisTurnRef = useRef(0)
  /** One trade-in evaluation per AI draft phase (reset at end of turn). */
  const aiTradedThisTurnRef = useRef(false)

  // AI pacing — slow enough to follow by default; ⏩ fast-forward shrinks all
  // delays (button shown in the header whenever an AI is taking its turn)
  const [aiFast, setAiFast] = useState(false)
  const aiFastRef = useRef(false)
  aiFastRef.current = aiFast
  const aiMs = (normal: number, fast: number) => (aiFastRef.current ? fast : normal)

  // ── Attack flight — bubble travelling from attacker to target territory ──
  const [attackFlight, setAttackFlight] = useState<{
    srcId: string; tgtId: string; rgb: string; kind: 'attack' | 'advance'
    label: string; durMs: number; seq: number
  } | null>(null)
  const flightTimerRef = useRef<number | null>(null)

  function showAttackFlight(srcId: string, tgtId: string, kind: 'attack' | 'advance', label?: string, durMs = 1000) {
    const st = gameStateRef.current
    const cp = st.players[st.currentPlayerIndex]
    const hex = FACTION_COLORS[cp?.factionId ?? ''] ?? NEUTRAL_COLOR
    const rgb = `${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff}`
    setAttackFlight({ srcId, tgtId, rgb, kind, label: label ?? (kind === 'attack' ? '⚔' : '»'), durMs, seq: Date.now() })
    if (flightTimerRef.current) window.clearTimeout(flightTimerRef.current)
    flightTimerRef.current = window.setTimeout(() => setAttackFlight(null), durMs + 150)
  }

  /**
   * A choice a HUMAN has to make before the AI can move, described for display,
   * or null when nothing is blocking.
   *
   * The AI driver stands down on exactly this condition. Sharing it with the
   * on-screen notice matters: a stuck human modal used to freeze every later AI
   * turn with no explanation, which reads as "the AI turned into a human player
   * and won't play". Now the board says which of the two it is.
   */
  function humanBlockingChoice(): string | null {
    const st = gameStateRef.current
    const isHumanId = (pid: string | null | undefined) => {
      if (!pid) return false
      const p = st.players.find(x => x.id === pid)
      return !!p && !p.isAI
    }
    if (comebackEliminatedPlayer && !comebackEliminatedPlayer.isAI) return 'a comeback power'
    if (leadMissionPick && isHumanId(leadMissionPick.playerId)) return 'a mission pick'
    if (joinTheWarPlayerId && isHumanId(joinTheWarPlayerId)) return 'a Join the War placement'
    if (missilePowerPendingPlayerId && isHumanId(missilePowerPendingPlayerId)) return 'a missile power'
    if (isHumanId(pendingCardDraws[0])) return 'a card draw'
    // Event follow-ups belong to a FACTION, not to whoever's turn it is, so any
    // of these can be a human's while an AI is playing. The AI must wait rather
    // than carry on around an open choice it cannot make.
    const factionPlayer = (fid: string) => st.players.find(p => p.factionId === fid && !p.isEliminated)?.id
    if (dieHumansPendingCardId && isHumanId(factionPlayer('aliens'))) return 'a Die Humans choice'
    if (beamDownActive && isHumanId(factionPlayer('aliens'))) return 'a Beam Down placement'
    if (mutantsEvolvePendingCardId && isHumanId(factionPlayer('mutants'))) return 'a Mutants Evolve choice'
    if (showJoinTheCause && isHumanId(largestPopulationPlayerId())) return 'a Join the Cause choice'
    if (joinCausePlacement && isHumanId(joinCausePlacement.playerId)) return 'a Join the Cause placement'
    if (fortifyEvent && isHumanId(fortifyEvent.playerId)) {
      return fortifyEvent.phase === 'choice' ? 'a Fortify choice' : 'a Fortify placement'
    }
    return null
  }

  /**
   * Append one line to the campaign history log.
   *
   * Functional update plus a synchronous ref assignment — a replacement write
   * built from a captured copy drops whatever else landed in the same tick,
   * which is how the World Capital went missing once already.
   */
  function logHistory(entry: string) {
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry,
          timestamp: new Date().toISOString(),
        }],
      }
      legacyStateRef.current = next
      saveLegacyState(next).catch(() => {})
      return next
    })
  }

  /**
   * Territories this player holds that have a city on them.
   *
   * The one answer for every "in a city you control" reward — Join the Cause's
   * 3 troops and Control the People's 5. Counted with `countCitiesOn`, so the
   * World Capital is a city here exactly as it is everywhere else.
   *
   * These checks used to read raw city stickers, and the World Capital COVERS
   * the sticker it replaced — so the one territory worth 5 population, the very
   * thing that usually wins the population count both rewards are handed out
   * for, was not a legal place to put the winnings. A leader whose only city
   * was the World Capital was told they controlled none and forfeited it.
   */
  function ownedCityIds(playerId: string): string[] {
    const wcId = legacyStateRef.current?.worldCapitalTerritoryId ?? null
    return Object.values(gameStateRef.current.territories)
      .filter(t => t.occupyingPlayerId === playerId && countCitiesOn(t, wcId) > 0)
      .map(t => t.id)
  }

  /**
   * Begin the Join the Cause troop reward for the largest-population player.
   *
   * The 3 troops go in CITIES that player controls — not into the current
   * player's draft pool, which is where they used to land regardless of who won
   * the choice.
   */
  function startJoinCauseTroops(playerId: string) {
    const name = gameStateRef.current.players.find(p => p.id === playerId)?.name ?? 'Player'
    if (ownedCityIds(playerId).length === 0) {
      showWeaknessNotice(`🫂 Join the Cause — ${name} controls no cities, so the troops are forfeit`)
      logHistory(`🫂 Join the Cause — ${name} had the largest population but controlled no city; the 3 troops were forfeit`)
      return
    }
    const next = { playerId, troopsLeft: 3 }
    joinCausePlacementRef.current = next
    setJoinCausePlacement(next)
    logHistory(`🫂 Join the Cause — ${name} had the largest population and takes 3 troops in their cities`)
  }

  /**
   * One troop of an AI's Join the Cause reward, and one of an AI's Resistance
   * reward.
   *
   * Both drivers call these rather than each carrying a copy: the turn-gated AI
   * loop, and the turn-agnostic one below that covers the case where the player
   * owed the troops is an AI but the turn belongs to someone else.
   */
  function stepAiJoinCausePlacement(jc: { playerId: string; troopsLeft: number }) {
    // Restricted to cities, so the border heuristic runs over those only.
    const cityIds = new Set(ownedCityIds(jc.playerId))
    const targetId = aiBonusTroopTarget(gameStateRef.current, jc.playerId, t => cityIds.has(t.id))
    if (targetId) setGameState(prev => ({ ...prev, territories: { ...prev.territories, [targetId]: { ...prev.territories[targetId], troops: prev.territories[targetId].troops + 1 } } }))
    const left = targetId ? jc.troopsLeft - 1 : 0
    if (left <= 0) { joinCausePlacementRef.current = null; setJoinCausePlacement(null) }
    else { const n = { ...jc, troopsLeft: left }; joinCausePlacementRef.current = n; setJoinCausePlacement(n) }
  }

  /**
   * An AI won the population count, so it takes the troops.
   *
   * Troops over a mission swap: always valid, and the AI has no way to judge
   * which face-up mission suits it better. It goes through the same
   * `startJoinCauseTroops` a human's click does — it used to add 3 to
   * `troopsToPlace` instead, which is the CURRENT player's draft pool. The
   * winner is usually not the current player, so those troops were handed to
   * whoever happened to be taking the turn, unrestricted by cities, and were
   * overwritten outright at the next turn's reinforcement count.
   */
  function resolveAiJoinCauseChoice(leaderId: string) {
    setShowJoinTheCause(false)
    startJoinCauseTroops(leaderId)
  }

  /** An AI took the Control the People reward: 5 troops in its best city. */
  function resolveAiControlPeople(playerId: string) {
    const eligible = new Set(ownedCityIds(playerId))
    const cityId = aiBonusTroopTarget(gameStateRef.current, playerId, t => eligible.has(t.id))
    if (cityId) setGameState(prev => ({ ...prev, territories: { ...prev.territories, [cityId]: { ...prev.territories[cityId], troops: prev.territories[cityId].troops + 5 } } }))
    setControlPeopleChoice(null)
  }

  /**
   * An AI rolled lowest in a Riot: it pays from its own deepest stack.
   *
   * Says where, because a human watching the modal is otherwise told a player
   * lost 2 troops and never shown from where. The AI picks its own casualties —
   * the loss used to be routed through the same click-to-choose hint bar a human
   * gets, which handed the human the job of deciding where an opponent bleeds.
   */
  function resolveAiRiot(loserId: string) {
    const st = gameStateRef.current
    const loser = st.players.find(p => p.id === loserId)
    const loseFrom = Object.values(st.territories)
      .filter(t => t.occupyingPlayerId === loserId && t.troops > 1)
      .sort((a, b) => b.troops - a.troops)[0]
    if (loseFrom) {
      const rm = Math.min(2, loseFrom.troops - 1)
      setGameState(prev => ({ ...prev, territories: { ...prev.territories, [loseFrom.id]: { ...prev.territories[loseFrom.id], troops: prev.territories[loseFrom.id].troops - rm } } }))
      showWeaknessNotice(`🔥 Riot — ${loser?.name ?? 'Player'} lost ${rm} troop${rm !== 1 ? 's' : ''} at ${loseFrom.name}`)
    } else {
      showWeaknessNotice(`🔥 Riot — ${loser?.name ?? 'the loser'} has no territory above 1 troop; no loss`)
    }
    riotRemovalRef.current = null
    setRiotRemovalPlayerId(null)
    setRiotResult(null)
  }

  /**
   * One step of an AI's Fortify event.
   *
   * It takes the FORTIFICATION whenever one is left. A fortification is
   * permanent and the troops are not, and taking it also removes the card from
   * the campaign — so the AI is choosing the lasting board change over four
   * troops it may lose next turn. Once the supply is gone the choice makes
   * itself.
   */
  function stepAiFortifyEvent(fe: FortifyEvent) {
    const eligible = new Set(ownedCityIds(fe.playerId))
    if (eligible.size === 0) { updateFortifyEvent(null); returnEventCardToDiscard(fe.cardId); return }
    const best = (allowed: Set<string>) =>
      aiBonusTroopTarget(gameStateRef.current, fe.playerId, t => allowed.has(t.id)) ?? [...allowed][0]

    if (fe.phase === 'choice') {
      if (canPlaceFortification(legacyStateRef.current)) {
        updateFortifyEvent({ phase: 'fortification', playerId: fe.playerId, cardId: fe.cardId })
      } else {
        startFortifyTroops(fe.playerId, fe.cardId)
      }
      return
    }
    if (fe.phase === 'fortification') {
      placeFortifyEventFortification(fe.playerId, fe.cardId, best(eligible))
      return
    }
    // Troops — one city per tick, and never the same city twice.
    const unused = new Set([...eligible].filter(id => !fe.usedCityIds.includes(id)))
    if (unused.size === 0) { finishFortifyTroops(fe.cardId); return }
    const targetId = best(unused)
    setGameState(prev => ({
      ...prev,
      territories: { ...prev.territories, [targetId]: { ...prev.territories[targetId], troops: prev.territories[targetId].troops + FORTIFY_EVENT_TROOPS } },
    }))
    const left = fe.citiesLeft - 1
    if (left <= 0) finishFortifyTroops(fe.cardId)
    else updateFortifyEvent({ ...fe, citiesLeft: left, usedCityIds: [...fe.usedCityIds, targetId] })
  }

  function stepAiResistancePlacement(rp: { playerId: string; troopsLeft: number }) {
    // One troop per tick onto the most threatened border, recomputed each time
    // so the troops spread across the front instead of stacking on one spot
    // once the first has relieved the pressure there.
    const targetId = aiBonusTroopTarget(gameStateRef.current, rp.playerId)
    if (targetId) setGameState(prev => ({ ...prev, territories: { ...prev.territories, [targetId]: { ...prev.territories[targetId], troops: prev.territories[targetId].troops + 1 } } }))
    const left = rp.troopsLeft - 1
    if (left <= 0) { resistancePlacementRef.current = null; setResistancePlacement(null) }
    else { const n = { ...rp, troopsLeft: left }; resistancePlacementRef.current = n; setResistancePlacement(n) }
  }

  // ── Fortify event ──────────────────────────────────────────────────────────

  /**
   * Take the troops: +2 into each of two DIFFERENT cities.
   *
   * A leader holding only one city places into that one and stops, rather than
   * forfeiting the reward on a technicality — the same failure Join the Cause
   * had. The card is only DISCARDED, so it returns in later games.
   */
  function startFortifyTroops(playerId: string, cardId: string) {
    const cities = ownedCityIds(playerId)
    const name = gameStateRef.current.players.find(p => p.id === playerId)?.name ?? 'Player'
    const target = Math.min(FORTIFY_EVENT_CITIES, cities.length)
    updateFortifyEvent({ phase: 'troops', playerId, cardId, citiesLeft: target, usedCityIds: [] })
    logHistory(
      `⛨ Fortify — ${name} had the largest population and takes ${FORTIFY_EVENT_TROOPS} troops`
      + ` in each of ${target} ${target === 1 ? 'city' : 'cities'}`
      + (target < FORTIFY_EVENT_CITIES ? ' (all the cities they control)' : ''),
    )
  }

  /** Finish the troops option: the card goes to the discard, not the bin. */
  function finishFortifyTroops(cardId: string) {
    updateFortifyEvent(null)
    returnEventCardToDiscard(cardId)
  }

  /**
   * Take the fortification: one city is permanently fortified, and the card is
   * DESTROYED for the rest of the campaign.
   *
   * Spends one of the campaign's five fortifications — the same supply the
   * winner's reward draws from, not a separate pool.
   */
  function placeFortifyEventFortification(playerId: string, cardId: string, territoryId: string) {
    const st = gameStateRef.current
    const name = st.players.find(p => p.id === playerId)?.name ?? 'Player'
    const terrName = st.territories[territoryId]?.name ?? territoryId
    updateFortifyEvent(null)

    setLegacyState(prev => {
      // Re-checked against the state being written, not the render that drew
      // the button: the supply is finite and must not go to six.
      if (!canPlaceFortification(prev)) {
        showWeaknessNotice(`⛨ Fortify — all ${FORTIFICATION_SUPPLY} fortifications are already placed`)
        return prev
      }
      const next: LegacyState = {
        ...prev,
        stickers: [...prev.stickers, {
          id: `fortify-event-${Date.now()}`,
          name: 'Fortification',
          description: 'fortification:10',
          placement: 'territory' as const,
          targetId: territoryId,
          appliedInGame: st.gameNumber,
          placedByPlayerId: playerId,
        }],
        // Using the fortification is what destroys the card. Taking the troops
        // does not — that path calls returnEventCardToDiscard instead.
        destroyedEventCardIds: [...(prev.destroyedEventCardIds ?? []), cardId],
        historyLog: [...prev.historyLog, {
          gameNumber: st.gameNumber,
          entry: `⛨ Fortify — ${name} permanently fortified ${terrName} (10 charges)`
            + ` — ${FORTIFICATION_SUPPLY - fortificationsPlaced(prev.stickers) - 1} of ${FORTIFICATION_SUPPLY} left`
            + ' — and that event card is destroyed for the campaign',
          timestamp: new Date().toISOString(),
        }],
      }
      legacyStateRef.current = next
      saveLegacyState(next).catch(() => {})
      return next
    })
    showWeaknessNotice(`⛨ ${name} fortified ${terrName} permanently — the event card is destroyed`)
  }

  /** Ruinable minor city for an AI Die Humans: an enemy's first, then any. */
  function aiPickRuinTarget(alienPlayerId: string): string | null {
    const ls = legacyStateRef.current
    const destroyedCityIds = new Set((ls.destroyedCities ?? []).map(d => d.cityId))
    const ruinIds = new Set(ls.ruinTerritoryIds ?? [])
    const candidates = ls.stickers.filter(s =>
      s.placement === 'territory' &&
      s.description === 'city:minor' &&
      !destroyedCityIds.has(s.id) &&
      !ruinIds.has(s.targetId) &&
      !!gameStateRef.current.territories[s.targetId],
    ).map(s => s.targetId)
    const enemyHeld = candidates.find(
      tid => gameStateRef.current.territories[tid]?.occupyingPlayerId !== alienPlayerId)
    return enemyHeld ?? candidates[0] ?? null
  }

  /** Unoccupied city for an AI Beam Down — mirrors hasBeamDownTarget's filter. */
  function aiPickBeamDownTarget(): string | null {
    const ls = legacyStateRef.current
    const destroyedCityIds = new Set((ls.destroyedCities ?? []).map(d => d.cityId))
    const ruinIds = new Set(ls.ruinTerritoryIds ?? [])
    const s = ls.stickers.find(st =>
      st.placement === 'territory' &&
      st.description.startsWith('city:') &&
      !destroyedCityIds.has(st.id) &&
      !ruinIds.has(st.targetId) &&
      !gameStateRef.current.territories[st.targetId]?.occupyingPlayerId,
    )
    return s?.targetId ?? null
  }

  function aiPickLegalJoinTerritory(playerId: string): string | null {
    const st = gameStateRef.current
    void playerId
    const legal = legalJoinWarTerritoryIds(
      st.territories,
      Object.values(st.activeHqs ?? {}),
      legacyStateRef.current?.falloutZoneTerritoryId,
    )
    return legal.length > 0 ? legal[Math.floor(Math.random() * legal.length)] : null
  }

  useEffect(() => {
    const cp = gameState.players[gameState.currentPlayerIndex]
    if (!cp?.isAI || cp.isEliminated || gameState.phase === 'game-over' || showWinScreen) return
    if (aiBusyRef.current) return

    const isHuman = (pid: string | null | undefined) => {
      if (!pid) return false
      const p = gameState.players.find(pl => pl.id === pid)
      return !!p && !p.isAI
    }
    // Stand down while a HUMAN owns an open choice — the AI cannot act through
    // it. Shared with the stall banner so the two can never disagree about
    // whether the AI is stuck or simply waiting on you.
    if (humanBlockingChoice()) return

    const diff = cp.aiDifficulty ?? 'medium'
    const run = (fn: () => void, delay = aiMs(1400, 220)) => {
      aiBusyRef.current = true
      window.setTimeout(() => { aiBusyRef.current = false; fn() }, delay)
    }

    // ── Auto-resolve the AI's own interrupt modals ──
    if (firstElimInfo) { run(() => setFirstElimInfo(null)); return }
    if (comebackEliminatedPlayer?.isAI) {
      const claimed = legacyState.claimedComebackPowers ?? []
      const pick = COMEBACK_POWERS.find(c => !claimed.includes(c.id)) ?? COMEBACK_POWERS[0]
      const fId = comebackEliminatedPlayer.factionId
      run(() => {
        setLegacyState(prev => {
          const next = { ...prev, firstEliminationTriggered: true,
            comebackPowers: { ...(prev.comebackPowers ?? {}), [fId]: pick.id },
            claimedComebackPowers: [...(prev.claimedComebackPowers ?? []), pick.id] }
          saveLegacyState(next).catch(() => {})
          return next
        })
        setComebackEliminatedPlayer(null)
      })
      return
    }
    // Lead faction mission pick belonging to an AI — take the first option.
    if (leadMissionPick && !isHuman(leadMissionPick.playerId)) {
      const first = leadMissionPick.options[0]
      run(() => { if (first) handleLeadMissionPick(first); else setLeadMissionPick(null) })
      return
    }
    if (joinTheWarPlayerId && !isHuman(joinTheWarPlayerId)) {
      const tid = aiPickLegalJoinTerritory(joinTheWarPlayerId)
      run(() => { if (tid) handleJoinWar(tid); else handleForfeitWar() })
      return
    }
    if (missilePowerPendingPlayerId && !isHuman(missilePowerPendingPlayerId)) {
      const claimed = legacyState.claimedMissilePowers ?? []
      const pick = MISSILE_POWERS.find(m => !claimed.includes(m.id))
      run(() => { if (pick) handleMissilePowerSelect(pick.id); else setMissilePowerPendingPlayerId(null) })
      return
    }
    // AI never plays scar cards — skip any pending scar placement
    if (scarTarget || activeCardId) { run(() => { setScarTarget(null); setTriggeredCard(null); setActiveCardId(null); activeCardIdRef.current = null }); return }
    // Closing the card is what RESOLVES most events, so the AI has to go
    // through the same handler a human's click does — not just hide the modal.
    if (showEventCard) { run(() => resolveEventCardDismiss(currentEventCardId)); return }
    // AI-owned event choices — resolve simply
    if (resistancePlacement && !isHuman(resistancePlacement.playerId)) {
      run(() => stepAiResistancePlacement(resistancePlacement))
      return
    }
    if (joinCausePlacement && !isHuman(joinCausePlacement.playerId)) {
      run(() => stepAiJoinCausePlacement(joinCausePlacement))
      return
    }
    if (fortifyEvent && !isHuman(fortifyEvent.playerId)) {
      run(() => stepAiFortifyEvent(fortifyEvent))
      return
    }
    if (controlPeopleChoice && !isHuman(controlPeopleChoice)) {
      // Troops over the maneuver: always valid, and worth more than a move the
      // AI has no way to plan around.
      run(() => resolveAiControlPeople(controlPeopleChoice))
      return
    }
    // ── Event follow-ups owned by an AI faction ──
    // These open only now that the AI resolves event dismissals properly; without
    // them an AI-owned Die Humans or Beam Down would sit unanswered forever.
    if (dieHumansPendingCardId) {
      const alienId = gameState.players.find(p => p.factionId === 'aliens' && !p.isEliminated)?.id
      if (alienId && !isHuman(alienId)) {
        const target = aiPickRuinTarget(alienId)
        run(() => { if (target) handleDieHumansRuin(target); else handleDieHumansDecline() })
        return
      }
    }
    if (beamDownActive) {
      const alienId = gameState.players.find(p => p.factionId === 'aliens' && !p.isEliminated)?.id
      if (alienId && !isHuman(alienId)) {
        const target = aiPickBeamDownTarget()
        run(() => { if (target) handleBeamDown(target); else setBeamDownActive(false) })
        return
      }
    }
    if (mutantsEvolvePendingCardId) {
      const mutantId = gameState.players.find(p => p.factionId === 'mutants' && !p.isEliminated)?.id
      if (mutantId && !isHuman(mutantId)) {
        // The pairing reveals a HIDDEN permanent power — there is nothing to
        // choose on merit, so the AI declines and the card returns to the deck.
        run(() => { returnEventCardToDiscard(mutantsEvolvePendingCardId); setMutantsEvolvePendingCardId(null) })
        return
      }
    }
    if (showJoinTheCause) {
      const leaderId = largestPopulationPlayerId()
      if (leaderId && !isHuman(leaderId)) {
        run(() => resolveAiJoinCauseChoice(leaderId))
        return
      }
    }
    if (riotResult && !isHuman(riotResult.loserId)) {
      run(() => resolveAiRiot(riotResult.loserId))
      return
    }

    // Card draw belonging to the AI (end-of-turn / event / Balkania)
    if (pendingCardDraws[0] && !isHuman(pendingCardDraws[0])) {
      const drawerId = pendingCardDraws[0]
      const sideboard = cardState.sideboard ?? []
      const drawerHomeland = playerHomeland(drawerId)
      const ownedFaceUp = sideboard.find(id => {
        const tId = getTerritoryCard(id)?.territoryId
        return !!tId && canClaimTerritoryCard(drawerId, tId, gameState.territories, drawerHomeland)
      })
      const resource = (cardState.resourceDeck ?? cardState.coinDeck ?? [])[0]
      run(() => {
        // Never offer a pick the draw rules reject — the handler would bounce it
        // and the queue would never advance. A Purist already holding 2 coins
        // with nothing face-up to claim has no legal draw, so it skips.
        if (ownedFaceUp && !cardDrawBlockReason(drawerId, ownedFaceUp, false, false)) handleCardDrawSelect(ownedFaceUp, false)
        else if (resource && !cardDrawBlockReason(drawerId, resource, true, false)) handleCardDrawSelect(resource, true)
        else setPendingCardDraws(prev => prev.slice(1))
      })
      return
    }
    if (balkExpansionPending && !isHuman(balkExpansionPending)) {
      const balkId = balkExpansionPending
      const balkHomeland = playerHomeland(balkId)
      // Face-up cards it controls come first, exactly as in a normal AI draw —
      // taking the coin instead is now an illegal pick, not just a poor one.
      const balkFaceUp = (cardState.sideboard ?? []).find(id => {
        const tId = getTerritoryCard(id)?.territoryId
        return !!tId && canClaimTerritoryCard(balkId, tId, gameState.territories, balkHomeland)
      })
      const resource = (cardState.resourceDeck ?? cardState.coinDeck ?? [])[0]
      run(() => {
        if (balkFaceUp && !cardDrawBlockReason(balkId, balkFaceUp, false, false)) handleBalkExpansionSelect(balkFaceUp, false)
        else if (resource && !cardDrawBlockReason(balkId, resource, true, false)) handleBalkExpansionSelect(resource, true)
        else setBalkExpansionPending(null)
      })
      return
    }

    // Combat / advance modals drive themselves (autoPlay) — wait for them.
    if (showCombat || showAdvance) return

    // ── Phase loop ──
    if (gameState.phase === 'reinforce') {
      // Cash cards in BEFORE placing — the troops from a trade-in join this
      // draft. Uses the same coin math as the human hand, so upgraded and
      // multi-coin territory cards are priced identically.
      if (!aiTradedThisTurnRef.current) {
        const decision = aiTradeInDecision(cp.cards, legacyState.cardResources, diff, {
          rivalOnMatchPoint: rivalsOnMatchPoint(gameState, legacyState, cp.id).length > 0,
        })
        aiTradedThisTurnRef.current = true
        if (decision) {
          run(() => {
            console.log(`[AI] ${cp.name} trades ${decision.cardIds.length} cards / ${decision.totalCoins} coins for ${decision.troops} troops — ${decision.reason}`)
            handleTradeIn(decision.cardIds, decision.troops)
          }, aiMs(700, 130))
          return
        }
      }
      if (troopsToPlace > 0) {
        const plan = aiReinforcePlacements(gameState, legacyState, cp.id, 1, diff)
        const tid = plan[0] ?? Object.values(gameState.territories).find(t => t.occupyingPlayerId === cp.id)?.id
        if (tid) run(() => {
          playTroop()
          dispatch({ type: 'PLACE_REINFORCEMENT', playerId: cp.id, territoryId: tid })
          setTroopsToPlace(prev => prev - 1)
          setPlacementHistory(prev => [...prev, tid])
          bumpDraftPlaced(tid)
        }, aiMs(600, 110))
      } else {
        aiAttacksThisTurnRef.current = 0
        run(() => { setPlacementHistory([]); dispatch({ type: 'END_REINFORCE_PHASE' }) })
      }
      return
    }

    if (gameState.phase === 'attack') {
      const cap = diff === 'hard' ? 12 : diff === 'medium' ? 8 : 4
      if (aiAttacksThisTurnRef.current >= cap) { run(() => handleNextPhase()); return }
      const plan = aiAttackPlan(gameState, legacyState, cp.id, diff)
      const order = plan.find(o => {
        const s = gameState.territories[o.srcId], t = gameState.territories[o.tgtId]
        return s && t && s.occupyingPlayerId === cp.id && s.troops > 1 && t.occupyingPlayerId !== cp.id &&
          !gameState.turn.shieldedTerritoryIds.includes(o.tgtId) && !activeEffects.has('ceasefire') &&
          hypnosisProtected?.territoryId !== o.tgtId
      })
      if (!order) { run(() => handleNextPhase()); return }
      run(() => {
        aiAttacksThisTurnRef.current += 1
        const src = gameState.territories[order.srcId]
        const tgt = gameState.territories[order.tgtId]
        const uncontested = (tgt?.troops ?? 0) === 0
        attackSrcRef.current = order.srcId; setAttackSrcId(order.srcId)
        // Flight animation first — show who is attacking whom, THEN open combat
        const flightMs = aiMs(1000, 260)
        if (!uncontested) showAttackFlight(order.srcId, order.tgtId, 'attack', '⚔', flightMs)
        aiBusyRef.current = true
        window.setTimeout(() => {
          aiBusyRef.current = false
          if (uncontested) {
            // Uncontested move — resolve directly (no interactive panel for AI).
            // The AI has no slider to clamp, so the entry cost is checked here:
            // moving in fewer troops than the cost used to be rounded back up to
            // 1 survivor, letting an AI walk into a major city for 1 troop or
            // even none. Expand only when the cost can actually be paid.
            const moving = Math.max(1, (src?.troops ?? 1) - 1)
            const aiFaction = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]?.factionId ?? ''
            const aiCost = entryCostBreakdown(order.tgtId, tgt, aiFaction, true)
            if (moving >= minTroopsToEnter(aiCost)) {
              advanceSrcRef.current = order.srcId; advanceTgtRef.current = order.tgtId
              handleAdvanceConfirm(moving)
            } else {
              console.log(`[AI] skipping ${order.tgtId} — ${moving} troops cannot pay the ${aiCost.total}-troop entry cost`)
            }
          } else {
            attackTgtRef.current = order.tgtId; setAttackTgtId(order.tgtId); setShowCombat(true)
          }
        }, uncontested ? 0 : flightMs)
      })
      return
    }

    if (gameState.phase === 'fortify') {
      const move = aiFortifyMove(gameState, cp.id, (srcId) => connectedOwnedIds(srcId, cp.id, gameState.territories, fzNoTraverse()))
      run(() => {
        if (move) {
          setGameState(prev => {
            const s = prev.territories[move.srcId], d = prev.territories[move.dstId]
            if (!s || !d) return prev
            const n = Math.min(move.troops, s.troops - 1)
            if (n < 1) return prev
            return { ...prev, territories: { ...prev.territories, [move.srcId]: { ...s, troops: s.troops - n }, [move.dstId]: { ...d, troops: d.troops + n } } }
          })
        }
        // Stay "busy" across the inner delay. `run` clears the flag before this
        // callback, and the setGameState above re-renders — without re-arming it
        // the (dependency-free) driver would re-enter the still-'fortify' phase
        // and queue a SECOND handleNextPhase, ending the next player's turn too.
        aiBusyRef.current = true
        window.setTimeout(() => {
          aiBusyRef.current = false
          handleNextPhase()
        }, aiMs(600, 130))
      })
      return
    }
  })

  // ── AI stall watchdog ──────────────────────────────────────────────────────
  // The driver is dependency-free, so it re-enters on every render and normally
  // cannot get wedged. What CAN wedge it is `aiBusyRef` left set, or a state it
  // has no branch for. Either way the turn silently stops and the board looks
  // like an unresponsive human seat. Notice that and offer a nudge rather than
  // leaving the game apparently broken.
  //
  // Progress is judged from the board itself, not just the phase, because the
  // whole attack phase happens without the phase changing.
  // Derived locally: `currentPlayer` is declared further down the component.
  const aiTurnPlayer = gameState.players[gameState.currentPlayerIndex]
  const aiTurnActive = !!aiTurnPlayer?.isAI
    && !aiTurnPlayer.isEliminated
    && gameState.phase !== 'game-over'
    && !showWinScreen
  let troopSum = 0, ownerSum = 0
  for (const t of Object.values(gameState.territories)) {
    troopSum += t.troops
    ownerSum += t.occupyingPlayerId ? t.occupyingPlayerId.length + t.occupyingPlayerId.charCodeAt(1) : 0
  }
  const aiProgressKey = [
    gameState.turnNumber, gameState.phase, gameState.currentPlayerIndex,
    troopsToPlace, troopSum, ownerSum, aiNudge,
    // Waiting behind a human is not a stall, and the modals below animate
    // themselves — treat any change in those as progress too.
    humanBlockingChoice() ?? '', showCombat, showAdvance,
  ].join('|')

  useEffect(() => {
    setAiStalled(false)
    if (!aiTurnActive) return
    // Generous: a multi-round auto-resolve with animations can run for seconds.
    const timer = window.setTimeout(() => setAiStalled(true), 20000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTurnActive, aiProgressKey])

  /**
   * Drives the board-picked event rewards when the player they belong to is an
   * AI but the turn belongs to someone else.
   *
   * Resistance, Join the Cause, Control the People and Riot are handed to a
   * player the BOARD picks — fewest territories, largest population, lowest
   * roll — not to whoever is taking the turn. The main AI loop only runs while
   * an AI is the current player, so an AI owed one of these on a human's turn
   * had nobody to resolve it: the hint bar sat there naming a player whose
   * territories the human cannot click.
   *
   * END_TURN used to sweep them away, which hid this. Now that they survive the
   * turn — they must, or the human winner loses the reward — an unresolved
   * AI-owned one would sit forever, so this closes that door.
   *
   * Runs only while the main loop is standing down, and shares `aiBusyRef` with
   * it, so exactly one of the two ever acts.
   */
  useEffect(() => {
    const cp = gameState.players[gameState.currentPlayerIndex]
    if (cp?.isAI && !cp.isEliminated) return          // the main loop has it
    if (gameState.phase === 'game-over' || showWinScreen) return
    if (aiBusyRef.current) return

    const isAiOwned = (pid: string | null | undefined) => {
      if (!pid) return false
      const p = gameState.players.find(x => x.id === pid)
      return !!p && !!p.isAI && !p.isEliminated
    }
    const step = (fn: () => void) => {
      aiBusyRef.current = true
      window.setTimeout(() => { aiBusyRef.current = false; fn() }, aiMs(900, 180))
    }

    if (showJoinTheCause) {
      const leaderId = largestPopulationPlayerId()
      if (isAiOwned(leaderId)) { step(() => resolveAiJoinCauseChoice(leaderId!)); return }
    }
    if (joinCausePlacement && isAiOwned(joinCausePlacement.playerId)) {
      step(() => stepAiJoinCausePlacement(joinCausePlacement)); return
    }
    if (resistancePlacement && isAiOwned(resistancePlacement.playerId)) {
      step(() => stepAiResistancePlacement(resistancePlacement)); return
    }
    if (controlPeopleChoice && isAiOwned(controlPeopleChoice)) {
      step(() => resolveAiControlPeople(controlPeopleChoice)); return
    }
    if (fortifyEvent && isAiOwned(fortifyEvent.playerId)) {
      step(() => stepAiFortifyEvent(fortifyEvent)); return
    }
    // Riot is deliberately absent. Its modal is the only place the rolls are
    // ever shown, so on YOUR turn it waits for you to read it — the button
    // resolves an AI loser itself. Auto-dismissing here would flash the dice
    // past you and settle an event you never saw.
    if (riotRemovalPlayerId && isAiOwned(riotRemovalPlayerId)) {
      // Only reachable from a save written before the modal took this over.
      step(() => resolveAiRiot(riotRemovalPlayerId)); return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJoinTheCause, joinCausePlacement, resistancePlacement, controlPeopleChoice,
      fortifyEvent, riotRemovalPlayerId, showWinScreen, gameState.currentPlayerIndex,
      gameState.phase, gameState.players])

  // ── Missile replenishment: every game starts with one missile per career win ──
  useEffect(() => {
    const ls = legacyStateRef.current
    if (ls.missilesReplenishedGame === gameState.gameNumber) return
    // Only at a fresh game start — never refill spent missiles on a mid-game resume
    if (gameState.turnNumber !== 1 || gameState.currentPlayerIndex !== 0 || gameState.phase !== 'reinforce') return
    setLegacyState(prev => {
      if (prev.missilesReplenishedGame === gameState.gameNumber) return prev
      const missiles = { ...(prev.missiles ?? {}) }
      const granted: string[] = []
      for (const p of gameState.players) {
        // Career wins; fall back to signatures on the board for campaigns that
        // predate playerWins (resolved by roster id, not by name)
        const wins = (prev.playerWins ?? {})[p.id] ?? playerSignatureCount(prev, p.id)
        missiles[p.id] = wins
        if (wins > 0) granted.push(`${p.name} ×${wins}`)
      }
      const next: LegacyState = {
        ...prev,
        missiles,
        missilesReplenishedGame: gameState.gameNumber,
        historyLog: granted.length > 0
          ? [...prev.historyLog, {
              gameNumber: gameState.gameNumber,
              entry: `🚀 Missiles replenished — one per career win: ${granted.join(', ')}`,
              timestamp: new Date().toISOString(),
            }]
          : prev.historyLog,
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Bringer of Nuclear Fire: +2 missiles in games where Mutants play ──────
  useEffect(() => {
    const ls = legacyStateRef.current
    if (!ls.nuclearMilestoneTriggered || !ls.nuclearBringerFactionId) return
    if (ls.bringerBonusMissilesGame === gameState.gameNumber) return
    const bringer = gameState.players.find(p => p.factionId === ls.nuclearBringerFactionId)
    const mutants = gameState.players.find(p => p.factionId === 'mutants')
    if (!bringer || !mutants) return
    setLegacyState(prev => {
      if (prev.bringerBonusMissilesGame === gameState.gameNumber) return prev
      const missiles = { ...(prev.missiles ?? {}), [bringer.id]: ((prev.missiles ?? {})[bringer.id] ?? 0) + 2 }
      const next: LegacyState = {
        ...prev,
        missiles,
        bringerBonusMissilesGame: gameState.gameNumber,
        historyLog: [...prev.historyLog, {
          gameNumber: gameState.gameNumber,
          entry: `☢ ${bringer.name} (Bringer of Nuclear Fire) received 2 bonus missiles — the Mutants are in play`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Mutants star power: control all bio-hazard territories + the FZ ───────
  useEffect(() => {
    if (!legacyState.nuclearMilestoneTriggered || legacyState.mutantStarPowerClaimed) return
    const mutantPlayer = gameState.players.find(p => p.factionId === 'mutants' && !p.isEliminated)
    if (!mutantPlayer) return
    const bioIds = [...new Set(legacyState.scars.filter(s => s.type === 'biological').map(s => s.territoryId))]
    const fzId = legacyState.falloutZoneTerritoryId
    const targets = [...bioIds, ...(fzId ? [fzId] : [])]
    if (targets.length === 0) return
    const controlsAll = targets.every(tid => gameState.territories[tid]?.occupyingPlayerId === mutantPlayer.id)
    if (!controlsAll) return
    setLegacyState(prev => {
      if (prev.mutantStarPowerClaimed) return prev
      let next: LegacyState = { ...prev, mutantStarPowerClaimed: true }
      next = awardRedStars(next, mutantPlayer.id, 1, mutantPlayer.name, gameState.gameNumber)
      saveLegacyState(next).catch(() => {})
      return next
    })
    setAlienStarBanner(`🧟 WASTELAND KINGS — ${mutantPlayer.name} controls every bio-hazard territory and the Fallout Zone, earning 1 red star!`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.territories])

  // ── Alien Invasion Milestone detection ───────────────────────────────────
  useEffect(() => {
    if (gameState.phase !== 'reinforce') return
    if (legacyState.alienMilestoneTriggered) return
    if (showAlienMilestone) return
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    if (!currentPlayer) return
    const hasMissile = ((legacyState.missiles ?? {})[currentPlayer.id] ?? 0) > 0
    if (!hasMissile) return
    if (troopsToPlace >= 30) {
      setShowAlienMilestone(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [troopsToPlace, gameState.phase, gameState.currentPlayerIndex])

  // ── Weakness power helpers ────────────────────────────────────────────────
  function factionWeaknessOf(factionId: string): string | undefined {
    return (legacyStateRef.current?.alienWeaknessPowers ?? {})[factionId]
  }

  /** Fortify moves may not pass through the Fallout Zone — except for the
   *  Mutants, who maneuver through it freely */
  function fzNoTraverse(): Set<string> | undefined {
    const id = legacyStateRef.current?.falloutZoneTerritoryId
    if (!id) return undefined
    const cp = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]
    if (cp?.factionId === 'mutants') return undefined
    return new Set([id])
  }

  /** Fortification entry cost: capturing a fortified territory costs 2 extra troops.
   *  Covers both city fortification stickers (with charges left) and fortification scars. */
  function fortificationEntryPenalty(territoryId: string, territory: Territory | undefined): number {
    const hasSticker = (legacyStateRef.current?.stickers ?? []).some(s =>
      s.targetId === territoryId &&
      s.description.startsWith('fortification:') &&
      parseInt(s.description.split(':')[1] ?? '0', 10) > 0,
    )
    const hasScar = (territory?.scars ?? []).some(s => s.type === 'fortification')
    return (hasSticker || hasScar) ? 2 : 0
  }

  /** Entry-cost rule: city and fortification losses apply ONLY when expanding
   *  into an UNOCCUPIED territory. Winning a battle against a defended city
   *  costs nothing extra (Unpopular weakness and the Fallout Zone still apply).
   *  Both capture paths and the previews all flow through this one function. */
  function entryCostBreakdown(
    territoryId: string,
    territory: Territory | undefined,
    attackerFactionId: string,
    wasEmpty: boolean,
  ): { total: number; parts: string[]; falloutHalf: boolean } {
    const parts: string[] = []
    const ls = legacyStateRef.current
    // Cities are read from the legacy stickers — the campaign's source of
    // truth — so entry costs can never be dodged by stale live territory state
    const destroyedCityIds = new Set((ls?.destroyedCities ?? []).map(d => d.cityId))
    const cityStickers = (ls?.stickers ?? []).filter(s =>
      s.placement === 'territory' && s.targetId === territoryId &&
      s.description.startsWith('city:') && !destroyedCityIds.has(s.id),
    )
    const isWorldCapital = territoryId === ls?.worldCapitalTerritoryId
    // The World Capital counts as a city (worth 5) for entry — its own city
    // stickers aren't also charged (no double dip), mirroring population.
    const hasActiveCity = cityStickers.length > 0 || isWorldCapital
    let cityPenalty = 0
    let fortPenalty = 0
    if (wasEmpty) {
      if (isWorldCapital) {
        cityPenalty += 5
        parts.push('World Capital −5')
      } else {
        for (const city of cityStickers) {
          const isMajor = city.description === 'city:major'
          cityPenalty += isMajor ? 2 : 1
          parts.push(isMajor ? 'major city −2' : 'minor city −1')
        }
      }
      fortPenalty = fortificationEntryPenalty(territoryId, territory)
      if (fortPenalty > 0) parts.push('fortification −2')
      // Alien Collaborator: 2 extra troops lost expanding into empty cities
      if (cityPenalty > 0 && attackerFactionId === ls?.alienCollaboratorFactionId) { cityPenalty += 2; parts.push('Alien Collaborator −2') }
      // Aliens starting power: no troop loss expanding into empty cities
      if (cityPenalty > 0 && attackerFactionId === 'aliens') {
        cityPenalty = 0; fortPenalty = 0
        parts.length = 0
        parts.push('Aliens — no entry loss')
      }
    }
    // Unpopular weakness: +1 troop lost expanding into ANY city, occupied or empty
    if (hasActiveCity && (ls?.alienWeaknessPowers ?? {})[attackerFactionId] === 'wp-unpopular') {
      cityPenalty += 1
      parts.push('Unpopular −1')
    }
    const falloutHalf = territoryId === ls?.falloutZoneTerritoryId && attackerFactionId !== 'mutants'
    if (falloutHalf) parts.push('Fallout Zone — half troops lost')
    return { total: cityPenalty + fortPenalty, parts, falloutHalf }
  }

  // ── Missile power activation helpers ──────────────────────────────────────
  function factionHasMissilePower(factionId: string, powerId: string): boolean {
    return ((legacyStateRef.current?.missilePowers ?? {})[factionId] ?? []).includes(powerId)
  }

  /** Mutant Evolve power revealed via The Mutants Evolve events */
  function mutantHasEvolvePower(powerId: string): boolean {
    return (legacyStateRef.current?.mutantEvolvePowers ?? []).includes(powerId)
  }

  /** Discards a missile and marks the power used this turn. Returns false if
   *  the player has no missiles or already used this power this turn. */
  function activateMissilePower(playerId: string, powerId: string, powerName: string): boolean {
    if (usedMissilePowersRef.current.has(powerId)) return false
    const available = (legacyStateRef.current?.missiles ?? {})[playerId] ?? 0
    if (available <= 0) return false
    const playerName = gameStateRef.current.players.find(p => p.id === playerId)?.name ?? playerId
    setLegacyState(prev => {
      const missiles = { ...(prev.missiles ?? {}), [playerId]: Math.max(0, ((prev.missiles ?? {})[playerId] ?? 0) - 1) }
      const next: LegacyState = {
        ...prev,
        missiles,
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `🚀 ${playerName} discarded a missile to activate ${powerName}`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    const used = new Set(usedMissilePowersRef.current).add(powerId)
    usedMissilePowersRef.current = used
    setUsedMissilePowersThisTurn(used)
    return true
  }

  function activateStealthy() {
    const p = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]
    if (!p) return
    if (!activateMissilePower(p.id, 'mp-stealthy', 'Stealthy')) return
    stealthyModeRef.current = true
    setStealthyMode(true)
  }

  function activateConvincing() {
    const p = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]
    if (!p) return
    if (!activateMissilePower(p.id, 'mp-convincing', 'Convincing')) return
    // +1 extra troop on every Mercenary territory the player controls
    setGameState(prev => {
      let territories = { ...prev.territories }
      for (const [id, t] of Object.entries(territories)) {
        if (t.occupyingPlayerId === p.id && t.scars.some(s => s.type === 'mercenary')) {
          territories = { ...territories, [id]: { ...t, troops: t.troops + 1 } }
        }
      }
      return { ...prev, territories }
    })
  }

  function activateRally() {
    const p = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]
    if (!p) return
    if (!activateMissilePower(p.id, 'mp-rally', 'Rally')) return
    // +2 troops on every HQ territory the player controls (own or captured)
    setGameState(prev => {
      let territories = { ...prev.territories }
      for (const [id, t] of Object.entries(territories)) {
        if (t.occupyingPlayerId === p.id && t.activeHqPlayerId) {
          territories = { ...territories, [id]: { ...t, troops: t.troops + 2 } }
        }
      }
      return { ...prev, territories }
    })
  }

  function showWeaknessNotice(msg: string) {
    setWeaknessNotice(msg)
    if (weaknessNoticeTimer.current) clearTimeout(weaknessNoticeTimer.current)
    weaknessNoticeTimer.current = setTimeout(() => setWeaknessNotice(null), 3500)
  }

  /**
   * The cards `playerId` would legally be allowed to take on a draw right now:
   * the face-up cards they can claim (territory they hold, or anywhere in their
   * homeland), or — if they can claim none — the top of the resource pile.
   *
   * Mirrors the draw rules enforced in handleCardDrawSelect and the draw modal.
   */
  function eligibleDrawCardIds(playerId: string): string[] {
    const st = gameStateRef.current
    const homeland = playerHomeland(playerId)
    const claimable = (cardState.sideboard ?? []).filter(id => {
      const tId = getTerritoryCard(id)?.territoryId
      return !!tId && canClaimTerritoryCard(playerId, tId, st.territories, homeland)
    })
    if (claimable.length > 0) return claimable
    const resource = (cardState.resourceDeck ?? cardState.coinDeck ?? [])[0]
    return resource ? [resource] : []
  }

  /**
   * World Capital mission: the territories of the 4+ coin cards this player is
   * ELIGIBLE to take right now. Empty means the mission's condition is not met.
   *
   * Eligibility is the whole condition — they never actually take the card.
   * Coin values are read live, so a card raised to 4 by the runner-up upgrade
   * qualifies at its upgraded value. The territories come back because the
   * Capital is placed on the one matching the card that earned it; only face-up
   * territory cards can reach 4 coins (resource-pile cards are always worth 1),
   * so a qualifying card always has a territory.
   */
  function richCardTerritoryIds(playerId: string): string[] {
    const res = legacyStateRef.current?.cardResources
    const ids: string[] = []
    for (const cardId of eligibleDrawCardIds(playerId)) {
      if (cardCoinValue(res, cardId) < 4) continue
      const tId = getTerritoryCard(cardId)?.territoryId
      if (tId && !ids.includes(tId)) ids.push(tId)
    }
    return ids
  }

  /**
   * Commit the World Capital to `territoryId` and close out the milestone.
   *
   * The Capital sticker goes ON TOP of whatever city is already there, so any
   * city on that territory is covered — recorded in `destroyedCities`, which is
   * what every city reader consults. The sticker stays in `stickers`: it has been
   * spent, so it must keep counting against the 5-major / 9-minor limits.
   *
   * Everything lands in ONE legacy write. Splitting it (deck seed in a
   * setCardState updater, Capital in a separate setLegacyState) is what used to
   * lose the Capital: the updater rebuilt legacy from a `legacyStateRef` that had
   * not yet seen the Capital, and React applied that stale copy last.
   */
  function placeWorldCapital(
    territoryId: string,
    completingPlayer: Player,
    /**
     * Card state to build on. `cardState` is a render-scoped value, so a caller
     * that has ALREADY queued a card update this tick must hand its own newer
     * copy in — completeMission does exactly that when it flips the next mission
     * face up, and passing its `cardState` here would undo that flip.
     */
    baseCards: ActiveGameCards = cardState,
  ) {
    const gameNumber = gameStateRef.current.gameNumber
    const territoryName = gameStateRef.current.territories[territoryId]?.name ?? territoryId

    // Placing the World Capital unlocks the private missions: shuffle them into
    // the SAME deck as the standard ones, so the face-up card may be either kind
    // from here on.
    const seedPrivate = !legacyStateRef.current?.privateMissionsSeeded
    const nextCards: ActiveGameCards = seedPrivate
      ? { ...baseCards, missionDeck: seedPrivateMissions(
          baseCards.missionDeck ?? [],
          legacyStateRef.current?.destroyedMissionIds ?? [],
          `${gameNumber}:${territoryId}`,
        ) }
      : baseCards
    if (seedPrivate) setCardState(nextCards)

    const replaced = worldCapitalReplacedCities(
      legacyStateRef.current?.stickers, legacyStateRef.current?.destroyedCities,
      territoryId, completingPlayer.id, gameNumber)
    const replacedNames = replaced.replacedNames
    const stamp = new Date().toISOString()
    const log = [{ gameNumber, timestamp: stamp,
      entry: `${completingPlayer.name} placed the World Capital at ${territoryName}` }]
    if (replacedNames.length > 0) {
      log.push({ gameNumber, timestamp: stamp,
        entry: `The World Capital covers ${replacedNames.join(' and ')} — that city is gone` })
    }
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        privateMissionsSeeded: true,
        worldCapitalTerritoryId: territoryId,
        activeGameCards: nextCards,
        destroyedCities: [...(prev.destroyedCities ?? []), ...replaced.replaced],
        historyLog: [...prev.historyLog, ...log],
      }
      legacyStateRef.current = next
      saveLegacyState(next).catch(() => {})
      return next
    })

    // The board reads cities off gameState, so drop the covered ones there too —
    // otherwise the old city keeps paying population until the next game rebuild.
    const covered = new Set(replaced.replaced.map(r => r.cityId))
    if (covered.size > 0) {
      const t = gameStateRef.current.territories[territoryId]
      if (t) {
        const patched = {
          ...t,
          cities: t.cities.map(c => covered.has(c.id)
            ? { ...c, isDestroyed: true, destroyedInGame: gameNumber }
            : c),
        }
        const territories = { ...gameStateRef.current.territories, [territoryId]: patched }
        gameStateRef.current = { ...gameStateRef.current, territories }
        setGameState(prev => ({ ...prev, territories: { ...prev.territories, [territoryId]: patched } }))
      }
    }

    showWeaknessNotice(
      replacedNames.length > 0
        ? `⌃ The World Capital rises at ${territoryName}, burying ${replacedNames.join(' and ')}`
        : `⌃ The World Capital rises at ${territoryName}`)

    setShowWorldCapitalModal(false)
    setWorldCapitalCompletingId(null)
  }

  /** Lead faction picks the starting face-up mission; the rest stay in the deck. */
  function handleLeadMissionPick(missionId: string) {
    const deck = (cardState.missionDeck ?? []).filter(id => id !== missionId)
    const next: ActiveGameCards = { ...cardState, missionDeck: deck, currentMissionId: missionId }
    setCardState(next)
    setLegacyState(prev => {
      const newLegacy: LegacyState = { ...prev, activeGameCards: next }
      legacyStateRef.current = newLegacy
      saveLegacyState(newLegacy).catch(() => {})
      return newLegacy
    })
    setLeadMissionPick(null)
  }

  // ── Territory card award: queue a sideboard draw for the player ──────────
  /** Returns false when the draw was declined in favour of a mission. */
  function awardTerritoryCard(playerId: string): boolean {
    // World Capital mission: if it is face-up and this player could take a 4+
    // coin card, they FORGO the draw and complete the mission instead — the
    // red stars and the World Capital replace the card. Because no card is
    // drawn, the normal "drawing forfeits your mission" rule is satisfied
    // rather than bypassed.
    const richTerritoryIds = cardState.currentMissionId === 'mc-world-capital'
      ? richCardTerritoryIds(playerId)
      : []
    if (richTerritoryIds.length > 0
        && playerId === gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]?.id) {
      console.log(`[CardAward] World Capital — ${playerId} forgoes the draw to claim the mission`
        + ` (Capital goes to ${richTerritoryIds.join(' / ')})`)
      setTurn({ eligibleForRichCard: true, richCardTerritoryIds: richTerritoryIds })
      const name = gameStateRef.current.players.find(p => p.id === playerId)?.name ?? 'Player'
      showWeaknessNotice(`⌃ ${name} could claim a 4+ coin card — forgoing the draw to take the World Capital instead`)
      return false
    }
    // Any other mission already earned: same deal. The player is not offered the
    // choice between a card and the mission — the mission is worth more, so the
    // card is never queued and the red star is the reward. (A mission earned
    // LATER in the turn is caught when the attack phase ends; see
    // dropCardDrawForMission.)
    if (playerId === gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]?.id
        && missionEarnedBy(playerId)) {
      const name = gameStateRef.current.players.find(p => p.id === playerId)?.name ?? 'Player'
      const md = CARD_LOOKUP.get(cardState.currentMissionId ?? '') as import('@/types/card').MissionCard | undefined
      console.log(`[CardAward] Mission already earned by ${playerId} — no card queued`)
      showWeaknessNotice(
        `🎯 ${name} completed ${md?.name ?? 'the mission'} — no card this turn; the red star is awarded as the turn ends`)
      return false
    }
    console.log(`[CardAward] awardTerritoryCard — queuing draw for ${playerId}`)
    setPendingCardDraws(prev => [...prev, playerId])
    return true
  }

  // ── Called when player selects a card from the sideboard modal ────────────
  // ── Event trigger ──────────────────────────────────────────────────────────
  // Events fire only when a player takes a sideboard card and the fresh card that
  // slides into spot 1 shows an EVEN coin value. Draws the top event card, shows
  // it, and applies its effect. (The interactive milestone events are resolved by
  // the EventCardDisplay's onDismiss handler.)
  function triggerEventCard(
    /** The caller has usually just committed a card change (the draw that fired
     *  this event); it must pass that copy, because `cardState` still holds the
     *  pre-draw render value. */
    baseCards: ActiveGameCards = cardState,
  ) {
    let deck = [...baseCards.eventDeck]
    let discard = [...baseCards.eventDiscard]
    if (deck.length === 0) {
      // Properly shuffled — a random comparator barely moves the discard pile,
      // so the events would come back round in nearly the order they went in.
      deck = shuffle(discard)
      discard = []
    }
    if (deck.length === 0) return  // no events left to trigger
    const cardId = deck.shift()!
    const evCard = getEventCard(cardId)
    if (evCard && !evCard.removeAfterUse) discard = [...discard, cardId]
    setCurrentEventCardId(cardId)
    setShowEventCard(true)

    const effect = EVENT_EFFECTS[cardId]
    if (effect) {
      // Round-scoped active effects
      const nextEffects = new Set(activeEffectsRef.current)
      if (effect.kind === 'ceasefire') nextEffects.add('ceasefire')
      if (effect.kind === 'ammunition-shortage') nextEffects.add('ammunition-shortage')
      if (effect.kind === 'nuclear-fallout-round') nextEffects.add('nuclear-fallout-round')
      if (effect.kind === 'forced-march') { nextEffects.add('forced-march'); setFortifyMovesLeft(2) }
      activeEffectsRef.current = nextEffects
      setActiveEffects(nextEffects)
      // Immediate troop effects
      if (effect.kind === 'population-boom') setTroopsToPlace(t => t + effect.bonusTroops)
      // Resistance: the player with the FEWEST territories immediately places bonus troops
      if (effect.kind === 'resistance') {
        const state = gameStateRef.current
        const counts = state.players
          .filter(p => !p.isEliminated)
          .map(p => ({ p, count: Object.values(state.territories).filter(t => t.occupyingPlayerId === p.id).length }))
        if (counts.length > 0) {
          const min = Math.min(...counts.map(c => c.count))
          const target = counts.find(c => c.count === min)!.p
          resistancePlacementRef.current = { playerId: target.id, troopsLeft: effect.troops }
          setResistancePlacement({ playerId: target.id, troopsLeft: effect.troops })
        }
      }
      if (effect.kind === 'epidemic' || effect.kind === 'famine') {
        setGameState(gs => {
          let territories = { ...gs.territories }
          if (effect.kind === 'epidemic') {
            for (const [id, t] of Object.entries(territories)) {
              if (t.scars.some(s => s.type === 'biological')) {
                const ownerIsMutant = gs.players.find(p => p.id === t.occupyingPlayerId)?.factionId === 'mutants'
                territories = { ...territories, [id]: { ...t, troops: ownerIsMutant ? t.troops + 1 : Math.max(1, t.troops - 1) } }
              }
            }
          } else {
            for (const [id, t] of Object.entries(territories)) {
              if (t.continentId === 'africa') territories = { ...territories, [id]: { ...t, troops: Math.max(1, t.troops - 1) } }
            }
          }
          return { ...gs, territories }
        })
      }
    }

    const next: ActiveGameCards = { ...baseCards, eventDeck: deck, eventDiscard: discard }
    setCardState(next)
    setLegacyState(prev => {
      const newLegacy: LegacyState = { ...prev, activeGameCards: next }
      legacyStateRef.current = newLegacy
      saveLegacyState(newLegacy).catch(() => {})
      return newLegacy
    })
  }

  /** True when the card that just entered sideboard spot 1 has an even coin value. */
  function spot1TriggersEvent(spot1CardId: string | null): boolean {
    if (!spot1CardId) return false
    const coins = (legacyStateRef.current.cardResources ?? {})[spot1CardId] ?? 1
    return coins % 2 === 0
  }

  /**
   * Why this player may not take this card, or null when the draw is legal.
   *
   * A backstop — the modal greys the same cards out — but every path that can
   * draw a card has to apply it, so it lives here rather than inline in one
   * handler. Two rules:
   *
   *  - If any face-up card is yours to claim you MUST take a face-up card; the
   *    resource pile is only for players who control none. A homeland (the
   *    double-winner unlock) widens "yours to claim" to the whole continent.
   *  - Purist (alien weakness) caps a hand at 2 coin cards.
   *
   * `anyFaceUp` lifts the first rule for Recon, the missile power that opens
   * every face-up card.
   */
  function cardDrawBlockReason(playerId: string, cardId: string, isCoin: boolean, anyFaceUp: boolean): string | null {
    const homeland = playerHomeland(playerId)
    const claimable = (tId: string | undefined) =>
      !!tId && canClaimTerritoryCard(playerId, tId, gameStateRef.current.territories, homeland)

    if (isCoin && (cardState.sideboard ?? []).some(id => claimable(getTerritoryCard(id)?.territoryId))) {
      return homeland
        ? '⚠ A face-up card is yours to claim (controlled or in your homeland) — you must take it'
        : '⚠ You control a face-up territory — you must take that territory card'
    }
    if (!isCoin && !anyFaceUp) {
      const tId = getTerritoryCard(cardId)?.territoryId
      if (tId && !claimable(tId)) {
        return homeland
          ? '⚠ You can only take a face-up card you control or one inside your homeland'
          : '⚠ You can only take a face-up card whose territory you control'
      }
    }
    if (isCoin) {
      const faction = gameStateRef.current.players.find(p => p.id === playerId)?.factionId ?? ''
      if (factionWeaknessOf(faction) === 'wp-purist') {
        const coinCount = (cardState.playerHands[playerId] ?? []).filter(id => !!getCoinCard(id)).length
        if (coinCount >= 2) return '⚠ Purist — you cannot hold more than 2 coin cards'
      }
    }
    return null
  }

  /**
   * Commit a card-state change together with any Red Star the emptied resource
   * pile owes, in a SINGLE setLegacyState call — two calls would let the card
   * update's stale closure overwrite the star.
   *
   * Returns the winner's purchased-star count *after* this award. The updater
   * runs asynchronously, so a caller reading the ref afterwards would miss it
   * and a 4th star would fail to end the game.
   */
  function commitCardsAndStar(newCardState: ActiveGameCards, depletion: ResourceDepletion): number {
    const winnerId = depletion.kind === 'award' ? depletion.playerId : null
    const purchasedAfter = winnerId
      ? ((legacyStateRef.current.purchasedStars ?? {})[winnerId] ?? 0) + 1
      : 0

    setLegacyState(prev => {
      let next = { ...prev, activeGameCards: newCardState }
      if (winnerId) {
        const purchased = { ...(next.purchasedStars ?? {}), [winnerId]: ((next.purchasedStars ?? {})[winnerId] ?? 0) + 1 }
        next = { ...next, purchasedStars: purchased }
      }
      legacyStateRef.current = next
      saveLegacyState(next)
        .then(() => {
          if (winnerId) console.log('[CoinDeck] Red star + card state saved to Supabase ✓')
        })
        .catch(err => console.error('[CoinDeck] Save failed:', err))

      if (winnerId) {
        console.log('[CoinDeck] purchasedStars after award:', Object.fromEntries(
          gameStateRef.current.players.map(p => [p.name, (next.purchasedStars ?? {})[p.id] ?? 0])
        ))
      }
      return next
    })
    setCardState(() => newCardState)
    return purchasedAfter
  }

  /**
   * Raise the depletion notice and end the game if the star was the winner's
   * fourth. A no-op for `kind: 'none'`, so every coin-draw path can call it.
   */
  function announceDepletion(depletion: ResourceDepletion, purchasedAfter: number) {
    if (!depletion.depleted) return
    const state = gameStateRef.current
    console.log('[CoinDeck] Territory counts at depletion:', Object.fromEntries(
      state.players.map(p => [
        p.name,
        Object.values(state.territories).filter(t => t.occupyingPlayerId === p.id).length,
      ])
    ))
    if (depletion.kind === 'award') {
      const winner = state.players.find(p => p.id === depletion.playerId)
      if (!winner) return
      const hqStars = Object.values(state.territories).filter(
        t => t.occupyingPlayerId === depletion.playerId && !!t.activeHqPlayerId,
      ).length
      const newStarTotal = hqStars + purchasedAfter
      console.log(`[CoinDeck] ${winner.name} final star total: ${newStarTotal} (hq=${hqStars} purchased=${purchasedAfter})`)
      if (newStarTotal >= 4) {
        console.log(`[CoinDeck] 4-star victory triggered for ${winner.name}!`)
        setWinnerPlayerId(winner.id)
        setWinCondition('mission')
        setUnlockOptions(pickUnlocks(state.gameNumber))
        setGameState(prev => ({ ...prev, phase: 'game-over', winnerId: winner.id }))
        setTimeout(() => setShowWinScreen(true), 300)
      }
      setCoinDeckStarWinner({ kind: 'award', name: winner.name, count: depletion.count })
    } else if (depletion.kind === 'tie') {
      // Tied for most territories: NOBODY takes the star. Awarding it to one of
      // them would be decided by map data order, not by play — and could
      // silently end the game on someone's 4th star.
      const names = depletion.playerIds.map(id => state.players.find(p => p.id === id)?.name ?? id)
      console.log(`[CoinDeck] Tie at ${depletion.count} territories (${names.join(', ')}) — no star awarded`)
      setCoinDeckStarWinner({ kind: 'tie', names, count: depletion.count })
    }
  }

  function handleCardDrawSelect(cardId: string, isCoin: boolean) {
    const playerId = pendingCardDraws[0]
    if (!playerId) return

    console.log(`[CardAward] handleCardDrawSelect — player=${playerId} card=${cardId} isCoin=${isCoin}`)

    // Recon (missile power) opens every face-up card for this draw.
    const blocked = cardDrawBlockReason(playerId, cardId, isCoin, reconDrawActive)
    if (blocked) {
      showWeaknessNotice(blocked)
      return
    }

    // Drawing a card forfeits the shared mission for this turn — but only the
    // card you collect for conquering. A Mysterious Island draw is a separate
    // grant from the event, resolved the moment it fires rather than after
    // fortifying, so it leaves the mission claimable.
    if (!consumeEventDrawCredit(playerId)) drewCardPlayerIdsRef.current.add(playerId)

    // ── 1. Compute new card state synchronously from current snapshot ──────
    const prevCards = cardState
    let sideboard = [...prevCards.sideboard]
    let deck = [...prevCards.territoryDeck]
    let resourceDeck = [...(prevCards.resourceDeck ?? prevCards.coinDeck ?? [])]
    const playerHands = { ...prevCards.playerHands, [playerId]: [...(prevCards.playerHands[playerId] ?? []), cardId] }

    let newSpot1Id: string | null = null
    if (isCoin) {
      resourceDeck = resourceDeck.filter(id => id !== cardId)
    } else {
      // Taking a card shifts the row toward spot 4; a fresh card slides into spot 1
      sideboard = sideboard.filter(id => id !== cardId)
      if (deck.length > 0) {
        newSpot1Id = deck.shift()!
        sideboard = [newSpot1Id, ...sideboard]
      }
    }
    // ── 2. Detect depletion and resolve the star ───────────────────────────
    // Coins turned in go back into the pile, so it can empty more than once in
    // a game — the star is claimed on the FIRST emptying only, guarded by the
    // flag carried on the card state.
    const alreadyResolved = prevCards.resourceStarAwarded ?? false
    const depletion = resolveResourceDepletion(isCoin, resourceDeck, alreadyResolved, gameStateRef.current.territories)
    console.log(`[CoinDeck] isCoin=${isCoin} deckAfter=${resourceDeck.length} alreadyResolved=${alreadyResolved} outcome=${depletion.kind}`)

    const newCardState = {
      ...prevCards, sideboard, territoryDeck: deck, resourceDeck, playerHands,
      resourceStarAwarded: alreadyResolved || depletion.depleted,
    }

    // ── 3. Commit cards + any star owed, in one write ──────────────────────
    const starAwardPurchasedAfter = commitCardsAndStar(newCardState, depletion)

    // ── Event trigger: even-coin card revealed on spot 1 ───────────────────
    // Built on newCardState, not `cardState` — the draw above has not rendered yet.
    if (spot1TriggersEvent(newSpot1Id)) triggerEventCard(newCardState)

    // ── 4. Khan Supply Lines bonus ─────────────────────────────────────────
    const gs = gameStateRef.current
    let troops = troopsRef.current
    if (!isCoin && playerAbility(playerId) === 'khan-card-bonus') {
      const terrCard = getTerritoryCard(cardId)
      if (terrCard) {
        const cardTerritory = gs.territories[terrCard.territoryId]
        if (cardTerritory?.occupyingPlayerId === playerId) {
          console.log(`[CardAward] Khan Supply Lines bonus — +1 troop for ${playerId}`)
          troops += 1
        }
      }
    }
    setTroopsToPlace(troops)
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId ? { ...p, cards: [...p.cards, cardId] } : p,
      ),
    }))

    // ── 5. Post-award effects ──────────────────────────────────────────────
    announceDepletion(depletion, starAwardPurchasedAfter)

    setPendingCardDraws(prev => prev.slice(1))

    // Mutant Mindshackle: after collecting a resource card, offer to trade it
    // for a random card from a player whose territory was conquered this turn
    if (isCoin) {
      const drawPlayer = gameStateRef.current.players.find(p => p.id === playerId)
      if (drawPlayer?.factionId === 'mutants' && mutantHasEvolvePower('me-mindshackle')) {
        const victims = [...conqueredFromPlayerIdsRef.current]
          .filter(vid => vid !== playerId && (newCardState.playerHands[vid] ?? []).length > 0)
        if (victims.length > 0) {
          setMindshackleOffer({ coinCardId: cardId, playerId })
        }
      }
    }
  }

  // ── Balkania 4th-capture bonus card draw ─────────────────────────────────
  // Mirrors handleCardDrawSelect but uses balkExpansionPending instead of pendingCardDraws
  function handleBalkExpansionSelect(cardId: string, isCoin: boolean) {
    const playerId = balkExpansionPending
    if (!playerId) return

    // Same draw rules as a normal card draw. Recon is not offered on this
    // bonus draw, so face-up cards you don't control stay closed.
    const blocked = cardDrawBlockReason(playerId, cardId, isCoin, false)
    if (blocked) {
      showWeaknessNotice(blocked)
      return
    }

    setBalkExpansionPending(null)
    // Drawing a card forfeits the shared mission for this turn
    drewCardPlayerIdsRef.current.add(playerId)

    // Computed synchronously from the current snapshot, like handleCardDrawSelect
    // — the depletion check has to see the deck this draw leaves behind.
    const prevCards = cardState
    let sideboard = [...prevCards.sideboard]
    let deck = [...prevCards.territoryDeck]
    let resourceDeck = [...(prevCards.resourceDeck ?? prevCards.coinDeck ?? [])]
    const playerHands = { ...prevCards.playerHands, [playerId]: [...(prevCards.playerHands[playerId] ?? []), cardId] }

    let newSpot1Id: string | null = null
    if (isCoin) {
      resourceDeck = resourceDeck.filter(id => id !== cardId)
    } else {
      // Taking a card shifts the row toward spot 4; a fresh card slides into spot 1
      sideboard = sideboard.filter(id => id !== cardId)
      if (deck.length > 0) {
        newSpot1Id = deck.shift()!
        sideboard = [newSpot1Id, ...sideboard]
      }
    }

    // This draw can empty the resource pile just like a normal one, so it owes
    // the same Red Star — same helper, same once-per-game guard.
    const alreadyResolved = prevCards.resourceStarAwarded ?? false
    const depletion = resolveResourceDepletion(isCoin, resourceDeck, alreadyResolved, gameStateRef.current.territories)
    console.log(`[CoinDeck] balkExpansion isCoin=${isCoin} deckAfter=${resourceDeck.length} alreadyResolved=${alreadyResolved} outcome=${depletion.kind}`)

    const newCardState = {
      ...prevCards, sideboard, territoryDeck: deck, resourceDeck, playerHands,
      resourceStarAwarded: alreadyResolved || depletion.depleted,
    }
    const purchasedAfter = commitCardsAndStar(newCardState, depletion)

    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId ? { ...p, cards: [...p.cards, cardId] } : p,
      ),
    }))

    announceDepletion(depletion, purchasedAfter)

    // Event trigger: even-coin card revealed on spot 1
    if (spot1TriggersEvent(newSpot1Id)) triggerEventCard(newCardState)
  }

  // ── Card trade-in ─────────────────────────────────────────────────────────
  function handleTradeIn(cardIds: string[], bonus: number) {
    const playerId = gameState.players[gameState.currentPlayerIndex]?.id
    if (!playerId) return
    playCoin()
    const tradedSet = new Set(cardIds)

    // Private missions Advanced Tactics / Advanced Training both trigger on the
    // act of trading in, so record the totals now — by the time the mission is
    // claimed at end of turn the cards are long gone from the hand.
    const resourcesOf = (id: string) => cardCoinValue(legacyStateRef.current?.cardResources, id)
    const richCount = cardIds.filter(id => !!getTerritoryCard(id) && resourcesOf(id) >= 4).length
    const resourceTotal = cardIds.reduce((sum, id) => sum + resourcesOf(id), 0)
    setTurn({
      richCardsTradedIn: gameStateRef.current.turn.richCardsTradedIn + richCount,
      resourcesTradedIn: gameStateRef.current.turn.resourcesTradedIn + resourceTotal,
    })
    const playerHands = {
      ...cardState.playerHands,
      [playerId]: (cardState.playerHands[playerId] ?? []).filter(id => !tradedSet.has(id)),
    }
    // Territory cards go to the discard pile; coin cards return to the bottom
    // of the resource deck — spending them stretches out the depletion star
    const tradedTerritory = cardIds.filter(id => !!getTerritoryCard(id))
    const tradedCoins = cardIds.filter(id => !getTerritoryCard(id))
    const nextCards: ActiveGameCards = {
      ...cardState,
      playerHands,
      territoryDiscard: [...cardState.territoryDiscard, ...tradedTerritory],
      resourceDeck: [...(cardState.resourceDeck ?? cardState.coinDeck ?? []), ...tradedCoins],
    }
    setCardState(nextCards)
    setLegacyState(prev => {
      const newLegacy: LegacyState = { ...prev, activeGameCards: nextCards }
      legacyStateRef.current = newLegacy
      saveLegacyState(newLegacy).catch(() => {})
      return newLegacy
    })
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId ? { ...p, cards: p.cards.filter(id => !tradedSet.has(id)) } : p,
      ),
    }))
    // Alien Collaborator weakness power: +1 troop on card trade-in
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    const isAlienCollaborator = currentPlayer &&
      legacyState.alienCollaboratorFactionId === currentPlayer.factionId
    const collaboratorBonus = isAlienCollaborator ? 1 : 0
    setTroopsToPlace(prev => prev + bonus + collaboratorBonus)
    setShowCardHand(false)

    // Mutant Mass Hypnosis: pick one traded territory — unattackable until their next turn
    if (currentPlayer?.factionId === 'mutants' && mutantHasEvolvePower('me-mass-hypnosis')) {
      const tradedTerritoryIds = cardIds
        .map(id => getTerritoryCard(id)?.territoryId)
        .filter((tid): tid is string => !!tid && !!gameState.territories[tid])
      if (tradedTerritoryIds.length > 0) {
        setHypnosisChoiceIds([...new Set(tradedTerritoryIds)])
      }
    }
  }

  // ── 4 cards = ★: spend exactly 4 cards to buy a red star ──────────────────
  function handleBuyStar(cardIds: string[]) {
    const player = gameState.players[gameState.currentPlayerIndex]
    if (!player || cardIds.length !== 4) return
    const spentSet = new Set(cardIds)

    // Remove the spent cards (territory cards → discard, coin cards return to
    // the bottom of the resource deck so the depletion star takes longer)
    const spentCoinIds = cardIds.filter(id => !getTerritoryCard(id))
    setCardState(prev => {
      const playerHands = {
        ...prev.playerHands,
        [player.id]: (prev.playerHands[player.id] ?? []).filter(id => !spentSet.has(id)),
      }
      const spentTerritory = cardIds.filter(id => !!getTerritoryCard(id))
      const territoryDiscard = [...prev.territoryDiscard, ...spentTerritory]
      const resourceDeck = [...(prev.resourceDeck ?? prev.coinDeck ?? []), ...spentCoinIds]
      return { ...prev, playerHands, territoryDiscard, resourceDeck }
    })
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === player.id ? { ...p, cards: p.cards.filter(id => !spentSet.has(id)) } : p,
      ),
    }))

    // Award the purchased star; compute the new total from known values so a
    // stale ref can never miss the just-awarded star
    const purchasedAfter = ((legacyStateRef.current.purchasedStars ?? {})[player.id] ?? 0) + 1
    setLegacyState(prev => {
      const purchasedStars = { ...(prev.purchasedStars ?? {}), [player.id]: ((prev.purchasedStars ?? {})[player.id] ?? 0) + 1 }
      const next: LegacyState = {
        ...prev,
        purchasedStars,
        activeGameCards: prev.activeGameCards
          ? {
              ...prev.activeGameCards,
              playerHands: {
                ...(prev.activeGameCards.playerHands ?? {}),
                [player.id]: ((prev.activeGameCards.playerHands ?? {})[player.id] ?? []).filter((id: string) => !spentSet.has(id)),
              },
              resourceDeck: [
                ...(prev.activeGameCards.resourceDeck ?? prev.activeGameCards.coinDeck ?? []),
                ...spentCoinIds,
              ],
            }
          : prev.activeGameCards,
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `★ ${player.name} spent 4 cards to buy a red star`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    setShowCardHand(false)

    // 4-star victory check (HQ stars + purchased stars)
    const hqStars = Object.values(gameStateRef.current.territories).filter(
      t => t.occupyingPlayerId === player.id && !!t.activeHqPlayerId,
    ).length
    if (hqStars + purchasedAfter >= 4) {
      setWinnerPlayerId(player.id)
      setWinCondition('mission')
      setUnlockOptions(pickUnlocks(gameStateRef.current.gameNumber))
      setGameState(prev => ({ ...prev, phase: 'game-over', winnerId: player.id }))
      setTimeout(() => setShowWinScreen(true), 300)
    }
  }

  // ── Alien Milestone complete: save island, collaborator, and flags ────────
  function handleAlienMilestoneComplete(island: { x: number; y: number; connectedTerritoryIds: [string, string] }) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    const factionId = currentPlayer?.factionId ?? null
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        alienMilestoneTriggered: true,
        alienCollaboratorFactionId: factionId,
        alienIsland: island,
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    // The island appears on the board immediately as an occupiable territory
    setGameState(prev => ({ ...prev, territories: injectAlienIslandTerritory(prev.territories, island) }))
    setShowAlienMilestone(false)
  }

  // ── Die Humans event: ruin system ─────────────────────────────────────────

  /** Return an event card to the discard pile (used when Die Humans is declined or unusable). */
  function returnEventCardToDiscard(cardId: string) {
    const next: ActiveGameCards = { ...cardState, eventDiscard: [...cardState.eventDiscard, cardId] }
    setCardState(next)
    setLegacyState(prev => {
      const newLegacy: LegacyState = { ...prev, activeGameCards: next }
      legacyStateRef.current = newLegacy
      saveLegacyState(newLegacy).catch(() => {})
      return newLegacy
    })
  }

  /**
   * Everything an event card does when its display is closed.
   *
   * Ten of the event kinds resolve HERE rather than at trigger time, because
   * they need a target picked or a follow-up modal opened. This used to live
   * inline in the display's `onDismiss`, which the AI driver never called — it
   * closed the card with a bare `setShowEventCard(false)`, so on an AI turn
   * Riot, Fallout, Agent of Chaos, Fortify City, Control the People, the
   * Mysterious Island draw and the rest simply never happened.
   *
   * Reads through the refs so it is correct whether it runs from a click or
   * from the AI driver's timer.
   */
  function resolveEventCardDismiss(cardId: string | null) {
    setShowEventCard(false)
    if (!cardId) return
    const effect = EVENT_EFFECTS[cardId]
    if (!effect) return
    const state = gameStateRef.current

    if (effect.kind === 'join-the-cause') setShowJoinTheCause(true)
    if (effect.kind === 'die-humans') {
      const alienPlayer = state.players.find(p => p.factionId === 'aliens' && !p.isEliminated)
      if (alienPlayer && hasRuinableCity()) {
        setDieHumansPendingCardId(cardId)
      } else {
        // No Alien player in the game or no minor city to ruin — the card is
        // only destroyed if used, so return it to the discard
        returnEventCardToDiscard(cardId)
      }
    }
    if (effect.kind === 'beam-down') {
      const alienPlayer = state.players.find(p => p.factionId === 'aliens' && !p.isEliminated)
      if (alienPlayer && hasBeamDownTarget()) setBeamDownActive(true)
    }
    if (effect.kind === 'mysterious-island') {
      const controllerId = state.territories[ALIEN_ISLAND_TERRITORY_ID]?.occupyingPlayerId
      const anyCards = (cardState.sideboard?.length ?? 0) > 0 ||
        ((cardState.resourceDeck ?? cardState.coinDeck ?? []).length > 0)
      if (controllerId && anyCards) {
        setPendingCardDraws(prev => [controllerId, ...prev])
        // Granted by the event, not earned by conquest: it neither forfeits the
        // mission nor gets cancelled by one.
        grantEventDrawCredit(controllerId)
        setEventDrawActive(true)
      }
    }
    if (effect.kind === 'fallout-event') applyFalloutEvent(cardId)
    if (effect.kind === 'fortify-city') {
      // The largest-population player chooses: troops into two of their cities,
      // or one permanent fortification. Both options need a city, so a leader
      // holding none gets nothing and the card is discarded rather than
      // destroyed — nothing was used.
      const leaderId = largestPopulationPlayerId()
      if (leaderId && ownedCityIds(leaderId).length > 0) {
        updateFortifyEvent({ phase: 'choice', playerId: leaderId, cardId })
      } else {
        const name = state.players.find(p => p.id === leaderId)?.name ?? 'The leader'
        showWeaknessNotice(`⛨ Fortify — ${name} controls no city, so nothing can be reinforced`)
        returnEventCardToDiscard(cardId)
      }
    }
    if (effect.kind === 'control-the-people') {
      // The largest-population player chooses their reward
      const leaderId = largestPopulationPlayerId()
      if (leaderId) setControlPeopleChoice(leaderId)
    }
    if (effect.kind === 'riot') applyRiotEvent()
    if (effect.kind === 'agent-of-chaos') applyAgentOfChaos()
    if (effect.kind === 'mutants-evolve') {
      const mutantPlayer = state.players.find(p => p.factionId === 'mutants' && !p.isEliminated)
      if (mutantPlayer) {
        setMutantsEvolvePendingCardId(cardId)
      } else {
        // Only destroyed if used — return to the discard when no Mutants are playing
        returnEventCardToDiscard(cardId)
      }
    }
  }

  /** Whether the board has a minor city that can still be ruined. */
  function hasRuinableCity(): boolean {
    const ls = legacyStateRef.current
    const destroyedCityIds = new Set((ls.destroyedCities ?? []).map(d => d.cityId))
    const ruinIds = new Set(ls.ruinTerritoryIds ?? [])
    return ls.stickers.some(s =>
      s.placement === 'territory' &&
      s.description === 'city:minor' &&
      !destroyedCityIds.has(s.id) &&
      !ruinIds.has(s.targetId),
    )
  }

  function handleDieHumansRuin(territoryId: string) {
    const cardId = dieHumansPendingCardId
    if (!cardId) return
    const territoryName = gameStateRef.current.territories[territoryId]?.name ?? territoryId
    const alienPlayer = gameStateRef.current.players.find(p => p.factionId === 'aliens')

    // Remove all troops and the occupier; clear the territory's city list and any HQ
    setGameState(prev => {
      const activeHqs = { ...prev.activeHqs }
      for (const [factionId, tId] of Object.entries(activeHqs)) {
        if (tId === territoryId) delete activeHqs[factionId]
      }
      return {
        ...prev,
        activeHqs,
        territories: {
          ...prev.territories,
          [territoryId]: { ...prev.territories[territoryId], occupyingPlayerId: null, troops: 0, cities: [] },
        },
      }
    })

    setLegacyState(prev => {
      // Demolished HQ record (if an HQ sticker was on the ruined territory)
      const hqSticker = prev.stickers.find(s => s.targetId === territoryId && s.description.startsWith('HQ:'))
      const destroyedHqs = hqSticker
        ? [...(prev.destroyedHqs ?? []), {
            territoryId,
            factionId: hqSticker.description.slice(3),
            destroyedInGame: gameStateRef.current.gameNumber,
            destroyedByPlayerId: alienPlayer?.id ?? 'aliens',
          }]
        : (prev.destroyedHqs ?? [])
      // The ruined minor city is DESTROYED, not un-founded. Its sticker stays in
      // `stickers` — there are only 9 minor city stickers in the campaign and a
      // ruined one is spent, so the board is down to 8 for good. Deleting it
      // handed the slot back and let a 10th city be founded over the campaign.
      const ruined = citiesLostOn(
        prev.stickers, prev.destroyedCities, territoryId,
        alienPlayer?.id ?? 'aliens', gameStateRef.current.gameNumber,
        { minorOnly: true })
      const next: LegacyState = {
        ...prev,
        // The HQ sticker comes off — it is not a limited supply and its loss is
        // recorded in destroyedHqs. The FORTIFICATION does not: there are only
        // five in the campaign and a destroyed one is never recycled, so it is
        // spent down to 0 charges and left in place to keep counting against the
        // supply. At 0 it protects nothing — every reader tests the charges.
        stickers: prev.stickers
          .filter(s => !(s.targetId === territoryId && s.description.startsWith('HQ:')))
          .map(s => (s.targetId === territoryId && s.description.startsWith('fortification:'))
            ? { ...s, description: 'fortification:0' }
            : s),
        destroyedCities: [...(prev.destroyedCities ?? []), ...ruined.replaced],
        // Remove any fortification scar too
        scars: prev.scars.filter(s => !(s.territoryId === territoryId && s.type === 'fortification')),
        destroyedHqs,
        ruinTerritoryIds: [...(prev.ruinTerritoryIds ?? []), territoryId],
        destroyedEventCardIds: [...(prev.destroyedEventCardIds ?? []), cardId],
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `👽 Die Humans — the city at ${territoryName} was reduced to a Ruin`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    setDieHumansPendingCardId(null)
  }

  function handleDieHumansDecline() {
    const cardId = dieHumansPendingCardId
    if (!cardId) return
    returnEventCardToDiscard(cardId)
    setDieHumansPendingCardId(null)
  }

  // ── Beam Down event: Aliens drop 5 troops into an unoccupied city ─────────
  function hasBeamDownTarget(): boolean {
    const ls = legacyStateRef.current
    const destroyedCityIds = new Set((ls.destroyedCities ?? []).map(d => d.cityId))
    const ruinIds = new Set(ls.ruinTerritoryIds ?? [])
    return ls.stickers.some(s =>
      s.placement === 'territory' &&
      s.description.startsWith('city:') &&
      !destroyedCityIds.has(s.id) &&
      !ruinIds.has(s.targetId) &&
      !gameStateRef.current.territories[s.targetId]?.occupyingPlayerId,
    )
  }

  function handleBeamDown(territoryId: string) {
    const alienPlayer = gameStateRef.current.players.find(p => p.factionId === 'aliens')
    if (!alienPlayer) { setBeamDownActive(false); return }
    const territoryName = gameStateRef.current.territories[territoryId]?.name ?? territoryId
    setGameState(prev => ({
      ...prev,
      territories: {
        ...prev.territories,
        [territoryId]: { ...prev.territories[territoryId], occupyingPlayerId: alienPlayer.id, troops: 5 },
      },
    }))
    setLegacyState(prev => {
      const next = {
        ...prev,
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `🛸 Beam Down — the Aliens materialized 5 troops in the city at ${territoryName}`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    setBeamDownActive(false)
  }

  // ── Nuclear Milestone ──────────────────────────────────────────────────────

  function handleNuclearMilestoneComplete() {
    const pending = pendingNuclearRef.current
    if (!pending) return
    const { bringerPlayerId, bringerFactionId, falloutTerritoryId } = pending
    const territoryName = gameStateRef.current.territories[falloutTerritoryId]?.name ?? falloutTerritoryId
    const bringerName = gameStateRef.current.players.find(p => p.id === bringerPlayerId)?.name ?? 'Unknown'

    // Fallout Zone: obliterate everything on the territory
    setGameState(prev => {
      const activeHqs = { ...prev.activeHqs }
      for (const [pid, tId] of Object.entries(activeHqs)) {
        if (tId === falloutTerritoryId) delete activeHqs[pid]
      }
      return {
        ...prev,
        activeHqs,
        territories: {
          ...prev.territories,
          [falloutTerritoryId]: {
            ...prev.territories[falloutTerritoryId],
            occupyingPlayerId: null, troops: 0, cities: [], scars: [],
            activeHqPlayerId: undefined,
          },
        },
      }
    })

    setLegacyState(prev => {
      const hqSticker = prev.stickers.find(s => s.targetId === falloutTerritoryId && s.description.startsWith('HQ:'))
      const destroyedHqs = hqSticker
        ? [...(prev.destroyedHqs ?? []), {
            territoryId: falloutTerritoryId,
            factionId: hqSticker.description.slice(3),
            destroyedInGame: gameStateRef.current.gameNumber,
            destroyedByPlayerId: bringerPlayerId,
          }]
        : (prev.destroyedHqs ?? [])
      const next: LegacyState = {
        ...prev,
        nuclearMilestoneTriggered: true,
        nuclearBringerFactionId: bringerFactionId,
        falloutZoneTerritoryId: falloutTerritoryId,
        // Every sticker on the territory is destroyed — but a fortification is
        // SPENT, not deleted. It is one of the campaign's five and the count
        // comes from the stickers themselves, so removing the row hands the
        // slot back and the campaign gets a sixth. Same rule as the Ruin.
        stickers: prev.stickers
          .filter(s => s.targetId !== falloutTerritoryId || s.description.startsWith('fortification:'))
          .map(s => (s.targetId === falloutTerritoryId && s.description.startsWith('fortification:')
            ? { ...s, description: 'fortification:0' } : s)),
        scars: prev.scars.filter(s => s.territoryId !== falloutTerritoryId),
        destroyedHqs,
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `☢ THE UNTHINKABLE — ${bringerName} became the Bringer of Nuclear Fire; ${territoryName} is now the Fallout Zone`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    // In-game red stars from this point forward trigger missile power picks
    redStarBaselineRef.current = { ...(legacyStateRef.current.purchasedStars ?? {}) }
    pendingNuclearRef.current = null
    setPendingNuclear(null)
  }

  // ── Fallout event: each land neighbor of the FZ loses 1 die of troops ─────
  function applyFalloutEvent(cardId: string) {
    const fzId = legacyStateRef.current.falloutZoneTerritoryId
    if (!fzId) { returnEventCardToDiscard(cardId); return }
    const state = gameStateRef.current
    const fz = state.territories[fzId]
    if (!fz) return
    // Roll the dice SYNCHRONOUSLY so the notice and history log show the real
    // results (the old version collected losses inside the setState updater,
    // which runs after the log was written — it always recorded "no losses")
    const results: Array<{ id: string; name: string; loss: number; roll: number }> = []
    for (const adjId of fz.adjacentIds) {
      if (isSeaLine(fzId, adjId)) continue  // land connections only
      const t = state.territories[adjId]
      if (!t || !t.occupyingPlayerId || t.troops <= 1) continue
      const faction = state.players.find(p => p.id === t.occupyingPlayerId)?.factionId
      if (faction === 'mutants') continue  // Mutant starting power: immune to mutant event losses
      const roll = Math.floor(Math.random() * 6) + 1
      const loss = t.troops - Math.max(1, t.troops - roll)
      if (loss > 0) results.push({ id: adjId, name: t.name, loss, roll })
    }
    if (results.length > 0) {
      setGameState(prev => {
        let territories = { ...prev.territories }
        for (const r of results) {
          const t = territories[r.id]
          if (!t) continue
          territories = { ...territories, [r.id]: { ...t, troops: Math.max(1, t.troops - r.loss) } }
        }
        return { ...prev, territories }
      })
    }
    const summary = results.map(r => `${r.name} −${r.loss} (🎲${r.roll})`).join(' · ')
    showWeaknessNotice(`☢ Fallout — radiation spreads by land: ${results.length ? summary : 'no troops lost'}`)
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        destroyedEventCardIds: [...(prev.destroyedEventCardIds ?? []), cardId],
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `☢ Fallout — radiation spreads from the Fallout Zone${results.length ? `: ${summary}` : ' (no losses)'}`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
  }

  // ── Riot: every player rolls a die; the lowest loses 2 troops ─────────────
  function applyRiotEvent() {
    const state = gameStateRef.current
    const players = state.players.filter(p => !p.isEliminated)
    if (players.length === 0) return
    const d6 = () => Math.floor(Math.random() * 6) + 1
    const rolls = new Map<string, number>(players.map(p => [p.id, d6()]))
    // Ties for lowest re-roll (only the tied players), capped to avoid a loop
    for (let iter = 0; iter < 30; iter++) {
      const min = Math.min(...rolls.values())
      const tied = players.filter(p => rolls.get(p.id) === min)
      if (tied.length <= 1) break
      for (const p of tied) rolls.set(p.id, d6())
    }
    const min = Math.min(...rolls.values())
    const loser = players.find(p => rolls.get(p.id) === min)!
    setRiotResult({
      rolls: players.map(p => ({ playerId: p.id, name: p.name, roll: rolls.get(p.id)! })),
      loserId: loser.id,
      loserName: loser.name,
    })
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        historyLog: [...prev.historyLog, {
          gameNumber: state.gameNumber,
          entry: `🔥 Riot — ${players.map(p => `${p.name} 🎲${rolls.get(p.id)}`).join(', ')} → ${loser.name} must lose 2 troops`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
  }

  // ── Control the People: largest-population player picks a reward ──────────
  function largestPopulationPlayerId(): string | null {
    const state = gameStateRef.current
    const wcId = legacyStateRef.current?.worldCapitalTerritoryId ?? null
    const alive = state.players.filter(p => !p.isEliminated)
    if (alive.length === 0) return null
    const pop = (pid: string) => {
      let score = 0
      for (const t of Object.values(state.territories)) {
        if (t.occupyingPlayerId !== pid) continue
        score += 1
        if (t.id === wcId) { score += 5; continue }
        for (const c of t.cities) {
          if (c.isDestroyed || c.headquartersFactionId) continue
          score += c.isMajor ? 2 : 1
        }
      }
      return score
    }
    let best = alive[0].id, bestScore = pop(alive[0].id)
    for (const p of alive.slice(1)) {
      const s = pop(p.id)
      if (s > bestScore) { bestScore = s; best = p.id }
    }
    return best
  }

  function handleControlManeuverConfirm(troops: number) {
    const man = controlManeuverRef.current
    const dstId = controlManeuverDstId
    if (!man?.srcId || !dstId) return
    const srcId = man.srcId
    const moverFaction = gameStateRef.current.players.find(p => p.id === man.playerId)?.factionId
    const intoFallout = dstId === legacyStateRef.current?.falloutZoneTerritoryId && moverFaction !== 'mutants'
    const arriving = intoFallout ? Math.max(1, Math.ceil(troops / 2)) : troops
    dispatch({ type: 'CONFIRM_FORTIFY', srcId, dstId, troopsRemoved: troops, troopsArriving: arriving })
    const cp = gameStateRef.current.players.find(p => p.id === man.playerId)
    showWeaknessNotice(`⟳ Control the People — ${cp?.name ?? 'Player'} maneuvered ${arriving} troop${arriving !== 1 ? 's' : ''}`)
    controlManeuverRef.current = null
    setControlManeuver(null)
    setControlManeuverDstId(null)
  }

  // ── Agent of Chaos: no human continent bonus → Mutants gain a red star ────
  function applyAgentOfChaos() {
    const state = gameStateRef.current
    const mutantPlayer = state.players.find(p => p.factionId === 'mutants' && !p.isEliminated)
    if (!mutantPlayer) return
    const continentSizes: Record<string, number> = {}
    for (const def of TERRITORY_DEFINITIONS) {
      continentSizes[def.continentId] = (continentSizes[def.continentId] ?? 0) + 1
    }
    const humanHasBonus = state.players.some(p => {
      if (p.isEliminated || p.factionId === 'mutants' || p.factionId === 'aliens') return false
      const counts: Record<string, number> = {}
      for (const t of Object.values(state.territories)) {
        if (t.occupyingPlayerId === p.id) counts[t.continentId] = (counts[t.continentId] ?? 0) + 1
      }
      return Object.entries(counts).some(([cid, n]) => n >= (continentSizes[cid] ?? Infinity))
    })
    if (humanHasBonus) return
    setLegacyState(prev => {
      const next = awardRedStars(prev, mutantPlayer.id, 1, mutantPlayer.name, state.gameNumber)
      saveLegacyState(next).catch(() => {})
      return next
    })
    setAlienStarBanner(`🃏 AGENT OF CHAOS — no human faction holds a continent bonus; the Mutants gain 1 red star!`)
  }

  // ── Sea line placement (Island Empire mission reward) ─────────────────────
  function handlePlaceSeaLine(a: string, b: string) {
    const na = gameStateRef.current.territories[a]?.name ?? a
    const nb = gameStateRef.current.territories[b]?.name ?? b
    // Live game: both territories become adjacent immediately, as a sea route
    registerCustomSeaLines([[a, b]])
    setGameState(prev => ({ ...prev, territories: applyCustomSeaLines(prev.territories, [[a, b]]) }))
    // Campaign-permanent record
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        customSeaLines: [...(prev.customSeaLines ?? []), [a, b] as [string, string]],
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `⚓ New sea line drawn between ${na} and ${nb} — permanent for the campaign`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    showWeaknessNotice(`⚓ New sea route: ${na} ⇄ ${nb}`)
    setShowSeaLinePlacement(false)
    setSeaLineMissionPlayerId(null)
  }

  // ── Missile power selection (earned on in-game red stars) ─────────────────
  function handleMissilePowerSelect(powerId: string) {
    const pid = missilePowerPendingPlayerId
    if (!pid) return
    const player = gameStateRef.current.players.find(p => p.id === pid)
    const factionId = player?.factionId ?? ''
    setLegacyState(prev => {
      const existing = (prev.missilePowers ?? {})[factionId] ?? []
      // One missile power max per faction — never append a second
      if (existing.length >= 1) return prev
      const next: LegacyState = {
        ...prev,
        missilePowers: { ...(prev.missilePowers ?? {}), [factionId]: [...existing, powerId] },
        claimedMissilePowers: [...(prev.claimedMissilePowers ?? []), powerId],
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `🚀 ${player?.name ?? factionId} claimed a missile power`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    setMissilePowerPendingPlayerId(null)
  }

  // ── The Mutants Evolve resolution ──────────────────────────────────────────
  function handleMutantsEvolveReveal(powerId: string) {
    const cardId = mutantsEvolvePendingCardId
    if (!cardId) return
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        mutantEvolvePowers: [...(prev.mutantEvolvePowers ?? []), powerId],
        destroyedEventCardIds: [...(prev.destroyedEventCardIds ?? []), cardId],
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `🧬 The Mutants evolved a new power`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    setMutantsEvolvePendingCardId(null)
  }

  function handleMutantsEvolveSkip() {
    const cardId = mutantsEvolvePendingCardId
    if (!cardId) return
    returnEventCardToDiscard(cardId)
    setMutantsEvolvePendingCardId(null)
  }

  // ── Mutant Mass Hypnosis: protect a traded territory ──────────────────────
  function handleMassHypnosisPick(territoryId: string) {
    const p = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]
    if (!p) { setHypnosisChoiceIds(null); return }
    const protection = { territoryId, playerId: p.id }
    setHypnosisProtected(protection)
    hypnosisProtectedRef.current = protection
    setHypnosisChoiceIds(null)
    const territoryName = gameStateRef.current.territories[territoryId]?.name ?? territoryId
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `🌀 Mass Hypnosis — ${territoryName} cannot be attacked until the Mutants' next turn`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
  }

  // ── Mutant Mindshackle: trade collected coin for a random victim card ─────
  function handleMindshackleTrade(victimId: string) {
    const offer = mindshackleOffer
    if (!offer) return
    const { coinCardId, playerId } = offer
    const prevCards = cardState
    const victimHand = [...(prevCards.playerHands[victimId] ?? [])]
    if (victimHand.length === 0) { setMindshackleOffer(null); return }
    const stolen = victimHand.splice(Math.floor(Math.random() * victimHand.length), 1)[0]
    const mutantHand = (prevCards.playerHands[playerId] ?? []).filter(id => id !== coinCardId)
    const playerHands = {
      ...prevCards.playerHands,
      [playerId]: [...mutantHand, stolen],
      [victimId]: [...victimHand, coinCardId],
    }
    const newCardState = { ...prevCards, playerHands }
    setCardState(newCardState)
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId ? { ...p, cards: [...p.cards.filter(id => id !== coinCardId), stolen] }
        : p.id === victimId ? { ...p, cards: [...p.cards.filter(id => id !== stolen), coinCardId] }
        : p),
    }))
    const victimName = gameStateRef.current.players.find(p => p.id === victimId)?.name ?? victimId
    const mutantName = gameStateRef.current.players.find(p => p.id === playerId)?.name ?? playerId
    setLegacyState(prev => {
      const next: LegacyState = {
        ...prev,
        activeGameCards: newCardState,
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `⛓ Mindshackle — ${mutantName} traded a resource card for a random card from ${victimName}`,
          timestamp: new Date().toISOString(),
        }],
      }
      saveLegacyState(next).catch(() => {})
      return next
    })
    setMindshackleOffer(null)
  }

  // ── Join the War ─────────────────────────────────────────────────────────
  function handleJoinWar(territoryId: string) {
    const playerId = joinTheWarPlayerId
    if (!playerId) return
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId
          ? { ...p, isEliminated: false, joinedWarThisGame: true, troops: 0 }
          : p,
      ),
      territories: {
        ...prev.territories,
        [territoryId]: { ...prev.territories[territoryId], occupyingPlayerId: playerId, troops: 3 },
      },
      phase: 'reinforce',
    }))
    setJoinTheWarPlayerId(null)
  }

  function handleForfeitWar() {
    const playerId = joinTheWarPlayerId
    if (!playerId) return
    // Mark as having used their Join the War option (forfeited)
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId ? { ...p, joinedWarThisGame: false } : p,
      ),
    }))
    setJoinTheWarPlayerId(null)
    // Advance to the next player
    handleNextPhase()
  }

  // ── Mission completion check ──────────────────────────────────────────────
  function checkMissions(
    territories: Record<string, Territory>,
    players: GameState['players'],
    conquest: TurnConquestState = { conqueredIds: gameState.turn.conqueredIds, conqueredViaSeaIds: gameState.turn.conqueredViaSeaIds },
  ) {
    // Missions are now ONE shared face-up card, claimed only at the end of a
    // turn (see completeSharedMissionIfEarned) — mid-turn checks never fire.
    void territories; void players; void conquest
    return false
  }

  /** Shared mission: at the end of their turn, the current player claims the
   *  face-up mission if they meet it. One mission per turn, and never on a
   *  turn where they drew a card. Returns true when the claim won the game. */
  /**
   * Star power payout: a faction that permanently owns a private mission may
   * re-complete it for 1 extra red star, ONCE per game.
   *
   * Runs before the face-up mission check and counts as that player's one
   * mission for the turn — so it carries the same restrictions: no card drawn
   * this turn, and no second mission afterwards.
   * Returns true when the claim ended the game.
   */
  function claimStarPowerIfEarned(playerId: string | undefined): 'none' | 'claimed' | 'won' {
    if (!playerId) return 'none'
    const ls = legacyStateRef.current
    const player = gameStateRef.current.players.find(p => p.id === playerId)
    if (!player || player.isEliminated) return 'none'

    const missionId = (ls?.factionStarPowerMissions ?? {})[player.factionId]
    if (!missionId) return 'none'
    // One payout per game.
    if ((ls?.starPowerClaimedGames ?? {})[player.factionId] === gameStateRef.current.gameNumber) return 'none'
    if (drewCardPlayerIdsRef.current.has(playerId)) return 'none'

    const met = checkMission(
      missionId, playerId, gameStateRef.current.territories, gameStateRef.current,
      { conqueredIds: gameStateRef.current.turn.conqueredIds, conqueredViaSeaIds: gameStateRef.current.turn.conqueredViaSeaIds },
      cardState.resourceDeck?.length ?? 0,
      {
        worldCapitalTerritoryId: ls?.worldCapitalTerritoryId ?? null,
        namedContinents: ls?.namedContinents,
        continentBonusModifiers: ls?.continentBonusModifiers,
      },
    )
    if (!met) return 'none'

    const missionDef = CARD_LOOKUP.get(missionId) as import('@/types/card').MissionCard | undefined
    const purchasedAfter = ((ls?.purchasedStars ?? {})[playerId] ?? 0) + 1
    setLegacyState(prev => {
      let next: LegacyState = {
        ...prev,
        starPowerClaimedGames: {
          ...(prev.starPowerClaimedGames ?? {}),
          [player.factionId]: gameStateRef.current.gameNumber,
        },
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `⭐ ${player.name} used the ${missionDef?.name ?? missionId} star power (+1 ★)`,
          timestamp: new Date().toISOString(),
        }],
      }
      next = awardRedStars(next, playerId, 1, player.name, gameStateRef.current.gameNumber)
      legacyStateRef.current = next
      saveLegacyState(next).catch(() => {})
      return next
    })
    showWeaknessNotice(`⭐ ${player.name} used their ${missionDef?.name ?? 'star power'} — +1 red star (once per game)`)

    const hqStars = Object.values(gameStateRef.current.territories).filter(
      t => t.occupyingPlayerId === playerId && !!t.activeHqPlayerId,
    ).length
    if (hqStars + purchasedAfter >= 4) {
      setWinnerPlayerId(playerId)
      setWinCondition('mission')
      setUnlockOptions(pickUnlocks(gameStateRef.current.gameNumber))
      setGameState(prev => ({ ...prev, phase: 'game-over', winnerId: playerId }))
      setTimeout(() => setShowWinScreen(true), 300)
      return 'won'
    }
    return 'claimed'
  }

  /**
   * Has this player earned the face-up mission?
   *
   * Everything `completeSharedMissionIfEarned` requires EXCEPT the card-draw
   * gate — because this is what decides whether a card is offered at all. A
   * player who has earned the mission is never given the choice: the draw is
   * dropped and the red star is the reward.
   */
  function missionEarnedBy(playerId: string | undefined): boolean {
    if (!playerId) return false
    const ls = legacyStateRef.current
    if (!ls?.doubleWinnerMilestoneTriggered) return false
    const missionId = cardState.currentMissionId
    if (!missionId) return false
    const player = gameStateRef.current.players.find(p => p.id === playerId)
    if (!player || player.isEliminated) return false

    // A faction may hold only ONE star power. If they already have one they
    // cannot claim a private mission — it stays face-up for someone else,
    // rather than being destroyed for no benefit. This does NOT apply to the
    // Aliens/Mutants, who never take the power at all and instead recycle the
    // card back into the deck (see completeSharedMissionIfEarned).
    const heldStarPower = (ls.factionStarPowerMissions ?? {})[player.factionId]
    if (isPrivateMission(missionId) && canClaimStarPower(player.factionId)
        && heldStarPower && heldStarPower !== missionId) {
      return false
    }

    return checkMission(
      missionId, playerId, gameStateRef.current.territories, gameStateRef.current,
      { conqueredIds: gameStateRef.current.turn.conqueredIds, conqueredViaSeaIds: gameStateRef.current.turn.conqueredViaSeaIds },
      cardState.resourceDeck?.length ?? 0,
      {
        worldCapitalTerritoryId: ls.worldCapitalTerritoryId ?? null,
        namedContinents: ls.namedContinents,
        continentBonusModifiers: ls.continentBonusModifiers,
      },
    )
  }

  /**
   * Drop a queued card draw for a player who has earned the mission, and say so.
   *
   * A mission and a card are mutually exclusive, and the mission is worth more,
   * so the choice is not offered — the card simply never arrives. Called when
   * the attack phase ends, which is the last moment the board can change and
   * therefore the first moment the answer is final.
   */
  function dropCardDrawForMission(playerId: string | undefined): void {
    if (!playerId) return
    // Event draws are not the turn's card and are never taken away — only the
    // ones earned by conquest are on the table here.
    const queued = pendingCardDrawsRef.current.filter(id => id === playerId).length
    let droppable = queued - (eventDrawCreditsRef.current.get(playerId) ?? 0)
    if (droppable <= 0) return
    if (!missionEarnedBy(playerId)) return
    const name = gameStateRef.current.players.find(p => p.id === playerId)?.name ?? 'Player'
    const missionDef = CARD_LOOKUP.get(cardState.currentMissionId ?? '') as import('@/types/card').MissionCard | undefined
    console.log(`[CardAward] Mission earned by ${playerId} — dropping ${droppable} queued card draw(s)`)
    setPendingCardDraws(prev => prev.filter(id => {
      if (id === playerId && droppable > 0) { droppable--; return false }
      return true
    }))
    showWeaknessNotice(
      `🎯 ${name} completed ${missionDef?.name ?? 'the mission'} — no card this turn; the red star is awarded as the turn ends`)
  }

  function completeSharedMissionIfEarned(playerId: string | undefined): boolean {
    if (!playerId) return false
    const ls = legacyStateRef.current
    const missionId = cardState.currentMissionId
    const player = gameStateRef.current.players.find(p => p.id === playerId)
    if (!missionId || !player) return false
    if (!missionEarnedBy(playerId)) return false
    // Drawing a card forfeits the turn's mission — no exceptions. The World
    // Capital mission works WITH this rule rather than around it: qualifying
    // consumes the card draw itself (see awardTerritoryCard), so the player
    // never draws and this guard never trips for them.
    if (drewCardPlayerIdsRef.current.has(playerId)) {
      showWeaknessNotice('🎯 Mission conditions met — but you drew a card this turn, so the mission cannot be claimed')
      return false
    }

    const missionDef = CARD_LOOKUP.get(missionId) as import('@/types/card').MissionCard | undefined
    const stars = missionDef?.stars ?? 1

    // The Aliens and Mutants already own a built-in star power, so they can
    // never take one from a private mission. They still earn its red star, but
    // the card returns to the deck instead of being destroyed — another faction
    // can still claim the power later.
    const claimsStarPower = isPrivateMission(missionId) && canClaimStarPower(player.factionId)
    const recycles = isPrivateMission(missionId) && !claimsStarPower

    // Discard the completed mission and flip the next one face up
    const deck = [...(cardState.missionDeck ?? [])]
    const nextMissionId = deck.shift() ?? null
    // Recycled private missions go back to the BOTTOM of the deck.
    if (recycles) deck.push(missionId)
    const newCards: ActiveGameCards = { ...cardState, missionDeck: deck, currentMissionId: nextMissionId }
    setCardState(newCards)

    const purchasedAfter = ((ls.purchasedStars ?? {})[playerId] ?? 0) + stars
    setLegacyState(prev => {
      let next: LegacyState = {
        ...prev,
        activeGameCards: newCards,
        historyLog: [...prev.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `🎯 ${player.name} completed the shared mission (+${stars} ★): ${missionDef?.description ?? missionId}`,
          timestamp: new Date().toISOString(),
        }],
      }
      // A recycled private mission must NOT be destroyed — it went back into
      // the deck above and stays claimable by another faction.
      if (missionDef?.singleUse && !recycles) {
        next.destroyedMissionIds = [...(next.destroyedMissionIds ?? []), missionId]
      }
      // Private mission → the faction keeps it permanently as a STAR POWER.
      // The card is destroyed above, so no other faction can ever claim it.
      if (claimsStarPower) {
        next.factionStarPowerMissions = {
          ...(next.factionStarPowerMissions ?? {}),
          [player.factionId]: missionId,
        }
        next.historyLog = [...next.historyLog, {
          gameNumber: gameStateRef.current.gameNumber,
          entry: `⭐ ${player.name} (${player.factionId.replace(/-/g, ' ')}) claimed the ${missionDef?.name ?? missionId} star power — that mission is destroyed`,
          timestamp: new Date().toISOString(),
        }]
      }
      // awardRedStars adds the stars to this game's totals (purchasedStars)
      next = awardRedStars(next, playerId, stars, player.name, gameStateRef.current.gameNumber)
      saveLegacyState(next).catch(() => {})
      return next
    })
    showWeaknessNotice(
      claimsStarPower
        ? `⭐ ${player.name} completed ${missionDef?.name ?? 'a private mission'} — +${stars} red star and the STAR POWER is theirs permanently!`
        : recycles
        ? `🎯 ${player.name} completed ${missionDef?.name ?? 'a private mission'} — +${stars} red star. ${player.factionId === 'mutants' ? 'The Mutants' : 'The Aliens'} already have a star power, so the mission returns to the deck.`
        : `🎯 ${player.name} completed the mission — +${stars} red star${stars !== 1 ? 's' : ''}! A new mission is revealed.`)

    // Special mission side effects
    if (missionId === 'mc-world-capital') {
      // The Capital goes on the territory of the 4+ coin card that earned it, so
      // the destination is already decided — the modal only announces it. More
      // than one candidate means several claimable face-up cards were worth 4+,
      // and then the player chooses between them. A save from before this rule
      // has no candidates recorded; those fall back to a free pick.
      const candidates = gameStateRef.current.turn.richCardTerritoryIds ?? []
      if (player.isAI) {
        // No modal for an AI — it would sit unanswered and stall the turn. With
        // no candidates (pre-rule save) fall back to its biggest holding.
        const target = candidates[0] ?? Object.values(gameStateRef.current.territories)
          .filter(t => t.occupyingPlayerId === playerId)
          .sort((a, b) => b.troops - a.troops)[0]?.id
        if (target) placeWorldCapital(target, player, newCards)
      } else {
        setWorldCapitalCandidates(candidates)
        setWorldCapitalCompletingId(playerId)
        setShowWorldCapitalModal(true)
      }
    }
    if (missionId === 'mc-7-islands') {
      setSeaLineMissionPlayerId(playerId)
      setShowSeaLinePlacement(true)
    }

    // 4-star win check (HQ stars + this game's earned stars)
    const hqStars = Object.values(gameStateRef.current.territories).filter(
      t => t.occupyingPlayerId === playerId && !!t.activeHqPlayerId,
    ).length
    if (hqStars + purchasedAfter >= 4) {
      setWinnerPlayerId(playerId)
      setWinCondition('mission')
      setUnlockOptions(pickUnlocks(gameStateRef.current.gameNumber))
      setGameState(prev => ({ ...prev, phase: 'game-over', winnerId: playerId }))
      setTimeout(() => setShowWinScreen(true), 300)
      return true
    }
    return false
  }

  // ── Combat effect interpreter ─────────────────────────────────────────────
  // Applies the legacy/deck/modal consequences the pure reducer emits but can't
  // own itself. Kept current via applyEffectRef (assigned below on every render).
  function applyCombatEffect(e: Effect) {
    switch (e.kind) {
      case 'hq-captured': {
        const state = gameStateRef.current
        const capturedPlayer  = state.players.find(p => p.id === e.hqPlayerId)
        const capturingPlayer = state.players.find(p => p.id === e.byPlayerId)
        setLegacyState(prev => {
          const next = {
            ...prev,
            historyLog: [...prev.historyLog, {
              gameNumber: state.gameNumber,
              entry: `${capturingPlayer?.name ?? 'Unknown'} captured ${capturedPlayer?.name ?? 'Unknown'}'s HQ at ${e.territoryName}`,
              timestamp: new Date().toISOString(),
            }],
          }
          saveLegacyState(next).catch(() => {})
          return next
        })
        break
      }
      case 'territory-captured': {
        playVictory()
        // Mindshackle: remember whose territory was conquered this turn
        if (e.fromPlayerId) conqueredFromPlayerIdsRef.current.add(e.fromPlayerId)
        // Territory card on the FIRST capture of the turn
        if (e.firstCaptureThisTurn) {
          console.log(`[CardAward] First capture this turn by ${e.byPlayerId} — queuing card draw`)
          awardTerritoryCard(e.byPlayerId)
        }
        break
      }
      case 'players-eliminated': {
        playElimination()
        const currentPId = e.byPlayerId
        const state = gameStateRef.current
        const eliminated = state.players.filter(p => e.playerIds.includes(p.id))
        // Forced Occupation private mission: did anyone knocked out here hold a
        // card worth 3+ resources? Read from the effect, since their hand has
        // already been transferred to the capturer.
        {
          const res = legacyStateRef.current?.cardResources ?? {}
          if (e.capturedCardIds.some(id => (res[id] ?? 0) >= 3)) {
            setTurn({ knockedOutRichPlayer: true })
          }
        }
        // Eliminate-trigger scar card held by the conqueror
        const elimCard = heldCards.find(
          c => c.playerId === currentPId && getScarCard(c.cardId)?.trigger === 'eliminate',
        )
        if (elimCard) setActiveCardId(elimCard.cardId)
        // Comeback power modal — for the first eliminated faction without a power
        for (const ep of eliminated) {
          const alreadyHasPower = !!(legacyStateRef.current?.comebackPowers ?? {})[ep.factionId]
          if (!alreadyHasPower) {
            const isFirst = !legacyStateRef.current?.firstEliminationTriggered
            setComebackEliminatedPlayer(ep)
            setIsFirstElimination(isFirst)
            if (isFirst) {
              const conqueror = state.players.find(pl => pl.id === currentPId)
              setFirstElimInfo({
                eliminatedName: ep.name,
                factionId: ep.factionId,
                conquerorName: conqueror?.name ?? 'the enemy',
              })
              setLegacyState(prev => {
                if (prev.firstEliminationTriggered) return prev
                const merged = [...(prev.scarDeck ?? []), ...MERCENARY_CARD_IDS]
                const next = { ...prev, firstEliminationTriggered: true, scarDeck: [...new Set(merged)] }
                saveLegacyState(next).catch(() => {})
                return next
              })
            }
            break
          }
        }
        break
      }
    }
  }
  applyEffectRef.current = applyCombatEffect

  function handleCombatResult(r: CombatResolution) {
    const srcId = attackSrcRef.current
    const tgtId = attackTgtRef.current
    if (!srcId || !tgtId) return

    // Troops have now fought — an earlier Mobile Forces fortify is locked in.
    sealFortifyUndo()

    // Mark the defender territory as having had combat this turn — blocks bunker/ammo shortage scar placement
    {
      const prevAttacked = gameStateRef.current.turn.attackedTerritoryIds
      if (!prevAttacked.includes(tgtId)) setTurn({ attackedTerritoryIds: [...prevAttacked, tgtId] })
    }

    // Captured — animate the troop bubble moving into the conquered territory
    if (r.captured) {
      showAttackFlight(srcId, tgtId, 'advance', String(Math.max(1, r.troopsToAdvance)))
    }

    // Combat application is now the pure RESOLVE_COMBAT reducer action. The two
    // legacy-derived values it needs are precomputed here (entryCostBreakdown and
    // mutantHasEvolvePower both read legacy state), then passed in so the reducer
    // stays pure.
    {
      const nowState = gameStateRef.current
      const srcT = nowState.territories[srcId]
      const tgtT = nowState.territories[tgtId]
      let entryCostTotal = 0, entryCostFalloutHalf = false, defenderCloningBonus = 0
      if (r.captured) {
        const wasEmpty = !tgtT.occupyingPlayerId
        const attackerFaction = nowState.players.find(p => p.id === srcT.occupyingPlayerId)?.factionId ?? ''
        // Entry losses only apply when expanding into an UNOCCUPIED city —
        // winning a battle against a defended city costs nothing extra
        // (Unpopular weakness and the Fallout Zone still apply either way)
        const cost = entryCostBreakdown(tgtId, tgtT, attackerFaction, wasEmpty)
        entryCostTotal = cost.total
        entryCostFalloutHalf = !!cost.falloutHalf
      } else {
        // Mutant Unstable Cloning: natural doubles while defending → +1 troop per
        // qualifying round, if the defender still owns the territory after battle
        const defFaction = nowState.players.find(p => p.id === tgtT.occupyingPlayerId)?.factionId
        if (defFaction === 'mutants' && mutantHasEvolvePower('me-unstable-cloning') && (r.defNaturalDoublesRounds ?? 0) > 0) {
          defenderCloningBonus = r.defNaturalDoublesRounds!
        }
      }
      dispatch({
        type: 'RESOLVE_COMBAT', srcId, tgtId,
        totalAtkLoss: r.totalAtkLoss, totalDefLoss: r.totalDefLoss,
        captured: r.captured, troopsToAdvance: r.troopsToAdvance,
        entryCostTotal, entryCostFalloutHalf, defenderCloningBonus,
      })
    }

    // Fortification uses: every combat roll against the territory consumes one
    // charge/segment — the fortification is destroyed after 10 uses.
    const fortUses = Math.max(1, r.roundsFought ?? 1)

    // Fortification scar: track uses, remove at 10
    // Functional, not a replacement built from the ref: one combat resolution
    // runs several effects in the same tick and more than one of them writes
    // legacy state. A `setLegacyState(newLs)` here would land last and wipe
    // whatever a sibling had just set — how the World Capital was lost.
    if ((legacyStateRef.current?.scars ?? []).some(s => s.territoryId === tgtId && s.type === 'fortification')) {
      setLegacyState(prev => {
        const idx = prev.scars.findIndex(s => s.territoryId === tgtId && s.type === 'fortification')
        if (idx < 0) return prev
        const newCount = (prev.scars[idx].attackCount ?? 0) + fortUses
        const next: LegacyState = {
          ...prev,
          scars: newCount >= 10
            ? prev.scars.filter((_, i) => i !== idx)
            : prev.scars.map((s, i) => i === idx ? { ...s, attackCount: newCount } : s),
        }
        legacyStateRef.current = next
        saveLegacyState(next).catch(() => {})
        return next
      })
    }

    setShowCombat(false)
    setAttackSrcId(null)
    setAttackTgtId(null)
    attackSrcRef.current = null
    attackTgtRef.current = null

    // Fortification sticker: deplete one charge per combat roll fought;
    // the fortification stops protecting once all 10 charges are spent.
    //
    // The spent sticker STAYS at `fortification:0`. There are only five in the
    // campaign and a worn-out one is not recycled, so it has to keep counting
    // against the supply — deleting it handed the slot back. Every reader
    // ("is this fortified?", the map ring, the defender die bonus, the entry
    // cost) already tests the remaining charges, so a spent one protects nothing.
    if (tgtId) {
      setLegacyState(prev => {
        const newStickers = prev.stickers.map(s => {
          if (s.targetId === tgtId && s.description.startsWith('fortification:')) {
            const charges = parseInt(s.description.split(':')[1] ?? '0')
            return { ...s, description: `fortification:${Math.max(0, charges - fortUses)}` }
          }
          return s
        })
        if (JSON.stringify(newStickers) === JSON.stringify(prev.stickers)) return prev
        const next = { ...prev, stickers: newStickers }
        saveLegacyState(next).catch(() => {})
        return next
      })
    }

    // Turn tracking on capture: capture count, conquest lists (mission checks),
    // first-capture flag, and the Balkania 4th-capture trigger. The victory
    // sound, HQ history log, territory-card award and Mindshackle tracking are
    // all handled by the effects RESOLVE_COMBAT emits.
    if (r.captured) {
      const state = gameStateRef.current
      const currentPId = state.players[state.currentPlayerIndex]?.id
      const newCount = gameStateRef.current.turn.captureCount + 1
      const newConqueredIds = [...gameStateRef.current.turn.conqueredIds, tgtId!]
      const newConqueredViaSeaIds = srcId && tgtId && isSeaLine(srcId, tgtId)
        ? [...gameStateRef.current.turn.conqueredViaSeaIds, tgtId]
        : gameStateRef.current.turn.conqueredViaSeaIds
      setTurn({ captureCount: newCount, conqueredIds: newConqueredIds, conqueredViaSeaIds: newConqueredViaSeaIds })
      if (currentPId) {
        if (!gameStateRef.current.turn.captured) setTurn({ captured: true })
        // Balkania: immediately show card-pick modal on 4th capture (during attack phase)
        if (newCount === 4 && playerAbility(currentPId) === 'balk-expansion-card') {
          setBalkExpansionPending(currentPId)
        }
      }
    }

    // Bear Trap: lock in the first territory attacked this turn — it keeps the
    // -1 for every subsequent roll until conquered; other territories don't
    setTurn({ bearTrapTerritoryId: gameStateRef.current.turn.bearTrapTerritoryId ?? tgtId ?? null })

    // Scars are only placed before a dice roll (immediate trigger), never post-capture.

    // Snapshot conquest state before async check. The setTurn mirror above has
    // already folded this capture into gameStateRef.current.turn, so this reads
    // the post-capture values directly.
    const conquestSnapshot: TurnConquestState = {
      conqueredIds: gameStateRef.current.turn.conqueredIds,
      conqueredViaSeaIds: gameStateRef.current.turn.conqueredViaSeaIds,
    }

    // Win detection. Player elimination — the GameState mutation (mark out +
    // transfer cards) and its modals/legacy (comeback, First Blood, mercenary
    // deck) — is now handled by RESOLVE_COMBAT + the players-eliminated effect.
    setTimeout(() => {
      const state = gameStateRef.current

      // Check 4-star win condition for any player (HQ stars + purchased stars)
      const fourStarWinner = state.players.find(p => {
        if (p.isEliminated) return false
        const hqStars = Object.values(state.territories).filter(
          t => t.occupyingPlayerId === p.id && !!t.activeHqPlayerId,
        ).length
        const purchased = (legacyStateRef.current.purchasedStars ?? {})[p.id] ?? 0
        return hqStars + purchased >= 4
      })
      if (fourStarWinner) {
        setWinnerPlayerId(fourStarWinner.id)
        setWinCondition('mission')
        setUnlockOptions(pickUnlocks(state.gameNumber))
        setGameState(prev => ({ ...prev, phase: 'game-over', winnerId: fourStarWinner.id }))
        setTimeout(() => setShowWinScreen(true), 300)
      } else if (!checkMissions(state.territories, state.players, conquestSnapshot)) {
        // Check overall win (mission / elimination)
        const winnerId = checkWin(state.territories, state.players)
        if (winnerId) {
          setWinnerPlayerId(winnerId)
          setWinCondition('elimination')
          setUnlockOptions(pickUnlocks(state.gameNumber))
          setGameState(prev => ({ ...prev, phase: 'game-over', winnerId }))
          setTimeout(() => setShowWinScreen(true), 300)
        }
      }
    }, 100)
  }

  function closeCombatModal() {
    setShowCombat(false)
    setAttackTgtId(null)
    attackTgtRef.current = null
  }

  // ── Advance confirm (uncontested capture) ────────────────────────────────
  function handleAdvanceConfirm(troops: number) {
    const srcId = advanceSrcRef.current
    const tgtId = advanceTgtRef.current
    if (!srcId || !tgtId) return
    // Troops have moved on — an earlier Mobile Forces fortify is locked in.
    sealFortifyUndo()
    playVictory()
    // Animate the troop bubble moving into the new territory
    showAttackFlight(srcId, tgtId, 'advance', String(troops))
    const currentPlayerId = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]?.id
    const currentPlayer2 = gameStateRef.current.players[gameStateRef.current.currentPlayerIndex]
    const factionId2 = currentPlayer2?.factionId ?? ''
    setGameState(prev => {
      const territories = { ...prev.territories }
      const tgt = prev.territories[tgtId]
      // Unoccupied expansion — the ONLY path where city/fortification entry losses apply
      const cost = entryCostBreakdown(tgtId, tgt, factionId2, true)
      // The World Capital's −5 entry cost is already folded into cost.total,
      // like a city. A 0 here means the cost could not be paid, which the
      // Advance panel and the AI both refuse upstream — leave the board alone
      // rather than rounding the survivors up and refunding the cost.
      const finalTroops = troopsAfterEntry(troops, cost)
      if (finalTroops < 1) {
        console.warn(`[Advance] ${troops} troops cannot pay the ${cost.total}-troop entry at ${tgtId} — move refused`)
        return prev
      }
      territories[tgtId] = { ...territories[tgtId], occupyingPlayerId: currentPlayerId, troops: finalTroops }
      territories[srcId] = { ...territories[srcId], troops: Math.max(1, territories[srcId].troops - troops) }
      return { ...prev, territories }
    })

    // Uncontested advances count as expansions too — Balkania's Imperial
    // Expansion triggers on the 4th expansion of the turn, conquest or not
    const newCount = gameStateRef.current.turn.captureCount + 1
    setTurn({ captureCount: newCount })

    // Resourceful comeback power: remember that this turn's expansion landed on
    // a city territory. This path is the ONLY way to take an unoccupied
    // territory, and it deliberately does not set `turn.captured` — so no card
    // is awarded here; the end-of-turn check grants one.
    const advTgt = gameStateRef.current.territories[tgtId]
    if ((advTgt?.cities ?? []).some(c => !c.isDestroyed)) {
      setTurn({ expandedIntoCity: true })
    }
    if (newCount === 4 && currentPlayerId && playerAbility(currentPlayerId) === 'balk-expansion-card') {
      console.log(`[CardAward] Balkania 4th expansion (uncontested advance) — showing immediate card pick for ${currentPlayerId}`)
      setBalkExpansionPending(currentPlayerId)
    }

    advanceSrcRef.current = null
    advanceTgtRef.current = null
    attackSrcRef.current = null
    setAttackSrcId(null)
    setShowAdvance(false)
  }

  function cancelAdvance() {
    advanceSrcRef.current = null
    advanceTgtRef.current = null
    attackSrcRef.current = null
    setAttackSrcId(null)
    setShowAdvance(false)
  }

  // ── Fortify confirm ───────────────────────────────────────────────────────
  function handleFortifyConfirm(troops: number) {
    const srcId = fortifySrcId
    const dstId = fortifyDstId
    if (!srcId || !dstId) return
    // Fallout Zone: moving in costs half your troops on entry (Mutants immune)
    const moverFaction = gameState.players[gameState.currentPlayerIndex]?.factionId
    const intoFallout = dstId === legacyState.falloutZoneTerritoryId && moverFaction !== 'mutants'
    const arriving = intoFallout ? Math.max(1, Math.ceil(troops / 2)) : troops
    // A Mobile Forces move made before the fortify phase is FINAL the moment it
    // is confirmed — the player goes on to attack and expand with those troops,
    // so it is a committed decision, not something to walk back. Recording no
    // undo leaves the button greyed out. The normal end-of-turn fortify still
    // keeps its undo as a misclick safety net; nothing can follow it.
    // Read before dispatching, so this is the phase the move was made in.
    const earlyMobileForcesMove = gameStateRef.current.phase !== 'fortify'
    dispatch({ type: 'CONFIRM_FORTIFY', srcId, dstId, troopsRemoved: troops, troopsArriving: arriving })
    // Undo restores only survivors — troops lost to radiation stay lost
    setLastFortify(earlyMobileForcesMove ? null : { srcId, dstId, troops: arriving })
    setShowFortify(false)
    setFortifySrcId(null)
    setFortifyDstId(null)
    setFortifyMovesLeft(prev => {
      const remaining = prev - 1
      if (remaining <= 0) setTimeout(() => { setFortifyDone(true); setSaharaFortifyMode(false); saharaFortifyModeRef.current = false }, 0)
      return remaining
    })
    fortifySrcRef.current = null
  }

  /**
   * Seal the last fortification so it can no longer be reversed.
   *
   * A Mobile Forces move never records an undo in the first place, so in
   * practice this only backstops the normal end-of-turn fortify: the undo dies
   * the moment ANYTHING else happens, whatever route got us there. Keeping the
   * guard means a future change that allows action after a fortify cannot
   * silently reopen the rewind.
   */
  function sealFortifyUndo() {
    setLastFortify(null)
  }

  function handleUndoFortify() {
    if (!lastFortify) return
    const { srcId, dstId, troops } = lastFortify
    setGameState(prev => {
      const territories = { ...prev.territories }
      territories[srcId] = { ...territories[srcId], troops: territories[srcId].troops + troops }
      territories[dstId] = { ...territories[dstId], troops: territories[dstId].troops - troops }
      return { ...prev, territories }
    })
    setFortifyDone(false)
    setFortifyMovesLeft(prev => prev + 1)
    setLastFortify(null)
  }

  // ── Draft undo ────────────────────────────────────────────────────────────
  function handleUndoPlacement() {
    if (!placementHistory.length) return
    const lastId = placementHistory[placementHistory.length - 1]
    dispatch({ type: 'UNDO_PLACEMENT', territoryId: lastId })
    setTroopsToPlace(prev => prev + 1)
    setPlacementHistory(prev => prev.slice(0, -1))
    bumpDraftPlaced(lastId, -1)
  }

  // ── Phase advancement ─────────────────────────────────────────────────────
  function handleNextPhase() {
    const phase = gameState.phase
    // Leaving a phase seals any fortification made during it. A normal fortify
    // happens in the fortify phase itself and is unaffected; only a Mobile
    // Forces move made earlier in the turn is closed off here.
    sealFortifyUndo()
    if (phase === 'reinforce') {
      setPlacementHistory([])
      dispatch({ type: 'END_REINFORCE_PHASE' })
    } else if (phase === 'attack') {
      // Clear attack state
      setAttackSrcId(null); attackSrcRef.current = null
      console.log(`[CardAward] Attack phase ended — capturedThisTurn=${gameStateRef.current.turn.captured} pendingCardDraws=${JSON.stringify(pendingCardDraws)}`)

      // ── Resourceful comeback power ────────────────────────────────────────
      // Expanding into an unoccupied city territory earns the same end-of-turn
      // card a conquest would. NOT an extra card: a player who conquered has
      // already been awarded one on their first capture, so this only fires
      // when nothing was conquered this turn.
      //
      // Awarded HERE, leaving the attack phase, and not at the fortify exit
      // where it used to be. Queuing a draw as the turn ends stranded it: the
      // draw modal only renders during fortify, so by the time React applied
      // the state the phase had already advanced to the next player and the
      // card was silently never drawn — while the queued entry sat there
      // blocking the AI driver, which stands down for a human-owned draw.
      // Queuing it now puts the modal up during fortify, and the existing
      // "Pick a Card First" guard stops the turn ending until it is taken —
      // exactly how a conquest card already behaves.
      const attackEndP = gameState.players[gameState.currentPlayerIndex]
      const attackTurn = gameStateRef.current.turn
      if (attackEndP
        && (legacyState.comebackPowers ?? {})[attackEndP.factionId] === 'resourceful'
        && attackTurn.expandedIntoCity
        && !attackTurn.captured) {
        console.log(`[CardAward] Resourceful — expanded into a city without conquering; awarding a card to ${attackEndP.id}`)
        // Only announce the card if one was actually queued — a mission earned
        // this turn declines it, and says so itself.
        if (awardTerritoryCard(attackEndP.id)) {
          showWeaknessNotice(`📦 Resourceful — ${attackEndP.name} expanded into a city and claims a card`)
        }
      }

      // The board is final once attacking stops, so this is the first moment the
      // mission answer cannot change — and the last before the draw modal would
      // appear in fortify. A player who has earned the mission never sees it.
      dropCardDrawForMission(attackEndP?.id)

      dispatch({ type: 'END_ATTACK_PHASE' })
    } else if (phase === 'fortify') {
      // Re-entrancy guard. `phase` comes from this render's closure, so a call
      // queued on a timer before the turn ended still reads 'fortify' and would
      // end the NEXT player's turn as well — skipping them. END_TURN goes
      // through dispatch, which mirrors gameStateRef synchronously, so the live
      // phase is the reliable check that this turn hasn't already ended.
      if (gameStateRef.current.phase !== 'fortify') return

      // Missions resolve at the end of the turn, BEFORE the per-turn conquest
      // lists reset. A player may complete only ONE mission per turn, so the
      // star-power payout and the face-up mission are mutually exclusive; if
      // either wins the game, stop here.
      const endingPlayerId = gameState.players[gameState.currentPlayerIndex]?.id
      const starPowerResult = claimStarPowerIfEarned(endingPlayerId)
      if (starPowerResult === 'won') return
      if (starPowerResult === 'none' && completeSharedMissionIfEarned(endingPlayerId)) return

      // ── END-OF-TURN scar effects for the ENDING player ────────────────────
      // Mercenary +1 and Bio-hazard −1 resolve at the END of the owner's turn
      // (Mutants reversed); a territory at 1 troop can be VACATED (never the
      // last). Now a pure helper in the reducer; endTerritories is committed by
      // END_TURN (and by the Join the War early-exit below).
      //
      // This runs BEFORE the turn advance because the advance now depends on
      // the final board: a vacated territory can become a legal Join the War
      // spot, which decides whether an eliminated player is offered a turn.
      // END_TURN merges the same map before recomputing, so the two agree.
      const endingPlayer = gameState.players[gameState.currentPlayerIndex]
      const endingIsMutant = endingPlayer?.factionId === 'mutants'
      // Mercenary comeback power upgrades this player's Mercenary scars to +2
      const endingMercComeback = (legacyState.comebackPowers ?? {})[endingPlayer?.factionId ?? ''] === 'mercenary'
      const scarResult = endingPlayer
        ? applyEndOfTurnScarEffects(gameState.territories, endingPlayer.id, endingIsMutant, legacyStateRef.current?.falloutZoneTerritoryId, endingMercComeback)
        : { territories: { ...gameState.territories }, vacatedNames: [] }
      const vacatedNames = scarResult.vacatedNames
      if (vacatedNames.length > 0) {
        showWeaknessNotice(`☣ ${endingPlayer?.name ?? 'Player'} abandoned ${vacatedNames.join(', ')} at end of turn — the scar wiped out the last troop`)
      }

      // Advance to the next player, skipping eliminated players with no Join
      // the War decision left to make. Computed on the post-scar board so it
      // matches what END_TURN will decide.
      const { nextIdx, isNewRound } = computeTurnAdvance({ ...gameState, territories: scarResult.territories })
      const nextPlayerId = gameState.players[nextIdx].id
      const nextPlayer = gameState.players[nextIdx]

      // ── START-OF-TURN Strategic Reserve for the INCOMING player ───────────
      // Khan Industries places +1 troop directly on each HQ they control. This
      // is the ONE turn hand-off, so the troops land exactly once: both the
      // normal path and the Join the War early-return below commit
      // `endTerritories`, and a reload never re-runs it.
      const hqReserve = applyHqReserveTroops(scarResult.territories, nextPlayerId, playerAbility(nextPlayerId))
      const endTerritories = hqReserve.territories
      if (hqReserve.grantedTerritoryIds.length > 0) {
        const names = hqReserve.grantedTerritoryIds.map(id => endTerritories[id]?.name ?? id)
        showWeaknessNotice(`⚙ Strategic Reserve — ${nextPlayer.name} reinforces ${names.join(', ')} with +1 troop each`)
      }

      // Clear fortify state — runs BEFORE the Join the War early-return so
      // per-turn state (attacked territories, capture counts, missile powers…)
      // never leaks into the joining player's turn
      setFortifySrcId(null); setFortifyDstId(null); setFortifyDone(false)
      setShowFortify(false); fortifySrcRef.current = null; setLastFortify(null)
      setSaharaFortifyMode(false); saharaFortifyModeRef.current = false
      console.log(`[CardAward] Turn ended — pendingCardDraws at fortify exit: ${JSON.stringify(pendingCardDraws)}`)
      // Reset from initialTurnState rather than naming the fields: this list was
      // hand-maintained and had already fallen behind, leaving
      // `eligibleForRichCard` stuck true for the rest of the game once the World
      // Capital mission was claimed. Anything added to TurnState now clears here
      // automatically, and only the fields that carry a computed value are named.
      setTurn({
        ...initialTurnState(),
        // Wide Border is judged at the START of a turn, so snapshot the incoming
        // player's whole-continent count here, off the end-of-turn board.
        continentsAtTurnStart: wholeContinentsControlled(nextPlayerId, endTerritories),
      })
      setBalkExpansionPending(null)
      conqueredFromPlayerIdsRef.current = new Set()
      // Mass Hypnosis expires at the beginning of the protector's next turn
      if (hypnosisProtectedRef.current?.playerId === nextPlayerId) {
        hypnosisProtectedRef.current = null
        setHypnosisProtected(null)
      }
      drewCardPlayerIdsRef.current = new Set()
      eventDrawCreditsRef.current = new Map()
      // Nothing here expires with the turn any more. Fortify City used to —
      // it went to the DRAWER, so the turn ending was their own deadline — but
      // it now goes to the largest-population player like the rest.
      //
      // Everything below used to be cleared here, and must not be. Each one
      // belongs to a player the BOARD picks — fewest territories, largest
      // population, lowest roll — who is usually NOT the one taking the turn and
      // has no reason to be racing someone else's clock. Wiping them at END_TURN
      // silently destroyed the reward: the winner clicked their choice, the hint
      // bar appeared, and the AI's turn ended a second later and took it away.
      //
      //   resistancePlacement   +N troops, fewest territories
      //   joinCausePlacement    3 troops, largest population
      //   controlPeopleChoice   the reward pick itself
      //   controlTroopsPlayerId 5 troops in one city
      //   controlManeuver       the immediate maneuver
      //   riotRemovalPlayerId   the 2-troop penalty — a debt, not a prize
      //   fortifyEvent          troops or a fortification, largest population
      //
      // All of them self-clear the moment they resolve, and every click handler
      // re-checks ownership against the live board, so carrying them across a
      // turn boundary cannot leak a move to the wrong player.
      setFortifyMovesLeft(1)
      aiTradedThisTurnRef.current = false
      mobileHqUsedRef.current = false; setMobileHqUsed(false)
      mobileHqModeRef.current = false; setMobileHqMode(false)
      mobileHqSrcRef.current = null;   setMobileHqSrcId(null)
      expandTargetRef.current = null
      expandUsedRef.current = false
      setExpandTargetId(null)
      // Missile power per-turn state
      usedMissilePowersRef.current = new Set()
      setUsedMissilePowersThisTurn(new Set())
      setEmpTerritoryIds(new Set())
      stealthyModeRef.current = false
      setStealthyMode(false)
      stealthyTargetRef.current = null
      setStealthyTargetId(null)

      // If the next player is eliminated and still undecided, offer Join the War
      // — but only when there is somewhere legal to re-enter. With nowhere to
      // go the only "choice" would be to forfeit, so computeTurnAdvance has
      // already skipped past them and this never fires.
      if (nextPlayer.isEliminated && nextPlayer.joinedWarThisGame === undefined
          && legalJoinWarTerritoryIds(
               endTerritories,
               Object.values(gameState.activeHqs ?? {}),
               legacyStateRef.current?.falloutZoneTerritoryId,
             ).length > 0) {
        setGameState(prev => ({ ...prev, territories: { ...prev.territories, ...endTerritories }, currentPlayerIndex: nextIdx }))
        setJoinTheWarPlayerId(nextPlayerId)
        return
      }

      // Events no longer auto-draw at round start — they trigger only when a
      // player takes a sideboard card that reveals an even-coin card on spot 1
      // (see triggerEventCard). Clear the previous round's active effects.
      const eventBonus = 0
      if (isNewRound) {
        activeEffectsRef.current = new Set()
        setActiveEffects(new Set())
      }

      // Reinforcements for the next player, computed from the end-of-turn map
      // (endTerritories already reflects the previous players' scar changes;
      // the next player's own scar effect happened at the end of THEIR last turn)
      const nextFactionId = gameState.players.find(p => p.id === nextPlayerId)?.factionId ?? ''
      const nextTroops = calcDraftTroops({
        playerId: nextPlayerId,
        factionId: nextFactionId,
        territories: endTerritories,
        legacy: legacyState,
        ability: playerAbility(nextPlayerId),
        eventBonus,
      })
      setTroopsToPlace(nextTroops)
      setPlacementHistory([])

      dispatch({ type: 'END_TURN', endTerritories })
    }
  }

  // ── Scar placement ────────────────────────────────────────────────────────
  function handlePlaceScar(type: ScarType) {
    if (!scarTarget) return
    const territory = scarTarget
    const gameNumber = gameState.gameNumber

    // The Fallout Zone is destroyed ground — no scars may be placed there
    if (territory.id === legacyStateRef.current?.falloutZoneTerritoryId) {
      showWeaknessNotice('☢ You cannot place a scar on the Fallout Zone')
      setScarTarget(null); setTriggeredCard(null)
      return
    }
    // Only one scar per territory
    if ((gameStateRef.current.territories[territory.id]?.scars?.length ?? 0) > 0) {
      showWeaknessNotice('⚠ This territory already has a scar — only one scar per territory')
      setScarTarget(null); setTriggeredCard(null)
      return
    }

    // Which card triggered this placement (if any)
    const placingCardId = triggeredCard?.id ?? activeCardId

    // Apply scar to territory in game state
    setGameState(prev => {
      const t = prev.territories[territory.id]
      if (!t) return prev
      const newScar: import('@/types/territory').Scar = { type, appliedInGame: gameNumber }
      return {
        ...prev,
        territories: {
          ...prev.territories,
          [territory.id]: { ...t, scars: [...t.scars, newScar] },
        },
      }
    })

    // If triggered by a held card, mark it as placed and remove from held set
    if (placingCardId) {
      setHeldCards(prev => prev.filter(c => c.cardId !== placingCardId))
    }

    // Record in legacy state
    const event: LegacyEvent = {
      type: 'scar-placed',
      description: `${type} placed on ${territory.name} (Game ${gameNumber})`,
      territoryId: territory.id,
    }
    const newScars = [...legacyState.scars, { territoryId: territory.id, type, appliedInGame: gameNumber }]
    const newDealtScars = placingCardId
      ? legacyState.dealtScars.map(d =>
          d.cardId === placingCardId ? { ...d, placed: true, placedOnTerritoryId: territory.id } : d,
        )
      : legacyState.dealtScars

    const newLegacy: LegacyState = {
      ...legacyState,
      scars: newScars,
      dealtScars: newDealtScars,
      historyLog: [...legacyState.historyLog, { gameNumber, entry: event.description, timestamp: new Date().toISOString() }],
    }
    setLegacyState(newLegacy)
    setLegacyEvents(prev => [...prev, event])
    saveLegacyState(newLegacy).catch(() => {})

    // Clear all placement state
    setScarTarget(null)
    setTriggeredCard(null)
    setActiveCardId(null)
    activeCardIdRef.current = null
  }

  // ── Finalize game and return to lobby ────────────────────────────────────
  // The lobby RE-READS the campaign from Supabase the moment it mounts, so this
  // save must land before we navigate. Firing it off unawaited let the read beat
  // the write, and the lobby would show the campaign as it was before the game.
  /**
   * Write the finished campaign and confirm it stuck.
   *
   * An autosave issued moments earlier can still be in flight, and two
   * concurrent upserts have no ordering guarantee — the older one landing last
   * would restore gameInProgress:true and the finished board. Reading back and
   * re-writing once closes that window, which is worth a round trip given the
   * alternative is the table replaying a game they already finished.
   */
  async function saveFinishedCampaign(finished: LegacyState) {
    await saveLegacyState(finished)
    const stored = await loadLegacyState(finished.campaignId).catch(() => null)
    if (stored?.gameInProgress || stored?.activeGameState) {
      console.warn('[Finalize] A late autosave resurrected the finished game — rewriting')
      await saveLegacyState(finished)
    }
  }

  async function finalizeAndReturnToLobby(working: LegacyState) {
    gameFinishedRef.current = true
    const completed = { ...working, gameInProgress: false, activeGameState: null, purchasedStars: {} }

    // The campaign ends after 15 games — or the moment the lead is unassailable.
    // Crown the champion here rather than returning to the lobby.
    const outcome = campaignOutcome(completed)
    if (outcome.decided && !completed.campaignComplete) {
      const finished = applyCampaignCompletion(completed, outcome)
      setLegacyState(finished)
      setCampaignOutcome(outcome)
      await saveFinishedCampaign(finished).catch(() => {})  // failure surfaces via the save-failure banner
      return
    }

    setLegacyState(completed)
    try {
      await saveFinishedCampaign(completed)
    } catch {
      // Do NOT advance to the lobby on a failed write: the lobby would reload
      // the pre-game row and silently discard everything this game produced.
      // Keep the player here so the banner is visible and the result is intact.
      return
    }
    onReturnToLobby()
  }

  function handleWinScreenComplete(editedLegacy: LegacyState, baseline: LegacyState) {
    // The win screen is long lived and edits a copy it took when it opened. A
    // reward modal can sit ON TOP of it — the Island Empire sea line does — so
    // writing that copy back wholesale reverted whatever was placed meanwhile.
    // Apply only what the win screen actually changed.
    let working = mergeLegacyEdits(legacyStateRef.current, baseline, editedLegacy)
    legacyStateRef.current = working
    setLegacyState(working)
    setShowWinScreen(false)

    // Check double-winner milestone: any player has signed the board twice.
    // Counted by roster id — two different people signing the same name must
    // not trip it, and one person signing differently each time must.
    if (!working.doubleWinnerMilestoneTriggered) {
      const [doubleSignerId] = doubleSigners(working)
      if (doubleSignerId) {
        working = {
          ...working,
          doubleWinnerMilestoneTriggered: true,
          // Add the 3 Join the Cause cards into the event deck for next game
          // (they will be included in buildEventDeck when the flag is set)
        }
        setLegacyState(working)
        setDoubleWinnerName(rosterName(working, doubleSignerId))
        setPendingReturnLegacy(working)
        setShowDoubleWinnerModal(true)
        return
      }
    }

    // Check 9th city milestone
    const minorCityCount = working.stickers.filter(s => s.description === 'city:minor').length
    if (!working.ninthCityUnlocked && minorCityCount >= 9) {
      working = {
        ...working,
        ninthCityUnlocked: true,
        draftOrderUnlocked: true,
        scarDeck: [...(working.scarDeck ?? []), ...BIOHAZARD_CARD_IDS],
      }
      setLegacyState(working)
      setPendingReturnLegacy(working)
      setShowNinthCityUnlock(true)
      return
    }

    finalizeAndReturnToLobby(working)
  }

  const selectedTerritory = selectedId ? (gameState.territories[selectedId] ?? null) : null
  const attackSrcTerritory = attackSrcId ? (gameState.territories[attackSrcId] ?? null) : null
  const attackTgtTerritory = attackTgtId ? (gameState.territories[attackTgtId] ?? null) : null
  const currentPlayer = gameState.players[gameState.currentPlayerIndex] ?? null
  const defenderPlayer = attackTgtTerritory?.occupyingPlayerId
    ? (gameState.players.find(p => p.id === attackTgtTerritory.occupyingPlayerId) ?? null)
    : null

  const advanceSrcTerritory = advanceSrcRef.current ? (gameState.territories[advanceSrcRef.current] ?? null) : null
  const advanceTgtTerritory = advanceTgtRef.current ? (gameState.territories[advanceTgtRef.current] ?? null) : null

  const fortifySrcTerritory = fortifySrcId ? (gameState.territories[fortifySrcId] ?? null) : null
  const fortifyDstTerritory = fortifyDstId ? (gameState.territories[fortifyDstId] ?? null) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#C4A830' }}>
      {/* Header bar — sits above the map, never overlaps it */}
      <div style={{ position: 'relative', height: 56, flexShrink: 0, zIndex: 50 }}>
        <TurnControls
          gameState={gameState}
          troopsToPlace={troopsToPlace}
          placementsCount={placementHistory.length}
          fortifyDone={fortifyDone}
          pendingCardDraws={pendingCardDraws}
          balkRoundUp={playerAbility(gameState.players[gameState.currentPlayerIndex]?.id ?? '') === 'balk-round-up'}
          worldCapitalTerritoryId={legacyState.worldCapitalTerritoryId ?? null}
          primitiveWeakness={(legacyState.alienWeaknessPowers ?? {})[gameState.players[gameState.currentPlayerIndex]?.factionId ?? ''] === 'wp-primitive'}
          continentBonusModifiers={legacyState.continentBonusModifiers ?? []}
          namedContinents={legacyState.namedContinents ?? {}}
          onNextPhase={handleNextPhase}
          onUndoPlacement={handleUndoPlacement}
          onUndoFortify={handleUndoFortify}
          canUndoFortify={!!lastFortify}
        />
        {/* Legacy Panel button — top-right */}
        <div style={{ position: 'absolute', top: 8, right: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <SoundSettings inline />
          {currentPlayer?.isAI && (
            <button
              onClick={() => setAiFast(f => !f)}
              title={aiFast ? 'Return to normal AI speed' : 'Fast-forward the AI turn'}
              style={{
                padding: '5px 13px', borderRadius: 5, fontSize: 11,
                border: `1px solid ${aiFast ? '#F1C40F' : 'rgba(200,148,10,0.50)'}`,
                background: aiFast ? 'rgba(241,196,15,0.22)' : 'rgba(15,8,0,0.72)',
                color: aiFast ? '#F1C40F' : '#C8940A',
                cursor: 'pointer', fontFamily: 'Georgia, serif',
                backdropFilter: 'blur(6px)', letterSpacing: 0.5, fontWeight: 'bold',
                boxShadow: aiFast ? '0 0 10px rgba(241,196,15,0.35)' : 'none',
              }}
            >
              {aiFast ? '⏩ Fast ✓' : '⏩ Fast Forward'}
            </button>
          )}
          <button
            onClick={() => setShowLegacyPanel(true)}
            style={{
              padding: '5px 13px', borderRadius: 5, fontSize: 11,
              border: '1px solid rgba(200,148,10,0.50)', background: 'rgba(15,8,0,0.72)',
              color: '#C8940A', cursor: 'pointer', fontFamily: 'Georgia, serif',
              backdropFilter: 'blur(6px)', letterSpacing: 0.5,
            }}
          >
            📜 Legacy
          </button>
          <button
            onClick={() => setShowMenuConfirm(true)}
            style={{
              padding: '5px 13px', borderRadius: 5, fontSize: 11,
              border: '1px solid rgba(120,80,20,0.40)', background: 'rgba(15,8,0,0.72)',
              color: '#7a5030', cursor: 'pointer', fontFamily: 'Georgia, serif',
              backdropFilter: 'blur(6px)',
            }}
          >
            ← Menu
          </button>
        </div>
      </div>

      {/* Map area — fills remaining height below header */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* Grey map base canvas — PNG converted to uniform grey with borders visible */}
      <canvas ref={greyCanvasRef} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'contain', objectPosition: 'center',
        pointerEvents: 'none', zIndex: 0,
      }} />
      {/* SVG territory fill overlay — exact path shapes from Risk board SVG */}
      <div ref={svgContainerRef} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} />
      {/* PixiJS canvas — border rings and hit areas only */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 3 }} />
      {/* SVG layer — troop bubbles, city markers, fortification rings */}
      <SVGMapLayer
        territories={applyLegacyToTerritories(gameState.territories, legacyState)}
        players={gameState.players}
        legacy={legacyState}
        draftPlaced={gameState.phase === 'reinforce' ? draftPlaced : undefined}
        draftColor={(() => {
          const hex = FACTION_COLORS[currentPlayer?.factionId ?? ''] ?? NEUTRAL_COLOR
          return `#${hex.toString(16).padStart(6, '0')}`
        })()}
      />

      {/* Attack flight overlay — bubble travelling attacker → defender */}
      {attackFlight && (() => {
        const pos = (id: string) => {
          const def = TERRITORY_DEFINITIONS.find(d => d.id === id)
          if (def) return { x: def.labelX, y: def.labelY }
          const t = gameState.territories[id]
          return t ? { x: t.labelX, y: t.labelY } : null
        }
        const s = pos(attackFlight.srcId), t = pos(attackFlight.tgtId)
        if (!s || !t) return null
        const isAttack = attackFlight.kind === 'attack'
        const lineColor = isAttack ? '#E74C3C' : `rgb(${attackFlight.rgb})`
        return (
          <svg
            key={attackFlight.seq}
            className="flight-layer"
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 6,
              ['--fld' as string]: `${attackFlight.durMs + 120}ms`,
            }}
          >
            {/* Marching dashed line src → tgt */}
            <line
              className="flight-line"
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke={lineColor} strokeWidth="2.5"
              strokeDasharray="8 5" strokeLinecap="round" opacity="0.75"
            />
            {/* Pulse ring on the target */}
            <circle className="capture-ripple" cx={t.x} cy={t.y} r={9} fill="none" stroke={lineColor} strokeWidth="2.5" />
            {/* Travelling troop bubble */}
            <g transform={`translate(${s.x}, ${s.y})`}>
              <g
                className="flight-bubble"
                style={{
                  ['--fx' as string]: `${t.x - s.x}px`,
                  ['--fy' as string]: `${t.y - s.y}px`,
                  ['--fd' as string]: `${attackFlight.durMs}ms`,
                }}
              >
                <circle r={10} fill={`rgba(${attackFlight.rgb},0.95)`} stroke="white" strokeWidth="2" />
                <text
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={isAttack ? 10 : 9} fontWeight="bold" fill="white"
                  fontFamily="Georgia, serif"
                  stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" paintOrder="stroke"
                >
                  {attackFlight.label}
                </text>
              </g>
            </g>
          </svg>
        )
      })()}

      {/* Turn-change banner — slides in announcing whose turn it is */}
      <TurnBanner info={turnBanner} onDone={() => setTurnBanner(null)} />

      {/* Milestone confetti burst — fires above everything, never blocks clicks */}
      {confettiSeq > 0 && <ConfettiBurst key={confettiSeq} />}

      {/* ── Scar card reference panel — top left, always visible ──────────── */}
      {(() => {
        // Build list of scar types to show based on campaign state
        type ScarEntry =
          { kind: 'scar'; type: string; name: string; color: string; icon: React.ReactNode; trigger: string; effect: string }

        const entries: ScarEntry[] = []

        // Bunker — always shown
        const bunkerMeta = SCAR_META.find(m => m.type === 'fortified')
        if (bunkerMeta) entries.push({
          kind: 'scar', type: 'fortified', name: 'Bunker',
          color: bunkerMeta.color, icon: <span style={{ fontSize: 13 }}>{bunkerMeta.icon}</span>,
          trigger: 'immediate', effect: bunkerMeta.effect,
        })

        // Ammo Shortage — always shown
        const ammoMeta = SCAR_META.find(m => m.type === 'wasteland')
        if (ammoMeta) entries.push({
          kind: 'scar', type: 'wasteland', name: 'Ammo Shortage',
          color: ammoMeta.color, icon: (
            <svg width="18" height="18" viewBox="-9 -9 18 18" style={{ flexShrink: 0 }}>
              <circle cx="0" cy="0" r="8" fill="none" stroke="#c0392b" strokeWidth="1.8" />
              <rect x="-1.75" y="-1" width="3.5" height="5" fill="#D4A017" stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" rx="0.5" />
              <path d="M -1.75 -1 Q 0 -4 1.75 -1" fill="#F0C040" stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
              <rect x="-2.55" y="3.2" width="5.1" height="1.8" fill="#B8860B" stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" rx="0.3" />
              <line x1="-5.5" y1="5.5" x2="5.5" y2="-5.5" stroke="#c0392b" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ),
          trigger: 'immediate', effect: ammoMeta.effect,
        })

        // Mercenary — shown once first elimination has occurred
        const mercMeta = SCAR_META.find(m => m.type === 'mercenary')
        if (mercMeta && legacyState.firstEliminationTriggered && gameState.gameNumber > 1) entries.push({
          kind: 'scar', type: 'mercenary', name: 'Mercenary',
          color: mercMeta.color, icon: <span style={{ fontSize: 13 }}>{mercMeta.icon}</span>,
          trigger: 'immediate', effect: mercMeta.effect,
        })

        // Biohazard — shown once 9th city is unlocked
        const bioMeta = SCAR_META.find(m => m.type === 'biological')
        if (bioMeta && legacyState.ninthCityUnlocked) entries.push({
          kind: 'scar', type: 'biological', name: 'Biohazard',
          color: bioMeta.color,
          icon: <BiohazardIcon size={14} color={bioMeta.color} />,
          trigger: 'immediate', effect: bioMeta.effect,
        })

        return (
          <div style={{
            position: 'absolute', top: 10, left: 10,
            zIndex: 20, fontFamily: 'Georgia, serif',
            display: 'flex', flexDirection: 'column', gap: 6,
            pointerEvents: 'none',
          }}>
            {entries.map(entry => {
              // A player may hold several cards of the same scar type — list each
              // owner only once so React keys stay unique.
              const ownerList = heldCards
                .filter(hc => getScarCard(hc.cardId)?.type === entry.type)
                .map(hc => gameState.players.find(p => p.id === hc.playerId))
                .filter(Boolean) as typeof gameState.players
              const owners = ownerList.filter((p, i) => ownerList.findIndex(o => o.id === p.id) === i)

              return (
                <div key={entry.type} style={{
                  background: 'rgba(8,4,0,0.88)',
                  border: `1px solid ${entry.color}44`,
                  borderLeft: `3px solid ${entry.color}`,
                  borderRadius: 5,
                  padding: '5px 8px',
                  maxWidth: 175,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{entry.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 'bold', color: entry.color }}>{entry.name}</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 6, fontWeight: 'bold',
                      background: entry.color + '22', color: entry.color,
                      borderRadius: 2, padding: '1px 3px', letterSpacing: 0.6, textTransform: 'uppercase',
                    }}>{entry.trigger}</span>
                  </div>
                  {owners.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {owners.map(owner => {
                        const col = FACTION_COLORS[owner.factionId] ?? NEUTRAL_COLOR
                        const pr = (col >> 16) & 0xff, pg = (col >> 8) & 0xff, pb = col & 0xff
                        return (
                          <div key={owner.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: `rgb(${pr},${pg},${pb})` }} />
                            <span style={{ fontSize: 8, color: `rgb(${pr},${pg},${pb})` }}>{owner.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: 8, color: 'rgba(220,200,160,0.85)', lineHeight: 1.3, fontStyle: 'italic' }}>
                    {entry.effect}
                  </div>
                </div>
              )
            })}

            {/* Fortification — always shown */}
            <div style={{
              background: 'rgba(8,4,0,0.88)',
              border: '1px solid #3498DB44',
              borderLeft: '3px solid #3498DB',
              borderRadius: 5,
              padding: '5px 8px',
              maxWidth: 175,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="6" fill="none" stroke="#3498DB" strokeWidth="2.5" strokeDasharray="3 2" />
                </svg>
                <span style={{ fontSize: 10, fontWeight: 'bold', color: '#3498DB' }}>Fortification</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 6, fontWeight: 'bold',
                  background: '#3498DB22', color: '#3498DB',
                  borderRadius: 2, padding: '1px 3px', letterSpacing: 0.6, textTransform: 'uppercase',
                }}>passive</span>
              </div>
              <div style={{ fontSize: 8, color: 'rgba(220,200,160,0.85)', lineHeight: 1.3, fontStyle: 'italic' }}>
                +1 to both dice while defending this territory.
              </div>
            </div>
          </div>
        )
      })()}

      {/* Campaign victory log — lower left */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10,
        zIndex: 20, fontFamily: 'Georgia, serif',
        background: '#ffffff', border: '1px solid rgba(200,148,10,0.5)',
        borderRadius: 7, padding: '8px 12px', minWidth: 160,
      }}>
        <div style={{ fontSize: 11, color: '#C8940A', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center', fontWeight: 'bold' }}>
          Campaign Winners
        </div>
        {Array.from({ length: 15 }, (_, i) => {
          const entry = (legacyState.victoryLog ?? []).find(v => v.gameNumber === i + 1)
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: 5,
              borderBottom: i < 14 ? '1px solid rgba(200,148,10,0.15)' : 'none',
              padding: '3px 0',
            }}>
              <span style={{ fontSize: 11, color: '#9a7030', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ fontSize: 12, color: entry ? '#1a0e00' : 'rgba(150,120,70,0.4)', fontStyle: entry ? 'normal' : 'italic', flex: 1 }}>
                {entry ? entry.winnerName : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Player roster — right side panel */}
      <div style={{
        position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 6,
        zIndex: 20,
      }}>
        {gameState.players.map((player, i) => {
          const col = FACTION_COLORS[player.factionId] ?? NEUTRAL_COLOR
          const isActive = i === gameState.currentPlayerIndex
          const r = (col >> 16) & 0xff, g = (col >> 8) & 0xff, b = col & 0xff
          const ownedCount = Object.values(gameState.territories).filter(t => t.occupyingPlayerId === player.id).length
          const totalTroops = Object.values(gameState.territories)
            .filter(t => t.occupyingPlayerId === player.id)
            .reduce((s, t) => s + t.troops, 0)
          return (
            <div key={player.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: isActive ? `rgba(${r},${g},${b},0.18)` : 'rgba(10,5,0,0.72)',
              border: `1.5px solid ${isActive ? `rgba(${r},${g},${b},0.85)` : 'rgba(100,75,25,0.22)'}`,
              borderRadius: 8, fontFamily: 'Georgia, serif',
              color: '#E8D8A8', backdropFilter: 'blur(6px)',
              boxShadow: isActive ? `0 0 12px rgba(${r},${g},${b},0.4)` : 'none',
              minWidth: 138,
            }}>
              {/* Color circle */}
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.35), rgb(${r},${g},${b}))`,
                border: `2px solid rgba(${r},${g},${b},0.8)`,
                boxShadow: isActive ? `0 0 8px rgb(${r},${g},${b})` : 'none',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: isActive ? 'bold' : 'normal',
                  color: isActive ? `rgb(${r},${g},${b})` : '#E8D8A8',
                  letterSpacing: 0.3,
                }}>
                  {player.name}
                  {/* Card count — same source as the Cards button, so the two
                      always agree. Shown for every player (hand contents stay
                      secret; only the total is public). */}
                  <span
                    title={`${player.cards.length} card${player.cards.length !== 1 ? 's' : ''} in hand (territory + resource)`}
                    style={{
                      marginLeft: 5, fontSize: 9, fontWeight: 'bold',
                      color: player.cards.length > 0 ? '#C8940A' : 'rgba(200,148,10,0.40)',
                      border: `1px solid rgba(200,148,10,${player.cards.length > 0 ? 0.5 : 0.22})`,
                      borderRadius: 4, padding: '0 4px', whiteSpace: 'nowrap',
                    }}
                  >
                    🃏 {player.cards.length}
                  </span>
                  {player.isAI && (
                    <span
                      title={`Computer opponent — ${player.aiDifficulty ? AI_DIFFICULTY_LABEL[player.aiDifficulty] : 'AI'}`}
                      style={{ marginLeft: 5, fontSize: 9, color: '#7fb3d3', fontWeight: 'bold', border: '1px solid rgba(127,179,211,0.5)', borderRadius: 4, padding: '0 4px' }}
                    >
                      🤖{player.aiDifficulty ? ' ' + AI_DIFFICULTY_BADGE[player.aiDifficulty] : ''}
                    </span>
                  )}
                  {legacyState.nuclearBringerFactionId === player.factionId && (
                    <span
                      title="Bringer of Nuclear Fire"
                      style={{ marginLeft: 5, fontSize: 10, color: '#e74c3c', fontWeight: 'bold' }}
                    >
                      ☢
                    </span>
                  )}
                  {player.factionId === 'mutants' && (
                    <span
                      title={'Comeback powers (always active): Re-roll 1\'s when attacking the Bringer of Nuclear Fire · Bio-hazard and Mercenary scar effects are reversed'}
                      style={{ marginLeft: 5, fontSize: 10, color: '#2980b9', fontWeight: 'bold' }}
                    >
                      ↺↺
                    </span>
                  )}
                  {isActive && <span style={{ marginLeft: 4, fontSize: 9 }}>◀</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: 'rgba(220,200,140,0.75)' }}>
                    🗺 {ownedCount}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(220,200,140,0.75)' }}>
                    ⚔ {totalTroops}
                  </span>
                  {gameState.activeHqs[player.id] && (
                    <span style={{ fontSize: 10, color: '#C8940A' }}>♛</span>
                  )}
                  {(() => {
                    const stars = countStars(player.id, gameState.territories)
                    if (stars === 0) return null
                    return (
                      <span style={{ fontSize: 10, color: '#e74c3c', letterSpacing: 1 }}>
                        {'★'.repeat(stars)}
                      </span>
                    )
                  })()}
                  {(() => {
                    const missiles = (legacyState.missiles ?? {})[player.id] ?? 0
                    if (missiles === 0) return null
                    return (
                      <span title={`${missiles} missile${missiles !== 1 ? 's' : ''}`}
                        style={{ fontSize: 10, color: '#7fb3d3' }}>
                        🚀 {missiles}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </div>
          )
        })}
      </div>


      {/* ── Board cards — docked in the right margin, plus a blown-up view ────
          Two rows: Event · Mission · Coin pile across the top, the four face-up
          territory cards horizontally across the bottom.

          ONE renderer draws both sizes. Cards divide their row with flex rather
          than fixed widths, so the same markup fills a 300px margin panel and a
          near-full-screen overlay; `s` scales type and spacing with it. A second
          copy of this markup would drift the moment either size was tweaked. */}
      {(() => {
        const CONT_COLOR: Record<string, string> = {
          'north-america': '#E67E22', 'south-america': '#27AE60',
          'europe': '#2980B9', 'africa': '#E74C3C',
          'asia': '#8E44AD', 'australia': '#F39C12',
        }
        const sideboard = cardState.sideboard ?? []
        const currentEventCard = currentEventCardId ? getEventCard(currentEventCardId) : null
        const currentMissionId = cardState.currentMissionId ?? null
        const currentMission = currentMissionId ? (CARD_LOOKUP.get(currentMissionId) as import('@/types/card').MissionCard | undefined) : null

        const isPrivate = !!currentMissionId && isPrivateMission(currentMissionId)
        const mAccent = isPrivate ? '160,110,220' : '220,80,80'
        const mSolid = isPrivate ? '#a06edc' : '#dc5050'
        const mBody = isPrivate ? '#e0ccff' : '#ffc8c8'
        const coinsLeft = cardState.resourceDeck?.length ?? 0
        const coinsDepleted = coinsLeft === 0

        /** Docked width. Past ~196 the panel clips the far east of the map —
         *  worth it for legibility, and no territory label sits under it. */
        const DOCKED_W = 300

        function table(s: number) {
          const r = (n: number) => Math.round(n * s * 10) / 10
          const gap = r(5)
          // Above this scale there is room for the detail the margin panel has
          // to leave out: full mission text and coins as countable icons.
          const full = s >= 1.5

          const cardBase: React.CSSProperties = {
            flex: '1 1 0', minWidth: 0,
            background: '#1a0d00', borderRadius: r(6), padding: `${r(4)}px ${r(4)}px ${r(3)}px`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: r(3),
            boxShadow: '0 1px 5px rgba(0,0,0,0.6)',
          }
          const slotLabel = (color: string): React.CSSProperties => ({
            fontSize: r(8), letterSpacing: r(1), textTransform: 'uppercase',
            color, textAlign: 'center', marginBottom: r(3),
          })
          const deckCount = (n: number, rgb: string) => (
            <div style={{ fontSize: r(8), color: `rgba(${rgb},0.55)`, textAlign: 'center', fontFamily: 'Georgia, serif' }}>
              🂠 {n}
            </div>
          )
          const bar = (color: string, on = true) => (
            <div style={{ width: '100%', height: r(3), borderRadius: r(2), background: color, opacity: on ? 1 : 0.3 }} />
          )

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: gap + r(2) }}>

              {/* ── Top row: Event · Mission · Coin pile ── */}
              <div style={{ display: 'flex', flexDirection: 'row', gap }}>

                {/* Event */}
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <div style={slotLabel('rgba(100,180,255,0.75)')}>Event</div>
                  <div style={{
                    ...cardBase,
                    border: `${r(1.5)}px solid rgba(100,180,255,${currentEventCard ? 0.6 : 0.2})`,
                    minHeight: r(68), justifyContent: 'center',
                  }}>
                    {bar('#64b4ff', !!currentEventCard)}
                    {currentEventCard ? (
                      <>
                        <div style={{ fontSize: r(16) }}>⚡</div>
                        <div style={{
                          fontSize: r(9), fontWeight: 'bold', color: '#c8e0ff',
                          textAlign: 'center', lineHeight: 1.25, fontFamily: 'Georgia, serif',
                          wordBreak: 'break-word',
                        }}>
                          {currentEventCard.name}
                        </div>
                        {full && currentEventCard.description && (
                          <div style={{
                            fontSize: r(7.5), color: 'rgba(200,224,255,0.65)', textAlign: 'center',
                            lineHeight: 1.35, fontFamily: 'Georgia, serif',
                          }}>
                            {currentEventCard.description}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: r(20), opacity: 0.25 }}>⚡</div>
                        <div style={{ fontSize: r(8), color: 'rgba(100,180,255,0.35)', textAlign: 'center', lineHeight: 1.25 }}>
                          none
                        </div>
                      </>
                    )}
                  </div>
                  {deckCount(cardState.eventDeck?.length ?? 0, '100,180,255')}
                </div>

                {/* Mission — private missions are recoloured purple and labelled,
                    since claiming one is worth a permanent star power. */}
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <div style={slotLabel(`rgba(${mAccent},0.75)`)}>{isPrivate ? '✦ Private' : 'Mission'}</div>
                  <div style={{
                    ...cardBase,
                    border: `${r(1.5)}px solid rgba(${mAccent},${currentMission ? 0.6 : 0.2})`,
                    minHeight: r(68), justifyContent: 'center',
                    boxShadow: isPrivate ? `0 0 ${r(10)}px rgba(${mAccent},0.30)` : cardBase.boxShadow,
                  }}>
                    {bar(mSolid, !!currentMission)}
                    {currentMission ? (
                      <>
                        <div style={{ fontSize: r(13) }}>
                          {isPrivate ? '✦★' : currentMission.stars === 2 ? '★★' : '★'}
                        </div>
                        <div style={{
                          fontSize: r(9), fontWeight: 'bold', color: mBody,
                          textAlign: 'center', lineHeight: 1.25, fontFamily: 'Georgia, serif',
                          wordBreak: 'break-word',
                        }}>
                          {isPrivate ? currentMission.name : currentMission.description}
                        </div>
                        {full && isPrivate && (
                          <div style={{
                            fontSize: r(7.5), color: 'rgba(224,204,255,0.7)', textAlign: 'center',
                            lineHeight: 1.35, fontFamily: 'Georgia, serif',
                          }}>
                            {currentMission.description}
                          </div>
                        )}
                        {full && (
                          <div style={{ fontSize: r(7), color: `rgba(${mAccent},0.75)`, letterSpacing: r(0.5), textAlign: 'center' }}>
                            {isPrivate
                              ? 'CLAIM = PERMANENT STAR POWER'
                              : currentMission.stars === 2 ? 'SPECIAL · SINGLE USE' : 'SHARED — ANY PLAYER'}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: r(20), opacity: 0.25 }}>🎯</div>
                        <div style={{ fontSize: r(8), color: `rgba(${mAccent},0.35)`, textAlign: 'center', lineHeight: 1.25 }}>
                          none
                        </div>
                      </>
                    )}
                  </div>
                  {deckCount(cardState.missionDeck?.length ?? 0, '220,80,80')}
                </div>

                {/* Coin pile — beside the mission so both shared piles read together */}
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <div style={slotLabel('rgba(200,148,10,0.75)')}>Coins</div>
                  <div style={{
                    ...cardBase,
                    border: `${r(1.5)}px solid ${coinsDepleted ? 'rgba(192,57,43,0.6)' : 'rgba(200,148,10,0.88)'}`,
                    minHeight: r(68), justifyContent: 'center',
                  }}>
                    {bar(coinsDepleted ? '#c0392b' : '#C8940A')}
                    <span style={{ fontSize: r(27), color: coinsDepleted ? '#c0392b' : undefined }}>
                      {coinsDepleted ? '★' : '🪙'}
                    </span>
                    {coinsDepleted ? (
                      <span style={{ fontSize: r(8), color: '#c0392b', fontWeight: 'bold', letterSpacing: r(0.5) }}>GONE</span>
                    ) : (
                      <span style={{ fontSize: r(9), color: '#C8940A', fontWeight: 'bold', letterSpacing: r(0.5) }}>
                        {coinsLeft} left
                      </span>
                    )}
                    {full && (
                      <span style={{ fontSize: r(6.5), color: 'rgba(200,148,10,0.55)', textAlign: 'center', lineHeight: 1.35 }}>
                        {coinsDepleted
                          ? 'the red star has been resolved'
                          : 'traded-in coins return here'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Bottom row: the four face-up territory cards ── */}
              <div>
                <div style={slotLabel('rgba(200,148,10,0.75)')}>Face-up Territory Cards</div>
                <div style={{ display: 'flex', flexDirection: 'row', gap }}>
                  {sideboard.slice(0, 4).map((cardId, idx) => {
                    const card = getTerritoryCard(cardId)
                    const terrDef = card ? TERRITORY_DEFINITIONS.find(d => d.id === card.territoryId) : null
                    const contColor = CONT_COLOR[terrDef?.continentId ?? ''] ?? '#888'
                    const coins = legacyState.cardResources?.[cardId] ?? 0
                    return (
                      <div key={cardId} style={{
                        ...cardBase,
                        border: `${r(1.5)}px solid ${contColor}88`,
                        position: 'relative', gap: r(2),
                      }}>
                        {/* Number badge */}
                        <div style={{
                          position: 'absolute', top: -r(6), left: -r(6),
                          width: r(15), height: r(15), borderRadius: '50%',
                          background: contColor, color: '#000',
                          fontSize: r(9), fontWeight: 900,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.7)',
                          fontFamily: 'Georgia, serif', zIndex: 1,
                        }}>
                          {idx + 1}
                        </div>
                        {bar(contColor)}
                        <div style={{
                          fontSize: r(11), fontWeight: 'bold', color: '#E8DCC8',
                          textAlign: 'center', lineHeight: 1.2,
                          fontFamily: 'Georgia, serif', wordBreak: 'break-word',
                          minHeight: r(24),
                        }}>
                          {terrDef?.name ?? cardId}
                        </div>
                        {full && (
                          <div style={{
                            fontSize: r(7), color: contColor, letterSpacing: r(0.5),
                            fontFamily: 'Georgia, serif', textAlign: 'center',
                          }}>
                            {(terrDef?.continentId ?? '').replace(/-/g, ' ').toUpperCase()}
                          </div>
                        )}
                        {/* Coin value. The margin panel shows a count because a
                            row of icons wraps badly at 67px; the blown-up view
                            has room for icons you can actually count. */}
                        <div style={{
                          width: '100%',
                          background: coins > 0 ? 'rgba(200,148,10,0.10)' : 'rgba(200,148,10,0.04)',
                          border: `1px solid rgba(200,148,10,${coins > 0 ? 0.35 : 0.12})`,
                          borderRadius: r(4), padding: `${r(2)}px ${r(1)}px`,
                          display: 'flex', flexWrap: 'wrap',
                          justifyContent: 'center', alignItems: 'center', gap: r(1),
                          minHeight: full ? r(20) : undefined,
                        }}>
                          {coins > 0 ? (
                            full
                              ? Array.from({ length: coins }, (_, i) => (
                                  <span key={i} style={{ fontSize: r(11) }}>🪙</span>
                                ))
                              : (
                                <>
                                  <span style={{ fontSize: r(11) }}>🪙</span>
                                  <span style={{ fontSize: r(10), color: '#C8940A', fontWeight: 'bold' }}>{coins}</span>
                                </>
                              )
                          ) : (
                            <span style={{ fontSize: r(9), color: 'rgba(200,148,10,0.3)' }}>—</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        }

        return (
          <>
            {/* Docked copy. Offsets are relative to the board container, which
                starts below the toolbar — top: 6 tucks it under the sound menu,
                above the player list further down the same margin. */}
            <div style={{
              position: 'absolute', top: 6, right: 10, zIndex: 21,
              width: DOCKED_W, padding: 7,
              background: 'rgba(10,5,0,0.82)',
              border: '1px solid rgba(200,148,10,0.30)',
              borderRadius: 8,
              boxShadow: '0 2px 10px rgba(0,0,0,0.55)',
              // The panel itself must never eat a map click; only the button does.
              pointerEvents: 'none',
            }}>
              <button
                onClick={() => setCardsExpanded(true)}
                title="Enlarge the board cards"
                style={{
                  position: 'absolute', top: 4, right: 4, zIndex: 2,
                  width: 20, height: 20, borderRadius: 5, padding: 0,
                  border: '1px solid rgba(200,148,10,0.45)',
                  background: 'rgba(200,148,10,0.16)', color: '#C8940A',
                  fontSize: 11, lineHeight: 1, cursor: 'pointer',
                  fontFamily: 'Georgia, serif', pointerEvents: 'auto',
                }}>
                ⤢
              </button>
              {table(1)}
            </div>

            {/* Blown-up copy — click the backdrop or press Escape to dismiss. */}
            {cardsExpanded && (
              <div
                onClick={() => setCardsExpanded(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 400,
                  background: 'rgba(0,0,0,0.78)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 20, pointerEvents: 'auto',
                }}>
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    width: 'min(1040px, 94vw)', maxHeight: '92vh', overflowY: 'auto',
                    background: 'linear-gradient(160deg, #1A0E02 0%, #0A0600 100%)',
                    border: '2px solid rgba(200,148,10,0.55)',
                    borderRadius: 14, padding: '18px 22px 22px',
                    boxShadow: '0 20px 70px rgba(0,0,0,0.9)',
                  }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 16, borderBottom: '1px solid rgba(200,148,10,0.20)', paddingBottom: 9,
                  }}>
                    <span style={{
                      fontSize: 13, color: '#C8940A', letterSpacing: 2,
                      textTransform: 'uppercase', fontFamily: 'Georgia, serif',
                    }}>
                      🎴 Board Cards
                    </span>
                    <button
                      onClick={() => setCardsExpanded(false)}
                      style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12,
                        border: '1px solid rgba(200,148,10,0.45)',
                        background: 'rgba(200,148,10,0.12)', color: '#E8DCC8',
                        cursor: 'pointer', fontFamily: 'Georgia, serif',
                      }}>
                      ✕ Close
                    </button>
                  </div>
                  {table(2.2)}
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* ── Tracks group (population + card trade-in) — right of scar cards ── */}
      {(() => {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex]
        const ownedCount = currentPlayer
          ? Object.values(gameState.territories).filter(t => t.occupyingPlayerId === currentPlayer.id).length
          : 0
        const col = currentPlayer ? (FACTION_COLORS[currentPlayer.factionId] ?? NEUTRAL_COLOR) : NEUTRAL_COLOR
        const pr = (col >> 16) & 0xff, pg = (col >> 8) & 0xff, pb = col & 0xff

        // 1-11 → 3 troops, then every 3 territories = +1 troop up to 20 max
        const steps: Array<{ label: string; min: number; max: number; troops: number }> = [
          { label: '1-11', min: 1,  max: 11, troops: 3 },
        ]
        for (let t = 4; t <= 20; t++) {
          const min = 9 + (t - 3) * 3
          const max = min + 2
          steps.push({ label: `${min}-${max}`, min, max, troops: t })
        }

        const activeIdx = steps.findIndex(s => ownedCount >= s.min && ownedCount <= s.max)
        const cellW = 36, cellH = 42

        const resourceCosts = [2, 3, 4, 5, 6, 7, 8, 9, 10]
        const cardCellW = 34, cardCellH = 42

        return (
          <div style={{
            position: 'absolute',
            left: 195, top: 10,
            zIndex: 21, display: 'flex', flexDirection: 'column', gap: 4,
            filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.7))',
            pointerEvents: 'none',
          }}>
          {/* Population track */}
          <div style={{
            fontFamily: 'Arial Black, Arial, sans-serif',
            display: 'flex', alignItems: 'stretch',
            borderRadius: 4, overflow: 'hidden',
          }}>
            {/* Population icon cell */}
            <div style={{
              background: '#c0392b',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '0 8px', minWidth: 38,
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: 'block' }}>
                <circle cx="6"  cy="6"  r="3.2" fill="white" opacity="0.9"/>
                <circle cx="12" cy="6"  r="3.2" fill="white" opacity="0.9"/>
                <circle cx="9"  cy="13" r="3.2" fill="white" opacity="0.9"/>
              </svg>
              <span style={{ fontSize: 6, color: 'white', letterSpacing: 0.5, marginTop: 2, fontFamily: 'Arial, sans-serif', fontWeight: 'bold' }}>POP.</span>
            </div>

            {/* TROOPS label */}
            <div style={{
              background: '#8b1a0a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 6px',
            }}>
              <span style={{
                fontSize: 9, color: '#f5d88a', fontWeight: 'bold', letterSpacing: 1,
                writingMode: 'vertical-lr', transform: 'rotate(180deg)',
                fontFamily: 'Arial Black, Arial, sans-serif',
              }}>TROOPS</span>
            </div>

            {/* Value cells */}
            {steps.map((s, i) => {
              const isActive = i === activeIdx
              const isPast = activeIdx >= 0 && i < activeIdx
              return (
                <div key={s.troops} style={{
                  width: cellW, height: cellH,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  background: isActive ? `rgb(${pr},${pg},${pb})` : isPast ? '#5a1a0a' : '#d4a843',
                  borderLeft: '1px solid #5a1a0a',
                  position: 'relative',
                }}>
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)',
                      width: 0, height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: `7px solid rgb(${pr},${pg},${pb})`,
                    }} />
                  )}
                  <span style={{
                    fontSize: 14, fontWeight: 'bold', lineHeight: 1,
                    color: isActive ? 'white' : isPast ? '#8a5a3a' : '#2a0a00',
                    fontFamily: 'Arial Black, Arial, sans-serif',
                  }}>{s.troops}</span>
                  <span style={{
                    fontSize: 9, lineHeight: 1, marginTop: 3,
                    color: isActive ? 'rgba(255,255,255,0.75)' : isPast ? '#6a3a1a' : 'rgba(60,10,0,0.55)',
                    fontFamily: 'Arial, sans-serif',
                  }}>{s.label}</span>
                </div>
              )
            })}
          </div>

          {/* Card trade-in track */}
          <div style={{
            fontFamily: 'Arial Black, Arial, sans-serif',
            display: 'flex', alignItems: 'stretch',
            borderRadius: 4, overflow: 'hidden',
          }}>
            {/* Cards icon cell */}
            {(() => {
              const coinsLeft = cardState.resourceDeck?.length ?? 0
              const coinsDepleted = coinsLeft === 0
              return (
                <div style={{
                  background: coinsDepleted ? '#7a1010' : '#c0392b',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '0 8px', minWidth: 38,
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{coinsDepleted ? '★' : '🪙'}</span>
                  <span style={{ fontSize: 6, color: coinsDepleted ? '#ffaaaa' : 'white', letterSpacing: 0.5, marginTop: 2, fontFamily: 'Arial, sans-serif', fontWeight: 'bold' }}>
                    {coinsDepleted ? 'GONE' : `${coinsLeft} LEFT`}
                  </span>
                </div>
              )
            })()}

            {/* TROOPS label */}
            <div style={{
              background: '#8b1a0a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 6px',
            }}>
              <span style={{
                fontSize: 9, color: '#f5d88a', fontWeight: 'bold', letterSpacing: 1,
                writingMode: 'vertical-lr', transform: 'rotate(180deg)',
                fontFamily: 'Arial Black, Arial, sans-serif',
              }}>TROOPS</span>
            </div>

            {/* Value cells */}
            {CARD_TRADE_IN_VALUES.map((val, i) => (
              <div key={val} style={{
                width: cardCellW, height: cardCellH,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: '#d4a843',
                borderLeft: '1px solid #5a1a0a',
              }}>
                <span style={{
                  fontSize: 15, fontWeight: 'bold', lineHeight: 1,
                  color: '#2a0a00',
                  fontFamily: 'Arial Black, Arial, sans-serif',
                }}>{val}</span>
                <span style={{
                  fontSize: 11, lineHeight: 1, marginTop: 3,
                  color: 'rgba(60,10,0,0.55)',
                  fontFamily: 'Arial, sans-serif',
                }}>{resourceCosts[i]}🪙</span>
              </div>
            ))}

          </div>

          <div style={{ fontSize: 14, color: '#000', fontFamily: 'Arial, sans-serif', fontWeight: 'bold', paddingLeft: 2, display: 'flex', gap: 16 }}>
            <span>4 cards = <span style={{ color: '#c0392b' }}>★</span></span>
            <span>HQ = <span style={{ color: '#c0392b' }}>★</span></span>
          </div>

        </div>
        )
      })()}

      {/* ── Whose turn it is, when it is not yours ──────────────────────────
          A stalled AI turn is otherwise indistinguishable from a human seat:
          the phase controls stay live and the map stays clickable, so it looks
          as though an AI "became human" and refuses to play. This says which. */}
      {currentPlayer?.isAI && gameState.phase !== 'game-over' && !showWinScreen && (() => {
        const waitingOn = humanBlockingChoice()
        if (waitingOn) {
          return (
            <HintBar color="#F1C40F">
              🤖 <strong>{currentPlayer.name}</strong> is waiting for you to finish {waitingOn}
            </HintBar>
          )
        }
        if (aiStalled) {
          return (
            <div style={{
              position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.88)', border: '1px solid #e0707099',
              borderRadius: 6, padding: '7px 16px', zIndex: 11,
              fontFamily: 'Georgia, serif', fontSize: 12, color: '#e08070',
              display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap',
              boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
            }}>
              <span>🤖 <strong>{currentPlayer.name}</strong> has stopped mid-turn</span>
              <button
                onClick={() => { aiBusyRef.current = false; setAiStalled(false); setAiNudge(n => n + 1) }}
                style={{
                  padding: '4px 12px', borderRadius: 5, fontSize: 11.5, cursor: 'pointer',
                  border: '1px solid rgba(241,196,15,0.6)', background: 'rgba(241,196,15,0.18)',
                  color: '#F1C40F', fontFamily: 'Georgia, serif', fontWeight: 'bold',
                }}>
                Nudge
              </button>
            </div>
          )
        }
        return (
          <HintBar color="#C8940A">
            🤖 <strong>{currentPlayer.name}</strong> is taking their turn
            <Dim> · not your move</Dim>
          </HintBar>
        )
      })()}

      {/* Context hint bar — bottom-center */}
      {(gameState.phase === 'attack' && attackSrcId && !showCombat) && (
        <HintBar color="#FF6600">
          ⚔ <strong>{attackSrcTerritory?.name}</strong> selected — click an adjacent enemy to attack &nbsp;
          <Dim>· click same territory to cancel</Dim>
        </HintBar>
      )}
      {gameState.phase === 'reinforce' && troopsToPlace > 0 && (
        <HintBar color="#27AE60">
          ⊕ Click your territories to place <strong>{troopsToPlace}</strong> remaining troop{troopsToPlace !== 1 ? 's' : ''}
        </HintBar>
      )}
      {activeEffects.has('ceasefire') && gameState.phase === 'attack' && (
        <HintBar color="#2980B9">
          🕊 <strong>Ceasefire</strong> — no attacks may be launched this round
        </HintBar>
      )}
      {activeEffects.has('ammunition-shortage') && gameState.phase === 'attack' && (
        <HintBar color="#E67E22">
          ⚠ <strong>Ammo Shortage</strong> — defender's highest die −1
        </HintBar>
      )}
      {/* Saharan Republic Mobile Forces — early fortify button */}
      {(() => {
        const cp = gameState.players[gameState.currentPlayerIndex]
        const ability = cp ? (legacyStateRef.current?.chosenFactionAbilities ?? {})[cp.factionId] : null
        if (ability !== 'sahara-anytime-fortify') return null
        if (fortifyDone) return null
        const phase = gameState.phase
        if (phase !== 'reinforce' && phase !== 'attack') return null
        return (
          <div style={{
            position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            {!saharaFortifyMode ? (
              <button
                onClick={() => { setSaharaFortifyMode(true); saharaFortifyModeRef.current = true; setFortifySrcId(null); fortifySrcRef.current = null }}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontFamily: 'Georgia, serif',
                  fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
                  background: 'rgba(142,68,173,0.18)', border: '1.5px solid rgba(142,68,173,0.70)',
                  color: '#C39BD3', letterSpacing: 0.5,
                }}
              >
                ⟳ Use Fortify Now (Mobile Forces)
              </button>
            ) : (
              <button
                onClick={() => { setSaharaFortifyMode(false); saharaFortifyModeRef.current = false; setFortifySrcId(null); fortifySrcRef.current = null }}
                style={{
                  padding: '6px 16px', borderRadius: 7, fontFamily: 'Georgia, serif',
                  fontSize: 11, cursor: 'pointer',
                  background: 'rgba(100,50,140,0.15)', border: '1px solid rgba(142,68,173,0.40)',
                  color: 'rgba(195,155,211,0.70)',
                }}
              >
                Cancel Fortify
              </button>
            )}
          </div>
        )
      })()}

      {/* Mobile HQ comeback power — move an HQ to an adjacent owned territory */}
      {(() => {
        const cp = gameState.players[gameState.currentPlayerIndex]
        if (!cp) return null
        if ((legacyState.comebackPowers ?? {})[cp.factionId] !== 'mobile-hq') return null
        if (gameState.phase === 'game-over') return null
        // Only useful while they actually hold an HQ
        const holdsHq = Object.values(gameState.territories).some(
          t => t.occupyingPlayerId === cp.id && !!t.activeHqPlayerId,
        )
        if (!holdsHq) return null
        return (
          <div style={{
            position: 'absolute', bottom: 118, left: '50%', transform: 'translateX(-50%)',
            zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            {mobileHqUsed ? (
              <div style={{
                padding: '6px 16px', borderRadius: 7, fontFamily: 'Georgia, serif',
                fontSize: 11, background: 'rgba(60,40,10,0.5)',
                border: '1px solid rgba(160,106,42,0.35)', color: 'rgba(200,148,10,0.5)',
              }}>
                🏰 HQ already moved this turn
              </div>
            ) : !mobileHqMode ? (
              <button
                onClick={() => {
                  mobileHqModeRef.current = true; setMobileHqMode(true)
                  mobileHqSrcRef.current = null; setMobileHqSrcId(null)
                }}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontFamily: 'Georgia, serif',
                  fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
                  background: 'rgba(200,148,10,0.18)', border: '1.5px solid rgba(200,148,10,0.70)',
                  color: '#E8C86A', letterSpacing: 0.5,
                }}
              >
                🏰 Move HQ (Mobile HQ)
              </button>
            ) : (
              <>
                <div style={{
                  padding: '5px 14px', borderRadius: 7, fontFamily: 'Georgia, serif',
                  fontSize: 11, background: 'rgba(200,148,10,0.12)',
                  border: '1px solid rgba(200,148,10,0.45)', color: '#E8C86A',
                }}>
                  {mobileHqSrcId
                    ? `🏰 Now click an adjacent territory you control`
                    : '🏰 Click one of your HQ territories'}
                </div>
                <button
                  onClick={() => {
                    mobileHqModeRef.current = false; setMobileHqMode(false)
                    mobileHqSrcRef.current = null; setMobileHqSrcId(null)
                  }}
                  style={{
                    padding: '6px 16px', borderRadius: 7, fontFamily: 'Georgia, serif',
                    fontSize: 11, cursor: 'pointer',
                    background: 'rgba(90,60,10,0.15)', border: '1px solid rgba(160,106,42,0.40)',
                    color: 'rgba(200,148,10,0.70)',
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* Missile power activations — draft phase (Stealthy / Convincing / Rally) */}
      {gameState.phase === 'reinforce' && (() => {
        const cp = gameState.players[gameState.currentPlayerIndex]
        if (!cp) return null
        const owned = (legacyState.missilePowers ?? {})[cp.factionId] ?? []
        const draftPowers = [
          { id: 'mp-stealthy',   label: '🥷 Stealthy',   hint: 'Recruits into one empty territory', onClick: activateStealthy,   active: stealthyMode },
          { id: 'mp-convincing', label: '🧍 Convincing', hint: '+1 troop in Mercenary territories', onClick: activateConvincing, active: false },
          { id: 'mp-rally',      label: '♛ Rally',       hint: '+2 troops in every HQ you control', onClick: activateRally,      active: false },
        ].filter(p => owned.includes(p.id))
        if (draftPowers.length === 0) return null
        const missiles = (legacyState.missiles ?? {})[cp.id] ?? 0
        return (
          <div style={{
            position: 'absolute', bottom: 80, left: 12, zIndex: 60,
            display: 'flex', flexDirection: 'column', gap: 5,
            background: 'rgba(15,10,4,0.88)', border: '1.5px solid rgba(160,106,42,0.45)',
            borderRadius: 9, padding: '9px 11px', fontFamily: 'Georgia, serif',
          }}>
            <div style={{ fontSize: 9, color: '#a06a2a', letterSpacing: 1.5, marginBottom: 2 }}>
              🚀 MISSILE POWERS · {missiles} missile{missiles !== 1 ? 's' : ''}
            </div>
            {draftPowers.map(p => {
              const used = usedMissilePowersThisTurn.has(p.id)
              const disabled = used || p.active || missiles <= 0
              return (
                <button
                  key={p.id}
                  disabled={disabled}
                  onClick={p.onClick}
                  title={p.hint}
                  style={{
                    padding: '6px 12px', borderRadius: 6, textAlign: 'left',
                    fontSize: 11, fontWeight: 'bold', fontFamily: 'Georgia, serif',
                    border: `1.5px solid ${disabled ? 'rgba(160,106,42,0.20)' : 'rgba(160,106,42,0.60)'}`,
                    background: disabled ? 'rgba(0,0,0,0.25)' : 'rgba(160,106,42,0.16)',
                    color: disabled ? '#4a3a20' : '#d0a060',
                    cursor: disabled ? 'default' : 'pointer',
                  }}
                >
                  {p.label}{used ? ' ✓ used' : p.active ? ' — active' : ''}
                </button>
              )
            })}
          </div>
        )
      })()}
      {stealthyMode && !stealthyTargetId && gameState.phase === 'reinforce' && (
        <HintBar color="#a06a2a">
          🥷 <strong>Stealthy</strong> — click an unmarked, unoccupied territory to infiltrate
        </HintBar>
      )}
      {stealthyMode && stealthyTargetId && gameState.phase === 'reinforce' && troopsToPlace > 0 && (
        <HintBar color="#a06a2a">
          🥷 <strong>Stealthy</strong> — click <strong>{gameState.territories[stealthyTargetId]?.name}</strong> to place recruits there
        </HintBar>
      )}

      {/* Expand comeback power — mirrors the Stealthy hints above */}
      {gameState.phase === 'reinforce' && troopsToPlace > 0 && !stealthyMode
        && (legacyState.comebackPowers ?? {})[currentPlayer?.factionId ?? ''] === 'expand' && (
        expandTargetId ? (
          <HintBar color="#27AE60">
            🌍 <strong>Expand</strong> — click <strong>{gameState.territories[expandTargetId]?.name}</strong> again to place recruits there
          </HintBar>
        ) : (
          <HintBar color="#27AE60">
            🌍 <strong>Expand</strong> — click an unmarked, unoccupied territory to claim it
          </HintBar>
        )
      )}

      {gameState.phase === 'fortify' && !fortifyDone && !fortifySrcId && (
        <HintBar color="#2980B9">
          ⟳ Click one of your territories to move troops from — or click <strong>End Turn</strong> to skip
          {fortifyMovesLeft > 1 ? <Dim> · {fortifyMovesLeft} moves remaining</Dim> : null}
        </HintBar>
      )}
      {gameState.phase === 'fortify' && !fortifyDone && fortifySrcId && !showFortify && (
        <HintBar color="#8E44AD">
          ⟳ <strong>{fortifySrcTerritory?.name}</strong> selected — click an adjacent friendly territory to fortify
        </HintBar>
      )}
      {gameState.phase === 'fortify' && fortifyDone && (
        <HintBar color="#27AE60">
          ✓ Fortification complete — click <strong>End Turn</strong> to pass to the next player
        </HintBar>
      )}
      {saharaFortifyMode && !fortifySrcId && (
        <HintBar color="#8E44AD">
          ⟳ Mobile Forces — click one of your territories to move troops from (forfeits normal fortify)
        </HintBar>
      )}
      {saharaFortifyMode && fortifySrcId && !showFortify && (
        <HintBar color="#8E44AD">
          ⟳ <strong>{fortifySrcTerritory?.name}</strong> selected — click a connected friendly territory to fortify
        </HintBar>
      )}

      <TerritoryPanel
        territory={selectedTerritory}
        players={gameState.players}
        onClose={() => { selectedIdRef.current = null; setSelectedId(null) }}
      />

      {/* Combat modal */}
      {showCombat && attackSrcTerritory && attackTgtTerritory && currentPlayer && (() => {
        const atkAbility  = playerAbility(currentPlayer.id)
        const defPlayerId = attackTgtTerritory.occupyingPlayerId ?? ''
        const defAbility  = playerAbility(defPlayerId)
        const defHasHq    = !!attackTgtTerritory.activeHqPlayerId
        // DM Armored Command: HQ + 8+ troops → +1 to defender's highest and lowest die
        const dmArmored   = defAbility === 'dm-fortified-hq' && defHasHq && attackTgtTerritory.troops >= 8
        // DM Iron Shield: double-6 defense → shield territory from further attacks this turn
        const dmShield    = defAbility === 'dm-shield-of-6s'
        // Bear Trap: ATTACKER ability — in the FIRST territory the Bear attacks
        // each turn, the defender subtracts 1 from their lowest defense die on
        // every roll until that territory falls
        const bearTrap    = atkAbility === 'bear-subtract-die' &&
          (gameState.turn.bearTrapTerritoryId === null || gameState.turn.bearTrapTerritoryId === attackTgtTerritory.id)
        // Berserker Rage: ATTACKER ability — three-of-a-kind + kill wipes all defenders
        const bearRage    = atkAbility === 'bear-triple-kill'

        // Resilient comeback power: this faction ignores Ammo Shortage while
        // DEFENDING. Ammo Shortage no longer caps attacker dice — it applies −1
        // to the defender's highest die — so "unaffected" means that penalty is
        // simply not applied to them, from either the scar or the event.
        const defFactionId = gameState.players.find(p => p.id === defPlayerId)?.factionId ?? ''
        const defResilient = (legacyState.comebackPowers ?? {})[defFactionId] === 'resilient'

        // Scar effects on the defender's territory
        const tgtScars    = attackTgtTerritory.scars ?? []
        const hasFortifiedScar      = tgtScars.some(s => s.type === 'fortified')
        const hasFortificationScar  = tgtScars.some(s => s.type === 'fortification')
        const hasWastelandScar  = tgtScars.some(s => s.type === 'wasteland') && !defResilient
        const hasNuclearFallout = tgtScars.some(s => s.type === 'nuclear-fallout')
          || activeEffects.has('nuclear-fallout-round')

        // Fortification sticker: +1 to defender's highest die, depletes on 3-dice attacks
        const fortSticker = legacyState.stickers.find(
          s => s.targetId === attackTgtTerritory.id
            && s.description.startsWith('fortification:')
            && parseInt(s.description.split(':')[1] ?? '0') > 0,
        )
        const hasFortSticker = !!fortSticker

        // Accumulate defender die bonus from all sources
        const ammoShortage = activeEffects.has('ammunition-shortage') && !defResilient
        const defBonusHighest = (dmArmored ? 1 : 0) + (hasFortifiedScar ? 1 : 0) + (hasFortificationScar ? 1 : 0) + (hasFortSticker ? 1 : 0) + (hasWastelandScar ? -1 : 0) + (ammoShortage ? -1 : 0)
        // Fortifications (scar or city sticker) buff the defender's highest AND lowest die.
        // Bear Trap subtracts 1 from the defender's lowest die in the Bear's first attacked territory.
        const defBonusLowest  = (dmArmored ? 1 : 0) + (hasFortificationScar ? 1 : 0) + (hasFortSticker ? 1 : 0) + (bearTrap ? -1 : 0)

        // Named breakdown of the defender die modifiers — the AttackModal
        // animates each entry separately (gunshot + dice change) so players
        // see every modifier take effect. Must mirror the sums above.
        const defDieParts: Array<{ label: string; highest?: number; lowest?: number }> = []
        if (dmArmored)           defDieParts.push({ label: '🛡 Armored Command — defender +1 hi & lo', highest: 1, lowest: 1 })
        if (hasFortifiedScar)    defDieParts.push({ label: '🏰 Bunker — defender highest +1', highest: 1 })
        if (hasFortificationScar) defDieParts.push({ label: '◎ Fortification — defender +1 hi & lo', highest: 1, lowest: 1 })
        if (hasFortSticker)      defDieParts.push({ label: '◎ Fortification — defender +1 hi & lo', highest: 1, lowest: 1 })
        if (hasWastelandScar)    defDieParts.push({ label: '🔫 Ammo Shortage — defender highest −1', highest: -1 })
        if (ammoShortage)        defDieParts.push({ label: '🔫 Ammo Shortage (event) — defender highest −1', highest: -1 })
        if (bearTrap)            defDieParts.push({ label: '🐻 Bear Trap — defender lowest −1', lowest: -1 })
        // Purely informational: no die change, so the player can see WHY the
        // Ammo Shortage penalty they expected never landed.
        if (defResilient && (tgtScars.some(s => s.type === 'wasteland') || activeEffects.has('ammunition-shortage'))) {
          defDieParts.push({ label: '🛡 Resilient — Ammo Shortage ignored' })
        }

        // Comeback power effects in combat
        const currentComebackPower = (legacyState.comebackPowers ?? {})[currentPlayer.factionId ?? '']
        const atkAggressive = currentComebackPower === 'aggressive' && defHasHq ? 1 : 0

        // No attacker dice cap from Ammo Shortage — it only applies -1 to defender's highest die
        const atkMaxDice: number | undefined = undefined

        // Missiles
        const atkMissiles = (legacyState.missiles ?? {})[currentPlayer.id] ?? 0
        const defMissiles = defPlayerId ? ((legacyState.missiles ?? {})[defPlayerId] ?? 0) : 0

        // EMP missile power: dice in this territory can't be modified for the rest
        // of the turn — all die-value modifiers are zeroed, and missiles (which
        // convert dice to 6s) are unusable in this battle.
        const empActive = empTerritoryIds.has(attackTgtTerritory.id)
        const defFaction = gameState.players.find(p => p.id === defPlayerId)?.factionId ?? ''
        const attackerCanEmp = !empActive && atkMissiles > 0 &&
          factionHasMissilePower(currentPlayer.factionId, 'mp-emp') &&
          !usedMissilePowersThisTurn.has('mp-emp')
        const defenderCanEmp = !empActive && !!defPlayerId && defMissiles > 0 &&
          factionHasMissilePower(defFaction, 'mp-emp') &&
          !usedMissilePowersThisTurn.has('mp-emp')

        return (
          <AttackModal
            attacker={attackSrcTerritory}
            defender={attackTgtTerritory}
            attackerPlayer={currentPlayer}
            defenderPlayer={defenderPlayer}
            defenderDieBonus={(!empActive && (defBonusHighest !== 0 || defBonusLowest !== 0)) ? { highest: defBonusHighest, lowest: defBonusLowest } : undefined}
            defenderDieBonusParts={!empActive && defDieParts.length > 0 ? defDieParts : undefined}
            attackerBonusAllDice={empActive ? 0 : atkAggressive}
            attackerMaxDiceOverride={atkMaxDice}
            nuclearFallout={hasNuclearFallout}
            attackerSubtractLowest={false}
            tripleKillEnabled={bearRage}
            attackerMissiles={empActive ? 0 : atkMissiles}
            defenderMissiles={empActive ? 0 : defMissiles}
            attackerSixesWin={currentPlayer.factionId === 'mutants' && (legacyState.mutantEvolvePowers ?? []).includes('me-unnatural-strength')}
            attackerRerollOnes={currentPlayer.factionId === 'mutants' && !!legacyState.nuclearBringerFactionId && defFaction === legacyState.nuclearBringerFactionId}
            entryCost={entryCostBreakdown(attackTgtTerritory.id, attackTgtTerritory, currentPlayer.factionId, !attackTgtTerritory.occupyingPlayerId)}
            autoPlay={!!currentPlayer.isAI}
            autoPlayFast={aiFast}
            resolveAuto={(atk, def, mods) => resolveCombat(atk, def, mods, rngRef.current)}
            empActive={empActive}
            attackerCanEmp={attackerCanEmp}
            defenderCanEmp={defenderCanEmp}
            onActivateEmp={(side) => {
              const playerId = side === 'attacker' ? currentPlayer.id : defPlayerId
              if (!playerId) return
              if (!activateMissilePower(playerId, 'mp-emp', 'EMP')) return
              setEmpTerritoryIds(prev => new Set(prev).add(attackTgtTerritory.id))
            }}
            onAttackerUsedMissile={() => {
              setLegacyState(prev => {
                const missiles = { ...(prev.missiles ?? {}), [currentPlayer.id]: Math.max(0, ((prev.missiles ?? {})[currentPlayer.id] ?? 0) - 1) }
                const next = { ...prev, missiles }
                saveLegacyState(next).catch(() => {})
                return next
              })
            }}
            onDefenderUsedMissile={() => {
              if (!defPlayerId) return
              setLegacyState(prev => {
                const missiles = { ...(prev.missiles ?? {}), [defPlayerId]: Math.max(0, ((prev.missiles ?? {})[defPlayerId] ?? 0) - 1) }
                const next = { ...prev, missiles }
                saveLegacyState(next).catch(() => {})
                return next
              })
            }}
            onMissilePlaced={(side, totalThisRoll) => {
              // Nuclear Milestone: 3 missiles placed on a single combat roll
              if (totalThisRoll < 3) return
              if (legacyStateRef.current.nuclearMilestoneTriggered || pendingNuclearRef.current) return
              const bringerPlayerId = side === 'attacker' ? currentPlayer.id : defPlayerId
              const bringerPlayer = gameStateRef.current.players.find(p => p.id === bringerPlayerId)
              if (!bringerPlayer) return
              pendingNuclearRef.current = {
                bringerPlayerId: bringerPlayer.id,
                bringerFactionId: bringerPlayer.factionId,
                falloutTerritoryId: attackTgtTerritory.id,
              }
              setPendingNuclear(pendingNuclearRef.current)
            }}
            onDefenseDoubleMax={dmShield ? () => {
              const prevShielded = gameStateRef.current.turn.shieldedTerritoryIds
              if (!prevShielded.includes(attackTgtTerritory.id)) setTurn({ shieldedTerritoryIds: [...prevShielded, attackTgtTerritory.id] })
            } : undefined}
            onClose={closeCombatModal}
            onApplyResult={handleCombatResult}
          />
        )
      })()}

      {/* Advance panel (uncontested capture) */}
      {showAdvance && advanceSrcTerritory && advanceTgtTerritory && (
        <AdvancePanel
          src={advanceSrcTerritory}
          dst={advanceTgtTerritory}
          entryCost={entryCostBreakdown(
            advanceTgtTerritory.id,
            advanceTgtTerritory,
            gameState.players[gameState.currentPlayerIndex]?.factionId ?? '',
            true,
          )}
          onConfirm={handleAdvanceConfirm}
          onCancel={cancelAdvance}
        />
      )}

      {/* Fortify panel */}
      {showFortify && fortifySrcTerritory && fortifyDstTerritory && (
        <FortifyPanel
          src={fortifySrcTerritory}
          dst={fortifyDstTerritory}
          onConfirm={handleFortifyConfirm}
          onCancel={() => { setShowFortify(false); setFortifyDstId(null) }}
        />
      )}

      {/* Cards button — shows current player's hand */}
      {currentPlayer && gameState.phase !== 'game-over' && (
        <button
          onClick={() => setShowCardHand(true)}
          style={{
            position: 'absolute', bottom: 60, right: 14,
            padding: '6px 14px', borderRadius: 5, fontSize: 11, zIndex: 20,
            border: '1px solid rgba(200,148,10,0.50)',
            background: findBestTradeIn(currentPlayer.cards) && gameState.phase === 'reinforce'
              ? 'rgba(200,148,10,0.22)'
              : 'rgba(15,8,0,0.72)',
            color: '#C8940A', cursor: 'pointer', fontFamily: 'Georgia, serif',
            backdropFilter: 'blur(6px)', letterSpacing: 0.5,
          }}
        >
          🃏 Cards ({currentPlayer.cards.length})
          {findBestTradeIn(currentPlayer.cards) && gameState.phase === 'reinforce' && ' ★'}
        </button>
      )}

      {/* Red Star purchase — spend any 4 cards during reinforce */}
      {currentPlayer && gameState.phase === 'reinforce' && (() => {
        const hand = cardState.playerHands[currentPlayer.id] ?? []
        if (hand.length < 4) return null
        // Prefer spending coin cards first, then territory cards
        const coinIds = hand.filter(id => !!getCoinCard(id))
        const nonCoinIds = hand.filter(id => !getCoinCard(id))
        const toSpendArr = [...coinIds, ...nonCoinIds].slice(0, 4)
        return (
          <button
            onClick={() => {
              const playerId = currentPlayer.id
              const toSpend = new Set(toSpendArr)

              // 1. Compute new card state synchronously
              let removed = 0
              const newHand = (cardState.playerHands[playerId] ?? []).filter(id => {
                if (toSpend.has(id) && removed < 4) { removed++; return false }
                return true
              })
              const newCardState = { ...cardState, playerHands: { ...cardState.playerHands, [playerId]: newHand } }

              // 2. Single setLegacyState — merges card hand + star award
              setLegacyState(ls => {
                const purchased = { ...(ls.purchasedStars ?? {}), [playerId]: ((ls.purchasedStars ?? {})[playerId] ?? 0) + 1 }
                const newLs = { ...ls, purchasedStars: purchased, activeGameCards: newCardState }
                legacyStateRef.current = newLs
                saveLegacyState(newLs).catch(() => {})
                return newLs
              })
              setCardState(() => newCardState)

              // 3. Sync gameState player cards
              setGameState(prev => ({
                ...prev,
                players: prev.players.map(p =>
                  p.id === playerId
                    ? { ...p, cards: newHand }
                    : p
                ),
              }))

              // 4. Check 4-star win condition
              const state = gameStateRef.current
              const hqStars = Object.values(state.territories).filter(
                t => t.occupyingPlayerId === playerId && !!t.activeHqPlayerId,
              ).length
              const prevPurchased = (legacyStateRef.current.purchasedStars ?? {})[playerId] ?? 0
              const newTotal = hqStars + prevPurchased + 1
              if (newTotal >= 4) {
                setWinnerPlayerId(playerId)
                setWinCondition('mission')
                setUnlockOptions(pickUnlocks(state.gameNumber))
                setGameState(prev => ({ ...prev, phase: 'game-over', winnerId: playerId }))
                setTimeout(() => setShowWinScreen(true), 300)
              }
            }}
            style={{
              position: 'absolute', bottom: 88, right: 14,
              padding: '6px 14px', borderRadius: 5, fontSize: 11, zIndex: 20,
              border: '2px solid rgba(241,196,15,0.70)',
              background: 'rgba(241,196,15,0.18)',
              color: '#F1C40F', cursor: 'pointer', fontFamily: 'Georgia, serif',
              backdropFilter: 'blur(6px)', letterSpacing: 0.5,
            }}
          >
            <span style={{ color: '#e74c3c' }}>★</span> Buy Red Star (4 cards)
          </button>
        )
      })()}

      {/* ── Campaign complete: crown the champion, then hand the board back ── */}
      {campaignOutcomeState && !campaignCelebrated && (
        <CampaignCompleteScreen
          legacy={legacyState}
          outcome={campaignOutcomeState}
          onViewWorld={() => setCampaignCelebrated(true)}
        />
      )}
      {/* The finished world stays on screen for as long as they want it. */}
      {campaignOutcomeState && campaignCelebrated && (
        <div style={{
          position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1200, display: 'flex', alignItems: 'center', gap: 14,
          padding: '9px 20px', borderRadius: '0 0 10px 10px',
          background: 'rgba(12,6,0,0.94)', border: '1px solid rgba(200,148,10,0.55)', borderTop: 'none',
          fontFamily: 'Georgia, serif', color: '#E8DCC8', fontSize: 12,
          boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
        }}>
          <span>🌍 <strong style={{ color: '#C8940A' }}>{championLabel(campaignOutcomeState)}</strong> — champion of {legacyState.worldName}</span>
          <button
            onClick={() => setCampaignCelebrated(false)}
            style={{
              padding: '4px 11px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              border: '1px solid rgba(200,148,10,0.45)', background: 'transparent',
              color: '#C8940A', fontFamily: 'Georgia, serif',
            }}>
            Replay ceremony
          </button>
          <button
            onClick={onReturnToLobby}
            style={{
              padding: '4px 11px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              border: '1px solid rgba(200,148,10,0.45)', background: 'rgba(200,148,10,0.14)',
              color: '#E8DCC8', fontFamily: 'Georgia, serif',
            }}>
            Campaign summary →
          </button>
        </div>
      )}

      {/* Leave-to-menu confirmation — the button is a easy mis-click away from
          Legacy, and leaving mid-game used to be a one-way trip. */}
      {showMenuConfirm && (
        <div
          onClick={e => e.target === e.currentTarget && setShowMenuConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2500,
            background: 'rgba(5,2,0,0.78)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif',
          }}>
          <div style={{
            background: 'linear-gradient(155deg, #1A0E02 0%, #0E0700 100%)',
            border: '2px solid rgba(200,148,10,0.55)', borderRadius: 12,
            padding: '24px 28px', width: 420, maxWidth: '92vw',
            color: '#E8DCC8', boxShadow: '0 12px 44px rgba(0,0,0,0.85)',
          }}>
            <div style={{ fontSize: 17, fontWeight: 'bold', color: '#C8940A', marginBottom: 10 }}>
              Leave to the campaign screen?
            </div>
            <div style={{ fontSize: 12.5, color: '#9a8a6a', lineHeight: 1.6, marginBottom: 18 }}>
              This game is saved and stays in progress — you can pick it straight
              back up with <strong style={{ color: '#C8940A' }}>Resume Game</strong> on
              the campaign screen. Nothing is lost.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowMenuConfirm(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 7, fontSize: 13,
                  border: '1.5px solid rgba(200,148,10,0.70)', background: 'rgba(200,148,10,0.16)',
                  color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
                }}>
                Keep Playing
              </button>
              <button
                onClick={() => { setShowMenuConfirm(false); onReturnToLobby() }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 7, fontSize: 13,
                  border: '1px solid rgba(200,148,10,0.30)', background: 'transparent',
                  color: '#9a8060', cursor: 'pointer', fontFamily: 'Georgia, serif',
                }}>
                Leave to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legacy Panel overlay */}
      {showLegacyPanel && (
        <LegacyPanel
          legacy={legacyState}
          factionPlayerIds={Object.fromEntries(gameState.players.map(p => [p.factionId, p.id]))}
          onClose={() => setShowLegacyPanel(false)}
        />
      )}

      {/* First Blood milestone — shown before the comeback power choice */}
      {firstElimInfo && (() => {
        const FACTION_NAMES_FB: Record<string, string> = {
          'enclave-of-the-bear': 'Enclave of the Bear',
          'imperial-balkania':   'Imperial Balkania',
          'khan-industries':     'Khan Industries',
          'saharan-republic':    'Saharan Republic',
          'die-mechaniker':      'Die Mechaniker',
          'noble-vigil':         'Noble Vigil',
          'aliens':              'Aliens',
          'mutants':             'Mutants',
        }
        return (
          <FirstEliminationMilestoneModal
            eliminatedPlayerName={firstElimInfo.eliminatedName}
            eliminatedFactionName={FACTION_NAMES_FB[firstElimInfo.factionId] ?? firstElimInfo.factionId}
            conquerorName={firstElimInfo.conquerorName}
            onComplete={() => setFirstElimInfo(null)}
          />
        )
      })()}

      {/* Comeback power selection modal */}
      {comebackEliminatedPlayer && !firstElimInfo && (
        <ComebackPowerModal
          eliminatedPlayer={comebackEliminatedPlayer}
          factionName={comebackEliminatedPlayer.factionId}
          claimedPowerIds={legacyState.claimedComebackPowers ?? []}
          isFirstElimination={isFirstElimination}
          onSelect={(powerId) => {
            const fId = comebackEliminatedPlayer.factionId
            setLegacyState(prev => {
              const comebackPowers = { ...(prev.comebackPowers ?? {}), [fId]: powerId }
              const claimedComebackPowers = [...(prev.claimedComebackPowers ?? []), powerId]
              const next = {
                ...prev,
                firstEliminationTriggered: true,
                comebackPowers,
                claimedComebackPowers,
              }
              saveLegacyState(next).catch(() => {})
              return next
            })
            setComebackEliminatedPlayer(null)
          }}
        />
      )}

      {/* Alien Invasion Milestone modal */}
      {showAlienMilestone && (() => {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex]
        const factionId = currentPlayer?.factionId ?? ''
        const factionColor = '#' + ((FACTION_COLORS[factionId] ?? 0x888888) >>> 0).toString(16).padStart(6, '0')
        const FACTION_NAMES_LOCAL: Record<string, string> = {
          'enclave-of-the-bear': 'Enclave of the Bear',
          'imperial-balkania':   'Imperial Balkania',
          'khan-industries':     'Khan Industries',
          'saharan-republic':    'Saharan Republic',
          'die-mechaniker':      'Die Mechaniker',
          'noble-vigil':         'Noble Vigil',
          'aliens':              'Aliens',
          'mutants':             'Mutants',
        }
        const factionName = FACTION_NAMES_LOCAL[factionId] ?? factionId
        return (
          <AlienMilestoneModal
            activeFactionId={factionId}
            activeFactionName={factionName}
            activeFactionColor={factionColor}
            onComplete={handleAlienMilestoneComplete}
          />
        )
      })()}

      {/* Double-winner milestone modal */}
      {showDoubleWinnerModal && (
        <DoubleWinnerMilestoneModal
          winnerName={doubleWinnerName}
          onComplete={() => {
            setShowDoubleWinnerModal(false)
            // After double-winner modal, check 9th city
            const working = pendingReturnLegacy
            if (working) {
              const minorCityCount = working.stickers.filter(s => s.description === 'city:minor').length
              if (!working.ninthCityUnlocked && minorCityCount >= 9) {
                const updated: LegacyState = {
                  ...working,
                  ninthCityUnlocked: true,
                  draftOrderUnlocked: true,
                  scarDeck: [...(working.scarDeck ?? []), ...BIOHAZARD_CARD_IDS],
                }
                setLegacyState(updated)
                setPendingReturnLegacy(updated)
                setShowNinthCityUnlock(true)
                return
              }
              finalizeAndReturnToLobby(working)
            } else {
              onReturnToLobby()
            }
          }}
        />
      )}

      {/* 9th city unlock dramatic modal */}
      {showNinthCityUnlock && (
        <NinthCityUnlockModal
          onComplete={() => {
            setShowNinthCityUnlock(false)
            const working = pendingReturnLegacy
            if (working) {
              finalizeAndReturnToLobby(working)
            } else {
              onReturnToLobby()
            }
          }}
        />
      )}

      {/* Held scar cards tray — current player's unplaced cards */}
      {currentPlayer && (() => {
        const myCards = heldCards.filter(c => c.playerId === currentPlayer.id)
        if (myCards.length === 0) return null
        return (
          <div style={{
            position: 'absolute', bottom: 60, left: 14,
            display: 'flex', flexDirection: 'column', gap: 6, zIndex: 20,
          }}>
            {myCards.map(({ cardId }) => {
              const card = getScarCard(cardId)
              if (!card) return null
              const meta = SCAR_META.find(m => m.type === card.type)
              if (!meta) return null
              const isActive = activeCardId === cardId
              const isImmediate = card.trigger === 'immediate'
              // Bunker (fortified) and Ammo Shortage (wasteland) must be played before any dice roll on the target territory
              const isPreRollOnly = card.type === 'fortified' || card.type === 'wasteland'
              const blockedByCombat = isPreRollOnly && showCombat
              return (
                <div key={cardId} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 7,
                  background: isActive ? `${meta.color}28` : 'rgba(10,5,0,0.80)',
                  border: `1px solid ${isActive ? meta.color : meta.color + '50'}`,
                  backdropFilter: 'blur(6px)',
                  fontFamily: 'Georgia, serif',
                  opacity: blockedByCombat ? 0.45 : 1,
                }}>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: meta.color, fontWeight: 'bold' }}>{card.name}</div>
                    <div style={{ fontSize: 9, color: '#6a5030', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {card.type === 'mercenary' ? 'end-of-turn effect' : card.trigger === 'immediate' ? 'before dice roll' : card.trigger === 'capture' ? 'on capture' : 'on eliminate'}
                    </div>
                    {blockedByCombat && (
                      <div style={{ fontSize: 8, color: '#8a4020', fontStyle: 'italic' }}>must play before dice roll</div>
                    )}
                  </div>
                  {isImmediate && !blockedByCombat && (
                    <button
                      onClick={() => setActiveCardId(isActive ? null : cardId)}
                      style={{
                        padding: '3px 9px', borderRadius: 4, fontSize: 10,
                        border: `1px solid ${meta.color}`,
                        background: isActive ? meta.color : 'transparent',
                        color: isActive ? '#000' : meta.color,
                        cursor: 'pointer', fontFamily: 'Georgia, serif',
                      }}
                    >
                      {isActive ? 'Cancel' : 'Play'}
                    </button>
                  )}
                  {!isImmediate && (
                    <span style={{ fontSize: 9, color: '#5a4030', fontStyle: 'italic' }}>
                      {card.trigger === 'capture' ? 'on capture' : 'on eliminate'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Hint bar for Resistance event placement */}
      {resistancePlacement && (() => {
        const rp = gameState.players.find(p => p.id === resistancePlacement.playerId)
        return (
          <HintBar color="#d4a020">
            ✊ <strong>Resistance</strong> — {rp?.name ?? 'Player'} has the fewest territories:
            click your territories to place <strong>{resistancePlacement.troopsLeft}</strong> more
            troop{resistancePlacement.troopsLeft !== 1 ? 's' : ''}
          </HintBar>
        )
      })()}

      {/* Hint bar for Join the Cause troop placement */}
      {joinCausePlacement && (() => {
        const jp = gameState.players.find(p => p.id === joinCausePlacement.playerId)
        return (
          <HintBar color="#9040c0">
            🫂 <strong>Join the Cause</strong> — {jp?.name ?? 'Player'} has the largest population:
            click your <strong>cities</strong> to place <strong>{joinCausePlacement.troopsLeft}</strong> more
            troop{joinCausePlacement.troopsLeft !== 1 ? 's' : ''}
          </HintBar>
        )
      })()}

      {/* Hint bars for the two Fortify event placement modes */}
      {fortifyEvent && fortifyEvent.phase !== 'choice' && (() => {
        const fp = gameState.players.find(p => p.id === fortifyEvent.playerId)
        return (
          <HintBar color="#3498DB">
            ⛨ <strong>Fortify</strong> — {fp?.name ?? 'Player'}: {fortifyEvent.phase === 'fortification'
              ? <>click a <strong>city</strong> you control to fortify it <strong>permanently</strong></>
              : <>click a <strong>city</strong> you control to add <strong>{FORTIFY_EVENT_TROOPS} troops</strong>
                {' '}— <strong>{fortifyEvent.citiesLeft}</strong> more to choose</>}
          </HintBar>
        )
      })()}

      {/* Fortify event — the largest-population player chooses a reward */}
      {fortifyEvent?.phase === 'choice' && (() => {
        const fp = gameState.players.find(p => p.id === fortifyEvent.playerId)
        const cityCount = ownedCityIds(fortifyEvent.playerId).length
        const fortsLeft = FORTIFICATION_SUPPLY - fortificationsPlaced(legacyState.stickers)
        const canFortify = fortsLeft > 0
        const troopCities = Math.min(FORTIFY_EVENT_CITIES, cityCount)
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 8000,
            background: 'rgba(2,8,14,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Georgia, serif',
          }}>
            <div style={{
              background: 'linear-gradient(155deg,#08202e 0%,#04121b 100%)',
              border: '2px solid rgba(52,152,219,0.6)', borderRadius: 14,
              padding: '24px 28px', width: 460, maxWidth: '92vw', color: '#E8DCC8',
              boxShadow: '0 0 50px rgba(52,152,219,0.2)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 34 }}>⛨</div>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#7ec8f0', letterSpacing: 1 }}>FORTIFY</div>
                <div style={{ fontSize: 11, color: '#6a94ac', marginTop: 4 }}>
                  <strong style={{ color: '#d0ecff' }}>{fp?.name ?? 'Player'}</strong> has the largest population — choose a reward
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => startFortifyTroops(fortifyEvent.playerId, fortifyEvent.cardId)}
                  style={{
                    padding: '14px 16px', borderRadius: 8, textAlign: 'left',
                    border: '1px solid rgba(52,152,219,0.45)', background: 'rgba(52,152,219,0.10)',
                    cursor: 'pointer', fontFamily: 'Georgia, serif', color: '#e8dcc8',
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 'bold', color: '#7ec8f0', marginBottom: 3 }}>
                    ⚔ Reinforce {troopCities} {troopCities === 1 ? 'City' : 'Cities'}
                  </div>
                  <div style={{ fontSize: 11, color: '#8aa0ac' }}>
                    Add {FORTIFY_EVENT_TROOPS} troops to each of {troopCities} different {troopCities === 1 ? 'city' : 'cities'} you control
                    {troopCities < FORTIFY_EVENT_CITIES ? ' — all you control' : ''}. This card returns in later games.
                  </div>
                </button>
                {/* Refused up front when the supply is gone — this is the one
                    choice the campaign can permanently run out of. */}
                <button
                  onClick={() => canFortify && updateFortifyEvent({ phase: 'fortification', playerId: fortifyEvent.playerId, cardId: fortifyEvent.cardId })}
                  disabled={!canFortify}
                  style={{
                    padding: '14px 16px', borderRadius: 8, textAlign: 'left',
                    border: '1px solid rgba(52,152,219,0.45)',
                    background: canFortify ? 'rgba(52,152,219,0.10)' : 'rgba(80,80,80,0.15)',
                    cursor: canFortify ? 'pointer' : 'not-allowed', opacity: canFortify ? 1 : 0.5,
                    fontFamily: 'Georgia, serif', color: '#e8dcc8',
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 'bold', color: '#7ec8f0', marginBottom: 3 }}>◎ Fortify a City — Permanent</div>
                  <div style={{ fontSize: 11, color: '#8aa0ac' }}>
                    {canFortify
                      ? <>Place a fortification on one city you control, for the rest of the campaign.
                          {' '}<strong style={{ color: '#e0a070' }}>This destroys the event card permanently.</strong>
                          {' '}({fortsLeft} of {FORTIFICATION_SUPPLY} fortifications left.)</>
                      : <>All {FORTIFICATION_SUPPLY} fortifications have been placed this campaign — there are none left.</>}
                  </div>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Control the People — largest-population player chooses a reward */}
      {controlPeopleChoice && (() => {
        const cp = gameState.players.find(p => p.id === controlPeopleChoice)
        const cityCount = ownedCityIds(controlPeopleChoice).length
        const ownsCity = cityCount > 0
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 8000,
            background: 'rgba(6,2,10,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Georgia, serif',
          }}>
            <div style={{
              background: 'linear-gradient(155deg,#1a0c22 0%,#0c0512 100%)',
              border: '2px solid rgba(176,108,208,0.6)', borderRadius: 14,
              padding: '24px 28px', width: 440, maxWidth: '92vw', color: '#E8DCC8',
              boxShadow: '0 0 50px rgba(176,108,208,0.2)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 34 }}>🏛</div>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#c8a0e8', letterSpacing: 1 }}>CONTROL THE PEOPLE</div>
                <div style={{ fontSize: 11, color: '#9a7ab0', marginTop: 4 }}>
                  <strong style={{ color: '#e8d0ff' }}>{cp?.name ?? 'Player'}</strong> has the largest population — choose a reward
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => {
                    if (!ownsCity) { showWeaknessNotice('🏛 You control no city — take the maneuver instead'); return }
                    controlTroopsRef.current = controlPeopleChoice
                    setControlTroopsPlayerId(controlPeopleChoice)
                    setControlPeopleChoice(null)
                  }}
                  disabled={!ownsCity}
                  style={{
                    padding: '14px 16px', borderRadius: 8, textAlign: 'left',
                    border: '1px solid rgba(176,108,208,0.45)', background: ownsCity ? 'rgba(176,108,208,0.10)' : 'rgba(80,80,80,0.15)',
                    cursor: ownsCity ? 'pointer' : 'not-allowed', opacity: ownsCity ? 1 : 0.5,
                    fontFamily: 'Georgia, serif', color: '#e8dcc8',
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 'bold', color: '#c8a0e8', marginBottom: 3 }}>⚔ Raise 5 Troops</div>
                  <div style={{ fontSize: 11, color: '#9a8070' }}>Place 5 troops into any one city you control.{ownsCity ? ` (${cityCount} to choose from.)` : ' (You control no city.)'}</div>
                </button>
                <button
                  onClick={() => {
                    controlManeuverRef.current = { playerId: controlPeopleChoice, srcId: null }
                    setControlManeuver({ playerId: controlPeopleChoice, srcId: null })
                    setControlPeopleChoice(null)
                  }}
                  style={{
                    padding: '14px 16px', borderRadius: 8, textAlign: 'left',
                    border: '1px solid rgba(176,108,208,0.45)', background: 'rgba(176,108,208,0.10)',
                    cursor: 'pointer', fontFamily: 'Georgia, serif', color: '#e8dcc8',
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 'bold', color: '#c8a0e8', marginBottom: 3 }}>⟳ Immediate Maneuver</div>
                  <div style={{ fontSize: 11, color: '#9a8070' }}>Move troops from one territory to a connected territory you control.</div>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Hint bar — Control the People: place 5 troops in a city */}
      {controlTroopsPlayerId && (() => {
        const cp = gameState.players.find(p => p.id === controlTroopsPlayerId)
        return (
          <HintBar color="#b06cd0">
            🏛 <strong>Control the People</strong> — {cp?.name ?? 'Player'}: click a city you control to raise <strong>5 troops</strong>
          </HintBar>
        )
      })()}

      {/* Hint bar — Control the People: immediate maneuver */}
      {controlManeuver && !controlManeuverDstId && (() => {
        const cp = gameState.players.find(p => p.id === controlManeuver.playerId)
        return (
          <HintBar color="#b06cd0">
            ⟳ <strong>Maneuver</strong> — {cp?.name ?? 'Player'}: {controlManeuver.srcId
              ? 'click a connected territory you control to move troops into'
              : 'click a territory you control (2+ troops) to move from'}
          </HintBar>
        )
      })()}

      {/* Maneuver troop-count panel (reuses the fortify panel) */}
      {controlManeuver?.srcId && controlManeuverDstId &&
        gameState.territories[controlManeuver.srcId] && gameState.territories[controlManeuverDstId] && (
        <FortifyPanel
          src={gameState.territories[controlManeuver.srcId]}
          dst={gameState.territories[controlManeuverDstId]}
          onConfirm={handleControlManeuverConfirm}
          onCancel={() => setControlManeuverDstId(null)}
        />
      )}

      {/* Hint bar for Riot removal */}
      {riotRemovalPlayerId && (() => {
        const rp = gameState.players.find(p => p.id === riotRemovalPlayerId)
        return (
          <HintBar color="#e05a30">
            🔥 <strong>Riot</strong> — {rp?.name ?? 'Player'} rolled lowest: click one of your territories (2+ troops) to lose <strong>2 troops</strong>
          </HintBar>
        )
      })()}

      {/* Riot roll results modal */}
      {riotResult && (() => {
        const sorted = [...riotResult.rolls].sort((a, b) => a.roll - b.roll)
        const loser = gameState.players.find(p => p.id === riotResult.loserId)
        const loserCanLose = Object.values(gameState.territories).some(
          t => t.occupyingPlayerId === riotResult.loserId && (t.troops ?? 0) > 1,
        )
        // An AI picks its own casualties. Handing a human the click meant
        // choosing where an opponent bleeds — and on your own turn the board
        // would sit waiting for you to do it.
        const loserIsAI = !!loser?.isAI
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 8000,
            background: 'rgba(6,2,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Georgia, serif',
          }}>
            <div style={{
              background: 'linear-gradient(155deg,#2a1206 0%,#140802 100%)',
              border: '2px solid rgba(224,90,48,0.6)', borderRadius: 14,
              padding: '24px 28px', width: 420, maxWidth: '92vw', color: '#E8DCC8',
              boxShadow: '0 0 50px rgba(224,90,48,0.2)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 34 }}>🔥</div>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#e05a30', letterSpacing: 1 }}>RIOT</div>
                <div style={{ fontSize: 11, color: '#a07050', marginTop: 4 }}>Lowest roll loses 2 troops</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {sorted.map(r => {
                  const isLoser = r.playerId === riotResult.loserId
                  return (
                    <div key={r.playerId} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 7,
                      background: isLoser ? 'rgba(224,90,48,0.14)' : 'rgba(255,255,255,0.03)',
                      border: isLoser ? '1.5px solid rgba(224,90,48,0.55)' : '1px solid rgba(200,148,10,0.12)',
                    }}>
                      <span style={{ fontSize: 13, color: isLoser ? '#ffb090' : '#c0a870', fontWeight: isLoser ? 'bold' : 'normal' }}>
                        {r.name}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 'bold', color: isLoser ? '#e05a30' : '#8a7060' }}>
                        🎲 {r.roll}{isLoser ? '  ← loses 2' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              <button
                onClick={() => {
                  if (loserIsAI) {
                    resolveAiRiot(riotResult.loserId)
                    return
                  }
                  if (loserCanLose) {
                    riotRemovalRef.current = riotResult.loserId
                    setRiotRemovalPlayerId(riotResult.loserId)
                  } else {
                    showWeaknessNotice(`🔥 Riot — ${loser?.name ?? 'the loser'} has no territory above 1 troop; no loss`)
                  }
                  setRiotResult(null)
                }}
                style={{
                  width: '100%', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
                  border: '2px solid rgba(224,90,48,0.7)', background: 'rgba(224,90,48,0.16)',
                  color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
                }}
              >
                {!loserCanLose
                  ? 'Acknowledge'
                  : loserIsAI
                    ? `🔥 ${loser?.name ?? 'Loser'} takes the losses →`
                    : `🔥 ${loser?.name ?? 'Loser'} removes 2 troops →`}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Hint bar for card placement mode */}
      {activeCardId && (() => {
        const card = getScarCard(activeCardId)
        const meta = card ? SCAR_META.find(m => m.type === card.type) : null
        return card && meta ? (
          <HintBar color={meta.color}>
            {meta.icon} <strong>{card.name}</strong> — click any territory to place this scar &nbsp;
            <Dim>· press Play again to cancel</Dim>
          </HintBar>
        ) : null
      })()}

      {/* Scar Modal — shown after capturing, or when playing an immediate/eliminate card */}
      {scarTarget && (
        <ScarModal
          territory={scarTarget}
          gameNumber={gameState.gameNumber}
          card={triggeredCard ?? (activeCardId ? getScarCard(activeCardId) : undefined)}
          onPlace={handlePlaceScar}
          onSkip={() => { setScarTarget(null); setTriggeredCard(null); setActiveCardId(null); activeCardIdRef.current = null }}
        />
      )}

      {/* City Modal */}
      {cityTarget && currentPlayer && (
        <CityModal
          territory={cityTarget}
          gameNumber={gameState.gameNumber}
          currentFactionId={currentPlayer.factionId}
          onAction={(action, cityId, cityName) => {
            const t = cityTarget
            // The Fallout Zone is destroyed ground — no city or HQ may be built there
            if ((action === 'place-city' || action === 'place-hq') && t.id === legacyState.falloutZoneTerritoryId) {
              showWeaknessNotice('☢ You cannot build on the Fallout Zone')
              setCityTarget(null)
              return
            }
            // The World Capital IS the city on its territory — nothing is built under it
            if (action === 'place-city' && t.id === legacyState.worldCapitalTerritoryId) {
              showWeaknessNotice('⌃ The World Capital already stands here')
              setCityTarget(null)
              return
            }
            if (action === 'place-city' && cityName) {
              playCity()
              const sticker: import('@/types/legacy').Sticker = { id: `city-${Date.now()}-${currentPlayer.id}`, name: cityName, targetId: t.id, placement: 'territory', description: 'city:minor', placedByPlayerId: currentPlayer.id, appliedInGame: gameState.gameNumber }
              const newLegacy = { ...legacyState, stickers: [...legacyState.stickers, sticker] }
              setLegacyState(newLegacy)
              saveLegacyState(newLegacy).catch(() => {})
            } else if (action === 'destroy-city' && cityId) {
              const newDestroyed = [...legacyState.destroyedCities, { cityId, destroyedInGame: gameState.gameNumber, destroyedByPlayerId: currentPlayer.id }]
              const newLegacy = { ...legacyState, destroyedCities: newDestroyed }
              setLegacyState(newLegacy)
              saveLegacyState(newLegacy).catch(() => {})
            } else if (action === 'place-hq') {
              const sticker: import('@/types/legacy').Sticker = { id: `hq-${Date.now()}`, name: `${currentPlayer.factionId} HQ`, targetId: t.id, placement: 'territory', description: `HQ:${currentPlayer.factionId}`, appliedInGame: gameState.gameNumber }
              const newLegacy = { ...legacyState, stickers: [...legacyState.stickers, sticker] }
              setLegacyState(newLegacy)
              saveLegacyState(newLegacy).catch(() => {})
            }
            setCityTarget(null)
          }}
          onClose={() => setCityTarget(null)}
        />
      )}

      {/* Balkania Imperial Expansion — immediate bonus card pick on the 4th
          expansion (conquest or uncontested advance). No phase gate: the pick
          appears the moment it's earned, before the fortify phase. */}
      {balkExpansionPending && (() => {
        const balkPlayer = gameState.players.find(p => p.id === balkExpansionPending)
        // Purist weakness power: cannot hold more than 2 coin cards
        const balkIsPurist = (legacyState.alienWeaknessPowers ?? {})[balkPlayer?.factionId ?? ''] === 'wp-purist'
        const balkCoinCount = (cardState.playerHands[balkExpansionPending] ?? []).filter(id => !!getCoinCard(id)).length
        return (
          <CardDrawModal
            playerId={balkExpansionPending}
            sideboard={cardState.sideboard ?? []}
            resourceDeck={cardState.resourceDeck ?? cardState.coinDeck ?? []}
            territories={gameState.territories}
            cardResources={legacyState.cardResources}
            homelandContinentId={playerHomeland(balkExpansionPending)}
            coinBlocked={balkIsPurist && balkCoinCount >= 2}
            title="⚑ Imperial Expansion"
            subtitle={`${balkPlayer?.name ?? 'Balkania'} expanded into their 4th territory — claim a bonus card. Face-up cards you control must be taken first; the resource pile is only available if you control none.`}
            onSelect={handleBalkExpansionSelect}
            onSkip={() => setBalkExpansionPending(null)}
          />
        )
      })()}

      {/* Sideboard card draw modal — deferred to fortify phase so player draws at end of turn */}
      {pendingCardDraws.length > 0 && (gameState.phase === 'fortify' || eventDrawActive) && (() => {
        const drawPlayerId = pendingCardDraws[0]
        // Purist weakness power: cannot hold more than 2 coin cards
        const drawFaction = gameState.players.find(p => p.id === drawPlayerId)?.factionId ?? ''
        const drawIsPurist = (legacyState.alienWeaknessPowers ?? {})[drawFaction] === 'wp-purist'
        const coinCount = (cardState.playerHands[drawPlayerId] ?? []).filter(id => !!getCoinCard(id)).length
        // Recon missile power: take any face-up territory card instead of the coin
        const drawMissiles = (legacyState.missiles ?? {})[drawPlayerId] ?? 0
        const reconAvailable = factionHasMissilePower(drawFaction, 'mp-recon') &&
          drawMissiles > 0 && !usedMissilePowersThisTurn.has('mp-recon')
        return (
          <CardDrawModal
            playerId={drawPlayerId}
            sideboard={cardState.sideboard ?? []}
            resourceDeck={cardState.resourceDeck ?? cardState.coinDeck ?? []}
            territories={gameState.territories}
            cardResources={legacyState.cardResources}
            homelandContinentId={playerHomeland(drawPlayerId)}
            coinBlocked={drawIsPurist && coinCount >= 2}
            reconAvailable={reconAvailable}
            reconActive={reconDrawActive}
            onActivateRecon={() => {
              if (activateMissilePower(drawPlayerId, 'mp-recon', 'Recon')) setReconDrawActive(true)
            }}
            onSelect={(cardId, isCoin) => {
              handleCardDrawSelect(cardId, isCoin)
              setReconDrawActive(false)
            }}
            onSkip={() => {
              setPendingCardDraws(prev => prev.slice(1))
              setReconDrawActive(false)
            }}
          />
        )
      })()}

      {/* Join the War modal */}
      {joinTheWarPlayerId && (() => {
        const p = gameState.players.find(pl => pl.id === joinTheWarPlayerId)
        if (!p) return null
        return (
          <JoinTheWarModal
            player={p}
            territories={gameState.territories}
            hqTerritoryIds={Object.values(gameState.activeHqs ?? {})}
            falloutZoneTerritoryId={legacyState.falloutZoneTerritoryId ?? null}
            onJoin={handleJoinWar}
            onForfeit={handleForfeitWar}
          />
        )
      })()}

      {/* Lead faction — choose the starting face-up mission */}
      {leadMissionPick && (() => {
        const p = gameState.players.find(pl => pl.id === leadMissionPick.playerId)
        if (!p) return null
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1400,
            background: 'rgba(5,2,0,0.86)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Georgia, serif', padding: 16, overflowY: 'auto',
          }}>
            <div style={{
              background: 'linear-gradient(155deg, #1A0E02 0%, #0E0700 100%)',
              border: '2px solid rgba(231,76,60,0.65)', borderRadius: 13,
              width: 560, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
              padding: '22px 26px', color: '#E8DCC8',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: '#e74c3c', textTransform: 'uppercase' }}>
                  ⌃ Lead Faction
                </div>
                <div style={{ fontSize: 19, fontWeight: 'bold', marginTop: 5 }}>
                  {p.name} chooses the starting mission
                </div>
                <div style={{ fontSize: 11, color: '#8a7050', marginTop: 5, lineHeight: 1.5 }}>
                  {p.factionId.replace(/-/g, ' ')} leads the campaign in wins — pick which
                  mission starts face-up. The rest stay in the deck.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leadMissionPick.options.map(id => {
                  const m = CARD_LOOKUP.get(id) as import('@/types/card').MissionCard | undefined
                  if (!m) return null
                  const priv = isPrivateMission(id)
                  const accent = priv ? '160,110,220' : '220,80,80'
                  return (
                    <button key={id} onClick={() => handleLeadMissionPick(id)} style={{
                      textAlign: 'left', padding: '11px 14px', borderRadius: 8, cursor: 'pointer',
                      background: `rgba(${accent},0.08)`, border: `1.5px solid rgba(${accent},0.45)`,
                      color: '#E8DCC8', fontFamily: 'Georgia, serif',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 'bold', color: `rgb(${accent})`, marginBottom: 3 }}>
                        {priv ? '✦ ' : ''}{m.name} · {m.stars === 2 ? '★★' : '★'}
                        {priv && <span style={{ fontSize: 9, marginLeft: 6 }}>PRIVATE — STAR POWER</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#9a8060', lineHeight: 1.45 }}>{m.description}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Aliens star power banner */}
      {alienStarBanner && (
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 320, pointerEvents: 'all',
          background: 'rgba(0,20,15,0.96)',
          border: '2px solid rgba(0,200,160,0.75)',
          borderRadius: 10,
          padding: '16px 28px',
          fontFamily: 'Georgia, serif',
          boxShadow: '0 0 32px rgba(0,200,160,0.35)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#00ffcc', fontWeight: 'bold', marginBottom: 6 }}>
            {alienStarBanner}
          </div>
          <div style={{ fontSize: 11, color: '#7a9a8a', marginBottom: 10 }}>
            ★★ added to their campaign red star total
          </div>
          <button
            onClick={() => setAlienStarBanner(null)}
            style={{
              padding: '6px 22px', borderRadius: 6, fontSize: 12,
              border: '1.5px solid rgba(0,200,160,0.55)', background: 'rgba(0,200,160,0.12)',
              color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
            }}
          >
            Acknowledge
          </button>
        </div>
      )}

      {/* Weakness power enforcement banner (auto-clears) */}
      {weaknessNotice && (
        <div style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
          zIndex: 320, pointerEvents: 'none',
          background: 'rgba(25,18,0,0.95)',
          border: '1.5px solid rgba(240,192,0,0.65)',
          borderRadius: 8,
          padding: '9px 20px',
          fontFamily: 'Georgia, serif',
          fontSize: 13, color: '#f0c000',
          boxShadow: '0 0 24px rgba(240,192,0,0.25)',
        }}>
          {weaknessNotice}
        </div>
      )}

      {/* Coin deck depleted — red star notification banner */}
      {coinDeckStarWinner && (
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, pointerEvents: 'all',
          background: 'rgba(20,5,5,0.96)',
          border: '2px solid #c0392b',
          borderRadius: 10,
          padding: '16px 28px',
          boxShadow: '0 0 32px rgba(192,57,43,0.45)',
          fontFamily: 'Georgia, serif',
          textAlign: 'center',
          minWidth: 300,
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>{coinDeckStarWinner.kind === 'tie' ? '⚖' : '★'}</div>
          <div style={{ fontSize: 15, fontWeight: 'bold', color: '#E8DCC8', marginBottom: 4 }}>
            {coinDeckStarWinner.kind === 'tie' ? 'No Red Star — Territories Tied' : 'Red Star Awarded!'}
          </div>
          {coinDeckStarWinner.kind === 'tie' ? (
            <div style={{ fontSize: 12, color: 'rgba(220,200,160,0.80)', lineHeight: 1.5 }}>
              <strong style={{ color: '#e8c07a' }}>{coinDeckStarWinner.names.join(' and ')}</strong> are tied
              on {coinDeckStarWinner.count} territories as the coin deck runs out.
              <div style={{ marginTop: 5, color: 'rgba(220,200,160,0.62)' }}>
                The star goes to a clear leader only — with the lead shared, nobody takes it.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'rgba(220,200,160,0.80)', lineHeight: 1.5 }}>
              <strong style={{ color: '#e8c07a' }}>{coinDeckStarWinner.name}</strong> controls the most territories
              ({coinDeckStarWinner.count}) as the coin deck runs out.
            </div>
          )}
          <button
            onClick={() => setCoinDeckStarWinner(null)}
            style={{
              marginTop: 14, padding: '6px 22px', borderRadius: 6,
              background: 'rgba(192,57,43,0.25)', border: '1.5px solid rgba(192,57,43,0.6)',
              color: '#e8a090', fontSize: 12, fontFamily: 'Georgia, serif', cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      )}

      {/* Win ceremony — blocked until comeback power choice is resolved */}
      {/* Win ceremony waits until pending choices resolve — a missile power
          earned on the winning star is picked BEFORE the game ends */}
      {showWinScreen && winScreenArmed && winnerPlayerId && !comebackEliminatedPlayer && !missilePowerPendingPlayerId && (() => {
        const winPlayer = gameState.players.find(p => p.id === winnerPlayerId)
        if (!winPlayer) return null
        return (
          <WinScreen
            winner={winPlayer}
            winCondition={winCondition}
            gameNumber={gameState.gameNumber}
            players={gameState.players}
            territories={gameState.territories}
            legacyState={legacyState}
            legacyEvents={legacyEvents}
            unlockOptions={unlockOptions}
            onComplete={handleWinScreenComplete}
          />
        )
      })()}

      {/* Card hand overlay */}
      {showCardHand && currentPlayer && (
        <CardHand
          player={currentPlayer}
          gameState={gameState}
          cardResources={legacyState.cardResources ?? {}}
          canTradeIn={gameState.phase === 'reinforce'}
          onTradeIn={handleTradeIn}
          onBuyStar={handleBuyStar}
          onClose={() => setShowCardHand(false)}
        />
      )}

      {/* Event card display */}
      {showEventCard && currentEventCardId && (() => {
        const card = getEventCard(currentEventCardId)
        const effect = EVENT_EFFECTS[currentEventCardId]
        return card && effect ? (
          <EventCardDisplay
            card={card}
            effect={effect}
            roundNumber={gameState.turnNumber}
            onDismiss={() => resolveEventCardDismiss(currentEventCardId)}
          />
        ) : null
      })()}

      {/* Die Humans — Alien player picks a minor city to ruin */}
      {dieHumansPendingCardId && (() => {
        const alienPlayer = gameState.players.find(p => p.factionId === 'aliens')
        return (
          <DieHumansModal
            legacyState={legacyState}
            territories={gameState.territories}
            alienPlayerName={alienPlayer?.name ?? 'The Aliens'}
            onRuin={handleDieHumansRuin}
            onDecline={handleDieHumansDecline}
          />
        )
      })()}

      {/* Beam Down — Aliens drop 5 troops into an unoccupied city */}
      {beamDownActive && (() => {
        const alienPlayer = gameState.players.find(p => p.factionId === 'aliens')
        return (
          <BeamDownModal
            legacyState={legacyState}
            territories={gameState.territories}
            alienPlayerName={alienPlayer?.name ?? 'The Aliens'}
            onPlace={handleBeamDown}
            onSkip={() => setBeamDownActive(false)}
          />
        )
      })()}

      {/* Nuclear Milestone — 3 missiles on one combat roll (shows once combat closes) */}
      {pendingNuclear && !showCombat && (() => {
        const bringer = gameState.players.find(p => p.id === pendingNuclear.bringerPlayerId)
        const FACTION_NAMES_NUKE: Record<string, string> = {
          'enclave-of-the-bear': 'Enclave of the Bear',
          'imperial-balkania':   'Imperial Balkania',
          'khan-industries':     'Khan Industries',
          'saharan-republic':    'Saharan Republic',
          'die-mechaniker':      'Die Mechaniker',
          'aliens':              'Aliens',
          'mutants':             'Mutants',
        }
        return (
          <NuclearMilestoneModal
            bringerPlayerName={bringer?.name ?? 'Unknown'}
            bringerFactionName={FACTION_NAMES_NUKE[pendingNuclear.bringerFactionId] ?? pendingNuclear.bringerFactionId}
            falloutTerritoryName={gameState.territories[pendingNuclear.falloutTerritoryId]?.name ?? pendingNuclear.falloutTerritoryId}
            onComplete={handleNuclearMilestoneComplete}
          />
        )
      })()}

      {/* Missile power selection — earned on in-game red stars */}
      {missilePowerPendingPlayerId && (() => {
        const p = gameState.players.find(pl => pl.id === missilePowerPendingPlayerId)
        if (!p) return null
        return (
          <MissilePowerModal
            playerName={p.name}
            factionName={p.factionId}
            claimedPowerIds={new Set(legacyState.claimedMissilePowers ?? [])}
            onSelect={handleMissilePowerSelect}
          />
        )
      })()}

      {/* The Mutants Evolve — scratch-n-sniff power reveal */}
      {mutantsEvolvePendingCardId && (() => {
        const mutantPlayer = gameState.players.find(p => p.factionId === 'mutants')
        return (
          <MutantsEvolveModal
            mutantPlayerName={mutantPlayer?.name ?? 'The Mutants'}
            revealedPowerIds={new Set(legacyState.mutantEvolvePowers ?? [])}
            onReveal={handleMutantsEvolveReveal}
            onSkip={handleMutantsEvolveSkip}
          />
        )
      })()}

      {/* Mass Hypnosis — pick a traded territory to protect */}
      {hypnosisChoiceIds && (
        <MassHypnosisModal
          territoryIds={hypnosisChoiceIds}
          territories={gameState.territories}
          onPick={handleMassHypnosisPick}
          onSkip={() => setHypnosisChoiceIds(null)}
        />
      )}

      {/* Mindshackle — trade a collected coin card for a random victim card */}
      {mindshackleOffer && (() => {
        const victims = [...conqueredFromPlayerIdsRef.current]
          .filter(vid => vid !== mindshackleOffer.playerId)
          .map(vid => {
            const p = gameState.players.find(pl => pl.id === vid)
            const count = (cardState.playerHands[vid] ?? []).length
            return p && count > 0 ? { id: vid, name: p.name, cardCount: count } : null
          })
          .filter((v): v is { id: string; name: string; cardCount: number } => !!v)
        if (victims.length === 0) { return null }
        return (
          <MindshackleModal
            victims={victims}
            onPick={handleMindshackleTrade}
            onSkip={() => setMindshackleOffer(null)}
          />
        )
      })()}

      {/* Join the Cause interactive choice */}
      {showJoinTheCause && (() => {
        // Missions are one shared face-up card now. The "New Mission" reward
        // swaps that shared mission for any card still in the deck.
        const currentMissionId = cardState.currentMissionId ?? null
        const availableMissionIds = cardState.missionDeck
        const leaderId = largestPopulationPlayerId()
        if (!leaderId) return null
        return (
          <JoinTheCauseModal
            players={gameState.players}
            territories={gameState.territories}
            availableMissionIds={availableMissionIds}
            currentMissionId={currentMissionId}
            worldCapitalTerritoryId={legacyState.worldCapitalTerritoryId}
            leaderId={leaderId}
            reinforceTargets={ownedCityIds(leaderId).length}
            onDecline={() => {
              const name = gameState.players.find(p => p.id === leaderId)?.name ?? 'Player'
              setShowJoinTheCause(false)
              logHistory(`🫂 Join the Cause — ${name} had the largest population but could take neither reward`)
            }}
            onChooseTroops={(playerId) => {
              setShowJoinTheCause(false)
              startJoinCauseTroops(playerId)
            }}
            onChooseMission={(_playerId, missionId) => {
              // Put the current shared mission back in the deck, flip the chosen one face up
              const oldMissionId = cardState.currentMissionId ?? null
              const updated: ActiveGameCards = {
                ...cardState,
                currentMissionId: missionId,
                missionDeck: cardState.missionDeck
                  .filter(id => id !== missionId)
                  .concat(oldMissionId ? [oldMissionId] : []),
              }
              setCardState(updated)
              setLegacyState(prev => {
                const newLegacy: LegacyState = { ...prev, activeGameCards: updated }
                legacyStateRef.current = newLegacy
                saveLegacyState(newLegacy).catch(() => {})
                return newLegacy
              })
              const md = CARD_LOOKUP.get(missionId) as import('@/types/card').MissionCard | undefined
              showWeaknessNotice(`📜 New shared mission revealed: ${md?.description ?? missionId}`)
              const leaderName = gameState.players.find(p => p.id === leaderId)?.name ?? 'Player'
              logHistory(`🫂 Join the Cause — ${leaderName} had the largest population and swapped the shared mission for: ${md?.description ?? missionId}`)
              setShowJoinTheCause(false)
            }}
          />
        )
      })()}

      {/* World Capital special mission modal */}
      {showWorldCapitalModal && (() => {
        const completingPlayer = gameState.players.find(p => p.id === worldCapitalCompletingId)
        if (!completingPlayer) return null
        return (
          <WorldCapitalModal
            completingPlayer={completingPlayer}
            territories={gameState.territories}
            candidateTerritoryIds={worldCapitalCandidates}
            onPlace={(territoryId) => placeWorldCapital(territoryId, completingPlayer)}
          />
        )
      })()}

      {/* Sea Line Placement — Island Empire mission reward */}
      {showSeaLinePlacement && (
        <SeaLinePlacementModal
          playerName={gameState.players.find(p => p.id === seaLineMissionPlayerId)?.name ?? 'The victor'}
          territories={gameState.territories}
          existingSeaLines={legacyState.customSeaLines ?? []}
          onPlace={handlePlaceSeaLine}
          onSkip={() => { setShowSeaLinePlacement(false); setSeaLineMissionPlayerId(null) }}
        />
      )}

      </div>
    </div>
  )
}

// ─── Small inline helpers ─────────────────────────────────────────────────────

function HintBar({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      // Solid black plate rather than a 10%-alpha tint of the accent colour —
      // these sit over the map, and the tint left the text competing with
      // whatever terrain happened to be underneath. The border keeps the
      // per-hint colour coding.
      background: 'rgba(0,0,0,0.88)', border: `1px solid ${color}99`,
      borderRadius: 6, padding: '7px 20px',
      fontFamily: 'Georgia, serif', fontSize: 12, color,
      pointerEvents: 'none', letterSpacing: 0.3,
      boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
      whiteSpace: 'nowrap', zIndex: 10,
    }}>
      {children}
    </div>
  )
}

function Dim({ children }: { children: React.ReactNode }) {
  return <span style={{ opacity: 0.50, fontSize: 10 }}>{children}</span>
}
