export type CardSuit = 'soldiers' | 'cavalry' | 'artillery' | 'wild'

export type MissionType =
  | 'control-cities'
  | 'conquer-cities-turn'
  | 'conquer-territories-turn'
  | 'conquer-sea-turn'
  | 'conquer-continent-turn'
  | 'continent-bonus'
  | 'world-capital'
  | 'island-territories'
  // legacy types kept for backward compatibility with existing saved games
  | 'control-continent'
  | 'control-territories'
  | 'eliminate-player'

export interface TerritoryCard {
  kind: 'territory'
  id: string
  suit: CardSuit
  territoryId: string
  /** Some territory cards gain a bonus sticker after a legacy event */
  bonusStickerId?: string
}

export interface MissionCard {
  kind: 'mission'
  id: string
  name: string
  type: MissionType
  description: string
  /** Red stars awarded on completion: 1 = standard (repeatable), 2 = special (destroyed) */
  stars: 1 | 2
  /** If true the card is permanently removed from the campaign when completed */
  singleUse: boolean
  completed: boolean
}

export interface EventCard {
  kind: 'event'
  id: string
  name: string
  description: string
  removeAfterUse: boolean
}

export interface CoinCard {
  kind: 'coin'
  id: string
  suit: 'wild'
}

export type Card = TerritoryCard | MissionCard | EventCard | CoinCard
