/**
 * Family Atomics: the Wall brought down, eyes open.
 *
 * Played in the beat between the storm's calculation and its move, by a
 * seat in reach of the Shield Wall. The panel shows the calculated reach —
 * that number is the whole decision — and says plainly what the detonation
 * costs: everything standing on the Wall dies with it, the detonator's own
 * forces included, and the card leaves the game for good.
 */
import { TreacheryCardFace } from './TreacheryCardFace'
import { TREACHERY_CARDS } from '@/data/dune/treachery'

export interface AtomicsPanelProps {
  /** The storm's calculated reach, already public. */
  onPlay: () => void
  onClose: () => void
  busy?: boolean
  refusal?: string | null
}

const REFUSAL_TEXT: Record<string, string> = {
  'no-window': 'The storm is not between its beats.',
  'already-detonated': 'The Wall is already down.',
  'not-in-reach': 'You have no force on the Shield Wall or beside it with a clear way in.',
  'card-not-held': 'You do not hold Family Atomics.',
  'stale': 'The table moved first — try again.',
}

export function AtomicsPanel({ onPlay, onClose, busy = false, refusal = null }: AtomicsPanelProps) {
  return (
    <div data-layer="atomics-panel" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: '#000000a0', zIndex: 1100,
    }}>
      <div style={{
        width: 430, maxWidth: '92%',
        background: '#131c2e', color: '#f0e2bb', borderRadius: 8,
        border: '1px solid #f0e2bb44', padding: '14px 16px',
        font: '14px Georgia, serif',
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {(() => {
            const c = TREACHERY_CARDS.find(x => x.id === 'familyatomics')
            return c ? <TreacheryCardFace card={c} width={92} /> : null
          })()}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <b style={{ fontSize: 16 }}>Family Atomics</b>
              <span style={{ flex: 1 }} />
              <button type="button" data-atomics-close="" onClick={onClose}
                style={{ background: 'none', border: 'none', color: '#f0e2bb', cursor: 'pointer', fontSize: 15 }}>
                ✕
              </button>
            </div>
            <p style={{ margin: '4px 0 0', opacity: 0.75, fontSize: 12.5 }}>
              {/* NO NUMBER TO WEIGH IT AGAINST, and the panel says so rather
                  than leaving a player to wonder where it went. The printed
                  card is played after the storm is calculated; here it is
                  played at the Pause, before anything is rolled. */}
              <b data-atomics-blind="">The coming storm has not been rolled.</b>
              {' '}Detonate now and the Shield Wall is down before it moves:
              Arrakeen, Carthag and the Imperial Basin lie open to every storm
              for the rest of the game — starting with next turn's.
            </p>
          </div>
        </div>

        <p style={{ marginTop: 10, color: '#e8a0a0', fontSize: 12.5 }}>
          Every force standing on the Shield Wall is destroyed — yours
          included — and the card is removed from play, never reshuffled.
        </p>

        {refusal && (
          <p data-atomics-refusal={refusal} style={{ color: '#e8b04b', marginTop: 6 }}>
            {REFUSAL_TEXT[refusal] ?? `Refused: ${refusal}`}
          </p>
        )}

        <div style={{ marginTop: 10 }}>
          <button type="button" data-atomics-play="" disabled={busy} onClick={onPlay}
            style={{
              padding: '6px 16px', borderRadius: 4, border: 'none',
              cursor: 'pointer', background: '#c9542a', color: '#fff',
            }}>
            Detonate — the Wall comes down
          </button>
        </div>
      </div>
    </div>
  )
}
