/**
 * The player's own strip, along the bottom.
 *
 * THE LINE THIS COMPONENT SITS ON. Everything above it — the board, the HUD
 * down the right — is public by rule. This is the one part of the screen that
 * shows things only this seat may see, and the split is carried in the props:
 * `own` is the seat's match_secrets row and holds spice, the cards themselves
 * and the traitors; `player` is that seat's line out of the shared row and
 * holds only what the whole table can see anyway.
 *
 * The cards are FACE DOWN until asked for. Not decoration: people play this
 * over a shared screen, or with somebody watching, and a hand permanently
 * spread along the bottom edge is a hand everyone at the table has read. Click
 * to look, click again to put it back — the same thing you do with a real hand.
 *
 * The Kwisatz Haderach tracker is Atreides-only AND advanced-only. Two
 * conditions, and the second is the one that gets forgotten: he does not exist
 * in the basic game, so a tracker there is a promise the rules will not keep.
 */
import { useState } from 'react'
import type { Faction, FactionId } from '@/types/Dune/Faction'
import type { GameMode } from '@/types/Dune/Game'
import { kwisatzHaderachAvailable, KWISATZ_HADERACH_AT } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import type { HudRow } from '@/lib/dune/hud'
import { factionById, findLeader } from '@/data/dune/factions'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import type { TreacheryCard } from '@/types/Dune/Treachery'
import { FACTION_LOOK } from './SeatLayer'
import { LeaderDisc } from './LeaderDisc'
import { TreacheryCardFace, TreacheryCardBack } from './TreacheryCardFace'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

/** The faction who may hold the Kwisatz Haderach, named once. */
const KWISATZ_FACTION: FactionId = 'atreides'

export interface OwnStripProps {
  seat: FactionId
  mode: GameMode
  /**
   * This seat's secrets row, straight off the secrets channel.
   *
   * Never from shared state — every field here reaches exactly one browser.
   * Null while the channel is still opening, which is a real state and reads as
   * "not loaded", not as "you have nothing".
   */
  own: DuneSecrets | null
  /** This seat's own public line, for the facts that are public anyway. */
  player: HudRow
  /** Resolved ally, or null. Both seats must agree — see allyOf. */
  ally: FactionId | null
}

/** A titled block along the strip. */
function Panel(
  { label, children, width }:
  { label: string; children: React.ReactNode; width?: number },
) {
  return (
    <section style={{
      // A shrinkable panel still needs a floor. Five leader discs allowed down
      // to nothing render as five dots, which is not a smaller version of a
      // leader disc — the portrait and the name are the whole point of one. The
      // row scrolls rather than squashing them past legibility.
      flex: width ? `0 1 ${width}px` : '0 0 auto',
      minWidth: width ? Math.round(width * 0.7) : 0,
      borderLeft: '1px solid #ffffff14', padding: '6px 10px',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <h3 style={{
        margin: 0, fontSize: 9.5, letterSpacing: 1.4, opacity: 0.55,
        fontFamily: SERIF, fontWeight: 400,
      }}>{label}</h3>
      {children}
    </section>
  )
}

/** A big number with a word under it. */
function Tally({ value, word, title }: { value: number | string; word: string; title?: string }) {
  return (
    <div title={title} style={{ textAlign: 'center', minWidth: 42 }}>
      <b style={{ fontSize: 19, fontFamily: SERIF, display: 'block', lineHeight: 1 }}>{value}</b>
      <span style={{ fontSize: 9, opacity: 0.55, letterSpacing: 0.6 }}>{word}</span>
    </div>
  )
}

/**
 * The faction card: who you are and what that lets you do.
 *
 * The advantages come out of the faction data keyed by the phase they apply in,
 * and the phase is shown beside each one — 'BIDDING: you may look at each card'
 * is a rule you can act on, where the same sentence without its phase is a
 * rule you have to remember to look for.
 */
function FactionCard({ faction, mode }: { faction: Faction; mode: GameMode }) {
  const look = FACTION_LOOK[faction.id]
  const rules = Object.entries(faction.abilities) as [string, string][]
  // Advanced rules are ADDITIONAL, and shown only in the game that has them.
  const extra = mode === 'advanced'
    ? (Object.entries(faction.advanced) as [string, string][])
    : []
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%',
      borderLeft: `4px solid ${look.colour}`, paddingLeft: 8,
    }}>
      <b style={{ fontFamily: SERIF, fontSize: 14, letterSpacing: 0.5 }}>{look.name}</b>
      <div style={{ overflowY: 'auto', fontSize: 10.5, lineHeight: 1.35, maxHeight: 78 }}>
        {[...rules, ...extra].map(([phase, text]) => (
          <p key={phase + text.slice(0, 12)} style={{ margin: '0 0 4px' }}>
            <span style={{ opacity: 0.5, letterSpacing: 0.6 }}>{phase.toUpperCase()} </span>
            <span style={{ opacity: 0.9 }}>{text}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

/**
 * Forces lost, and whether he is available yet.
 *
 * The count is what the state holds; availability is derived from it, so the
 * pips and the verdict cannot say different things.
 */
function KwisatzTracker({ battleLosses }: { battleLosses: number }) {
  const ready = kwisatzHaderachAvailable(battleLosses)
  return (
    <div data-layer="kwisatz-haderach" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: KWISATZ_HADERACH_AT }, (_, i) => (
          <span key={i} data-pip={i < battleLosses ? 'lit' : 'dark'} style={{
            width: 9, height: 9, borderRadius: '50%',
            background: i < battleLosses ? '#c9542a' : 'transparent',
            border: `1px solid ${i < battleLosses ? '#c9542a' : '#ffffff44'}`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 10, opacity: ready ? 1 : 0.55, color: ready ? '#f2c14e' : PALE }}>
        {ready
          ? 'Kwisatz Haderach available'
          : `${battleLosses} of ${KWISATZ_HADERACH_AT} forces lost`}
      </span>
    </div>
  )
}

/** The face-down stack a player clicks to look at. */
function HiddenStack(
  { count, open, onToggle, label }:
  { count: number; open: boolean; onToggle(): void; label: string },
) {
  return (
    <button onClick={onToggle} aria-expanded={open} aria-label={`${label}: ${count}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
        background: open ? '#ffffff1a' : 'transparent', color: PALE,
        border: '1px solid #ffffff33', borderRadius: 4, padding: '4px 8px',
      }}>
      <span style={{ display: 'flex' }}>
        {/* Three backs at most, fanned. A stack, not an inventory — the number
            beside it is what says how many. */}
        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
          <span key={i} style={{ marginLeft: i ? -13 : 0, display: 'block' }}>
            <TreacheryCardBack width={20} />
          </span>
        ))}
        {count === 0 && <span style={{ fontSize: 10, opacity: 0.5 }}>none</span>}
      </span>
      <b style={{ fontFamily: SERIF, fontSize: 15 }}>{count}</b>
      <span style={{ fontSize: 9.5, opacity: 0.6 }}>{open ? 'hide' : 'view'}</span>
    </button>
  )
}

/**
 * The cards, face up, when the player has asked to see them.
 *
 * ITS OWN COMPONENT so that both states can be tested. The claim that matters
 * is the CLOSED one — that a hand is not in the markup until it is asked for —
 * and a claim about absence is only worth something if the presence it denies
 * can also be shown. With the drawer inline there was no way to render the open
 * state at all, so "the cards are hidden" was true of a component that could
 * not show cards.
 */
export function PrivateView(
  { kind, hand, traitors }:
  { kind: 'treachery' | 'traitors'; hand: readonly TreacheryCard[]; traitors: readonly string[] },
) {
  return (
    <div data-layer="private-view" role="dialog"
      aria-label={kind === 'treachery' ? 'Your treachery cards' : 'Your traitor cards'}
      style={{
        display: 'flex', gap: 10, padding: '10px 12px', overflowX: 'auto',
        background: '#0b1020', borderBottom: '1px solid #ffffff1f',
      }}>
      {kind === 'treachery' && (hand.length
        ? hand.map(c => <TreacheryCardFace key={c.id} card={c} width={116} />)
        : <p style={{ opacity: 0.6, margin: 0, fontSize: 12 }}>No treachery cards.</p>)}
      {kind === 'traitors' && (traitors.length
        ? traitors.map(name => {
            const found = findLeader(name)
            if (!found) return <span key={name} style={{ fontSize: 12 }}>{name}</span>
            return (
              <div key={name} style={{ textAlign: 'center' }}>
                <svg viewBox="-52 -52 104 104" width={92} height={92} style={{ display: 'block' }}>
                  <LeaderDisc leader={found.leader} faction={found.faction} r={48} />
                </svg>
                <span style={{ fontSize: 9.5, opacity: 0.6 }}>
                  {FACTION_LOOK[found.faction].name}
                </span>
              </div>
            )
          })
        : <p style={{ opacity: 0.6, margin: 0, fontSize: 12 }}>No traitors dealt.</p>)}
    </div>
  )
}

export function OwnStrip({ seat, mode, own, player, ally }: OwnStripProps) {
  const [open, setOpen] = useState<'treachery' | 'traitors' | null>(null)
  const faction = factionById(seat)
  const allyFaction = ally ? factionById(ally) : null
  if (!faction) return null

  // The hand and the traitors come from the secrets row and from nowhere else.
  // An unopened channel is `own === null`, which is not the same as an empty
  // hand and must not render as one.
  const hand = (own?.cards ?? [])
    .map(id => TREACHERY_CARDS.find(c => c.id === id))
    .filter((c): c is TreacheryCard => !!c)
  const traitors = own?.traitors ?? []
  const loading = own === null

  return (
    <footer data-layer="own-strip" data-seat={seat}
      style={{ background: '#131c2e', color: PALE, borderTop: '1px solid #ffffff1f' }}>

      {/* The private view, above the strip so it does not push the board. Only
          ever RENDERED when asked for — a hand hidden with CSS is still in the
          markup, and the markup is what a screenshot over somebody's shoulder
          has in it. */}
      {open && <PrivateView kind={open} hand={hand} traitors={traitors} />}

      <div style={{
        display: 'flex', alignItems: 'stretch', minHeight: 104,
        // A backstop, not the plan. The panels below shrink first; this is what
        // stops the last one being clipped off the edge rather than reachable
        // when the window is genuinely too narrow for all of them.
        overflowX: 'auto',
      }}>
        {/* Given a floor. Shrinking this to nothing to pay for the fixed panels
            beside it left the faction card twenty pixels wide, which is not a
            smaller faction card, it is a missing one. */}
        <div style={{ flex: '1 1 220px', minWidth: 190, padding: '6px 10px' }}>
          <FactionCard faction={faction} mode={mode} />
        </div>

        <Panel label="HELD">
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Spice is SECRET. It is the one number on this strip that is not
                on the HUD, and the reason the HUD has no column for it. */}
            <Tally value={loading ? '–' : own?.spice ?? 0} word="spice"
              title="Your spice. Nobody else can see this." />
            <Tally value={player.reserves} word="reserves" title="Forces still to ship" />
          </div>
        </Panel>

        <Panel label="LEADERS" width={200}>
          <svg viewBox={`0 0 ${faction.leaders.length * 54} 54`}
            style={{ display: 'block', width: '100%', maxWidth: faction.leaders.length * 44 }}>
            {faction.leaders.map((l, i) => (
              <g key={l.name} transform={`translate(${27 + i * 54} 27)`}>
                <LeaderDisc leader={l} faction={faction.id} r={25} />
              </g>
            ))}
          </svg>
        </Panel>

        <Panel label="TREACHERY">
          <HiddenStack label="Treachery cards" count={hand.length}
            open={open === 'treachery'}
            onToggle={() => setOpen(o => (o === 'treachery' ? null : 'treachery'))} />
          <span style={{ fontSize: 9.5, opacity: 0.5 }}>limit {faction.handLimit}</span>
        </Panel>

        <Panel label="TRAITORS">
          <HiddenStack label="Traitor cards" count={traitors.length}
            open={open === 'traitors'}
            onToggle={() => setOpen(o => (o === 'traitors' ? null : 'traitors'))} />
        </Panel>

        {/* An ally's card, so the help you can call on is in front of you rather
            than in their strip, which you cannot see. */}
        {allyFaction && (
          <Panel label="ALLIANCE">
            <div style={{
              maxWidth: 190, borderLeft: `4px solid ${FACTION_LOOK[allyFaction.id].colour}`,
              paddingLeft: 7,
            }}>
              <b style={{ fontFamily: SERIF, fontSize: 12 }}>{FACTION_LOOK[allyFaction.id].name}</b>
              <p style={{ margin: '2px 0 0', fontSize: 10, lineHeight: 1.35, opacity: 0.9,
                maxHeight: 62, overflowY: 'auto' }}>
                {allyFaction.alliance}
              </p>
            </div>
          </Panel>
        )}

        {mode === 'advanced' && seat === KWISATZ_FACTION && (
          <Panel label="KWISATZ HADERACH">
            <KwisatzTracker battleLosses={player.battleLosses ?? 0} />
          </Panel>
        )}
      </div>
    </footer>
  )
}

export default OwnStrip
