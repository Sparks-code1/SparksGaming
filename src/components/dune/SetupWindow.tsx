/**
 * Setup, said in a column and answered on the board.
 *
 * THE WINDOW TELLS YOU WHAT TO DO; THE PLACING HAPPENS ON THE MAP. The first
 * version of this was a panel floating over the board with steppers in it —
 * numbers describing places, hovering in front of the places themselves. Now
 * the Fremen put their ten down by clicking the territories they are putting
 * them in, and the Bene Gesserit stand their advisor by clicking where it
 * stands. The column between the chat and the board carries the half a map
 * cannot: what is being asked, what is still to place, what silence means,
 * and the two answers that are not about places at all — the prediction, and
 * the traitor kept, which renders as the actual cards below the window with a
 * prompt to pick one.
 *
 * TWO COMPONENTS, ONE INTERACTION. SetupWindow is the column; SetupBoardTargets
 * is the clickable cells rendered INSIDE the board's own svg, in board
 * coordinates. They share no state — the pending placement lives in the screen
 * that renders both — because a click on the map and a line in the column are
 * two views of the same half-made answer, and giving either component its own
 * copy is how the two would disagree.
 *
 * ONLY WHAT THIS SEAT OWES, like the panel before it: the outstanding list is
 * public, but a control is not a status, and a button that can only be refused
 * is worse than no button. The advisor's controls are absent — not disabled —
 * until the Fremen have placed, with the reason written where they will
 * appear.
 *
 * NO CLOCK OF ITS OWN. The deadline is on the board where the whole table
 * reads one countdown; and the clock is only the backstop now — setup
 * normally ends when every seat presses Ready, which sits at the foot of this
 * column.
 *
 * READY IS THE LAST LINE OF THE COLUMN THAT ASKS. It used to live under the
 * players, on the reasoning that pressing it is a statement about the list of
 * seats. That put it diagonally across the screen from the questions it
 * answers: a player read what they owed on the left and hunted the right-hand
 * column for the button. Here it is the bottom of the same reading order —
 * what you owe, then done.
 *
 * AND IT IS GATED ON WHAT THIS SEAT OWES. Ready means "I have finished
 * setting up", so a seat with a decision still outstanding cannot truthfully
 * press it: the Bene Gesserit who have not stood their advisor, anyone who
 * has not kept a traitor. Pressing it early was legal and quietly cost them
 * the decision — Ready does not lock a seat out, but the clock closes on the
 * defaults, and a seat that had declared itself done had no reason to look
 * back. Disabled with the reason written beside it is the honest version.
 *
 * EXCEPT THE PREDICTION, WHICH IS A CHOICE AND NOT A CHORE. Silence there is
 * already a legal answer — no prediction, costing that seat one route to
 * victory and nothing else — so a gate would make a player who has decided
 * not to predict sit out the whole deadline to decline. It warns instead: see
 * GATES_READY. The rest are placements and a kept traitor, where silence
 * costs pieces and position, which is what a gate is for.
 *
 * THE DEADLINE'S ESCAPE HATCH IS NOT THIS BUTTON and must never be gated on
 * anything: once the clock has run out, any seat may push the game along from
 * the notices strip, defaults and all. That is what stops a table wedging
 * when someone walks away, so this gate is deliberately kept clear of it.
 *
 * WHAT IT MAY SEE. The four traitors come in as `dealt`, from this browser's
 * own secrets row and from nowhere else — same rule as the prescience card in
 * BiddingPanel, and the same shape: a prop, or nothing.
 */
import { DUNE_TERRITORIES, DUNE_SECTORS } from '@/data/dune/boardData'
import { findLeader, factionById } from '@/data/dune/factions'
import { useState } from 'react'
import { FACTION_LOOK } from './SeatLayer'
import { TraitorCard } from './TraitorCard'
import { distributeAmong, starredOf, PREDICTION_TURNS } from '@/lib/dune/setup'
import type { SetupDecision } from '@/lib/dune/setup'
import type { ForcePosture, GameMode } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"
const STAR = '#f0c93f'

/** One entry of a placement, as the server takes it. */
export interface PlacedForce {
  territoryId: string
  sector?: string
  count: number
  /** How many of the count are Fedaykin. Advanced game only. */
  starred?: number
}

/** A placement half-made: what the map clicks have added so far. */
export interface PendingPlacement {
  territoryId: string
  sector: string
  count: number
  starred: number
}

/** What a refusal means, in words the seat can act on. */
const REFUSAL_TEXT: Record<string, string> = {
  'not-outstanding': 'You do not owe that answer.',
  blocked: 'The Fremen have not placed yet.',
  'wrong-total': 'That does not place all of them.',
  'not-among': 'That is not somewhere you may place.',
  negative: 'A stack cannot be negative.',
  'too-many-starred': 'That places more Fedaykin than you have.',
  'unknown-faction': 'That faction is not at this table.',
  'predicting-yourself': 'You may not predict your own victory.',
  'turn-out-of-range': `A prediction names a turn from ${PREDICTION_TURNS.min} to ${PREDICTION_TURNS.max}.`,
  'not-dealt': 'That is not one of the four you hold.',
  'no-setup': 'Setup is over.',
  stale: 'The table moved while you were deciding. Try again.',
}

/** What each outstanding decision is called, for the line under a dead Ready. */
const OWED_TEXT: Record<SetupDecision['kind'], string> = {
  'fremen-placement': 'your ten forces',
  'advisor-placement': 'your advisor',
  prediction: 'your prediction',
  traitor: 'the traitor you keep',
}

/**
 * WHICH OUTSTANDING DECISIONS HOLD READY DOWN — everything but the prediction.
 * Declining to predict is a real choice with a real cost already priced in,
 * and gating Ready on it would price that choice at seven more minutes of
 * waiting. The seat is told it has not predicted; it is not held for it.
 */
const GATES_READY = (d: SetupDecision) => d.kind !== 'prediction'

const territory = (id: string) => DUNE_TERRITORIES.find(t => t.id === id) ?? null
const territoryName = (id: string) => territory(id)?.displayName ?? id
const sectorNumber = (id: string) => DUNE_SECTORS.find(s => s.id === id)?.number ?? id

const button = (primary: boolean) => ({
  font: `${primary ? '600 ' : ''}12.5px ${SERIF}`,
  padding: primary ? '8px 16px' : '4px 9px',
  borderRadius: 5,
  cursor: 'pointer',
  border: primary ? '1px solid #c9542a' : '1px solid #ffffff33',
  background: primary ? '#c9542a' : 'transparent',
  color: primary ? '#fff' : PALE,
})

const block = {
  border: '1px solid #ffffff1c', borderRadius: 7, padding: '9px 10px', marginTop: 8,
}
const legend = {
  font: `600 12px ${SERIF}`, letterSpacing: 0.8, textTransform: 'uppercase' as const,
  margin: '0 0 6px', display: 'block',
}
const quiet = { margin: '6px 0 0', fontSize: 11.5, opacity: 0.62, lineHeight: 1.45 }

// ── the clickable cells, drawn inside the board's own svg ──────────────────

export interface SetupBoardTargetsProps {
  /** The seat doing the placing. */
  seat: FactionId
  /** Cells of the three Fremen territories take clicks when true. */
  fremen: boolean
  /** Every territory's cells take clicks when true — the advisor. */
  advisor: boolean
  onPlaceCell(territoryId: string, sector: string): void
  onAdvisorCell(territoryId: string, sector: string): void
}

/**
 * Where a click means something, made visible.
 *
 * PER CELL, NOT PER TERRITORY. A force occupies a sector — that is what the
 * storm reads — and False Wall South spans two, so the choice the old panel
 * asked for with a dropdown is made here by clicking the half of the wall you
 * mean. One ring per cell, on the exact point the stack will stand.
 */
export function SetupBoardTargets(
  { seat, fremen, advisor, onPlaceCell, onAdvisorCell }: SetupBoardTargetsProps,
) {
  const among = fremen ? distributeAmong(seat) : []
  return (
    <g data-layer="setup-targets">
      {fremen && DUNE_TERRITORIES.filter(t => among.includes(t.id)).flatMap(t =>
        t.cells.map(c => (
          <g key={`${t.id}|${c.sector}`} data-place-target={`${t.id}|${c.sector}`}
            style={{ cursor: 'pointer' }} onClick={() => onPlaceCell(t.id, c.sector)}>
            <title>{`${t.displayName} — sector ${sectorNumber(c.sector)}`}</title>
            <circle cx={c.at.x} cy={c.at.y} r="14" fill="#c9542a2e"
              stroke={PALE} strokeWidth="1.6" strokeDasharray="4 3" />
          </g>
        )))}
      {advisor && DUNE_TERRITORIES.flatMap(t =>
        t.cells.map(c => (
          <g key={`${t.id}|${c.sector}`} data-advisor-target={`${t.id}|${c.sector}`}
            style={{ cursor: 'pointer' }} onClick={() => onAdvisorCell(t.id, c.sector)}>
            <title>{`${t.displayName} — sector ${sectorNumber(c.sector)}`}</title>
            <circle cx={c.at.x} cy={c.at.y} r="10" fill="#2f6fb52a"
              stroke="#2f6fb5" strokeWidth="1.2" strokeDasharray="3 3" />
          </g>
        )))}
    </g>
  )
}

// ── the column ─────────────────────────────────────────────────────────────

export interface SetupWindowProps {
  seat: FactionId
  mode: GameMode
  /** The whole public list — the advisor's wait is a fact about all of it. */
  outstanding: readonly SetupDecision[]
  /** Who has pressed Ready. Shown here as a count; the names are on the HUD. */
  ready: readonly FactionId[]
  seated: readonly FactionId[]
  /** Declares this seat done. Gated on the seat owing nothing — see the head. */
  onReady(): void
  /** The four traitors, from this seat's own secrets row and nowhere else. */
  dealt?: readonly string[]
  /** The placement so far, added by clicks on the map. */
  pending: readonly PendingPlacement[]
  /** Take one back (plain first), or clear the cell. */
  onRemove(territoryId: string, sector: string): void
  onConfirmPlacement(): void
  advisorPending: { territoryId: string; sector: string } | null
  /** What the pending advisor would be, read off the board. */
  advisorPosture: ForcePosture | null
  onConfirmAdvisor(): void
  onPrediction(faction: FactionId, turn: number): void
  onTraitor(keep: string): void
  busy?: boolean
  refused?: string | null
}

export function SetupWindow({
  seat, mode, outstanding, ready, seated, dealt = [],
  pending, onRemove, onConfirmPlacement,
  advisorPending, advisorPosture, onConfirmAdvisor,
  onPrediction, onTraitor, onReady, busy, refused,
}: SetupWindowProps) {
  const owed = outstanding.filter(d => d.faction === seat)
  const owes = (kind: SetupDecision['kind']) => owed.some(d => d.kind === kind)
  const advisorBlocked = outstanding.some(d => d.kind === 'fremen-placement')
  const meReady = ready.includes(seat)
  const blocking = owed.filter(GATES_READY)
  const held = blocking.length > 0

  return (
    <aside data-layer="setup-window" aria-label="Setting up" style={{
      flex: '0 0 auto', width: 252, minWidth: 252, display: 'flex',
      flexDirection: 'column', minHeight: 0,
      borderRight: '1px solid #ffffff1f', background: '#101a2e',
      color: PALE, font: `12.5px ${SERIF}`,
    }}>
      <header style={{
        padding: '8px 12px', borderBottom: '1px solid #ffffff1f',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <b style={{ fontSize: 13, letterSpacing: 0.8 }}>SETTING UP</b>
        {/* THE COUNT, HERE; THE NAMES, ON THE HUD, where each seat's READY tag
            sits in its own bubble. Two full lists of the same six would be the
            phase-strip mistake again. */}
        <span data-ready-count={ready.length} style={{ fontSize: 11, opacity: 0.7 }}>
          {ready.length}/{seated.length} ready
        </span>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 10px 12px' }}>
        {owed.length === 0 && (
          <p style={{ ...quiet, marginTop: 10, fontSize: 12.5 }}>
            Nothing is owed by your seat. Look over the board, and press
            <b> Ready</b> below when you are — the game starts when every seat
            has.
          </p>
        )}

        {owes('fremen-placement') && (
          <FremenGuide seat={seat} mode={mode} pending={pending}
            onRemove={onRemove} onConfirm={onConfirmPlacement} busy={busy} />
        )}

        {owes('prediction') && (
          <Prediction seat={seat} seated={seated} busy={busy} onAnswer={onPrediction} />
        )}

        {owes('advisor-placement') && (
          <AdvisorGuide blocked={advisorBlocked} pending={advisorPending}
            posture={advisorPosture} onConfirm={onConfirmAdvisor} busy={busy} />
        )}

        <p style={{ margin: '9px 0 0', minHeight: '1.2em', fontSize: 12, opacity: 0.8 }}>
          {busy ? 'asking…'
            : refused ? `The server refused it: ${REFUSAL_TEXT[refused] ?? refused}`
            : owed.length > 0 ? 'Answer in any order. The others are not waiting on you.'
            : ''}
        </p>

        {/* THE CARDS THEMSELVES, below the window — a traitor is a card, and
            choosing between four half-inch names was choosing blind. Each face
            flips to its rules on a click, exactly as it will in the tray. */}
        {owes('traitor') && (
          <TraitorPick dealt={dealt} busy={busy} onKeep={onTraitor} />
        )}
      </div>

      {/* THE FOOT OF THE COLUMN THAT ASKED. Outside the scrolling list on
          purpose: the traitor cards make this column taller than the screen,
          and a Ready that scrolled away with them is the covered-button
          failure again in a different costume. Pinned here it is in view
          whatever the column is showing. */}
      <div style={{
        borderTop: '1px solid #ffffff1c', padding: '9px 10px',
        background: '#0d1220',
      }}>
        <button type="button" data-layer="setup-ready" onClick={onReady}
          disabled={busy || meReady || held}
          data-ready-blocked={held ? 'yes' : undefined}
          aria-label={meReady ? 'You are ready'
            : held ? 'Answer what your seat owes before declaring ready'
            : 'Ready — done with setup'}
          style={{
            ...button(true),
            width: '100%',
            cursor: meReady || held ? 'default' : 'pointer',
            border: `1px solid ${meReady ? '#27AE60' : '#c9542a'}`,
            background: meReady || held ? 'transparent' : '#c9542a',
            color: meReady ? '#27AE60' : held ? '#f0e2bb66' : '#fff',
          }}>
          {meReady ? '✓ Ready' : 'Ready'}
        </button>
        {/* WHY IT IS DEAD, in the same breath as the dead button — a control
            that refuses without saying what it wants reads as broken. And when
            only the prediction is outstanding the button is live: the line
            says what pressing it forgoes rather than standing in the way. */}
        <p style={{ ...quiet, marginTop: 6, textAlign: 'center' }}>
          {meReady
            ? `Waiting on the rest — ${ready.length}/${seated.length} seats are ready.`
            : held
              ? `Still to answer: ${blocking.map(d => OWED_TEXT[d.kind] ?? d.kind).join(', ')}.`
              : owes('prediction')
                ? 'You have sealed no prediction. Ready anyway if you mean to decline — it costs you that route to victory and nothing else.'
                : 'The game starts when every seat has pressed it.'}
        </p>
      </div>
    </aside>
  )
}

/**
 * The Fremen's ten, narrated while the map takes the clicks.
 *
 * The counts come off the faction card — the ten, the three territories and
 * the three Fedaykin alike. What lives HERE is only the running total, the
 * take-one-back buttons, and the Fedaykin toggle that decides what the next
 * click puts down.
 */
function FremenGuide(
  { seat, mode, pending, onRemove, onConfirm, busy }:
  {
    seat: FactionId; mode: GameMode; pending: readonly PendingPlacement[]
    onRemove(territoryId: string, sector: string): void
    onConfirm(): void; busy?: boolean
  },
) {
  const total = factionById(seat)?.forces.onPlanet ?? 0
  const stars = mode === 'advanced' ? starredOf(seat) : 0
  const placed = pending.reduce((n, e) => n + e.count, 0)
  const starsPlaced = pending.reduce((n, e) => n + e.starred, 0)
  const left = total - placed
  const starsLeft = stars - starsPlaced

  return (
    <div style={block} data-guide="fremen-placement">
      <b style={legend}>Your {total} forces</b>
      <p style={{ margin: '0 0 6px', fontSize: 12, lineHeight: 1.45, opacity: 0.85 }}>
        Stage them on the <b>bubbles by the board</b>
        {stars > 0 ? ' — the star is the Fedaykin — ' : ' '}
        then click a ringed territory to put the group down. A bare click
        places one.
      </p>
      <p data-left={left} data-stars-left={starsLeft}
        style={{ margin: '0 0 6px', fontSize: 12.5 }}>
        {left === 0 ? <b>all {total} placed</b> : <><b>{left}</b> to place</>}
        {stars > 0 && (
          <span style={{ color: STAR }}>
            {' · '}{starsLeft === 0 ? 'all' : starsLeft} Fedaykin {starsLeft === 0 ? 'placed' : 'left'}
          </span>
        )}
      </p>

      {pending.map(e => (
        <div key={`${e.territoryId}|${e.sector}`}
          data-pending={`${e.territoryId}|${e.sector}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0' }}>
          <span style={{ flex: 1, fontSize: 12 }}>
            {territoryName(e.territoryId)}
            {(territory(e.territoryId)?.sectors.length ?? 1) > 1 && (
              <span style={{ opacity: 0.6 }}> · s{sectorNumber(e.sector)}</span>
            )}
          </span>
          <b style={{ fontSize: 13 }}>
            {e.count - e.starred}
            {e.starred > 0 && <span style={{ color: STAR }}>+{e.starred}★</span>}
          </b>
          <button type="button" style={button(false)} disabled={busy}
            aria-label={`One fewer in ${territoryName(e.territoryId)}`}
            onClick={() => onRemove(e.territoryId, e.sector)}>−</button>
        </div>
      ))}

      <div style={{ marginTop: 8 }}>
        <button type="button" style={button(true)} disabled={busy || left !== 0}
          onClick={onConfirm}>
          Place them
        </button>
      </div>
      <p style={quiet}>
        Silence puts all {total} in {territoryName(distributeAmong(seat)[0] ?? '')}
        {stars > 0 ? ', Fedaykin included, ' : ' '}when the window closes.
        {stars > 0 && ' A Fedaykin you hold back waits in reserve.'}
      </p>
    </div>
  )
}

/**
 * The advisor, narrated while the map takes the click.
 *
 * WHICH IT WOULD BE IS SHOWN, not asked: the checkered bubble on the map and
 * the sentence here both come from postureFor, read off who else is standing
 * in the territory clicked. Alone it takes the field as a fighter, and the
 * preview says so before the click is confirmed.
 */
function AdvisorGuide(
  { blocked, pending, posture, onConfirm, busy }:
  {
    blocked: boolean; pending: { territoryId: string; sector: string } | null
    posture: ForcePosture | null; onConfirm(): void; busy?: boolean
  },
) {
  return (
    <div style={block} data-guide="advisor-placement">
      <b style={legend}>Your advisor</b>
      {blocked ? (
        <p data-blocked="advisor-placement" style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
          The Fremen have not placed yet. You choose knowing where their ten
          went, so the map opens to you when they answer.
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 12, lineHeight: 1.45, opacity: 0.85 }}>
            Click <b>any territory</b> to stand your advisor there — the
            checkered piece on the map is where it goes.
          </p>
          {pending && (
            <>
              <p style={{ margin: '0 0 4px', fontSize: 12.5 }}>
                <b>{territoryName(pending.territoryId)}</b>
                {(territory(pending.territoryId)?.sectors.length ?? 1) > 1 && (
                  <span style={{ opacity: 0.6 }}> · s{sectorNumber(pending.sector)}</span>
                )}
              </p>
              {posture && (
                <p data-posture={posture} style={{ margin: '0 0 6px', fontSize: 12, opacity: 0.85 }}>
                  {posture === 'advisor'
                    ? 'Somebody else is standing there — it goes in checkered, an advisor, holding nothing.'
                    : 'Nobody else is there, so it has nobody to advise: it takes the field as a fighter.'}
                </p>
              )}
              <button type="button" style={button(true)} disabled={busy} onClick={onConfirm}>
                Place it there
              </button>
            </>
          )}
          <p style={quiet}>
            Silence puts it in the Polar Sink, where the basic game puts it.
          </p>
        </>
      )}
    </div>
  )
}

/** The Bene Gesserit's prediction: who wins, and on which turn. */
function Prediction(
  { seat, seated, busy, onAnswer }:
  {
    seat: FactionId; seated: readonly FactionId[]; busy?: boolean
    onAnswer(faction: FactionId, turn: number): void
  },
) {
  const others = seated.filter(f => f !== seat)
  const turns = Array.from(
    { length: PREDICTION_TURNS.max - PREDICTION_TURNS.min + 1 },
    (_, i) => PREDICTION_TURNS.min + i)
  const [who, setWho] = useState('')
  const [turn, setTurn] = useState('')

  return (
    <div style={block} data-guide="prediction">
      <b style={legend}>Your prediction</b>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12 }}>
          who{' '}
          <select value={who} disabled={busy} aria-label="Faction you predict will win"
            onChange={e => setWho(e.target.value)} style={{ font: `12px ${SERIF}` }}>
            <option value="">—</option>
            {others.map(f => <option key={f} value={f}>{FACTION_LOOK[f].name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          turn{' '}
          <select value={turn} disabled={busy} aria-label="Turn they win on"
            onChange={e => setTurn(e.target.value)} style={{ font: `12px ${SERIF}` }}>
            <option value="">—</option>
            {turns.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <button type="button" style={button(true)} disabled={busy || !who || !turn}
          onClick={() => onAnswer(who as FactionId, Number(turn))}>
          Predict
        </button>
      </div>
      <p style={quiet}>
        Sealed until the game ends, and binding. Silence is no prediction — it
        costs you that route to victory and nothing else.
      </p>
    </div>
  )
}

/**
 * The one traitor kept, chosen off the cards themselves.
 *
 * ACTUAL CARDS — face, strength, faction band — because that is what the
 * decision is about, and each flips to its rules on a click exactly as it will
 * in the tray. The keep is a separate button under each card, so reading a
 * card and committing to it stay two different acts: this binds the most
 * valuable secret in the game for the whole match.
 */
function TraitorPick(
  { dealt, busy, onKeep }:
  { dealt: readonly string[]; busy?: boolean; onKeep(keep: string): void },
) {
  return (
    <div style={{ ...block, marginTop: 10 }} data-guide="traitor">
      <b style={legend}>Keep one traitor</b>
      {dealt.length === 0 ? (
        // NOT FOUR BLANKS. The four live in this seat's own row and arrive on
        // their own channel; placeholders would be a hand that looks dealt
        // before it is.
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
          Your four have not reached this browser yet.
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.45, opacity: 0.85 }}>
            The other three go back to the deck. Click a card to read its back;
            keep with the button beneath it.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            {dealt.map(name => {
              const found = findLeader(name)
              return (
                <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {found
                    ? <TraitorCard leader={found.leader} faction={found.faction} width={200} />
                    : <span style={{ fontSize: 12 }}>{name}</span>}
                  <button type="button" style={{ ...button(true), padding: '6px 12px' }}
                    disabled={busy} data-keep={name} onClick={() => onKeep(name)}>
                    Keep {name}
                  </button>
                </div>
              )
            })}
          </div>
          <p style={quiet}>Silence keeps the first of the four.</p>
        </>
      )}
    </div>
  )
}

export default SetupWindow
