import React, { useEffect, useRef, useState } from 'react'
import * as PIXI from 'pixi.js'
import type { Territory, ScarType } from '@/types/territory'
import type { GameState } from '@/types/game'
import { initialTurnState } from '@/types/game'
import type { LegacyState } from '@/types/legacy'
import type { Player } from '@/types/player'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT, buildTerritory } from '@/data/territoryData'
import { FACTION_COLORS, NEUTRAL_COLOR } from '@/data/mockGameState'
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
import { calcReinforcements, connectedOwnedIds, injectAlienIslandTerritory, applyCustomSeaLines, ALIEN_ISLAND_TERRITORY_ID } from '@/lib/gameLogic'
import {
  defaultLegacyState, saveLegacyState, awardRedStars,
  applyLegacyToTerritories, richLandBonus, cityBonus, pickUnlocks, SCAR_META,
  type LegacyEvent, type UnlockOption,
} from '@/lib/legacyApi'
import { getScarCard, type ScarCard, MERCENARY_CARD_IDS, BIOHAZARD_CARD_IDS } from '@/data/scarCards'
import CardHand from './CardHand'
import JoinTheWarModal from './JoinTheWarModal'
import CardDrawModal from './CardDrawModal'
import EventCardDisplay from './EventCardDisplay'
import ComebackPowerModal, { COMEBACK_POWERS } from './ComebackPowerModal'
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
  getEventCard, checkMissionComplete, getTerritoryCard, getCoinCard, COIN_CARDS,
  TERRITORY_CARDS, EVENT_EFFECTS, CARD_LOOKUP, type ActiveGameCards,
  CARD_TRADE_IN_VALUES,
} from '@/data/cards'
import { checkMission, computeHomelands, type TurnConquestState } from '@/lib/missionLogic'
import { isSeaLine, registerCustomSeaLines } from '@/data/seaLines'
import SeaLinePlacementModal from './SeaLinePlacementModal'
import { AI_DIFFICULTY_LABEL, AI_DIFFICULTY_BADGE } from '@/types/ai'
import { aiReinforcePlacements, aiAttackPlan, aiFortifyMove } from '@/lib/ai'
import { playVictory, playElimination, playCoin, playCity, playMilestone, playTroop, startAmbient, stopAmbient } from '@/lib/sounds'
import ConfettiBurst from './ConfettiBurst'
import TurnBanner, { type TurnBannerInfo } from './TurnBanner'
import {
  gameReducer, checkReinforcementPlacement, createMathRng, resolveCombat,
  canStartAttack, canStartFortify, computeTurnAdvance, applyEndOfTurnScarEffects,
  type Action, type Effect,
} from '@/lib/gameReducer'

// ─── Colours ─────────────────────────────────────────────────────────────────

const GOLD_ACCENT = 0xC8940A

// ─── Polygon helpers ──────────────────────────────────────────────────────────

function parsePolygon(shape: string): number[][] {
  return JSON.parse(shape) as number[][]
}

// ─── Scar & city indicators ───────────────────────────────────────────────────

function drawCrown(g: PIXI.Graphics, cx: number, cy: number, fill: number, alpha: number, outline: number) {
  // Simple 3-point crown shape
  g.lineStyle(0.8, outline, alpha * 0.7)
  g.beginFill(fill, alpha)
  g.moveTo(cx - 7, cy)
  g.lineTo(cx - 7, cy - 8)
  g.lineTo(cx - 3, cy - 4)
  g.lineTo(cx,     cy - 9)
  g.lineTo(cx + 3, cy - 4)
  g.lineTo(cx + 7, cy - 8)
  g.lineTo(cx + 7, cy)
  g.closePath()
  g.endFill()
  // Jewel dots on the three crown points
  g.lineStyle(0)
  g.beginFill(outline, alpha)
  g.drawCircle(cx - 7, cy - 8, 1.5)
  g.drawCircle(cx,     cy - 9, 1.5)
  g.drawCircle(cx + 7, cy - 8, 1.5)
  g.endFill()
}

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
      case 'rich-land':
        g.beginFill(0xFFD700, 0.9)
        g.moveTo(sx, sy-4.5); g.lineTo(sx+3.5, sy); g.lineTo(sx, sy+4.5); g.lineTo(sx-3.5, sy); g.closePath()
        g.endFill(); break
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
        userId: null as null,
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
  // Fortify event: the drawer places 2 troops on ONE territory they control
  const [fortifyEventPlayerId, setFortifyEventPlayerId] = useState<string | null>(null)
  const fortifyEventRef = useRef<string | null>(null)
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
  const [coinDeckStarWinner, setCoinDeckStarWinner] = useState<{ name: string; count: number } | null>(null)

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
    }
    if (ls.activeGameCards && ls.activeGameCards.gameNumber === ls.currentGameNumber) {
      let cards = ls.activeGameCards
      // Migrate older saves that lack sideboard/resourceDeck
      if (!cards.sideboard || !cards.resourceDeck) {
        const fresh = buildInitialGameCards(ls.currentGameNumber, legacyOpts)
        cards = {
          ...cards,
          sideboard: cards.sideboard ?? fresh.sideboard,
          resourceDeck: cards.resourceDeck ?? cards.coinDeck ?? fresh.resourceDeck,
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
  // Pending card draws: queue of playerIds waiting to draw from sideboard
  const [pendingCardDraws, setPendingCardDraws] = useState<string[]>([])
  // Join the War: playerId of eliminated player whose turn it is to choose
  const [joinTheWarPlayerId, setJoinTheWarPlayerId] = useState<string | null>(null)
  // Round-long active effects (ceasefire, ammo-shortage, nuclear-fallout-round, forced-march)
  const [activeEffects, setActiveEffects] = useState<Set<string>>(new Set())
  const activeEffectsRef = useRef<Set<string>>(new Set())
  const [fortifyMovesLeft, setFortifyMovesLeft] = useState(1)
  // Comeback power modal
  const [comebackEliminatedPlayer, setComebackEliminatedPlayer] = useState<Player | null>(null)
  const [isFirstElimination, setIsFirstElimination] = useState(false)
  // First Blood milestone screen — shown before the comeback power choice
  const [firstElimInfo, setFirstElimInfo] = useState<{ eliminatedName: string; factionId: string; conquerorName: string } | null>(null)
  // Mobile HQ: one move per turn
  const [mobileHqUsed, setMobileHqUsed] = useState(false)
  const [mobileHqSrcId, setMobileHqSrcId] = useState<string | null>(null)
  // Expand comeback power: target territory for troop placement during reinforce
  const [expandTargetId, setExpandTargetId] = useState<string | null>(null)
  const expandTargetRef = useRef<string | null>(null)
  // Balkania 4th-capture bonus: show card pick modal immediately during attack phase
  const [balkExpansionPending, setBalkExpansionPending] = useState<string | null>(null)
  // Special mission completion modals
  const [showWorldCapitalModal,      setShowWorldCapitalModal]      = useState(false)
  const [worldCapitalCompletingId,   setWorldCapitalCompletingId]   = useState<string | null>(null)
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
    const cpAbility = cp ? (initialLegacy?.chosenFactionAbilities ?? {})[cp.factionId] ?? null : null
    const cpRoundUp = cpAbility === 'balk-round-up'
    const cpPrimitive = cp ? (initialLegacy?.alienWeaknessPowers ?? {})[cp.factionId] === 'wp-primitive' : false
    const cpAlienBonus = cp?.factionId === 'aliens'
      ? (initialState.territories[ALIEN_ISLAND_TERRITORY_ID]?.occupyingPlayerId === cp.id ? 2 : 0)
        + (initialLegacy?.ruinTerritoryIds ?? []).filter(tid => initialState.territories[tid]?.occupyingPlayerId === cp.id).length
      : 0
    return calcReinforcements(cp?.id ?? '', initialState.territories, cpRoundUp, initialLegacy?.namedContinents ?? {}, initialLegacy?.worldCapitalTerritoryId ?? null, cpPrimitive, initialLegacy?.continentBonusModifiers ?? [])
      + richLandBonus(cp?.id ?? '', initialState.territories)
      + cpAlienBonus
  })
  const [placementHistory, setPlacementHistory] = useState<string[]>([])
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

        // ── FORTIFY EVENT: place 2 troops on ONE owned territory ─────────────
        const fortifyEvId = fortifyEventRef.current
        if (fortifyEvId) {
          if (t.occupyingPlayerId !== fortifyEvId) {
            const fp = state.players.find(p => p.id === fortifyEvId)
            showWeaknessNotice(`⛨ Fortify — ${fp?.name ?? 'the player'} must choose a territory they control`)
            return
          }
          setGameState(prev => ({
            ...prev,
            territories: {
              ...prev.territories,
              [def.id]: { ...prev.territories[def.id], troops: prev.territories[def.id].troops + 2 },
            },
          }))
          const fp = state.players.find(p => p.id === fortifyEvId)
          showWeaknessNotice(`⛨ Fortify — ${fp?.name ?? 'Player'} reinforced ${t.name} with 2 troops`)
          fortifyEventRef.current = null
          setFortifyEventPlayerId(null)
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
          const hasCity = (t.cities ?? []).some(c => !c.isDestroyed && !c.headquartersFactionId)
          if (!hasCity) {
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
            const saharaFreeMove = currentAbility === 'sahara-free-fortify'
            const saharaShortSighted = factionWeaknessOf(
              state.players.find(p => p.id === currentPlayerId)?.factionId ?? '',
            ) === 'wp-short-sighted'
            const srcId = fortifySrcRef.current
            if (srcId) {
              const src = state.territories[srcId]
              const isReachable = saharaShortSighted
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

          // Expand power: click unoccupied unmarked territory to designate as expand target
          const isUnoccupied = !t.occupyingPlayerId
          const isUnmarked = !t.scars?.length && !t.cities?.length
          if (!isOwn && isUnoccupied && isUnmarked && hasComebackExpand && troopsRef.current > 0) {
            if (expandTargetRef.current === def.id) {
              // Deselect expand target
              expandTargetRef.current = null; setExpandTargetId(null)
            } else {
              expandTargetRef.current = def.id; setExpandTargetId(def.id)
            }
            return
          }
          // Place troop on expand target
          if (def.id === expandTargetRef.current && troopsRef.current > 0) {
            dispatch({ type: 'PLACE_REINFORCEMENT', playerId: currentPId!, territoryId: def.id })
            setTroopsToPlace(prev => prev - 1)
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
              const allOwned = new Set(
                Object.values(state.territories).filter(tt => tt.occupyingPlayerId === currentPlayerId).map(tt => tt.id),
              )
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
            const src = state.territories[srcId]
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
      const shuffled = [...missing].sort(() => Math.random() - 0.5)
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
  // Uses victoryLog winner names (player-stable) rather than factionId (changes per game).
  useEffect(() => {
    if (!initialLegacy || initialLegacy.currentGameNumber < 2) return
    const signedPlayerNames = new Set((initialLegacy.victoryLog ?? []).map(v => v.winnerName))
    const bonusPlayerIds = playerSetups
      .filter(s => !signedPlayerNames.has(s.name))
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
    setCardState(prev => {
      if (prev.currentMissionId) return prev
      // Older saves dealt missions secretly per player — reclaim those into
      // the shared deck (skipping destroyed ones) before flipping one face up
      const destroyed = new Set(legacyStateRef.current.destroyedMissionIds ?? [])
      const deck = [...new Set([
        ...(prev.missionDeck ?? []),
        ...Object.values(prev.playerMissions ?? {}),
      ])].filter(id => !destroyed.has(id))
      if (deck.length === 0) return prev
      const first = deck.shift() ?? null
      const next: ActiveGameCards = { ...prev, missionDeck: deck, currentMissionId: first, playerMissions: {} }
      const newLegacy = { ...legacyStateRef.current, activeGameCards: next }
      setLegacyState(newLegacy)
      saveLegacyState(newLegacy).catch(() => {})
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  function aiPickLegalJoinTerritory(playerId: string): string | null {
    const st = gameStateRef.current
    const hqIds = new Set(Object.values(st.activeHqs ?? {}))
    const hqAdj = new Set<string>()
    for (const hqId of hqIds) TERRITORY_DEFINITIONS.find(d => d.id === hqId)?.adjacentIds.forEach(a => hqAdj.add(a))
    const fzId = legacyStateRef.current?.falloutZoneTerritoryId
    const legal = Object.values(st.territories).filter(t =>
      !t.occupyingPlayerId &&
      !(t.cities ?? []).some(c => !c.isDestroyed) &&
      !hqIds.has(t.id) && !hqAdj.has(t.id) && t.id !== fzId,
    )
    void playerId
    return legal.length > 0 ? legal[Math.floor(Math.random() * legal.length)].id : null
  }

  useEffect(() => {
    const cp = gameState.players[gameState.currentPlayerIndex]
    if (!cp?.isAI || cp.isEliminated || gameState.phase === 'game-over' || showWinScreen) return
    if (aiBusyRef.current) return

    // Pause for any HUMAN-owned choice modal (the AI can't act through it).
    const isHuman = (pid: string | null | undefined) => {
      if (!pid) return false
      const p = gameState.players.find(pl => pl.id === pid)
      return !!p && !p.isAI
    }
    if (comebackEliminatedPlayer && !comebackEliminatedPlayer.isAI) return
    if (joinTheWarPlayerId && isHuman(joinTheWarPlayerId)) return
    if (missilePowerPendingPlayerId && isHuman(missilePowerPendingPlayerId)) return
    if (isHuman(pendingCardDraws[0])) return

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
    if (showEventCard) { run(() => setShowEventCard(false)); return }
    // AI-owned event choices — resolve simply
    if (resistancePlacement && !isHuman(resistancePlacement.playerId)) {
      const own = Object.values(gameState.territories).find(t => t.occupyingPlayerId === resistancePlacement.playerId)
      run(() => {
        if (own) setGameState(prev => ({ ...prev, territories: { ...prev.territories, [own.id]: { ...prev.territories[own.id], troops: prev.territories[own.id].troops + 1 } } }))
        const left = resistancePlacement.troopsLeft - 1
        if (left <= 0) { resistancePlacementRef.current = null; setResistancePlacement(null) }
        else { const n = { ...resistancePlacement, troopsLeft: left }; resistancePlacementRef.current = n; setResistancePlacement(n) }
      })
      return
    }
    if (fortifyEventPlayerId && !isHuman(fortifyEventPlayerId)) {
      const own = Object.values(gameState.territories).find(t => t.occupyingPlayerId === fortifyEventPlayerId)
      run(() => { if (own) setGameState(prev => ({ ...prev, territories: { ...prev.territories, [own.id]: { ...prev.territories[own.id], troops: prev.territories[own.id].troops + 2 } } })); fortifyEventRef.current = null; setFortifyEventPlayerId(null) })
      return
    }
    if (controlPeopleChoice && !isHuman(controlPeopleChoice)) {
      // AI takes 5 troops in a city if it holds one, else the maneuver (skipped simply)
      const city = Object.values(gameState.territories).find(t => t.occupyingPlayerId === controlPeopleChoice && (t.cities ?? []).some(c => !c.isDestroyed && !c.headquartersFactionId))
      run(() => {
        if (city) setGameState(prev => ({ ...prev, territories: { ...prev.territories, [city.id]: { ...prev.territories[city.id], troops: prev.territories[city.id].troops + 5 } } }))
        setControlPeopleChoice(null)
      })
      return
    }
    if (riotResult && !isHuman(riotResult.loserId)) {
      const loseFrom = Object.values(gameState.territories).filter(t => t.occupyingPlayerId === riotResult.loserId && t.troops > 1).sort((a, b) => b.troops - a.troops)[0]
      run(() => {
        if (loseFrom) { const rm = Math.min(2, loseFrom.troops - 1); setGameState(prev => ({ ...prev, territories: { ...prev.territories, [loseFrom.id]: { ...prev.territories[loseFrom.id], troops: prev.territories[loseFrom.id].troops - rm } } })) }
        setRiotResult(null)
      })
      return
    }

    // Card draw belonging to the AI (end-of-turn / event / Balkania)
    if (pendingCardDraws[0] && !isHuman(pendingCardDraws[0])) {
      const drawerId = pendingCardDraws[0]
      const sideboard = cardState.sideboard ?? []
      const ownedFaceUp = sideboard.find(id => {
        const tId = getTerritoryCard(id)?.territoryId
        return tId && gameState.territories[tId]?.occupyingPlayerId === drawerId
      })
      const resource = (cardState.resourceDeck ?? cardState.coinDeck ?? [])[0]
      run(() => {
        if (ownedFaceUp) handleCardDrawSelect(ownedFaceUp, false)
        else if (resource) handleCardDrawSelect(resource, true)
        else setPendingCardDraws(prev => prev.slice(1))
      })
      return
    }
    if (balkExpansionPending && !isHuman(balkExpansionPending)) {
      const resource = (cardState.resourceDeck ?? cardState.coinDeck ?? [])[0]
      run(() => { if (resource) handleBalkExpansionSelect(resource, true); else setBalkExpansionPending(null) })
      return
    }

    // Combat / advance modals drive themselves (autoPlay) — wait for them.
    if (showCombat || showAdvance) return

    // ── Phase loop ──
    if (gameState.phase === 'reinforce') {
      if (troopsToPlace > 0) {
        const plan = aiReinforcePlacements(gameState, legacyState, cp.id, 1, diff)
        const tid = plan[0] ?? Object.values(gameState.territories).find(t => t.occupyingPlayerId === cp.id)?.id
        if (tid) run(() => {
          playTroop()
          dispatch({ type: 'PLACE_REINFORCEMENT', playerId: cp.id, territoryId: tid })
          setTroopsToPlace(prev => prev - 1)
          setPlacementHistory(prev => [...prev, tid])
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
            // Uncontested move — resolve directly (no interactive panel for AI)
            advanceSrcRef.current = order.srcId; advanceTgtRef.current = order.tgtId
            handleAdvanceConfirm(Math.max(1, (src?.troops ?? 1) - 1))
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
        window.setTimeout(() => handleNextPhase(), aiMs(600, 130))
      })
      return
    }
  })

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
        // Career wins; fall back to victory-log name matches for pre-existing campaigns
        const wins = (prev.playerWins ?? {})[p.id]
          ?? (prev.victoryLog ?? []).filter(v => v.winnerName === p.name).length
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

  // ── Territory card award: queue a sideboard draw for the player ──────────
  function awardTerritoryCard(playerId: string) {
    console.log(`[CardAward] awardTerritoryCard — queuing draw for ${playerId}`)
    setPendingCardDraws(prev => [...prev, playerId])
  }

  // ── Called when player selects a card from the sideboard modal ────────────
  // ── Event trigger ──────────────────────────────────────────────────────────
  // Events fire only when a player takes a sideboard card and the fresh card that
  // slides into spot 1 shows an EVEN coin value. Draws the top event card, shows
  // it, and applies its effect. (The interactive milestone events are resolved by
  // the EventCardDisplay's onDismiss handler.)
  function triggerEventCard() {
    setCardState(prev => {
      let deck = [...prev.eventDeck]
      let discard = [...prev.eventDiscard]
      if (deck.length === 0) {
        deck = [...discard].sort(() => Math.random() - 0.5)
        discard = []
      }
      if (deck.length === 0) return prev  // no events left to trigger
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

      const next = { ...prev, eventDeck: deck, eventDiscard: discard }
      const newLegacy = { ...legacyStateRef.current, activeGameCards: next }
      legacyStateRef.current = newLegacy
      setLegacyState(newLegacy)
      saveLegacyState(newLegacy).catch(() => {})
      return next
    })
  }

  /** True when the card that just entered sideboard spot 1 has an even coin value. */
  function spot1TriggersEvent(spot1CardId: string | null): boolean {
    if (!spot1CardId) return false
    const coins = (legacyStateRef.current.cardResources ?? {})[spot1CardId] ?? 1
    return coins % 2 === 0
  }

  function handleCardDrawSelect(cardId: string, isCoin: boolean) {
    const playerId = pendingCardDraws[0]
    if (!playerId) return

    console.log(`[CardAward] handleCardDrawSelect — player=${playerId} card=${cardId} isCoin=${isCoin}`)

    // Draw rules (backstop — the modal enforces these too): if you control the
    // territory of a face-up card you MUST take a face-up card you control;
    // the coin pile is only for players controlling none. Recon (missile
    // power) is the one exception — it opens every face-up card.
    const controlsFaceUp = (cardState.sideboard ?? []).some(id => {
      const tId = getTerritoryCard(id)?.territoryId
      return tId && gameStateRef.current.territories[tId]?.occupyingPlayerId === playerId
    })
    if (isCoin && controlsFaceUp) {
      showWeaknessNotice('⚠ You control a face-up territory — you must take that territory card')
      return
    }
    if (!isCoin && !reconDrawActive) {
      const tId = getTerritoryCard(cardId)?.territoryId
      if (tId && gameStateRef.current.territories[tId]?.occupyingPlayerId !== playerId) {
        showWeaknessNotice('⚠ You can only take a face-up card whose territory you control')
        return
      }
    }

    // Purist weakness power: hard cap of 2 coin cards in hand
    if (isCoin) {
      const drawFaction = gameStateRef.current.players.find(p => p.id === playerId)?.factionId ?? ''
      if (factionWeaknessOf(drawFaction) === 'wp-purist') {
        const coinCount = (cardState.playerHands[playerId] ?? []).filter(id => !!getCoinCard(id)).length
        if (coinCount >= 2) {
          showWeaknessNotice('⚠ Purist — you cannot hold more than 2 coin cards')
          return
        }
      }
    }

    // Drawing a card forfeits the shared mission for this turn
    drewCardPlayerIdsRef.current.add(playerId)

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
    const newCardState = { ...prevCards, sideboard, territoryDeck: deck, resourceDeck, playerHands }

    // ── 2. Detect depletion from the updated deck ──────────────────────────
    const resourceDepleted = isCoin && resourceDeck.length === 0
    console.log(`[CoinDeck] isCoin=${isCoin} deckAfter=${resourceDeck.length} depleted=${resourceDepleted}`)

    // ── 3. Compute star award if depleted ──────────────────────────────────
    let starAwardPlayerId: string | null = null
    let starAwardCount = 0
    let starAwardPlayer: typeof gameStateRef.current.players[0] | undefined
    if (resourceDepleted) {
      const state = gameStateRef.current
      const ownerCounts = new Map<string, number>()
      for (const t of Object.values(state.territories)) {
        if (t.occupyingPlayerId) ownerCounts.set(t.occupyingPlayerId, (ownerCounts.get(t.occupyingPlayerId) ?? 0) + 1)
      }
      console.log('[CoinDeck] Territory counts at depletion:', Object.fromEntries(
        state.players.map(p => [p.name, ownerCounts.get(p.id) ?? 0])
      ))
      let topPId = '', topCount = 0
      for (const [pid, count] of ownerCounts) {
        if (count > topCount) { topCount = count; topPId = pid }
      }
      if (topPId) {
        starAwardPlayerId = topPId
        starAwardCount = topCount
        starAwardPlayer = state.players.find(p => p.id === topPId)
        console.log(`[CoinDeck] Will award red star to ${starAwardPlayer?.name} (${topCount} territories)`)
      }
    }
    // Post-award purchased count, computed HERE from the pre-award value — the
    // setLegacyState updater below runs asynchronously, so reading the ref in
    // step 6 would miss the just-awarded star (a 4th star wouldn't end the game)
    const starAwardPurchasedAfter = starAwardPlayerId
      ? ((legacyStateRef.current.purchasedStars ?? {})[starAwardPlayerId] ?? 0) + 1
      : 0

    // ── 4. Single setLegacyState call — merges card update + star award ────
    // This is the ONLY call to setLegacyState in this handler, preventing any
    // stale-closure overwrite of the star by the card state update.
    setLegacyState(prev => {
      let next = { ...prev, activeGameCards: newCardState }
      if (starAwardPlayerId) {
        const purchased = { ...(next.purchasedStars ?? {}), [starAwardPlayerId]: ((next.purchasedStars ?? {})[starAwardPlayerId] ?? 0) + 1 }
        next = { ...next, purchasedStars: purchased }
      }
      legacyStateRef.current = next
      saveLegacyState(next)
        .then(() => {
          if (starAwardPlayerId) console.log('[CoinDeck] Red star + card state saved to Supabase ✓')
        })
        .catch(err => console.error('[CoinDeck] Save failed:', err))

      // Debug: log all player star counts after update
      if (starAwardPlayerId) {
        const gs = gameStateRef.current
        console.log('[CoinDeck] purchasedStars after award:', Object.fromEntries(
          gs.players.map(p => [p.name, (next.purchasedStars ?? {})[p.id] ?? 0])
        ))
      }
      return next
    })
    setCardState(() => newCardState)

    // ── Event trigger: even-coin card revealed on spot 1 ───────────────────
    if (spot1TriggersEvent(newSpot1Id)) triggerEventCard()

    // ── 5. Khan Supply Lines bonus ─────────────────────────────────────────
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

    // ── 6. Post-award effects ──────────────────────────────────────────────
    if (starAwardPlayerId && starAwardPlayer) {
      const state = gameStateRef.current
      const hqStars = Object.values(state.territories).filter(
        t => t.occupyingPlayerId === starAwardPlayerId && !!t.activeHqPlayerId,
      ).length
      const newStarTotal = hqStars + starAwardPurchasedAfter
      console.log(`[CoinDeck] ${starAwardPlayer.name} final star total: ${newStarTotal} (hq=${hqStars} purchased=${starAwardPurchasedAfter})`)
      if (newStarTotal >= 4) {
        console.log(`[CoinDeck] 4-star victory triggered for ${starAwardPlayer.name}!`)
        setWinnerPlayerId(starAwardPlayerId)
        setWinCondition('mission')
        setUnlockOptions(pickUnlocks(state.gameNumber))
        setGameState(prev => ({ ...prev, phase: 'game-over', winnerId: starAwardPlayerId! }))
        setTimeout(() => setShowWinScreen(true), 300)
      }
      setCoinDeckStarWinner({ name: starAwardPlayer.name, count: starAwardCount })
    }

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
    setBalkExpansionPending(null)
    // Drawing a card forfeits the shared mission for this turn
    drewCardPlayerIdsRef.current.add(playerId)

    let newSpot1Id: string | null = null
    setCardState(prev => {
      let sideboard = [...prev.sideboard]
      let deck = [...prev.territoryDeck]
      let resourceDeck = [...(prev.resourceDeck ?? prev.coinDeck ?? [])]
      const playerHands = { ...prev.playerHands, [playerId]: [...(prev.playerHands[playerId] ?? []), cardId] }

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

      const next = { ...prev, sideboard, territoryDeck: deck, resourceDeck, playerHands }
      const newLegacy = { ...legacyState, activeGameCards: next }
      setLegacyState(newLegacy)
      saveLegacyState(newLegacy).catch(() => {})
      return next
    })

    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId ? { ...p, cards: [...p.cards, cardId] } : p,
      ),
    }))

    // Event trigger: even-coin card revealed on spot 1
    if (spot1TriggersEvent(newSpot1Id)) triggerEventCard()
  }

  // ── Card trade-in ─────────────────────────────────────────────────────────
  function handleTradeIn(cardIds: string[], bonus: number) {
    const playerId = gameState.players[gameState.currentPlayerIndex]?.id
    if (!playerId) return
    playCoin()
    const tradedSet = new Set(cardIds)
    setCardState(prev => {
      const playerHands = {
        ...prev.playerHands,
        [playerId]: (prev.playerHands[playerId] ?? []).filter(id => !tradedSet.has(id)),
      }
      // Territory cards go to the discard pile; coin cards return to the bottom
      // of the resource deck — spending them stretches out the depletion star
      const tradedTerritory = cardIds.filter(id => !!getTerritoryCard(id))
      const tradedCoins = cardIds.filter(id => !getTerritoryCard(id))
      const territoryDiscard = [...prev.territoryDiscard, ...tradedTerritory]
      const resourceDeck = [...(prev.resourceDeck ?? prev.coinDeck ?? []), ...tradedCoins]
      const next = { ...prev, playerHands, territoryDiscard, resourceDeck }
      const newLegacy = { ...legacyState, activeGameCards: next }
      setLegacyState(newLegacy)
      saveLegacyState(newLegacy).catch(() => {})
      return next
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
    setCardState(prev => {
      const next = { ...prev, eventDiscard: [...prev.eventDiscard, cardId] }
      const newLegacy = { ...legacyStateRef.current, activeGameCards: next }
      setLegacyState(newLegacy)
      saveLegacyState(newLegacy).catch(() => {})
      return next
    })
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
      const next: LegacyState = {
        ...prev,
        // Remove the minor city, any HQ, and any fortification sticker from the territory
        stickers: prev.stickers.filter(s => !(
          s.targetId === territoryId &&
          (s.description === 'city:minor' || s.description.startsWith('HQ:') || s.description.startsWith('fortification:'))
        )),
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
        // Every sticker on the territory (cities, HQ, fortification) is destroyed
        stickers: prev.stickers.filter(s => s.targetId !== falloutTerritoryId),
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
  function completeSharedMissionIfEarned(playerId: string | undefined): boolean {
    if (!playerId) return false
    const ls = legacyStateRef.current
    if (!ls?.doubleWinnerMilestoneTriggered) return false
    const missionId = cardState.currentMissionId
    if (!missionId) return false
    const player = gameStateRef.current.players.find(p => p.id === playerId)
    if (!player || player.isEliminated) return false

    const completed = checkMission(
      missionId, playerId, gameStateRef.current.territories, gameStateRef.current,
      { conqueredIds: gameStateRef.current.turn.conqueredIds, conqueredViaSeaIds: gameStateRef.current.turn.conqueredViaSeaIds },
      cardState.resourceDeck?.length ?? 0,
    )
    if (!completed) return false
    if (drewCardPlayerIdsRef.current.has(playerId)) {
      showWeaknessNotice('🎯 Mission conditions met — but you drew a card this turn, so the mission cannot be claimed')
      return false
    }

    const missionDef = CARD_LOOKUP.get(missionId) as import('@/types/card').MissionCard | undefined
    const stars = missionDef?.stars ?? 1

    // Discard the completed mission and flip the next one face up
    const deck = [...(cardState.missionDeck ?? [])]
    const nextMissionId = deck.shift() ?? null
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
      if (missionDef?.singleUse) {
        next.destroyedMissionIds = [...(next.destroyedMissionIds ?? []), missionId]
      }
      // awardRedStars adds the stars to this game's totals (purchasedStars)
      next = awardRedStars(next, playerId, stars, player.name, gameStateRef.current.gameNumber)
      saveLegacyState(next).catch(() => {})
      return next
    })
    showWeaknessNotice(`🎯 ${player.name} completed the mission — +${stars} red star${stars !== 1 ? 's' : ''}! A new mission is revealed.`)

    // Special mission side effects
    if (missionId === 'mc-world-capital') {
      setWorldCapitalCompletingId(playerId)
      setShowWorldCapitalModal(true)
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
    const fortIdx = legacyStateRef.current?.scars.findIndex(s => s.territoryId === tgtId && s.type === 'fortification') ?? -1
    if (fortIdx >= 0) {
      const ls = legacyStateRef.current!
      const scar = ls.scars[fortIdx]
      const newCount = (scar.attackCount ?? 0) + fortUses
      const newScars = newCount >= 10
        ? ls.scars.filter((_, i) => i !== fortIdx)
        : ls.scars.map((s, i) => i === fortIdx ? { ...s, attackCount: newCount } : s)
      const newLs = { ...ls, scars: newScars }
      setLegacyState(newLs)
      saveLegacyState(newLs).catch(() => {})
    }

    setShowCombat(false)
    setAttackSrcId(null)
    setAttackTgtId(null)
    attackSrcRef.current = null
    attackTgtRef.current = null

    // Fortification sticker: deplete one charge per combat roll fought;
    // the fortification is destroyed when all 10 charges are spent
    if (tgtId) {
      setLegacyState(prev => {
        const newStickers = prev.stickers.map(s => {
          if (s.targetId === tgtId && s.description.startsWith('fortification:')) {
            const charges = parseInt(s.description.split(':')[1] ?? '0')
            return { ...s, description: `fortification:${Math.max(0, charges - fortUses)}` }
          }
          return s
        }).filter(s => !(s.targetId === tgtId && s.description === 'fortification:0'))
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
      let finalTroops = Math.max(1, troops - cost.total)
      if (cost.falloutHalf) {
        finalTroops = Math.max(1, Math.ceil(finalTroops / 2))
      }
      // The World Capital's −5 entry cost is already folded into cost.total
      // (deducted from the arriving troops above), like a city.
      territories[tgtId] = { ...territories[tgtId], occupyingPlayerId: currentPlayerId, troops: finalTroops }
      territories[srcId] = { ...territories[srcId], troops: Math.max(1, territories[srcId].troops - troops) }
      return { ...prev, territories }
    })

    // Uncontested advances count as expansions too — Balkania's Imperial
    // Expansion triggers on the 4th expansion of the turn, conquest or not
    const newCount = gameStateRef.current.turn.captureCount + 1
    setTurn({ captureCount: newCount })
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
    dispatch({ type: 'CONFIRM_FORTIFY', srcId, dstId, troopsRemoved: troops, troopsArriving: arriving })
    // Undo restores only survivors — troops lost to radiation stay lost
    setLastFortify({ srcId, dstId, troops: arriving })
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
  }

  // ── Phase advancement ─────────────────────────────────────────────────────
  function handleNextPhase() {
    const phase = gameState.phase
    if (phase === 'reinforce') {
      setPlacementHistory([])
      dispatch({ type: 'END_REINFORCE_PHASE' })
    } else if (phase === 'attack') {
      // Clear attack state
      setAttackSrcId(null); attackSrcRef.current = null
      console.log(`[CardAward] Attack phase ended — capturedThisTurn=${gameStateRef.current.turn.captured} pendingCardDraws=${JSON.stringify(pendingCardDraws)}`)
      dispatch({ type: 'END_ATTACK_PHASE' })
    } else if (phase === 'fortify') {
      // Shared mission — claimed once, at the end of the turn, BEFORE the
      // per-turn conquest lists reset. If the claim wins the game, stop here.
      if (completeSharedMissionIfEarned(gameState.players[gameState.currentPlayerIndex]?.id)) return

      // Advance to next player (skip permanently eliminated/forfeited players).
      // Pure logic lives in computeTurnAdvance — END_TURN recomputes the same.
      const { nextIdx, isNewRound } = computeTurnAdvance(gameState)
      const nextPlayerId = gameState.players[nextIdx].id
      const nextPlayer = gameState.players[nextIdx]

      // ── END-OF-TURN scar effects for the ENDING player ────────────────────
      // Mercenary +1 and Bio-hazard −1 resolve at the END of the owner's turn
      // (Mutants reversed); a territory at 1 troop can be VACATED (never the
      // last). Now a pure helper in the reducer; endTerritories is committed by
      // END_TURN (and by the Join the War early-exit below).
      const endingPlayer = gameState.players[gameState.currentPlayerIndex]
      const endingIsMutant = endingPlayer?.factionId === 'mutants'
      const scarResult = endingPlayer
        ? applyEndOfTurnScarEffects(gameState.territories, endingPlayer.id, endingIsMutant, legacyStateRef.current?.falloutZoneTerritoryId)
        : { territories: { ...gameState.territories }, vacatedNames: [] }
      const endTerritories = scarResult.territories
      const vacatedNames = scarResult.vacatedNames
      if (vacatedNames.length > 0) {
        showWeaknessNotice(`☣ ${endingPlayer?.name ?? 'Player'} abandoned ${vacatedNames.join(', ')} at end of turn — the scar wiped out the last troop`)
      }

      // Clear fortify state — runs BEFORE the Join the War early-return so
      // per-turn state (attacked territories, capture counts, missile powers…)
      // never leaks into the joining player's turn
      setFortifySrcId(null); setFortifyDstId(null); setFortifyDone(false)
      setShowFortify(false); fortifySrcRef.current = null; setLastFortify(null)
      setSaharaFortifyMode(false); saharaFortifyModeRef.current = false
      console.log(`[CardAward] Turn ended — pendingCardDraws at fortify exit: ${JSON.stringify(pendingCardDraws)}`)
      setTurn({ captured: false, captureCount: 0, conqueredIds: [], conqueredViaSeaIds: [] })
      setBalkExpansionPending(null)
      conqueredFromPlayerIdsRef.current = new Set()
      // Mass Hypnosis expires at the beginning of the protector's next turn
      if (hypnosisProtectedRef.current?.playerId === nextPlayerId) {
        hypnosisProtectedRef.current = null
        setHypnosisProtected(null)
      }
      setTurn({ bearTrapTerritoryId: null })
      setTurn({ shieldedTerritoryIds: [], attackedTerritoryIds: [] })
      drewCardPlayerIdsRef.current = new Set()
      // Clear any unresolved immediate-event pickers so they don't leak turns
      resistancePlacementRef.current = null; setResistancePlacement(null)
      fortifyEventRef.current = null; setFortifyEventPlayerId(null)
      setControlPeopleChoice(null)
      controlTroopsRef.current = null; setControlTroopsPlayerId(null)
      controlManeuverRef.current = null; setControlManeuver(null); setControlManeuverDstId(null)
      riotRemovalRef.current = null; setRiotRemovalPlayerId(null)
      setFortifyMovesLeft(1)
      setMobileHqUsed(false)
      setMobileHqSrcId(null)
      expandTargetRef.current = null
      setExpandTargetId(null)
      // Missile power per-turn state
      usedMissilePowersRef.current = new Set()
      setUsedMissilePowersThisTurn(new Set())
      setEmpTerritoryIds(new Set())
      stealthyModeRef.current = false
      setStealthyMode(false)
      stealthyTargetRef.current = null
      setStealthyTargetId(null)

      // If next player is eliminated and hasn't had their Join the War choice yet, show modal
      if (nextPlayer.isEliminated && nextPlayer.joinedWarThisGame === undefined) {
        setGameState(prev => ({ ...prev, territories: { ...prev.territories, ...endTerritories }, currentPlayerIndex: nextIdx }))
        setJoinTheWarPlayerId(nextPlayerId)
        return
      }

      // Events no longer auto-draw at round start — they trigger only when a
      // player takes a sideboard card that reveals an even-coin card on spot 1
      // (see triggerEventCard). Clear the previous round's active effects.
      const eventBonus = 0
      const drawnEventCardId: string | null = null
      if (isNewRound) {
        activeEffectsRef.current = new Set()
        setActiveEffects(new Set())
      }

      // Reinforcements for the next player, computed from the end-of-turn map
      // (endTerritories already reflects the previous players' scar changes;
      // the next player's own scar effect happened at the end of THEIR last turn)
      const nextPlayerAbility = playerAbility(nextPlayerId)
      const balkRoundUp = nextPlayerAbility === 'balk-round-up'
      const khanHqBonus = nextPlayerAbility === 'khan-hq-troops'
        ? Object.values(gameState.activeHqs).filter(
            tId => endTerritories[tId]?.occupyingPlayerId === nextPlayerId,
          ).length
        : 0
      const nextFactionId = gameState.players.find(p => p.id === nextPlayerId)?.factionId ?? ''
      const nextComebackPower = (legacyState.comebackPowers ?? {})[nextFactionId]
      const mercenaryBonus = nextComebackPower === 'mercenary'
        ? Object.values(endTerritories).filter(t => !t.occupyingPlayerId).length
        : 0
      const nextIsPrimitive = (legacyState.alienWeaknessPowers ?? {})[nextFactionId] === 'wp-primitive'
      // Aliens faction power: +2 troops if they control Alien Island, +1 per Ruin they control
      const alienRecruitBonus = nextFactionId === 'aliens'
        ? (endTerritories[ALIEN_ISLAND_TERRITORY_ID]?.occupyingPlayerId === nextPlayerId ? 2 : 0)
          + (legacyState.ruinTerritoryIds ?? []).filter(tid => endTerritories[tid]?.occupyingPlayerId === nextPlayerId).length
        : 0
      const nextTroops = calcReinforcements(nextPlayerId, endTerritories, balkRoundUp, legacyState.namedContinents ?? {}, legacyState.worldCapitalTerritoryId ?? null, nextIsPrimitive, legacyState.continentBonusModifiers ?? [])
        + richLandBonus(nextPlayerId, endTerritories)
        + eventBonus
        + khanHqBonus
        + mercenaryBonus
        + alienRecruitBonus
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
  function finalizeAndReturnToLobby(working: LegacyState) {
    const completed = { ...working, gameInProgress: false, activeGameState: null, purchasedStars: {} }
    saveLegacyState(completed).catch(() => {})
    setLegacyState(completed)
    onReturnToLobby()
  }

  function handleWinScreenComplete(newLegacy: LegacyState) {
    setLegacyState(newLegacy)
    setShowWinScreen(false)

    let working = newLegacy

    // Check double-winner milestone: any player has signed the board twice
    if (!working.doubleWinnerMilestoneTriggered) {
      const nameCounts: Record<string, number> = {}
      for (const v of working.victoryLog ?? []) {
        nameCounts[v.winnerName] = (nameCounts[v.winnerName] ?? 0) + 1
      }
      const doubleWinner = Object.entries(nameCounts).find(([, count]) => count >= 2)
      if (doubleWinner) {
        working = {
          ...working,
          doubleWinnerMilestoneTriggered: true,
          // Add the 3 Join the Cause cards into the event deck for next game
          // (they will be included in buildEventDeck when the flag is set)
        }
        setLegacyState(working)
        setDoubleWinnerName(doubleWinner[0])
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
          onNextPhase={handleNextPhase}
          onUndoPlacement={handleUndoPlacement}
          onUndoFortify={handleUndoFortify}
          canUndoFortify={!!lastFortify}
        />
        {/* Legacy Panel button — top-right */}
        <div style={{ position: 'absolute', top: 8, right: 12, display: 'flex', gap: 6 }}>
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
            onClick={onReturnToLobby}
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
      <SVGMapLayer territories={applyLegacyToTerritories(gameState.territories, legacyState)} players={gameState.players} legacy={legacyState} />

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


      {/* ── Face-up territory sideboard — right side of map (right of Asia) ── */}
      {(() => {
        const CONT_COLOR: Record<string, string> = {
          'north-america': '#E67E22', 'south-america': '#27AE60',
          'europe': '#2980B9', 'africa': '#E74C3C',
          'asia': '#8E44AD', 'australia': '#F39C12',
        }
        const sideboard = cardState.sideboard ?? []
        const currentPlayer = gameState.players[gameState.currentPlayerIndex]
        const currentEventCard = currentEventCardId ? getEventCard(currentEventCardId) : null
        const currentMissionId = cardState.currentMissionId ?? null
        const currentMission = currentMissionId ? (CARD_LOOKUP.get(currentMissionId) as import('@/types/card').MissionCard | undefined) : null

        const CARD_W = 90
        const cardBase: React.CSSProperties = {
          width: CARD_W, background: '#1a0d00',
          borderRadius: 7, padding: '6px 6px 5px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          boxShadow: '0 1px 6px rgba(0,0,0,0.6)',
        }

        return (
          <div style={{
            position: 'absolute', right: 200, top: '50%',
            transform: 'translateY(calc(-50% - 40px))',
            zIndex: 21, pointerEvents: 'none',
            display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 8,
            border: '1.5px solid rgba(200,148,10,0.5)',
            borderRadius: 10,
            padding: '8px',
            background: 'rgba(40,40,40,0.85)',
          }}>

            {/* ── Event card column ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{
                fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase',
                color: 'rgba(100,180,255,0.75)', textAlign: 'center', marginBottom: 2,
              }}>
                Event Card
              </div>
              <div style={{
                ...cardBase,
                border: `1.5px solid rgba(100,180,255,${currentEventCard ? 0.6 : 0.2})`,
                minHeight: 90,
                justifyContent: 'center',
              }}>
                <div style={{ width: '100%', height: 3, borderRadius: 2, background: '#64b4ff', opacity: currentEventCard ? 1 : 0.3 }} />
                {currentEventCard ? (
                  <>
                    <div style={{ fontSize: 18, marginTop: 2 }}>⚡</div>
                    <div style={{
                      fontSize: 9, fontWeight: 'bold', color: '#c8e0ff',
                      textAlign: 'center', lineHeight: 1.3, fontFamily: 'Georgia, serif',
                    }}>
                      {currentEventCard.name}
                    </div>
                    <div style={{
                      fontSize: 7, color: 'rgba(100,180,255,0.6)', letterSpacing: 0.5,
                      textAlign: 'center',
                    }}>
                      ACTIVE EVENT
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 22, opacity: 0.25 }}>⚡</div>
                    <div style={{ fontSize: 8, color: 'rgba(100,180,255,0.3)', textAlign: 'center', lineHeight: 1.3 }}>
                      No active<br/>event
                    </div>
                  </>
                )}
              </div>
              {/* Event deck count */}
              <div style={{
                ...cardBase,
                border: '1px solid rgba(100,180,255,0.2)',
                padding: '5px 6px',
                flexDirection: 'row', justifyContent: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 10, color: 'rgba(100,180,255,0.5)' }}>🂠</span>
                <span style={{ fontSize: 9, color: 'rgba(100,180,255,0.55)', fontFamily: 'Georgia, serif' }}>
                  {cardState.eventDeck?.length ?? 0} left
                </span>
              </div>
            </div>

            {/* ── Mission card column ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{
                fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase',
                color: 'rgba(220,80,80,0.75)', textAlign: 'center', marginBottom: 2,
              }}>
                Mission
              </div>
              <div style={{
                ...cardBase,
                border: `1.5px solid rgba(220,80,80,${currentMission ? 0.6 : 0.2})`,
                minHeight: 90,
                justifyContent: 'center',
              }}>
                <div style={{ width: '100%', height: 3, borderRadius: 2, background: '#dc5050', opacity: currentMission ? 1 : 0.3 }} />
                {currentMission ? (
                  <>
                    <div style={{ fontSize: 14, marginTop: 2 }}>
                      {currentMission.stars === 2 ? '★★' : '★'}
                    </div>
                    <div style={{
                      fontSize: 9, fontWeight: 'bold', color: '#ffc8c8',
                      textAlign: 'center', lineHeight: 1.3, fontFamily: 'Georgia, serif',
                      wordBreak: 'break-word',
                    }}>
                      {currentMission.description}
                    </div>
                    <div style={{
                      fontSize: 7, color: 'rgba(220,80,80,0.6)', letterSpacing: 0.5, textAlign: 'center',
                    }}>
                      {currentMission.stars === 2 ? 'SPECIAL · SINGLE USE' : 'SHARED — ANY PLAYER'}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 22, opacity: 0.25 }}>🎯</div>
                    <div style={{ fontSize: 8, color: 'rgba(220,80,80,0.3)', textAlign: 'center', lineHeight: 1.3 }}>
                      No mission<br/>face up
                    </div>
                  </>
                )}
              </div>
              {/* Mission deck count */}
              <div style={{
                ...cardBase,
                border: '1px solid rgba(220,80,80,0.2)',
                padding: '5px 6px',
                flexDirection: 'row', justifyContent: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 10, color: 'rgba(220,80,80,0.5)' }}>🂠</span>
                <span style={{ fontSize: 9, color: 'rgba(220,80,80,0.55)', fontFamily: 'Georgia, serif' }}>
                  {cardState.missionDeck?.length ?? 0} left
                </span>
              </div>
            </div>

            {/* ── Territory cards column ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{
              fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase',
              color: 'rgba(200,148,10,0.75)', textAlign: 'center', marginBottom: 2,
            }}>
              Territory Cards
            </div>
            {sideboard.slice(0, 4).map((cardId, idx) => {
              const card = getTerritoryCard(cardId)
              const terrDef = card ? TERRITORY_DEFINITIONS.find(d => d.id === card.territoryId) : null
              const contColor = CONT_COLOR[terrDef?.continentId ?? ''] ?? '#888'
              return (
                <div key={cardId} style={{
                  width: 90, background: '#1a0d00',
                  border: `1.5px solid ${contColor}88`,
                  borderRadius: 7,
                  padding: '6px 6px 5px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  boxShadow: `0 1px 6px rgba(0,0,0,0.6)`,
                  position: 'relative',
                }}>
                  {/* Number badge */}
                  <div style={{
                    position: 'absolute', top: -7, left: -7,
                    width: 16, height: 16, borderRadius: '50%',
                    background: contColor, color: '#000',
                    fontSize: 9, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.7)',
                    fontFamily: 'Georgia, serif',
                    zIndex: 1,
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ width: '100%', height: 3, borderRadius: 2, background: contColor }} />
                  <div style={{
                    fontSize: 10, fontWeight: 'bold', color: '#E8DCC8',
                    textAlign: 'center', lineHeight: 1.25,
                    fontFamily: 'Georgia, serif',
                    wordBreak: 'break-word',
                  }}>
                    {terrDef?.name ?? cardId}
                  </div>
                  <div style={{
                    fontSize: 8, color: contColor, letterSpacing: 0.5,
                    fontFamily: 'Georgia, serif',
                  }}>
                    {(terrDef?.continentId ?? '').replace(/-/g, ' ').toUpperCase()}
                  </div>
                  {/* Coin slot — shows resources assigned to this card */}
                  {(() => {
                    const coins = legacyState.cardResources?.[cardId] ?? 0
                    return (
                      <div style={{
                        width: '100%',
                        background: coins > 0 ? 'rgba(200,148,10,0.10)' : 'rgba(200,148,10,0.04)',
                        border: `1px solid rgba(200,148,10,${coins > 0 ? 0.35 : 0.12})`,
                        borderRadius: 4,
                        padding: '4px 3px',
                        display: 'flex', flexWrap: 'wrap', gap: 2,
                        justifyContent: 'center', minHeight: 28,
                        alignItems: 'center',
                      }}>
                        {coins > 0
                          ? Array.from({ length: coins }, (_, i) => (
                              <span key={i} style={{ fontSize: 13 }}>🪙</span>
                            ))
                          : <span style={{ fontSize: 9, color: 'rgba(200,148,10,0.25)' }}>—</span>
                        }
                      </div>
                    )
                  })()}
                </div>
              )
            })}
            <div style={{
              width: 90, background: '#1a0d00',
              border: '1.5px solid rgba(200,148,10,0.88)',
              borderRadius: 7, padding: '6px 6px 5px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              boxShadow: '0 1px 6px rgba(0,0,0,0.6)',
            }}>
              <div style={{ width: '100%', height: 3, borderRadius: 2, background: '#C8940A' }} />
              {(() => {
                const coinsLeft = cardState.resourceDeck?.length ?? 0
                const coinsDepleted = coinsLeft === 0
                return (
                  <div style={{
                    width: '100%',
                    background: coinsDepleted ? 'rgba(192,57,43,0.15)' : 'rgba(200,148,10,0.07)',
                    border: `1px solid ${coinsDepleted ? 'rgba(192,57,43,0.5)' : 'rgba(200,148,10,0.2)'}`,
                    borderRadius: 4,
                    padding: '4px 3px',
                    display: 'flex', flexWrap: 'wrap', gap: 2,
                    justifyContent: 'center', minHeight: 59,
                    alignItems: 'center', flexDirection: 'column',
                  }}>
                    <span style={{ fontSize: 32, color: coinsDepleted ? '#c0392b' : undefined }}>
                      {coinsDepleted ? '★' : '🪙'}
                    </span>
                    {coinsDepleted ? (
                      <span style={{ fontSize: 8, color: '#c0392b', fontFamily: 'Arial, sans-serif', fontWeight: 'bold', letterSpacing: 0.5 }}>GONE</span>
                    ) : (
                      <span style={{ fontSize: 9, color: '#C8940A', fontWeight: 'bold', letterSpacing: 0.5 }}>
                        {coinsLeft} left
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>
            </div>
          </div>
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

        // Scar effects on the defender's territory
        const tgtScars    = attackTgtTerritory.scars ?? []
        const hasFortifiedScar      = tgtScars.some(s => s.type === 'fortified')
        const hasFortificationScar  = tgtScars.some(s => s.type === 'fortification')
        const hasWastelandScar  = tgtScars.some(s => s.type === 'wasteland')
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
        const ammoShortage = activeEffects.has('ammunition-shortage')
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

        // Comeback power effects in combat
        const currentComebackPower = (legacyState.comebackPowers ?? {})[currentPlayer.factionId ?? '']
        const atkAggressive = currentComebackPower === 'aggressive' && defHasHq ? 1 : 0
        const atkResilient  = currentComebackPower === 'resilient'

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

      {/* Legacy Panel overlay */}
      {showLegacyPanel && (
        <LegacyPanel
          legacy={legacyState}
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

      {/* Hint bar for Fortify event placement */}
      {fortifyEventPlayerId && (() => {
        const fp = gameState.players.find(p => p.id === fortifyEventPlayerId)
        return (
          <HintBar color="#3498DB">
            ⛨ <strong>Fortify</strong> — {fp?.name ?? 'Player'}: click one territory you control to place <strong>2 troops</strong> on it
          </HintBar>
        )
      })()}

      {/* Control the People — largest-population player chooses a reward */}
      {controlPeopleChoice && (() => {
        const cp = gameState.players.find(p => p.id === controlPeopleChoice)
        const ownsCity = Object.values(gameState.territories).some(t =>
          t.occupyingPlayerId === controlPeopleChoice && (t.cities ?? []).some(c => !c.isDestroyed && !c.headquartersFactionId))
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
                  <div style={{ fontSize: 11, color: '#9a8070' }}>Place 5 troops into any one city you control.{!ownsCity ? ' (You control no city.)' : ''}</div>
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
                {loserCanLose ? `🔥 ${loser?.name ?? 'Loser'} removes 2 troops →` : 'Acknowledge'}
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
        return (
          <CardDrawModal
            playerId={balkExpansionPending}
            sideboard={cardState.sideboard ?? []}
            resourceDeck={cardState.resourceDeck ?? cardState.coinDeck ?? []}
            territories={gameState.territories}
            cardResources={legacyState.cardResources}
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
          <div style={{ fontSize: 28, marginBottom: 6 }}>★</div>
          <div style={{ fontSize: 15, fontWeight: 'bold', color: '#E8DCC8', marginBottom: 4 }}>
            Red Star Awarded!
          </div>
          <div style={{ fontSize: 12, color: 'rgba(220,200,160,0.80)', lineHeight: 1.5 }}>
            <strong style={{ color: '#e8c07a' }}>{coinDeckStarWinner.name}</strong> controls the most territories
            ({coinDeckStarWinner.count}) as the coin deck runs out.
          </div>
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
      {showWinScreen && winnerPlayerId && !comebackEliminatedPlayer && !missilePowerPendingPlayerId && (() => {
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
            onDismiss={() => {
              setShowEventCard(false)
              if (effect.kind === 'join-the-cause') setShowJoinTheCause(true)
              if (effect.kind === 'die-humans') {
                const alienPlayer = gameState.players.find(p => p.factionId === 'aliens' && !p.isEliminated)
                if (alienPlayer && hasRuinableCity()) {
                  setDieHumansPendingCardId(currentEventCardId)
                } else {
                  // No Alien player in the game or no minor city to ruin —
                  // the card is only destroyed if used, so return it to the discard
                  returnEventCardToDiscard(currentEventCardId)
                }
              }
              if (effect.kind === 'beam-down') {
                const alienPlayer = gameState.players.find(p => p.factionId === 'aliens' && !p.isEliminated)
                if (alienPlayer && hasBeamDownTarget()) setBeamDownActive(true)
              }
              if (effect.kind === 'mysterious-island') {
                const controllerId = gameState.territories[ALIEN_ISLAND_TERRITORY_ID]?.occupyingPlayerId
                const anyCards = (cardState.sideboard?.length ?? 0) > 0 ||
                  ((cardState.resourceDeck ?? cardState.coinDeck ?? []).length > 0)
                if (controllerId && anyCards) {
                  setPendingCardDraws(prev => [controllerId, ...prev])
                  setEventDrawActive(true)
                }
              }
              if (effect.kind === 'fallout-event') {
                applyFalloutEvent(currentEventCardId)
              }
              if (effect.kind === 'fortify-city') {
                // The drawer (current player) places 2 troops on one owned territory
                const drawerId = gameState.players[gameState.currentPlayerIndex]?.id ?? null
                const ownsAny = drawerId && Object.values(gameState.territories).some(t => t.occupyingPlayerId === drawerId)
                if (drawerId && ownsAny) {
                  fortifyEventRef.current = drawerId
                  setFortifyEventPlayerId(drawerId)
                }
              }
              if (effect.kind === 'control-the-people') {
                // The largest-population player chooses their reward
                const leaderId = largestPopulationPlayerId()
                if (leaderId) setControlPeopleChoice(leaderId)
              }
              if (effect.kind === 'riot') {
                applyRiotEvent()
              }
              if (effect.kind === 'agent-of-chaos') {
                applyAgentOfChaos()
              }
              if (effect.kind === 'mutants-evolve') {
                const mutantPlayer = gameState.players.find(p => p.factionId === 'mutants' && !p.isEliminated)
                if (mutantPlayer) {
                  setMutantsEvolvePendingCardId(currentEventCardId)
                } else {
                  // Only destroyed if used — return to the discard when no Mutants are playing
                  returnEventCardToDiscard(currentEventCardId)
                }
              }
            }}
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
        const sharedMissionMap = currentMissionId
          ? Object.fromEntries(gameState.players.map(p => [p.id, currentMissionId]))
          : {}
        return (
          <JoinTheCauseModal
            players={gameState.players}
            territories={gameState.territories}
            availableMissionIds={availableMissionIds}
            playerMissions={sharedMissionMap}
            worldCapitalTerritoryId={legacyState.worldCapitalTerritoryId}
            onChooseTroops={() => {
              setTroopsToPlace(prev => prev + 3)
              setShowJoinTheCause(false)
            }}
            onChooseMission={(_playerId, missionId) => {
              // Put the current shared mission back in the deck, flip the chosen one face up
              setCardState(prev => {
                const oldMissionId = prev.currentMissionId ?? null
                const updated: ActiveGameCards = {
                  ...prev,
                  currentMissionId: missionId,
                  missionDeck: prev.missionDeck
                    .filter(id => id !== missionId)
                    .concat(oldMissionId ? [oldMissionId] : []),
                }
                const newLegacy = { ...legacyStateRef.current, activeGameCards: updated }
                setLegacyState(newLegacy)
                saveLegacyState(newLegacy).catch(() => {})
                return updated
              })
              const md = CARD_LOOKUP.get(missionId) as import('@/types/card').MissionCard | undefined
              showWeaknessNotice(`📜 New shared mission revealed: ${md?.description ?? missionId}`)
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
            players={gameState.players}
            territories={gameState.territories}
            onPlace={(territoryId) => {
              setLegacyState(prev => {
                const next = {
                  ...prev,
                  worldCapitalTerritoryId: territoryId,
                  historyLog: [...prev.historyLog, {
                    gameNumber: gameStateRef.current.gameNumber,
                    entry: `${completingPlayer.name} placed the World Capital at ${gameState.territories[territoryId]?.name ?? territoryId}`,
                    timestamp: new Date().toISOString(),
                  }],
                }
                saveLegacyState(next).catch(() => {})
                return next
              })
              setShowWorldCapitalModal(false)
              setWorldCapitalCompletingId(null)
            }}
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
      background: `${color}1A`, border: `1px solid ${color}88`,
      borderRadius: 6, padding: '7px 20px',
      fontFamily: 'Georgia, serif', fontSize: 12, color,
      pointerEvents: 'none', letterSpacing: 0.3, backdropFilter: 'blur(5px)',
      whiteSpace: 'nowrap', zIndex: 10,
    }}>
      {children}
    </div>
  )
}

function Dim({ children }: { children: React.ReactNode }) {
  return <span style={{ opacity: 0.50, fontSize: 10 }}>{children}</span>
}
