/**
 * The Fremen answering the spice blow's pause.
 *
 * Worms after the first in a discard pile are theirs to place, and the rule is
 * that they CAN be placed — so declining is a legal answer and not a timeout or
 * an oversight. That is why there is a Decline button rather than only a
 * countdown: a phase that resolved on silence would be deciding for them, which
 * is the thing the pause exists to stop.
 *
 * PER PILE. Each discard pile is its own spice blow, so pile A stops here, is
 * answered, and only then is pile B revealed — which may stop here again with a
 * different count. The panel says which pile it is asking about, because
 * "2 worms" twice in a turn is otherwise indistinguishable from a stuck screen.
 *
 * WHAT IT KNOWS is only the ask: which pile, how many worms. The continuation
 * that goes with it holds the remaining deck in order and lives in match_decks,
 * where no client can read it — see publishBlowStep in the edge function. This
 * panel could not show the deck if it wanted to.
 */
import { useState } from 'react'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { dispatchDuneAction } from '@/lib/dune/duneDispatch'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SpiceBlowPause } from '@/lib/dune/publicRow'

/**
 * The pause as public state carries it.
 *
 * DEFINED WITH THE ROW, not here, because the row is what it describes and two
 * screens read it. Re-exported so this panel's props still read as one unit.
 */
export type { SpiceBlowPause } from '@/lib/dune/publicRow'

export interface WormPlacementPanelProps {
  pause: SpiceBlowPause | null
  matchId: string
  /** The acting seat's session. The server checks the token says Fremen. */
  client?: SupabaseClient
  /**
   * Whether this client holds the Fremen seat.
   *
   * Shown to EVERYONE either way — six people round a table can all see who is
   * being waited on, and hiding it is how play-by-network games end up with
   * everybody waiting on everybody. Only the Fremen get the controls.
   */
  mine: boolean
  say?: (line: string) => void
  /** The picks as they stand, so the BOARD can draw Shai-Hulud where each
   *  will strike — the icon layer existed and nothing ever fed it. */
  onChosen?: (territoryIds: string[]) => void
}

const INK = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

export function WormPlacementPanel({
  pause, matchId, client, mine, say, onChosen,
}: WormPlacementPanelProps) {
  const [chosen, setChosenState] = useState<string[]>([])
  const setChosen = (next: string[] | ((prev: string[]) => string[])) => {
    const ids = typeof next === 'function' ? next(chosen) : next
    setChosenState(ids)
    onChosen?.(ids)
  }
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  if (!pause) return null
  const worms = pause.worms ?? 0

  async function send(at: string[]) {
    if (busy) return
    setBusy(true)
    setRefused(null)
    const res = await dispatchDuneAction(matchId, { type: 'PLACE_WORMS', at }, { client })
    setBusy(false)
    if (!res.ok) {
      setRefused(res.error?.code ?? 'refused')
      say?.(`worm placement refused: ${res.error?.message ?? 'unknown'}`)
      return
    }
    // The board comes back on the changefeed; nothing is advanced here.
    setChosen([])
    say?.(at.length ? `placed ${at.length} worm(s)` : 'declined the worms')
  }

  const toggle = (id: string) =>
    setChosen(c => c.includes(id)
      ? c.filter(x => x !== id)
      // FEWER IS FINE, more is not. The server refuses an over-placement too —
      // this only saves a round trip to be told so.
      : c.length >= worms ? c : [...c, id])

  return (
    <div style={{
      border: '1px solid #ffffff22', borderRadius: 6, padding: 10,
      font: `12px ${SERIF}`, color: INK,
    }}>
      <b style={{ display: 'block', marginBottom: 6 }}>
        Shai-Hulud — pile {pause.pile ?? '?'}
      </b>
      <p style={{ margin: '0 0 8px', opacity: 0.85 }}>
        {worms} worm{worms === 1 ? '' : 's'} for the Fremen to place.
        {!mine && ' Waiting on them.'}
      </p>

      {mine && (
        <>
          <div style={{ maxHeight: 170, overflowY: 'auto', marginBottom: 8 }}>
            {DUNE_TERRITORIES.map(t => (
              <label key={t.id} style={{ display: 'block', opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={chosen.includes(t.id)}
                  onChange={() => toggle(t.id)} />
                {' '}{t.displayName}
              </label>
            ))}
          </div>
          <button onClick={() => void send(chosen)} disabled={busy || chosen.length === 0}>
            Place {chosen.length} worm{chosen.length === 1 ? '' : 's'}
          </button>{' '}
          {/* DECLINING IS AN ANSWER. The rule says the worms "can be placed",
              so an empty list is a legal reply and not a forfeit — and it is
              the only way to move the phase on without using them. */}
          <button onClick={() => void send([])} disabled={busy}>Decline</button>{' '}
          <span style={{ opacity: 0.7 }}>
            {refused === 'not-your-decision' ? 'only the Fremen may place these'
              : refused === 'no-pause' ? 'nothing is waiting'
              : refused === 'bad-placement' ? 'that placement was refused'
              : refused ?? (busy ? 'sending…' : '')}
          </span>
        </>
      )}
    </div>
  )
}

export default WormPlacementPanel
