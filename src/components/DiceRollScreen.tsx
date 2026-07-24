import { useState } from 'react'
import { MOCK_PLAYERS } from '@/data/mockGameState'

interface Props {
  /** The selected roster, in seating order (2–5 players) */
  playerIds: string[]
  onOrderDetermined: (playerIds: string[]) => void
}

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function roll(): number { return Math.floor(Math.random() * 6) + 1 }

function factionColor(factionId: string): string {
  const MAP: Record<string, string> = {
    'enclave-of-the-bear': '#e74c3c',
    'imperial-balkania':   '#2980b9',
    'khan-industries':     '#27ae60',
    'saharan-republic':    '#f39c12',
    'die-mechaniker':      '#8e44ad',
  }
  return MAP[factionId] ?? '#888'
}

export default function DiceRollScreen({ playerIds, onOrderDetermined }: Props) {
  const players = playerIds
    .map(id => MOCK_PLAYERS.find(p => p.id === id))
    .filter((p): p is (typeof MOCK_PLAYERS)[number] => !!p)
  const [rolls, setRolls] = useState<Record<string, number>>({})
  const [rolling, setRolling] = useState<string | null>(null)

  const allRolled = players.every(p => rolls[p.id] !== undefined)

  // Check for ties and re-roll them
  const sortedByRoll = [...players].sort((a, b) => (rolls[b.id] ?? 0) - (rolls[a.id] ?? 0))
  const topRoll = rolls[sortedByRoll[0]?.id] ?? 0
  const tied = topRoll > 0 && sortedByRoll.filter(p => (rolls[p.id] ?? 0) === topRoll).length > 1

  function handleRoll(playerId: string) {
    setRolling(playerId)
    // Animate briefly
    let count = 0
    const interval = setInterval(() => {
      setRolls(prev => ({ ...prev, [playerId]: roll() }))
      count++
      if (count >= 6) {
        clearInterval(interval)
        setRolling(null)
      }
    }, 80)
  }

  function handleRollAll() {
    const toRoll = players.filter(p => rolls[p.id] === undefined)
    if (toRoll.length === 0) return
    // Animate all simultaneously without serializing through rolling state
    toRoll.forEach(p => {
      let count = 0
      const interval = setInterval(() => {
        setRolls(prev => ({ ...prev, [p.id]: roll() }))
        count++
        if (count >= 6) clearInterval(interval)
      }, 80)
    })
  }

  function handleRerollTies() {
    const tiedIds = sortedByRoll.filter(p => (rolls[p.id] ?? 0) === topRoll).map(p => p.id)
    const next = { ...rolls }
    for (const id of tiedIds) delete next[id]
    setRolls(next)
    setTimeout(() => {
      for (const id of tiedIds) handleRoll(id)
    }, 100)
  }

  function handleContinue() {
    const ordered = [...players].sort((a, b) => (rolls[b.id] ?? 0) - (rolls[a.id] ?? 0))
    onOrderDetermined(ordered.map(p => p.id))
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
        borderRadius: 14, padding: '32px 40px 28px',
        width: 520, maxWidth: '94vw',
        color: '#E8DCC8',
        boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 'bold', color: '#C8940A', letterSpacing: 2 }}>
            🎲 ROLL FOR FIRST
          </div>
          <div style={{ fontSize: 12, color: '#7a6040', marginTop: 6 }}>
            Highest roll goes first · Ties re-roll
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {players.map(p => {
            const r = rolls[p.id]
            const isRolling = rolling === p.id
            const color = factionColor(p.factionId)
            const isTop = allRolled && r === topRoll
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', borderRadius: 8,
                background: isTop && !tied ? 'rgba(200,148,10,0.10)' : 'rgba(0,0,0,0.30)',
                border: `1.5px solid ${isTop && !tied ? 'rgba(200,148,10,0.55)' : 'rgba(100,75,25,0.22)'}`,
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: color, flexShrink: 0,
                  boxShadow: `0 0 6px ${color}`,
                }} />
                <div style={{ flex: 1, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 36, width: 44, textAlign: 'center', lineHeight: 1 }}>
                  {r ? DICE_FACES[r] : '·'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 'bold', width: 24, color: isTop && !tied ? '#C8940A' : '#7a6040' }}>
                  {r ?? ''}
                </div>
                <button
                  onClick={() => handleRoll(p.id)}
                  disabled={!!rolling || (r !== undefined && !tied)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 11,
                    border: '1px solid rgba(200,148,10,0.40)',
                    background: 'rgba(200,148,10,0.12)',
                    color: '#C8940A', cursor: (rolling || (r !== undefined && !tied)) ? 'not-allowed' : 'pointer',
                    opacity: (rolling || (r !== undefined && !tied)) ? 0.45 : 1,
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {isRolling ? '…' : r !== undefined ? '✓' : 'Roll'}
                </button>
              </div>
            )
          })}
        </div>

        {!allRolled && (
          <button
            onClick={handleRollAll}
            disabled={!!rolling}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid rgba(200,148,10,0.55)',
              background: 'rgba(200,148,10,0.15)', color: '#E8DCC8',
              cursor: rolling ? 'not-allowed' : 'pointer',
              fontFamily: 'Georgia, serif', marginBottom: 8,
            }}
          >
            🎲 Roll All
          </button>
        )}

        {allRolled && tied && (
          <button
            onClick={handleRerollTies}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid rgba(231,76,60,0.55)',
              background: 'rgba(231,76,60,0.12)', color: '#E8DCC8',
              cursor: 'pointer', fontFamily: 'Georgia, serif', marginBottom: 8,
            }}
          >
            ⚠ Tie — Re-roll tied players
          </button>
        )}

        {allRolled && !tied && (
          <>
            <div style={{
              fontSize: 11, color: '#6a5030', letterSpacing: 1.2, textTransform: 'uppercase',
              borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 6, marginBottom: 10,
            }}>
              Turn Order
            </div>
            {[...players].sort((a, b) => (rolls[b.id] ?? 0) - (rolls[a.id] ?? 0)).map((p, i) => (
              <div key={p.id} style={{ fontSize: 12, color: '#b09060', marginBottom: 4 }}>
                {i + 1}. {p.name}
              </div>
            ))}
            <button
              onClick={handleContinue}
              style={{
                width: '100%', padding: '13px', borderRadius: 8, fontSize: 14,
                fontWeight: 'bold', border: '2px solid rgba(200,148,10,0.70)',
                background: 'rgba(200,148,10,0.18)', color: '#E8DCC8',
                cursor: 'pointer', fontFamily: 'Georgia, serif', marginTop: 16,
              }}
            >
              ▶ Continue to Setup
            </button>
          </>
        )}
      </div>
    </div>
  )
}
