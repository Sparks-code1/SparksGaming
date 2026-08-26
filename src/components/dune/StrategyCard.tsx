/**
 * A faction's strategy card: who you are, and how the faction is played.
 *
 * The rulebook ships one of these per faction — a paragraph on the faction's
 * handicaps and advantages, which is the one piece of writing a new player
 * actually needs and the one thing the faction card does not carry. The faction
 * card lists rules; this says what to do with them.
 *
 * WHERE THE WORDS COME FROM. docs/Strategy.md, parsed once by
 * scripts/build-strategy.mjs into src/data/dune/strategy.gen.ts and imported
 * like any other data. Nothing here parses markdown, and nothing fetches it —
 * see the notes at the top of that script for why the other three routes were
 * turned down.
 *
 * OVER THE BOARD. The faction card is a small draggable panel you park at the
 * side and leave up all game; this is the opposite kind of thing — several
 * hundred words you read once, between turns, and close. Read at the size that
 * panel opens at, it is a column of text five words wide.
 *
 * THE FIGURE IS NOT A LEADER. Each faction has a person it IS rather than one
 * of the five who fight for it — the Baron, Shaddam IV, Mohiam, Edric — and
 * those four pictures have sat in public/dune-leaders since the leaders were
 * wired up with nothing pointing at them. See FACTION_FIGURES.
 */
import { FACTION_STRATEGY } from '@/data/dune/strategy.gen'
import { FACTION_FIGURES, FigureDisc } from './LeaderDisc'
import { FACTION_LOOK, SeatMark, SeatFilters } from './SeatLayer'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

/** How wide the figure's disc is drawn, and the column it sits in. */
const DISC = 132

export interface StrategyCardProps {
  faction: FactionId
  /** Absent means the card is inert — the preview and the test render it so. */
  onClose?: () => void
}

export function StrategyCard({ faction, onClose }: StrategyCardProps) {
  const look = FACTION_LOOK[faction]
  const notes = FACTION_STRATEGY[faction]
  const figure = FACTION_FIGURES[faction]

  return (
    <article data-layer="strategy-card" data-faction={faction}
      style={{
        maxWidth: 760, width: '100%', maxHeight: '86vh', overflowY: 'auto',
        background: '#151d30', color: PALE, borderRadius: 10,
        border: '1px solid #ffffff22', borderTop: `5px solid ${look.colour}`,
        padding: '18px 22px 22px',
        // PROSE, so it is selectable — the same exception the faction card and
        // the ally's card get from the tray's blanket rule.
        userSelect: 'text', WebkitUserSelect: 'text',
      }}>

      {/* The faction's mark and name, with the close beside them. The mark is
          the same drawing as its seat on the board and its bubble in the HUD,
          so whose card this is reads before the words do. */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
        {/* data-part so the suite can read the mark off the card rather than
            off this file. Deleting the SeatMark inside it left every other
            check green: the faction's id is on the article, on the disc and in
            the aria-label, so "the card mentions the faction" was true of a
            card with no symbol on it. */}
        <svg data-part="faction-mark" width={38} height={38} viewBox="-19 -19 38 38"
          style={{ display: 'block', flex: '0 0 auto' }}>
          <SeatFilters />
          <SeatMark faction={faction} x={0} y={0} r={17} />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ font: `600 20px ${SERIF}`, letterSpacing: 0.6, display: 'block' }}>
            {look.name}
          </b>
          <span style={{ fontSize: 10.5, letterSpacing: 1.5, opacity: 0.5 }}>STRATEGY</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close the strategy card"
            style={{
              cursor: 'pointer', background: 'transparent', color: PALE,
              border: '1px solid #ffffff33', borderRadius: 4,
              padding: '5px 11px', font: `13px ${SERIF}`,
            }}>Close</button>
        )}
      </header>

      {/* WRAPS. The disc and the prose sit side by side while there is room and
          stack when there is not — this opens over the board, and the board's
          column is the width of the window minus two panels. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>

        <figure style={{
          margin: 0, width: DISC, flex: '0 0 auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <svg width={DISC} height={DISC} viewBox="-62 -62 124 124" style={{ display: 'block' }}>
            <FigureDisc faction={faction} r={60} />
          </svg>
          {/* UNDER THE PHOTO, in ordinary text rather than on the disc. A
              leader's name is set on an arc inside the rim, and BARON VLADIMIR
              HARKONNEN is five characters longer than the longest name that
              arc can hold. */}
          <figcaption data-figure-name={figure.name} style={{
            font: `600 13px ${SERIF}`, textAlign: 'center', lineHeight: 1.3,
          }}>{figure.name}</figcaption>
        </figure>

        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          {/* Who they are: the line under the heading in the document, which is
              also where the figure above is named. */}
          <p data-part="flavour" style={{
            margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5, opacity: 0.78,
            fontStyle: 'italic',
          }}>{notes.flavour}</p>

          <p data-part="strategy" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.62 }}>
            {notes.strategy}
          </p>
        </div>
      </div>
    </article>
  )
}

/**
 * The card, over everything.
 *
 * COVERING RATHER THAN DIMMING, like the charity modal and for the same reason:
 * what is behind it does not matter while you are reading it. Nothing on this
 * card is a decision, so there is no clock on it and nothing is waiting.
 *
 * Fixed rather than absolute, so it does not matter which column the button
 * that opened it lives in — the strip's floating panels already work this way.
 * Clicking the ground closes it, which is what everybody tries first; the
 * check on the target is what stops a click that lands on the card itself
 * from closing it on the way back up.
 */
export function StrategyOverlay({ faction, onClose }: { faction: FactionId; onClose(): void }) {
  return (
    <div data-layer="strategy-overlay" role="dialog" aria-modal="true"
      aria-label={`${FACTION_LOOK[faction].name} — strategy`}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        background: '#0d1220f2',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18,
      }}>
      <StrategyCard faction={faction} onClose={onClose} />
    </div>
  )
}

export default StrategyCard
