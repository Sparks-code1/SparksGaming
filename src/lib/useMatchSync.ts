import { useEffect, useRef, useState } from 'react'
import {
  startMatchSync, type LiveStatus, type MatchSync, type SyncHandlers, type SyncTransport,
} from '@/lib/matchSync'

const IDLE: LiveStatus = { state: 'idle', version: -1, attempts: 0, lastSyncAt: null }

/**
 * Keep a component in step with an online match.
 *
 * Pass `null` for hotseat. That is not a disabled subscription — no channel is
 * opened, no fetch is made, and the status stays 'idle', so a local game does
 * not touch the network at all.
 *
 * Returns the live status for the indicator, plus the handle so a caller can
 * force a resync (after a version conflict) or record a version it applied
 * from its own action response.
 */
export function useMatchSync(
  matchId: string | null,
  handlers: SyncHandlers,
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
    const sync = startMatchSync(matchId, {
      onState: (s, v) => handlersRef.current.onState(s, v),
      onAction: (a, e, seq) => handlersRef.current.onAction?.(a, e, seq),
      onStatus: s => { setStatus(s); handlersRef.current.onStatus?.(s) },
    }, transport)
    syncRef.current = sync

    // The socket does not always notice the machine went to sleep or changed
    // network. These are the cheapest signals that it is worth looking again.
    const wake = () => { void sync.resync() }
    const onVisible = () => { if (document.visibilityState === 'visible') wake() }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', onVisible)
      sync.stop()
      syncRef.current = null
    }
  }, [matchId, transport])

  return { status, sync: syncRef.current }
}
