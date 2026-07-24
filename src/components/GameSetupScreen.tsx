import { useState } from 'react'
import { MOCK_PLAYERS, FACTION_COLORS } from '@/data/mockGameState'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'
import { FACTION_ABILITY_OPTIONS, getAbilitiesForFaction } from '@/data/factionAbilities'
import { needsWeaknessPower } from '@/data/weaknessPowers'
import type { FactionId } from '@/types/faction'
import type { LegacyState } from '@/types/legacy'
import type { AIDifficulty } from '@/types/ai'
import HQMapPicker from './HQMapPicker'
import WeaknessPowerPicker from './WeaknessPowerPicker'

export interface PlayerSetup {
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
  aiDifficulty?: AIDifficulty
}

interface Props {
  playerOrder: string[]
  /** Abilities already locked in from a prior game (factionId → abilityId). Empty on game 1. */
  existingAbilities: Record<string, string>
  /** Ability IDs permanently removed (the unchosen options from prior games). */
  removedAbilityIds?: string[]
  /** Full legacy state for map overlays (cities, scars). Null on game 1. */
  legacy?: LegacyState | null
  onSetupComplete: (
    setups: PlayerSetup[],
    order: string[],
    abilityChoices: Record<string, string>,
    weaknessChoices: Record<string, string>,
  ) => void
}

type Phase = 'faction' | 'weakness' | 'ability' | 'territory'

const FACTION_NAMES: Record<string, string> = {
  'enclave-of-the-bear': 'Enclave of the Bear',
  'imperial-balkania':   'Imperial Balkania',
  'khan-industries':     'Khan Industries',
  'saharan-republic':    'Saharan Republic',
  'die-mechaniker':      'Die Mechaniker',
  'aliens':              'Aliens',
  'mutants':             'Mutants',
}
const BASE_FACTIONS = ['enclave-of-the-bear', 'imperial-balkania', 'khan-industries', 'saharan-republic', 'die-mechaniker']

/** Milestone factions become selectable once their milestone has fired */
function availableFactions(legacy: LegacyState | null | undefined): string[] {
  return [
    ...BASE_FACTIONS,
    ...(legacy?.alienMilestoneTriggered ? ['aliens'] : []),
    ...(legacy?.nuclearMilestoneTriggered ? ['mutants'] : []),
  ]
}

const PHASE_LABEL: Record<string, string> = {
  combat: '⚔ Combat',
  draft: '⊕ Draft',
  fortify: '⟳ Fortify',
  any: '★ Any Phase',
}

function hexToRgb(hex: number): string {
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}

export default function GameSetupScreen({ playerOrder, existingAbilities, removedAbilityIds = [], legacy = null, onSetupComplete }: Props) {
  const players = playerOrder.map(id => MOCK_PLAYERS.find(p => p.id === id)!)
  const [phase, setPhase] = useState<Phase>('faction')
  const [factionPicks, setFactionPicks]   = useState<Record<string, string>>({})  // playerId → factionId
  const [abilityPicks, setAbilityPicks]   = useState<Record<string, string>>({})  // factionId → abilityId
  const [weaknessPicks, setWeaknessPicks] = useState<Record<string, string>>({})  // factionId → weakness powerId
  const [territoryPicks, setTerritoryPicks] = useState<Record<string, string>>({}) // playerId → territoryId
  const [currentIdx, setCurrentIdx] = useState(0)

  const currentPlayer = players[currentIdx] ?? null
  const takenFactions = Object.values(factionPicks)

  // ── Faction phase ───────────────────────────────────────────────────────────

  function advanceAfterFactionStage(nextPicks: Record<string, string>) {
    if (currentIdx < players.length - 1) {
      setCurrentIdx(i => i + 1)
      setPhase('faction')
    } else {
      // All factions chosen — move to ability phase (skip if all abilities pre-existing;
      // milestone factions like Aliens/Mutants have no ability options and are skipped)
      const firstNeedIdx = players.findIndex(p => {
        const fid = nextPicks[p.id]
        return fid && !existingAbilities[fid] && !!getAbilitiesForFaction(fid as FactionId)[0]
      })
      setCurrentIdx(firstNeedIdx >= 0 ? firstNeedIdx : 0)
      setPhase(firstNeedIdx >= 0 ? 'ability' : 'territory')
    }
  }

  function handleFactionPick(factionId: string) {
    if (!currentPlayer) return
    const next = { ...factionPicks, [currentPlayer.id]: factionId }
    setFactionPicks(next)
    if (needsWeaknessPower(factionId, legacy)) {
      // Same player immediately picks their weakness power before the draft advances
      setPhase('weakness')
    } else {
      advanceAfterFactionStage(next)
    }
  }

  // ── Weakness power phase (alien milestone) ─────────────────────────────────

  function handleWeaknessPick(powerId: string) {
    if (!currentPlayer) return
    const fid = factionPicks[currentPlayer.id]
    if (fid) setWeaknessPicks(prev => ({ ...prev, [fid]: powerId }))
    advanceAfterFactionStage(factionPicks)
  }

  // ── Ability phase ───────────────────────────────────────────────────────────

  function handleAbilityPick(factionId: string, abilityId: string) {
    const next = { ...abilityPicks, [factionId]: abilityId }
    setAbilityPicks(next)
    // Advance to next player who still needs to pick (skip factions with no ability options)
    let nextIdx = currentIdx + 1
    while (nextIdx < players.length) {
      const fid = factionPicks[players[nextIdx].id]
      if (fid && !existingAbilities[fid] && !next[fid] && !!getAbilitiesForFaction(fid as FactionId)[0]) break
      nextIdx++
    }
    if (nextIdx < players.length) {
      setCurrentIdx(nextIdx)
    } else {
      setCurrentIdx(0)
      setPhase('territory')
    }
  }

  // ── Territory phase ─────────────────────────────────────────────────────────

  function handleTerritoryPick(territoryId: string) {
    if (!currentPlayer) return
    const next = { ...territoryPicks, [currentPlayer.id]: territoryId }
    setTerritoryPicks(next)
    if (currentIdx < players.length - 1) {
      setCurrentIdx(i => i + 1)
    } else {
      const setups: PlayerSetup[] = playerOrder.map(id => {
        const p = players.find(pl => pl.id === id)!
        return {
          playerId: id,
          name: p.name,
          factionId: factionPicks[id] ?? 'enclave-of-the-bear',
          startingTerritoryId: (id === currentPlayer.id ? territoryId : territoryPicks[id]) ?? '',
        }
      })
      const allAbilities = { ...existingAbilities, ...abilityPicks }
      onSetupComplete(setups, playerOrder, allAbilities, weaknessPicks)
    }
  }

  // ── Derived for current phase ───────────────────────────────────────────────

  const currentFactionId = currentPlayer ? factionPicks[currentPlayer.id] : null
  const factionColor = currentFactionId
    ? hexToRgb(FACTION_COLORS[currentFactionId] ?? 0x888888)
    : 'rgb(200,148,10)'

  const phaseTitle = phase === 'faction' ? '⚑ CHOOSE YOUR FACTION'
    : phase === 'weakness' ? '⚠ CHOOSE YOUR WEAKNESS POWER'
    : phase === 'ability' ? '★ CHOOSE YOUR FACTION ABILITY'
    : '♛ PLACE YOUR HQ'

  const phaseSubtitle = phase === 'faction'
    ? 'In turn order, each player picks their faction'
    : phase === 'weakness'
    ? 'The alien invasion has weakened humanity — each faction must accept a permanent weakness'
    : phase === 'ability'
    ? 'Each faction chooses one permanent ability for the entire campaign'
    : 'In turn order, each player claims a starting territory (HQ + 8 troops)'

  // Territory phase gets a wide fullscreen layout with the map; other phases use the card layout
  if (phase === 'territory') {
    const factionColor = currentPlayer ? `rgb(${[(FACTION_COLORS[factionPicks[currentPlayer.id] ?? ''] ?? 0x888888) >> 16 & 0xff, (FACTION_COLORS[factionPicks[currentPlayer.id] ?? ''] ?? 0x888888) >> 8 & 0xff, (FACTION_COLORS[factionPicks[currentPlayer.id] ?? ''] ?? 0x888888) & 0xff].join(',')})` : '#C8940A'
    const placedHQs = Object.entries(territoryPicks).map(([pid, tid]) => {
      const p = players.find(pl => pl.id === pid)!
      return { playerId: pid, playerName: p.name, factionId: factionPicks[pid] ?? '', territoryId: tid }
    })

    return (
      <div style={{
        width: '100vw', height: '100vh',
        background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Georgia, serif', padding: '12px 16px', boxSizing: 'border-box',
        gap: 10,
      }}>
        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>♛ PLACE YOUR HQ</div>
            <div style={{ fontSize: 11, color: '#7a6040', marginTop: 2 }}>
              In turn order, each player claims a starting territory — HQ + 8 troops
            </div>
          </div>
          {/* Current player callout */}
          {currentPlayer && (
            <div style={{
              marginLeft: 'auto', padding: '6px 16px', borderRadius: 8,
              background: `${factionColor.replace('rgb', 'rgba').replace(')', ',0.12)')}`,
              border: `1.5px solid ${factionColor.replace('rgb', 'rgba').replace(')', ',0.55)')}`,
              fontSize: 13, color: '#E8DCC8',
            }}>
              <span style={{ color: factionColor, fontWeight: 'bold' }}>{currentPlayer.name}</span>
              <span style={{ fontSize: 10, color: '#7a6040', marginLeft: 8 }}>is choosing…</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
          {/* Sidebar: player order summary */}
          <div style={{
            width: 180, flexShrink: 0,
            background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
            border: '1.5px solid rgba(200,148,10,0.30)',
            borderRadius: 10, padding: '12px 10px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 9, color: '#5a4020', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Turn Order</div>
            {players.map((p, idx) => {
              const fid = factionPicks[p.id]
              const tid = territoryPicks[p.id]
              const tName = tid ? (TERRITORY_DEFINITIONS.find(d => d.id === tid)?.name ?? tid) : null
              const col = fid ? `rgb(${[(FACTION_COLORS[fid] ?? 0x888888) >> 16 & 0xff, (FACTION_COLORS[fid] ?? 0x888888) >> 8 & 0xff, (FACTION_COLORS[fid] ?? 0x888888) & 0xff].join(',')})` : 'rgb(100,80,50)'
              const isActive = idx === currentIdx
              const isDone = tName !== null
              return (
                <div key={p.id} style={{
                  padding: '7px 9px', borderRadius: 7,
                  background: isActive ? 'rgba(200,148,10,0.08)' : 'rgba(0,0,0,0.25)',
                  border: `1px solid ${isActive ? 'rgba(200,148,10,0.50)' : 'rgba(100,75,25,0.14)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: isDone ? col : (isActive ? col : '#3a2810'), flexShrink: 0 }} />
                    <div style={{ fontSize: 12, color: isActive ? '#E8DCC8' : (isDone ? '#9a8060' : '#4a3820'), fontWeight: isActive ? 'bold' : 'normal' }}>
                      {p.name}
                    </div>
                  </div>
                  {isDone && tName && (
                    <div style={{ fontSize: 10, color: '#27AE60', marginTop: 3, marginLeft: 16 }}>♛ {tName}</div>
                  )}
                  {isActive && !isDone && (
                    <div style={{ fontSize: 9, color: '#C8940A', marginTop: 3, marginLeft: 16 }}>← choosing now</div>
                  )}
                  {!isDone && !isActive && idx > currentIdx && (
                    <div style={{ fontSize: 9, color: '#3a2810', marginTop: 2, marginLeft: 16 }}>waiting…</div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Map picker */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {currentPlayer && (
              <HQMapPicker
                currentPlayer={{ id: currentPlayer.id, name: currentPlayer.name, factionId: factionPicks[currentPlayer.id] ?? 'enclave-of-the-bear' }}
                placedHQs={placedHQs}
                legacy={legacy}
                onConfirm={handleTerritoryPick}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: '2px solid rgba(200,148,10,0.60)',
        borderRadius: 14, padding: '28px 36px 24px',
        width: 640, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
        color: '#E8DCC8',
        boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>
            {phaseTitle}
          </div>
          <div style={{ fontSize: 11, color: '#7a6040', marginTop: 4 }}>{phaseSubtitle}</div>
        </div>

        {/* Player order summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {players.map((p, idx) => {
            const fid = factionPicks[p.id]
            const tid = territoryPicks[p.id]
            const tName = tid ? (TERRITORY_DEFINITIONS.find(d => d.id === tid)?.name ?? tid) : null
            const color = fid ? hexToRgb(FACTION_COLORS[fid] ?? 0x888888) : 'rgb(100,80,50)'
            const isActive = idx === currentIdx
            const abilityId = fid ? (abilityPicks[fid] ?? existingAbilities[fid]) : undefined
            const abilityName = abilityId ? (FACTION_ABILITY_OPTIONS.find(a => a.id === abilityId)?.name) : undefined

            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 7,
                background: isActive ? 'rgba(200,148,10,0.08)' : 'rgba(0,0,0,0.25)',
                border: `1px solid ${isActive ? 'rgba(200,148,10,0.50)' : 'rgba(100,75,25,0.18)'}`,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, color: isActive ? '#E8DCC8' : '#7a6040' }}>
                  {p.name}
                  {isActive && <span style={{ fontSize: 9, color: '#C8940A', marginLeft: 6 }}>← choosing now</span>}
                </div>
                <div style={{ fontSize: 11, color: '#9a8060', textAlign: 'right' }}>
                  {fid && <span style={{ color }}>{FACTION_NAMES[fid]}</span>}
                  {abilityName && phase !== 'faction' && (
                    <span style={{ color: '#27AE60', marginLeft: 6 }}>★ {abilityName}</span>
                  )}
                  {tName && <span style={{ color: '#27AE60', marginLeft: 6 }}>♛ {tName}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Faction selection ── */}
        {phase === 'faction' && currentPlayer && (
          <div>
            <div style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5 }}>
              {currentPlayer.name} — Pick a Faction
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableFactions(legacy).map(fid => {
                const taken = takenFactions.includes(fid)
                const col = hexToRgb(FACTION_COLORS[fid as FactionId] ?? 0x888888)
                const colA = col.replace('rgb', 'rgba').replace(')', ',0.60)')
                const [ab1, ab2] = getAbilitiesForFaction(fid as FactionId)
                const visibleAbilities = [ab1, ab2].filter(ab => ab && !removedAbilityIds.includes(ab.id))
                return (
                  <button
                    key={fid}
                    onClick={() => !taken && handleFactionPick(fid)}
                    disabled={taken}
                    style={{
                      padding: '10px 14px', borderRadius: 9, textAlign: 'left',
                      border: `1.5px solid ${taken ? 'rgba(100,75,25,0.15)' : colA}`,
                      background: taken ? 'rgba(20,10,0,0.30)' : col.replace('rgb', 'rgba').replace(')', ',0.07)'),
                      color: taken ? '#3a2810' : '#E8DCC8',
                      cursor: taken ? 'not-allowed' : 'pointer',
                      fontFamily: 'Georgia, serif',
                      opacity: taken ? 0.45 : 1,
                    }}
                  >
                    {/* Faction name row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: taken ? '#333' : col, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 'bold', color: taken ? '#4a3020' : col }}>{FACTION_NAMES[fid]}</span>
                      {taken && <span style={{ fontSize: 9, color: '#3a2810', marginLeft: 4 }}>(taken)</span>}
                    </div>
                    {/* Two ability options */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {visibleAbilities.map(ab => (
                        <div key={ab.id} style={{
                          flex: 1, padding: '6px 8px', borderRadius: 6,
                          background: taken ? 'rgba(0,0,0,0.15)' : col.replace('rgb', 'rgba').replace(')', ',0.08)'),
                          border: `1px solid ${taken ? 'rgba(100,75,25,0.10)' : col.replace('rgb', 'rgba').replace(')', ',0.22)')}`,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 'bold', color: taken ? '#4a3020' : col, marginBottom: 2 }}>
                            {PHASE_LABEL[ab.phase] ?? ab.phase} · {ab.name}
                          </div>
                          <div style={{ fontSize: 9, color: taken ? '#3a2010' : '#9a8060', lineHeight: 1.4 }}>
                            {ab.tagline}
                          </div>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Weakness power selection (alien milestone) ── */}
        {phase === 'weakness' && currentPlayer && currentFactionId && (
          <WeaknessPowerPicker
            playerName={currentPlayer.name}
            factionName={FACTION_NAMES[currentFactionId] ?? currentFactionId}
            takenPowerIds={new Set([
              ...Object.values(weaknessPicks),
              ...Object.values(legacy?.alienWeaknessPowers ?? {}),
            ])}
            onPick={handleWeaknessPick}
          />
        )}

        {/* ── Ability selection ── */}
        {phase === 'ability' && currentPlayer && currentFactionId && (() => {
          const [opt1, opt2] = getAbilitiesForFaction(currentFactionId as FactionId)
          if (!opt1 || !opt2) return null
          const col = factionColor
          return (
            <div>
              <div style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5 }}>
                <span style={{ color: col }}>{currentPlayer.name}</span>
                {' '}({FACTION_NAMES[currentFactionId]}) — Choose Permanent Ability
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {[opt1, opt2].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => handleAbilityPick(currentFactionId, opt.id)}
                    style={{
                      flex: 1, padding: '16px 14px', borderRadius: 10, textAlign: 'left',
                      border: `1.5px solid ${col.replace('rgb', 'rgba').replace(')', ',0.32)')}`,
                      background: col.replace('rgb', 'rgba').replace(')', ',0.06)'),
                      color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = col.replace('rgb', 'rgba').replace(')', ',0.14)')
                      e.currentTarget.style.borderColor = col.replace('rgb', 'rgba').replace(')', ',0.65)')
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = col.replace('rgb', 'rgba').replace(')', ',0.06)')
                      e.currentTarget.style.borderColor = col.replace('rgb', 'rgba').replace(')', ',0.32)')
                    }}
                  >
                    <div style={{
                      display: 'inline-block', fontSize: 9, padding: '2px 8px', borderRadius: 8,
                      background: col.replace('rgb', 'rgba').replace(')', ',0.12)'),
                      border: `1px solid ${col.replace('rgb', 'rgba').replace(')', ',0.35)')}`,
                      color: col, letterSpacing: 0.5, marginBottom: 10,
                    }}>
                      {PHASE_LABEL[opt.phase] ?? opt.phase}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 'bold', color: col, marginBottom: 6, lineHeight: 1.2 }}>
                      {opt.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#C8940A', marginBottom: 8, fontStyle: 'italic' }}>
                      {opt.tagline}
                    </div>
                    <div style={{ fontSize: 11, color: '#8a7060', lineHeight: 1.5 }}>
                      {opt.description}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 10, color: col.replace('rgb', 'rgba').replace(')', ',0.55)'), textAlign: 'center' }}>
                      Click to choose →
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}
