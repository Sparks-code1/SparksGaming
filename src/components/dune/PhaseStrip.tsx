/**
 * The nine phases of a turn, across the top of the screen.
 *
 * ALL NINE, ALWAYS. Not a label saying what phase it is — the point of the
 * strip is that a player can see what has happened, what is happening and what
 * is still to come without knowing the sequence by heart. A turn in Dune runs
 * the same nine every time, and half the questions at a real table are "wait,
 * is revival before or after bidding".
 *
 * The order comes from DUNE_PHASES, which is also what the type is read off, so
 * this cannot list a phase the game does not have or miss one it does. The
 * board prints the same nine as medallions — see PHASE_SYMBOLS in
 * scripts/build-dune-board.mjs — and both come from the same list.
 */
import { DUNE_PHASES } from '@/types/Dune/Game'
import type { GamePhase } from '@/types/Dune/Game'

/** The red the board already uses for the storm and for danger. */
const CURRENT = '#c9542a'
const PALE = '#f0e2bb'

export interface PhaseStripProps {
  phase: GamePhase
  /** 1–10, shown at the end. A game is ten turns and that is a countdown. */
  turn: number
}

export function PhaseStrip({ phase, turn }: PhaseStripProps) {
  const at = DUNE_PHASES.indexOf(phase)
  return (
    <nav data-layer="phase-strip" aria-label="Turn phases"
      style={{
        display: 'flex', alignItems: 'stretch', gap: 2,
        background: '#0b1020', borderBottom: '1px solid #ffffff1f',
      }}>
      {DUNE_PHASES.map((p, i) => {
        const current = p === phase
        // Everything before the current phase is done. Dimmed rather than
        // hidden: "we are past bidding" is worth being able to see.
        const done = at >= 0 && i < at
        return (
          <div key={p} data-phase={p} data-current={current || undefined}
            aria-current={current ? 'step' : undefined}
            title={`Phase ${i + 1} — ${p}`}
            style={{
              flex: 1, padding: '7px 6px 6px', textAlign: 'center',
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 11.5, letterSpacing: 0.4, lineHeight: 1.15,
              color: current ? '#fff' : PALE,
              opacity: current ? 1 : done ? 0.4 : 0.72,
              background: current ? CURRENT : 'transparent',
              borderTop: `2px solid ${current ? CURRENT : 'transparent'}`,
              fontWeight: current ? 700 : 400,
            }}>
            <span style={{ opacity: 0.6, fontSize: 9.5, display: 'block' }}>{i + 1}</span>
            {p}
          </div>
        )
      })}
      <div style={{
        padding: '7px 12px 6px', textAlign: 'center', minWidth: 62,
        fontFamily: "Georgia, 'Times New Roman', serif", color: PALE,
        borderLeft: '1px solid #ffffff1f',
      }}>
        <span style={{ opacity: 0.6, fontSize: 9.5, display: 'block' }}>TURN</span>
        <b style={{ fontSize: 13 }}>{turn}</b>
      </div>
    </nav>
  )
}

export default PhaseStrip
