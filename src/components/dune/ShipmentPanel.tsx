/**
 * The acting seat's two halves: one shipment, then one move.
 *
 * SHOWN TO EVERY SEAT, controls only for the one whose turn it is — six
 * people round a table can all see who is being waited on, and hiding it is
 * how a play-by-network game ends up with everybody waiting on everybody.
 * Past the deadline anybody gets the push button, the auction's rule.
 *
 * THE SERVER RULES ON EVERYTHING. The cost preview here is the same bundle
 * the server runs (shipCost), so the number on the button is the number the
 * ledger will move — but every refusal (storm, closed stronghold, range, the
 * desert's radius) is the server's to say, and arrives as a code.
 *
 * ONE SOURCE STACK PER MOVE, for now: the rules allow gathering a group from
 * several sectors of one territory and the server accepts a multi-stack
 * gather; this form offers the common case. Widening it is a UI change, not
 * a rules change.
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
}

const label: React.CSSProperties = { display: 'block', marginTop: 6, fontSize: 11, opacity: 0.75 }
const wide: React.CSSProperties = { width: '100%' }

export function ShipmentPanel({
  shipping, forces, seat, guildSeated, now, busy, onShip, onMove, onPass,
}: ShipmentPanelProps) {
  const acting = shipping.order[shipping.at]
  const mine = seat === acting
  const expired = now >= shipping.closesAt

  const [kind, setKind] = useState<GuildShipKind>('off-planet')
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

  const preview = seat && shipTo && kind !== 'to-reserves'
    ? shipCost({ faction: seat, kind, territoryId: shipTo, count, guildSeated }).cost
    : seat && kind === 'to-reserves' && shipFrom
      ? shipCost({ faction: seat, kind, territoryId: shipFrom.split('|')[0], count, guildSeated }).cost
      : null

  return (
    <div data-layer="shipment-panel" style={{
      margin: '0 0 8px', padding: 8, borderRadius: 6, background: '#1d2a44',
      lineHeight: 1.5, font: `12px ${SERIF}`, color: PALE,
    }}>
      <b style={{ display: 'block', marginBottom: 2 }}>
        {shipping.stage === 'ship' ? 'Shipment round' : 'Movement round'}
      </b>
      {shipping.order.map((f, i) => (
        <span key={f} style={{
          marginRight: 6,
          opacity: i === shipping.at ? 1 : 0.45,
          color: i === shipping.at ? FACTION_LOOK[f].colour : PALE,
          textDecoration: i < shipping.at ? 'line-through' : undefined,
        }}>{FACTION_LOOK[f].name}</span>
      ))}

      {!mine && !expired && <span style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
        Waiting on {FACTION_LOOK[acting].name} to {shipping.stage === 'ship' ? 'ship' : 'move'}.
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
          {shipping.stage === 'ship' && !shipping.done.shipped && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #ffffff14' }}>
              <b>Ship</b>
              {seat === 'spacing-guild' && (
                <select value={kind} onChange={e => setKind(e.target.value as GuildShipKind)}
                  style={wide}>
                  <option value="off-planet">From reserves onto the board</option>
                  <option value="cross">From one territory to another</option>
                  <option value="to-reserves">From the board back to reserves</option>
                </select>
              )}
              {(kind === 'cross' || kind === 'to-reserves') && (
                <>
                  <span style={label}>From</span>
                  <select value={shipFrom} onChange={e => setShipFrom(e.target.value)} style={wide}>
                    <option value="">—</option>
                    {stacks.map(s => (
                      <option key={s.key} value={s.key}>
                        {nameOf(s.territoryId)} ({s.sector}) — {s.count}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {kind !== 'to-reserves' && (
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
                  ...(kind !== 'to-reserves'
                    ? { to: { territoryId: shipTo, sector: shipSector || undefined } } : null),
                  ...(kind !== 'off-planet' && shipFrom
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

          {shipping.stage === 'move' && !shipping.done.moved && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #ffffff14' }}>
              <b>Move</b>
              <span style={label}>From</span>
              <select value={moveFrom} onChange={e => setMoveFrom(e.target.value)} style={wide}>
                <option value="">—</option>
                {stacks.map(s => (
                  <option key={s.key} value={s.key}>
                    {nameOf(s.territoryId)} ({s.sector}) — {s.count}
                  </option>
                ))}
              </select>
              <span style={label}>Forces</span>
              <input type="number" min={1} value={moveCount}
                onChange={e => setMoveCount(Math.max(1, Number(e.target.value)))} style={wide} />
              <span style={label}>To</span>
              <select value={moveTo}
                onChange={e => { setMoveTo(e.target.value); setMoveSector('') }} style={wide}>
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
              <button disabled={busy} style={{ marginTop: 6 }}
                onClick={() => onMove({
                  from: moveFrom.split('|')[0],
                  gather: [{ sector: moveFrom.split('|')[1], count: moveCount }],
                  to: { territoryId: moveTo, sector: moveSector || undefined },
                })}>
                Move
              </button>
            </div>
          )}

          {/* THE EARLY HANDOFF: three minutes are the ceiling, not a
              sentence. Named for the round so nobody wonders what is being
              ended. */}
          <button disabled={busy} onClick={onPass}
            style={{ display: 'block', width: '100%', marginTop: 8 }}>
            {shipping.stage === 'ship' ? 'End shipment — next player' : 'End movement — next player'}
          </button>
        </>
      )}
    </div>
  )
}
