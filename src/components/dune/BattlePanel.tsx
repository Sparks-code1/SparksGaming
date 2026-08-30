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
import { LeaderDisc } from './LeaderDisc'
import { TreacheryCardFace } from './TreacheryCardFace'
import DraggableResizable from '@/components/DraggableResizable'
import { CARD_ZOOM } from './OwnStrip'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { factionById } from '@/data/dune/factions'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import {
  pendingBattles, battlesFor, forcesInBattle, CHEAP_HERO_ID,
  resolveBattle, BATTLE_TRAITOR_SECONDS,
  VOICE_TARGETS, voiceViolation, voiceCardMatches, canComplyWithVoice,
  PRESCIENCE_ASKS,
  piecesInBattle, eliteWorth, fullWithoutSpice, battleStrengthCap, allocationsFor,
} from '@/lib/dune/battle'
import type {
  VoiceCommand, VoiceTarget, PrescienceAsk, LossAllocation,
} from '@/lib/dune/battle'
import { KWISATZ_STRENGTH } from '@/types/Dune/Game'
import type { DuneGameState } from '@/types/Dune/Game'
import type { FactionId, Leader } from '@/types/Dune/Faction'
import type { TreacheryCard } from '@/types/Dune/Treachery'

const INK = '#141b2d'
const SAND = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

const cardName = (id: string) => TREACHERY_CARDS.find(c => c.id === id)?.name ?? id

/**
 * Every refusal, in words a player can act on. A bare "that plan is not
 * legal" on a legal-looking plan is unactionable — the code always named
 * the part, and now the panel says it. Unknown codes fall back to showing
 * themselves rather than to silence.
 */
export const PLAN_REFUSAL_TEXT: Record<string, string> = {
  'not-in-this-battle': 'You have no forces standing in this battle.',
  'dial-out-of-range': 'The dial is more than the forces you have standing here.',
  'no-such-leader': 'That leader is not on your sheet.',
  'leader-in-the-tanks': 'That leader is dead in the tanks.',
  'leader-fights-elsewhere': 'That leader already fought in another territory this phase.',
  'two-leaders': 'A leader or the Cheap Hero — not both.',
  'card-not-held': 'You do not hold that card.',
  'not-a-weapon': 'That card is not a weapon.',
  'not-a-defence': 'That card is not a defence.',
  'no-leader-no-cards': 'With no leader and no Cheap Hero, no treachery may be played.',
  'one-card-twice': 'The same card cannot be played twice.',
  'battle-moved-on': 'The table has moved to another battle — this form has refreshed; plan again.',
  'voiced-first': 'The Voice has not spoken — your plan waits for the command.',
  'voice-demands': 'The Voice commands a play this plan does not make — and your hand can obey.',
  'voice-forbids': 'The Voice forbids what this plan plays.',
  'spice-out-of-range': 'Spice in support must be a whole, unnegative number.',
  'more-spice-than-you-hold': 'You do not have that much spice.',
  'spice-is-advanced': 'Spice supports battles only in the advanced game.',
  'fremen-need-no-spice': 'The Fremen count at full strength for free — no spice.',
  'dial-spice-mismatch': 'No set of your pieces can pay that dial with that spice.',
  'allocation-mismatch': 'That choice does not pay the dial.',
  'allocation-open': 'The winner is choosing their losses.',
  'not-your-choice': 'The winner chooses which pieces die.',
  'no-allocation': 'There are no losses to choose.',
  'kwisatz-not-yours': 'Only the Atreides carry the Kwisatz Haderach.',
  'kwisatz-is-advanced': 'The Kwisatz Haderach wakes only in the advanced game.',
  'kwisatz-asleep': 'The Kwisatz Haderach sleeps until seven forces are lost.',
  'kwisatz-in-the-tanks': 'The Kwisatz Haderach lies in the tanks.',
  'kwisatz-elsewhere': 'The Kwisatz Haderach has ridden into another territory this turn.',
  'kwisatz-alone': 'The Kwisatz Haderach never fights alone — it rides a leader.',
  'kwisatz-guards': 'The Kwisatz Haderach guards that leader — no traitor call stands.',
  'capture-first': 'The Harkonnen deal with their prisoner first.',
  'no-capture': 'There is no prisoner to deal with.',
  'not-your-prisoner': 'The Harkonnen hold the prisoner.',
  'bad-choice': 'Kill, keep, or decline.',
  'already-committed': 'Your plan is already in.',
  'already-revealed': 'Plans are on the table.',
  'no-battle': 'No battle is open.',
  'not-your-battle': 'You are not in this battle.',
  'stale': 'The match moved while you decided — try again.',
}
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
  /** The last battle action's refusal code, this seat's own. Named below. */
  refusal?: string | null
  /** Which action it came from, printed beside the reason. */
  refusedAction?: string | null
  /** The public row's count of this seat's hand. When it disagrees with the
   *  hand handed in, the cards are STALE — offering them invites the server
   *  to refuse a card the row no longer holds. */
  handCount?: number | null
  onPick: (territoryId: string, opponent: FactionId) => void
  onPlan: (plan: {
    territoryId: string
    dial: number; leader?: string; cheapHero?: boolean; weapon?: string; defence?: string
  }) => void
  onAnswer: (call: boolean) => void
  /** The Voice: a command, or null to decline. Also the expired push. */
  onVoice?: (command: VoiceCommand | null) => void
  /** The question: an element, or null to decline. Also the expired push. */
  onPrescience?: (ask: PrescienceAsk | null) => void
  /** The Atreides' own answer, from their row — private until the reveal. */
  prescienceAnswer?: { ask: string; answer: string | number } | null
  /** ADVANCED: the winner posts which pieces die; null pushes an expired
   *  window to the deterministic first. */
  onAllocate?: (choice: LossAllocation | null) => void
  /** 'advanced' turns on spice-supported dials and the winner's choice. */
  mode?: 'basic' | 'advanced'
  /** This seat's purse — the spice stepper's ceiling. */
  purse?: number
  /** ADVANCED, Atreides: the sleeper's public state — awake, dead, or
   *  already ridden into one territory this turn. */
  kwisatz?: { available: boolean; dead: boolean; usedTerritory?: string | null } | null
  /** ADVANCED, Harkonnen: prisoners this seat may field once, from its own
   *  secrets row. */
  captured?: readonly { name: string; from: FactionId }[]
  /** ADVANCED: the Harkonnen's answer over their prisoner. */
  onCapture?: (choice: 'kill' | 'keep' | 'decline') => void
}

/**
 * THE WHEEL, as the table knows it: numbers round the rim, a pointer at the
 * chosen one, and the leader's own face slotted into the hub — you see WHOSE
 * face you are committing, not a name in a list. A click on a number sets
 * the dial; the numbers run only as high as the forces actually standing in
 * the territory, because the wheel cannot promise what the ground does not
 * hold.
 */
export function BattleWheel({ faction, max, dial, onDial, leader, hero }: {
  faction: FactionId
  max: number
  dial: number
  onDial: (n: number) => void
  leader: Leader | null
  hero: boolean
}) {
  const R = 106
  const start = -225
  const step = max > 0 ? 270 / max : 0
  const at = (n: number) => {
    const a = (start + n * step) * Math.PI / 180
    return { x: Math.cos(a) * R, y: Math.sin(a) * R }
  }
  const p = at(dial)
  return (
    <svg data-layer="battle-wheel" data-wheel-dial={dial}
      data-wheel-leader={leader ? leader.name : hero ? 'cheap-hero' : ''}
      viewBox="-130 -130 260 260" width="252" height="252"
      style={{ display: 'block', margin: '10px auto' }}>
      <circle r="126" fill="#1d2a44" stroke={`${SAND}55`} strokeWidth="2" />
      <circle r="86" fill="#101726" stroke={`${SAND}33`} strokeWidth="1.5" />
      <line x1={p.x * 0.62} y1={p.y * 0.62} x2={p.x * 0.82} y2={p.y * 0.82}
        stroke="#c9542a" strokeWidth="5" strokeLinecap="round" />
      {Array.from({ length: max + 1 }, (_, n) => {
        const q = at(n)
        const on = n === dial
        return (
          <g key={n} data-dial-number={n} onClick={() => onDial(n)}
            style={{ cursor: 'pointer' }}>
            <title>{`Dial ${n}`}</title>
            <circle cx={q.x} cy={q.y} r="13" fill={on ? '#c9542a' : '#22304f'}
              stroke={on ? SAND : `${SAND}44`} strokeWidth={on ? 2 : 1} />
            <text x={q.x} y={q.y} fontSize="11" fill={SAND} textAnchor="middle"
              dominantBaseline="central" fontFamily={SERIF}>{n}</text>
          </g>
        )
      })}
      {/* THE HUB: the disc goes onto the wheel the way the real one slots in. */}
      {leader ? (
        <LeaderDisc leader={leader} faction={faction} r={52} />
      ) : hero ? (
        <g>
          <circle r="52" fill="#22304f" stroke={SAND} strokeWidth="1.5" />
          <text y="-7" fontSize="13" fill={SAND} textAnchor="middle"
            fontFamily={SERIF}>Cheap</text>
          <text y="11" fontSize="13" fill={SAND} textAnchor="middle"
            fontFamily={SERIF}>Hero</text>
        </g>
      ) : (
        <g>
          <circle r="52" fill="none" stroke={`${SAND}44`} strokeWidth="1.5"
            strokeDasharray="5 4" />
          <text fontSize="11" fill={SAND} opacity="0.6" textAnchor="middle"
            dominantBaseline="central" fontFamily={SERIF}>no leader</text>
        </g>
      )}
    </svg>
  )
}

const btn: React.CSSProperties = {
  display: 'block', width: '100%', margin: '4px 0', padding: '4px 8px',
  font: `12px ${SERIF}`, color: SAND, textAlign: 'left',
  background: 'transparent', border: `1px solid ${SAND}55`,
  borderRadius: 4, cursor: 'pointer',
}
const chosen: React.CSSProperties = { ...btn, background: '#2f6fb5', border: `1px solid ${SAND}` }

const dialText = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n)}½`)

function PlanLine({ faction, plan }: {
  faction: FactionId
  plan: {
    dial: number; spice?: number
    leader?: string; cheapHero?: boolean; weapon?: string; defence?: string
  }
}) {
  return (
    <div data-revealed-plan={faction} style={{ flex: 1, minWidth: 150 }}>
      <b style={{ color: FACTION_LOOK[faction].colour }}>{FACTION_LOOK[faction].name}</b>
      <div>
        Dialled <b>{dialText(plan.dial)}</b>
        {plan.spice ? <span data-plan-spice-shown=""> · {plan.spice} spice in support</span> : null}
      </div>
      <div>{plan.leader ?? (plan.cheapHero ? 'Cheap Hero' : 'no leader')}</div>
      {plan.weapon && <div>Weapon: {cardName(plan.weapon)}</div>}
      {plan.defence && <div>Defence: {cardName(plan.defence)}</div>}
    </div>
  )
}

export function BattlePanel({
  battles, forces, storm, tanks, seat, hand, traitors, now, busy,
  refusal = null, refusedAction = null, handCount = null,
  onPick, onPlan, onAnswer, onVoice, onPrescience, prescienceAnswer = null,
  onAllocate, mode = 'basic', purse = 0,
  kwisatz = null, captured = [], onCapture,
}: BattlePanelProps) {
  const [kh, setKh] = useState(false)
  const [voiceMode, setVoiceMode] = useState<'play' | 'not-play'>('play')
  const [voiceTarget, setVoiceTarget] = useState<VoiceTarget | null>(null)
  const [dial, setDial] = useState(0)
  const [half, setHalf] = useState(false)
  const [spiceSpent, setSpiceSpent] = useState(0)
  const [leader, setLeader] = useState<string | null>(null)
  const [hero, setHero] = useState(false)
  const [weapon, setWeapon] = useState<string | null>(null)
  const [defence, setDefence] = useState<string | null>(null)
  const [shut, setShut] = useState(false)
  /** One card opened at reading size — the tray's floating view. */
  const [zoomCard, setZoomCard] = useState<TreacheryCard | null>(null)

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
        {refusal && (
          <div role="alert" data-battle-refusal={refusal}
            style={{ marginTop: 10, fontSize: 12, color: '#e8a0a0' }}>
            {refusedAction ? `${refusedAction}: ` : ''}
            {PLAN_REFUSAL_TEXT[refusal] ?? `Refused: ${refusal}`}
            {' '}<span style={{ opacity: 0.7 }}>({refusal})</span>
          </div>
        )}
      </div>
    </div>
  )

  // ── ADVANCED: the Harkonnen deal with their prisoner ────────────────────
  // The next battle waits on the choice; the prisoner is drawn at random by
  // the SERVER when the choice lands, so there is nothing to show but the
  // question itself.
  if (!c && battles.capture) {
    const cap = battles.capture
    const capExpired = now >= cap.closesAt
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          A prisoner from the {FACTION_LOOK[cap.from].name}
        </b>
        {seat === 'harkonnen' && onCapture && !capExpired ? (
          <>
            <p style={{ opacity: 0.8, fontSize: 13 }}>
              One of their leaders, drawn at random when you choose: kill it
              for 2 spice from the bank, or keep it to fight ONE battle under
              your banner before it goes home.
            </p>
            <button type="button" disabled={busy} data-capture-kill=""
              onClick={() => onCapture('kill')} style={btn}>
              Kill the prisoner — 2 spice from the bank
            </button>
            <button type="button" disabled={busy} data-capture-keep=""
              onClick={() => onCapture('keep')} style={btn}>
              Keep the prisoner — it fights once for you
            </button>
            <button type="button" disabled={busy} data-capture-decline=""
              onClick={() => onCapture('decline')} style={btn}>
              Take nobody
            </button>
          </>
        ) : (
          <p style={{ opacity: 0.8 }} data-capture-waits="">
            The Harkonnen consider their prisoner.
          </p>
        )}
        {capExpired && onCapture && (
          <button type="button" disabled={busy} data-capture-push=""
            onClick={() => onCapture('decline')}
            style={{ ...btn, width: 'auto', display: 'inline-block' }}>
            The clock has run out — no one is taken
          </button>
        )}
      </>,
    )
  }

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

  // ── ADVANCED: the winner names their dead ───────────────────────────────
  // The beat is settled; what stands open is the winner's choice, listed as
  // the LAW's own enumeration — every button is one legal way to pay the
  // dial, so an illegal choice cannot be posted from here at all.
  if (c.revealed?.allocate) {
    const al = c.revealed.allocate
    const alExpired = now >= al.closesAt
    const winPlan = c.revealed.plans[al.by]
    const alOpp = [c.aggressor, c.defender].find(f => f !== al.by)!
    const options = allocationsFor({
      pieces: piecesInBattle(forces, al.by, c.territoryId, c.sectors),
      dial: winPlan?.dial ?? 0,
      spice: winPlan?.spice ?? 0,
      worth: eliteWorth(al.by, alOpp),
      freeFull: fullWithoutSpice(al.by),
    })
    const eliteName = al.by === 'fremen' ? 'Fedaykin'
      : al.by === 'emperor' ? 'Sardaukar' : 'starred'
    const optionLabel = (o: LossAllocation) => [
      o.eliteFull > 0 ? `${o.eliteFull} ${eliteName} at full` : '',
      o.plainFull > 0 ? `${o.plainFull} ordinary at full` : '',
      o.eliteHalf > 0 ? `${o.eliteHalf} ${eliteName} at half` : '',
      o.plainHalf > 0 ? `${o.plainHalf} ordinary at half` : '',
    ].filter(Boolean).join(' + ') || 'nothing'
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          {FACTION_LOOK[al.by].name} won — {territoryName(c.territoryId)}
        </b>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
          <PlanLine faction={c.aggressor} plan={c.revealed.plans[c.aggressor] as never} />
          <PlanLine faction={c.defender} plan={c.revealed.plans[c.defender] as never} />
        </div>
        {seat === al.by && onAllocate && !alExpired ? (
          <>
            <p style={{ opacity: 0.8, fontSize: 13 }}>
              Choose WHICH of your pieces pay the dial — the spent spice on
              the full-strength dead, the rest at half. Only you see the
              choice until it settles.
            </p>
            {options.map((o, i) => (
              <button key={i} type="button" disabled={busy}
                data-allocate-option={i}
                onClick={() => onAllocate(o)} style={btn}>
                Lose {optionLabel(o)}
              </button>
            ))}
          </>
        ) : (
          <p style={{ opacity: 0.8 }} data-allocate-waits="">
            The winner chooses which of their pieces die.
          </p>
        )}
        {alExpired && onAllocate && (
          <button type="button" disabled={busy} data-allocate-push=""
            onClick={() => onAllocate(null)}
            style={{ ...btn, width: 'auto', display: 'inline-block' }}>
            The clock has run out — the first lawful choice settles
          </button>
        )}
      </>,
    )
  }

  // ── the reveal, STAGED, then the traitor beat ───────────────────────────
  // The plans land the way the physical reveal does: LEADERS first, face up,
  // their strengths on the counts; then WEAPONS; then DEFENCES, each pairing
  // resolved — a blocked weapon does nothing, an unblocked one slays the
  // leader and that count falls to zero; last the FORCES committed, bringing
  // both counts to the totals the result is judged on. The clock is the
  // SERVER'S reveal stamp (the beat's deadline minus its length), so every
  // client sees the same beat land and a late joiner sees it finished.
  if (c.revealed) {
    const beat = c.revealed.traitor
    const iAmIn = seat === c.aggressor || seat === c.defender
    const answered = !!seat && beat.answered.includes(seat)
    const other = seat === c.aggressor ? c.defender : c.aggressor
    const theirLeader = c.revealed.plans[other]?.leader
    const mayCall = iAmIn && !answered && !!theirLeader
      && traitors.includes(theirLeader)
      && !c.revealed.plans[other]?.kwisatz
    const expired = now >= beat.closesAt

    const sinceReveal = now - (beat.closesAt - BATTLE_TRAITOR_SECONDS * 1000)
    const stage = sinceReveal >= 6200 ? 4
      : sinceReveal >= 4400 ? 3
      : sinceReveal >= 2600 ? 2
      : sinceReveal >= 800 ? 1 : 0

    const planFor = (fa: FactionId) =>
      (c.revealed!.plans[fa] ?? { dial: 0 }) as {
        dial: number; spice?: number; leader?: string; cheapHero?: boolean
        weapon?: string; defence?: string
      }
    // The PLAIN pairing — no traitor has been called while the beat stands.
    const plainOut = resolveBattle({
      aggressor: { faction: c.aggressor, plan: planFor(c.aggressor), calledTraitor: false },
      defender: { faction: c.defender, plan: planFor(c.defender), calledTraitor: false },
    })
    const strengthOf = (fa: FactionId, name?: string) =>
      name ? factionById(fa)?.leaders.find(l => l.name === name)?.strength ?? 0 : 0
    const countText = (fa: FactionId, idx: 0 | 1) => {
      const plan = planFor(fa) as { dial: number; leader?: string; cheapHero?: boolean; kwisatz?: boolean }
      // The Kwisatz Haderach's +2 rides the leader and dies with it.
      const lStr = strengthOf(fa, plan.leader)
        + (plan.kwisatz && (plan.leader || plan.cheapHero) ? KWISATZ_STRENGTH : 0)
      if (stage < 1) return '—'
      if (stage < 3) return dialText(lStr)
      if (stage < 4) return dialText(plainOut.sides[idx].leaderDies ? 0 : lStr)
      return dialText(plan.dial + (plainOut.sides[idx].leaderDies ? 0 : lStr))
    }
    const column = (fa: FactionId, idx: 0 | 1) => {
      const plan = planFor(fa)
      const lStr = strengthOf(fa, plan.leader)
      const dead = stage >= 3 && plainOut.sides[idx].leaderDies
      const kindOf2 = (id?: string) => TREACHERY_CARDS.find(x => x.id === id)?.kind
      const weaponVerdict = (() => {
        if (stage < 3 || !plan.weapon) return null
        if (plainOut.explosion) return 'the territory burns'
        if (kindOf2(plan.weapon) !== 'weapon') return 'no effect'
        const target = planFor(idx === 0 ? c.defender : c.aggressor)
        if (!target.leader && !target.cheapHero) return 'no target'
        return plainOut.sides[idx === 0 ? 1 : 0].leaderDies
          ? `slays ${target.leader ?? 'the Cheap Hero'}`
          : 'blocked'
      })()
      const disc = factionById(fa)?.leaders.find(l => l.name === plan.leader) ?? null
      return (
        <div key={fa} data-revealed-plan={fa} style={{ flex: 1, minWidth: 180 }}>
          <b style={{ color: FACTION_LOOK[fa].colour }}>{FACTION_LOOK[fa].name}</b>
          <div style={{ marginTop: 6, minHeight: 72 }}>
            {stage >= 1 ? (
              <div data-reveal-leader={fa} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                opacity: dead ? 0.4 : 1, transition: 'opacity 600ms',
              }}>
                {disc ? (
                  <svg viewBox="-34 -34 68 68" width="64" height="64">
                    <LeaderDisc leader={disc} faction={fa} r={32} />
                  </svg>
                ) : plan.cheapHero ? (
                  <TreacheryCardFace
                    card={TREACHERY_CARDS.find(x => x.id === CHEAP_HERO_ID)!} width={48} />
                ) : (
                  <span style={{ opacity: 0.6 }}>no leader</span>
                )}
                <span>
                  {plan.leader ?? (plan.cheapHero ? 'Cheap Hero' : '')}
                  {plan.leader ? ` — strength ${lStr}` : ''}
                  {(plan as { kwisatz?: boolean }).kwisatz && (
                    <span data-reveal-kwisatz={fa} style={{ color: '#9fd0e8' }}>
                      {' '}+ Kwisatz Haderach (+2)
                      {stage >= 3 && plainOut.sides[idx].kwisatzDies
                        ? <span style={{ color: '#e8a0a0' }}> ☠</span> : null}
                    </span>
                  )}
                  {dead && (
                    <span data-reveal-slain={fa} style={{ color: '#e8a0a0' }}> ☠ slain</span>
                  )}
                </span>
              </div>
            ) : (
              <div aria-hidden style={{
                width: 64, height: 64, borderRadius: '50%',
                border: `2px dashed ${SAND}33`,
              }} />
            )}
          </div>
          {/* THE CARDS THEMSELVES, side by side — the weapon lands a stage
              before the defence that answers it, and the verdict prints
              under the blade that earned it. */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'flex-start', minHeight: 24 }}>
            <div>
              {stage >= 2 && (
                <div data-reveal-weapon={fa}>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Weapon</div>
                  {plan.weapon ? (
                    <TreacheryCardFace
                      card={TREACHERY_CARDS.find(x => x.id === plan.weapon)!} width={112} />
                  ) : (
                    <span style={{ opacity: 0.6 }}>none</span>
                  )}
                  {weaponVerdict ? (
                    <div style={{
                      fontSize: 12, maxWidth: 112, marginTop: 2,
                      color: weaponVerdict.startsWith('slays') ? '#e8a0a0' : undefined,
                      opacity: weaponVerdict.startsWith('slays') ? 1 : 0.85,
                    }}>
                      {weaponVerdict}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div>
              {stage >= 3 && (
                <div data-reveal-defence={fa}>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Defence</div>
                  {plan.defence ? (
                    <TreacheryCardFace
                      card={TREACHERY_CARDS.find(x => x.id === plan.defence)!} width={112} />
                  ) : (
                    <span style={{ opacity: 0.6 }}>none</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ minHeight: 20 }}>
            {stage >= 4 && (
              <span data-reveal-forces={fa}>
                Forces committed: <b>{dialText(plan.dial)}</b>
                {plan.spice
                  ? <span data-plan-spice-shown=""> · {plan.spice} spice in support</span>
                  : null}
              </span>
            )}
          </div>
        </div>
      )
    }

    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          Plans on the table — {territoryName(c.territoryId)}
        </b>
        {/* THE COUNTS, updating as each element lands */}
        <div data-reveal-stage={stage} style={{
          display: 'flex', justifyContent: 'center', alignItems: 'baseline',
          gap: 14, margin: '10px 0 2px', fontSize: 26,
        }}>
          <span style={{ color: FACTION_LOOK[c.aggressor].colour }}
            data-strength-count={c.aggressor}>{countText(c.aggressor, 0)}</span>
          <span style={{ fontSize: 15, opacity: 0.6 }}>vs</span>
          <span style={{ color: FACTION_LOOK[c.defender].colour }}
            data-strength-count={c.defender}>{countText(c.defender, 1)}</span>
        </div>
        {plainOut.explosion && stage >= 3 && (
          <p data-reveal-explosion="" style={{ textAlign: 'center', color: '#e8a0a0' }}>
            Lasgun meets shield — everything in the territory burns.
          </p>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
          {column(c.aggressor, 0)}
          {column(c.defender, 1)}
        </div>
        {/* THE BEAT: both sides answer, every battle — and only then does the
            fight resolve. Its controls wait for the sequence, so nobody
            answers a reveal they have not seen land. */}
        {(stage >= 4 || expired) && <div style={{ marginTop: 12 }}>
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
        </div>}
      </>,
    )
  }

  // ── the interrogations, before and between the plans ────────────────────
  const voice = c.voice
  const pres = c.prescience
  const iAmIn2 = seat === c.aggressor || seat === c.defender

  // THE VOICE'S OWN FORM: a command named before the opponent may commit.
  if (voice && !voice.done && now < voice.closesAt && seat === voice.by && onVoice) {
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          The Voice — {territoryName(c.territoryId)}
        </b>
        <p style={{ opacity: 0.8, fontSize: 13 }}>
          Command your opponent's plan: play, or not play, one named thing.
          If they cannot comply, they plan freely.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {(['play', 'not-play'] as const).map(m => (
            <button key={m} type="button" data-voice-mode={m}
              aria-pressed={voiceMode === m}
              onClick={() => setVoiceMode(m)}
              style={voiceMode === m ? { ...chosen, width: 'auto' } : { ...btn, width: 'auto' }}>
              {m === 'play' ? 'Play' : 'Do not play'}
            </button>
          ))}
        </div>
        {VOICE_TARGETS.map(t => (
          <button key={t} type="button" data-voice-target={t}
            aria-pressed={voiceTarget === t}
            onClick={() => setVoiceTarget(voiceTarget === t ? null : t)}
            style={voiceTarget === t ? chosen : btn}>
            {t}
          </button>
        ))}
        <div style={{ marginTop: 10 }}>
          <button type="button" disabled={busy || !voiceTarget} data-voice-speak=""
            onClick={() => voiceTarget && onVoice({ mode: voiceMode, target: voiceTarget })}
            style={{ ...chosen, width: 'auto', display: 'inline-block', marginRight: 8 }}>
            Voice it
          </button>
          <button type="button" disabled={busy} data-voice-decline=""
            onClick={() => onVoice(null)}
            style={{ ...btn, width: 'auto', display: 'inline-block' }}>
            No command
          </button>
        </div>
      </>,
    )
  }
  if (voice && !voice.done && seat !== voice.by) {
    const vExpired = now >= voice.closesAt
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          {FACTION_LOOK[c.aggressor].name} vs {FACTION_LOOK[c.defender].name} — {territoryName(c.territoryId)}
        </b>
        <p style={{ opacity: 0.8 }} data-voice-waits="">
          The Voice is being prepared{iAmIn2 ? ' — your plan waits for it' : ''}.
        </p>
        {vExpired && onVoice && (
          <button type="button" disabled={busy} data-voice-push=""
            onClick={() => onVoice(null)}
            style={{ ...btn, width: 'auto', display: 'inline-block' }}>
            The clock has run out — the Voice stays silent
          </button>
        )}
      </>,
    )
  }

  // THE QUESTION: after the opponent commits, before the reveal.
  if (pres && !pres.done && !c.revealed) {
    const pExpired = now >= pres.closesAt
    if (seat === pres.by && onPrescience && !pExpired) {
      const mineIn = !!seat && c.committed.includes(seat)
      return frame(
        <>
          <b style={{ display: 'block', fontSize: 16 }}>
            Prescience — {territoryName(c.territoryId)}
          </b>
          <p style={{ opacity: 0.8, fontSize: 13 }}>
            Ask ONE element of the committed plan against you. A "none is
            played" answer is the answer — there is no second question.
            {mineIn ? '' : ' Your own plan can still be written with what you learn.'}
          </p>
          {PRESCIENCE_ASKS.map(a => (
            <button key={a} type="button" data-prescience-ask={a}
              disabled={busy}
              onClick={() => onPrescience(a)}
              style={btn}>
              {a === 'dial' ? 'The number dialled' : 'Their ' + a}
            </button>
          ))}
          <button type="button" disabled={busy} data-prescience-decline=""
            onClick={() => onPrescience(null)}
            style={{ ...btn, marginTop: 8 }}>
            No question
          </button>
        </>,
      )
    }
    if (seat !== pres.by || pExpired) {
      return frame(
        <>
          <b style={{ display: 'block', fontSize: 16 }}>
            {FACTION_LOOK[c.aggressor].name} vs {FACTION_LOOK[c.defender].name} — {territoryName(c.territoryId)}
          </b>
          <p style={{ opacity: 0.8 }} data-prescience-waits="">
            The Atreides peer into the plans.
          </p>
          {pExpired && onPrescience && (
            <button type="button" disabled={busy} data-prescience-push=""
              onClick={() => onPrescience(null)}
              style={{ ...btn, width: 'auto', display: 'inline-block' }}>
              The clock has run out — no question is asked
            </button>
          )}
        </>,
      )
    }
  }

  // ── the plan ────────────────────────────────────────────────────────────
  const iAmIn = seat === c.aggressor || seat === c.defender
  const committed = !!seat && c.committed.includes(seat)
  const expired = now >= c.closesAt

  // THE FORESEEN ELEMENT — the server wrote it into the asker's own row and
  // nowhere public, so this renders for one seat and no other, and keeps
  // rendering while they wait: what was seen cannot be un-asked.
  const foresight = prescienceAnswer && iAmIn ? (() => {
    const a = prescienceAnswer.answer
    const shown = a === 'none' ? 'none is played'
      : a === 'cheap-hero' ? 'the Cheap Hero'
      : typeof a === 'number' ? String(a)
      : TREACHERY_CARDS.find(x => x.id === a)?.name ?? String(a)
    return (
      <p data-foresight="" style={{
        fontSize: 13, color: '#9fd0e8', border: '1px solid #9fd0e855',
        borderRadius: 6, padding: '6px 8px',
      }}>
        Foreseen — their {prescienceAnswer.ask}: <b>{shown}</b>.
        Only you see this until the reveal.
      </p>
    )
  })() : null

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
        {foresight}
        {expired && (
          <button type="button" disabled={busy} data-plan-push=""
            onClick={() => onPlan({ territoryId: c.territoryId, dial: 0 })}
            style={{ ...btn, width: 'auto', display: 'inline-block' }}>
            The clock has run out — reveal what is in
          </button>
        )}
      </>,
    )
  }

  // ── ADVANCED: the dial is STRENGTH — halves, elites, and spice ─────────
  const advanced = mode === 'advanced'
  const oppFaction = seat === c.aggressor ? c.defender : c.aggressor
  const pieces = seat
    ? piecesInBattle(forces, seat, c.territoryId, c.sectors)
    : { plain: 0, elite: 0 }
  const worth = seat ? eliteWorth(seat, oppFaction) : 2
  const freeFull = !!seat && fullWithoutSpice(seat)
  const spiceMax = Math.min(purse, pieces.plain + pieces.elite)
  // CLAMPED AT USE, not trusted from state: the purse can arrive late (the
  // auction's spending reaching this row after the form drew), and a stepper
  // left above the new ceiling posts a more-spice-than-you-hold the player
  // cannot see coming.
  const spiceStaged = Math.min(spiceSpent, spiceMax)
  const maxDial = advanced
    ? battleStrengthCap(pieces, worth)
    : seat
      ? forcesInBattle(forces, seat, c.territoryId, c.sectors)
      : 0
  // The SAME enumeration the server admits plans by: a dial-and-spice pair
  // no set of pieces can pay is stopped at the form, with its reason.
  const supported = !advanced || allocationsFor({
    pieces, dial, spice: freeFull ? 0 : spiceStaged, worth, freeFull,
  }).length > 0
  const toggleHalf = () => {
    const nextHalf = !half
    setHalf(nextHalf)
    setDial(Math.min(maxDial, Math.floor(dial) + (nextHalf ? 0.5 : 0)))
  }
  const sheet = seat ? factionById(seat) : null
  const dead = new Set((tanks?.leaders?.[seat ?? ''] ?? []).map(l => l.name))
  const usable = (sheet?.leaders ?? []).filter(l =>
    !dead.has(l.name)
    && (!battles.usedLeaders[l.name] || battles.usedLeaders[l.name] === c.territoryId))
  // A HAND THE TABLE DISOWNS IS NOT OFFERED. The public count is the row's
  // truth by another route; a mismatch means this client's secrets have not
  // caught up, and every card it would offer is a refusal waiting.
  const handSynced = handCount == null || handCount === hand.length
  const heroHeld = handSynced && hand.includes(CHEAP_HERO_ID)
  // A worthless card may ride either slot — that is what worthless cards
  // are for, and the Voice can command one be played.
  const kindOf = (id: string) => TREACHERY_CARDS.find(x => x.id === id)?.kind
  const weapons = handSynced
    ? hand.filter(id => kindOf(id) === 'weapon' || kindOf(id) === 'worthless') : []
  const defences = handSynced
    ? hand.filter(id => kindOf(id) === 'defense' || kindOf(id) === 'worthless') : []
  const mayPlayCards = !!leader || hero
  // A PRISONER fights under this banner once — offered as the disc it is,
  // in its own faction's colours.
  const borrowedObjs = (captured ?? [])
    .map(x => ({
      from: x.from,
      leader: factionById(x.from)?.leaders.find(l => l.name === x.name),
    }))
    .filter((x): x is { from: FactionId; leader: NonNullable<typeof x.leader> } => !!x.leader)
  const leaderObj = usable.find(l => l.name === leader)
    ?? borrowedObjs.find(x => x.leader.name === leader)?.leader ?? null
  const heroCard = TREACHERY_CARDS.find(x => x.id === CHEAP_HERO_ID)!

  // ── THE VOICE STANDS OVER THIS FORM ─────────────────────────────────────
  // ONE law with the server: the same helper that refuses a defiant plan
  // grades the draft here, so the form knows which commands are satisfiable
  // against the hand it holds and can never bless what the judge strikes.
  const cmd = voice?.done && voice.command && seat !== voice.by
    ? (voice.command as VoiceCommand) : null
  const canFieldAny = usable.length > 0 || heroHeld
  const draftPlan = {
    dial,
    ...(leader ? { leader } : null),
    ...(hero ? { cheapHero: true } : null),
    ...(mayPlayCards && weapon ? { weapon } : null),
    ...(mayPlayCards && defence ? { defence } : null),
  }
  const obeyable = cmd ? canComplyWithVoice(cmd, handSynced ? hand : [], canFieldAny) : false
  const violation = cmd ? voiceViolation(draftPlan, cmd, handSynced ? hand : [], canFieldAny) : null
  const cardForbidden = (id: string) =>
    !!cmd && cmd.mode === 'not-play' && voiceCardMatches(id, cmd.target)
  const heroForbidden = !!cmd && cmd.mode === 'not-play' && cmd.target === 'cheap-hero'

  /** Weapon or defence, drawn as the CARD it is — rules text on its face,
   *  a magnifier to the tray's floating view — dark until a leader or the
   *  hero can carry it. */
  const cardRow = (ids: string[], picked: string | null,
    set: (id: string | null) => void, tag: 'weapon' | 'defence') => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {ids.map(id => {
        const cardObj = TREACHERY_CARDS.find(x => x.id === id)!
        return (
          <div key={id} style={{ position: 'relative' }}>
            <button type="button" aria-pressed={picked === id}
              disabled={!mayPlayCards || cardForbidden(id)}
              title={cardForbidden(id) ? 'The Voice forbids this card' : undefined}
              {...(tag === 'weapon' ? { 'data-plan-weapon': id } : { 'data-plan-defence': id })}
              onClick={() => set(picked === id ? null : id)}
              style={{
                background: 'none', padding: 2, lineHeight: 0,
                cursor: mayPlayCards && !cardForbidden(id) ? 'pointer' : 'default',
                border: picked === id ? '2px solid #c9542a' : `2px solid ${SAND}22`,
                borderRadius: 8, opacity: mayPlayCards && !cardForbidden(id) ? 1 : 0.5,
              }}>
              <TreacheryCardFace card={cardObj} width={150} />
            </button>
            <button type="button" aria-label={`Read ${cardObj.name}`}
              onClick={() => setZoomCard(cardObj)}
              style={{
                position: 'absolute', top: 6, right: 6, padding: '1px 5px',
                background: '#000000aa', color: SAND, border: `1px solid ${SAND}55`,
                borderRadius: 4, cursor: 'zoom-in', fontSize: 12,
              }}>🔍</button>
          </div>
        )
      })}
    </div>
  )

  return frame(
    <>
      <b style={{ display: 'block', fontSize: 16 }}>
        Your battle plan — {territoryName(c.territoryId)} vs{' '}
        {FACTION_LOOK[seat === c.aggressor ? c.defender : c.aggressor].name}
      </b>
      {cmd && (
        <p data-voice-banner={cmd.mode} style={{
          fontSize: 13, color: '#d8b36a', border: '1px solid #d8b36a55',
          borderRadius: 6, padding: '6px 8px',
        }}>
          {cmd.mode === 'not-play'
            ? 'The Voice forbids: ' + cmd.target + '. Your plan may not play it.'
            : obeyable
              ? 'The Voice commands: play ' + cmd.target + '. Your hand can obey, so your plan must.'
              : 'The Voice commands: play ' + cmd.target + ' — you cannot comply, so you plan freely.'}
        </p>
      )}
      {foresight}
      <BattleWheel faction={seat!} max={maxDial} dial={Math.floor(dial)}
        onDial={n => setDial(n >= maxDial ? n : n + (half ? 0.5 : 0))}
        leader={leaderObj} hero={hero} />
      <div style={{ textAlign: 'center', fontSize: 12, opacity: 0.8, marginTop: -4 }}>
        {advanced
          ? <>Dialled <b data-dial-shown="">{dialText(dial)}</b> — lost win or lose</>
          : 'The dial is lost win or lose'}
      </div>
      {advanced && !freeFull && (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <button type="button" data-dial-half="" aria-pressed={half}
            disabled={Math.floor(dial) >= maxDial}
            onClick={toggleHalf}
            style={{ ...(half ? chosen : btn), width: 'auto', display: 'inline-block' }}>
            +½ on the dial
          </button>
        </div>
      )}
      {advanced && !freeFull && (
        <div style={{ marginTop: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            Spice in support — one per full-strength piece; the rest count half
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <button type="button" data-plan-spice-down="" disabled={busy || spiceStaged <= 0}
              onClick={() => setSpiceSpent(spiceStaged - 1)}
              style={{ ...btn, width: 'auto', display: 'inline-block', margin: 0 }}>−</button>
            <b data-plan-spice={spiceStaged}>{spiceStaged}</b>
            <button type="button" data-plan-spice-up="" disabled={busy || spiceStaged >= spiceMax}
              onClick={() => setSpiceSpent(spiceStaged + 1)}
              style={{ ...btn, width: 'auto', display: 'inline-block', margin: 0 }}>+</button>
            <span style={{ fontSize: 12, opacity: 0.7 }}>of {spiceMax} you can spend</span>
          </div>
        </div>
      )}
      {advanced && freeFull && (
        <p data-fremen-free="" style={{ fontSize: 12, opacity: 0.75, textAlign: 'center' }}>
          Fremen forces count at full strength without spice.
        </p>
      )}

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
        The disc for the hub
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {usable.map(l => (
          <button key={l.name} type="button" data-plan-leader={l.name}
            aria-pressed={leader === l.name}
            title={`${l.name} — strength ${l.strength}`}
            onClick={() => { setLeader(leader === l.name ? null : l.name); setHero(false) }}
            style={{
              background: 'none', padding: 2, lineHeight: 0, cursor: 'pointer',
              border: leader === l.name ? '2px solid #c9542a' : '2px solid transparent',
              borderRadius: '50%',
            }}>
            <svg viewBox="-34 -34 68 68" width="64" height="64">
              <LeaderDisc leader={l} faction={seat!} r={32} />
            </svg>
          </button>
        ))}
        {borrowedObjs.map(x => (
          <button key={x.leader.name} type="button" data-plan-borrowed={x.leader.name}
            aria-pressed={leader === x.leader.name}
            title={`${x.leader.name} — captured from the ${FACTION_LOOK[x.from].name}, fights once`}
            onClick={() => { setLeader(leader === x.leader.name ? null : x.leader.name); setHero(false) }}
            style={{
              background: 'none', padding: 2, lineHeight: 0, cursor: 'pointer',
              border: leader === x.leader.name ? '2px solid #c9542a' : '2px solid transparent',
              borderRadius: '50%',
            }}>
            <svg viewBox="-34 -34 68 68" width="64" height="64">
              <LeaderDisc leader={x.leader} faction={x.from} r={32} />
            </svg>
          </button>
        ))}
        {heroHeld && (
          <button type="button" data-plan-hero=""
            aria-pressed={hero}
            disabled={heroForbidden}
            title={heroForbidden ? 'The Voice forbids the Cheap Hero' : undefined}
            onClick={() => { setHero(!hero); setLeader(null) }}
            style={{
              background: 'none', padding: 2, lineHeight: 0, cursor: 'pointer',
              border: hero ? '2px solid #c9542a' : `2px solid ${SAND}22`,
              borderRadius: 6,
            }}>
            <TreacheryCardFace card={heroCard} width={56} />
          </button>
        )}
      </div>
      {advanced && seat === 'atreides' && kwisatz && (kwisatz.available || kwisatz.dead) && (
        <div style={{ marginTop: 8 }}>
          <button type="button" data-plan-kwisatz="" aria-pressed={kh}
            disabled={busy || kwisatz.dead
              || (!!kwisatz.usedTerritory && kwisatz.usedTerritory !== c.territoryId)
              || (!leader && !hero)}
            onClick={() => setKh(!kh)}
            style={{ ...(kh ? chosen : btn), width: 'auto', display: 'inline-block' }}>
            Kwisatz Haderach — +2 with the leader
          </button>
          {kwisatz.dead && (
            <span data-kwisatz-dead="" style={{ fontSize: 12, opacity: 0.75, marginLeft: 8 }}>
              in the tanks
            </span>
          )}
          {!kwisatz.dead && !!kwisatz.usedTerritory
            && kwisatz.usedTerritory !== c.territoryId && (
            <span data-kwisatz-elsewhere="" style={{ fontSize: 12, opacity: 0.75, marginLeft: 8 }}>
              already ridden elsewhere this turn
            </span>
          )}
          {!kwisatz.dead && !leader && !hero && (
            <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 8 }}>
              never alone — pick a leader first
            </span>
          )}
        </div>
      )}
      {usable.length === 0 && borrowedObjs.length === 0 && !heroHeld && (
        <p style={{ fontSize: 12, opacity: 0.75 }}>
          No leader and no Cheap Hero: you fight with forces alone and may
          play no treachery cards.
        </p>
      )}
      {!handSynced && (
        <p data-hand-stale="" style={{ fontSize: 12, color: '#e8a0a0' }}>
          Your hand has not caught up with the table ({hand.length} here,
          {' '}{handCount} counted) — cards are held back until it does.
          The dial and the leader still commit.
        </p>
      )}

      {(usable.length > 0 || borrowedObjs.length > 0 || heroHeld)
        && (weapons.length > 0 || defences.length > 0) && (
        <>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            Weapon{mayPlayCards ? '' : ' — pick a leader first'}
          </div>
          {cardRow(weapons, weapon, setWeapon, 'weapon')}
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Defence</div>
          {cardRow(defences, defence, setDefence, 'defence')}
        </>
      )}
      {violation && (
        <p data-voice-violation={violation} style={{ fontSize: 12, color: '#e8a0a0' }}>
          {PLAN_REFUSAL_TEXT[violation]}
        </p>
      )}
      {!supported && (
        <p data-dial-unsupported="" style={{ fontSize: 12, color: '#e8a0a0' }}>
          No set of your pieces can pay {dialText(dial)} with {spiceStaged} spice.
        </p>
      )}
      <button type="button" disabled={busy || !!violation || !supported} data-plan-commit=""
        onClick={() => onPlan({
          territoryId: c.territoryId,
          dial,
          ...(advanced && !freeFull && spiceStaged > 0 ? { spice: spiceStaged } : null),
          ...(advanced && kh && (leader || hero) ? { kwisatz: true } : null),
          ...(leader ? { leader } : null),
          ...(hero ? { cheapHero: true } : null),
          ...(mayPlayCards && weapon ? { weapon } : null),
          ...(mayPlayCards && defence ? { defence } : null),
        })}
        style={{ ...chosen, marginTop: 12 }}>
        Commit the plan — it reveals with theirs
      </button>

      {zoomCard && (
        <DraggableResizable title={zoomCard.name}
          accentColor={seat ? FACTION_LOOK[seat].colour : SAND}
          width={CARD_ZOOM + 34} storageKey={`dune-card-battle-${seat}`}
          onClose={() => setZoomCard(null)}>
          <div data-layer="card-zoom" style={{ display: 'flex', justifyContent: 'center' }}>
            <TreacheryCardFace card={zoomCard} width={CARD_ZOOM} />
          </div>
        </DraggableResizable>
      )}
    </>,
  )
}
