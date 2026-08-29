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
import { useEffect, useState } from 'react'
import { SeatMark, FACTION_LOOK } from './SeatLayer'
import { TreacheryCardFace, TreacheryCardBack, CARD_W, CARD_H } from './TreacheryCardFace'
import DraggableResizable from '@/components/DraggableResizable'
import { CARD_ZOOM } from './OwnStrip'
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

/**
 * The auction, shut down to a bar along the foot of the board area.
 *
 * NO SCRIM: the point of shutting it is to see the map, and a dimmed map is
 * most of the way back to not seeing it.
 *
 * EVERYTHING NEEDED TO KEEP PLAYING IS STILL HERE — the standing bid, whose
 * turn it is, the clock, and Bid and Pass. An auction you have to reopen before
 * you can answer it is one you will miss the clock on, and the clock does not
 * stop for a player who wanted to look at the board.
 *
 * Its own component so both states can be rendered on their own. The claim that
 * matters is about what SURVIVES being shut, and that is not checkable on a
 * component whose shut state only exists after a click.
 */
export function BiddingBar(
  { ask, closesAt, now, refusal, onOpen, children }:
  Pick<BiddingPanelProps, 'ask' | 'closesAt' | 'now' | 'refusal'>
  & { onOpen(): void; children: React.ReactNode },
) {
  return (
    <div data-layer="bidding-bar" style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '8px 12px', background: INK, color: SAND,
      borderTop: `1px solid ${SAND}44`, boxShadow: '0 -10px 30px #0009',
      font: '14px Georgia, "Times New Roman", serif',
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      <button type="button" onClick={onOpen} aria-expanded={false}
        aria-label="Open the bidding panel"
        style={{
          background: 'transparent', color: SAND, border: `1px solid ${SAND}55`,
          borderRadius: 4, padding: '3px 9px', cursor: 'pointer',
        }}>▲</button>
      <span>Card {ask.index + 1} of {ask.cardCount}</span>
      <span style={{ opacity: 0.85 }}>
        {ask.high
          ? <>bid <strong>{ask.high.spice}</strong> to{' '}
            <span style={{ color: FACTION_LOOK[ask.high.faction].colour }}>
              {FACTION_LOOK[ask.high.faction].name}
            </span></>
          : 'no bids yet'}
      </span>
      <span style={{ flex: 1, minWidth: 90 }}><Clock closesAt={closesAt} now={now} /></span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</span>
      {refusal && (
        <span role="alert" style={{ fontSize: 12, color: '#e8a0a0' }}>
          {(REFUSAL_TEXT as Record<string, string>)[refusal] ?? 'Refused: ' + refusal}{' '}
          <span style={{ opacity: 0.7 }}>The clock is still running.</span>
        </span>
      )}
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

  /**
   * Follow the standing bid, so the next player can just press Bid.
   *
   * useState(minimum) reads its argument ONCE. The box therefore kept whatever
   * the minimum was when the panel first mounted — through every raise by
   * everybody else — and the next bidder had to retype a number the auction
   * already knew. One more than the standing bid is what they almost always
   * want, and it is exactly what the server will accept.
   *
   * Keyed on the minimum rather than on every render, so a player who types 12
   * keeps 12 until somebody actually raises. When one does, their old number is
   * stale anyway — it was an answer to a different price.
   */
  useEffect(() => { setAmount(minimum) }, [minimum])
  // SHUT, not gone. An auction cannot be dismissed — you bid or you pass — but
  // it can be got out of the way. The panel covers the middle of the board, and
  // the board is how you decide what a card is worth: whether you can reach
  // Arrakeen this turn, who is standing next to your spice. Being unable to look
  // at the map while pricing a card for it is the whole complaint.
  const [shut, setShut] = useState(false)
  /** One card opened at reading size — the same floating view the tray uses,
   *  because a card most needs reading BEFORE a bid: your own hand, and the
   *  Atreides' glimpse of the card on the block. */
  const [zoomCard, setZoomCard] = useState<TreacheryCard | null>(null)
  /**
   * The moment between cards, when the last one has closed and the next is not
   * open yet.
   *
   * READ OFF THE ASK, which the server stamped, and counted against this
   * client's injected clock like every other window here. Bidding is refused
   * during it server-side too — this only stops the panel offering a button
   * whose one outcome is 'between-cards'.
   */
  const between = ask.pauseUntil != null && now < ask.pauseUntil
  const untilNext = ask.pauseUntil != null ? Math.max(0, ask.pauseUntil - now) : 0

  // NOT guarded on the pause: `act` branches on `between` before it reaches
  // here, so a second guard was dead code — sabotage removing it changed
  // nothing, which is the only honest reason to find out it was redundant.
  const mine = toAct === seat
  const remaining = ask.cardCount - ask.index - 1

  const act = between ? (
    // WHAT JUST HAPPENED, and how long before the next one. The seat that won
    // has a card it has not looked at; everybody else has a result to read.
    <span style={{ opacity: 0.8 }}>
      next card in {Math.ceil(untilNext / 1000)}s
    </span>
  ) : mine ? (
    <>
      <label htmlFor="dune-bid" style={{ fontSize: 12, opacity: 0.8 }}>Bid</label>
      <input id="dune-bid" type="number" min={minimum} max={spice} value={amount}
        onChange={e => setAmount(Number(e.target.value))}
        style={{
          width: 72, background: '#ffffff12', color: SAND,
          border: `1px solid ${SAND}44`, borderRadius: 4, padding: '4px 6px',
          // AN INPUT MUST STAY SELECTABLE. `user-select: none` on an ancestor
          // reaches into a text field and takes select-all and drag-select with
          // it, which turns correcting a mistyped bid into deleting it one
          // character at a time — against a fifteen-second clock.
          userSelect: 'text', WebkitUserSelect: 'text',
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
    </>
  ) : (
    <span style={{ opacity: 0.8 }}>Waiting for {FACTION_LOOK[toAct].name}</span>
  )

  if (shut) {
    return (
      <BiddingBar ask={ask} closesAt={closesAt} now={now} refusal={refusal}
        onOpen={() => setShut(false)}>{act}</BiddingBar>
    )
  }

  return (
    // The scrim dims the board and nothing else. It does not cover it: the
    // territory being fought over is why the bid is worth making.
    <div data-layer="bidding" style={{
      position: 'absolute', inset: 0, background: '#000000a8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      // Scrolls rather than spilling. A hard minWidth in a column narrower than
      // it does not shrink the panel, it puts half of it outside the board area
      // and over the chat.
      overflow: 'auto', padding: 8,
      // Same reason as the board underneath it: faction names and numbers, and
      // a player clicking Bid in a hurry should not paint half the panel blue.
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      <div role="dialog" aria-label="treachery bidding" style={{
        background: INK, color: SAND, border: `1px solid ${SAND}44`, borderRadius: 10,
        padding: 16, width: 'min(660px, 100%)', maxWidth: 660,
        // Never taller than the area it floats over. Beyond that it scrolls
        // inside itself rather than growing past the board and off the screen.
        maxHeight: '100%', overflowY: 'auto',
        font: '14px Georgia, "Times New Roman", serif',
        boxShadow: '0 18px 60px #000000cc',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button type="button" onClick={() => setShut(true)} aria-expanded
            aria-label="Shut the bidding panel to see the board"
            style={{
              background: 'transparent', color: SAND, border: `1px solid ${SAND}55`,
              borderRadius: 4, padding: '2px 9px', cursor: 'pointer', fontSize: 12,
            }}>▼ board</button>
        </div>
        {/* WRAPS. The middle column is only as wide as the board is tall, and the
            board is taller than it is wide, so this row is regularly narrower
            than the card and the controls side by side. Wrapping puts the card
            above them instead of pushing half the panel off the edge. */}
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {/* ── the card ─────────────────────────────────────────────────── */}
          <div style={{ width: CARD_W * 0.8 }}>
            {revealed
              ? <button type="button" onClick={() => setZoomCard(revealed)}
                  aria-label={`Open ${revealed.name}`}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'zoom-in', lineHeight: 0,
                  }}>
                  <TreacheryCardFace card={revealed} width={CARD_W * 0.8} />
                </button>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {act}
            </div>

            {/* PRIVATE. Rendered only for the bidder it belongs to, and beside a
                clock that has not been reset — a refused bid is not a way to buy
                time to think. */}
            {refusal && (
              <div role="alert" style={{ fontSize: 12, color: '#e8a0a0' }}>
                {(REFUSAL_TEXT as Record<string, string>)[refusal] ?? 'Refused: ' + refusal}{' '}
          <span style={{ opacity: 0.7 }}>The clock is still running.</span>
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
                <button key={`${c.id}-${i}`} type="button" onClick={() => setZoomCard(c)}
                  aria-label={`Open ${c.name}`}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'zoom-in', lineHeight: 0,
                  }}>
                  <TreacheryCardFace card={c} width={CARD_W * 0.3} />
                </button>
              ))}
          </div>
        </div>

        {zoomCard && (
          <DraggableResizable title={zoomCard.name}
            accentColor={FACTION_LOOK[seat].colour}
            width={CARD_ZOOM + 34} storageKey={`dune-card-${seat}`}
            onClose={() => setZoomCard(null)}>
            <div data-layer="card-zoom" style={{ display: 'flex', justifyContent: 'center' }}>
              <TreacheryCardFace card={zoomCard} width={CARD_ZOOM} />
            </div>
          </DraggableResizable>
        )}
      </div>
    </div>
  )
}
