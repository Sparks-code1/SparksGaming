/**
 * The game screen.
 *
 * Chat down the left, board in the middle, and a right-hand column holding the
 * other players above your own things. The board is the biggest thing on the
 * screen because it is the game.
 *
 * THE BOARD IS BOUND BY HEIGHT, NOT WIDTH — it is taller than it is wide, so
 * the only thing that makes it bigger is more height, and anything laid across
 * the bottom of the window comes straight off it. The tray used to sit there
 * and cost it 153px: 818x927 in a column that had 616px of width going spare.
 *
 * Moved into the right-hand column, the board gets the whole window height and
 * draws 953x1080 at 1920x1080 — a third more area, and the ceiling, since it
 * now fills the taller axis exactly. Widening the side panels instead was the
 * other option and would have changed the board by nothing at all: it would
 * have taken width the board could not use anyway. The panels DO flex, but for
 * the leftover, not for the board's sake.
 *
 * THE PHASE IS ON THE BOARD. There was a strip of nine across the top saying
 * which phase it was; the board already prints those nine, in order, along its
 * own upper edge. Two lists of one thing is one list too many, and the printed
 * one is better — it has the symbols on it. The current one is ringed there
 * instead, and the strip is gone.
 *
 * THE ONE RULE THIS FILE ENFORCES. Everything above the bottom strip is public
 * by rule — pieces on the board, strongholds held, how many cards a hand holds,
 * who is allied with whom, whose decision the table is waiting on. The bottom
 * strip is the only place that shows what one seat alone may see, and it gets
 * it from `own`, which is the secrets channel. There is no path from `own` into
 * the HUD or the board: they take different props, and neither takes a spice
 * count, a card list or a traitor.
 *
 * WHY THE BOARD STAYS UNDER THE AUCTION. When bidding is running the panel
 * floats over a dimmed board rather than replacing it, because what a card is
 * worth is a question about the map — whether you can reach Arrakeen this turn,
 * who is standing next to your spice. A player who cannot see the territory
 * cannot price the card they are bidding on.
 */
import { useState } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import type { DuneGameState } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import { hudRows, allyOf } from '@/lib/dune/hud'
import { ChatPanel } from './ChatPanel'
import type { ChatMessage, ChatSendScope } from './ChatPanel'
import { PlayerHud } from './PlayerHud'
import { OwnStrip } from './OwnStrip'
import { DuneBoard } from './DuneBoard'
import { CHARITY_WINDOW_MS } from '@/lib/dune/charity'
import { WORM_SECONDS } from '@/lib/dune/spiceBlow'
import { BiddingPanel } from './BiddingPanel'
import { CharityModal } from './CharityModal'
import type { BiddingPanelProps } from './BiddingPanel'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import type { TreacheryCard } from '@/types/Dune/Treachery'

/**
 * The right-hand column: the HUD and the player's own tray, stacked.
 *
 * A RANGE, not a number. The board is bound by the window's height and cannot
 * grow into spare width however much there is, so on a wide screen the column
 * takes the surplus rather than leaving it as bare navy either side of the map.
 * The floor is what the tray needs to stay legible; the ceiling stops a very
 * wide window turning the column into the main event.
 */
const SIDE_WIDTH = 320
const SIDE_MIN = 268
const SIDE_MAX = 430

export interface DuneGameScreenProps {
  /** The shared row, as everyone receives it. */
  state: DuneGameState
  /** Which seat this browser holds. Null for a spectator. */
  seat: FactionId | null
  /**
   * This seat's own secrets row. Null for a spectator, and null while the
   * channel is still opening.
   *
   * NEVER from `state`. If this ever comes out of the shared row the whole
   * hidden-state design is gone, and nothing here would look any different —
   * which is exactly why it is a separate prop rather than a field.
   */
  own: DuneSecrets | null
  chat: readonly ChatMessage[]
  /**
   * Say something, and who to.
   *
   * PASSED STRAIGHT THROUGH. Which audience a line reaches is decided by the
   * row it is written to and the policy that reads it back — see
   * lib/dune/duneChat — so this screen has no opinion about it and should not
   * acquire one.
   */
  onSend?: (text: string, scope: ChatSendScope) => void
  /** Who else is at the table, for addressing a line to one of them. */
  talkingTo?: readonly { playerId: string; name: string }[]
  /**
   * The live auction, or null.
   *
   * Everything about it except `revealed` is public. `revealed` is the Atreides
   * prescience card and reaches this component through `own`, not through here
   * — see the assembly below.
   */
  bidding?: Omit<BiddingPanelProps, 'seat' | 'spice' | 'hand' | 'revealed' | 'now'> | null
  /**
   * The charity decision, when this seat has one to make.
   *
   * HANDLERS ONLY. Whether a window is open comes from public state, and what
   * this seat may claim comes from its own secrets — neither is passed in.
   * What the caller supplies is what to DO, because dispatching belongs to
   * whoever owns the session, not to a component that draws a board.
   *
   * Absent means no modal, which is what the preview and any spectator get.
   */
  charity?: {
    onClaim(): void
    onPass(): void
    busy?: boolean
    refused?: string | null
  } | null
  /** Injected, like every clock in this codebase. */
  now: number
}

export function DuneGameScreen({
  state, seat, own, chat, onSend, talkingTo, bidding = null, charity = null, now,
}: DuneGameScreenProps) {
  const [chatShut, setChatShut] = useState(false)
  const rows = hudRows(state)
  const mine = state.players.find(p => p.faction === seat) ?? null
  const myRow = rows.find(r => r.faction === seat) ?? null

  // Stacks are per faction so the board can colour them. Summed by cell rather
  // than drawn one per Force: two Fremen entries in one sector are one stack of
  // pieces on the table, and drawing them as two markers on the same point puts
  // one exactly on top of the other.
  const stacks = Object.values(
    state.forces.reduce<Record<string, {
      territoryId: string; sector: string; faction: FactionId; count: number
    }>>((acc, f) => {
      const key = `${f.territoryId}|${f.sector}|${f.faction}`
      acc[key] = acc[key]
        ? { ...acc[key], count: acc[key].count + f.count }
        : { territoryId: f.territoryId, sector: f.sector, faction: f.faction, count: f.count }
      return acc
    }, {}),
  )

  const seating = Object.fromEntries(state.players.map(p => [p.seat, p.faction]))

  /**
   * Whichever phase is holding a window open, if any.
   *
   * ONE CLOCK AT A TIME, because only one phase runs at a time. Charity's
   * window and the spice blow's pause cannot both be open — they are different
   * phases — so this picks whichever exists rather than trying to show both.
   *
   * Both deadlines are stamped by the server and read from public state, never
   * computed here: a client that worked out its own would drift from the other
   * five the moment a tab was backgrounded.
   */
  const timed = state as DuneGameState & {
    charity?: { expiresAt: number }
    spiceBlow?: { closesAt?: number }
  }
  const closesAt = timed.charity?.expiresAt ?? timed.spiceBlow?.closesAt ?? null
  const windowMs = timed.charity ? CHARITY_WINDOW_MS
    : timed.spiceBlow ? WORM_SECONDS * 1000
    : undefined

  return (
    <div data-layer="dune-game" style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0d1220', color: '#f0e2bb', overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* WHO IS READING, so a line meant for one seat is not shown to the
            table. See ChatMessage.to — a refusal says something about a seat's
            spice, and the chat is the one place a sentence like that would sit
            in front of everybody. */}
        <ChatPanel messages={chat} seat={seat} collapsed={chatShut} onSend={onSend}
          talkingTo={talkingTo} onToggle={() => setChatShut(c => !c)} />

        <main style={{
          // ITS BASIS IS THE BOARD'S IDEAL WIDTH — the width a board as tall as
          // the window would need. Without it the side columns' flex-grow took
          // width the board still wanted: at 1280x720 they ran to their maxima
          // and left the board 510x578, which is SMALLER than before any of this.
          // With it, they only ever divide up what is genuinely surplus.
          flex: `1 1 calc(100vh * ${970 / 1099})`, minHeight: 0, minWidth: 0,
          position: 'relative',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          overflow: 'hidden', padding: 4,
        }}>
          {/* The board pins itself to this column and scales to the largest
              size that fits, centred; the overlay letterboxes to the same
              rectangle. Sizing a box to the board's aspect ratio instead was
              what left the column's height unused. */}
          <DuneBoard
            storm={state.storm} stacks={stacks} spice={state.spiceOnBoard}
            seating={seating} deck={state.spiceDeck} mode={state.mode}
            awaiting={state.awaiting} phase={state.phase} turn={state.turn}
            closesAt={closesAt} windowMs={windowMs} now={now} />

          {/* The auction, over the WHOLE middle column rather than over the
              board's own box. The box is only as wide as the board is tall —
              the board is taller than it is wide — and a panel scrimmed to that
              spilled out of it across the chat. What is being dimmed is the
              board AREA, which is this column.

              Assembled here rather than passed in whole, because three of its
              props are this seat's own secrets and one of them — the prescience
              reveal — is a card no other seat may see. Reading them off `own`
              at the point of use means the caller never holds them, and there
              is no other route in. */}
          {bidding && seat && (
            <BiddingPanel {...bidding} seat={seat} now={now}
              spice={own?.spice ?? 0}
              hand={handOf(own)}
              revealed={revealedFor(own)} />
          )}

          {/* CHARITY COVERS THE BOARD rather than dimming it, unlike the
              auction. An auction is about a card you are spending real spice
              on, with the board still worth reading; charity is two words and
              a number for fifteen seconds, and the board says nothing about it.

              Only while the window is actually open, and only for a seat that
              has not already answered — `charity` is withdrawn by the caller
              once this seat has claimed or passed. */}
          {charity && seat && timed.charity && (
            <CharityModal
              faction={seat} own={own}
              onClaim={charity.onClaim} onPass={charity.onPass}
              busy={charity.busy} refused={charity.refused} />
          )}
        </main>

        {/* THE RIGHT-HAND COLUMN: everyone else above, then you. Both are about
            who is at the table, so they read as one column rather than two
            edges — and putting the tray here rather than across the bottom is
            what gives the board the full height of the window.

            It FLEXES. The board cannot use width beyond what its height allows,
            so past that point the leftover may as well go to the column that
            can: more of a faction card visible, more chat, fewer scrollbars. */}
        <div style={{
          flex: '1 1 auto', width: SIDE_WIDTH, minWidth: SIDE_MIN, maxWidth: SIDE_MAX,
          display: 'flex', flexDirection: 'column', minHeight: 0,
          borderLeft: '1px solid #ffffff1f', background: '#131c2e',
        }}>
          <PlayerHud rows={rows} awaiting={state.awaiting} seat={seat} turn={state.turn} />

          {/* A spectator has no tray: there is nothing private to show them, and
              an empty one implies a hand they might be holding. */}
          {seat && mine && myRow && (
            <OwnStrip seat={seat} mode={state.mode} own={own} player={myRow}
              ally={allyOf(state.players, mine)} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── the two lookups that turn a secrets row into cards ──────────────────────
// Out of the component body so the suite can call them directly and prove a
// card cannot reach the panel without being in this seat's own row.
export function handOf(own: DuneSecrets | null): TreacheryCard[] {
  return (own?.cards ?? [])
    .map(id => TREACHERY_CARDS.find(c => c.id === id))
    .filter((c): c is TreacheryCard => !!c)
}

/**
 * The card the Atreides may see, or null.
 *
 * Read off THIS SEAT'S secrets row and nowhere else. The server writes it only
 * into the entitled seat's row (see lib/dune/prescience), so a seat without the
 * power has no key to read and gets null without this having to know which
 * faction the power belongs to.
 */
export function revealedFor(own: DuneSecrets | null): TreacheryCard | null {
  const id = own?.prescience
  return (id && TREACHERY_CARDS.find(c => c.id === id)) || null
}

export default DuneGameScreen
