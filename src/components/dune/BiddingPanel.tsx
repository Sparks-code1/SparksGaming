/**
 * The bidding screen.
 *
 * Sits OVER the board rather than replacing it. A player is bidding on a card
 * to fight over a specific piece of ground, and taking the map away while they
 * decide how much it is worth is taking away the thing the decision is about.
 * So the board stays where it is, dimmed, and this floats on top of it.
 *
 * WHAT THIS COMPONENT MAY SEE. The auction's public state names no card — see
 * lib/dune/bidding.ts — and neither does this. The face-down slot is face down
 * because there is nothing here to draw face up.
 *
 * The one exception is `revealed`, for Atreides prescience, and its shape is
 * the point: it is a PROP. This component cannot fetch a card, cannot look one
 * up, cannot derive one from the auction. The only way a card gets in here is
 * for a caller to hand it over, and the only caller that can is one holding a
 * secrets row that contains it. A leak would have to be written on purpose,
 * one level up, rather than happening by omission here.
 *
 * NOTHING HERE READS A CLOCK. `now` is a prop, the same rule the charity window
 * follows: the deadline was stamped once by the server, and a component that
 * measured its own duration would count differently on every machine.
 */
import { useState } from 'react'
import { SeatMark, FACTION_LOOK } from './SeatLayer'
import { TreacheryCardFace, TreacheryCardBack, CARD_W, CARD_H } from './TreacheryCardFace'
import { MINIMUM_OPENING_BID } from '@/lib/dune/bidding'
import type { BidAsk, BidRefusal } from '@/lib/dune/bidding'
import type { TreacheryCard } from '@/types/Dune/Treachery'
import type { FactionId } from '@/types/Dune/Faction'

const SAND = '#f0e2bb'
const INK = '#0d1220'

/** What a refusal means, in words the bidder can act on. */
const REFUSAL_TEXT: Record<BidRefusal, string> = {
  'not-your-turn': 'It is not your turn.',
  'already-passed': 'You have already passed on this card.',
  'at-your-hand-limit': 'Your hand is full.',
  'below-the-minimum': 'That does not beat the standing bid.',
  'more-than-you-hold': 'You do not have that much spice.',
}

export interface BiddingPanelProps {
  /** The public ask. Names no card, and could be shown to the whole table. */
  ask: BidAsk
  /** Counter-clockwise, from the storm-relative first player. */
  order: readonly FactionId[]
  toAct: FactionId
  passed: readonly FactionId[]
  /** Which seat this client holds. */
  seat: FactionId
  /** This seat's own, from the secrets channel. */
  spice: number
  hand: readonly TreacheryCard[]
  /**
   * The card up for auction, face up.
   *
   * ONLY for a seat entitled to see it — the Atreides, by prescience. It
   * arrives on that seat's secrets channel and appears in no shared state, so
   * handing it to this component is a decision the caller makes with a card it
   * could only have got from its own row.
   */
  revealed?: TreacheryCard | null
  /** Stamped by the server when the turn to bid opened. */
  closesAt: number
  /** Injected. This component asks no clock of its own. */
  now: number
  /**
   * The bidder's OWN last refusal, or null.
   *
   * Private to them: a rejection announces roughly what they hold, which is
   * most of what bidding hides. And the clock is not reset by one — a refused
   * bid must not be a way to buy thinking time — so this is rendered beside a
   * countdown that goes on counting.
   */
  refusal?: BidRefusal | null
  onBid(spice: number): void
  onPass(): void
}

/** The strip of seats, in bidding order. */
function TurnOrder(
  { order, toAct, passed, seat }: Pick<BiddingPanelProps, 'order' | 'toAct' | 'passed' | 'seat'>,
) {
  const r = 17
  const gap = r * 2 + 14
  return (
    <svg width={order.length * gap} height={r * 2 + 26} role="list"
      aria-label="bidding order">
      {order.map((f, i) => {
        const x = r + 4 + i * gap
        const y = r + 4
        const hasPassed = passed.includes(f)
        return (
          <g key={f} role="listitem"
            aria-label={`${FACTION_LOOK[f].name}${hasPassed ? ', passed' : ''}${f === toAct ? ', to act' : ''}${f === seat ? ', you' : ''}`}>
            {/* Dimmed rather than removed: who has dropped out is part of
                reading the table, and a seat that vanished would also move
                everyone after it. */}
            <g opacity={hasPassed ? 0.32 : 1}>
              <SeatMark faction={f} x={x} y={y} r={r} />
            </g>
            {f === toAct && (
              <circle cx={x} cy={y} r={r + 4} fill="none" stroke={SAND} strokeWidth="2.5" />
            )}
            {hasPassed && (
              <path d={`M${x - r * 0.7} ${y + r * 0.7} L${x + r * 0.7} ${y - r * 0.7}`}
                stroke={SAND} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            )}
            {f === seat && (
              <text x={x} y={y + r + 15} textAnchor="middle" fontSize="10" fill={SAND}
                fontFamily="Georgia, serif" opacity="0.75">you</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** The countdown, as a bar and a number. */
function Clock({ closesAt, now }: { closesAt: number; now: number }) {
  const left = Math.max(0, closesAt - now)
  const seconds = Math.ceil(left / 1000)
  // Against fifteen, because that is what the server gives a bidder. Clamped so
  // a clock that has been sitting past its deadline does not draw a negative
  // bar — which happens whenever a tab was backgrounded.
  const fraction = Math.max(0, Math.min(1, left / 15_000))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#ffffff22', borderRadius: 3 }}>
        <div style={{
          width: `${(fraction * 100).toFixed(1)}%`, height: '100%', borderRadius: 3,
          background: seconds <= 5 ? '#c0392b' : SAND,
        }} />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right' }}
        aria-label={`${seconds} seconds left`}>{seconds}s</span>
    </div>
  )
}

export function BiddingPanel(props: BiddingPanelProps) {
  const {
    ask, order, toAct, passed, seat, spice, hand, revealed,
    closesAt, now, refusal, onBid, onPass,
  } = props
  const minimum = ask.high ? ask.high.spice + 1 : MINIMUM_OPENING_BID
  const [amount, setAmount] = useState(minimum)
  const mine = toAct === seat
  const remaining = ask.cardCount - ask.index - 1

  return (
    // The scrim dims the board and nothing else. It does not cover it: the
    // territory being fought over is why the bid is worth making.
    <div style={{
      position: 'absolute', inset: 0, background: '#000000a8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div role="dialog" aria-label="treachery bidding" style={{
        background: INK, color: SAND, border: `1px solid ${SAND}44`, borderRadius: 10,
        padding: 18, minWidth: 520, maxWidth: 720,
        font: '14px Georgia, "Times New Roman", serif',
        boxShadow: '0 18px 60px #000000cc',
      }}>
        <div style={{ display: 'flex', gap: 18 }}>
          {/* ── the card ─────────────────────────────────────────────────── */}
          <div style={{ width: CARD_W * 0.8 }}>
            {revealed
              ? <TreacheryCardFace card={revealed} width={CARD_W * 0.8} />
              : <TreacheryCardBack width={CARD_W * 0.8} />}
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8, textAlign: 'center' }}>
              {revealed
                // Said out loud, because a seat seeing a face-up card needs to
                // know the rest of the table is not seeing it too.
                ? 'You alone can see this card'
                : 'Face down'}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18 }}>
                Card {ask.index + 1} of {ask.cardCount}
              </div>
              <div style={{ opacity: 0.75, fontSize: 12 }}>
                {remaining === 0 ? 'last card of the row' : `${remaining} more after this one`}
              </div>
            </div>

            {/* ── the standing bid ───────────────────────────────────────── */}
            <div style={{ fontSize: 16 }}>
              {ask.high
                ? <>Standing bid <strong>{ask.high.spice}</strong> to{' '}
                  <span style={{ color: FACTION_LOOK[ask.high.faction].colour }}>
                    {FACTION_LOOK[ask.high.faction].name}
                  </span></>
                : <span style={{ opacity: 0.8 }}>No bids yet</span>}
            </div>

            <TurnOrder order={order} toAct={toAct} passed={passed} seat={seat} />

            <Clock closesAt={closesAt} now={now} />

            {/* ── acting ─────────────────────────────────────────────────── */}
            {mine ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="dune-bid" style={{ fontSize: 12, opacity: 0.8 }}>Bid</label>
                <input id="dune-bid" type="number" min={minimum} max={spice} value={amount}
                  onChange={e => setAmount(Number(e.target.value))}
                  style={{
                    width: 72, background: '#ffffff12', color: SAND,
                    border: `1px solid ${SAND}44`, borderRadius: 4, padding: '4px 6px',
                  }} />
                <button type="button" onClick={() => onBid(amount)}
                  style={{ padding: '5px 14px', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
                  Bid
                </button>
                <button type="button" onClick={onPass}
                  style={{
                    padding: '5px 14px', borderRadius: 4, cursor: 'pointer',
                    background: 'transparent', color: SAND, border: `1px solid ${SAND}55`,
                  }}>
                  Pass
                </button>
                <span style={{ fontSize: 12, opacity: 0.7 }}>minimum {minimum}</span>
              </div>
            ) : (
              <div style={{ opacity: 0.8 }}>
                Waiting for {FACTION_LOOK[toAct].name}
              </div>
            )}

            {/* PRIVATE. Rendered only for the bidder it belongs to, and beside a
                clock that has not been reset — a refused bid is not a way to buy
                time to think. */}
            {refusal && (
              <div role="alert" style={{ fontSize: 12, color: '#e8a0a0' }}>
                {REFUSAL_TEXT[refusal]} <span style={{ opacity: 0.7 }}>The clock is still running.</span>
              </div>
            )}
          </div>
        </div>

        {/* ── what this seat holds ─────────────────────────────────────────── */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${SAND}22`, paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Your hand</span>
            <span>{spice} spice</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, minHeight: CARD_H * 0.3 }}>
            {hand.length === 0
              ? <span style={{ fontSize: 12, opacity: 0.6 }}>no cards</span>
              : hand.map((c, i) => (
                <TreacheryCardFace key={`${c.id}-${i}`} card={c} width={CARD_W * 0.3} />
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
