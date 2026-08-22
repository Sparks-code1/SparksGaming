/**
 * The game screen.
 *
 * Phase strip across the top, chat down the left, board in the middle, the
 * other players down the right, your own things along the bottom. The board is
 * the biggest thing on the screen because it is the game; everything else is an
 * edge, and every edge is collapsible or fixed-width so the board keeps the
 * space it is given.
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
import { PhaseStrip } from './PhaseStrip'
import { ChatPanel } from './ChatPanel'
import type { ChatMessage } from './ChatPanel'
import { PlayerHud } from './PlayerHud'
import { OwnStrip } from './OwnStrip'
import { DuneBoard } from './DuneBoard'
import { BiddingPanel } from './BiddingPanel'
import type { BiddingPanelProps } from './BiddingPanel'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import type { TreacheryCard } from '@/types/Dune/Treachery'

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
  onSend?: (text: string) => void
  /**
   * The live auction, or null.
   *
   * Everything about it except `revealed` is public. `revealed` is the Atreides
   * prescience card and reaches this component through `own`, not through here
   * — see the assembly below.
   */
  bidding?: Omit<BiddingPanelProps, 'seat' | 'spice' | 'hand' | 'revealed' | 'now'> | null
  /** Injected, like every clock in this codebase. */
  now: number
}

export function DuneGameScreen({
  state, seat, own, chat, onSend, bidding = null, now,
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

  return (
    <div data-layer="dune-game" style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0d1220', color: '#f0e2bb', overflow: 'hidden',
    }}>
      <PhaseStrip phase={state.phase} turn={state.turn} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <ChatPanel messages={chat} collapsed={chatShut} onSend={onSend}
          onToggle={() => setChatShut(c => !c)} />

        {/* The board and anything that floats over it share one positioned
            box, so the auction's scrim covers the board and nothing else —
            the phase strip and the HUD stay readable while bidding runs. */}
        <main style={{
          flex: 1, minWidth: 0, position: 'relative',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          overflow: 'hidden', padding: 10,
        }}>
          {/* The aspect ratio is the board's own, so this box is as tall as the
              column allows and exactly as wide as that height requires. The
              overlay inside it is sized in the same coordinates, which is what
              keeps every marker on the territory it belongs to. */}
          <div style={{
            position: 'relative', height: '100%',
            aspectRatio: '970 / 1099', maxWidth: '100%',
          }}>
            <DuneBoard
              storm={state.storm} stacks={stacks} spice={state.spiceOnBoard}
              seating={seating} deck={state.spiceDeck} mode={state.mode}
              awaiting={state.awaiting} />
          </div>

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
        </main>

        <PlayerHud rows={rows} awaiting={state.awaiting} seat={seat} />
      </div>

      {/* A spectator has no strip: there is nothing private to show them, and
          an empty one implies a hand they might be holding. */}
      {seat && mine && myRow && (
        <OwnStrip seat={seat} mode={state.mode} own={own} player={myRow}
          ally={allyOf(state.players, mine)} />
      )}
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
