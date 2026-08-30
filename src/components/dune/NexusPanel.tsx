/**
 * The Nexus bar: five minutes of alliance talk under the blow.
 *
 * A bar rather than a modal, like the Mentat Pause — the board is what an
 * alliance is ABOUT, and nothing here may cover it. What it shows splits
 * exactly the way the law splits: standing alliances and their breaking are
 * PUBLIC and come off `players`; this seat's outgoing proposal and incoming
 * offers are PRIVATE and come off its own secrets, already filtered by the
 * caller to this Nexus's turn.
 *
 * One press here is unlike every other press in the game: the LAST seat to
 * ready ends the Nexus for everyone and cannot take it back — the server
 * deletes the window in that same write. The button says so before it is
 * pressed, because a rule a player learns after pressing is a trap.
 */
import { FACTION_LOOK } from './SeatLayer'
import type { FactionId } from '@/types/Dune/Faction'

export type NexusMove =
  | { kind: 'propose'; to: FactionId }
  | { kind: 'accept'; from: FactionId }
  | { kind: 'break' }
  | { kind: 'ready' }
  | { kind: 'unready' }

export interface NexusPanelProps {
  nexus: { turn: number; closesAt: number; ready?: readonly FactionId[] }
  players: readonly { faction: FactionId; ally: FactionId | null }[]
  seat: FactionId
  /** This seat's outgoing proposal, this Nexus only — or null. */
  proposal: FactionId | null
  /** The factions whose offers are aimed at this seat, this Nexus only. */
  offers: readonly FactionId[]
  onMove: (m: NexusMove) => void
  busy?: boolean
  refusal?: { type: string; code: string } | null
  now: number
}

const REFUSAL_TEXT: Record<string, string> = {
  'no-nexus': 'No Nexus is open.',
  'not-seated': 'That faction is not seated.',
  'yourself': 'You cannot ally with yourself.',
  'you-are-allied': 'Break your current alliance first.',
  'they-are-allied': 'They are already allied — they must break theirs first.',
  'not-allied': 'You have no alliance to break.',
  'no-offer': 'That offer no longer stands.',
  'already-ready': 'You are already ready.',
  'not-ready': 'You are not ready.',
  'stale': 'The table moved first — try again.',
}

const nameOf = (f: FactionId) => FACTION_LOOK[f]?.name ?? f

export function NexusPanel({
  nexus, players, seat, proposal, offers, onMove, busy = false, refusal = null, now,
}: NexusPanelProps) {
  const ready = nexus.ready ?? []
  const iAmReady = ready.includes(seat)
  const me = players.find(p => p.faction === seat)
  const myAlly = me?.ally ?? null
  const others = players.filter(p => p.faction !== seat)
  // THE LAST READY ENDS IT: with every other seat in, this seat's Ready is
  // the irreversible one, and the button must say so before the press.
  const lastToReady = !iAmReady && ready.length === players.length - 1
  const secondsLeft = Math.max(0, Math.ceil((nexus.closesAt - now) / 1000))
  // Standing alliances are the table's own record — each pair named once.
  const pairs = players.flatMap(p =>
    p.ally && String(p.faction) < String(p.ally) ? [[p.faction, p.ally] as const] : [])

  return (
    <div data-layer="nexus-bar" style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '8px 12px', background: '#0d1220', color: '#f0e2bb',
      borderTop: '1px solid #f0e2bb44', font: '14px Georgia, serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong>Nexus</strong>
        <span style={{ opacity: 0.75 }}>
          Shai-Hulud has shown — alliances may form, and break, for {secondsLeft}s
          {' '}({ready.length} of {players.length} ready)
        </span>
        <span style={{ flex: 1 }} />
        {iAmReady ? (
          <>
            <span data-nexus-waiting="" style={{ opacity: 0.75 }}>
              ready — you may still change your mind
            </span>
            <button type="button" data-nexus-unready="" disabled={busy}
              onClick={() => onMove({ kind: 'unready' })}
              style={{ padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
              Un-ready
            </button>
          </>
        ) : (
          <>
            {lastToReady && (
              <span data-nexus-ready-last="" style={{ color: '#e8b04b' }}>
                You are the last — this ends the Nexus for everyone, and cannot
                be taken back.
              </span>
            )}
            <button type="button" data-nexus-ready="" disabled={busy}
              onClick={() => onMove({ kind: 'ready' })}
              style={{ padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
              Ready
            </button>
          </>
        )}
      </div>

      {pairs.length > 0 && (
        <div data-nexus-alliances="" style={{ opacity: 0.85 }}>
          {pairs.map(([x, y]) => (
            <span key={x} style={{ marginRight: 14 }}>
              {nameOf(x)} and {nameOf(y)} are allied.
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {myAlly ? (
          <>
            <span>Allied with {nameOf(myAlly)}.</span>
            {/* BREAKING IS PUBLIC, and both seats are then free to re-ally
                within this same Nexus — proposing again needs the break first. */}
            <button type="button" data-nexus-break="" disabled={busy}
              onClick={() => onMove({ kind: 'break' })}
              style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
              Break the alliance
            </button>
          </>
        ) : (
          <>
            <span style={{ opacity: 0.75 }}>Propose to:</span>
            {others.map(p => {
              const theirs = p.ally !== null
              const pending = proposal === p.faction
              return (
                <button key={p.faction} type="button"
                  data-nexus-propose={p.faction}
                  disabled={busy || theirs || pending}
                  title={theirs ? `${nameOf(p.faction)} is allied — they must break theirs first.`
                    : pending ? 'Proposed — waiting on them.' : undefined}
                  onClick={() => onMove({ kind: 'propose', to: p.faction })}
                  style={{
                    padding: '3px 10px', borderRadius: 4, border: 'none',
                    cursor: theirs || pending ? 'default' : 'pointer',
                    opacity: theirs ? 0.45 : 1,
                  }}>
                  {nameOf(p.faction)}{pending ? ' — proposed' : ''}
                </button>
              )
            })}
          </>
        )}
        {proposal && !myAlly && (
          <span data-nexus-proposed={proposal} style={{ opacity: 0.75 }}>
            Your proposal to {nameOf(proposal)} is private until they accept.
          </span>
        )}
      </div>

      {offers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {offers.map(f => (
            <span key={f} data-nexus-offer={f}>
              {nameOf(f)} proposes an alliance.{' '}
              <button type="button" data-nexus-accept={f}
                disabled={busy || myAlly !== null}
                title={myAlly ? 'Break your current alliance first.' : undefined}
                onClick={() => onMove({ kind: 'accept', from: f })}
                style={{
                  padding: '3px 10px', borderRadius: 4, border: 'none',
                  cursor: myAlly ? 'default' : 'pointer', opacity: myAlly ? 0.45 : 1,
                }}>
                Accept
              </button>
            </span>
          ))}
        </div>
      )}

      {refusal && (
        <div data-nexus-refusal={refusal.code} style={{ color: '#e8b04b' }}>
          {REFUSAL_TEXT[refusal.code] ?? `Refused: ${refusal.code}`}
        </div>
      )}
    </div>
  )
}
