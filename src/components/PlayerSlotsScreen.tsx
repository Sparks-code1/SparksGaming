import { useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import type { AIDifficulty } from '@/types/ai'
import { AI_DIFFICULTY_LABEL } from '@/types/ai'
import { ROSTER_IDS, MAX_ROSTER, hasRoster, getRoster, validateSeats, validateRosterNames } from '@/lib/roster'
import JoinCodeCard from './JoinCodeCard'

export interface SlotConfig { isAI: boolean; difficulty: AIDifficulty }

/** One configured player slot, in seating order */
export interface PlayerSlotSetup {
  playerId: string
  name: string
  isAI: boolean
  difficulty: AIDifficulty
}

interface Props {
  /** Campaign state — supplies the roster once it has been locked in. */
  legacy?: LegacyState | null
  onConfirm: (slots: PlayerSlotSetup[], playOnline: boolean) => void
  /** Signed-in account, if any. Online play needs one — the server decides
   *  whose turn it is from the JWT, so an anonymous client cannot act. */
  user?: { id: string; email?: string | null } | null
}

const DIFFS: AIDifficulty[] = ['easy', 'medium', 'hard']

const GOLD = '#C8940A'

/** FIRST new-game screen: pick how many players (2–5), fill each seat, and
 *  choose which slots are human or computer — all before the dice roll.
 *
 *  The first game of a campaign names the players freely and those names become
 *  the permanent roster. Every game after picks seats from that roster instead:
 *  names cannot be edited or added, and nobody can take two seats. The headcount
 *  may still change — a 5-player campaign can run a 4-player game. */
export default function PlayerSlotsScreen({ legacy = null, user = null, onConfirm }: Props) {
  const [playOnline, setPlayOnline] = useState(false)
  const roster = getRoster(legacy)
  const locked = hasRoster(legacy)
  // With a roster, you can seat at most as many players as the campaign has.
  const maxCount = locked ? roster.length : MAX_ROSTER
  const counts = [2, 3, 4, 5].filter(n => n <= maxCount)

  const [count, setCount] = useState(Math.min(4, maxCount))
  // Free-naming seats (first setup only): name typed per seat.
  const [names, setNames] = useState<string[]>(() => Array.from({ length: MAX_ROSTER }, () => ''))
  // Roster seats (every later game): which roster member sits in each seat.
  const [seatIds, setSeatIds] = useState<Array<string | null>>(() =>
    Array.from({ length: MAX_ROSTER }, (_, i) => roster[i]?.id ?? null),
  )
  const [ai, setAi] = useState<Array<{ isAI: boolean; difficulty: AIDifficulty }>>(() =>
    Array.from({ length: MAX_ROSTER }, () => ({ isAI: false, difficulty: 'medium' as AIDifficulty })),
  )

  const activeSeats = Array.from({ length: count }, (_, i) => i)
  const humanCount = activeSeats.filter(i => !ai[i].isAI).length

  // Validity differs by mode: free naming needs non-blank unique names, roster
  // seating needs every seat filled by a distinct roster member.
  const trimmed = activeSeats.map(i => names[i].trim())
  const seatCheck = locked
    ? validateSeats(legacy, activeSeats.map(i => seatIds[i]))
    : validateRosterNames(trimmed)

  const canConfirm = humanCount >= 1 && seatCheck.ok

  const setAiAt = (i: number, patch: Partial<{ isAI: boolean; difficulty: AIDifficulty }>) =>
    setAi(prev => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  // Online needs an account per human seat: the edge function identifies the
  // actor from their JWT, so a seat nobody is signed in as can never act.
  const rosterOf = (id: string) => (legacy?.roster ?? []).find(m => m.id === id)

  /** Every human seat and whether an account has claimed it — the online checklist. */
  const seatAccounts = activeSeats
    .filter(i => !ai[i].isAI)
    .map(i => {
      const id = locked ? seatIds[i] : ROSTER_IDS[i]
      const member = id ? rosterOf(id) : undefined
      return {
        id,
        name: member?.name ?? (locked ? '— empty seat —' : names[i].trim() || `Player ${i + 1}`),
        email: member?.userEmail ?? null,
        linked: !!member?.userId,
        isMe: !!user && member?.userId === user.id,
      }
    })
  const unlinkedSeats = seatAccounts.filter(s => !s.linked)
  const canPlayOnline = !!user && locked && unlinkedSeats.length === 0
  const onlineBlockedReason = !user
    ? 'Sign in on the campaign screen to play online — the server decides whose turn it is from your account.'
    : !locked
      ? 'Online play needs the campaign roster, which is created by this first game. Play this one on a single screen; every game after can go online.'
      : unlinkedSeats.length > 0
        ? `${unlinkedSeats.map(s => s.name).join(', ')} ${unlinkedSeats.length === 1 ? 'has' : 'have'} not claimed an account yet.`
        : null

  function confirm() {
    if (!canConfirm) return
    const slots: PlayerSlotSetup[] = activeSeats.map(i => {
      const playerId = locked ? seatIds[i]! : ROSTER_IDS[i]
      const name = locked
        ? (roster.find(m => m.id === playerId)?.name ?? '')
        : names[i].trim()
      return { playerId, name, isAI: ai[i].isAI, difficulty: ai[i].difficulty }
    })
    onConfirm(slots, playOnline && canPlayOnline)
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: '2px solid rgba(200,148,10,0.60)', borderRadius: 14,
        padding: '28px 36px 24px', width: 680, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
        color: '#E8DCC8', boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: GOLD, letterSpacing: 1.5 }}>🎮 PLAYERS</div>
          <div style={{ fontSize: 11, color: '#7a6040', marginTop: 4 }}>
            {locked
              ? 'Choose how many are playing and seat them from the campaign roster'
              : 'Name each player — these names become the permanent campaign roster'}
          </div>
        </div>

        {/* The code to hand out. Shown here as well as on the campaign screen
            because this is the screen you sit on while waiting for people — and
            a brand-new campaign jumps straight here, never passing the other. */}
        {legacy?.joinCode && (
          <JoinCodeCard
            code={legacy.joinCode}
            note="Read this out so everyone can join — they sign in, enter it, and pick their name"
          />
        )}

        {/* Roster banner — makes it obvious the names are now fixed */}
        {locked && (
          <div style={{
            padding: '8px 12px', borderRadius: 7, marginBottom: 16,
            background: 'rgba(200,148,10,0.08)', border: '1px solid rgba(200,148,10,0.30)',
            fontSize: 10.5, color: '#9a8060', lineHeight: 1.5,
          }}>
            <strong style={{ color: GOLD }}>Campaign roster</strong> — {roster.map(m => m.name).join(' · ')}
            <div style={{ marginTop: 3 }}>
              Names are locked for the rest of the campaign. Anyone can sit out a game; their
              stars, signatures, cities and naming rights are waiting when they return.
            </div>
          </div>
        )}

        {/* Player count picker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: '#7a6040', letterSpacing: 1, textTransform: 'uppercase' }}>Players:</span>
          {counts.map(n => {
            const activeBtn = count === n
            return (
              <button key={n}
                onClick={() => setCount(n)}
                style={{
                  width: 42, height: 42, borderRadius: 9, fontSize: 17, fontWeight: 'bold',
                  fontFamily: 'Georgia, serif', cursor: 'pointer',
                  border: `2px solid ${activeBtn ? GOLD : 'rgba(200,148,10,0.25)'}`,
                  background: activeBtn ? 'rgba(200,148,10,0.22)' : 'rgba(0,0,0,0.25)',
                  color: activeBtn ? GOLD : '#6a5030',
                  boxShadow: activeBtn ? '0 0 10px rgba(200,148,10,0.30)' : 'none',
                  transition: 'all 0.15s',
                }}>
                {n}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {activeSeats.map(i => {
            // A roster member seated elsewhere cannot be picked again here.
            const takenElsewhere = new Set(
              activeSeats.filter(j => j !== i).map(j => seatIds[j]).filter(Boolean) as string[],
            )
            const nameOk = locked ? !!seatIds[i] : names[i].trim().length > 0
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', borderRadius: 8,
                background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(200,148,10,0.20)',
              }}>
                <div style={{ fontSize: 11, color: '#6a5030', width: 16, textAlign: 'center', flexShrink: 0 }}>{i + 1}</div>

                {locked ? (
                  /* Roster dropdown — no free text, no additions */
                  <select
                    value={seatIds[i] ?? ''}
                    onChange={e => setSeatIds(prev => prev.map((v, j) => (j === i ? (e.target.value || null) : v)))}
                    style={{
                      flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 6,
                      border: `1.5px solid ${nameOk ? 'rgba(200,148,10,0.35)' : 'rgba(231,76,60,0.55)'}`,
                      background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                      fontSize: 14, fontWeight: 'bold', fontFamily: 'Georgia, serif',
                      outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="">— choose player —</option>
                    {roster.map(m => (
                      <option key={m.id} value={m.id} disabled={takenElsewhere.has(m.id)}>
                        {m.name}{takenElsewhere.has(m.id) ? ' (seated)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  /* First setup — names typed here become the roster */
                  <input
                    value={names[i]}
                    onChange={e => setNames(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    maxLength={20}
                    placeholder={`Player ${i + 1}`}
                    style={{
                      flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 6,
                      border: `1.5px solid ${nameOk ? 'rgba(200,148,10,0.35)' : 'rgba(231,76,60,0.55)'}`,
                      background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                      fontSize: 14, fontWeight: 'bold', fontFamily: 'Georgia, serif',
                      outline: 'none',
                    }}
                  />
                )}

                {/* Human / AI toggle */}
                <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid rgba(200,148,10,0.30)', flexShrink: 0 }}>
                  {(['human', 'ai'] as const).map(kind => {
                    const activeKind = (kind === 'ai') === ai[i].isAI
                    return (
                      <button key={kind}
                        onClick={() => setAiAt(i, { isAI: kind === 'ai' })}
                        style={{
                          padding: '7px 14px', fontSize: 12, fontFamily: 'Georgia, serif', cursor: 'pointer', border: 'none',
                          background: activeKind ? (kind === 'ai' ? 'rgba(52,152,219,0.30)' : 'rgba(39,174,96,0.28)') : 'transparent',
                          color: activeKind ? '#E8DCC8' : '#7a6040', fontWeight: activeKind ? 'bold' : 'normal',
                        }}>
                        {kind === 'ai' ? '🤖 AI' : '🧑 Human'}
                      </button>
                    )
                  })}
                </div>
                {/* Difficulty — only when AI */}
                <div style={{ display: 'flex', gap: 4, width: 196, justifyContent: 'flex-end', flexShrink: 0, opacity: ai[i].isAI ? 1 : 0.25, pointerEvents: ai[i].isAI ? 'auto' : 'none' }}>
                  {DIFFS.map(d => {
                    const activeDiff = ai[i].difficulty === d
                    return (
                      <button key={d}
                        onClick={() => setAiAt(i, { difficulty: d })}
                        style={{
                          padding: '6px 11px', fontSize: 11, borderRadius: 6, fontFamily: 'Georgia, serif', cursor: 'pointer',
                          border: `1px solid ${activeDiff ? 'rgba(52,152,219,0.7)' : 'rgba(100,80,40,0.3)'}`,
                          background: activeDiff ? 'rgba(52,152,219,0.20)' : 'transparent',
                          color: activeDiff ? '#7fb3d3' : '#6a5030',
                        }}>
                        {AI_DIFFICULTY_LABEL[d]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {(humanCount === 0 || !seatCheck.ok) && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 11,
            background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)',
            color: '#e08070', textAlign: 'center',
          }}>
            {humanCount === 0 ? 'At least one player must be human' : seatCheck.reason}
          </div>
        )}

        {/* How this game is played. Hotseat is the default because it always
            works; online has real prerequisites and says which are missing. */}
        <div style={{
          border: '1px solid rgba(200,148,10,0.25)', borderRadius: 8,
          padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1, marginBottom: 8 }}>
            HOW ARE YOU PLAYING?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              ['One screen', false, 'Everyone at this machine, passing it round.'],
              ['Online', true, 'Each player on their own machine. The server rolls the dice.'],
            ] as Array<[string, boolean, string]>).map(([label, value, blurb]) => {
              const selected = playOnline === value
              const disabled = value && !canPlayOnline
              return (
                <button
                  key={label}
                  onClick={() => !disabled && setPlayOnline(value)}
                  disabled={disabled}
                  title={disabled ? (onlineBlockedReason ?? undefined) : blurb}
                  style={{
                    flex: 1, padding: '9px 10px', borderRadius: 7, textAlign: 'left',
                    border: `1.5px solid ${selected ? GOLD : 'rgba(200,148,10,0.22)'}`,
                    background: selected ? 'rgba(200,148,10,0.16)' : 'transparent',
                    color: disabled ? '#4a3820' : selected ? '#E8DCC8' : '#9a8060',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontFamily: 'Georgia, serif', fontSize: 12,
                  }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 9.5, opacity: 0.8, lineHeight: 1.4 }}>{blurb}</div>
                </button>
              )
            })}
          </div>
          {!canPlayOnline && onlineBlockedReason && (
            <div style={{ fontSize: 10, color: '#a07850', marginTop: 8, lineHeight: 1.5 }}>
              {onlineBlockedReason}
            </div>
          )}

          {/* Who still has to claim a seat. A sentence naming them is easy to
              misread as a fault; a checklist shows exactly what is outstanding
              and shrinks as people join. */}
          {user && locked && seatAccounts.length > 0 && (
            <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {seatAccounts.map((s, i) => (
                <div key={s.id ?? i} style={{
                  display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5,
                  color: s.linked ? '#8fbf9a' : '#7a6040',
                }}>
                  <span style={{ width: 12, textAlign: 'center' }}>{s.linked ? '✓' : '○'}</span>
                  <span style={{ fontWeight: s.linked ? 'bold' : 'normal' }}>{s.name}</span>
                  {s.isMe && <span style={{ color: '#6a5030' }}>(you)</span>}
                  <span style={{ color: '#5a4526', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.linked ? (s.email ?? 'account linked') : 'no account yet'}
                  </span>
                </div>
              ))}
              {unlinkedSeats.length > 0 && (
                <div style={{ fontSize: 9.5, color: '#6a5030', marginTop: 3, lineHeight: 1.5 }}>
                  Each of them opens the app, signs in, types the join code above and picks their
                  name. That links the seat for the rest of the campaign — it is a one-time step.
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={confirm}
          disabled={!canConfirm}
          style={{
            width: '100%', padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
            border: `2px solid ${canConfirm ? 'rgba(200,148,10,0.70)' : 'rgba(100,70,30,0.25)'}`,
            background: canConfirm ? 'rgba(200,148,10,0.16)' : 'rgba(100,70,30,0.10)',
            color: canConfirm ? '#E8DCC8' : 'rgba(150,120,80,0.35)',
            cursor: canConfirm ? 'pointer' : 'not-allowed',
            fontFamily: 'Georgia, serif', letterSpacing: 0.5,
          }}>
          {playOnline && canPlayOnline ? 'Continue Online → Deal Scar Cards & Roll' : 'Continue → Deal Scar Cards & Roll for First'}
        </button>
      </div>
    </div>
  )
}
