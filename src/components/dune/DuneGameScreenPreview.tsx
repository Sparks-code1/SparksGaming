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
import type { DuneGameState, GameMode } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
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

export default function DuneGameScreenPreview() {
  const q = new URLSearchParams(window.location.search)
  const [now, setNow] = useState(() => Date.now())
  // The panel's clock is injected, so something has to drive it. Once a second
  // is enough for a countdown shown in whole seconds.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const auction = q.get('auction') !== 'off'
  const mode = (q.get('mode') === 'basic' ? 'basic' : 'advanced') as GameMode
  const seat = q.get('seat') === 'none' ? null : ((q.get('seat') ?? 'atreides') as FactionId)

  return (
    <DuneGameScreen
      state={{ ...STATE, mode }}
      seat={seat}
      own={seat ? OWN : null}
      chat={CHAT}
      onSend={seat ? () => {} : undefined}
      bidding={auction ? { ...BIDDING, closesAt: now + 9_000 } : null}
      now={now} />
  )
}
