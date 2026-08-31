/**
 * Hajr: one extra on-planet movement, confirmed before it is spent.
 *
 * The card itself has nothing to configure — the extra move is made on the
 * board like any other — but a card should not leave the hand on a stray
 * click, so playing it is a deliberate press with the card's face beside
 * it. The server holds the turn open for the movement the card owes.
 */
import { TreacheryCardFace } from './TreacheryCardFace'
import { TREACHERY_CARDS } from '@/data/dune/treachery'

export interface HajrPanelProps {
  onPlay: () => void
  onClose: () => void
  busy?: boolean
  refusal?: string | null
}

const REFUSAL_TEXT: Record<string, string> = {
  'wrong-phase': 'The turn is not at shipment and movement.',
  'not-your-turn': 'The moment for Hajr has passed — it rides your own turn, before your move.',
  'already-played': 'Hajr is already in play this turn.',
  'card-not-held': 'You do not hold Hajr.',
  'stale': 'The table moved first — try again.',
}

export function HajrPanel({ onPlay, onClose, busy = false, refusal = null }: HajrPanelProps) {
  return (
    <div data-layer="hajr-panel" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: '#000000a0', zIndex: 1100,
    }}>
      <div style={{
        width: 400, maxWidth: '92%',
        background: '#131c2e', color: '#f0e2bb', borderRadius: 8,
        border: '1px solid #f0e2bb44', padding: '14px 16px',
        font: '14px Georgia, serif',
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {(() => {
            const c = TREACHERY_CARDS.find(x => x.id === 'hajr')
            return c ? <TreacheryCardFace card={c} width={92} /> : null
          })()}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <b style={{ fontSize: 16 }}>Hajr</b>
              <span style={{ flex: 1 }} />
              <button type="button" data-hajr-close="" onClick={onClose}
                style={{ background: 'none', border: 'none', color: '#f0e2bb', cursor: 'pointer', fontSize: 15 }}>
                ✕
              </button>
            </div>
            <p style={{ margin: '4px 0 0', opacity: 0.75, fontSize: 12.5 }}>
              An extra on-planet movement this turn, under the normal movement
              rules — the same group you already moved, or another. Your turn
              stays open until you have made it.
            </p>
          </div>
        </div>
        {refusal && (
          <p data-hajr-refusal={refusal} style={{ color: '#e8b04b', marginTop: 8 }}>
            {REFUSAL_TEXT[refusal] ?? `Refused: ${refusal}`}
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <button type="button" data-hajr-play="" disabled={busy} onClick={onPlay}
            style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
            Play Hajr — the card is spent
          </button>
        </div>
      </div>
    </div>
  )
}
