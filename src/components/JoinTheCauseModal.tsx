import { useState } from 'react'
import type { Territory } from '@/types/territory'
import type { Player } from '@/types/player'
import { FACTION_COLORS, NEUTRAL_COLOR } from '@/data/mockGameState'
import type { FactionId } from '@/types/faction'
import { MISSION_CARDS } from '@/data/cards'

interface Props {
  players: Player[]
  territories: Record<string, Territory>
  /** Mission card IDs still in the mission deck (available to pick) */
  availableMissionIds: string[]
  /**
   * The shared face-up mission this would replace, if there is one.
   *
   * Missions have been one shared card for a while; this used to be handed a
   * playerId→missionId map built by copying that single id across every player.
   */
  currentMissionId: string | null
  /** Territory ID of the World Capital (adds +5 population) */
  worldCapitalTerritoryId?: string
  /**
   * Who won the population count. Decided by the board, not recomputed here.
   *
   * This screen used to work it out for itself off the rendered snapshot while
   * the AI drivers used the live ref — two answers to one question, and the one
   * on screen was not the one that got the troops.
   */
  leaderId: string
  /** How many territories the leader could actually put the troops in. */
  reinforceTargets: number
  onChooseTroops: (playerId: string) => void
  onChooseMission: (playerId: string, missionId: string) => void
  /** Neither reward is available — close without one. */
  onDecline: () => void
}

type Phase = 'population' | 'choice' | 'mission-pick'

function hexToRgb(hex: number) {
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}

function calcPopulation(
  playerId: string,
  territories: Record<string, Territory>,
  worldCapitalTerritoryId?: string,
): number {
  let score = 0
  for (const t of Object.values(territories)) {
    if (t.occupyingPlayerId !== playerId) continue
    score += 1
    // The World Capital counts as exactly 5 — its own city stickers aren't also counted
    if (t.id === worldCapitalTerritoryId) {
      score += 5
      continue
    }
    for (const city of t.cities) {
      if (city.isDestroyed || city.headquartersFactionId) continue
      score += city.isMajor ? 2 : 1
    }
  }
  return score
}

export default function JoinTheCauseModal({
  players, territories, availableMissionIds, currentMissionId,
  worldCapitalTerritoryId, leaderId, reinforceTargets,
  onChooseTroops, onChooseMission, onDecline,
}: Props) {
  const [phase, setPhase] = useState<Phase>('population')
  const [selectedMission, setSelectedMission] = useState<string | null>(null)

  // Populations are shown here; who WON is handed in, so this screen and the
  // code that pays out the reward can never name two different players.
  const scores = players
    .filter(p => !p.isEliminated)
    .map(p => ({ player: p, score: calcPopulation(p.id, territories, worldCapitalTerritoryId) }))
  const leader = scores.find(s => s.player.id === leaderId)
  if (!leader) return null

  const availableMissions = MISSION_CARDS.filter(m => availableMissionIds.includes(m.id))

  const accentColor = '#9040c0'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(4,0,8,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #120818 0%, #0a0512 100%)',
        border: `2px solid ${accentColor}66`,
        borderRadius: 14, padding: '28px 30px 24px',
        width: 520, maxWidth: '94vw', color: '#E8DCC8',
        boxShadow: `0 0 60px ${accentColor}18, 0 12px 50px rgba(0,0,0,0.85)`,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>🫂</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#c8a0e8', letterSpacing: 1 }}>
            Join the Cause
          </div>
          <div style={{ fontSize: 10, color: '#6a4a7a', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 4 }}>
            Event Card
          </div>
          <div style={{ width: 50, height: 1, background: `${accentColor}60`, margin: '12px auto 0' }} />
        </div>

        {phase === 'population' && (
          <PopulationPhase
            scores={scores}
            leader={leader}
            accentColor={accentColor}
            onContinue={() => setPhase('choice')}
          />
        )}

        {phase === 'choice' && (
          <ChoicePhase
            leader={leader.player}
            accentColor={accentColor}
            hasMissions={availableMissions.length > 0}
            reinforceTargets={reinforceTargets}
            onChooseTroops={() => onChooseTroops(leader.player.id)}
            onChooseMission={() => setPhase('mission-pick')}
            onDecline={onDecline}
          />
        )}

        {phase === 'mission-pick' && (
          <MissionPickPhase
            leader={leader.player}
            availableMissions={availableMissions}
            currentMissionId={currentMissionId ?? undefined}
            selectedMission={selectedMission}
            onSelect={setSelectedMission}
            accentColor={accentColor}
            onConfirm={() => {
              if (selectedMission) onChooseMission(leader.player.id, selectedMission)
            }}
          />
        )}
      </div>
    </div>
  )
}

function PopulationPhase({
  scores, leader, accentColor, onContinue,
}: {
  scores: Array<{ player: Player; score: number }>
  leader: { player: Player; score: number }
  accentColor: string
  onContinue: () => void
}) {
  const sorted = [...scores].sort((a, b) => b.score - a.score)
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8a6a9a', marginBottom: 14, textAlign: 'center' }}>
        Population = territories + 1 per minor city + 2 per major city
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 20 }}>
        {sorted.map(({ player, score }) => {
          const isLeader = player.id === leader.player.id
          const col = hexToRgb(FACTION_COLORS[player.factionId as FactionId] ?? NEUTRAL_COLOR)
          const pct = (score / Math.max(leader.score, 1)) * 100
          return (
            <div key={player.id} style={{
              padding: '9px 12px', borderRadius: 7,
              background: isLeader ? `${accentColor}12` : 'rgba(255,255,255,0.03)',
              border: isLeader ? `1px solid ${accentColor}55` : '1px solid rgba(200,148,10,0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: col, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: isLeader ? '#e8d0ff' : '#c0a870', fontWeight: isLeader ? 'bold' : 'normal', flex: 1 }}>
                  {player.name}
                </span>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: isLeader ? '#c8a0e8' : '#8a7060' }}>
                  {score}
                </span>
                {isLeader && (
                  <span style={{
                    fontSize: 9, background: `${accentColor}25`, color: '#c8a0e8',
                    borderRadius: 3, padding: '2px 6px', letterSpacing: 0.5,
                  }}>LARGEST</span>
                )}
              </div>
              <div style={{
                height: 3, borderRadius: 2,
                background: isLeader ? accentColor : 'rgba(200,148,10,0.2)',
                width: `${pct}%`, transition: 'width 0.4s ease',
              }} />
            </div>
          )
        })}
      </div>
      <ActionButton color={accentColor} onClick={onContinue}>
        {leader.player.name} chooses their reward →
      </ActionButton>
    </div>
  )
}

function ChoicePhase({
  leader, accentColor, hasMissions, reinforceTargets, onChooseTroops, onChooseMission, onDecline,
}: {
  leader: Player; accentColor: string; hasMissions: boolean; reinforceTargets: number
  onChooseTroops: () => void; onChooseMission: () => void; onDecline: () => void
}) {
  const col = hexToRgb(FACTION_COLORS[leader.factionId as FactionId] ?? NEUTRAL_COLOR)
  // Both rewards can be unavailable at once — no city to garrison and an empty
  // mission deck. Without a way out that is a modal with two dead buttons and
  // no close, which ends the game where it stands.
  const nothingToClaim = reinforceTargets === 0 && !hasMissions
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
        padding: '10px 14px', borderRadius: 8,
        background: `${accentColor}0e`, border: `1px solid ${accentColor}30`,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: col }} />
        <span style={{ fontSize: 14, color: '#e8d0ff', fontWeight: 'bold' }}>{leader.name}</span>
        <span style={{ fontSize: 12, color: '#8a6a9a' }}>— choose your reward</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Reinforce is refused up front when there is nowhere legal to put the
            troops. Taking it and finding out afterwards looked exactly like the
            reward silently failing. */}
        <ChoiceCard
          icon="⚔"
          title="Reinforce"
          description={reinforceTargets > 0
            ? `Gain 3 troops to place in any cities you control (${reinforceTargets} to choose from).`
            : 'You control no city, so there is nowhere to put them.'}
          color={reinforceTargets > 0 ? accentColor : '#4a4a4a'}
          disabled={reinforceTargets === 0}
          onClick={onChooseTroops}
        />
        <ChoiceCard
          icon="📜"
          title="New Mission"
          description={hasMissions
            ? 'Swap the shared face-up mission for any available mission of your choice.'
            : 'No available missions in the deck right now.'}
          color={hasMissions ? accentColor : '#4a4a4a'}
          disabled={!hasMissions}
          onClick={onChooseMission}
        />
      </div>
      {nothingToClaim && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: '#8a6a9a', textAlign: 'center', marginBottom: 10 }}>
            Neither reward can be taken — {leader.name} controls no city and the mission deck is empty.
          </div>
          <ActionButton color={accentColor} onClick={onDecline}>
            Continue →
          </ActionButton>
        </div>
      )}
    </div>
  )
}

function ChoiceCard({
  icon, title, description, color, disabled, onClick,
}: {
  icon: string; title: string; description: string; color: string
  disabled?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '14px 16px', borderRadius: 8, textAlign: 'left',
      border: `1px solid ${color}44`, background: `${color}0c`,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
      fontFamily: 'Georgia, serif', color: '#e8dcc8',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 'bold', color, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#9a8070', lineHeight: 1.5 }}>{description}</div>
      </div>
    </button>
  )
}

function MissionPickPhase({
  leader, availableMissions, currentMissionId, selectedMission,
  onSelect, accentColor, onConfirm,
}: {
  leader: Player
  availableMissions: typeof MISSION_CARDS
  currentMissionId: string | undefined
  selectedMission: string | null
  onSelect: (id: string) => void
  accentColor: string
  onConfirm: () => void
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8a6a9a', marginBottom: 14, textAlign: 'center' }}>
        {leader.name} — pick your new mission
      </div>
      {currentMissionId && (
        <div style={{
          marginBottom: 12, padding: '8px 12px', borderRadius: 6,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(200,148,10,0.15)',
          fontSize: 11, color: '#6a5030',
        }}>
          Current: {MISSION_CARDS.find(m => m.id === currentMissionId)?.description ?? '—'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
        {availableMissions.map(m => {
          const isSelected = selectedMission === m.id
          return (
            <button key={m.id} onClick={() => onSelect(m.id)} style={{
              padding: '10px 13px', borderRadius: 7, textAlign: 'left',
              border: isSelected ? `2px solid ${accentColor}` : `1px solid ${accentColor}25`,
              background: isSelected ? `${accentColor}18` : `${accentColor}06`,
              cursor: 'pointer', fontFamily: 'Georgia, serif',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 12, color: isSelected ? '#e8d0ff' : '#c0a870', lineHeight: 1.4, flex: 1 }}>
                {m.description}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 'bold', flexShrink: 0,
                color: isSelected ? '#c8a0e8' : '#6a5030',
              }}>
                {m.stars === 2 ? '★★ Special' : '★ Standard'}
              </span>
            </button>
          )
        })}
      </div>
      <ActionButton color={accentColor} onClick={onConfirm} disabled={!selectedMission}>
        Confirm Mission Choice →
      </ActionButton>
    </div>
  )
}

function ActionButton({
  color, children, onClick, disabled,
}: {
  color: string; children: React.ReactNode; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', padding: '12px', borderRadius: 7, fontSize: 13, fontWeight: 'bold',
      border: `2px solid ${color}88`, background: `${color}18`,
      color: '#e8d0ff', cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'Georgia, serif', letterSpacing: 0.5,
      opacity: disabled ? 0.5 : 1,
    }}>
      {children}
    </button>
  )
}
