/**
 * The phase's countdown, printed on the board between the two off-board boxes.
 *
 * WHERE EVERYONE IS ALREADY LOOKING. A deadline in a side panel is a deadline
 * half the table misses — the same argument the `awaiting` ring makes, and the
 * reason that ring is on the board rather than only in the HUD. This sits in
 * the gap the printed board leaves between the Tleilaxu Tanks on the left and
 * the spice deck on the right: the one band of the lower board with nothing
 * drawn in it.
 *
 * IT COUNTS TOWARD A STAMPED MOMENT and never measures a duration. `closesAt`
 * comes from public state, put there once by the server; each client subtracts
 * its own clock from it. A timer that counted down a duration would drift the
 * instant a tab was backgrounded, and six clients would drift differently — the
 * rule every window in this codebase follows.
 *
 * WHOLE SECONDS, because `now` arrives once a second. Tenths off a one-second
 * tick are a lie told to one decimal place: the digit never changes, the number
 * jumps a whole second at a time, and it reads as a stutter rather than as a
 * clock. The honest choice at this tick rate is the unit the tick delivers.
 * Ceiled, so a window with any time left shows at least 1 and the count runs
 * 15, 14 … 1 rather than resting on 0 for a second.
 */


const INK = '#3f2c1a'
/** Comfortably inside the gap, which is 266 wide. */
const BAR = 150
/**
 * How far the drawn block reaches above and below PHASE_TIMER_CENTRE.
 *
 * Exported so the test can assert the whole block sits inside the boxes' band
 * rather than only its centre point — the centre being inside a band says
 * nothing about a label reaching out of the top of it.
 */
export const PHASE_TIMER_EXTENT = { above: 28, below: 22 }
const SERIF = "Georgia, 'Times New Roman', serif"

/**
 * The middle of the band between the two off-board boxes.
 *
 * MEASURED OFF THE PRINTED BOARD, not derived from DUNE_SPICE_DECK_AREA. That
 * constant is the largest rectangle that fits INSIDE the spice deck box (x
 * 789.6), not the box itself (x 617.6) — the box is a wedge and the two are
 * nowhere near the same. Deriving the gap from it put this at x 398 with a
 * claimed width of 783, which spans most of the board including the tanks box;
 * it only looked plausible because 398 happens to fall inside the real gap.
 *
 * The two printed boxes are mirror images about the board's centre line — both
 * 351 wide and 215 tall at y 883, the left starting at 0.5 and the right at
 * 617.6 — so the gap between them is centred on that line.
 *
 * ON THE LABELS' OWN AXIS. The board prints TLEILAXU TANKS and SPICE DECK at
 * y 1071.94, both with dominant-baseline="central" — so that number is the
 * MIDDLE of the lettering, not its baseline, and the clock's number is drawn
 * the same way at the same y. The three then share one line across the bottom
 * of the board and read as one band rather than three things at three heights.
 *
 * MEASURED, NOT ESTIMATED. phasetimertest reads the tanks label out of the
 * shipped SVG and asserts this equals its y, so a regenerated board that moves
 * the lettering takes the clock with it — or fails saying it did not.
 *
 * It arrived here by stages: the band's midpoint (990.5), then lower (1022),
 * then this. The first two were guesses at where the boxes' contents sit; this
 * one is where they actually are.
 */
export const PHASE_TIMER_CENTRE = { x: 485, y: 1071.94 }
/** Half the room available, for anything drawn either side of the centre. */
export const PHASE_TIMER_HALF_WIDTH = 133

export interface PhaseTimerProps {
  /** The phase being counted, shown above the clock. */
  phase: string
  /** When it shuts, stamped by the server. Null when nothing is running. */
  closesAt?: number | null
  /** This client's clock. Injected, like every other clock here. */
  now: number
  /**
   * How long the window is, in ms, for the bar underneath.
   *
   * REQUIRED FOR A FRACTION, and that is why it is a separate value rather than
   * something derived. `closesAt` says when the window shuts and nothing about
   * when it opened, so remaining/total cannot be computed from it — the first
   * version of this tried, and the expression reduced to remaining/remaining,
   * a bar that sat permanently full while the number beside it counted down.
   *
   * Absent means no bar. The number alone is still the truth.
   */
  windowMs?: number
}

export function PhaseTimer({ phase, closesAt, now, windowMs }: PhaseTimerProps) {
  // NOTHING RATHER THAN ZERO. A permanent 0.0s reads as a stuck phase, and most
  // of a turn has no clock running at all.
  if (closesAt == null) return null

  const remaining = Math.max(0, closesAt - now)
  // NOTHING ONCE IT HAS RUN OUT. A "CLOSED" sign sat on the board until the
  // server got round to clearing the window, which is a second answer to
  // whether the phase is over — and the wrong one, since the window is closed
  // by the row changing, not by this clock reaching zero.
  if (remaining === 0) return null

  const seconds = Math.ceil(remaining / 1000)
  const { x, y } = PHASE_TIMER_CENTRE

  return (
    <g data-layer="phase-timer" data-phase={phase} data-remaining-ms={Math.round(remaining)}
      pointerEvents="none">
      <text x={x} y={y - 22} fontSize={10.5} fill={INK} textAnchor="middle"
        dominantBaseline="central" fontFamily={SERIF} letterSpacing={1.2} opacity={0.75}>
        {phase.toUpperCase()}
      </text>
      {/* CENTRAL, like the two printed labels either side of it — their y is
          the middle of the lettering, so a clock drawn from its baseline at the
          same y would sit half a line proud of them. */}
      <text x={x} y={y} fontSize={28} fill={INK} textAnchor="middle"
        dominantBaseline="central" fontFamily={SERIF} fontWeight="bold">
        {seconds}s
      </text>
      {/* A bar under the number, because a shrinking length is read faster than
          a falling number — and the number is what says how much is left. */}
      {windowMs != null && windowMs > 0 && (
        <>
          <rect x={x - BAR / 2} y={y + 17} width={BAR} height={5} rx={2.5} fill="#00000018" />
          <rect x={x - BAR / 2} y={y + 17} height={5} rx={2.5} fill="#c9542a"
            width={Math.max(0, Math.min(BAR, BAR * (remaining / windowMs)))} />
        </>
      )}
    </g>
  )
}

export default PhaseTimer
