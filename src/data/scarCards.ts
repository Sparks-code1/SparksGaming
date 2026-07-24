import type { ScarType } from '@/types/territory'

export type ScarTrigger = 'immediate' | 'capture' | 'eliminate'

export interface ScarCard {
  id: string
  type: ScarType
  name: string
  trigger: ScarTrigger
  triggerDescription: string
  /** 1 = available from game 1; 2 = unlocked game 2 onward */
  availableFromGame: 1 | 2
}

// Active scar cards: 6 game-1 cards + 3 mercenary cards (added when first elimination occurs)
// Mercenary cards are NOT in the initial deck — they're added dynamically via addMercenaryCardsToScardDeck()
export const SCAR_CARDS: ScarCard[] = [
  // ── Game 1 pool (Bunker × 3, Ammo Shortage × 3) ─────────────────────────
  {
    id: 'bunker-1', type: 'fortified', name: 'Bunker',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory you control. Play at the start of any of your turns.',
    availableFromGame: 1,
  },
  {
    id: 'bunker-2', type: 'fortified', name: 'Bunker',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory you control. Play at the start of any of your turns.',
    availableFromGame: 1,
  },
  {
    id: 'bunker-3', type: 'fortified', name: 'Bunker',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory you control. Play at the start of any of your turns.',
    availableFromGame: 1,
  },
  {
    id: 'ammo-shortage-1', type: 'wasteland', name: 'Ammo Shortage',
    trigger: 'immediate',
    triggerDescription: 'Must be placed on a territory before any dice are rolled in that attack.',
    availableFromGame: 1,
  },
  {
    id: 'ammo-shortage-2', type: 'wasteland', name: 'Ammo Shortage',
    trigger: 'immediate',
    triggerDescription: 'Must be placed on a territory before any dice are rolled in that attack.',
    availableFromGame: 1,
  },
  {
    id: 'ammo-shortage-3', type: 'wasteland', name: 'Ammo Shortage',
    trigger: 'immediate',
    triggerDescription: 'Must be placed on a territory before any dice are rolled in that attack.',
    availableFromGame: 1,
  },
  // ── Mercenary pool — added to deck only when first elimination occurs ─────
  {
    id: 'mercenary-1', type: 'mercenary', name: 'Mercenary',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory. The controlling player gains +1 troop here at the end of each of their turns.',
    availableFromGame: 2,
  },
  {
    id: 'mercenary-2', type: 'mercenary', name: 'Mercenary',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory. The controlling player gains +1 troop here at the end of each of their turns.',
    availableFromGame: 2,
  },
  {
    id: 'mercenary-3', type: 'mercenary', name: 'Mercenary',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory. The controlling player gains +1 troop here at the end of each of their turns.',
    availableFromGame: 2,
  },
]

export const MERCENARY_CARD_IDS = ['mercenary-1', 'mercenary-2', 'mercenary-3']

// ── Biohazard scar cards — added to the deck when the 9th minor city is placed ─
// (NOT in the initial deck)
export const BIOHAZARD_SCAR_CARDS: ScarCard[] = [
  {
    id: 'biohazard-1', type: 'biological', name: 'Biohazard',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory. The controlling player loses 1 troop here at the end of each of their turns. At 1 troop the territory becomes unoccupied.',
    availableFromGame: 2,
  },
  {
    id: 'biohazard-2', type: 'biological', name: 'Biohazard',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory. The controlling player loses 1 troop here at the end of each of their turns. At 1 troop the territory becomes unoccupied.',
    availableFromGame: 2,
  },
  {
    id: 'biohazard-3', type: 'biological', name: 'Biohazard',
    trigger: 'immediate',
    triggerDescription: 'Place on any territory. The controlling player loses 1 troop here at the end of each of their turns. At 1 troop the territory becomes unoccupied.',
    availableFromGame: 2,
  },
]

export const BIOHAZARD_CARD_IDS = ['biohazard-1', 'biohazard-2', 'biohazard-3']

// Full combined list including dynamically-added cards (for lookup)
export const ALL_SCAR_CARDS: ScarCard[] = [...SCAR_CARDS, ...BIOHAZARD_SCAR_CARDS]

export function getInitialScarDeck(): string[] {
  return SCAR_CARDS.filter(c => c.availableFromGame === 1).map(c => c.id)
}

export function getScarCard(id: string): ScarCard | undefined {
  return ALL_SCAR_CARDS.find(c => c.id === id)
}

export function getEligibleCardIds(gameNumber: number, remainingDeckIds: string[] | undefined | null): string[] {
  const deck = remainingDeckIds ?? getInitialScarDeck()
  // Game 1: only game-1 cards; Game 2+: all cards currently in the deck are eligible
  const maxAvail = gameNumber <= 1 ? 1 : 2
  return deck.filter(id => {
    const card = getScarCard(id)
    return card && card.availableFromGame <= maxAvail
  })
}

export interface DealResult {
  deals: Array<{ cardId: string; playerId: string }>
  newDeckIds: string[]
}

/** Deal one scar card per player from the eligible pool using a random seed. */
export function dealScarCards(
  playerIds: string[],
  gameNumber: number,
  remainingDeckIds: string[] | undefined | null,
  seed: number,
): DealResult {
  const deck = remainingDeckIds ?? getInitialScarDeck()
  const eligible = getEligibleCardIds(gameNumber, deck)
  // If there aren't enough cards to give one to every player, deal none
  if (eligible.length < playerIds.length || playerIds.length === 0) {
    return { deals: [], newDeckIds: deck }
  }

  // Seeded Fisher-Yates shuffle
  const shuffled = [...eligible]
  let s = seed >>> 0
  const rand = () => { s = ((s * 1664525) + 1013904223) >>> 0; return s / 0xFFFFFFFF }
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const deals: Array<{ cardId: string; playerId: string }> = []
  const usedIds = new Set<string>()
  for (let i = 0; i < playerIds.length && i < shuffled.length; i++) {
    deals.push({ cardId: shuffled[i], playerId: playerIds[i] })
    usedIds.add(shuffled[i])
  }

  return {
    deals,
    newDeckIds: deck.filter(id => !usedIds.has(id)),
  }
}
