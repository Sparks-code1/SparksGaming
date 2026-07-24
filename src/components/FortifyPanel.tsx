import { useState } from 'react'
import type { Territory } from '@/types/territory'

interface Props {
  src: Territory
  dst: Territory
  onConfirm: (troops: number) => void
  onCancel: () => void
}

export default function FortifyPanel({ src, dst, onConfirm, onCancel }: Props) {
  const max = src.troops - 1
  const [amount, setAmount] = useState(Math.max(1, Math.floor(max / 2)))

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,2,0,0.60)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        fontFamily: 'Georgia, serif',
      }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div
        style={{
          background: 'linear-gradient(155deg, #0A1A2C 0%, #040E18 100%)',
          border: '2px solid rgba(41,128,185,0.65)',
          borderRadius: 12,
          padding: '26px 28px 22px',
          width: 380,
          maxWidth: '90vw',
          color: '#E8DCC8',
          boxShadow: '0 10px 40px rgba(0,0,0,0.80)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#2980B9', letterSpacing: 1.5 }}>
            ⟳ FORTIFY
          </div>
          <div style={{ fontSize: 12, color: '#7a9ab0', marginTop: 5 }}>
            Move troops from{' '}
            <strong style={{ color: '#AED6F1' }}>{src.name}</strong>
            {' '}to{' '}
            <strong style={{ color: '#AED6F1' }}>{dst.name}</strong>
          </div>
        </div>

        {/* Territory cards */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <TroopCard label={src.name} troops={src.troops} after={src.troops - amount} color="#2980B9" />
          <div style={{ color: '#2980B9', fontSize: 22, fontWeight: 'bold' }}>→</div>
          <TroopCard label={dst.name} troops={dst.troops} after={dst.troops + amount} color="#1ABC9C" />
        </div>

        {/* Troop slider */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: '#5a7a9a', marginBottom: 8,
          }}>
            <span>Troops to move</span>
            <span style={{ color: '#AED6F1', fontWeight: 'bold', fontSize: 16 }}>{amount}</span>
          </div>
          <input
            type="range"
            min={1}
            max={max}
            value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#2980B9', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#3a5a7a', marginTop: 3 }}>
            <span>1</span>
            <span>{max}</span>
          </div>
        </div>

        {/* Quick-select buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, justifyContent: 'center' }}>
          {[1, Math.ceil(max / 2), max - 1, max].filter((v, i, a) => v >= 1 && a.indexOf(v) === i).map(v => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 11,
                border: amount === v ? '1.5px solid #2980B9' : '1px solid rgba(41,128,185,0.25)',
                background: amount === v ? 'rgba(41,128,185,0.22)' : 'rgba(41,128,185,0.06)',
                color: amount === v ? '#AED6F1' : '#4a6a8a',
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
              border: '1px solid rgba(41,128,185,0.25)',
              background: 'transparent', color: '#4a6a8a',
              cursor: 'pointer', fontSize: 12, fontFamily: 'Georgia, serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(amount)}
            style={{
              flex: 2, padding: '10px', borderRadius: 6,
              border: '2px solid rgba(41,128,185,0.75)',
              background: 'rgba(41,128,185,0.22)',
              color: '#AED6F1', cursor: 'pointer',
              fontSize: 13, fontWeight: 'bold', fontFamily: 'Georgia, serif',
            }}
          >
            ⟳ Move {amount} Troop{amount !== 1 ? 's' : ''}
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
        <span style={{ fontSize: 24, fontWeight: 'bold', color: changed ? '#7a9ab0' : '#E8DCC8', textDecoration: changed ? 'line-through' : 'none' }}>
          {troops}
        </span>
        {changed && (
          <span style={{ fontSize: 20, fontWeight: 'bold', color }}>
            {after}
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, color: '#3a5a7a', marginTop: 2 }}>troops</div>
    </div>
  )
}
