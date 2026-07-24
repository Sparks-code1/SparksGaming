import { useState } from 'react'
import { MOCK_PLAYERS } from '@/data/mockGameState'
import type { AIDifficulty } from '@/types/ai'
import { AI_DIFFICULTY_LABEL } from '@/types/ai'

export interface SlotConfig { isAI: boolean; difficulty: AIDifficulty }

/** One configured player slot, in seating order */
export interface PlayerSlotSetup {
  playerId: string
  name: string
  isAI: boolean
  difficulty: AIDifficulty
}

interface Props {
  onConfirm: (slots: PlayerSlotSetup[]) => void
}

const DIFFS: AIDifficulty[] = ['easy', 'medium', 'hard']
const COUNTS = [2, 3, 4, 5]

/** FIRST new-game screen: pick how many players (2–5), name each one, and
 *  choose which slots are human or computer — all before the dice roll. */
export default function PlayerSlotsScreen({ onConfirm }: Props) {
  const [count, setCount] = useState(Math.min(4, MOCK_PLAYERS.length))
  const [slots, setSlots] = useState<PlayerSlotSetup[]>(() =>
    MOCK_PLAYERS.map(p => ({ playerId: p.id, name: p.name, isAI: false, difficulty: 'medium' as AIDifficulty })),
  )

  const active = slots.slice(0, count)
  const humanCount = active.filter(s => !s.isAI).length
  const allNamed = active.every(s => s.name.trim().length > 0)
  const canConfirm = humanCount >= 1 && allNamed

  const update = (playerId: string, patch: Partial<PlayerSlotSetup>) =>
    setSlots(prev => prev.map(s => (s.playerId === playerId ? { ...s, ...patch } : s)))

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: '2px solid rgba(200,148,10,0.60)', borderRadius: 14,
        padding: '28px 36px 24px', width: 680, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
        color: '#E8DCC8', boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>🎮 PLAYERS</div>
          <div style={{ fontSize: 11, color: '#7a6040', marginTop: 4 }}>
            Choose how many are playing, name each player, and set who is human or computer
          </div>
        </div>

        {/* Player count picker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: '#7a6040', letterSpacing: 1, textTransform: 'uppercase' }}>Players:</span>
          {COUNTS.map(n => {
            const activeBtn = count === n
            return (
              <button key={n}
                onClick={() => setCount(n)}
                style={{
                  width: 42, height: 42, borderRadius: 9, fontSize: 17, fontWeight: 'bold',
                  fontFamily: 'Georgia, serif', cursor: 'pointer',
                  border: `2px solid ${activeBtn ? '#C8940A' : 'rgba(200,148,10,0.25)'}`,
                  background: activeBtn ? 'rgba(200,148,10,0.22)' : 'rgba(0,0,0,0.25)',
                  color: activeBtn ? '#C8940A' : '#6a5030',
                  boxShadow: activeBtn ? '0 0 10px rgba(200,148,10,0.30)' : 'none',
                  transition: 'all 0.15s',
                }}>
                {n}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {active.map((s, i) => (
            <div key={s.playerId} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 14px', borderRadius: 8,
              background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(200,148,10,0.20)',
            }}>
              <div style={{ fontSize: 11, color: '#6a5030', width: 16, textAlign: 'center', flexShrink: 0 }}>{i + 1}</div>
              {/* Editable player name */}
              <input
                value={s.name}
                onChange={e => update(s.playerId, { name: e.target.value })}
                maxLength={20}
                placeholder={`Player ${i + 1}`}
                style={{
                  flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 6,
                  border: `1.5px solid ${s.name.trim() ? 'rgba(200,148,10,0.35)' : 'rgba(231,76,60,0.55)'}`,
                  background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                  fontSize: 14, fontWeight: 'bold', fontFamily: 'Georgia, serif',
                  outline: 'none',
                }}
              />
              {/* Human / AI toggle */}
              <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid rgba(200,148,10,0.30)', flexShrink: 0 }}>
                {(['human', 'ai'] as const).map(kind => {
                  const activeKind = (kind === 'ai') === s.isAI
                  return (
                    <button key={kind}
                      onClick={() => update(s.playerId, { isAI: kind === 'ai' })}
                      style={{
                        padding: '7px 14px', fontSize: 12, fontFamily: 'Georgia, serif', cursor: 'pointer', border: 'none',
                        background: activeKind ? (kind === 'ai' ? 'rgba(52,152,219,0.30)' : 'rgba(39,174,96,0.28)') : 'transparent',
                        color: activeKind ? '#E8DCC8' : '#7a6040', fontWeight: activeKind ? 'bold' : 'normal',
                      }}>
                      {kind === 'ai' ? '🤖 AI' : '🧑 Human'}
                    </button>
                  )
                })}
              </div>
              {/* Difficulty — only when AI */}
              <div style={{ display: 'flex', gap: 4, width: 196, justifyContent: 'flex-end', flexShrink: 0, opacity: s.isAI ? 1 : 0.25, pointerEvents: s.isAI ? 'auto' : 'none' }}>
                {DIFFS.map(d => {
                  const activeDiff = s.difficulty === d
                  return (
                    <button key={d}
                      onClick={() => update(s.playerId, { difficulty: d })}
                      style={{
                        padding: '6px 11px', fontSize: 11, borderRadius: 6, fontFamily: 'Georgia, serif', cursor: 'pointer',
                        border: `1px solid ${activeDiff ? 'rgba(52,152,219,0.7)' : 'rgba(100,80,40,0.3)'}`,
                        background: activeDiff ? 'rgba(52,152,219,0.20)' : 'transparent',
                        color: activeDiff ? '#7fb3d3' : '#6a5030',
                      }}>
                      {AI_DIFFICULTY_LABEL[d]}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {humanCount === 0 && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 11,
            background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)',
            color: '#e08070', textAlign: 'center',
          }}>
            At least one player must be human
          </div>
        )}

        <button
          onClick={() => canConfirm && onConfirm(active.map(s => ({ ...s, name: s.name.trim() })))}
          disabled={!canConfirm}
          style={{
            width: '100%', padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
            border: `2px solid ${canConfirm ? 'rgba(200,148,10,0.70)' : 'rgba(100,70,30,0.25)'}`,
            background: canConfirm ? 'rgba(200,148,10,0.16)' : 'rgba(100,70,30,0.10)',
            color: canConfirm ? '#E8DCC8' : 'rgba(150,120,80,0.35)',
            cursor: canConfirm ? 'pointer' : 'not-allowed',
            fontFamily: 'Georgia, serif', letterSpacing: 0.5,
          }}>
          Continue → Deal Scar Cards &amp; Roll for First
        </button>
      </div>
    </div>
  )
}
