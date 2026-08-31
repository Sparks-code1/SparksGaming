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
import { FACTION_LOOK, SeatMark, SeatFilters } from './SeatLayer'

const PALE = '#f0e2bb'
const WAITING = '#c9542a'

/** The faction's own mark, as a small round avatar. */
function Avatar({ faction, r = 15 }: { faction: FactionId; r?: number }) {
  return (
    <svg width={r * 2} height={r * 2} viewBox={`${-r} ${-r} ${r * 2} ${r * 2}`}
      style={{ display: 'block', flex: '0 0 auto' }}>
      <SeatFilters />
      <SeatMark faction={faction} x={0} y={0} r={r - 1} />
    </svg>
  )
}

export interface PlayerHudProps {
  rows: readonly HudRow[]
  /** Whose decision the table is waiting on. Public — see DuneGameState. */
  awaiting: FactionId | null
  /** This client's own seat, marked so a player can find themselves. */
  seat?: FactionId | null
  /**
   * Seats that have declared themselves done with setup. Public, off the
   * shared row's setup window; absent outside setup.
   */
  ready?: readonly FactionId[]
}

/** What a faction's elite forces are called. Display copy, not rules data. */
const ELITE: Partial<Record<FactionId, string>> = {
  emperor: 'Sardaukar',
  fremen: 'Fedaykin',
}

/**
 * One faction, as a bubble.
 *
 * ROUNDED AND SEPARATE, so six of them read as six people rather than as a
 * table of numbers. The faction's own mark sits in it — the same mark as on its
 * seat on the board, so the colour is not doing the identifying alone.
 */
function Bubble(
  { row, awaiting, own, ready }:
  { row: HudRow; awaiting: boolean; own: boolean; ready: boolean },
) {
  const look = FACTION_LOOK[row.faction]
  return (
    <div data-faction={row.faction} data-awaiting={awaiting || undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px 7px 7px', borderRadius: 999,
        // The faction's colour, dimmed to a ground it can carry text on. Its
        // full strength is on the mark and the ring, where it is a signal
        // rather than a background.
        background: `${look.colour}2e`,
        border: `1px solid ${awaiting ? WAITING : look.colour + '88'}`,
        boxShadow: awaiting ? `0 0 0 2px ${WAITING}55` : own ? '0 0 0 1px #ffffff33' : undefined,
      }}>
      <Avatar faction={row.faction} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 12.5,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {look.name}
          {own && <span style={{ opacity: 0.55, fontSize: 10 }}> (you)</span>}
        </span>
        {/* SAID IN WORDS. A red ring on its own is a colour somebody has to be
            told the meaning of — and was: the first question anyone asked of
            this screen was why one player was red. */}
        {awaiting && (
          <span style={{ display: 'block', fontSize: 9.5, letterSpacing: 1, color: WAITING }}>
            WAITING ON THEM
          </span>
        )}
        {/* SAID IN WORDS, like the ring: during setup the question the whole
            table keeps asking is who has not pressed the button yet. */}
        {ready && (
          <span data-ready="yes"
            style={{ display: 'block', fontSize: 9.5, letterSpacing: 1, color: '#27AE60' }}>
            READY
          </span>
        )}
      </span>
      <Stat label="forces" value={row.forcesOnBoard} title="Forces on the board" />
      <Stat label="holds" value={row.strongholds} title="Strongholds held" />
      <Reserves row={row} />
      <Stat label="cards" value={row.handCount} title="Treachery cards held" />
    </div>
  )
}

/**
 * Reserves, with the elites beside the plain rather than inside them.
 *
 * 15+5★ says something 20 cannot: the Emperor's five Sardaukar are pieces the
 * whole table can see waiting, and a battle is priced differently against a
 * reserve that is a quarter elite. Advanced game only — in the basic game the
 * row has no starred count and this is one plain number.
 */
function Reserves({ row }: { row: HudRow }) {
  const starred = row.reservesStarred ?? 0
  const elite = ELITE[row.faction] ?? 'elite forces'
  return (
    <span data-stat="reserve" data-starred={starred > 0 ? starred : undefined}
      title={starred > 0
        ? `Forces in reserve, of which ${starred} are ${elite}`
        : 'Forces in reserve'}
      style={{ textAlign: 'right', minWidth: 30, whiteSpace: 'nowrap' }}>
      <b style={{ fontSize: 13, fontFamily: "Georgia, 'Times New Roman', serif" }}>
        {row.reserves}
        {starred > 0 && (
          <span style={{ color: '#f0c93f', fontSize: 11 }}>+{starred}★</span>
        )}
      </b>
      <span style={{ opacity: 0.5, fontSize: 9, display: 'block', letterSpacing: 0.5 }}>
        reserve
      </span>
    </span>
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

export function PlayerHud({ rows, awaiting, seat, ready = [] }: PlayerHudProps) {
  const ordered = pairAllies(rows)
  return (
    <aside data-layer="player-hud" aria-label="Players"
      style={{
        flex: '0 0 auto', color: PALE, overflowY: 'auto',
        borderBottom: '1px solid #ffffff1f',
        // Faction names and three counters. Nothing here is copy.
        userSelect: 'none', WebkitUserSelect: 'none',
      }}>
      <h2 style={{
        margin: 0, padding: '7px 10px', borderBottom: '1px solid #ffffff1f',
        fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 12,
        letterSpacing: 1.4, fontWeight: 400,
      }}>
        PLAYERS
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 9px' }}>
        {ordered.map((row, i) => {
          // The pair is opened by the first of the two and closed by the second,
          // read off the neighbour rather than the row itself, so the join is one
          // mark between two bubbles instead of a decoration on each.
          const next = ordered[i + 1]
          const opensPair = !!row.ally && next?.faction === row.ally
          const closesPair = !!row.ally && ordered[i - 1]?.faction === row.ally
          const mate = row.ally ? FACTION_LOOK[row.ally] : null
          return (
            <div key={row.faction} data-pair={opensPair || closesPair ? 'yes' : undefined}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Bubble row={row} awaiting={row.faction === awaiting} own={row.faction === seat}
                ready={ready.includes(row.faction)} />
              {/* The join: a short link in BOTH colours, between the two bubbles
                  it belongs to. An alliance is a pair, and a mark on one bubble
                  alone would say the wrong thing. */}
              {opensPair && mate && (
                <div data-bracket="yes" style={{
                  display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 22,
                  marginTop: -3, marginBottom: -3,
                }}>
                  <span aria-hidden style={{
                    width: 16, height: 3, borderRadius: 2,
                    background: `linear-gradient(90deg, ${FACTION_LOOK[row.faction].colour}, ${mate.colour})`,
                  }} />
                  <span style={{
                    fontSize: 9, letterSpacing: 1, opacity: 0.65,
                    fontFamily: "Georgia, 'Times New Roman', serif",
                  }}>ALLIED WITH {mate.name.toUpperCase()}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* THE READY BUTTON IS NOT HERE ANY MORE. It sat bottom-right of this
          column on the reasoning that pressing it is a statement about the
          list of seats — but it answers the questions in the setup column on
          the far side of the board, and players hunted across the screen for
          it. It now closes that column instead; see SetupWindow. What stays
          here is the READY tag in each seat's own bubble, which is the status
          this column is for. */}
    </aside>
  )
}

export default PlayerHud
