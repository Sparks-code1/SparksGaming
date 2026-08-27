/**
 * The game screen with a fixture behind it, at ?dune-game.
 *
 * A development view, like DuneDevBoard beside it, and for the same reason: the
 * screen takes a whole game's public state and one seat's secrets, and until
 * something assembles those there is no way to LOOK at the thing. A layout that
 * has only ever been asserted about is a layout nobody has seen.
 *
 * The fixture is a mid-game position rather than a fresh one: a fresh board is
 * empty, and an empty board is exactly the case where a layout looks fine.
 * There are allies, a faction at its hand limit, spice on the ground and a
 * running auction, because those are the states that overlap each other.
 */
import { useEffect, useState } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import type { DuneGameState, GameMode, Force } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import {
  openingPosition, settle, defaultSector, postureFor, defaultFremenPlacement, SETUP_SECONDS,
} from '@/lib/dune/setup'
import type { SetupDecision, SetupWindow } from '@/lib/dune/setup'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { DuneGameScreen } from './DuneGameScreen'
import type { ChatMessage } from './ChatPanel'
import type { BiddingPanelProps } from './BiddingPanel'

const f = (
  faction: FactionId, territoryId: string, sector: string, count: number,
) => ({
  faction,
  territoryId: territoryId as DuneGameState['forces'][number]['territoryId'],
  sector: sector as DuneGameState['forces'][number]['sector'],
  count,
})

const STATE: DuneGameState = {
  storm: 'sector-4', turn: 4, phase: 'Bidding', shieldWall: 'intact', mode: 'advanced',
  spiceDeck: {
    remaining: 11,
    discardA: [{
      kind: 'territory', territoryId: 'territory-20', name: 'Hagga Basin',
      spice: 6, sector: 'sector-11',
    }],
    discardB: [{ kind: 'shai-hulud' }],
  },
  players: [
    // Allied, and adjacent in the HUD because of it.
    { faction: 'atreides', seat: 'player-position-1', reserves: 5, handCount: 3,
      ally: 'fremen', battleLosses: 4 },
    { faction: 'harkonnen', seat: 'player-position-2', reserves: 8, handCount: 8, ally: null },
    { faction: 'emperor', seat: 'player-position-3', reserves: 12, handCount: 2, ally: null },
    { faction: 'fremen', seat: 'player-position-4', reserves: 3, handCount: 1, ally: 'atreides' },
    { faction: 'spacing-guild', seat: 'player-position-5', reserves: 9, handCount: 4, ally: null },
    { faction: 'bene-gesserit', seat: 'player-position-6', reserves: 14, handCount: 0, ally: null },
  ],
  forces: [
    f('atreides', 'territory-13', 'sector-10', 6),
    f('atreides', 'territory-13', 'sector-9', 2),
    f('harkonnen', 'territory-12', 'sector-10', 5),
    f('emperor', 'territory-20', 'sector-11', 4),
    f('fremen', 'territory-32', 'sector-14', 7),
    f('fremen', 'territory-27', 'sector-13', 3),
    f('spacing-guild', 'territory-41', 'sector-17', 2),
  ],
  spiceOnBoard: { 'territory-20': 6, 'territory-32': 10 },
  awaiting: 'harkonnen',
}

const OWN: DuneSecrets = {
  spice: 17,
  cards: TREACHERY_CARDS.slice(0, 3).map(c => c.id),
  traitors: ['Piter De Vries', 'Stilgar'],
  // The Atreides seat, so the auction slot shows a card face up for them alone.
  prescience: TREACHERY_CARDS[4]?.id,
}

const CHAT: ChatMessage[] = [
  { id: '1', faction: null, from: 'Game', text: 'Turn 4 — bidding.', at: 0 },
  { id: '2', faction: 'harkonnen', text: 'Two for that one, no more.', at: 1 },
  { id: '3', faction: 'fremen', text: 'We can cover Hagga Basin if you take the north.', at: 2 },
]

const BIDDING: Omit<BiddingPanelProps, 'seat' | 'spice' | 'hand' | 'revealed' | 'now'> = {
  ask: {
    kind: 'treachery-bid', index: 1, cardCount: 6, minimum: 4,
    high: { faction: 'emperor', spice: 3 },
    hands: {
      atreides: 3, harkonnen: 8, emperor: 2, fremen: 1,
      'spacing-guild': 4, 'bene-gesserit': 0,
    },
  },
  order: ['harkonnen', 'emperor', 'fremen', 'spacing-guild', 'bene-gesserit', 'atreides'],
  toAct: 'atreides',
  passed: ['bene-gesserit'],
  closesAt: 0,
  onBid: () => {},
  onPass: () => {},
}

/**
 * A real opening position, for ?dune-game&setup.
 *
 * NOT A SECOND FIXTURE. The setup panel draws off `state.setup.outstanding` and
 * off the four traitors in one seat's own row, and both of those are things
 * openingPosition produces — so the preview deals a real game rather than
 * hand-writing a plausible-looking one. A hand-written setup would be the one
 * arrangement the deal never makes.
 *
 * ADVANCED, always. The advisor placement exists in the advanced game only, and
 * it is the decision worth looking at: it is the one that waits on another
 * seat. The basic-game toggle is about how the spice deck is laid out and has
 * nothing to say here, so it stands down while this is running.
 */
function dealForPreview() {
  return openingPosition({
    seats: STATE.players.map((p, i) => ({
      faction: p.faction, playerId: `p${i + 1}`, seat: p.seat,
    })),
    mode: 'advanced',
    rng: Math.random,
    closesAt: Date.now() + SETUP_SECONDS * 1000,
  })
}

export default function DuneGameScreenPreview() {
  const q = new URLSearchParams(window.location.search)
  const [now, setNow] = useState(() => Date.now())
  // The panel's clock is injected, so something has to drive it. Once a second
  // is enough for a countdown shown in whole seconds.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // A TOGGLE, not just a query string. The basic and advanced games lay the
  // spice deck out differently — one discard pile beside the deck against two
  // stacked to its right — and the only way to judge that is to switch between
  // them and watch, rather than to reload with a different URL and remember.
  const [mode, setMode] = useState<GameMode>(
    q.get('mode') === 'basic' ? 'basic' : 'advanced')
  const seat = q.get('seat') === 'none' ? null : ((q.get('seat') ?? 'atreides') as FactionId)

  // THE AUCTION ANSWERS. It used to be a constant with stubbed callbacks, so
  // the panel came up and stayed up: Bid and Pass did nothing, and the only way
  // out was to know about ?auction=off. A preview you cannot get out of is a
  // preview of one frame.
  const [card, setCard] = useState(q.get('auction') === 'off' ? -1 : BIDDING.ask.index)
  const running = card >= 0 && card < BIDDING.ask.cardCount

  // ── setting up, at ?dune-game&setup ──────────────────────────────────────
  // ANSWERS THAT LAND, like the auction's above. The four settle locally: the
  // decision comes off the outstanding list and any forces it placed go onto
  // the board, which is what makes the advisor's wait mean anything — place the
  // Fremen's ten and watch its control open, and its posture line change with
  // where you put them. None of this is the real thing; the real one is on the
  // server, and this is how you look at the panel without six accounts.
  const [dealt] = useState(() => (q.has('setup') ? dealForPreview() : null))
  const [outstanding, setOutstanding] = useState<SetupDecision[]>(
    () => dealt?.state.setup.outstanding ?? [])
  const [placedForces, setPlacedForces] = useState<Force[]>([])
  const [readyLocal, setReadyLocal] = useState<FactionId[]>([])
  const settling = !!dealt && outstanding.length > 0
  const mySeatId = dealt && seat
    ? STATE.players.findIndex(p => p.faction === seat) + 1
    : 0
  const answer = (kind: SetupDecision['kind'], forces: Force[] = []) => {
    if (!seat) return
    setPlacedForces(f => [...f, ...forces])
    setOutstanding(o => settle(o, kind, seat))
  }

  const setupState: DuneGameState & { setup?: SetupWindow } = dealt
    ? { ...dealt.state, mode: 'advanced',
        forces: [...dealt.state.forces, ...placedForces],
        setup: { ...dealt.state.setup, outstanding, ready: readyLocal } }
    : { ...STATE, mode }

  return (
    <>
      <DuneGameScreen
        state={settling ? setupState : { ...STATE, mode }}
        seat={seat}
        own={settling && seat
          ? (dealt.secrets[`p${mySeatId}`] as DuneSecrets)
          : seat ? OWN : null}
        chat={CHAT}
        onSend={seat ? () => {} : undefined}
        setup={settling && seat ? {
          onFremenPlacement: at => answer('fremen-placement',
            at.map(a => ({
              faction: seat,
              territoryId: a.territoryId as Force['territoryId'],
              sector: (a.sector ?? defaultSector(a.territoryId)) as Force['sector'],
              count: a.count,
              ...((a.starred ?? 0) > 0 ? { starred: a.starred } : null),
            }))),
          onPrediction: () => answer('prediction'),
          onTraitor: () => answer('traitor'),
          onAdvisorPlacement: (territoryId, sector) => answer('advisor-placement', [{
            faction: seat,
            territoryId: territoryId as Force['territoryId'],
            sector: (sector ?? defaultSector(territoryId)) as Force['sector'],
            count: 1,
            posture: postureFor([...dealt.state.forces, ...placedForces], territoryId, seat),
          }]),
          // Locally, ready marks this seat and nothing more — the other five
          // are simulated, so the window closing on unanimity is the server's
          // half and lives in dunesetuptest, not here.
          onReady: () => setReadyLocal(r => seat && !r.includes(seat) ? [...r, seat] : r),
        } : null}
        bidding={running
          ? {
              ...BIDDING,
              ask: { ...BIDDING.ask, index: card },
              closesAt: now + 9_000,
              // Bidding wins the card and moves the row on; passing ends it
              // here. Neither is the real auction — that lives on the server —
              // but both leave the screen somewhere you can get out of.
              onBid: () => setCard(c => c + 1),
              onPass: () => setCard(-1),
            }
          : null}
        now={now} />
      {/* THE OTHER SEAT'S ANSWER, which this page cannot give.
          The advisor placement waits on the Fremen, and the whole point of the
          wait is that it is somebody ELSE'S answer — so as the Bene Gesserit
          there is no way to reach the unblocked control from one browser. This
          applies the SAME default the clock applies, off the same function the
          server calls, and then the advisor opens exactly as it would live.
          The real six-seat version is ?dune-seats. */}
      {settling && outstanding.some(d => d.kind === 'fremen-placement')
        && seat !== 'fremen' && (
        <button type="button"
          onClick={() => {
            setPlacedForces(f => [...f, ...defaultFremenPlacement('fremen', 'advanced')])
            setOutstanding(o => settle(o, 'fremen-placement', 'fremen'))
          }}
          style={{
            position: 'fixed', left: 12, bottom: 44, zIndex: 5,
            background: '#1b2337', color: '#f0e2bb', border: '1px solid #f0e2bb55',
            borderRadius: 4, padding: '5px 10px', cursor: 'pointer',
            font: '12px Georgia, "Times New Roman", serif',
          }}>let the Fremen answer (their default)</button>
      )}

      {/* The two games, side by side in time. */}
      <label style={{
        position: 'fixed', left: 12, bottom: 10, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        background: '#1b2337', color: '#f0e2bb', border: '1px solid #f0e2bb55',
        borderRadius: 4, padding: '5px 10px', cursor: 'pointer',
        font: '12px Georgia, "Times New Roman", serif',
      }}>
        <input type="checkbox" checked={mode === 'basic'}
          onChange={e => setMode(e.target.checked ? 'basic' : 'advanced')} />
        basic game (one discard pile)
      </label>

      {/* A way back in, since the fixture has no phase that would reopen one. */}
      {!running && (
        <button type="button" onClick={() => setCard(0)}
          style={{
            // Bottom centre, over the board: the right-hand column is the tray now
            // and this was sitting on top of it.
            position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 10, zIndex: 5,
            background: '#1b2337', color: '#f0e2bb', border: '1px solid #f0e2bb55',
            borderRadius: 4, padding: '5px 11px', cursor: 'pointer',
            font: '12px Georgia, "Times New Roman", serif',
          }}>run an auction</button>
      )}
    </>
  )
}
