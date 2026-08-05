import { useEffect, useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import type { AuthUser } from '@/lib/auth'
import type { AIDifficulty } from '@/types/ai'
import { AI_DIFFICULTY_LABEL } from '@/types/ai'
import {
  type Lobby, lobbyReadiness, subscribeLobby, setReady, leaveLobby, setLobbyShape,
  MIN_SEATS, MAX_SEATS,
} from '@/lib/lobby'
import { getRoster } from '@/lib/roster'
import JoinCodeCard from './JoinCodeCard'

interface Props {
  lobby: Lobby
  legacy: LegacyState
  user: AuthUser
  /** Host pressed Start and the match went active. */
  onStart: (lobby: Lobby) => void
  onLeave: () => void
}

const GOLD = '#C8940A'
const DIFFS: AIDifficulty[] = ['easy', 'medium', 'hard']

/**
 * The room people wait in before a hosted game.
 *
 * One screen for both roles, because host and joiner have to agree about what
 * is missing — if the host is told "waiting for a player" while a joiner is
 * told "waiting for the host", neither can act and neither knows why. The same
 * `lobbyReadiness` line is shown to everybody; only the buttons differ.
 */
export default function LobbyScreen({ lobby: initial, legacy, user, onStart, onLeave }: Props) {
  const [lobby, setLobby] = useState<Lobby>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isHost = lobby.createdBy === user.id
  const mySeat = lobby.seats.find(s => s.userId === user.id)
  const readiness = lobbyReadiness(lobby)
  const roster = getRoster(legacy)

  useEffect(() => subscribeLobby(initial.matchId, next => {
    if (!next) { onLeave(); return }
    setLobby(next)
    // A joiner finds out the game has begun the same way they find out anything
    // else here — the row changed. No separate signal to miss.
    if (next.status === 'active') onStart(next)
  }), [initial.matchId])

  async function guard(work: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await work() } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  /** Roster names nobody in this lobby is playing — what the AI seats draw from. */
  const freeNames = roster.filter(m => !lobby.seats.some(s => s.playerId === m.id))
  const aiSeats = lobby.seats.filter(s => s.isAI)

  async function resize(humanSlots: number, aiCount: number) {
    const pool = roster.filter(m =>
      !lobby.seats.some(s => s.playerId === m.id && !s.isAI))
    await guard(async () => {
      setLobby(await setLobbyShape(lobby.matchId, humanSlots,
        pool.slice(0, aiCount).map((m, i) => ({
          playerId: m.id, name: m.name,
          difficulty: aiSeats[i]?.aiDifficulty ?? 'medium',
        }))))
    })
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: '2px solid rgba(200,148,10,0.60)', borderRadius: 14,
        padding: '26px 32px 22px', width: 620, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
        color: '#E8DCC8', boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: GOLD, letterSpacing: 1.5 }}>
            {isHost ? '🎲 HOSTING GAME' : '🎲 WAITING TO START'} #{lobby.gameNumber}
          </div>
          <div style={{ fontSize: 11, color: '#7a6040', marginTop: 4 }}>
            {legacy.worldName}
            {!isHost && ' · the host starts the game when everyone is ready'}
          </div>
        </div>

        {/* The code is the only way anyone else gets in here. */}
        {isHost && legacy.joinCode && (
          <JoinCodeCard code={legacy.joinCode} note="Read this out — they enter it to join this game" />
        )}

        {/* ── Seats ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
          {lobby.seats.map(s => {
            const me = s.userId === user.id
            return (
              <div key={s.seat} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 13px', borderRadius: 8,
                background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${s.ready ? 'rgba(39,174,96,0.35)' : 'rgba(200,148,10,0.20)'}`,
              }}>
                <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>
                  {s.isAI ? '🤖' : s.ready ? '✅' : '⏳'}
                </span>
                <span style={{ fontSize: 14, fontWeight: 'bold', flex: 1, minWidth: 0 }}>
                  {s.name}
                  {me && <span style={{ fontSize: 10, color: '#6a5030', fontWeight: 'normal' }}> (you)</span>}
                  {s.userId === lobby.createdBy && s.userId && (
                    <span style={{ fontSize: 10, color: GOLD, fontWeight: 'normal' }}> · host</span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: s.ready ? '#8fbf9a' : '#7a6040' }}>
                  {s.isAI ? AI_DIFFICULTY_LABEL[s.aiDifficulty ?? 'medium'] : s.ready ? 'Ready' : 'Not ready'}
                </span>
              </div>
            )
          })}

          {/* Seats still to be filled, shown as real rows so the wait is
              visible rather than implied by a sentence. */}
          {Array.from({ length: readiness.waitingFor }, (_, i) => (
            <div key={`open-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 13px', borderRadius: 8,
              background: 'rgba(0,0,0,0.12)', border: '1px dashed rgba(200,148,10,0.25)',
              color: '#6a5030', fontSize: 13, fontStyle: 'italic',
            }}>
              <span style={{ width: 18, textAlign: 'center' }}>○</span>
              Waiting for a player…
            </div>
          ))}
        </div>

        {/* ── Host controls: how many humans, how many computers ──────── */}
        {isHost && (
          <div style={{
            border: '1px solid rgba(200,148,10,0.25)', borderRadius: 8,
            padding: '11px 13px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1, marginBottom: 9 }}>
              TABLE
            </div>
            {([
              ['Humans', lobby.humanSlots, (n: number) => resize(n, aiSeats.length)],
              ['Computers', aiSeats.length, (n: number) => resize(lobby.humanSlots, n)],
            ] as Array<[string, number, (n: number) => void]>).map(([label, value, set]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <span style={{ fontSize: 11, color: '#9a8060', width: 78 }}>{label}</span>
                {[0, 1, 2, 3, 4, 5].map(n => {
                  const isHumans = label === 'Humans'
                  const other = isHumans ? aiSeats.length : lobby.humanSlots
                  // A human seat someone is sitting in cannot be removed, and an
                  // AI cannot be added where there is no roster name left for it.
                  const seatedHumans = lobby.seats.filter(x => !x.isAI).length
                  const disabled = busy
                    || n + other > MAX_SEATS
                    || (isHumans && (n < 1 || n < seatedHumans))
                    || (!isHumans && n > freeNames.length + aiSeats.length)
                  const on = value === n
                  return (
                    <button key={n} disabled={disabled} onClick={() => set(n)} style={{
                      width: 30, height: 30, borderRadius: 6, fontSize: 13,
                      fontFamily: 'Georgia, serif', cursor: disabled ? 'not-allowed' : 'pointer',
                      border: `1.5px solid ${on ? GOLD : 'rgba(200,148,10,0.20)'}`,
                      background: on ? 'rgba(200,148,10,0.20)' : 'transparent',
                      color: disabled ? '#3a2c14' : on ? GOLD : '#6a5030',
                    }}>{n}</button>
                  )
                })}
              </div>
            ))}
            {aiSeats.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#9a8060', width: 78 }}>Difficulty</span>
                {DIFFS.map(d => {
                  const on = aiSeats.every(s => s.aiDifficulty === d)
                  return (
                    <button key={d} disabled={busy}
                      onClick={() => guard(async () => setLobby(await setLobbyShape(
                        lobby.matchId, lobby.humanSlots,
                        aiSeats.map(s => ({ playerId: s.playerId, name: s.name, difficulty: d })))))}
                      style={{
                        padding: '5px 11px', fontSize: 11, borderRadius: 6, fontFamily: 'Georgia, serif',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        border: `1px solid ${on ? 'rgba(52,152,219,0.7)' : 'rgba(100,80,40,0.3)'}`,
                        background: on ? 'rgba(52,152,219,0.20)' : 'transparent',
                        color: on ? '#7fb3d3' : '#6a5030',
                      }}>{AI_DIFFICULTY_LABEL[d]}</button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── The same status line for everybody ──────────────────────── */}
        <div style={{
          padding: '9px 12px', borderRadius: 7, marginBottom: 12, fontSize: 11.5, textAlign: 'center',
          background: readiness.canStart ? 'rgba(39,174,96,0.10)' : 'rgba(200,148,10,0.07)',
          border: `1px solid ${readiness.canStart ? 'rgba(39,174,96,0.35)' : 'rgba(200,148,10,0.22)'}`,
          color: readiness.canStart ? '#8fbf9a' : '#a08860',
        }}>
          {readiness.canStart
            ? (isHost ? 'Everyone is ready — start when you like' : 'Everyone is ready — waiting for the host')
            : readiness.reason}
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 11,
            background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)', color: '#e08070',
          }}>
            {error}
          </div>
        )}

        {/* ── Buttons ─────────────────────────────────────────────────── */}
        {!isHost && mySeat && (
          <button
            onClick={() => guard(() => setReady(lobby.matchId, !mySeat.ready))}
            disabled={busy}
            style={{
              width: '100%', padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
              fontFamily: 'Georgia, serif', cursor: busy ? 'not-allowed' : 'pointer', marginBottom: 8,
              border: `2px solid ${mySeat.ready ? 'rgba(39,174,96,0.6)' : 'rgba(200,148,10,0.70)'}`,
              background: mySeat.ready ? 'rgba(39,174,96,0.16)' : 'rgba(200,148,10,0.16)',
              color: '#E8DCC8',
            }}>
            {mySeat.ready ? "✓ Ready — click to un-ready" : "I'm Ready"}
          </button>
        )}

        {isHost && (
          <button
            onClick={() => onStart(lobby)}
            disabled={!readiness.canStart || busy}
            title={readiness.reason ?? undefined}
            style={{
              width: '100%', padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
              fontFamily: 'Georgia, serif', marginBottom: 8,
              cursor: readiness.canStart && !busy ? 'pointer' : 'not-allowed',
              border: `2px solid ${readiness.canStart ? 'rgba(200,148,10,0.70)' : 'rgba(100,70,30,0.25)'}`,
              background: readiness.canStart ? 'rgba(200,148,10,0.16)' : 'rgba(100,70,30,0.10)',
              color: readiness.canStart ? '#E8DCC8' : 'rgba(150,120,80,0.35)',
            }}>
            {readiness.canStart
              ? `Start Game #${lobby.gameNumber} → ${readiness.totalSeats} players`
              : 'Waiting…'}
          </button>
        )}

        <button
          onClick={() => guard(async () => { await leaveLobby(lobby.matchId); onLeave() })}
          disabled={busy}
          style={{
            width: '100%', padding: '8px', borderRadius: 7, fontSize: 11,
            border: '1px solid rgba(200,148,10,0.20)', background: 'transparent',
            color: '#6a5030', cursor: 'pointer', fontFamily: 'Georgia, serif',
          }}>
          {isHost ? 'Cancel this game' : 'Leave'}
        </button>

        <div style={{ fontSize: 9.5, color: '#4a3820', textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>
          {MIN_SEATS}–{MAX_SEATS} players. The server rolls the dice and decides whose turn it is.
        </div>
      </div>
    </div>
  )
}
