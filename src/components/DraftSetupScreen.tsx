import { useState } from 'react'
import { MOCK_PLAYERS, FACTION_COLORS } from '@/data/mockGameState'
import { needsWeaknessPower, WEAKNESS_POWERS } from '@/data/weaknessPowers'
import { factionPowers } from '@/lib/factionPowers'
import { leadFactionId, factionWinCounts, LEAD_FACTION_WORLD_CAPITAL_TROOPS } from '@/lib/gameLogic'
import type { FactionId } from '@/types/faction'
import type { LegacyState } from '@/types/legacy'
import type { PlayerSetup } from './GameSetupScreen'
import WeaknessPowerPicker from './WeaknessPowerPicker'
import HQMapPicker from './HQMapPicker'

interface Props {
  /** Players in draft-pick order (index 0 = first pick = HIGHEST dice roll) */
  playerOrder: string[]
  existingAbilities: Record<string, string>
  /** Full legacy state — used to gate weakness power selection. Null on game 1. */
  legacy?: LegacyState | null
  /** Players driven by the computer — their weakness powers are auto-claimed. */
  aiPlayerIds?: Set<string>
  onDraftComplete: (
    setups: PlayerSetup[],
    order: string[],
    abilityChoices: Record<string, string>,
    weaknessChoices: Record<string, string>,
  ) => void
}

const FACTION_NAMES: Record<string, string> = {
  'enclave-of-the-bear': 'Enclave of the Bear',
  'imperial-balkania':   'Imperial Balkania',
  'khan-industries':     'Khan Industries',
  'saharan-republic':    'Saharan Republic',
  'die-mechaniker':      'Die Mechaniker',
  'aliens':              'Aliens',
  'mutants':             'Mutants',
}
const BASE_FACTIONS = ['enclave-of-the-bear', 'imperial-balkania', 'khan-industries', 'saharan-republic', 'die-mechaniker'] as FactionId[]

/** Milestone factions become selectable once their milestone has fired */
function availableFactions(legacy: { alienMilestoneTriggered?: boolean; nuclearMilestoneTriggered?: boolean } | null | undefined): FactionId[] {
  return [
    ...BASE_FACTIONS,
    ...(legacy?.alienMilestoneTriggered ? ['aliens' as FactionId] : []),
    ...(legacy?.nuclearMilestoneTriggered ? ['mutants' as FactionId] : []),
  ]
}

// Draftable slot values by player count (one slot per player)
function troopSlots(n: number): number[] {
  if (n === 4) return [10, 8, 8, 6]
  if (n === 5) return [10, 10, 8, 8, 6]
  return [10, 8, 8, 6, 6].slice(0, n)
}
function coinSlots(n: number): number[]   { return [2, 1, 1, 0, 0].slice(0, n) }

type DraftListId = 'faction' | 'troops' | 'coins' | 'order'
const DRAFT_LISTS: Array<{ id: DraftListId; label: string; icon: string }> = [
  { id: 'faction', label: 'Factions',    icon: '⚑' },
  { id: 'troops',  label: 'Troops',      icon: '⚔' },
  { id: 'coins',   label: 'Coin Cards',  icon: '🪙' },
  { id: 'order',   label: 'Turn Order',  icon: '↻' },
]

interface PlayerDraft {
  faction?: string
  troopSlot?: number   // index into troopSlots
  coinSlot?: number    // index into coinSlots
  orderSlot?: number   // 1-based turn position
}

function hexToRgb(hex: number): string {
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}


export default function DraftSetupScreen({ playerOrder, existingAbilities, legacy = null, aiPlayerIds, onDraftComplete }: Props) {
  const players = playerOrder.map(id => MOCK_PLAYERS.find(p => p.id === id)!).filter(Boolean)
  const n = players.length
  const factions = availableFactions(legacy)
  const troops = troopSlots(n)
  const coins  = coinSlots(n)

  const [picks, setPicks] = useState<Record<string, PlayerDraft>>({})
  const [pickerIdx, setPickerIdx] = useState(0)
  const [expandedFaction, setExpandedFaction] = useState<string | null>(null)
  // Lead faction — most campaign wins, none when two or more tie. Worth knowing
  // while drafting: it picks the starting mission and opens holding the World
  // Capital, so taking it (or denying it) is a real draft decision.
  const leadFaction = leadFactionId(legacy?.victoryLog)
  const factionWins = factionWinCounts(legacy?.victoryLog)
  const [weaknessPicks, setWeaknessPicks] = useState<Record<string, string>>({})  // factionId → powerId
  const [weaknessPendingId, setWeaknessPendingId] = useState<string | null>(null) // playerId choosing a weakness
  const [phase, setPhase] = useState<'draft' | 'territory'>('draft')
  const [territoryPicks, setTerritoryPicks] = useState<Record<string, string>>({})
  const [territoryIdx, setTerritoryIdx] = useState(0)

  const pickCount = (pid: string) => {
    const d = picks[pid] ?? {}
    return (d.faction ? 1 : 0) + (d.troopSlot !== undefined ? 1 : 0) + (d.coinSlot !== undefined ? 1 : 0) + (d.orderSlot !== undefined ? 1 : 0)
  }
  const allDone = players.every(p => pickCount(p.id) >= 4)
  const currentPicker = players[pickerIdx]

  /** Final turn order: sorted by drafted turn position */
  const finalOrderIds = () =>
    [...players].sort((a, b) => (picks[a.id]?.orderSlot ?? 99) - (picks[b.id]?.orderSlot ?? 99)).map(p => p.id)

  function advancePicker(nextPicks: Record<string, PlayerDraft>) {
    setExpandedFaction(null)
    // Next player (cyclic, draft order) who still needs picks
    for (let step = 1; step <= players.length; step++) {
      const idx = (pickerIdx + step) % players.length
      const d = nextPicks[players[idx].id] ?? {}
      const count = (d.faction ? 1 : 0) + (d.troopSlot !== undefined ? 1 : 0) + (d.coinSlot !== undefined ? 1 : 0) + (d.orderSlot !== undefined ? 1 : 0)
      if (count < 4) { setPickerIdx(idx); return }
    }
    // Everyone finished — territory selection proceeds in drafted turn order
    setPhase('territory')
    setTerritoryIdx(0)
  }

  function claim(listId: DraftListId, value: string | number) {
    if (!currentPicker || weaknessPendingId) return
    const me = picks[currentPicker.id] ?? {}
    const next = { ...picks }
    if (listId === 'faction') {
      if (me.faction) return
      next[currentPicker.id] = { ...me, faction: value as string }
      setPicks(next)
      if (needsWeaknessPower(value as string, legacy)) {
        if (aiPlayerIds?.has(currentPicker.id)) {
          // The computer accepts the first unclaimed weakness — the draft never pauses.
          const taken = new Set([...Object.values(weaknessPicks), ...Object.values(legacy?.alienWeaknessPowers ?? {})])
          const pick = WEAKNESS_POWERS.find(p => !taken.has(p.id))
          if (pick) setWeaknessPicks(prev => ({ ...prev, [value as string]: pick.id }))
        } else {
          setWeaknessPendingId(currentPicker.id)  // pause the draft for the weakness pick
          return
        }
      }
    } else if (listId === 'troops') {
      if (me.troopSlot !== undefined) return
      next[currentPicker.id] = { ...me, troopSlot: value as number }
      setPicks(next)
    } else if (listId === 'coins') {
      if (me.coinSlot !== undefined) return
      next[currentPicker.id] = { ...me, coinSlot: value as number }
      setPicks(next)
    } else {
      if (me.orderSlot !== undefined) return
      next[currentPicker.id] = { ...me, orderSlot: value as number }
      setPicks(next)
    }
    advancePicker(next)
  }

  function handleWeaknessPick(powerId: string) {
    const pid = weaknessPendingId
    if (!pid) return
    const fid = picks[pid]?.faction
    if (fid) setWeaknessPicks(prev => ({ ...prev, [fid]: powerId }))
    setWeaknessPendingId(null)
    advancePicker(picks)
  }

  function handleTerritoryPick(tid: string) {
    const orderIds = finalOrderIds()
    const pid = orderIds[territoryIdx]
    if (!pid) return
    const next = { ...territoryPicks, [pid]: tid }
    setTerritoryPicks(next)
    if (territoryIdx + 1 < orderIds.length) {
      setTerritoryIdx(territoryIdx + 1)
    } else {
      const setups: PlayerSetup[] = players.map(p => ({
        playerId:            p.id,
        name:                p.name,
        factionId:           picks[p.id]?.faction ?? '',
        startingTerritoryId: next[p.id] ?? '',
        startingTroops:      picks[p.id]?.troopSlot !== undefined ? troops[picks[p.id].troopSlot!] : undefined,
        startingCoins:       picks[p.id]?.coinSlot !== undefined ? coins[picks[p.id].coinSlot!] : undefined,
      }))
      onDraftComplete(setups, orderIds, existingAbilities, weaknessPicks)
    }
  }

  // ── Shared chip styling ─────────────────────────────────────────────────────
  function chip(claimedBy: string | null, clickable: boolean, sel = false) {
    const claimant = claimedBy ? players.find(p => p.id === claimedBy) : null
    const col = claimant ? hexToRgb(FACTION_COLORS[picks[claimant.id]?.faction ?? claimant.factionId] ?? 0x888888) : null
    return {
      padding: '8px 12px', borderRadius: 7, fontFamily: 'Georgia, serif', fontSize: 12,
      textAlign: 'left' as const, width: '100%', display: 'flex', alignItems: 'center', gap: 8,
      border: claimant ? `1.5px solid ${col}66` : clickable ? '1.5px solid rgba(200,148,10,0.55)' : '1px solid rgba(100,75,25,0.20)',
      background: claimant ? `${'rgba(0,0,0,0.30)'}` : clickable ? 'rgba(200,148,10,0.10)' : 'rgba(0,0,0,0.20)',
      color: claimant ? '#7a6a50' : clickable ? '#E8DCC8' : '#5a4a30',
      cursor: clickable ? 'pointer' : 'default',
      opacity: claimant ? 0.75 : 1,
      boxShadow: sel ? '0 0 8px rgba(200,148,10,0.4)' : 'none',
    }
  }

  function claimTag(claimedBy: string | null) {
    if (!claimedBy) return null
    const p = players.find(pl => pl.id === claimedBy)
    if (!p) return null
    const col = hexToRgb(FACTION_COLORS[picks[p.id]?.faction ?? p.factionId] ?? 0x888888)
    return <span style={{ marginLeft: 'auto', fontSize: 10, color: col, fontWeight: 'bold' }}>✓ {p.name}</span>
  }

  // ── Territory phase — place HQ on the map (own cities only) ──────────────────
  if (phase === 'territory') {
    const orderIds = finalOrderIds()
    const pid = orderIds[territoryIdx]
    const player = players.find(p => p.id === pid)
    const factionId = player ? picks[player.id]?.faction ?? '' : ''
    const color = hexToRgb(FACTION_COLORS[factionId] ?? 0x888888)
    const placedHQs = Object.entries(territoryPicks).map(([ppid, tid]) => {
      const p = players.find(pl => pl.id === ppid)!
      return { playerId: ppid, playerName: p.name, factionId: picks[ppid]?.faction ?? p.factionId, territoryId: tid }
    })
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#0a0600',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Georgia, serif', color: '#e8dcc8',
        padding: '12px 16px', boxSizing: 'border-box', gap: 10,
      }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#8a5a20', letterSpacing: 3, textTransform: 'uppercase' }}>
            Draft Phase — Place Your HQ
          </div>
          <h1 style={{ fontSize: 22, color: '#e8c060', margin: '4px 0 2px' }}>Claim Your Starting Territory</h1>
          <div style={{ fontSize: 12, color: '#7a6040' }}>
            <strong style={{ color }}>{player?.name}</strong>
            {' '}(turn position {picks[pid ?? '']?.orderSlot}) — place your HQ on one of your cities
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {player && (
            <HQMapPicker
              currentPlayer={{ id: player.id, name: player.name, factionId }}
              placedHQs={placedHQs}
              legacy={legacy}
              onConfirm={handleTerritoryPick}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Draft phase ─────────────────────────────────────────────────────────────
  const myPicks = currentPicker ? (picks[currentPicker.id] ?? {}) : {}
  const pickerColor = currentPicker
    ? hexToRgb(FACTION_COLORS[myPicks.faction ?? currentPicker.factionId] ?? 0x888888)
    : '#C8940A'

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0600',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif', color: '#e8dcc8', padding: '24px 0',
    }}>
      <div style={{ width: 720, maxWidth: '96vw' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#8a5a20', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
            Improved Draft
          </div>
          <h1 style={{ fontSize: 28, color: '#e8c060', margin: '0 0 6px' }}>Draft Your Advantages</h1>
          <p style={{ fontSize: 13, color: '#7a6040', margin: 0 }}>
            Highest dice roll drafts first. On your turn, claim <strong style={{ color: '#c8a860' }}>one item</strong> from
            any list you haven't drafted from — until everyone holds one of each.
          </p>
        </div>

        {/* Player status row */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          {players.map((p, i) => {
            const isCurrent = i === pickerIdx && !allDone
            const count = pickCount(p.id)
            const col = hexToRgb(FACTION_COLORS[picks[p.id]?.faction ?? p.factionId] ?? 0x888888)
            return (
              <div key={p.id} style={{
                padding: '6px 14px', borderRadius: 20,
                border: isCurrent ? `1.5px solid ${col}` : '1px solid #3a2a10',
                background: isCurrent ? `${col.replace('rgb', 'rgba').replace(')', ',0.12)')}` : count >= 4 ? '#1a1206' : '#0d0800',
                fontSize: 12,
                color: isCurrent ? '#E8DCC8' : count >= 4 ? '#5a4020' : '#4a3818',
              }}>
                {p.name} · {count}/4{count >= 4 ? ' ✓' : ''}{isCurrent ? ' ← drafting' : ''}
              </div>
            )
          })}
        </div>

        {/* Current picker banner */}
        {currentPicker && !allDone && (
          <div style={{
            textAlign: 'center', marginBottom: 18, padding: '8px 16px', borderRadius: 8,
            background: `${pickerColor.replace('rgb', 'rgba').replace(')', ',0.10)')}`,
            border: `1.5px solid ${pickerColor.replace('rgb', 'rgba').replace(')', ',0.50)')}`,
            fontSize: 13,
          }}>
            <strong style={{ color: pickerColor }}>{currentPicker.name}</strong>
            <span style={{ color: '#9a8060' }}> — pick one item from any remaining list</span>
          </div>
        )}

        {/* Draft lists — 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {DRAFT_LISTS.map(list => {
            const iDrafted = currentPicker ? (
              list.id === 'faction' ? !!myPicks.faction :
              list.id === 'troops'  ? myPicks.troopSlot !== undefined :
              list.id === 'coins'   ? myPicks.coinSlot !== undefined :
              myPicks.orderSlot !== undefined
            ) : true
            return (
              <div key={list.id} style={{
                background: 'linear-gradient(155deg, #140a02 0%, #0a0500 100%)',
                border: `1px solid ${iDrafted ? 'rgba(100,75,25,0.25)' : 'rgba(200,148,10,0.45)'}`,
                borderRadius: 12, padding: '14px 16px',
                opacity: iDrafted ? 0.65 : 1,
              }}>
                <div style={{
                  fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
                  color: iDrafted ? '#5a4020' : '#c8a860', marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {list.icon} {list.label}
                  {iDrafted && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#4a3818' }}>drafted ✓</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

                  {/* Factions — parchment buttons with black names; click to expand powers */}
                  {list.id === 'faction' && factions.map(fid => {
                    const claimedBy = players.find(p => picks[p.id]?.faction === fid)?.id ?? null
                    const clickable = !claimedBy && !iDrafted
                    const rgb = hexToRgb(FACTION_COLORS[fid] ?? 0x888888)
                    const expanded = expandedFaction === fid && clickable
                    return (
                      <div key={fid}>
                        <button
                          disabled={!claimedBy && !clickable}
                          onClick={() => clickable && setExpandedFaction(expanded ? null : fid)}
                          style={{
                            ...chip(claimedBy, clickable, expanded),
                            background: claimedBy ? 'rgba(0,0,0,0.30)' : expanded ? '#F4EAD2' : '#E8DCC8',
                            color: claimedBy ? '#7a6a50' : '#111',
                            fontWeight: 'bold',
                            borderRadius: expanded ? '7px 7px 0 0' : 7,
                          }}>
                          <span style={{ width: 11, height: 11, borderRadius: '50%', background: rgb, flexShrink: 0, border: '1px solid rgba(0,0,0,0.35)' }} />
                          {FACTION_NAMES[fid]}
                          {fid === legacy?.nuclearBringerFactionId && (
                            <span title="Bringer of Nuclear Fire" style={{ fontSize: 12, color: '#c0392b', fontWeight: 'bold' }}>☢</span>
                          )}
                          {fid === leadFaction && (
                            <span
                              title={`Lead faction — the most campaign wins (${factionWins[fid] ?? 0}). Picks the starting face-up mission, and begins each game owning the World Capital with ${LEAD_FACTION_WORLD_CAPITAL_TROOPS} troops.`}
                              style={{
                                fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5,
                                color: '#7a5c00', background: 'rgba(212,175,55,0.55)',
                                border: '1px solid rgba(140,110,20,0.75)', borderRadius: 4,
                                padding: '1px 5px', flexShrink: 0,
                              }}>
                              ⌃ LEAD
                            </span>
                          )}
                          {claimedBy ? claimTag(claimedBy) : (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6a5a3a' }}>{expanded ? '▲' : 'ⓘ powers'}</span>
                          )}
                        </button>

                        {/* Expanded power panel */}
                        {expanded && (
                          <div style={{
                            border: `1.5px solid ${rgb}66`, borderTop: 'none', borderRadius: '0 0 7px 7px',
                            background: 'rgba(10,6,2,0.96)', padding: '10px 12px 12px',
                          }}>
                            {factionPowers(fid, legacy, existingAbilities).map((pw, i) => (
                              <div key={i} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 9, color: pw.color, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
                                  {pw.label}{pw.name ? ` · ${pw.name}` : ''}
                                </div>
                                <div style={{ fontSize: 10.5, color: '#b8a880', lineHeight: 1.45 }}>{pw.description}</div>
                              </div>
                            ))}
                            <button
                              onClick={() => claim('faction', fid)}
                              style={{
                                width: '100%', marginTop: 4, padding: '8px', borderRadius: 6,
                                background: rgb, border: `1.5px solid ${rgb}`, color: '#fff',
                                fontWeight: 'bold', fontSize: 12, cursor: 'pointer', fontFamily: 'Georgia, serif',
                              }}>
                              Confirm {FACTION_NAMES[fid]}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Troops */}
                  {list.id === 'troops' && troops.map((v, slot) => {
                    const claimedBy = players.find(p => picks[p.id]?.troopSlot === slot)?.id ?? null
                    const clickable = !claimedBy && !iDrafted
                    return (
                      <button key={slot} disabled={!clickable} onClick={() => claim('troops', slot)} style={chip(claimedBy, clickable)}>
                        ⚔ {v} starting troops
                        {claimTag(claimedBy)}
                      </button>
                    )
                  })}

                  {/* Coin cards */}
                  {list.id === 'coins' && coins.map((v, slot) => {
                    const claimedBy = players.find(p => picks[p.id]?.coinSlot === slot)?.id ?? null
                    const clickable = !claimedBy && !iDrafted
                    return (
                      <button key={slot} disabled={!clickable} onClick={() => claim('coins', slot)} style={chip(claimedBy, clickable)}>
                        🪙 {v} coin card{v !== 1 ? 's' : ''}
                        {claimTag(claimedBy)}
                      </button>
                    )
                  })}

                  {/* Turn order */}
                  {list.id === 'order' && Array.from({ length: n }, (_, i) => i + 1).map(pos => {
                    const claimedBy = players.find(p => picks[p.id]?.orderSlot === pos)?.id ?? null
                    const clickable = !claimedBy && !iDrafted
                    return (
                      <button key={pos} disabled={!clickable} onClick={() => claim('order', pos)} style={chip(claimedBy, clickable)}>
                        ↻ {pos === 1 ? '1st' : pos === 2 ? '2nd' : pos === 3 ? '3rd' : `${pos}th`} to play
                        {claimTag(claimedBy)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Weakness power pick — pauses the draft after claiming a weakened faction */}
        {weaknessPendingId && (() => {
          const p = players.find(pl => pl.id === weaknessPendingId)
          const fid = p ? picks[p.id]?.faction ?? '' : ''
          return (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,2,0,0.88)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 520, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
                background: 'linear-gradient(155deg, #140a02 0%, #0a0500 100%)',
                border: '1px solid rgba(240,192,0,0.45)', borderRadius: 14, padding: '24px 28px',
              }}>
                <WeaknessPowerPicker
                  playerName={p?.name ?? ''}
                  factionName={FACTION_NAMES[fid] ?? fid}
                  takenPowerIds={new Set([
                    ...Object.values(weaknessPicks),
                    ...Object.values(legacy?.alienWeaknessPowers ?? {}),
                  ])}
                  onPick={handleWeaknessPick}
                />
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

