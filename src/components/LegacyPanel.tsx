import { useEffect, useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import { loadGameHistory, type GameSessionRow } from '@/lib/legacyApi'
import { FACTION_ABILITY_OPTIONS } from '@/data/factionAbilities'
import { FACTION_COLORS } from '@/data/mockGameState'
import { COMEBACK_POWERS } from './ComebackPowerModal'
import RulesTab from './RulesTab'
import { MUTANT_EVOLVE_POWERS, MISSILE_POWERS, MISSILE_POWER_COLOR } from '@/data/missilePowers'
import { WEAKNESS_POWERS } from '@/data/weaknessPowers'
import { MILESTONES } from '@/data/milestones'
import { CARD_LOOKUP } from '@/data/cards'
import { leadFactionId, factionWinCounts } from '@/lib/gameLogic'
import type { MissionCard } from '@/types/card'

interface Props {
  legacy: LegacyState
  /**
   * factionId → playerId for THIS game. Who plays which faction changes every
   * game, so the per-game red-star tally can only be read through this map;
   * without it a faction shows no stars rather than someone else's.
   */
  factionPlayerIds?: Record<string, string>
  onClose: () => void
}

type Tab = 'history' | 'milestones' | 'factions' | 'rules'

export default function LegacyPanel({ legacy, factionPlayerIds = {}, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('history')
  const [sessions, setSessions] = useState<GameSessionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadGameHistory(legacy.campaignId, legacy.campaignEpoch).then(rows => { setSessions(rows); setLoading(false) })
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(5,2,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 900, fontFamily: 'Georgia, serif',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0E0700 100%)',
        border: '2px solid rgba(200,148,10,0.60)',
        borderRadius: 13, width: 620, maxWidth: '94vw', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        color: '#E8DCC8', boxShadow: '0 12px 50px rgba(0,0,0,0.85)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 0',
          borderBottom: '1px solid rgba(200,148,10,0.20)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1 }}>
                📜 LEGACY RECORD
              </div>
              <div style={{ fontSize: 12, color: '#7a6040', marginTop: 2 }}>
                {legacy.worldName} · Campaign Game {legacy.currentGameNumber}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#6a5030',
              fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1,
            }}>×</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {(['history', 'milestones', 'factions', 'rules'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '7px 18px', fontSize: 11, letterSpacing: 1,
                background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid #C8940A' : '2px solid transparent',
                color: tab === t ? '#C8940A' : '#6a5030',
                cursor: 'pointer', fontFamily: 'Georgia, serif',
                textTransform: 'uppercase',
              }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>

          {/* ── HISTORY TAB ── */}
          {/* The campaign story: milestone unlocks and game victories only.
              Deliberately NOT a play-by-play — troop placements, combat rolls,
              scar/city placements and other per-turn events are excluded. */}
          {tab === 'history' && (() => {
            // One entry per milestone that has unlocked, plus one per completed
            // game, ordered by game number so it reads as a chronicle.
            const unlockGames = legacy.milestoneUnlockGames ?? {}
            const milestoneEntries = MILESTONES
              .filter(m => m.isUnlocked(legacy))
              .map(m => ({
                kind: 'milestone' as const,
                // Milestones unlocked before the game number was recorded sort
                // last within their group rather than claiming to be Game 0.
                game: unlockGames[m.id],
                name: m.name,
                reward: m.reward,
              }))
            const gameEntries = sessions.map(s => ({
              kind: 'victory' as const,
              game: s.game_number,
              winner: s.winner_player_name,
              faction: s.winner_faction_id,
              date: s.created_at,
            }))
            const story = [...milestoneEntries, ...gameEntries]
              .sort((a, b) => (a.game ?? Infinity) - (b.game ?? Infinity))

            return (
              <div>
                <SectionHead>Campaign Story</SectionHead>
                <div style={{ fontSize: 10, color: '#5a4020', marginBottom: 14, fontStyle: 'italic' }}>
                  Major moments only — milestone unlocks and game victories.
                </div>
                {loading && <Muted>Loading…</Muted>}
                {!loading && story.length === 0 && (
                  <Muted>Nothing yet — win a game or unlock a milestone to begin the story.</Muted>
                )}
                {story.map((e, i) => e.kind === 'milestone' ? (
                  <div key={`m-${i}`} style={{
                    padding: '11px 14px', borderRadius: 7, marginBottom: 8,
                    background: 'rgba(52,152,219,0.08)',
                    border: '1px solid rgba(52,152,219,0.28)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 'bold', color: '#5DADE2' }}>
                      {e.game !== undefined ? `Game ${e.game} — ` : ''}✉ {e.name} Unlocked
                    </div>
                    <div style={{ fontSize: 11, color: '#7a94a8', marginTop: 4 }}>{e.reward}</div>
                  </div>
                ) : (
                  <div key={`v-${i}`} style={{
                    padding: '11px 14px', borderRadius: 7, marginBottom: 8,
                    background: 'rgba(200,148,10,0.06)',
                    border: '1px solid rgba(200,148,10,0.18)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 'bold', color: '#C8940A' }}>
                        Game {e.game} — {e.winner ? `🏆 ${e.winner} won` : 'no winner recorded'}
                      </span>
                      {e.date && (
                        <span style={{ fontSize: 10, color: '#5a4020' }}>
                          {new Date(e.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {e.winner && e.faction && (
                      <div style={{ fontSize: 11, color: '#7a6040', marginTop: 3 }}>
                        {e.faction.replace(/-/g, ' ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}

          {/* ── MILESTONES TAB ── */}
          {tab === 'milestones' && (
            <div>
              <SectionHead>Campaign Milestones</SectionHead>
              <div style={{ fontSize: 10, color: '#5a4020', marginBottom: 14, fontStyle: 'italic' }}>
                Sealed envelopes reveal new content when their condition is met. A red ✗ marks the ones already opened this campaign.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                {MILESTONES.map((m, i) => {
                  const unlocked = m.isUnlocked(legacy)
                  return (
                    <div key={i} style={{
                      position: 'relative', width: 168, boxSizing: 'border-box',
                      borderRadius: 6, overflow: 'hidden',
                      background: unlocked
                        ? 'linear-gradient(160deg, #6a5a3a 0%, #4a3d26 100%)'
                        : 'linear-gradient(160deg, #d8c69a 0%, #c2ad7c 100%)',
                      border: `1.5px solid ${unlocked ? 'rgba(120,100,60,0.6)' : 'rgba(120,95,45,0.55)'}`,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
                      opacity: unlocked ? 0.85 : 1,
                    }}>
                      {/* Envelope flap */}
                      <div style={{
                        height: 34,
                        background: unlocked ? 'rgba(0,0,0,0.18)' : 'rgba(150,120,60,0.30)',
                        clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                        borderBottom: `1px solid ${unlocked ? 'rgba(90,75,45,0.5)' : 'rgba(130,100,50,0.4)'}`,
                      }} />

                      {/* Envelope body — sealed cards only reveal HOW to open (no spoilers).
                          The milestone's name and contents stay hidden until it is opened. */}
                      <div style={{ padding: '8px 12px 12px' }}>
                        {unlocked ? (
                          <div style={{
                            fontSize: 13, fontWeight: 'bold', lineHeight: 1.15, marginBottom: 8,
                            color: '#e8dcc0',
                          }}>
                            {m.name}
                          </div>
                        ) : (
                          <div style={{
                            fontSize: 9, letterSpacing: 2, textTransform: 'uppercase',
                            color: 'rgba(90,65,25,0.70)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5,
                          }}>
                            <span style={{ fontSize: 12 }}>🔒</span> Sealed Milestone
                          </div>
                        )}
                        <div style={{
                          fontSize: 9.5, lineHeight: 1.4,
                          color: unlocked ? 'rgba(220,200,150,0.70)' : 'rgba(70,50,20,0.90)',
                          borderTop: `1px dashed ${unlocked ? 'rgba(200,180,130,0.30)' : 'rgba(120,90,40,0.40)'}`,
                          paddingTop: 6,
                        }}>
                          <span style={{ fontWeight: 'bold' }}>Open: </span>{m.unlock}
                        </div>
                      </div>

                      {/* Red X overlay for opened envelopes */}
                      {unlocked && (
                        <>
                          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                            <line x1="8" y1="8" x2="92" y2="92" stroke="#e0201a" strokeWidth="6" opacity="0.82" strokeLinecap="round" />
                            <line x1="92" y1="8" x2="8" y2="92" stroke="#e0201a" strokeWidth="6" opacity="0.82" strokeLinecap="round" />
                          </svg>
                          <div style={{
                            position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
                            fontSize: 8, letterSpacing: 2, fontWeight: 'bold', color: '#e0201a',
                            background: 'rgba(0,0,0,0.55)', padding: '1px 8px', borderRadius: 3,
                            pointerEvents: 'none',
                          }}>
                            OPENED
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: '#6a5030', marginTop: 16, textAlign: 'center' }}>
                {MILESTONES.filter(m => m.isUnlocked(legacy)).length} of {MILESTONES.length} milestones opened
              </div>
            </div>
          )}

          {/* ── FACTIONS TAB ── */}
          {/* ── RULES TAB ── */}
          {tab === 'rules' && <RulesTab legacy={legacy} />}

          {tab === 'factions' && (
            <div>
              <SectionHead>Faction Abilities — Permanent Campaign Choices</SectionHead>
              <div style={{ fontSize: 10, color: '#5a4020', marginBottom: 14, fontStyle: 'italic' }}>
                Each faction's ability was chosen in Game 1 and cannot be changed.
              </div>
              {[
                { id: 'enclave-of-the-bear',  name: 'Enclave of the Bear',  icon: '🐻' },
                { id: 'imperial-balkania',     name: 'Imperial Balkania',    icon: '⚔' },
                { id: 'khan-industries',       name: 'Khan Industries',      icon: '⚙' },
                { id: 'saharan-republic',      name: 'Saharan Republic',     icon: '☀' },
                { id: 'die-mechaniker',        name: 'Die Mechaniker',       icon: '🔩' },
              ].map(({ id, name, icon }) => {
                const hex = FACTION_COLORS[id] ?? 0x888888
                const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff
                const color = `rgb(${r},${g},${b})`
                const chosenId = (legacy.chosenFactionAbilities ?? {})[id]
                const ability = chosenId ? FACTION_ABILITY_OPTIONS.find(a => a.id === chosenId) : null
                const [opt1, opt2] = FACTION_ABILITY_OPTIONS.filter(a => a.factionId === id)
                const PHASE_LABEL: Record<string, string> = {
                  combat: '⚔ Combat', draft: '⊕ Draft', fortify: '⟳ Fortify', any: '★ Any',
                }
                return (
                  <div key={id} style={{
                    borderRadius: 10, marginBottom: 14, overflow: 'hidden',
                    border: `2px solid rgba(${r},${g},${b},0.55)`,
                    background: `rgba(${r},${g},${b},0.06)`,
                  }}>
                    {/* Faction header bar */}
                    <div style={{
                      padding: '10px 16px',
                      background: `rgba(${r},${g},${b},0.18)`,
                      borderBottom: `1px solid rgba(${r},${g},${b},0.30)`,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ fontSize: 18 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 'bold', color, letterSpacing: 0.5 }}>{name}</div>
                        <div style={{ fontSize: 9, color: `rgba(${r},${g},${b},0.65)`, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                          Permanent Faction Ability
                        </div>
                      </div>
                      {legacy.nuclearBringerFactionId === id && <BringerBadge />}
                    </div>

                    <FactionWinsRow legacy={legacy} factionId={id} />
                    <FactionHomelandRow legacy={legacy} factionId={id} />

                    {/* Ability content */}
                    <div style={{ padding: '12px 16px 0' }}>
                      {ability ? (
                        <>
                          {/* Chosen ability highlight */}
                          <div style={{
                            padding: '10px 14px', borderRadius: 7, marginBottom: 10,
                            background: 'rgba(39,174,96,0.10)',
                            border: '1.5px solid rgba(39,174,96,0.65)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <div style={{
                                fontSize: 9, padding: '2px 8px', borderRadius: 8,
                                background: 'rgba(39,174,96,0.20)', border: '1px solid rgba(39,174,96,0.50)',
                                color: '#2ecc71', letterSpacing: 0.5,
                              }}>
                                {PHASE_LABEL[ability.phase] ?? ability.phase}
                              </div>
                              <div style={{ fontSize: 9, color: '#27AE60', letterSpacing: 1 }}>✓ STARTING POWER</div>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 'bold', color: '#2ecc71', marginBottom: 4 }}>{ability.name}</div>
                            <div style={{ fontSize: 11, color: '#27AE60', fontStyle: 'italic', marginBottom: 6 }}>{ability.tagline}</div>
                            <div style={{ fontSize: 11, color: '#9a8060', lineHeight: 1.55 }}>{ability.description}</div>
                          </div>
                        </>
                      ) : (
                        /* No choice yet — show both options as available */
                        <div>
                          <div style={{ fontSize: 10, color: '#7a5020', marginBottom: 10, fontStyle: 'italic' }}>
                            Ability not yet chosen — will be selected in Game 1 setup.
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {[opt1, opt2].map(o => o && (
                              <div key={o.id} style={{
                                flex: 1, padding: '8px 12px', borderRadius: 6,
                                background: `rgba(${r},${g},${b},0.07)`,
                                border: `1px solid rgba(${r},${g},${b},0.25)`,
                              }}>
                                <div style={{ fontSize: 9, color: `rgba(${r},${g},${b},0.65)`, marginBottom: 3 }}>
                                  {PHASE_LABEL[o.phase] ?? o.phase}
                                </div>
                                <div style={{ fontSize: 12, color, fontWeight: 'bold' }}>{o.name}</div>
                                <div style={{ fontSize: 10, color: '#7a6040', fontStyle: 'italic' }}>{o.tagline}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Blue slot — Comeback Power */}
                    {(() => {
                      const cpId = (legacy.comebackPowers ?? {})[id]
                      const pow = cpId ? COMEBACK_POWERS.find(p => p.id === cpId) : null
                      return pow ? (
                        <div style={{
                          margin: '0 16px 14px',
                          padding: '10px 14px', borderRadius: 7,
                          background: 'rgba(41,128,185,0.10)',
                          border: '1.5px solid rgba(41,128,185,0.65)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{
                              fontSize: 9, padding: '2px 8px', borderRadius: 8,
                              background: 'rgba(41,128,185,0.20)', border: '1px solid rgba(41,128,185,0.50)',
                              color: '#5DADE2', letterSpacing: 0.5,
                            }}>
                              ◈ COMEBACK POWER
                            </div>
                            <div style={{ fontSize: 9, color: '#27AE60', letterSpacing: 1 }}>✓ UNLOCKED</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 22 }}>{pow.icon}</span>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 'bold', color: '#5DADE2', marginBottom: 3 }}>{pow.name}</div>
                              <div style={{ fontSize: 11, color: '#2E86C1', lineHeight: 1.5 }}>{pow.desc}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          margin: '0 16px 14px',
                          padding: '10px 14px', borderRadius: 7,
                          border: '1.5px dashed rgba(41,128,185,0.35)',
                          background: 'rgba(41,128,185,0.04)',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          <span style={{ fontSize: 20, color: 'rgba(41,128,185,0.30)' }}>◈</span>
                          <div>
                            <div style={{ fontSize: 10, color: 'rgba(41,128,185,0.50)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                              Comeback Power
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(41,128,185,0.40)', fontStyle: 'italic' }}>
                              Blue slot empty — earned when this faction is eliminated
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Yellow slot — Weakness Power */}
                    {(() => {
                      const wpId = (legacy.alienWeaknessPowers ?? {})[id]
                      const wp = wpId ? WEAKNESS_POWERS.find(w => w.id === wpId) : null
                      const isCollaborator = legacy.alienCollaboratorFactionId === id
                      if (wp || isCollaborator) {
                        const name = wp ? wp.name : 'Alien Collaborator'
                        const desc = wp ? wp.description : 'Gain +1 troop when trading in cards, but lose 2 extra troops when expanding into empty cities.'
                        return (
                          <div style={{
                            margin: '0 16px 14px',
                            padding: '10px 14px', borderRadius: 7,
                            background: 'rgba(240,192,0,0.10)',
                            border: '1.5px solid rgba(240,192,0,0.65)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <div style={{
                                fontSize: 9, padding: '2px 8px', borderRadius: 8,
                                background: 'rgba(240,192,0,0.20)', border: '1px solid rgba(240,192,0,0.50)',
                                color: '#f0c000', letterSpacing: 0.5,
                              }}>
                                ⚡ WEAKNESS POWER
                              </div>
                              <div style={{ fontSize: 9, color: '#27AE60', letterSpacing: 1 }}>✓ ASSIGNED</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 'bold', color: '#f0c000', marginBottom: 3 }}>{name}</div>
                            <div style={{ fontSize: 11, color: '#b0a060', lineHeight: 1.5 }}>{desc}</div>
                          </div>
                        )
                      }
                      return (
                        <div style={{
                          margin: '0 16px 14px',
                          padding: '10px 14px', borderRadius: 7,
                          border: '1.5px dashed rgba(212,172,13,0.50)',
                          background: 'rgba(200,148,10,0.05)',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          <span style={{ fontSize: 20, color: 'rgba(212,172,13,0.35)' }}>⚡</span>
                          <div>
                            <div style={{ fontSize: 10, color: 'rgba(212,172,13,0.65)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                              Weakness Power
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(212,172,13,0.45)', fontStyle: 'italic' }}>
                              Yellow slot empty
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Brown slot — Missile Power(s) */}
                    {(() => {
                      const ids = (legacy.missilePowers ?? {})[id] ?? []
                      const powers = ids
                        .map(pid => MISSILE_POWERS.find(mp => mp.id === pid))
                        .filter((mp): mp is typeof MISSILE_POWERS[0] => !!mp)
                      if (powers.length === 0) {
                        return (
                          <div style={{
                            margin: '0 16px 14px',
                            padding: '10px 14px', borderRadius: 7,
                            border: '1.5px dashed rgba(139,90,43,0.45)',
                            background: 'rgba(101,67,33,0.06)',
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}>
                            <span style={{ fontSize: 20, color: 'rgba(139,90,43,0.35)' }}>🚀</span>
                            <div>
                              <div style={{ fontSize: 10, color: 'rgba(139,90,43,0.60)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                                Missile Power
                              </div>
                              <div style={{ fontSize: 12, color: 'rgba(139,90,43,0.45)', fontStyle: 'italic' }}>
                                Brown slot empty
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div style={{ margin: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {powers.map(mp => (
                            <div key={mp.id} style={{
                              padding: '10px 14px', borderRadius: 7,
                              background: `${MISSILE_POWER_COLOR}14`,
                              border: `1.5px solid ${MISSILE_POWER_COLOR}88`,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <div style={{
                                  fontSize: 9, padding: '2px 8px', borderRadius: 8,
                                  background: `${MISSILE_POWER_COLOR}30`, border: `1px solid ${MISSILE_POWER_COLOR}60`,
                                  color: '#d0a060', letterSpacing: 0.5,
                                }}>
                                  🚀 MISSILE POWER
                                </div>
                                <div style={{ fontSize: 9, color: '#27AE60', letterSpacing: 1 }}>✓ EARNED</div>
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 'bold', color: '#d0a060', marginBottom: 3 }}>{mp.name}</div>
                              <div style={{ fontSize: 11, color: '#b09070', lineHeight: 1.5 }}>{mp.description}</div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {/* Red slot — Star Power. The ONLY way a faction fills this
                        is by permanently claiming a private mission (Aliens and
                        Mutants have their own, rendered on their own cards).
                        Anything else leaves the slot empty: red stars earned in
                        the current game are a per-game tally that resets, and
                        showing them here read as a star power the faction had
                        not earned — and could not have, before private missions
                        are even unlocked. */}
                    {(() => {
                      const spId = (legacy.factionStarPowerMissions ?? {})[id]
                      const sp = spId ? (CARD_LOOKUP.get(spId) as MissionCard | undefined) : undefined
                      if (sp) return (
                        <div style={{
                          margin: '0 16px 14px',
                          padding: '10px 14px', borderRadius: 7,
                          background: 'rgba(231,76,60,0.10)',
                          border: '1.5px solid rgba(231,76,60,0.65)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{
                              fontSize: 9, padding: '2px 8px', borderRadius: 8,
                              background: 'rgba(231,76,60,0.20)', border: '1px solid rgba(231,76,60,0.50)',
                              color: '#E74C3C', letterSpacing: 0.5,
                            }}>
                              ★ STAR POWER
                            </div>
                            <div style={{ fontSize: 9, color: '#27AE60', letterSpacing: 1 }}>✓ CLAIMED</div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#E74C3C', marginBottom: 3 }}>{sp.name}</div>
                          <div style={{ fontSize: 11, color: '#c0665a', lineHeight: 1.5 }}>{sp.description}</div>
                          <div style={{ fontSize: 10, color: '#8a5a50', marginTop: 4, fontStyle: 'italic' }}>
                            Complete it again to earn 1 Red Star — once per game.
                          </div>
                        </div>
                      )
                      return (
                        <div style={{
                          margin: '0 16px 14px',
                          padding: '10px 14px', borderRadius: 7,
                          border: '1.5px dashed rgba(231,76,60,0.35)',
                          background: 'rgba(231,76,60,0.04)',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          <span style={{ fontSize: 20, color: 'rgba(231,76,60,0.30)' }}>★</span>
                          <div>
                            <div style={{ fontSize: 10, color: 'rgba(231,76,60,0.55)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                              Star Power
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(231,76,60,0.40)', fontStyle: 'italic' }}>
                              Red slot empty — earned by completing a private mission
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}

              {/* ── Unlockable milestone factions ── */}
              {legacy.alienMilestoneTriggered && (
                <MilestoneFactionCard
                  legacy={legacy}
                  factionPlayerIds={factionPlayerIds}
                  factionId="aliens"
                  name="Aliens"
                  icon="👽"
                  flavor="Unlocked by the Alien Invasion milestone"
                  powers={[
                    { color: '#e74c3c', label: '★ Star Power',     name: 'Domination',           desc: 'Controlling every city on the board earns you 2 Red Stars instantly.' },
                    { color: '#2980b9', label: '↺ Comeback Power', name: 'Alien Reinforcements', desc: 'When recruiting, gain +2 troops if you control Alien Island and +1 troop for each Ruin you control.' },
                    { color: '#27ae60', label: '⊕ Starting Power', name: 'Alien Form',           desc: 'You do not lose troops when expanding into empty cities.' },
                  ]}
                />
              )}
              {legacy.nuclearMilestoneTriggered && (
                <MilestoneFactionCard
                  legacy={legacy}
                  factionPlayerIds={factionPlayerIds}
                  factionId="mutants"
                  name="Mutants"
                  icon="🧟"
                  flavor="Unlocked by the Nuclear milestone"
                  powers={[
                    { color: '#e74c3c', label: '★ Star Power',     name: 'Wasteland Kings', desc: 'Controlling all bio-hazard territories and the Fallout Zone earns you a Red Star.' },
                    { color: '#2980b9', label: '↺ Comeback Power', name: 'Nuclear Fury',    desc: "When attacking the Bringer of Nuclear Fire's troops, re-roll 1's on all attack dice until they are no longer 1's." },
                    { color: '#2980b9', label: '↺ Comeback Power', name: 'Twisted Biology', desc: 'Bio-hazard and Mercenary scar effects are reversed for you.' },
                    { color: '#27ae60', label: '⊕ Starting Power', name: 'Radiation Born',  desc: "You don't lose troops in the Fallout Zone or from Mutant event cards." },
                  ]}
                  evolvePowerIds={legacy.mutantEvolvePowers ?? []}
                />
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Campaign wins, and the lead-faction badge when this faction holds it alone.
 *
 * Shared by the starter factions and the milestone ones (Aliens, Mutants) —
 * those used to render neither, so a faction that had won games showed no
 * record of it at all.
 */
function FactionWinsRow({ legacy, factionId }: { legacy: LegacyState; factionId: string }) {
  const wins = factionWinCounts(legacy.victoryLog)[factionId] ?? 0
  const isLead = leadFactionId(legacy.victoryLog) === factionId
  const unlocked = !!legacy.worldCapitalTerritoryId
  if (!isLead && wins === 0) return null
  return (
    <div style={{
      margin: '0 16px 10px', padding: '8px 12px', borderRadius: 7,
      background: isLead ? 'rgba(212,175,55,0.12)' : 'rgba(120,90,40,0.06)',
      border: `1px solid ${isLead ? 'rgba(212,175,55,0.55)' : 'rgba(160,120,50,0.22)'}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 'bold', color: isLead ? '#D4AF37' : '#8a7050' }}>
        {isLead ? '⌃ LEAD FACTION' : '🏆 Campaign wins'} · {wins} win{wins !== 1 ? 's' : ''}
      </div>
      {isLead && (
        <div style={{ fontSize: 9, color: unlocked ? '#a08840' : '#6a5a40', marginTop: 3, lineHeight: 1.45 }}>
          {unlocked
            ? 'Chooses the starting face-up mission, and begins each game owning the World Capital with 3 troops.'
            : 'Lead-faction rules activate once the World Capital is placed.'}
        </div>
      )}
    </div>
  )
}

/**
 * Homeland — unlocked by the double-winner milestone. The start tally runs from
 * game 1, so it can already be decided (or tied) before the feature switches on.
 *
 * Homelands are computed from `factionStartHistory` and are faction-agnostic, so
 * the Aliens and Mutants have always had one; it simply was not displayed.
 */
function FactionHomelandRow({ legacy, factionId }: { legacy: LegacyState; factionId: string }) {
  if (!legacy.doubleWinnerMilestoneTriggered) return null
  const homeland = (legacy.factionHomelands ?? {})[factionId] ?? null
  const starts = (legacy.factionStartHistory ?? []).filter(h => h.factionId === factionId)
  const tally: Record<string, number> = {}
  for (const s of starts) tally[s.continentId] = (tally[s.continentId] ?? 0) + 1
  const tallyText = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c.replace(/-/g, ' ')} ×${n}`)
    .join(' · ')
  return (
    <div style={{
      margin: '10px 16px 0', padding: '8px 12px', borderRadius: 7,
      background: homeland ? 'rgba(93,173,226,0.10)' : 'rgba(120,90,40,0.08)',
      border: `1px solid ${homeland ? 'rgba(93,173,226,0.40)' : 'rgba(160,120,50,0.25)'}`,
    }}>
      <div style={{ fontSize: 11, color: homeland ? '#5DADE2' : '#8a7050', fontWeight: 'bold' }}>
        ✦ Homeland: {homeland
          ? homeland.replace(/-/g, ' ').toUpperCase()
          : starts.length === 0 ? 'NO STARTS RECORDED' : 'NONE (TIED)'}
      </div>
      {tallyText && (
        <div style={{ fontSize: 9, color: '#6a5a40', marginTop: 3 }}>
          Starts: {tallyText}
        </div>
      )}
      {homeland && (
        <div style={{ fontSize: 9, color: '#5a7a8a', marginTop: 3 }}>
          May claim any face-up territory card in this continent.
        </div>
      )}
    </div>
  )
}

function SectionHead({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 10, color: '#6a5030', letterSpacing: 1.5,
      textTransform: 'uppercase', marginBottom: 10,
      borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5,
      ...style,
    }}>
      {children}
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: '#4a3820', fontStyle: 'italic', padding: '8px 0' }}>{children}</div>
}

// ─── Unlockable milestone faction card (Aliens / Mutants) ─────────────────────

interface PowerRow { color: string; label: string; name: string; desc: string }

/** ☢ Bringer of Nuclear Fire mark — shown right of the faction name */
function BringerBadge() {
  return (
    <div style={{
      marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 7,
      background: 'rgba(231,76,60,0.14)', border: '1px solid rgba(231,76,60,0.55)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, color: '#e74c3c', lineHeight: 1 }}>☢</span>
      <span style={{ fontSize: 9, color: '#e74c3c', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>
        BRINGER OF NUCLEAR FIRE
      </span>
    </div>
  )
}

function MilestoneFactionCard({ legacy, factionPlayerIds = {}, factionId, name, icon, flavor, powers, evolvePowerIds }: {
  factionPlayerIds?: Record<string, string>
  legacy: LegacyState
  factionId: string
  name: string
  icon: string
  flavor: string
  powers: PowerRow[]
  evolvePowerIds?: string[]
}) {
  const hex = FACTION_COLORS[factionId] ?? 0x888888
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff
  const color = `rgb(${r},${g},${b})`
  const holderId = factionPlayerIds[factionId]
  const stars = holderId ? (legacy.purchasedStars ?? {})[holderId] ?? 0 : 0
  const evolved = (evolvePowerIds ?? [])
    .map(id => MUTANT_EVOLVE_POWERS.find(p => p.id === id))
    .filter((p): p is typeof MUTANT_EVOLVE_POWERS[0] => !!p)

  return (
    <div style={{
      borderRadius: 10, marginBottom: 14, overflow: 'hidden',
      border: `2px solid rgba(${r},${g},${b},0.55)`,
      background: `rgba(${r},${g},${b},0.06)`,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        background: `rgba(${r},${g},${b},0.18)`,
        borderBottom: `1px solid rgba(${r},${g},${b},0.30)`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 'bold', color, letterSpacing: 0.5 }}>{name}</div>
          <div style={{ fontSize: 9, color: `rgba(${r},${g},${b},0.65)`, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {flavor}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {legacy.nuclearBringerFactionId === factionId && <BringerBadge />}
          {stars > 0 && (
            <div style={{ fontSize: 14, color: '#E74C3C', letterSpacing: 2 }}>
              {'★'.repeat(stars)}
            </div>
          )}
        </div>
      </div>

      {/* Same campaign record the starter factions show — these factions win
          games and earn homelands too. */}
      <div style={{ paddingTop: 10 }}>
        <FactionWinsRow legacy={legacy} factionId={factionId} />
        <FactionHomelandRow legacy={legacy} factionId={factionId} />
      </div>

      {/* Fixed powers */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {powers.map((pw, i) => (
          <div key={i} style={{
            padding: '9px 12px', borderRadius: 7,
            background: `${pw.color}12`, border: `1.5px solid ${pw.color}55`,
          }}>
            <div style={{ fontSize: 9, color: pw.color, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>
              {pw.label} · {pw.name}
            </div>
            <div style={{ fontSize: 11, color: '#9a8060', lineHeight: 1.5 }}>{pw.desc}</div>
          </div>
        ))}

        {/* Mutant Evolve powers revealed via events */}
        {evolvePowerIds && (
          evolved.length > 0 ? (
            evolved.map(ep => (
              <div key={ep.id} style={{
                padding: '9px 12px', borderRadius: 7,
                background: 'rgba(139,0,0,0.10)', border: '1.5px solid rgba(139,0,0,0.55)',
              }}>
                <div style={{ fontSize: 9, color: '#8B0000', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>
                  🧬 Evolved Power · {ep.name}
                </div>
                <div style={{ fontSize: 11, color: '#9a8060', lineHeight: 1.5 }}>{ep.description}</div>
              </div>
            ))
          ) : (
            <div style={{
              padding: '9px 12px', borderRadius: 7,
              border: '1.5px dashed rgba(139,0,0,0.35)', background: 'rgba(139,0,0,0.04)',
              fontSize: 11, color: 'rgba(139,0,0,0.55)', fontStyle: 'italic',
            }}>
              🧬 No powers evolved yet — revealed by The Mutants Evolve events
            </div>
          )
        )}
      </div>
    </div>
  )
}

