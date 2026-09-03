/**
 * Karama: both halves of the card, chosen with eyes open.
 *
 * SPEND it on one of your own uses — the two printed on the card, plus your
 * faction's own power in the advanced game — or STOP a named advantage of
 * another faction for the current phase. Either use, not both, and the card
 * is spent when the play lands. The menu is the shared law's (karamaOptions,
 * suppressibleRefs), so nothing is offered here the server would refuse on
 * principle — what remains refusable is timing, and those refusals are shown
 * in words.
 *
 * The card being spent may be a WORTHLESS one: the Bene Gesserit's advanced
 * power makes those Karamas, and the face at the top shows which card is on
 * the table.
 */
import { useState } from 'react'
import { FACTION_LOOK } from './SeatLayer'
import { TreacheryCardFace } from './TreacheryCardFace'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { karamaOptions, suppressibleRefs, stoppablePhases } from '@/lib/dune/karama'
import type { KaramaUse, KaramaUseId } from '@/lib/dune/karama'
import type { FactionId } from '@/types/Dune/Faction'
import type { GameMode, GamePhase } from '@/types/Dune/Game'

export interface KaramaPanelProps {
  seat: FactionId
  mode: GameMode
  /** The card being spent — 'karama', or a Bene Gesserit worthless. */
  cardId: string
  players: readonly { faction: FactionId }[]
  /** For the Emperor's free revival: dead face-up leaders, dead forces. */
  leaders: readonly string[]
  dead: { plain: number; starred: number }
  onUse: (cardId: string, use: KaramaUse) => void
  /** The phase the table is in, which is what a stop names unless the
   *  player picks a later one. */
  phase: GamePhase
  onStop: (
    cardId: string, target: FactionId, ref: string, phase: GamePhase,
  ) => void
  onClose: () => void
  busy?: boolean
  refusal?: string | null
}

const REFUSAL_TEXT: Record<string, string> = {
  'not-a-karama': 'That card is no Karama in your hands.',
  'not-your-power': 'That use belongs to another faction.',
  'advanced-only': 'That use exists in the advanced game alone.',
  'card-not-held': 'You do not hold that card.',
  'no-window': 'The moment for that use is not open.',
  'already-played': 'That entitlement already stands.',
  'not-in-battle': 'They are not in this battle.',
  'nothing-to-see': 'Their plan is not in yet.',
  'not-seated': 'No such seat.',
  'bad-count': 'Their hand does not hold that many.',
  'bad-territory': 'A Karama worm goes in sand.',
  'not-stoppable': 'That advantage cannot be stopped — a win condition is beyond the card.',
  'nothing-there': 'The Tanks do not hold that many of your forces.',
  'nothing-asked': 'Choose something to revive.',
  'over-the-cap': 'The Karama revives at most three.',
  'face-down': 'That leader waits out the rotation, face down.',
  'not-in-tanks': 'That leader is not in the Tanks.',
  'stale': 'The table moved first — try again.',
}

const field = {
  background: '#f7efdc', color: '#1c1c1c', border: '1px solid #00000044',
  borderRadius: 4, padding: '4px 6px', font: '13px Georgia, serif',
} as const
const btn = {
  padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
  font: '13px Georgia, serif',
} as const

const SAND_TERRITORIES = DUNE_TERRITORIES.filter(t => t.terrain === 'sand')

export function KaramaPanel({
  seat, mode, cardId, players, leaders, dead,
  onUse, onStop, onClose, busy = false, refusal = null, phase,
}: KaramaPanelProps) {
  const options = karamaOptions(seat, mode)
  const [useId, setUseId] = useState<KaramaUseId>(options[0]?.id ?? 'guild-rate-shipment')
  const [target, setTarget] = useState<FactionId | null>(null)
  const [count, setCount] = useState(1)
  const [territoryId, setTerritoryId] = useState(SAND_TERRITORIES[0]?.id ?? '')
  const [plain, setPlain] = useState(Math.min(dead.plain, 3))
  const [starred, setStarred] = useState(0)
  const [stopTarget, setStopTarget] = useState<FactionId | null>(null)
  const [stopRef, setStopRef] = useState<string | null>(null)

  const others = players.filter(p => p.faction !== seat)
  const needsTarget = useId === 'atreides-see-battle-plan'
    || useId === 'guild-stop-shipment' || useId === 'harkonnen-take-cards'

  const use = (): KaramaUse | null => {
    switch (useId) {
      case 'guild-rate-shipment':
      case 'free-treachery-card':
        return { id: useId }
      case 'atreides-see-battle-plan':
        return target ? { id: useId, target } : null
      case 'guild-stop-shipment':
        return target ? { id: useId, target } : null
      case 'harkonnen-take-cards':
        return target ? { id: useId, target, count } : null
      case 'fremen-place-worm':
        return territoryId ? { id: useId, territoryId: territoryId as never } : null
      case 'emperor-free-revival':
        return { id: useId, revive: 'forces', forces: plain } as never
    }
  }

  const stopChoices = stopTarget ? suppressibleRefs(stopTarget, mode) : []
  /**
   * WHEN the stop bites. Defaults to now, which is what a Karama always
   * meant — the picker exists for the advantages that fire in the same
   * breath as their phase begins, where "now" is already too late.
   */
  const whenChoices = stoppablePhases(phase)
  const [stopWhen, setStopWhen] = useState<GamePhase>(phase)

  return (
    <div data-layer="karama-panel" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: '#000000a0', zIndex: 1100,
    }}>
      <div style={{
        width: 520, maxWidth: '94%', maxHeight: '88%', overflowY: 'auto',
        background: '#131c2e', color: '#f0e2bb', borderRadius: 8,
        border: '1px solid #f0e2bb44', padding: '14px 16px',
        font: '14px Georgia, serif',
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {(() => {
            const c = TREACHERY_CARDS.find(x => x.id === cardId)
            return c ? <TreacheryCardFace card={c} width={92} /> : null
          })()}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <b style={{ fontSize: 16 }}>Karama</b>
              {cardId !== 'karama' && (
                <span data-karama-worthless="" style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
                  — a worthless card, played as one
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" data-karama-close="" onClick={onClose}
                style={{ background: 'none', border: 'none', color: '#f0e2bb', cursor: 'pointer', fontSize: 15 }}>
                ✕
              </button>
            </div>
            <p style={{ margin: '4px 0 0', opacity: 0.7, fontSize: 12 }}>
              Spend it on a use of your own, or stop another faction's named
              advantage for the current phase. Either use, not both; the card
              is spent when the play lands.
            </p>
          </div>
        </div>

        {/* ── spend on your own ─────────────────────────────────────────── */}
        <div style={{ marginTop: 12, borderTop: '1px solid #f0e2bb22', paddingTop: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.75, letterSpacing: 1 }}>SPEND ON YOUR OWN</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
            <select data-karama-use-select="" value={useId}
              onChange={e => setUseId(e.target.value as KaramaUseId)} style={field}>
              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {needsTarget && (
              <select data-karama-target="" value={target ?? ''}
                onChange={e => setTarget((e.target.value || null) as FactionId | null)} style={field}>
                <option value="">choose a faction…</option>
                {others.map(p => (
                  <option key={p.faction} value={p.faction}>
                    {FACTION_LOOK[p.faction]?.name ?? p.faction}
                  </option>
                ))}
              </select>
            )}
            {useId === 'harkonnen-take-cards' && (
              <input data-karama-count="" type="number" min={1} max={8} value={count}
                onChange={e => setCount(Number(e.target.value))} style={{ ...field, width: 56 }} />
            )}
            {useId === 'fremen-place-worm' && (
              <select data-karama-territory="" value={territoryId}
                onChange={e => setTerritoryId(e.target.value)} style={field}>
                {SAND_TERRITORIES.map(t => (
                  <option key={t.id} value={t.id}>{t.displayName}</option>
                ))}
              </select>
            )}
          </div>
          {useId === 'emperor-free-revival' && (
            <div style={{ marginTop: 8 }}>
              {leaders.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {leaders.map(name => (
                    <button key={name} type="button" data-karama-leader={name}
                      disabled={busy}
                      onClick={() => onUse(cardId,
                        { id: 'emperor-free-revival', leader: name } as never)}
                      style={btn}>
                      {name} — free
                    </button>
                  ))}
                </div>
              )}
              <span style={{ fontSize: 12, opacity: 0.75 }}>
                Or forces, up to three — the Tanks hold {dead.plain}
                {dead.starred > 0 ? ` (and ${dead.starred}★)` : ''}:
              </span>
              <span style={{ marginLeft: 8 }}>
                <button type="button" disabled={busy} style={btn}
                  onClick={() => setPlain(p => Math.max(0, p - 1))}>−</button>
                <b style={{ margin: '0 8px' }}>{plain}</b>
                <button type="button" disabled={busy} style={btn}
                  onClick={() => setPlain(p => Math.min(Math.min(dead.plain, 3 - starred), p + 1))}>+</button>
              </span>
              {dead.starred > 0 && (
                <span style={{ marginLeft: 8 }}>
                  <button type="button" disabled={busy} style={btn}
                    onClick={() => setStarred(s => Math.max(0, s - 1))}>−</button>
                  <b style={{ margin: '0 8px' }}>{starred}★</b>
                  <button type="button" disabled={busy} style={btn}
                    onClick={() => setStarred(s => Math.min(Math.min(dead.starred, 3 - plain), s + 1))}>+</button>
                </span>
              )}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button type="button" data-karama-play="" disabled={busy || !use()}
              onClick={() => {
                const u = useId === 'emperor-free-revival'
                  ? { id: useId, plain, starred } as never
                  : use()
                if (u) onUse(cardId, u)
              }}
              style={{ ...btn, opacity: use() ? 1 : 0.5 }}>
              Play — the card is spent
            </button>
          </div>
        </div>

        {/* ── stop an advantage ─────────────────────────────────────────── */}
        <div style={{ marginTop: 12, borderTop: '1px solid #f0e2bb22', paddingTop: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.75, letterSpacing: 1 }}>
            OR STOP AN ADVANTAGE — for one phase
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {others.map(p => (
              <button key={p.faction} type="button" data-karama-stop-target={p.faction}
                onClick={() => { setStopTarget(p.faction); setStopRef(null) }}
                style={{
                  padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${stopTarget === p.faction ? FACTION_LOOK[p.faction].colour : '#f0e2bb33'}`,
                  background: stopTarget === p.faction ? '#ffffff1d' : '#ffffff0a',
                  color: '#f0e2bb',
                }}>
                {FACTION_LOOK[p.faction]?.name ?? p.faction}
              </button>
            ))}
          </div>
          {stopTarget && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {stopChoices.map(({ ref, text }) => (
                <label key={ref} style={{
                  display: 'flex', gap: 7, alignItems: 'baseline',
                  fontSize: 12.5, cursor: 'pointer',
                }}>
                  <input type="radio" name="karama-stop-ref" data-karama-stop-ref={ref}
                    checked={stopRef === ref}
                    onChange={() => setStopRef(ref)} />
                  <span style={{ opacity: 0.85 }}>{text}</span>
                </label>
              ))}
              {/* AND WHEN. Only worth asking once a rule is picked, and only
                  when there is more than one answer — the last phase of a
                  turn offers itself and nothing else. */}
              {stopRef && whenChoices.length > 1 && (
                <label style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>
                  <span style={{ opacity: 0.75 }}>During </span>
                  <select data-karama-stop-when="" value={stopWhen}
                    onChange={e => setStopWhen(e.target.value as GamePhase)}
                    style={{
                      background: '#0d1220', color: '#f0e2bb',
                      border: '1px solid #f0e2bb33', borderRadius: 4,
                      padding: '2px 5px', font: 'inherit',
                    }}>
                    {whenChoices.map(ph => (
                      <option key={ph} value={ph}>
                        {/* WHICH STORM. From the Mentat Pause the only storm
                            anybody can mean is the next turn's — this turn's
                            is long past — and a bare "Storm" in that list
                            would read as one that has already blown. */}
                        {ph === phase ? `${ph} — now`
                          : ph === 'Storm' && phase === 'Mentat Pause'
                            ? 'Storm — next turn'
                            : ph}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div>
                <button type="button" data-karama-stop="" disabled={busy || !stopRef}
                  onClick={() => stopTarget && stopRef
                    && onStop(cardId, stopTarget, stopRef, stopWhen)}
                  style={{ ...btn, opacity: stopRef ? 1 : 0.5 }}>
                  Stop it — the card is spent
                </button>
              </div>
            </div>
          )}
        </div>

        {refusal && (
          <p data-karama-refusal={refusal} style={{ color: '#e8b04b', marginTop: 8 }}>
            {REFUSAL_TEXT[refusal] ?? `Refused: ${refusal}`}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The Harkonnen's owed return: one card back for each taken, chosen after
 * seeing what came. Forced while the debt stands; past the clock any seat
 * may push the first-of-the-hand default instead.
 */
export function KaramaGiveBackPanel({
  owed, hand, expired, onPay, busy = false, refusal = null,
}: {
  owed: { to: FactionId; count: number }
  /** The debtor's hand, for choosing — empty for a pushing bystander. */
  hand: readonly string[]
  expired: boolean
  onPay: (cards: string[]) => void
  busy?: boolean
  refusal?: string | null
}) {
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (id: string) => setPicked(p =>
    p.includes(id) ? p.filter(x => x !== id)
      : p.length < owed.count ? [...p, id] : p)
  return (
    <div data-layer="karama-giveback" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: '#000000a0', zIndex: 1100,
    }}>
      <div style={{
        width: 460, maxWidth: '94%',
        background: '#131c2e', color: '#f0e2bb', borderRadius: 8,
        border: '1px solid #f0e2bb44', padding: '14px 16px',
        font: '14px Georgia, serif',
      }}>
        <b style={{ fontSize: 16 }}>The return is owed</b>
        <p style={{ margin: '4px 0 8px', opacity: 0.75, fontSize: 12.5 }}>
          {owed.count} card{owed.count === 1 ? '' : 's'} back to
          the {FACTION_LOOK[owed.to]?.name ?? owed.to} — chosen now that you
          have seen what came.
        </p>
        {hand.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {hand.map((id, i) => {
              const c = TREACHERY_CARDS.find(x => x.id === id)
              const on = picked.includes(id)
              return (
                <button key={`${id}-${i}`} type="button" data-giveback-card={id}
                  onClick={() => toggle(id)}
                  style={{
                    background: 'none', padding: 0, lineHeight: 0,
                    border: on ? '2px solid #e8b04b' : '2px solid transparent',
                    borderRadius: 6, cursor: 'pointer',
                  }}>
                  {c ? <TreacheryCardFace card={c} width={92} /> : id}
                </button>
              )
            })}
          </div>
        )}
        {refusal && (
          <p data-giveback-refusal={refusal} style={{ color: '#e8b04b', marginTop: 6 }}>
            {refusal === 'bad-count' ? `${owed.count} card(s) are owed.` : `Refused: ${refusal}`}
          </p>
        )}
        <div style={{ marginTop: 10 }}>
          {hand.length > 0 ? (
            <button type="button" data-giveback-pay="" disabled={busy || picked.length !== owed.count}
              onClick={() => onPay(picked)}
              style={{
                padding: '6px 16px', borderRadius: 4, border: 'none',
                cursor: 'pointer', opacity: picked.length === owed.count ? 1 : 0.5,
              }}>
              Hand them back ({picked.length}/{owed.count})
            </button>
          ) : expired ? (
            <button type="button" data-giveback-push="" disabled={busy}
              onClick={() => onPay([])}
              style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
              The clock has run out — hand back the first of their hand
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
