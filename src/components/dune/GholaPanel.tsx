/**
 * The Tleilaxu Ghola: one free revival, chosen here.
 *
 * Two halves, exactly the card's two sentences: one of your leaders back —
 * regardless of the gate the ordinary revival waits behind — or up to five
 * forces from the Tanks to reserves, free. What is offered is only what the
 * Tanks actually hold for this seat; the server judges the play again and
 * the card is spent only when the revival lands.
 */
import { useState } from 'react'
import { TreacheryCardFace } from './TreacheryCardFace'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { GHOLA_FORCES } from '@/lib/dune/revival'

export interface GholaPanelProps {
  /** Dead, face-up leaders — the ones the card can reach. */
  leaders: readonly string[]
  /** This seat's dead forces, straight off the Tanks. */
  dead: { plain: number; starred: number }
  onLeader: (name: string) => void
  onForces: (plain: number, starred: number) => void
  onClose: () => void
  busy?: boolean
  refusal?: string | null
}

const REFUSAL_TEXT: Record<string, string> = {
  'not-in-tanks': 'That leader is not in the Tanks.',
  'face-down': 'That leader waits out the rotation, face down — the Ghola cannot reach them.',
  'nothing-there': 'The Tanks do not hold that many of your forces.',
  'nothing-asked': 'Choose something to revive.',
  'over-the-cap': `The Ghola brings back at most ${GHOLA_FORCES} forces.`,
  'card-not-held': 'You do not hold the Tleilaxu Ghola.',
  'stale': 'The table moved first — try again.',
}

const btn = {
  padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
  font: '13px Georgia, serif',
} as const

export function GholaPanel({
  leaders, dead, onLeader, onForces, onClose, busy = false, refusal = null,
}: GholaPanelProps) {
  const [plain, setPlain] = useState(Math.min(dead.plain, GHOLA_FORCES))
  const [starred, setStarred] = useState(0)
  const total = plain + starred

  const step = (which: 'plain' | 'starred', d: number) => {
    if (which === 'plain') {
      setPlain(p => Math.max(0, Math.min(dead.plain, p + d)))
    } else {
      setStarred(s => Math.max(0, Math.min(dead.starred, s + d)))
    }
  }

  return (
    <div data-layer="ghola-panel" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: '#000000a0', zIndex: 1100,
    }}>
      <div style={{
        width: 430, maxWidth: '92%', maxHeight: '86%', overflowY: 'auto',
        background: '#131c2e', color: '#f0e2bb', borderRadius: 8,
        border: '1px solid #f0e2bb44', padding: '14px 16px',
        font: '14px Georgia, serif',
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {(() => {
            const c = TREACHERY_CARDS.find(x => x.id === 'tleilaxughola')
            return c ? <TreacheryCardFace card={c} width={92} /> : null
          })()}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <b style={{ fontSize: 16 }}>Tleilaxu Ghola</b>
              <span style={{ flex: 1 }} />
              <button type="button" data-ghola-close="" onClick={onClose}
                style={{ background: 'none', border: 'none', color: '#f0e2bb', cursor: 'pointer', fontSize: 15 }}>
                ✕
              </button>
            </div>
            <p style={{ margin: '4px 0 0', opacity: 0.7, fontSize: 12 }}>
              One free revival: a leader back — the usual gate does not apply —
              or up to {GHOLA_FORCES} forces to your reserves. The card is
              spent when the revival lands.
            </p>
          </div>
        </div>

        {leaders.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>A leader, immediately:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {leaders.map(name => (
                <button key={name} type="button" data-ghola-leader={name}
                  disabled={busy} onClick={() => onLeader(name)}
                  style={btn}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {(dead.plain > 0 || dead.starred > 0) && (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              Or forces, up to {GHOLA_FORCES} — the Tanks hold {dead.plain}
              {dead.starred > 0 ? ` (and ${dead.starred}★)` : ''} of yours:
            </span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
              <span>
                <button type="button" data-ghola-minus="" disabled={busy}
                  onClick={() => step('plain', -1)} style={btn}>−</button>
                <b style={{ margin: '0 8px' }}>{plain}</b>
                <button type="button" data-ghola-plus="" disabled={busy}
                  onClick={() => step('plain', 1)} style={btn}>+</button>
              </span>
              {dead.starred > 0 && (
                <span>
                  <button type="button" disabled={busy}
                    onClick={() => step('starred', -1)} style={btn}>−</button>
                  <b style={{ margin: '0 8px' }}>{starred}★</b>
                  <button type="button" disabled={busy}
                    onClick={() => step('starred', 1)} style={btn}>+</button>
                </span>
              )}
              <button type="button" data-ghola-forces="" onClick={() => onForces(plain, starred)}
                disabled={busy || total < 1 || total > GHOLA_FORCES}
                style={{ ...btn, opacity: total >= 1 && total <= GHOLA_FORCES ? 1 : 0.5 }}>
                Revive {total} free
              </button>
            </div>
          </div>
        )}

        {leaders.length === 0 && dead.plain === 0 && dead.starred === 0 && (
          <p style={{ marginTop: 12, opacity: 0.75 }}>
            The Tanks hold nothing of yours — the Ghola has nobody to bring back.
          </p>
        )}

        {refusal && (
          <p data-ghola-refusal={refusal} style={{ color: '#e8b04b', marginTop: 8 }}>
            {REFUSAL_TEXT[refusal] ?? `Refused: ${refusal}`}
          </p>
        )}
      </div>
    </div>
  )
}
