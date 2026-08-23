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
 *
 * THE TWO CARDS ARE PANELS, NOT PANES. The faction card and the ally's card are
 * paragraphs of rules text, and a paragraph squeezed into a strip is a paragraph
 * nobody reads — it was a 190px column with its own scrollbar. They open from
 * buttons into DraggableResizable, the same floating panel Risk's card views
 * use: draggable anywhere, resizable, position remembered per player, and
 * closable. A player can park their faction card at the side and leave it up all
 * game, which is what you do with the real one.
 *
 * The room that frees goes to the leader discs, which now render large enough
 * to read a strength off. Every battle in Dune is a leader plus a number, and a
 * disc too small to read the number on is a decoration.
 */
import { useState } from 'react'
import DraggableResizable from '@/components/DraggableResizable'
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

/**
 * How wide a treachery card is drawn in the hand, and how wide it opens.
 *
 * The pair is exported because the RATIO is the claim. Cards are laid out
 * against CARD_W — see TreacheryCardFace — and their rules text is sized
 * against that; at thumbnail size it is a grey smudge, which is the entire
 * reason for opening one. A "zoom" that opens a card at the size it already was
 * is a thing that looks implemented and does nothing, and nothing about the
 * markup would say so.
 */
export const CARD_THUMB = 116
export const CARD_ZOOM = 300

/** A button that opens one of the floating cards. */
const cardButton = (colour: string, open: boolean): React.CSSProperties => ({
  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
  background: open ? '#ffffff1a' : 'transparent', color: PALE,
  border: `1px solid ${colour}`, borderLeftWidth: 4, borderRadius: 4,
  padding: '4px 8px', fontFamily: SERIF, fontSize: 12,
})

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
 * The prose bucket, which the card does not carry.
 *
 * `advanced.general` is where a faction's advanced rules go when they are one
 * block of essay rather than a rule per phase — see AdvancedRules. Two factions
 * have one, and the Atreides' runs to 854 characters of Kwisatz Haderach
 * exposition. That is the rulebook, not a reference card: it drowned the three
 * advantages above it, and its subject already has its own tracker on this same
 * strip.
 *
 * Everything KEYED BY PHASE stays, advanced ones included. Those are advantages
 * you act on at a known moment, which is what a faction card is for.
 */
const STRATEGY_PROSE = 'general'

/**
 * The faction card: who you are and what that lets you do.
 *
 * The advantages come out of the faction data keyed by the phase they apply in,
 * and the phase is shown beside each one — 'BIDDING: you may look at each card'
 * is a rule you can act on, where the same sentence without its phase is a
 * rule you have to remember to look for.
 */
export function FactionCard({ faction, mode }: { faction: Faction; mode: GameMode }) {
  const look = FACTION_LOOK[faction.id]
  const rules = Object.entries(faction.abilities) as [string, string][]
  // Advanced rules are ADDITIONAL, and shown only in the game that has them.
  const extra = mode === 'advanced'
    ? (Object.entries(faction.advanced) as [string, string][])
      .filter(([key]) => key !== STRATEGY_PROSE)
    : []
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minWidth: 0,
      borderLeft: `4px solid ${look.colour}`, paddingLeft: 9,
    }}>
      {/* In a panel now, so it takes the room the panel has rather than fighting
          a strip for it. The player sizes that panel themselves.

          SELECTABLE, against the tray's blanket rule. This and the ally's card
          are the only prose on the screen — a paragraph of rules somebody might
          reasonably want to quote — and they sit in panels opened deliberately
          rather than under a cursor reaching for the board. */}
      <div style={{ fontSize: 13, lineHeight: 1.45, userSelect: 'text', WebkitUserSelect: 'text' }}>
        {[...rules, ...extra].map(([phase, text]) => (
          <p key={phase + text.slice(0, 12)} style={{ margin: '0 0 5px' }}>
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
  { kind, hand, traitors, onOpenCard }:
  {
    kind: 'treachery' | 'traitors'
    hand: readonly TreacheryCard[]
    traitors: readonly string[]
    /** Clicking a card asks for it enlarged. Absent means the cards are inert. */
    onOpenCard?: (card: TreacheryCard) => void
  },
) {
  return (
    <div data-layer="private-view" role="dialog"
      aria-label={kind === 'treachery' ? 'Your treachery cards' : 'Your traitor cards'}
      style={{
        display: 'flex', gap: 10, padding: '10px 12px', overflowX: 'auto',
        background: '#0b1020', borderBottom: '1px solid #ffffff1f',
      }}>
      {/* At this size the rules text on a card is a grey smudge — it is drawn
          at a fifth of the size the card was designed at. The thumbnail says
          WHICH card; clicking it says what the card does. */}
      {kind === 'treachery' && (hand.length
        ? hand.map(c => (
            <button key={c.id} type="button" onClick={() => onOpenCard?.(c)}
              aria-label={`Open ${c.name}`}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: onOpenCard ? 'zoom-in' : 'default', lineHeight: 0,
              }}>
              <TreacheryCardFace card={c} width={CARD_THUMB} />
            </button>
          ))
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
  // The two floating panels, and the one card blown up to be readable. All
  // three are the player's own view of their own things; none of them changes
  // any state anybody else can see.
  const [showFaction, setShowFaction] = useState(false)
  const [showAlliance, setShowAlliance] = useState(false)
  const [zoom, setZoom] = useState<TreacheryCard | null>(null)
  const faction = factionById(seat)
  const allyFaction = ally ? factionById(ally) : null
  const look = FACTION_LOOK[seat]
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
      style={{
        background: '#131c2e', color: PALE, borderTop: '1px solid #ffffff1f',
        // Labels, tallies, card faces and leader discs. The two exceptions are
        // re-enabled where they are drawn: the faction card and the ally's card
        // are the only prose on this screen anybody would want to copy, and they
        // open in panels you have to ask for.
        userSelect: 'none', WebkitUserSelect: 'none',
      }}>

      {/* The private view, above the strip so it does not push the board. Only
          ever RENDERED when asked for — a hand hidden with CSS is still in the
          markup, and the markup is what a screenshot over somebody's shoulder
          has in it. */}
      {open && <PrivateView kind={open} hand={hand} traitors={traitors}
        onOpenCard={setZoom} />}

      <div style={{
        display: 'flex', alignItems: 'stretch',
        // A DEFINITE HEIGHT, scaled to the window, and a modest one. Every pixel
        // here comes straight off the board directly above it — the board is
        // taller than it is wide and is bound by the height it is given, so the
        // tray and the map are in direct competition for it.
        height: 'clamp(104px, 15vh, 152px)',
        // CENTRED, AND SPILLING BOTH WAYS when it does not fit. justify-content
        // rather than an auto margin precisely because of the overflow: an auto
        // margin resolves to zero once there is no free space, which drops the
        // row against its left edge — off the board it is supposed to sit under.
        // Centred, the spill is even, and what it spills into is the empty band
        // beneath the side panels.
        justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <Panel label="CARDS">
          <button type="button" onClick={() => setShowFaction(v => !v)}
            aria-expanded={showFaction} aria-label="Faction card"
            style={cardButton(look.colour, showFaction)}>{look.name}</button>
          {allyFaction && (
            <button type="button" onClick={() => setShowAlliance(v => !v)}
              aria-expanded={showAlliance} aria-label="Alliance card"
              style={cardButton(FACTION_LOOK[allyFaction.id].colour, showAlliance)}>
              Alliance
            </button>
          )}
        </Panel>

        <Panel label="HELD">
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Spice is SECRET. It is the one number on this strip that is not
                on the HUD, and the reason the HUD has no column for it. */}
            <Tally value={loading ? '–' : own?.spice ?? 0} word="spice"
              title="Your spice. Nobody else can see this." />
            <Tally value={player.reserves} word="reserves" title="Forces still to ship" />
          </div>
        </Panel>

        {/* BIG ENOUGH TO READ. Every battle is a leader and a number, and the
            number is on the disc — at 28px across it was a smudge. This is the
            room the faction card gave back by becoming a panel. */}
        <Panel label="LEADERS" width={faction.leaders.length * 62}>
          <svg viewBox={`0 0 ${faction.leaders.length * 62} 62`}
            style={{ display: 'block', width: '100%', height: '100%',
                     maxHeight: 92, maxWidth: faction.leaders.length * 62 }}
            preserveAspectRatio="xMidYMid meet">
            {faction.leaders.map((l, i) => (
              <g key={l.name} transform={`translate(${31 + i * 62} 31)`}>
                <LeaderDisc leader={l} faction={faction.id} r={29} />
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

        {mode === 'advanced' && seat === KWISATZ_FACTION && (
          <Panel label="KWISATZ HADERACH">
            <KwisatzTracker battleLosses={player.battleLosses ?? 0} />
          </Panel>
        )}
        </div>
      </div>

      {/* Floating, and outside the strip's flow — DraggableResizable positions
          itself fixed. Parked wherever the player last left them. */}
      {showFaction && (
        <DraggableResizable title={`${look.name} — faction card`} accentColor={look.colour}
          width={420} storageKey={`dune-faction-${seat}`} initialTop={90} initialRight={280}
          onClose={() => setShowFaction(false)}>
          <FactionCard faction={faction} mode={mode} />
        </DraggableResizable>
      )}

      {showAlliance && allyFaction && (
        <DraggableResizable title={`${FACTION_LOOK[allyFaction.id].name} — alliance`}
          accentColor={FACTION_LOOK[allyFaction.id].colour}
          width={380} storageKey={`dune-alliance-${seat}`} initialTop={150} initialRight={60}
          onClose={() => setShowAlliance(false)}>
          <p style={{
            margin: 0, fontSize: 13, lineHeight: 1.45,
            userSelect: 'text', WebkitUserSelect: 'text',
          }}>{allyFaction.alliance}</p>
        </DraggableResizable>
      )}

      {/* One card, at a size its own rules text was drawn for. */}
      {zoom && (
        <DraggableResizable title={zoom.name} accentColor={look.colour}
          width={CARD_ZOOM + 34} storageKey={`dune-card-${seat}`}
          onClose={() => setZoom(null)}>
          <div data-layer="card-zoom" style={{ display: 'flex', justifyContent: 'center' }}>
            <TreacheryCardFace card={zoom} width={CARD_ZOOM} />
          </div>
        </DraggableResizable>
      )}
    </footer>
  )
}

export default OwnStrip
