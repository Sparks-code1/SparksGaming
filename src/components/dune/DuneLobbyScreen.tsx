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
 * AND IT NO LONGER LISTS THE WORLD. It used to show every open table on the
 * deployment, because the select policy showed every open lobby to every
 * signed-in account. You share a code now; the tables listed here are the ones
 * you opened or are already sitting at, which is a way back in rather than a
 * way to find strangers.
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
  myDuneLobbies, createDuneLobby, joinDuneByCode, chooseFaction, startDuneMatch,
  readDuneLobby, setDuneReady, leaveDuneLobby, subscribeDuneLobby,
  duneReadiness, freeFactions, normaliseCode, duneJoinCode, CODE_LENGTH,
  randomFreeFaction, duneMode, setDuneMode, isHost, hostSeat,
  DUNE_MIN_SEATS, DUNE_MAX_SEATS,
} from '@/lib/dune/duneLobby'
import type { GameMode } from '@/types/Dune/Game'
import type { DuneLobby, DuneTable } from '@/lib/dune/duneLobby'
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
  const [mine, setMine] = useState<DuneTable[] | null>(null)
  const [code, setCode] = useState('')
  /**
   * The code for the table being sat at.
   *
   * ITS OWN STATE, not a field on the lobby: the lobby is re-read on every
   * change to the room, and a code carried on that object would blink out the
   * first time somebody else pressed Ready.
   */
  const [myCode, setMyCode] = useState<string | null>(null)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [lobby, setLobby] = useState<DuneLobby | null>(null)
  const [name, setName] = useState('')
  const [seats, setSeats] = useState(DUNE_MAX_SEATS)
  /**
   * The game this table is playing, as the row has it.
   *
   * Null while it is being read, and on a server without the column — the
   * screen shows nothing rather than claiming a game nobody agreed to.
   */
  const [mode, setMode] = useState<GameMode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void getCurrentUser().then(u => { if (live) { setUser(u); setName(n => n || (u?.email?.split('@')[0] ?? '')) } })
    const off = onAuthChange(u => { if (live) setUser(u) })
    return () => { live = false; off() }
  }, [])

  const refresh = async () => {
    setMine(await myDuneLobbies())
  }
  useEffect(() => { if (user) void refresh() }, [user])

  // ── the table you are sitting at ────────────────────────────────────────
  // WATCHED, not polled by hand: somebody else joining, picking a faction or
  // pressing ready has to show up here without anybody refreshing, or the
  // room is a screenshot rather than a lobby.
  useEffect(() => {
    if (!matchId) { setMyCode(null); setMode(null); return }
    let live = true
    void duneJoinCode(matchId).then(c => { if (live) setMyCode(c) })
    void duneMode(matchId).then(m => { if (live) setMode(m) })
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
    // WHOSE TABLE THIS IS. The database has gated writes to the match row on it
    // all along; what was missing was the screen saying so, which is why a
    // non-host pressing Basic changed nothing and explained nothing.
    const yours = isHost(lobby, user.id)
    const host = hostSeat(lobby)

    return (
      <Frame onExit={onExit}>
        <h1 style={{ font: `600 20px ${SERIF}`, margin: '0 0 4px' }}>The table</h1>
        <p style={{ opacity: 0.55, fontSize: 12.5, margin: '0 0 14px' }}>
          {lobby.seats.length} of {lobby.humanSlots} seated
        </p>

        {/* THE CODE IS THE INVITATION. Nobody can find this table without it —
            a Dune lobby is invisible to anybody not already at it — so it is
            shown large and near the top rather than tucked in a corner. */}
        {myCode && (
          <div style={{
            marginBottom: 20, padding: '12px 14px', borderRadius: 8,
            background: '#151d30', border: '1px solid #ffffff1f',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 1.4, opacity: 0.5, marginBottom: 6 }}>
              SHARE THIS CODE
            </div>
            <b data-layer="dune-join-code" style={{
              font: `700 26px ${SERIF}`, letterSpacing: 6, display: 'block',
            }}>{myCode}</b>
            <div style={{ fontSize: 12, opacity: 0.55, marginTop: 6 }}>
              Anybody with this can sit down. Without it, nobody can find the table.
            </div>
          </div>
        )}

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
                {/* WHOSE TABLE IT IS, said once and in the list rather than
                    as a separate line: the question is always "which of these
                    people", and the answer belongs beside them. */}
                {host && s.seat === host.seat && (
                  <span style={{ fontSize: 11, letterSpacing: 1, opacity: 0.5 }}>HOST</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 12, opacity: s.ready ? 1 : 0.45 }}>
                  {s.ready ? 'ready' : 'not ready'}
                </span>
              </li>
            )
          })}
        </ul>

        {/* WHICH GAME. Basic and advanced are different games, and this used to
            be decided by whoever pressed Start out of a default nobody saw.
            Anybody at the table may change it, like Start itself — there is no
            host in the match state, and six people settle this by talking. */}
        <h2 style={{ font: `600 12px ${SERIF}`, letterSpacing: 1.4, opacity: 0.5, margin: '0 0 8px' }}>
          THE GAME
        </h2>
        <div data-layer="dune-mode" style={{ display: 'flex', gap: 7, marginBottom: 18 }}>
          {(['basic', 'advanced'] as const).map(m => (
            <button key={m} type="button" disabled={busy || !yours}
              aria-pressed={mode === m} aria-label={`${m} game`}
              onClick={() => void attempt(async () => { await setDuneMode(matchId, m); setMode(m) })}
              style={{
                ...button(false), textTransform: 'capitalize',
                background: mode === m ? '#ffffff1a' : 'transparent',
                border: `1px solid ${mode === m ? '#c9542a' : '#ffffff33'}`,
              }}>
              {m}
            </button>
          ))}
          <span style={{ fontSize: 12, opacity: 0.55, alignSelf: 'center' }}>
            {!yours
              ? `${host?.name ?? 'The host'} chooses the game`
              : mode === 'basic'
                ? 'No Kwisatz Haderach, Sardaukar, Fedaykin or advisors.'
                : mode === 'advanced'
                  ? 'The full game, with every faction power.'
                  : ''}
          </span>
        </div>

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
              {/* SIX FACTIONS PLAY VERY DIFFERENTLY and picking one is most of a
                  decision a new player has no basis for making. It only ever
                  draws from what is free, so it cannot hand somebody a faction
                  that is taken. */}
              <button type="button" disabled={busy || free.length === 0}
                aria-label="Random faction"
                onClick={() => void attempt(async () => {
                  const pick = randomFreeFaction(lobby.seats, user.id)
                  if (!pick) throw new Error('Every faction is taken')
                  await chooseFaction(matchId, pick)
                })}
                style={{
                  ...button(false), borderLeftWidth: 4, borderLeftColor: '#8a6a2a',
                }}>
                🎲 Random
              </button>
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
          {/* THE HOST'S. Shown to everybody so the table can see the game is
              ready and who is holding it up, but pressable by one — the server
              refuses anybody else, and a button that looks live and is not is
              how the last one behaved. */}
          <button type="button" disabled={busy || !readiness.canStart || !yours}
            style={button(true)}
            title={yours ? undefined : `${host?.name ?? 'The host'} starts the game`}
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

      {/* NO FACTION HERE. Choosing before joining meant choosing blind — a
          Dune table is invisible until you are sitting at it, so somebody
          picking Atreides had no way to know it was taken and was simply
          refused. You sit down first and choose at the table. */}
      {/* JOINING IS BY CODE. There is no list of other people's tables and
          there should not be — see the note at the top. */}
      <h2 style={{ font: `600 12px ${SERIF}`, letterSpacing: 1.4, opacity: 0.5, margin: '0 0 10px' }}>
        JOIN A TABLE
      </h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder={'CODE'.padEnd(CODE_LENGTH, '·')} aria-label="Table code"
          maxLength={CODE_LENGTH + 2}
          style={{
            font: `600 16px ${SERIF}`, letterSpacing: 4, padding: '7px 10px', borderRadius: 5,
            border: '1px solid #ffffff2a', background: '#0d1220', color: PALE, width: 150,
          }} />
        <button type="button" style={button(true)}
          disabled={busy || !name.trim() || normaliseCode(code).length !== CODE_LENGTH}
          onClick={() => void attempt(async () => {
            const id = await joinDuneByCode(code, { name: name.trim() })
            setCode('')
            setMatchId(id)
          })}>
          Sit down
        </button>
      </div>
      <p style={{ opacity: 0.5, fontSize: 12, margin: '0 0 20px', maxWidth: '58ch', lineHeight: 1.5 }}>
        Whoever opened the table has the code. Tables are not listed — without one
        there is nothing to find.
      </p>

      {/* YOUR OWN TABLES, which is a way back in rather than a way to browse. */}
      {mine !== null && mine.length > 0 && (
        <>
          <h2 style={{ font: `600 12px ${SERIF}`, letterSpacing: 1.4, opacity: 0.5, margin: '0 0 10px' }}>
            YOUR GAMES
          </h2>
          <ul data-layer="dune-my-tables" style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
            {mine.map(l => (
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
                {/* A GAME IN PROGRESS HAS NO CODE TO SHOW — nobody else can
                    join it — so the status takes that place instead. */}
                {l.status === 'lobby' && l.joinCode ? (
                  <span style={{ fontSize: 12, opacity: 0.45, letterSpacing: 2 }}>{l.joinCode}</span>
                ) : (
                  <span style={{ fontSize: 11.5, opacity: 0.5, letterSpacing: 1 }}>in progress</span>
                )}
                <button type="button" disabled={busy} style={{ ...button(false), marginLeft: 'auto' }}
                  onClick={() => {
                    // A GAME GOES STRAIGHT BACK TO THE BOARD; a table opens its
                    // waiting room. Sending somebody to a lobby for a game that
                    // has already been dealt would show them a room with no
                    // seats in it and no way on.
                    if (l.status === 'lobby') setMatchId(l.matchId)
                    else onPlay(l.matchId)
                  }}>
                  {l.status === 'lobby' ? 'Back to it' : 'Rejoin'}
                </button>
              </li>
            ))}
          </ul>
        </>
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
              // NO playerId: the seat is keyed by the account, and passing a
              // typed name here is what let two players share one hand.
              name: name.trim(), seats,
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
