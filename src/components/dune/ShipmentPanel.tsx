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
import { factionInk,FACTION_LOOK } from './SeatLayer'
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

const wide: React.CSSProperties = { width: '100%' }

export function ShipmentPanel({
  shipping, forces, seat, now, busy, onShip, onMove, onPass, devForms = false,
}: ShipmentPanelProps) {
  const acting = shipping.order[shipping.at]
  const mine = seat === acting
  const expired = now >= shipping.closesAt

  const [shipTo, setShipTo] = useState('')
  const [shipSector, setShipSector] = useState('')
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
          color: i === shipping.at ? factionInk(f) : PALE,
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

          {/* THE GUILD'S THREE WAYS ride the rail now — kind first, then
              the board, the same bubbles as everyone. The select forms this
              replaced were a second grammar for the same action. */}
          {seat === 'spacing-guild' && mayShip && (
            <span style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
              Pick the shipment kind on the rail — off-planet, cross-ship, or
              back to reserves — then click the board.
            </span>
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

          {/* THE EARLY HANDOFF LIVES ON THE RAIL, and only there. It was
              here as well — the same words, the same action, two buttons on
              opposite sides of the screen — and a second copy of a control
              is not reassurance, it is a question about whether the two do
              the same thing. See ShipRail's onEndTurn, which sits with the
              rest of the shipment controls. */}
        </>
      )}
    </div>
  )
}
