import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import type { GameState, GamePhase } from '@/types/game'
import { FACTION_COLORS, NEUTRAL_COLOR } from '@/data/mockGameState'
import { calcReinforcements, totalContinentBonus } from '@/lib/gameLogic'

interface Props {
  gameState: GameState
  troopsToPlace: number
  placementsCount: number
  fortifyDone: boolean
  pendingCardDraws: string[]
  balkRoundUp?: boolean
  worldCapitalTerritoryId?: string | null
  /** Primitive weakness power: city population excluded from recruit count */
  primitiveWeakness?: boolean
  /** Campaign continent bonus modifiers (winner rewards, unlocks) */
  continentBonusModifiers?: Array<{ continentId: string; bonusDelta: number }>
  /** Who named each continent — its namer collects +1 troop for holding it. */
  namedContinents?: Record<string, { namedByPlayerId: string }>
  onNextPhase: () => void
  /**
   * Whether the seat at this screen may drive the turn. Hotseat: always.
   * Online: only when the current player is this machine's seat — every other
   * screen watches the phase and holds none of its controls. Defaults to true
   * so hotseat callers change nothing.
   */
  canAct?: boolean
  onUndoPlacement: () => void
  onUndoFortify: () => void
  canUndoFortify: boolean
}

const PHASE_CONFIG: Record<string, {
  label: string
  icon: string
  color: string
  dimColor: string
  hint: string
  nextLabel: string
  nextDisabled?: (props: Props) => boolean
}> = {
  reinforce: {
    label: 'DRAFT',
    icon: '⊕',
    color: '#27AE60',
    dimColor: 'rgba(39,174,96,0.18)',
    hint: 'Click your territories to place reinforcement troops',
    nextLabel: 'Begin Attack →',
    nextDisabled: ({ troopsToPlace }) => troopsToPlace > 0,
  },
  attack: {
    label: 'ATTACK',
    icon: '⚔',
    color: '#E74C3C',
    dimColor: 'rgba(231,76,60,0.18)',
    hint: 'Click an owned territory to attack from, then click an adjacent enemy',
    nextLabel: 'End Attack →',
  },
  fortify: {
    label: 'FORTIFY',
    icon: '⟳',
    color: '#2980B9',
    dimColor: 'rgba(41,128,185,0.18)',
    hint: 'Move troops between two connected territories you own (once per turn)',
    nextLabel: 'End Turn →',
    nextDisabled: ({ pendingCardDraws }: Props) => pendingCardDraws.length > 0,
  },
}

function hexToRgb(hex: number) {
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff
  return `${r},${g},${b}`
}

export default function TurnControls({ gameState, troopsToPlace, placementsCount, fortifyDone, pendingCardDraws, balkRoundUp = false, worldCapitalTerritoryId = null, primitiveWeakness = false, continentBonusModifiers = [], namedContinents = {}, onNextPhase, onUndoPlacement, onUndoFortify, canUndoFortify, canAct = true }: Props) {
  const phase = gameState.phase as GamePhase
  const cfg = PHASE_CONFIG[phase]
  if (!cfg) return null

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const playerCol = FACTION_COLORS[currentPlayer?.factionId ?? ''] ?? NEUTRAL_COLOR
  const rgb = hexToRgb(playerCol)

  const isDisabled = cfg.nextDisabled?.({ gameState, troopsToPlace, fortifyDone, pendingCardDraws, onNextPhase, onUndoPlacement, onUndoFortify, canUndoFortify, placementsCount }) ?? false

  // ── Reinforce breakdown ──────────────────────────────────────────────────
  // Every line here is read from the same helpers the payout uses. The continent
  // bonus used to be inferred by subtracting a territories-only base from the
  // total, which folded the troops your CITIES earn into a figure labelled
  // "continent bonus" — a player holding three continents worth 11 and 15
  // population was told they had a +16 continent bonus.
  const ownedTerritories = Object.values(gameState.territories).filter(
    t => t.occupyingPlayerId === currentPlayer?.id,
  )
  const ownedCount = ownedTerritories.length
  const cityPopulation = primitiveWeakness ? 0 : ownedTerritories.reduce((sum, t) => {
    // The World Capital IS the city on its territory — worth exactly 5, and its
    // own stickers are not counted on top (same no-double-dip rule as the payout).
    if (worldCapitalTerritoryId && t.id === worldCapitalTerritoryId) return sum + 5
    return sum + t.cities.reduce(
      (n, c) => n + (c.isDestroyed || c.headquartersFactionId ? 0 : (c.isMajor ? 2 : 1)), 0)
  }, 0)
  const effectiveCount = ownedCount + cityPopulation
  const baseTroops = Math.max(3, balkRoundUp ? Math.ceil(effectiveCount / 3) : Math.floor(effectiveCount / 3))
  const bonus = currentPlayer
    ? totalContinentBonus(currentPlayer.id, gameState.territories, { namedContinents, continentBonusModifiers })
    : 0
  const total = currentPlayer
    ? calcReinforcements(currentPlayer.id, gameState.territories, balkRoundUp, namedContinents, worldCapitalTerritoryId, primitiveWeakness, continentBonusModifiers)
    : 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        fontFamily: 'Georgia, serif',
        pointerEvents: 'all',
        zIndex: 50,
        filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.7))',
        outline: '2px solid rgba(180,180,180,0.45)',
        outlineOffset: '2px',
        borderRadius: 7,
        background: 'rgba(40,40,40,0.85)',
      }}
    >
      {/* Player badge */}
      <div
        style={{
          background: `rgba(${rgb},0.18)`,
          border: `1.5px solid rgba(${rgb},0.70)`,
          borderRight: 'none',
          borderRadius: '6px 0 0 6px',
          padding: '7px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            width: 10, height: 10, borderRadius: '50%',
            background: `rgb(${rgb})`,
            boxShadow: `0 0 6px rgb(${rgb})`,
          }}
        />
        <span style={{ fontSize: 12, color: `rgb(${rgb})`, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
          {currentPlayer?.name}
        </span>
        <span style={{ fontSize: 9, color: `rgba(${rgb},0.65)`, letterSpacing: 1 }}>
          Turn {gameState.turnNumber}
        </span>
      </div>

      {/* Phase pill — content slides/fades in on each phase change */}
      <motion.div
        key={phase}
        initial={{ opacity: 0.2 }}
        animate={{ opacity: 1, backgroundColor: cfg.dimColor }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{
          background: cfg.dimColor,
          border: `1.5px solid ${cfg.color}99`,
          borderLeft: `2px solid ${cfg.color}`,
          padding: '7px 16px',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: 200,
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}
        >
          <span style={{ fontSize: 16, color: cfg.color }}>{cfg.icon}</span>
          <span style={{ fontSize: 13, color: cfg.color, fontWeight: 'bold', letterSpacing: 2 }}>
            {cfg.label}
          </span>
          {phase === 'reinforce' && (
            <span
              style={{
                fontSize: 10,
                color: troopsToPlace > 0 ? '#F39C12' : '#27AE60',
                fontWeight: 'bold',
                background: troopsToPlace > 0 ? 'rgba(243,156,18,0.18)' : 'rgba(39,174,96,0.15)',
                border: `1px solid ${troopsToPlace > 0 ? 'rgba(243,156,18,0.45)' : 'rgba(39,174,96,0.45)'}`,
                borderRadius: 10,
                padding: '1px 8px',
                marginLeft: 4,
              }}
            >
              {troopsToPlace > 0 ? `${troopsToPlace} to place` : '✓ all placed'}
            </span>
          )}
          {phase === 'fortify' && fortifyDone && (
            <span
              style={{
                fontSize: 10, color: '#27AE60',
                background: 'rgba(39,174,96,0.15)',
                border: '1px solid rgba(39,174,96,0.45)',
                borderRadius: 10, padding: '1px 8px', marginLeft: 4,
              }}
            >
              ✓ moved
            </span>
          )}
        </motion.div>
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.06 }}
          style={{ fontSize: 10, color: 'rgba(232,220,200,0.50)', letterSpacing: 0.3, textAlign: 'center' }}
        >
          {cfg.hint}
        </motion.div>
      </motion.div>

      {/* Reinforce breakdown tooltip strip */}
      {phase === 'reinforce' && (
        <div
          style={{
            background: 'rgba(10,5,0,0.75)',
            border: '1.5px solid rgba(39,174,96,0.30)',
            borderLeft: 'none',
            padding: '7px 12px',
            backdropFilter: 'blur(8px)',
            fontSize: 10,
            color: '#8a9a80',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minWidth: 100,
          }}
        >
          <span>
            {ownedCount} territories{cityPopulation > 0 ? ` + ${cityPopulation} city population` : ''} → {baseTroops} troops
          </span>
          {bonus > 0 && <span style={{ color: '#27AE60' }}>+{bonus} continent bonus</span>}
          {bonus > 0 && <span style={{ color: '#6a7a60' }}>= {total} total</span>}
        </div>
      )}

      {/* Draft-phase undo / confirm buttons — the acting seat's only */}
      {canAct && phase === 'reinforce' && (
        <>
          <button
            onClick={onUndoPlacement}
            disabled={placementsCount === 0}
            title="Undo last placement"
            style={{
              background: placementsCount > 0 ? 'rgba(243,156,18,0.15)' : 'rgba(60,40,10,0.45)',
              border: `1.5px solid ${placementsCount > 0 ? 'rgba(243,156,18,0.55)' : 'rgba(100,70,20,0.25)'}`,
              borderLeft: 'none',
              color: placementsCount > 0 ? '#F39C12' : 'rgba(140,100,30,0.40)',
              padding: '7px 13px',
              fontSize: 13,
              fontFamily: 'Georgia, serif',
              cursor: placementsCount > 0 ? 'pointer' : 'not-allowed',
              backdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
            }}
          >
            ↩ Undo
          </button>
        </>
      )}

      {/* Fortify-phase undo button — the acting seat's only */}
      {canAct && phase === 'fortify' && fortifyDone && (
        <button
          onClick={onUndoFortify}
          disabled={!canUndoFortify}
          title="Undo fortification"
          style={{
            background: canUndoFortify ? 'rgba(41,128,185,0.15)' : 'rgba(20,40,60,0.45)',
            border: `1.5px solid ${canUndoFortify ? 'rgba(41,128,185,0.55)' : 'rgba(30,60,90,0.25)'}`,
            borderLeft: 'none',
            color: canUndoFortify ? '#2980B9' : 'rgba(40,80,120,0.40)',
            padding: '7px 13px',
            fontSize: 13,
            fontFamily: 'Georgia, serif',
            cursor: canUndoFortify ? 'pointer' : 'not-allowed',
            backdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap',
          }}
        >
          ↩ Undo
        </button>
      )}

      {/* Next phase button — the acting seat's, and nobody else's. Every
          screen in an online match shows the phase; only one may end it.
          Rendered for all of them, "End Attack →" and "End Fortify →" sat on
          the watchers' screens as if the turn were theirs to close. */}
      {canAct && (
        <button
          onClick={onNextPhase}
          disabled={isDisabled}
          style={{
            ...nextBtnStyle(cfg.color, isDisabled),
            borderLeft: 'none',
            borderRadius: '0 6px 6px 0',
          }}
        >
          {phase === 'reinforce'
            ? (troopsToPlace === 0 ? '✓ Confirm' : cfg.nextLabel)
            : (phase === 'fortify' && pendingCardDraws.length > 0)
              ? '🃏 Pick a Card First'
              : cfg.nextLabel}
        </button>
      )}
    </div>
  )
}

function nextBtnStyle(color: string, disabled: boolean): CSSProperties {
  return {
    background: disabled ? 'rgba(60,40,10,0.60)' : `${color}28`,
    border: `1.5px solid ${disabled ? 'rgba(120,90,30,0.30)' : color + 'AA'}`,
    color: disabled ? 'rgba(140,110,50,0.50)' : color,
    padding: '7px 18px',
    fontSize: 12,
    fontFamily: 'Georgia, serif',
    fontWeight: 'bold',
    letterSpacing: 0.5,
    cursor: disabled ? 'not-allowed' : 'pointer',
    backdropFilter: 'blur(8px)',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, color 0.15s',
  }
}
