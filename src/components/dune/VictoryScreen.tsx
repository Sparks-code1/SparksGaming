/**
 * The end of a game of Dune, said properly.
 *
 * A WIN USED TO BE A GREEN BOX in the notice column, the same size and shape as
 * "the storm rolled 4". Ten turns of six people bidding, allying and betraying
 * each other ended in a line of text you could scroll past. This is the moment
 * the whole game is for, and it should stop the room.
 *
 * IT DISMISSES BACK TO THE BOARD, which is the other half of the request and
 * the part a modal usually gets wrong: the final position — who held which
 * stronghold, what everyone's purse turned out to be, where the storm finished
 * — is the thing people want to pore over once they know the result. So this
 * gets out of the way on a press, the board underneath is intact, and the
 * notice column keeps the result permanently for anyone who dismissed it.
 *
 * LOCAL, AND NOT WRITTEN ANYWHERE. Dismissing is one player deciding they have
 * read it. Six seats reach this screen independently and each closes it in
 * their own time; nothing here is a move and nothing here is sent.
 */
import { useEffect, useState } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import { FACTION_LOOK, factionInk } from './SeatLayer'
import ConfettiBurst from '@/components/ConfettiBurst'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'
/** The board's own gold, which is what an occasion looks like in this game. */
const GOLD = '#e8b04b'

/**
 * How each way of winning reads.
 *
 * The same sentences the notice column has always used, moved here so the two
 * cannot drift into describing the same victory differently.
 */
export const WIN_REASON: Record<string, string> = {
  strongholds: 'Three strongholds held at the Mentat Pause.',
  prediction: 'The Bene Gesserit foresaw this, and the win is theirs.',
  'fremen-default': 'The desert endures: the Fremen default victory.',
  'guild-default': 'Nobody won, so the Guild did.',
  'most-strongholds': 'Turn ten: the most strongholds takes it.',
  'most-spice': 'Turn ten: strongholds tied, and the fuller purse takes it.',
}

export interface VictoryScreenProps {
  winner: { factions: FactionId[]; reason: string; turn?: number }
  /** Every seat's spice, published by the finishing write. */
  spice?: Partial<Record<FactionId, number>> | null
  /** Seats at the table, so the purses can be listed in seating order. */
  players?: readonly { faction: FactionId }[]
  /** This client's own seat, marked when it is among the winners. */
  seat?: FactionId | null
  onClose: () => void
}

export function VictoryScreen({
  winner, spice = null, players = [], seat = null, onClose,
}: VictoryScreenProps) {
  const won = winner.factions
  const mine = !!seat && won.includes(seat)

  // ESCAPE CLOSES IT, because a full-screen thing that only has one small
  // button is a thing somebody will be stuck behind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div data-layer="victory" role="dialog" aria-label="Victory"
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'grid', placeItems: 'center',
        background: 'radial-gradient(ellipse at center,'
          + ' rgba(46,32,8,0.90) 0%, rgba(6,4,0,0.97) 100%)',
        font: `14px ${SERIF}`, color: PALE,
      }}>
      {/* THE WINNERS' OWN COLOURS, not one house gold — a shared victory is two
          factions and the burst should say so.
          IN INK, NOT RAW. Harkonnen confetti in their real black fell as
          invisible specks against a near-black backdrop: a celebration only
          the other five could see. */}
      <ConfettiBurst count={160} originY={34}
        colors={[...won.map(f => factionInk(f)), GOLD]} />

      <div style={{
        textAlign: 'center', padding: '38px 52px', maxWidth: 660,
        border: `1px solid ${GOLD}66`, borderRadius: 14,
        background: 'linear-gradient(165deg, #2a1d07 0%, #150e02 100%)',
        boxShadow: `0 0 60px ${GOLD}22, 0 24px 80px rgba(0,0,0,0.8)`,
      }}>
        <div style={{
          fontSize: 11, letterSpacing: 5, color: GOLD, opacity: 0.75, marginBottom: 16,
        }}>
          {winner.turn ? `TURN ${winner.turn}` : 'THE GAME IS OVER'}
        </div>

        {/* THE NAME, AS BIG AS IT DESERVES, in the faction's readable ink —
            the Harkonnen's own black would be a name nobody could read at any
            size. See factionInk. */}
        <h1 data-winner style={{
          margin: '0 0 8px', fontSize: 46, lineHeight: 1.12, fontWeight: 400,
          textShadow: '0 2px 24px rgba(0,0,0,0.8)',
        }}>
          {won.map((f, i) => (
            <span key={f}>
              {i > 0 && <span style={{ opacity: 0.5, fontSize: 28 }}> and </span>}
              <span style={{ color: factionInk(f) }}>
                {FACTION_LOOK[f]?.name ?? f}
              </span>
            </span>
          ))}
        </h1>
        <div style={{ fontSize: 21, letterSpacing: 4, color: GOLD }}>
          {won.length === 1 ? 'WINS' : 'WIN TOGETHER'}
        </div>

        <p style={{ margin: '18px 0 0', fontSize: 15, opacity: 0.9 }}>
          {WIN_REASON[winner.reason] ?? winner.reason}
        </p>

        {mine && (
          <p style={{ margin: '10px 0 0', fontSize: 15, color: factionInk(seat!) }}>
            That is your seat.
          </p>
        )}

        {/* SCREENS DOWN. The purses go public in the same write as the winner,
            and a shared or spice-broken victory is only legible against them. */}
        {spice && players.length > 0 && (
          <div style={{
            margin: '22px auto 0', paddingTop: 16, maxWidth: 320,
            borderTop: `1px solid ${PALE}22`,
            display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 18px',
            fontSize: 13, textAlign: 'left',
          }}>
            {players.map(p => (
              <span key={p.faction} style={{ display: 'contents' }}>
                <span style={{ color: factionInk(p.faction) }}>
                  {FACTION_LOOK[p.faction]?.name ?? p.faction}
                </span>
                <span style={{ textAlign: 'right', opacity: 0.85 }}>
                  {spice[p.faction] ?? 0} spice
                </span>
              </span>
            ))}
          </div>
        )}

        <button type="button" data-close-victory onClick={onClose}
          style={{
            marginTop: 26, padding: '9px 26px', borderRadius: 7,
            background: `${GOLD}1f`, border: `1px solid ${GOLD}88`,
            color: PALE, font: `14px ${SERIF}`, cursor: 'pointer',
            letterSpacing: 0.5,
          }}>
          Look over the board
        </button>
      </div>
    </div>
  )
}

/**
 * Whether this client should be shown the ceremony for this result.
 *
 * ONCE PER GAME, PER BROWSER. A win that reappeared on every poll would be
 * unusable — the row keeps saying there is a winner for as long as anyone is
 * looking at the finished board. Remembered against the match so a second game
 * in the same campaign gets its own ceremony.
 *
 * The store is best-effort: a browser that refuses it simply sees the ceremony
 * again on reload, which is a far better failure than never seeing it.
 */
export function useVictoryCeremony(
  matchId: string | null | undefined, hasWinner: boolean,
): { show: boolean; close: () => void } {
  const key = matchId ? `dune:victory-seen:${matchId}` : null
  const [seen, setSeen] = useState(() => {
    if (!key) return false
    try { return localStorage.getItem(key) === '1' } catch { return false }
  })
  return {
    show: hasWinner && !seen,
    close: () => {
      setSeen(true)
      try { if (key) localStorage.setItem(key, '1') } catch { /* private mode */ }
    },
  }
}

export default VictoryScreen
