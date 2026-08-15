import { useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import { FACTION_COLORS } from '@/data/mockGameState'
import { factionPowers } from '@/lib/factionPowers'
import {
  type SetupDoc, type DraftList,
  DRAFT_TROOP_SLOTS, DRAFT_COIN_SLOTS, draftClaimant, draftListOpen, draftPickCount,
} from '@/lib/setupFlow'
import { leadFactionId, factionWinCounts, LEAD_FACTION_WORLD_CAPITAL_TROOPS } from '@/lib/gameLogic'
import { FACTION_NAMES, availableFactions } from './FactionChoicePanels'

const LISTS: Array<{ id: DraftList; label: string; icon: string }> = [
  { id: 'faction', label: 'Factions',   icon: '⚑' },
  { id: 'troops',  label: 'Troops',     icon: '⚔' },
  { id: 'coins',   label: 'Coin Cards', icon: '🪙' },
  { id: 'order',   label: 'Turn Order', icon: '↻' },
]

function hexToRgb(hex: number): string {
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}
const alpha = (rgb: string, a: number) => rgb.replace('rgb', 'rgba').replace(')', `,${a})`)

/**
 * The draft board, rendered from the shared setup document.
 *
 * Deliberately the hotseat board's screen — same 2×2 grid, same parchment
 * faction rows, same powers dropdown — because it is the same draft and the
 * table should not have to learn a second one. What differs is only who may
 * click: the hotseat board hands every turn to one keyboard, this one hands
 * each player their own turn and shows everyone else the same board while they
 * wait.
 *
 * Reading a faction's powers is NOT gated on it being your turn. Deciding what
 * to take when your turn comes is most of the draft, and the hotseat board
 * only refused because the one person clicking was always the person picking.
 */
export default function OnlineDraftBoard({
  doc, legacy, actor, iAct, minePids, seatName, isAI, onClaim,
}: {
  doc: SetupDoc
  legacy: LegacyState
  /** Whose claim it is. */
  actor: string
  /** Does THIS machine speak for the actor? */
  iAct: boolean
  minePids: string[]
  seatName: (pid: string) => string
  isAI: (pid: string) => boolean
  onClaim: (value: string) => void
}) {
  const [expandedFaction, setExpandedFaction] = useState<string | null>(null)

  const order = doc.order ?? []
  const n = order.length
  const troops = DRAFT_TROOP_SLOTS(n)
  const coins = DRAFT_COIN_SLOTS(n)
  const factions = availableFactions(legacy)
  const leadFaction = leadFactionId(legacy.victoryLog)
  const factionWins = factionWinCounts(legacy.victoryLog)

  const factionOf = (pid: string) => doc.factions[pid] ?? ''
  const colorOf = (pid: string) => hexToRgb(FACTION_COLORS[factionOf(pid) as keyof typeof FACTION_COLORS] ?? 0x888888)
  const pickerColor = colorOf(actor)

  /** Claimable = our turn, a list we still owe, and nobody holds this item. */
  const canClaim = (list: DraftList) => iAct && draftListOpen(doc, actor, list)

  function chip(claimedBy: string | null, clickable: boolean, sel = false): React.CSSProperties {
    const col = claimedBy ? colorOf(claimedBy) : null
    return {
      padding: '8px 12px', borderRadius: 7, fontFamily: 'Georgia, serif', fontSize: 12,
      textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 8,
      border: col ? `1.5px solid ${alpha(col, 0.4)}`
        : clickable ? '1.5px solid rgba(200,148,10,0.55)' : '1px solid rgba(100,75,25,0.20)',
      background: claimedBy ? 'rgba(0,0,0,0.30)' : clickable ? 'rgba(200,148,10,0.10)' : 'rgba(0,0,0,0.20)',
      color: claimedBy ? '#7a6a50' : clickable ? '#E8DCC8' : '#5a4a30',
      cursor: clickable ? 'pointer' : 'default',
      opacity: claimedBy ? 0.75 : 1,
      boxShadow: sel ? '0 0 8px rgba(200,148,10,0.4)' : 'none',
    }
  }

  function claimTag(claimedBy: string | null) {
    if (!claimedBy) return null
    return (
      <span style={{ marginLeft: 'auto', fontSize: 10, color: colorOf(claimedBy), fontWeight: 'bold' }}>
        ✓ {seatName(claimedBy)}
      </span>
    )
  }

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
          {order.map(pid => {
            const isCurrent = pid === actor
            const count = draftPickCount(doc, pid)
            const col = colorOf(pid)
            return (
              <div key={pid} style={{
                padding: '6px 14px', borderRadius: 20,
                border: isCurrent ? `1.5px solid ${col}` : '1px solid #3a2a10',
                background: isCurrent ? alpha(col, 0.12) : count >= 4 ? '#1a1206' : '#0d0800',
                fontSize: 12,
                color: isCurrent ? '#E8DCC8' : count >= 4 ? '#5a4020' : '#4a3818',
              }}>
                {seatName(pid)}
                {minePids.includes(pid) && <span style={{ color: '#6a5030' }}> (you)</span>}
                {' · '}{count}/4{count >= 4 ? ' ✓' : ''}{isCurrent ? ' ← drafting' : ''}
              </div>
            )
          })}
        </div>

        {/* Current picker banner */}
        <div style={{
          textAlign: 'center', marginBottom: 18, padding: '8px 16px', borderRadius: 8,
          background: alpha(pickerColor, 0.10),
          border: `1.5px solid ${alpha(pickerColor, 0.50)}`,
          fontSize: 13,
        }}>
          <strong style={{ color: pickerColor }}>{seatName(actor)}</strong>
          <span style={{ color: '#9a8060' }}>
            {iAct
              ? (isAI(actor)
                ? ' — the computer’s pick: choose one item from any remaining list'
                : ' — pick one item from any remaining list')
              : ' is drafting — you can still open a faction to read its powers'}
          </span>
        </div>

        {/* Draft lists — 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {LISTS.map(list => {
            const iDrafted = !canClaim(list.id)
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
                  {iAct && !draftListOpen(doc, actor, list.id) && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: '#4a3818' }}>drafted ✓</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

                  {/* Factions — parchment buttons; click to expand the powers */}
                  {list.id === 'faction' && factions.map(fid => {
                    const claimedBy = draftClaimant(doc, 'faction', fid)
                    const clickable = !claimedBy && canClaim('faction')
                    const rgb = hexToRgb(FACTION_COLORS[fid as keyof typeof FACTION_COLORS] ?? 0x888888)
                    // Anyone may read any faction's powers, at any time — only
                    // CONFIRMING is gated on the turn.
                    const expanded = expandedFaction === fid && !claimedBy
                    return (
                      <div key={fid}>
                        <button
                          onClick={() => setExpandedFaction(expanded ? null : fid)}
                          disabled={!!claimedBy}
                          style={{
                            ...chip(claimedBy, clickable, expanded),
                            background: claimedBy ? 'rgba(0,0,0,0.30)' : expanded ? '#F4EAD2' : '#E8DCC8',
                            color: claimedBy ? '#7a6a50' : '#111',
                            fontWeight: 'bold',
                            cursor: claimedBy ? 'default' : 'pointer',
                            borderRadius: expanded ? '7px 7px 0 0' : 7,
                          }}>
                          <span style={{
                            width: 11, height: 11, borderRadius: '50%', background: rgb,
                            flexShrink: 0, border: '1px solid rgba(0,0,0,0.35)',
                          }} />
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
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6a5a3a' }}>
                              {expanded ? '▲' : 'ⓘ powers'}
                            </span>
                          )}
                        </button>

                        {/* Expanded power panel */}
                        {expanded && (
                          <div style={{
                            border: `1.5px solid ${alpha(rgb, 0.4)}`, borderTop: 'none', borderRadius: '0 0 7px 7px',
                            background: 'rgba(10,6,2,0.96)', padding: '10px 12px 12px',
                          }}>
                            {factionPowers(fid, legacy, legacy.chosenFactionAbilities ?? {}).map((pw, i) => (
                              <div key={i} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 9, color: pw.color, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
                                  {pw.label}{pw.name ? ` · ${pw.name}` : ''}
                                </div>
                                <div style={{ fontSize: 10.5, color: '#b8a880', lineHeight: 1.45 }}>{pw.description}</div>
                              </div>
                            ))}
                            {clickable ? (
                              <button
                                onClick={() => { setExpandedFaction(null); onClaim(`faction:${fid}`) }}
                                style={{
                                  width: '100%', marginTop: 4, padding: '8px', borderRadius: 6,
                                  background: rgb, border: `1.5px solid ${rgb}`, color: '#fff',
                                  fontWeight: 'bold', fontSize: 12, cursor: 'pointer', fontFamily: 'Georgia, serif',
                                }}>
                                Confirm {FACTION_NAMES[fid]}
                              </button>
                            ) : (
                              <div style={{ fontSize: 10, color: '#5a4a30', textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>
                                {draftListOpen(doc, actor, 'faction')
                                  ? `${seatName(actor)} is drafting`
                                  : 'you have already drafted a faction'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Troops */}
                  {list.id === 'troops' && troops.map((v, slot) => {
                    const claimedBy = draftClaimant(doc, 'troops', slot)
                    const clickable = !claimedBy && canClaim('troops')
                    return (
                      <button key={slot} disabled={!clickable} onClick={() => onClaim(`troops:${slot}`)} style={chip(claimedBy, clickable)}>
                        ⚔ {v} starting troops
                        {claimTag(claimedBy)}
                      </button>
                    )
                  })}

                  {/* Coin cards */}
                  {list.id === 'coins' && coins.map((v, slot) => {
                    const claimedBy = draftClaimant(doc, 'coins', slot)
                    const clickable = !claimedBy && canClaim('coins')
                    return (
                      <button key={slot} disabled={!clickable} onClick={() => onClaim(`coins:${slot}`)} style={chip(claimedBy, clickable)}>
                        🪙 {v} coin card{v !== 1 ? 's' : ''}
                        {claimTag(claimedBy)}
                      </button>
                    )
                  })}

                  {/* Turn order */}
                  {list.id === 'order' && Array.from({ length: n }, (_, i) => i + 1).map(pos => {
                    const claimedBy = draftClaimant(doc, 'order', pos)
                    const clickable = !claimedBy && canClaim('order')
                    return (
                      <button key={pos} disabled={!clickable} onClick={() => onClaim(`order:${pos}`)} style={chip(claimedBy, clickable)}>
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
      </div>
    </div>
  )
}
