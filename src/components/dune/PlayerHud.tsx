/**
 * Every seat at a glance, down the right.
 *
 * ONLY PUBLIC FACTS. Forces standing on the board, strongholds held, and how
 * many treachery cards a hand holds — all three are things you can see across a
 * real table. What is deliberately NOT here: spice, which is hidden behind each
 * player's shield, and which cards those are. Both live in match_secrets, and
 * neither has a prop on this component to arrive through.
 *
 * The numbers are DERIVED from the same forces the board draws (see
 * lib/dune/hud), so the count beside a faction and the pieces in its territories
 * cannot disagree.
 *
 * ALLIES ARE PAIRED. An alliance changes what every other player should be
 * doing, so it has to read without being looked for: the two rows are moved
 * adjacent and share a bracket down their left edge in both colours. Two allied
 * rows at opposite ends of the list, each with a little "allied with…" note, is
 * information nobody assembles in the middle of their own turn.
 */
import type { FactionId } from '@/types/Dune/Faction'
import type { HudRow } from '@/lib/dune/hud'
import { pairAllies } from '@/lib/dune/hud'
import { FACTION_LOOK } from './SeatLayer'

const PALE = '#f0e2bb'
const WAITING = '#c9542a'

/** How wide the HUD is. Exported for the same reason as CHAT_WIDTH. */
export const HUD_WIDTH = 236

export interface PlayerHudProps {
  rows: readonly HudRow[]
  /** Whose decision the table is waiting on. Public — see DuneGameState. */
  awaiting: FactionId | null
  /** This client's own seat, marked so a player can find themselves. */
  seat?: FactionId | null
  /**
   * Which turn it is, 1–10.
   *
   * Here because the phase strip that used to carry it is gone. The board marks
   * the PHASE on its own nine medallions, but its turn dial prints 1–10 without
   * saying which one you are on, so the number would have vanished with the
   * strip. A game of ten turns is a countdown and wants to be visible.
   */
  turn?: number
}

/** One faction's line. */
function Row({ row, awaiting, own }: { row: HudRow; awaiting: boolean; own: boolean }) {
  const look = FACTION_LOOK[row.faction]
  return (
    <div data-faction={row.faction} data-awaiting={awaiting || undefined}
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center',
        gap: 8, padding: '6px 9px',
        background: awaiting ? '#c9542a26' : own ? '#ffffff0d' : 'transparent',
        borderLeft: `4px solid ${look.colour}`,
        outline: awaiting ? `1px solid ${WAITING}` : undefined,
      }}>
      <span style={{
        fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 12.5,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {look.name}
        {own && <span style={{ opacity: 0.55, fontSize: 10 }}> (you)</span>}
      </span>
      <Stat label="forces" value={row.forcesOnBoard} title="Forces on the board" />
      <Stat label="holds" value={row.strongholds} title="Strongholds held" />
      <Stat label="cards" value={row.handCount} title="Treachery cards held" />
    </div>
  )
}

function Stat({ label, value, title }: { label: string; value: number; title: string }) {
  return (
    <span title={title} data-stat={label} style={{ textAlign: 'right', minWidth: 30 }}>
      <b style={{ fontSize: 13, fontFamily: "Georgia, 'Times New Roman', serif" }}>{value}</b>
      <span style={{ opacity: 0.5, fontSize: 9, display: 'block', letterSpacing: 0.5 }}>
        {label}
      </span>
    </span>
  )
}

export function PlayerHud({ rows, awaiting, seat, turn }: PlayerHudProps) {
  const ordered = pairAllies(rows)
  return (
    <aside data-layer="player-hud" aria-label="Players"
      style={{
        width: HUD_WIDTH, flex: '0 0 auto', background: '#131c2e', color: PALE,
        borderLeft: '1px solid #ffffff1f', overflowY: 'auto',
      }}>
      <h2 style={{
        margin: 0, padding: '7px 10px', borderBottom: '1px solid #ffffff1f',
        fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 12,
        letterSpacing: 1.4, fontWeight: 400,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        PLAYERS
        {turn != null && (
          <span data-turn={turn} style={{ opacity: 0.75 }}>
            TURN <b style={{ fontSize: 13 }}>{turn}</b>
          </span>
        )}
      </h2>

      {ordered.map((row, i) => {
        // The bracket is drawn round the PAIR, so it is opened by the first of
        // the two and closed by the second. Reading the neighbour rather than
        // the row itself is what makes it one mark instead of two.
        const next = ordered[i + 1]
        const opensPair = !!row.ally && next?.faction === row.ally
        const closesPair = !!row.ally && ordered[i - 1]?.faction === row.ally
        const inPair = opensPair || closesPair
        const mate = inPair ? FACTION_LOOK[row.ally as FactionId] : null
        return (
          <div key={row.faction} data-pair={inPair ? 'yes' : undefined}
            style={{
              display: 'flex', alignItems: 'stretch',
              borderBottom: closesPair || !inPair ? '1px solid #ffffff12' : 'none',
            }}>
            {/* The bracket: this row's own colour beside its ally's, so the
                mark says WHO with whom rather than merely "these two". */}
            <span aria-hidden data-bracket={inPair ? 'yes' : undefined}
              style={{
                width: 5, flex: '0 0 auto',
                background: mate ? mate.colour : 'transparent',
                borderTopLeftRadius: opensPair ? 4 : 0,
                borderBottomLeftRadius: closesPair ? 4 : 0,
              }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Row row={row} awaiting={row.faction === awaiting} own={row.faction === seat} />
              {opensPair && mate && (
                <div style={{
                  padding: '0 9px 4px 13px', fontSize: 9.5, letterSpacing: 1,
                  opacity: 0.6, fontFamily: "Georgia, 'Times New Roman', serif",
                }}>
                  ALLIED WITH {mate.name.toUpperCase()}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </aside>
  )
}

export default PlayerHud
