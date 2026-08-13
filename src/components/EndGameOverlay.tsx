import type { Player } from '@/types/player'
import type { EndGameState } from '@/types/game'
import { FACTION_COLORS } from '@/data/mockGameState'

interface Props {
  endGame: EndGameState
  players: Player[]
  gameNumber: number
  /** Reward order: winner first, then each human runner-up. */
  rewardOrder: string[]
  /** Humans whose Continue/Quit decides the gate. */
  humanIds: string[]
  /** This machine's seat, if it holds one. */
  myId: string | null
  onContinue: () => void
  onQuit: () => void
}

const CONDITION_TEXT: Record<EndGameState['condition'], string> = {
  mission: '🎯 Mission Accomplished',
  stars: '★ Four Red Stars',
  elimination: '⚔ Last Faction Standing',
}

function factionColor(factionId: string | undefined): string {
  const hex = (FACTION_COLORS as Record<string, number>)[factionId ?? ''] ?? 0x888888
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}

/**
 * The end-of-game ceremony as every NON-ACTING machine sees it — and as every
 * machine sees it between its own steps: who won, whose rewards are being
 * recorded, and (once all rewards are in) the Continue / Save & Quit gate.
 *
 * Renders purely from the synced `endGame` session, so a machine that
 * reconnects mid-ceremony lands in the right place. Before this overlay, a
 * finished game showed the other machines a 3.5-second toast and then a
 * frozen board that looked like a game still in progress.
 */
export default function EndGameOverlay({
  endGame, players, gameNumber, rewardOrder, humanIds, myId, onContinue, onQuit,
}: Props) {
  const nameOf = (pid: string) => players.find(p => p.id === pid)?.name ?? pid
  const winner = players.find(p => p.id === endGame.winnerId)
  const wColor = factionColor(winner?.factionId)

  const allRewardsDone = rewardOrder.every(id => endGame.rewardsDone[id])
  const currentRewardId = rewardOrder.find(id => !endGame.rewardsDone[id]) ?? null
  const myChoice = myId ? endGame.continues[myId] : undefined
  const quitter = humanIds.find(id => endGame.continues[id] === 'quit') ?? null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1900,
      background: 'radial-gradient(ellipse at center, rgba(20,10,2,0.90) 0%, rgba(5,2,0,0.96) 70%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif', padding: 16, overflowY: 'auto',
    }}>
      <div style={{
        width: 500, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: `2px solid ${wColor}80`, borderRadius: 14,
        padding: '28px 30px 24px', color: '#E8DCC8',
        boxShadow: `0 16px 60px rgba(0,0,0,0.9), 0 0 40px ${wColor}22`,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#7a6040', textTransform: 'uppercase', marginBottom: 10 }}>
          ✦ Game {gameNumber} Complete ✦
        </div>
        <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 6 }}>🏆</div>
        <div style={{ fontSize: 26, fontWeight: 'bold', color: wColor, marginBottom: 2 }}>
          {winner?.name ?? 'Unknown'}
        </div>
        <div style={{ fontSize: 12, color: '#9a8060', marginBottom: 20 }}>
          {CONDITION_TEXT[endGame.condition]}
        </div>

        {/* ── Reward progress ── */}
        <div style={{
          textAlign: 'left', padding: '12px 14px', borderRadius: 9, marginBottom: 16,
          background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(200,148,10,0.18)',
        }}>
          <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(200,148,10,0.55)', marginBottom: 8 }}>
            Legacy Rewards
          </div>
          {rewardOrder.map(pid => {
            const done = !!endGame.rewardsDone[pid]
            const active = pid === currentRewardId
            return (
              <div key={pid} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px',
                fontSize: 13, color: done ? '#5a8040' : active ? '#E8DCC8' : '#6a5030',
              }}>
                <span style={{ width: 18, textAlign: 'center' }}>{done ? '✓' : active ? '⏳' : '·'}</span>
                <span style={{ flex: 1 }}>
                  {nameOf(pid)}{pid === endGame.winnerId && <span style={{ fontSize: 10, color: '#8a6a20' }}> (winner)</span>}
                  {pid === myId && <span style={{ fontSize: 10, color: '#6a5030' }}> — you</span>}
                </span>
                <span style={{ fontSize: 10, color: done ? '#4a6a30' : '#6a5030' }}>
                  {done ? 'recorded' : active ? 'choosing their rewards…' : 'waiting'}
                </span>
              </div>
            )
          })}
        </div>

        {/* ── Continue gate ── */}
        {!allRewardsDone ? (
          <div style={{ fontSize: 11, color: '#7a6040' }}>
            {currentRewardId === myId
              ? 'Your reward screen is opening…'
              : `Waiting for ${nameOf(currentRewardId ?? '')} to record their legacy rewards on their screen…`}
          </div>
        ) : quitter ? (
          <div style={{
            padding: '14px 16px', borderRadius: 9, fontSize: 13, color: '#d0a070',
            background: 'rgba(200,120,20,0.08)', border: '1px solid rgba(200,120,20,0.35)',
          }}>
            💾 {nameOf(quitter)} saved and left the table. The campaign is safe —
            returning to the campaign screen…
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#9a8060', marginBottom: 12 }}>
              All rewards are recorded. Game {gameNumber + 1} begins when <strong style={{ color: '#C8940A' }}>everyone</strong> continues.
            </div>
            {!myChoice && myId && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <button onClick={onQuit} style={{
                  flex: 1, padding: '12px', borderRadius: 8, fontSize: 12, fontWeight: 'bold',
                  border: '2px solid rgba(100,80,40,0.45)', background: 'rgba(60,40,10,0.20)',
                  color: 'rgba(180,150,100,0.75)', cursor: 'pointer', fontFamily: 'Georgia, serif',
                }}>
                  💾 Save Campaign &amp; Quit
                </button>
                <button onClick={onContinue} style={{
                  flex: 2, padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
                  border: `2px solid ${wColor}`, background: `${wColor}22`,
                  color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
                }}>
                  ▶ Continue to Game {gameNumber + 1}
                </button>
              </div>
            )}
            {myChoice && (
              <div style={{ fontSize: 11, color: '#5a8040', marginBottom: 12 }}>
                ✓ You chose to {myChoice === 'continue' ? `continue to Game ${gameNumber + 1}` : 'save and quit'}
              </div>
            )}
            <div style={{
              textAlign: 'left', padding: '10px 14px', borderRadius: 9,
              background: 'rgba(0,0,0,0.20)', border: '1px solid rgba(200,148,10,0.14)',
            }}>
              {humanIds.map(pid => {
                const c = endGame.continues[pid]
                return (
                  <div key={pid} style={{ display: 'flex', gap: 8, padding: '3px 2px', fontSize: 12, color: c ? '#5a8040' : '#6a5030' }}>
                    <span style={{ width: 18, textAlign: 'center' }}>{c ? '✓' : '·'}</span>
                    <span style={{ flex: 1 }}>{nameOf(pid)}{pid === myId ? ' — you' : ''}</span>
                    <span style={{ fontSize: 10 }}>{c === 'continue' ? 'ready' : c === 'quit' ? 'leaving' : 'deciding…'}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
