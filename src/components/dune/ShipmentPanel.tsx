/**
 * The rotation's notice: whose turn, what is left of it, and the handoff.
 *
 * THE DOING MOVED TO THE BOARD. Shipping is the rail's bubbles and a landing
 * click; movement is a click on your own stack and a click on where it goes —
 * no selects, no number fields. What remains here is what a notice board is
 * for: the order with the acting seat lit, the waiting line, the end-of-turn
 * button, and the push once a clock has run out.
 *
 * THE GUILD KEEP TWO FORMS, because their special shipments — territory to
 * territory, and back to reserves — have no bubble: they start from the
 * board, not the pile, and a click on a stack already means "move". A small
 * form for the exception beats a click grammar nobody could guess.
 *
 * `devForms` restores the full select-driven ship and move forms for the
 * six-seat harness, which drives every faction from one page and needs the
 * generic path more than it needs elegance.
 */
import { useMemo, useState } from 'react'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { FACTION_LOOK } from './SeatLayer'
import { shipCost } from '@/lib/dune/shipment'
import type { GuildShipKind } from '@/lib/dune/shipment'
import type { Force, DuneGameState } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

export interface ShipmentPanelProps {
  shipping: NonNullable<DuneGameState['shipping']>
  forces: readonly Force[]
  seat: FactionId | null
  guildSeated: boolean
  now: number
  busy: boolean
  onShip: (a: {
    kind: GuildShipKind
    to?: { territoryId: string; sector?: string }
    from?: { territoryId: string; sector: string }
    count: number
  }) => void
  onMove: (a: {
    from: string
    gather: { sector: string; count: number }[]
    to: { territoryId: string; sector?: string }
  }) => void
  onPass: () => void
  /** The harness's generic forms. Never set on the real screen. */
  devForms?: boolean
}

const label: React.CSSProperties = { display: 'block', marginTop: 6, fontSize: 11, opacity: 0.75 }
const wide: React.CSSProperties = { width: '100%' }

export function ShipmentPanel({
  shipping, forces, seat, guildSeated, now, busy, onShip, onMove, onPass, devForms = false,
}: ShipmentPanelProps) {
  const acting = shipping.order[shipping.at]
  const mine = seat === acting
  const expired = now >= shipping.closesAt

  const [kind, setKind] = useState<GuildShipKind>('cross')
  const [shipTo, setShipTo] = useState('')
  const [shipSector, setShipSector] = useState('')
  const [shipFrom, setShipFrom] = useState('')
  const [count, setCount] = useState(1)
  const [moveFrom, setMoveFrom] = useState('')
  const [moveCount, setMoveCount] = useState(1)
  const [moveTo, setMoveTo] = useState('')
  const [moveSector, setMoveSector] = useState('')

  /** This seat's stacks, for the from-pickers. */
  const stacks = useMemo(() => forces
    .filter(f => f.faction === seat && f.count > 0)
    .map(f => ({ key: `${f.territoryId}|${f.sector}`, ...f })), [forces, seat])

  const sectorsOf = (id: string) => DUNE_TERRITORIES.find(t => t.id === id)?.sectors ?? []
  const nameOf = (id: string) => DUNE_TERRITORIES.find(t => t.id === id)?.displayName ?? id

  const preview = seat && kind === 'cross' && shipTo
    ? shipCost({ faction: seat, kind, territoryId: shipTo, count, guildSeated }).cost
    : seat && kind === 'to-reserves' && shipFrom
      ? shipCost({ faction: seat, kind, territoryId: shipFrom.split('|')[0], count, guildSeated }).cost
      : null

  const mayShip = mine && !shipping.done.shipped && !shipping.done.moved
  const mayMove = mine && !shipping.done.moved

  return (
    <div data-layer="shipment-panel" style={{
      margin: '0 0 8px', padding: 8, borderRadius: 6, background: '#1d2a44',
      lineHeight: 1.5, font: `12px ${SERIF}`, color: PALE,
    }}>
      <b style={{ display: 'block', marginBottom: 2 }}>Shipment and Movement</b>
      {shipping.order.map((f, i) => (
        <span key={f} style={{
          marginRight: 6,
          opacity: i === shipping.at ? 1 : 0.45,
          color: i === shipping.at ? FACTION_LOOK[f].colour : PALE,
          textDecoration: i < shipping.at ? 'line-through' : undefined,
        }}>{FACTION_LOOK[f].name}</span>
      ))}

      {!mine && !expired && <span style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
        Waiting on {FACTION_LOOK[acting].name}.
      </span>}

      {/* PAST THE DEADLINE, ANYBODY MAY PUSH — silence has already spent
          whatever this seat did not. */}
      {!mine && expired && (
        <button disabled={busy} onClick={onPass} style={{ marginTop: 6 }}>
          The clock has run out — next seat
        </button>
      )}

      {mine && (
        <>
          <span style={{ display: 'block', marginTop: 4, opacity: 0.85 }}>
            {mayShip
              ? 'Stage forces on the rail and click the board to land them.'
              : shipping.done.moved ? '' : 'Click one of your stacks, then where it goes — a click a force. − takes one back; ✓ sends them.'}
          </span>

          {/* ── THE GUILD'S TWO EXCEPTIONS ────────────────────────────────── */}
          {seat === 'spacing-guild' && mayShip && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #ffffff14' }}>
              <b>Guild shipment</b>
              <select value={kind} onChange={e => setKind(e.target.value as GuildShipKind)}
                style={wide}>
                <option value="cross">From one territory to another</option>
                <option value="to-reserves">From the board back to reserves</option>
              </select>
              <span style={label}>From</span>
              <select value={shipFrom} onChange={e => setShipFrom(e.target.value)} style={wide}>
                <option value="">—</option>
                {stacks.map(s => (
                  <option key={s.key} value={s.key}>
                    {nameOf(s.territoryId)} ({s.sector}) — {s.count}
                  </option>
                ))}
              </select>
              {kind === 'cross' && (
                <>
                  <span style={label}>To</span>
                  <select value={shipTo}
                    onChange={e => { setShipTo(e.target.value); setShipSector('') }} style={wide}>
                    <option value="">—</option>
                    {DUNE_TERRITORIES.map(t => (
                      <option key={t.id} value={t.id}>{t.displayName}</option>
                    ))}
                  </select>
                  {sectorsOf(shipTo).length > 1 && (
                    <select value={shipSector} onChange={e => setShipSector(e.target.value)}
                      style={{ ...wide, marginTop: 3 }}>
                      <option value="">sector…</option>
                      {sectorsOf(shipTo).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </>
              )}
              <span style={label}>Forces</span>
              <input type="number" min={1} value={count}
                onChange={e => setCount(Math.max(1, Number(e.target.value)))} style={wide} />
              <button disabled={busy} style={{ marginTop: 6 }}
                onClick={() => onShip({
                  kind,
                  ...(kind === 'cross'
                    ? { to: { territoryId: shipTo, sector: shipSector || undefined } } : null),
                  ...(shipFrom
                    ? {
                      from: {
                        territoryId: shipFrom.split('|')[0],
                        sector: shipFrom.split('|')[1],
                      },
                    } : null),
                  count,
                })}>
                Ship{preview != null ? ` (${preview} spice)` : ''}
              </button>
            </div>
          )}

          {/* ── THE HARNESS'S GENERIC FORMS ───────────────────────────────── */}
          {devForms && mayShip && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #ffffff14' }}>
              <b>Ship (dev)</b>
              <select value={shipTo}
                onChange={e => { setShipTo(e.target.value); setShipSector('') }} style={wide}>
                <option value="">—</option>
                {DUNE_TERRITORIES.map(t => (
                  <option key={t.id} value={t.id}>{t.displayName}</option>
                ))}
              </select>
              {sectorsOf(shipTo).length > 1 && (
                <select value={shipSector} onChange={e => setShipSector(e.target.value)}
                  style={{ ...wide, marginTop: 3 }}>
                  <option value="">sector…</option>
                  {sectorsOf(shipTo).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <input type="number" min={1} value={count}
                onChange={e => setCount(Math.max(1, Number(e.target.value)))}
                style={{ ...wide, marginTop: 3 }} />
              <button disabled={busy} style={{ marginTop: 4 }}
                onClick={() => onShip({
                  kind: 'off-planet',
                  to: { territoryId: shipTo, sector: shipSector || undefined },
                  count,
                })}>
                Ship
              </button>
            </div>
          )}
          {devForms && mayMove && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #ffffff14' }}>
              <b>Move (dev)</b>
              <select value={moveFrom} onChange={e => setMoveFrom(e.target.value)} style={wide}>
                <option value="">—</option>
                {stacks.map(s => (
                  <option key={s.key} value={s.key}>
                    {nameOf(s.territoryId)} ({s.sector}) — {s.count}
                  </option>
                ))}
              </select>
              <input type="number" min={1} value={moveCount}
                onChange={e => setMoveCount(Math.max(1, Number(e.target.value)))}
                style={{ ...wide, marginTop: 3 }} />
              <select value={moveTo}
                onChange={e => { setMoveTo(e.target.value); setMoveSector('') }}
                style={{ ...wide, marginTop: 3 }}>
                <option value="">—</option>
                {DUNE_TERRITORIES.map(t => (
                  <option key={t.id} value={t.id}>{t.displayName}</option>
                ))}
              </select>
              {sectorsOf(moveTo).length > 1 && (
                <select value={moveSector} onChange={e => setMoveSector(e.target.value)}
                  style={{ ...wide, marginTop: 3 }}>
                  <option value="">sector…</option>
                  {sectorsOf(moveTo).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <button disabled={busy} style={{ marginTop: 4 }}
                onClick={() => onMove({
                  from: moveFrom.split('|')[0],
                  gather: [{ sector: moveFrom.split('|')[1], count: moveCount }],
                  to: { territoryId: moveTo, sector: moveSector || undefined },
                })}>
                Move
              </button>
            </div>
          )}

          {/* THE EARLY HANDOFF: the clock is a ceiling, not a sentence. */}
          <button disabled={busy} onClick={onPass}
            style={{ display: 'block', width: '100%', marginTop: 8 }}>
            End turn — next player
          </button>
        </>
      )}
    </div>
  )
}
