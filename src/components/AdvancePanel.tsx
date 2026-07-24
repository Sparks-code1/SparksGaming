import { useState } from 'react'
import type { Territory } from '@/types/territory'

interface Props {
  src: Territory
  dst: Territory
  /** Troops lost on entry (cities, fortification, milestone modifiers) */
  entryCost?: { total: number; parts: string[]; falloutHalf?: boolean }
  onConfirm: (troops: number) => void
  onCancel: () => void
}

export default function AdvancePanel({ src, dst, entryCost, onConfirm, onCancel }: Props) {
  const max = src.troops - 1
  const [amount, setAmount] = useState(max)

  // Troops that survive entry after capture penalties (and Fallout Zone halving)
  const arriveAfterEntry = (n: number) => {
    let v = Math.max(1, n - (entryCost?.total ?? 0))
    if (entryCost?.falloutHalf) v = Math.max(1, Math.ceil(v / 2))
    return v
  }
  const hasEntryCost = !!entryCost && (entryCost.total > 0 || !!entryCost.falloutHalf)

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,2,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        fontFamily: 'Georgia, serif',
      }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div
        style={{
          background: 'linear-gradient(155deg, #1A0A00 0%, #100500 100%)',
          border: '2px solid rgba(230,126,34,0.65)',
          borderRadius: 12,
          padding: '26px 28px 22px',
          width: 380,
          maxWidth: '90vw',
          color: '#E8DCC8',
          boxShadow: '0 10px 40px rgba(0,0,0,0.80)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#E67E22', letterSpacing: 1.5 }}>
            ⚔ ADVANCE
          </div>
          <div style={{ fontSize: 12, color: '#b07a4a', marginTop: 5 }}>
            <strong style={{ color: '#F0B27A' }}>{dst.name}</strong> is undefended — move troops in
          </div>
          {hasEntryCost && (
            <div style={{
              fontSize: 11, color: '#e8a838', marginTop: 8,
              padding: '6px 10px', borderRadius: 6, display: 'inline-block',
              background: 'rgba(232,168,56,0.10)', border: '1px solid rgba(232,168,56,0.40)',
            }}>
              🏙 Entry cost{entryCost!.total > 0 ? ` −${entryCost!.total} troop${entryCost!.total !== 1 ? 's' : ''}` : ''}
              {' '}({entryCost!.parts.join(', ')})
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <TroopCard label={src.name} troops={src.troops} after={src.troops - amount} color="#E67E22" />
          <div style={{ color: '#E67E22', fontSize: 22, fontWeight: 'bold' }}>→</div>
          <TroopCard label={dst.name} troops={0} after={hasEntryCost ? arriveAfterEntry(amount) : amount} color="#F39C12" />
        </div>
        {hasEntryCost && (
          <div style={{ textAlign: 'center', fontSize: 11, color: '#e8a838', marginTop: -14, marginBottom: 18 }}>
            {amount} advancing → <strong>{arriveAfterEntry(amount)}</strong> will survive entry
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: '#7a5a3a', marginBottom: 8,
          }}>
            <span>Troops to advance</span>
            <span style={{ color: '#F0B27A', fontWeight: 'bold', fontSize: 16 }}>{amount}</span>
          </div>
          <input
            type="range"
            min={1}
            max={max}
            value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#E67E22', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5a3a1a', marginTop: 3 }}>
            <span>1</span>
            <span>{max}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, justifyContent: 'center' }}>
          {[1, Math.ceil(max / 2), max].filter((v, i, a) => v >= 1 && a.indexOf(v) === i).map(v => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 11,
                border: amount === v ? '1.5px solid #E67E22' : '1px solid rgba(230,126,34,0.25)',
                background: amount === v ? 'rgba(230,126,34,0.22)' : 'rgba(230,126,34,0.06)',
                color: amount === v ? '#F0B27A' : '#7a5a3a',
                cursor: 'pointer', fontFamily: 'Georgia, serif',
              }}
            >
              {v}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px', borderRadius: 6,
              border: '1px solid rgba(230,126,34,0.25)',
              background: 'transparent', color: '#7a5a3a',
              cursor: 'pointer', fontSize: 12, fontFamily: 'Georgia, serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(amount)}
            style={{
              flex: 2, padding: '10px', borderRadius: 6,
              border: '2px solid rgba(230,126,34,0.75)',
              background: 'rgba(230,126,34,0.22)',
              color: '#F0B27A', cursor: 'pointer',
              fontSize: 13, fontWeight: 'bold', fontFamily: 'Georgia, serif',
            }}
          >
            ⚔ Advance {amount} Troop{amount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

function TroopCard({ label, troops, after, color }: { label: string; troops: number; after: number; color: string }) {
  const changed = after !== troops
  return (
    <div
      style={{
        flex: 1, textAlign: 'center',
        background: `${color}14`, border: `1px solid ${color}44`,
        borderRadius: 8, padding: '10px 8px',
      }}
    >
      <div style={{ fontSize: 10, color, letterSpacing: 1, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 'bold', color: changed ? '#7a5a3a' : '#E8DCC8', textDecoration: changed ? 'line-through' : 'none' }}>
          {troops}
        </span>
        {changed && (
          <span style={{ fontSize: 20, fontWeight: 'bold', color }}>
            {after}
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, color: '#5a3a1a', marginTop: 2 }}>troops</div>
    </div>
  )
}
