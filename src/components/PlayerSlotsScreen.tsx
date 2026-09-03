import { useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import type { AIDifficulty } from '@/types/ai'
import { AI_DIFFICULTY_LABEL } from '@/types/ai'
import { MAX_ROSTER, MAX_ROSTER_NAME, getRoster } from '@/lib/roster'
import { generateAiName } from '@/lib/aiNames'

export interface SlotConfig { isAI: boolean; difficulty: AIDifficulty }

/** One configured player slot, in seating order */
export interface PlayerSlotSetup {
  /** Roster id, or null for a name typed here — the caller adds it to the roster. */
  playerId: string | null
  name: string
  isAI: boolean
  difficulty: AIDifficulty
}

interface Props {
  /** Campaign state — supplies the roster. */
  legacy?: LegacyState | null
  onConfirm: (slots: PlayerSlotSetup[]) => void
  /** Changed your mind — back to the campaign screen, nothing committed. */
  onBack: () => void
}

const DIFFS: AIDifficulty[] = ['easy', 'medium', 'hard']

const GOLD = '#C8940A'

/** Sentinel select value meaning "type a new name for this seat". */
const NEW = '__new__'

/**
 * Hotseat setup: pick how many players (2–5), fill each seat, and choose which
 * are human or computer — all before the dice roll. Online games never pass
 * through here; they are hosted from the campaign screen and seat themselves
 * in the lobby.
 *
 * A seat is filled from the campaign roster OR by typing a new name, which
 * joins the roster when the game starts. One model instead of the old
 * locked/unlocked split: existing names are permanent and picked from the
 * list, new people are typed in by whoever is sitting down — the same rule the
 * online flow follows, where everyone names themself.
 *
 * Toggling a seat to AI with no name yet generates one, and the generated name
 * stays editable — it is a suggestion, not a decision.
 */
export default function PlayerSlotsScreen({ legacy = null, onConfirm, onBack }: Props) {
  const roster = getRoster(legacy)

  const [count, setCount] = useState(Math.min(4, MAX_ROSTER))
  // Per seat: a roster id, the NEW sentinel, or null (unfilled).
  const [seatIds, setSeatIds] = useState<Array<string | null>>(() =>
    Array.from({ length: MAX_ROSTER }, (_, i) => roster[i]?.id ?? (roster.length === 0 ? NEW : null)),
  )
  // The typed name for seats in NEW mode.
  const [newNames, setNewNames] = useState<string[]>(() => Array.from({ length: MAX_ROSTER }, () => ''))
  const [ai, setAi] = useState<Array<{ isAI: boolean; difficulty: AIDifficulty }>>(() =>
    Array.from({ length: MAX_ROSTER }, () => ({ isAI: false, difficulty: 'medium' as AIDifficulty })),
  )

  const activeSeats = Array.from({ length: count }, (_, i) => i)
  const humanCount = activeSeats.filter(i => !ai[i].isAI).length

  const nameOfSeat = (i: number): string =>
    seatIds[i] === NEW ? newNames[i].trim() : (roster.find(m => m.id === seatIds[i])?.name ?? '')

  /** Everything wrong with the current table, first problem wins. */
  function seatProblem(): string | null {
    for (const i of activeSeats) {
      if (!seatIds[i]) return 'Every seat must be assigned a player'
      if (seatIds[i] === NEW && !newNames[i].trim()) return `Seat ${i + 1} needs a name`
    }
    const rosterPicks = activeSeats.map(i => seatIds[i]).filter(id => id && id !== NEW)
    if (new Set(rosterPicks).size !== rosterPicks.length) return 'Each player can only take one seat'
    const fresh = activeSeats.filter(i => seatIds[i] === NEW).map(i => newNames[i].trim().toLowerCase())
    if (new Set(fresh).size !== fresh.length) return 'Each new player needs a different name'
    const existing = new Set(roster.map(m => m.name.toLowerCase()))
    const clash = fresh.find(n => existing.has(n))
    if (clash) return `${clash} is already on the roster — pick them from the list instead`
    if (roster.length + fresh.length > MAX_ROSTER) {
      return `That would put ${roster.length + fresh.length} people in a ${MAX_ROSTER}-player campaign`
    }
    if (humanCount === 0) return 'At least one player must be human'
    return null
  }
  const problem = seatProblem()

  const setAiAt = (i: number, patch: Partial<{ isAI: boolean; difficulty: AIDifficulty }>) => {
    setAi(prev => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
    // A brand-new AI seat gets a suggested name so the host is not forced to
    // invent one — but it lands in the editable field, not past it.
    if (patch.isAI && seatIds[i] === NEW && !newNames[i].trim()) {
      const taken = [
        ...roster.map(m => m.name),
        ...newNames.filter((_, j) => j !== i),
      ]
      setNewNames(prev => prev.map((v, j) => (j === i ? generateAiName(taken) : v)))
    }
  }

  function confirm() {
    if (problem) return
    onConfirm(activeSeats.map(i => ({
      playerId: seatIds[i] === NEW ? null : seatIds[i],
      name: nameOfSeat(i),
      isAI: ai[i].isAI,
      difficulty: ai[i].difficulty,
    })))
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
            Everyone at this screen — seat campaign players or type someone new
          </div>
        </div>

        {/* Player count picker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: '#7a6040', letterSpacing: 1, textTransform: 'uppercase' }}>Players:</span>
          {[2, 3, 4, 5].map(n => {
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
              activeSeats.filter(j => j !== i).map(j => seatIds[j]).filter(id => id && id !== NEW) as string[],
            )
            const isNew = seatIds[i] === NEW
            const filled = isNew ? newNames[i].trim().length > 0 : !!seatIds[i]
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', borderRadius: 8,
                background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(200,148,10,0.20)',
              }}>
                <div style={{ fontSize: 11, color: '#6a5030', width: 16, textAlign: 'center', flexShrink: 0 }}>{i + 1}</div>

                {roster.length > 0 && (
                  <select
                    value={seatIds[i] ?? ''}
                    onChange={e => setSeatIds(prev => prev.map((v, j) => (j === i ? (e.target.value || null) : v)))}
                    style={{
                      flex: isNew ? '0 0 128px' : 1, minWidth: 0, padding: '8px 10px', borderRadius: 6,
                      border: `1.5px solid ${filled ? 'rgba(200,148,10,0.35)' : 'rgba(231,76,60,0.55)'}`,
                      background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                      fontSize: 13, fontWeight: 'bold', fontFamily: 'Georgia, serif',
                      outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="">— choose —</option>
                    {roster.map(m => (
                      <option key={m.id} value={m.id} disabled={takenElsewhere.has(m.id)}>
                        {m.name}{takenElsewhere.has(m.id) ? ' (seated)' : ''}
                      </option>
                    ))}
                    <option value={NEW}>➕ New player…</option>
                  </select>
                )}
                {isNew && (
                  <input
                    value={newNames[i]}
                    onChange={e => setNewNames(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    maxLength={MAX_ROSTER_NAME}
                    placeholder={ai[i].isAI ? 'Computer player name' : 'Their name — they join the campaign'}
                    style={{
                      flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 6,
                      border: `1.5px solid ${filled ? 'rgba(200,148,10,0.35)' : 'rgba(231,76,60,0.55)'}`,
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
                        // WHICH ONE IS ON, SAID OUT LOUD. It was expressed only
                        // as a background colour, which a screen reader cannot
                        // read and a test cannot assert on without matching
                        // rgba strings. A pressed toggle is a state, and the
                        // accessibility tree is where a state belongs.
                        aria-pressed={activeKind}
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

        {problem && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 11,
            background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)',
            color: '#e08070', textAlign: 'center', lineHeight: 1.5,
          }}>
            {problem}
          </div>
        )}

        <button
          onClick={confirm}
          disabled={!!problem}
          style={{
            width: '100%', padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
            border: `2px solid ${!problem ? 'rgba(200,148,10,0.70)' : 'rgba(100,70,30,0.25)'}`,
            background: !problem ? 'rgba(200,148,10,0.16)' : 'rgba(100,70,30,0.10)',
            color: !problem ? '#E8DCC8' : 'rgba(150,120,80,0.35)',
            cursor: !problem ? 'pointer' : 'not-allowed',
            fontFamily: 'Georgia, serif', letterSpacing: 0.5,
          }}>
          Continue → Deal Scar Cards &amp; Roll for First
        </button>
        <button
          onClick={onBack}
          style={{
            width: '100%', marginTop: 8, padding: '9px', borderRadius: 7, fontSize: 11.5,
            border: '1px solid rgba(200,148,10,0.20)', background: 'transparent',
            color: '#6a5030', cursor: 'pointer', fontFamily: 'Georgia, serif',
          }}>
          ← Back to the campaign
        </button>
      </div>
    </div>
  )
}
