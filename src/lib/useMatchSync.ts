import { useEffect, useRef, useState } from 'react'
import {
  startMatchSync, type LiveStatus, type MatchSync, type SyncHandlers, type SyncTransport,
} from '@/lib/matchSync'
import { startSecretsSync } from '@/lib/secretsSync'
import { mergeOwnSecrets, leaksOtherSeatsSecrets, type SeatSecrets } from '@/lib/stateView'
import type { GameState } from '@/types/game'
import type { SeatState } from '@/lib/stateView'

const IDLE: LiveStatus = { state: 'idle', version: -1, attempts: 0, lastSyncAt: null }

/**
 * Keep a component in step with an online match.
 *
 * Pass `null` for hotseat. That is not a disabled subscription — no channel is
 * opened, no fetch is made, and the status stays 'idle', so a local game does
 * not touch the network at all.
 *
 * `seatId` is which seat this client is sitting at. It opens a second
 * subscription for that seat's own hidden state and merges it into the public
 * row before the caller sees either. Null means no secrets are fetched and the
 * state is passed through as it arrived — right for hotseat and for a
 * spectator, both of which are entitled to no hand at all.
 *
 * Returns the live status for the indicator, plus the handle so a caller can
 * force a resync (after a version conflict) or record a version it applied
 * from its own action response.
 */
/**
 * What the hook hands its caller, beyond the transport's own events.
 *
 * `onSecrets` delivers this seat's hidden state ON ITS OWN, to be patched onto
 * whatever board the caller is currently holding. It does not come with a
 * board — see the note inside the hook for why that used to be the case and
 * what it did to the acting player's screen.
 */
export type MatchSyncHandlers = SyncHandlers & {
  onSecrets?: (secrets: SeatSecrets) => void
}

/**
 * The join between the public row and this seat's hidden state.
 *
 * PURE — no React, no channel — so the one thing it exists to get right can be
 * driven in a unit test with a faked transport and no browser: the ORDER in
 * which a board and a hand arrive, and what goes out when each does.
 *
 * Two facts decide the shape. First, matchSync drops every echo at or below
 * the version this client already applied, and that version is recorded the
 * moment its own POST returns — so the echoes of THIS client's own actions
 * never reach `publicArrived`, and `lastPublic` is only ever refreshed by the
 * other machine. On the acting player's screen it is the state at the START of
 * their turn. Second, apply_match_write rewrites every seat's secrets row on
 * every action, so `secretsArrived` fires on the acting machine after each of
 * its own moves.
 *
 * Put those together and the old behaviour — answer a secrets update by
 * re-emitting `lastPublic` with the hand merged in — put the start-of-turn
 * board back on the acting player's screen after every move they made,
 * straight past the version guard because it never went through one. Troops
 * back at the HQ, draft phase again, the turn announced again, and the next
 * action refused as stale because the version pointer rolled back with it.
 * The opponent's screen was fine the whole time.
 *
 * So the hand goes out ALONE, to be patched onto whatever board the consumer
 * is holding — the only copy that is current on the machine that is acting.
 * The hand-before-board case is still covered from the other side: every
 * public state that arrives is merged with the latest hand.
 */
export function createSeatMerge(
  seatId: string | null,
  handlers: Pick<MatchSyncHandlers, 'onState' | 'onSecrets'>,
) {
  let lastPublic: SeatState | null = null
  let lastSecrets: SeatSecrets | null = null
  return {
    /** A public state that cleared matchSync's version guard. */
    publicArrived(state: SeatState, version: number) {
      lastPublic = state
      const merged = seatId ? mergeOwnSecrets(lastPublic, seatId, lastSecrets) : lastPublic
      // The projection is what the client renders. It is a GameState as far
      // as the board is concerned; the cast is here rather than inside
      // mergeOwnSecrets so the type keeps saying that other seats' hands are
      // absent everywhere else.
      handlers.onState(merged as unknown as GameState, version)
    },
    /** This seat's secrets row moved. The hand, on its own — never a board. */
    secretsArrived(secrets: SeatSecrets) {
      lastSecrets = secrets
      handlers.onSecrets?.(lastSecrets)
    },
  }
}

export function useMatchSync(
  matchId: string | null,
  seatId: string | null,
  handlers: MatchSyncHandlers,
  transport?: SyncTransport,
): { status: LiveStatus; sync: MatchSync | null } {
  const [status, setStatus] = useState<LiveStatus>(IDLE)
  const syncRef = useRef<MatchSync | null>(null)
  // Handlers are usually inline arrow functions, so a new identity every
  // render. Held in a ref rather than in the dependency list, or the
  // subscription would be torn down and rebuilt on every render.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!matchId) {
      syncRef.current = null
      setStatus(IDLE)
      return
    }

    // ── the two halves of the state, and where they are put together ────────
    // The public row carries nobody's hand; this seat's comes from
    // match_secrets on a channel of its own. The join is createSeatMerge, above
    // and pure, because the order the two arrive in is the whole difficulty and
    // it has to be testable without a browser. Handlers read through the ref
    // so the merge sees the latest render's closures.
    const merge = createSeatMerge(seatId, {
      onState: (s, v) => handlersRef.current.onState(s, v),
      onSecrets: s => handlersRef.current.onSecrets?.(s),
    })

    const sync = startMatchSync(matchId, {
      onState: (s, v) => {
        // ── the assertion, at the point state arrives from the wire ──────────
        // This is the only place that can tell "absent" from "hidden". Anything
        // downstream is looking at a projection and cannot know what crossed
        // the network. It does not throw: a server still writing the old shape
        // would take every client down with it, and a game that keeps playing
        // while shouting is more useful than one that stops. See the note about
        // matches written before the split in stateView.hydrateState.
        if (seatId && leaksOtherSeatsSecrets(s as unknown as SeatState, seatId)) {
          console.error(
            '[privacy] the match state received from the wire carries another seat\'s hand. '
            + 'Either the server is writing pre-split state (which self-heals on that match\'s '
            + 'next action) or publicView is not being applied on write.',
          )
        }
        merge.publicArrived(s as unknown as SeatState, v)
      },
      onAction: (a, e, seq) => handlersRef.current.onAction?.(a, e, seq),
      onStatus: s => { setStatus(s); handlersRef.current.onStatus?.(s) },
    }, transport)
    syncRef.current = sync

    // ── this seat's own secrets ─────────────────────────────────────────────
    // Kept as a separate subscription on purpose — see the note at the top of
    // secretsSync.ts. The two have different lifetimes and different failure
    // modes, and a reconnect on one must not mask a reconnect on the other.
    const stopSecrets = seatId
      ? startSecretsSync(matchId, {
        expectPlayerId: seatId,
        onSecrets: row => {
          // The hand, on its own — never the board this seat last saw. Why is
          // on createSeatMerge; what it cost is in the two-seat browser spec.
          merge.secretsArrived(row.data as unknown as SeatSecrets)
        },
        // Not a normal event. RLS is what keeps another seat's row off this
        // socket, so one arriving means the policy is wrong.
        onForeignRow: row => console.error(
          `[privacy] received seat ${row.playerId}'s secrets while sitting at ${seatId} — the RLS policy on match_secrets is not holding`),
      })
      : null

    // The socket does not always notice the machine went to sleep or changed
    // network. These are the cheapest signals that it is worth looking again.
    const wake = () => { void sync.resync() }
    const onVisible = () => { if (document.visibilityState === 'visible') wake() }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', onVisible)
      stopSecrets?.()
      sync.stop()
      syncRef.current = null
    }
  }, [matchId, seatId, transport])

  return { status, sync: syncRef.current }
}
