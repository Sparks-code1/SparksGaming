/**
 * The battle panel: pick, plan, reveal, and the traitor beat.
 *
 * BUILT IN THE BIDDING PANEL'S MOULD — a decision with a deadline floats over
 * the board, shuts out of the way, and never covers the chat or the HUD. It
 * renders from the PUBLIC battles object plus this seat's own secrets; where
 * battles are pending is derived from the forces by the same shared law the
 * server judges with (pendingBattles), so the pick list cannot disagree with
 * what the server will accept.
 *
 * WHAT THE PLAN FORM KNOWS: the seat's own hand and traitors, handed in as
 * props by the screen that holds the secrets. Nothing here fetches. The
 * committed plan leaves through onPlan and comes back only at the reveal,
 * public by then for everyone.
 *
 * THE TRAITOR BEAT OPENS FOR BOTH SIDES EVERY TIME — a beat that only opened
 * when a call was possible would announce who holds a traitor by opening at
 * all. The call button lights only for a seat whose own traitors match the
 * opposing leader; everyone else just continues.
 */
import { useState } from 'react'
import { FACTION_LOOK } from './SeatLayer'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { factionById } from '@/data/dune/factions'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import {
  pendingBattles, battlesFor, forcesInBattle, CHEAP_HERO_ID,
} from '@/lib/dune/battle'
import type { DuneGameState } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'

const INK = '#141b2d'
const SAND = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

const cardName = (id: string) => TREACHERY_CARDS.find(c => c.id === id)?.name ?? id
const territoryName = (id: string) =>
  DUNE_TERRITORIES.find(t => t.id === id)?.displayName ?? id

export interface BattlePanelProps {
  battles: NonNullable<DuneGameState['battles']>
  forces: NonNullable<DuneGameState['forces']>
  storm: DuneGameState['storm']
  tanks: DuneGameState['tanks'] | null
  seat: FactionId | null
  /** This seat's own hand and traitor names — secrets, handed in. */
  hand: readonly string[]
  traitors: readonly string[]
  now: number
  busy: boolean
  onPick: (territoryId: string, opponent: FactionId) => void
  onPlan: (plan: {
    dial: number; leader?: string; cheapHero?: boolean; weapon?: string; defence?: string
  }) => void
  onAnswer: (call: boolean) => void
}

const btn: React.CSSProperties = {
  display: 'block', width: '100%', margin: '4px 0', padding: '4px 8px',
  font: `12px ${SERIF}`, color: SAND, textAlign: 'left',
  background: 'transparent', border: `1px solid ${SAND}55`,
  borderRadius: 4, cursor: 'pointer',
}
const chosen: React.CSSProperties = { ...btn, background: '#2f6fb5', border: `1px solid ${SAND}` }

function PlanLine({ faction, plan }: {
  faction: FactionId
  plan: { dial: number; leader?: string; cheapHero?: boolean; weapon?: string; defence?: string }
}) {
  return (
    <div data-revealed-plan={faction} style={{ flex: 1, minWidth: 150 }}>
      <b style={{ color: FACTION_LOOK[faction].colour }}>{FACTION_LOOK[faction].name}</b>
      <div>Dialled <b>{plan.dial}</b></div>
      <div>{plan.leader ?? (plan.cheapHero ? 'Cheap Hero' : 'no leader')}</div>
      {plan.weapon && <div>Weapon: {cardName(plan.weapon)}</div>}
      {plan.defence && <div>Defence: {cardName(plan.defence)}</div>}
    </div>
  )
}

export function BattlePanel({
  battles, forces, storm, tanks, seat, hand, traitors, now, busy,
  onPick, onPlan, onAnswer,
}: BattlePanelProps) {
  const [dial, setDial] = useState(0)
  const [leader, setLeader] = useState<string | null>(null)
  const [hero, setHero] = useState(false)
  const [weapon, setWeapon] = useState<string | null>(null)
  const [defence, setDefence] = useState<string | null>(null)
  const [shut, setShut] = useState(false)

  const c = battles.current
  const aggressor = battles.order[battles.at]

  if (shut) {
    return (
      <div data-layer="battle-bar" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
        background: INK, color: SAND, borderTop: `1px solid ${SAND}44`,
        font: `13px ${SERIF}`,
      }}>
        <button type="button" onClick={() => setShut(false)} aria-label="Open the battle panel"
          style={{ ...btn, display: 'inline', width: 'auto', margin: 0 }}>▲</button>
        <span>
          {c
            ? `Battle in ${territoryName(c.territoryId)} — ${FACTION_LOOK[c.aggressor].name} vs ${FACTION_LOOK[c.defender].name}`
            : `${FACTION_LOOK[aggressor].name} picks the next battle`}
        </span>
      </div>
    )
  }

  const frame = (children: React.ReactNode) => (
    <div data-layer="battle" style={{
      position: 'absolute', inset: 0, background: '#000000a8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'auto', padding: 8,
    }}>
      <div role="dialog" aria-label="battle" style={{
        background: INK, color: SAND, border: `1px solid ${SAND}44`, borderRadius: 10,
        padding: 16, width: 'min(560px, 100%)', maxHeight: '100%', overflowY: 'auto',
        font: `14px ${SERIF}`, boxShadow: '0 18px 60px #000000cc',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button type="button" onClick={() => setShut(true)}
            aria-label="Shut the battle panel to see the board"
            style={{ ...btn, display: 'inline', width: 'auto', margin: 0, fontSize: 12 }}>
            ▼ board
          </button>
        </div>
        {children}
      </div>
    </div>
  )

  // ── the pick ────────────────────────────────────────────────────────────
  if (!c) {
    const pending = pendingBattles(forces, storm)
    const mineToPick = seat === aggressor ? battlesFor(pending, aggressor) : []
    const expired = now >= battles.closesAt
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          {FACTION_LOOK[aggressor].name} {seat === aggressor ? '— your battles' : 'picks the next battle'}
        </b>
        {/* ONE GATE, in the list itself: mineToPick is empty for every seat
            but the aggressor, and a second seat-check here would be the dead
            copy a sabotage cannot reach. */}
        {mineToPick.map(b =>
          b.factions.filter(f => f !== aggressor).map(f => (
            <button key={`${b.territoryId}|${f}`} type="button" disabled={busy}
              data-pick={`${b.territoryId}|${f}`}
              onClick={() => onPick(b.territoryId, f)} style={btn}>
              Fight <span style={{ color: FACTION_LOOK[f].colour }}>{FACTION_LOOK[f].name}</span>
              {' '}in {territoryName(b.territoryId)}
            </button>
          )))}
        {seat !== aggressor && !expired && (
          <p style={{ opacity: 0.75 }}>The aggressor chooses where, and whom, to fight first.</p>
        )}
        {seat !== aggressor && expired && (
          <button type="button" disabled={busy} data-pick-push=""
            onClick={() => onPick('', '' as FactionId)} style={btn}>
            The clock has run out — open their first battle
          </button>
        )}
      </>,
    )
  }

  // ── the reveal and the traitor beat ─────────────────────────────────────
  if (c.revealed) {
    const beat = c.revealed.traitor
    const iAmIn = seat === c.aggressor || seat === c.defender
    const answered = !!seat && beat.answered.includes(seat)
    const other = seat === c.aggressor ? c.defender : c.aggressor
    const theirLeader = c.revealed.plans[other]?.leader
    const mayCall = iAmIn && !answered && !!theirLeader && traitors.includes(theirLeader)
    const expired = now >= beat.closesAt
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          Plans on the table — {territoryName(c.territoryId)}
        </b>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
          <PlanLine faction={c.aggressor} plan={c.revealed.plans[c.aggressor] as never} />
          <PlanLine faction={c.defender} plan={c.revealed.plans[c.defender] as never} />
        </div>
        {/* THE BEAT: both sides answer, every battle — and only then does the
            fight resolve, so a battle that resolves at once says nothing
            about who holds what. */}
        <div style={{ marginTop: 12 }}>
          {iAmIn && !answered && (
            <>
              {mayCall && (
                <button type="button" disabled={busy} data-call-traitor=""
                  onClick={() => onAnswer(true)} style={{ ...chosen, width: 'auto', display: 'inline-block', marginRight: 8 }}>
                  Reveal the traitor — {theirLeader}
                </button>
              )}
              <button type="button" disabled={busy} data-no-traitor=""
                onClick={() => onAnswer(false)}
                style={{ ...btn, width: 'auto', display: 'inline-block' }}>
                Continue — no traitor
              </button>
            </>
          )}
          {iAmIn && answered && beat.answered.length < 2 && (
            <span style={{ opacity: 0.75 }}>Waiting on the other side…</span>
          )}
          {!iAmIn && !expired && <span style={{ opacity: 0.75 }}>The traitor beat.</span>}
          {expired && beat.answered.length < 2 && (
            <button type="button" disabled={busy} data-beat-push=""
              onClick={() => onAnswer(false)} style={{ ...btn, width: 'auto', display: 'inline-block' }}>
              The clock has run out — resolve
            </button>
          )}
        </div>
      </>,
    )
  }

  // ── the plan ────────────────────────────────────────────────────────────
  const iAmIn = seat === c.aggressor || seat === c.defender
  const committed = !!seat && c.committed.includes(seat)
  const expired = now >= c.closesAt
  if (!iAmIn || committed) {
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          {FACTION_LOOK[c.aggressor].name} vs {FACTION_LOOK[c.defender].name} — {territoryName(c.territoryId)}
        </b>
        <p style={{ opacity: 0.8 }}>
          {committed ? 'Your plan is in. ' : ''}
          Plans commit in secret and reveal together
          ({c.committed.length} of 2 in).
        </p>
        {expired && (
          <button type="button" disabled={busy} data-plan-push=""
            onClick={() => onPlan({ dial: 0 })} style={{ ...btn, width: 'auto', display: 'inline-block' }}>
            The clock has run out — reveal what is in
          </button>
        )}
      </>,
    )
  }

  const maxDial = seat
    ? forcesInBattle(forces, seat, c.territoryId, c.sectors)
    : 0
  const sheet = seat ? factionById(seat) : null
  const dead = new Set((tanks?.leaders?.[seat ?? ''] ?? []).map(l => l.name))
  const usable = (sheet?.leaders ?? []).filter(l =>
    !dead.has(l.name)
    && (!battles.usedLeaders[l.name] || battles.usedLeaders[l.name] === c.territoryId))
  const heroHeld = hand.includes(CHEAP_HERO_ID)
  const weapons = hand.filter(id => TREACHERY_CARDS.find(x => x.id === id)?.kind === 'weapon')
  const defences = hand.filter(id => TREACHERY_CARDS.find(x => x.id === id)?.kind === 'defense')
  const mayPlayCards = !!leader || hero

  return frame(
    <>
      <b style={{ display: 'block', fontSize: 16 }}>
        Your battle plan — {territoryName(c.territoryId)} vs{' '}
        {FACTION_LOOK[seat === c.aggressor ? c.defender : c.aggressor].name}
      </b>
      <label htmlFor="battle-dial" style={{ display: 'block', marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        Forces dialled (0–{maxDial}) — the dial is lost win or lose
      </label>
      <input id="battle-dial" type="number" min={0} max={maxDial} value={dial}
        onChange={e => setDial(Math.max(0, Math.min(maxDial, Number(e.target.value))))}
        style={{
          width: 80, background: '#ffffff12', color: SAND,
          border: `1px solid ${SAND}44`, borderRadius: 4, padding: '4px 6px',
          userSelect: 'text', WebkitUserSelect: 'text',
        }} />
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>Leader</div>
      {usable.map(l => (
        <button key={l.name} type="button" data-plan-leader={l.name}
          onClick={() => { setLeader(leader === l.name ? null : l.name); setHero(false) }}
          style={leader === l.name ? chosen : btn}>
          {l.name} — strength {l.strength}
        </button>
      ))}
      {heroHeld && (
        <button type="button" data-plan-hero=""
          onClick={() => { setHero(!hero); setLeader(null) }}
          style={hero ? chosen : btn}>
          Cheap Hero — strength 0, spent when played
        </button>
      )}
      {usable.length === 0 && !heroHeld && (
        <p style={{ fontSize: 12, opacity: 0.75 }}>
          No leader and no Cheap Hero: you fight with forces alone and may
          play no treachery cards.
        </p>
      )}
      {/* THE CARDS SHOW WHILE THE LEADER IS STILL BEING CHOSEN — a plan is
          priced as a whole — but they stay dark until someone can carry
          them: no leader and no hero plays no treachery. */}
      {(usable.length > 0 || heroHeld) && (weapons.length > 0 || defences.length > 0) && (
        <>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Weapon{mayPlayCards ? '' : ' — pick a leader first'}
          </div>
          {weapons.map(id => (
            <button key={id} type="button" data-plan-weapon={id}
              disabled={!mayPlayCards}
              onClick={() => setWeapon(weapon === id ? null : id)}
              style={weapon === id ? chosen : { ...btn, opacity: mayPlayCards ? 1 : 0.5 }}>
              {cardName(id)}
            </button>
          ))}
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>Defence</div>
          {defences.map(id => (
            <button key={id} type="button" data-plan-defence={id}
              disabled={!mayPlayCards}
              onClick={() => setDefence(defence === id ? null : id)}
              style={defence === id ? chosen : { ...btn, opacity: mayPlayCards ? 1 : 0.5 }}>
              {cardName(id)}
            </button>
          ))}
        </>
      )}
      <button type="button" disabled={busy} data-plan-commit=""
        onClick={() => onPlan({
          dial,
          ...(leader ? { leader } : null),
          ...(hero ? { cheapHero: true } : null),
          ...(mayPlayCards && weapon ? { weapon } : null),
          ...(mayPlayCards && defence ? { defence } : null),
        })}
        style={{ ...chosen, marginTop: 12 }}>
        Commit the plan — it reveals with theirs
      </button>
    </>,
  )
}
