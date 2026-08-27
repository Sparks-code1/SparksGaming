/**
 * Finding or opening a Dune table, and sitting down at it.
 *
 * The screen between "I want to play Dune" and a board. It lists the tables
 * that are open, opens one, and once you are seated shows who else is there,
 * which faction each has taken, and the one button that deals the game.
 *
 * IT DOES NOT DEAL ANYTHING ITSELF. Pressing Start posts START_DUNE and the
 * server deals — the opening position writes match_secrets and match_decks,
 * and no client may write either. What this screen owns is the choosing.
 *
 * ANYBODY SEATED MAY PRESS IT. There is no host privilege in the match state,
 * and a button shown only to the creator would be a rule this screen invented
 * and the server does not enforce — the first person to press it wins, and the
 * others get a refusal that says the game is already dealt.
 */
import { useEffect, useState } from 'react'
import { getCurrentUser, onAuthChange } from '@/lib/auth'
import type { AuthUser } from '@/lib/auth'
import {
  openDuneLobbies, createDuneLobby, joinDuneLobby, chooseFaction, startDuneMatch,
  readDuneLobby, setDuneReady, leaveDuneLobby, subscribeDuneLobby,
  duneReadiness, freeFactions, DUNE_MIN_SEATS, DUNE_MAX_SEATS,
} from '@/lib/dune/duneLobby'
import type { DuneLobby } from '@/lib/dune/duneLobby'
import { FACTION_IDS } from '@/data/dune/factions'
import { FACTION_LOOK, SeatMark, SeatFilters } from './SeatLayer'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

const button = (primary: boolean): React.CSSProperties => ({
  font: `600 13.5px ${SERIF}`, padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
  border: primary ? '1px solid #c9542a' : '1px solid #ffffff33',
  background: primary ? '#c9542a' : 'transparent',
  color: primary ? '#fff' : PALE,
})

/** A faction, as something to pick. */
function FactionChip(
  { faction, chosen, taken, onPick }:
  { faction: FactionId; chosen: boolean; taken: boolean; onPick(): void },
) {
  const look = FACTION_LOOK[faction]
  return (
    <button type="button" onClick={onPick} disabled={taken && !chosen}
      aria-pressed={chosen} aria-label={look.name}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        cursor: taken && !chosen ? 'not-allowed' : 'pointer',
        opacity: taken && !chosen ? 0.35 : 1,
        background: chosen ? '#ffffff1a' : 'transparent', color: PALE,
        border: `1px solid ${chosen ? look.colour : '#ffffff2a'}`,
        borderLeftWidth: 4, borderLeftColor: look.colour,
        borderRadius: 5, padding: '5px 10px', font: `13px ${SERIF}`,
      }}>
      <svg width={20} height={20} viewBox="-10 -10 20 20" style={{ display: 'block' }}>
        <SeatFilters />
        <SeatMark faction={faction} x={0} y={0} r={9} />
      </svg>
      {look.name}
    </button>
  )
}

export interface DuneLobbyScreenProps {
  /** Called with the match id once the game has been dealt and is playable. */
  onPlay(matchId: string): void
  /** Back out of Dune entirely. */
  onExit?(): void
}

export function DuneLobbyScreen({ onPlay, onExit }: DuneLobbyScreenProps) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [open, setOpen] = useState<DuneLobby[] | null>(null)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [lobby, setLobby] = useState<DuneLobby | null>(null)
  const [name, setName] = useState('')
  const [faction, setFaction] = useState<FactionId>('atreides')
  const [seats, setSeats] = useState(DUNE_MAX_SEATS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void getCurrentUser().then(u => { if (live) { setUser(u); setName(n => n || (u?.email?.split('@')[0] ?? '')) } })
    const off = onAuthChange(u => { if (live) setUser(u) })
    return () => { live = false; off() }
  }, [])

  const refresh = async () => {
    setOpen(await openDuneLobbies())
  }
  useEffect(() => { if (user) void refresh() }, [user])

  // ── the table you are sitting at ────────────────────────────────────────
  // WATCHED, not polled by hand: somebody else joining, picking a faction or
  // pressing ready has to show up here without anybody refreshing, or the
  // room is a screenshot rather than a lobby.
  useEffect(() => {
    if (!matchId) return
    let live = true
    void readDuneLobby(matchId).then(l => { if (live) setLobby(l) })
    const stop = subscribeDuneLobby(matchId, l => { if (live) setLobby(l) })
    return () => { live = false; stop() }
  }, [matchId])

  // THE GAME BEING DEALT IS WHAT TAKES EVERYBODY IN. The server flips the
  // match out of the lobby when it deals, so every seat watching this row sees
  // it at once — nobody has to be told by the person who pressed the button.
  useEffect(() => {
    if (lobby && lobby.status !== 'lobby' && matchId) onPlay(matchId)
    // onPlay is the caller's and stable for the life of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby?.status, matchId])

  const attempt = async (what: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try { await what() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  if (user === undefined) return <Frame>Looking for your account…</Frame>
  if (user === null) {
    return (
      <Frame onExit={onExit}>
        <h1 style={{ font: `600 20px ${SERIF}`, margin: '0 0 8px' }}>Dune</h1>
        <p style={{ opacity: 0.8, lineHeight: 1.55, maxWidth: '60ch' }}>
          <b>Sign in first.</b> A Dune game is played across machines and the server
          identifies players by account — which seat you hold is a row matched against
          your token, so there is nothing to show until it knows who is asking.
        </p>
      </Frame>
    )
  }

  // ── seated ──────────────────────────────────────────────────────────────
  if (matchId && lobby) {
    const mine = lobby.seats.find(s => s.userId === user.id) ?? null
    const readiness = duneReadiness(lobby)
    const free = freeFactions(lobby.seats, user.id)

    return (
      <Frame onExit={onExit}>
        <h1 style={{ font: `600 20px ${SERIF}`, margin: '0 0 4px' }}>The table</h1>
        <p style={{ opacity: 0.55, fontSize: 12.5, margin: '0 0 18px' }}>
          {lobby.seats.length} of {lobby.humanSlots} seated
        </p>

        <ul data-layer="dune-lobby-seats" style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
          {lobby.seats.map(s => {
            const known = FACTION_IDS.includes(s.factionId as FactionId)
            return (
              <li key={s.seat} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                borderTop: '1px solid #ffffff14',
              }}>
                <svg width={24} height={24} viewBox="-12 -12 24 24" style={{ display: 'block', opacity: known ? 1 : 0.3 }}>
                  <SeatFilters />
                  {known && <SeatMark faction={s.factionId as FactionId} x={0} y={0} r={11} />}
                </svg>
                <b style={{ font: `600 14px ${SERIF}` }}>{s.name}</b>
                <span style={{ fontSize: 12.5, opacity: 0.6 }}>
                  {known ? FACTION_LOOK[s.factionId as FactionId].name : 'choosing…'}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12, opacity: s.ready ? 1 : 0.45 }}>
                  {s.ready ? 'ready' : 'not ready'}
                </span>
              </li>
            )
          })}
        </ul>

        {mine && (
          <>
            <h2 style={{ font: `600 12px ${SERIF}`, letterSpacing: 1.4, opacity: 0.5, margin: '0 0 8px' }}>
              YOUR FACTION
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
              {FACTION_IDS.map(f => (
                <FactionChip key={f} faction={f}
                  chosen={mine.factionId === f}
                  taken={!free.includes(f) && mine.factionId !== f}
                  onPick={() => void attempt(() => chooseFaction(matchId, f))} />
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {mine && (
            <button type="button" disabled={busy} style={button(false)}
              onClick={() => void attempt(() => setDuneReady(matchId, !mine.ready))}>
              {mine.ready ? 'Not ready' : 'Ready'}
            </button>
          )}
          {/* ANYBODY SEATED, not the host alone — see the note at the top. */}
          <button type="button" disabled={busy || !readiness.canStart} style={button(true)}
            onClick={() => void attempt(() => startDuneMatch(matchId))}>
            Start the game
          </button>
          <button type="button" disabled={busy} style={button(false)}
            onClick={() => void attempt(async () => {
              await leaveDuneLobby(matchId)
              setMatchId(null); setLobby(null); await refresh()
            })}>
            Leave
          </button>
          <span style={{ fontSize: 12.5, opacity: 0.7 }}>
            {busy ? 'asking…' : readiness.reason ?? 'Everybody is ready.'}
          </span>
        </div>

        {error && <Problem>{error}</Problem>}
      </Frame>
    )
  }

  // ── choosing a table ────────────────────────────────────────────────────
  return (
    <Frame onExit={onExit}>
      <h1 style={{ font: `600 20px ${SERIF}`, margin: '0 0 4px' }}>Dune</h1>
      <p style={{ opacity: 0.6, fontSize: 13, margin: '0 0 22px', maxWidth: '62ch', lineHeight: 1.5 }}>
        Two to six players, one faction each. Open a table for your friends to find,
        or sit down at one that is already waiting.
      </p>

      <h2 style={{ font: `600 12px ${SERIF}`, letterSpacing: 1.4, opacity: 0.5, margin: '0 0 10px' }}>
        YOU
      </h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
          aria-label="Your name"
          style={{
            font: `13.5px ${SERIF}`, padding: '7px 10px', borderRadius: 5,
            border: '1px solid #ffffff2a', background: '#0d1220', color: PALE, minWidth: 180,
          }} />
      </div>

      <h2 style={{ font: `600 12px ${SERIF}`, letterSpacing: 1.4, opacity: 0.5, margin: '0 0 8px' }}>
        FACTION
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 20 }}>
        {FACTION_IDS.map(f => (
          <FactionChip key={f} faction={f} chosen={faction === f} taken={false}
            onPick={() => setFaction(f)} />
        ))}
      </div>

      <h2 style={{ font: `600 12px ${SERIF}`, letterSpacing: 1.4, opacity: 0.5, margin: '0 0 10px' }}>
        OPEN TABLES
      </h2>
      {open === null ? <p style={{ opacity: 0.6 }}>Looking…</p>
        : open.length === 0 ? (
          <p style={{ opacity: 0.6, margin: '0 0 16px' }}>
            Nobody is waiting. Open one and send your friends the link.
          </p>
        ) : (
          <ul data-layer="dune-open-tables" style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
            {open.map(l => (
              <li key={l.matchId} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                borderTop: '1px solid #ffffff14',
              }}>
                <span style={{ fontSize: 13.5 }}>
                  {l.seats.map(s => s.name).join(', ') || 'empty'}
                </span>
                <span style={{ fontSize: 12, opacity: 0.55 }}>
                  {l.seats.length}/{l.humanSlots}
                </span>
                <button type="button" disabled={busy || !name.trim()} style={{ ...button(false), marginLeft: 'auto' }}
                  onClick={() => void attempt(async () => {
                    await joinDuneLobby(l.matchId, { name: name.trim(), playerId: name.trim(), faction })
                    setMatchId(l.matchId)
                  })}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <label style={{ fontSize: 13, opacity: 0.7 }}>
          Seats{' '}
          <select value={seats} onChange={e => setSeats(Number(e.target.value))}
            aria-label="How many players"
            style={{
              font: `13px ${SERIF}`, padding: '5px 7px', borderRadius: 5,
              border: '1px solid #ffffff2a', background: '#0d1220', color: PALE,
            }}>
            {Array.from({ length: DUNE_MAX_SEATS - DUNE_MIN_SEATS + 1 },
              (_, i) => DUNE_MIN_SEATS + i).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !name.trim()} style={button(true)}
          onClick={() => void attempt(async () => {
            const made = await createDuneLobby({
              name: name.trim(), playerId: name.trim(), faction, seats,
            })
            setMatchId(made.matchId)
          })}>
          Open a table
        </button>
        <button type="button" disabled={busy} style={button(false)} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {error && <Problem>{error}</Problem>}
    </Frame>
  )
}

function Frame({ children, onExit }: { children: React.ReactNode; onExit?(): void }) {
  return (
    <div data-layer="dune-lobby" style={{
      minHeight: '100vh', background: '#0d1220', color: PALE,
      font: `14px ${SERIF}`, padding: 28,
    }}>
      {onExit && (
        <button type="button" onClick={onExit} style={{ ...button(false), marginBottom: 20 }}>
          ← Back
        </button>
      )}
      {children}
    </div>
  )
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" style={{
      margin: '16px 0 0', padding: 10, borderRadius: 6,
      background: '#5a1d1d', color: '#ffe6e0', maxWidth: '60ch', lineHeight: 1.5,
    }}>{children}</p>
  )
}

export default DuneLobbyScreen
