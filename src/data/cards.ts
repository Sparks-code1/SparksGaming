import type { TerritoryCard, MissionCard, EventCard, CoinCard, Card, CardSuit } from '@/types/card'
import type { GameState } from '@/types/game'
import { TERRITORY_DEFINITIONS } from './territoryData'

// ─── Symbol assignment ────────────────────────────────────────────────────────
// 42 territories → 14 infantry, 14 cavalry, 14 artillery (index % 3)
const SUIT_CYCLE: CardSuit[] = ['soldiers', 'cavalry', 'artillery']

// ─── Territory cards (42) ─────────────────────────────────────────────────────
export const TERRITORY_CARDS: TerritoryCard[] = TERRITORY_DEFINITIONS.map((def, i) => ({
  kind: 'territory' as const,
  id: `tc-${def.id}`,
  suit: SUIT_CYCLE[i % 3],
  territoryId: def.id,
}))

// ─── Mission cards (8) — 6 standard (1★, repeatable) + 2 special (2★, destroyed) ──
export const MISSION_CARDS: MissionCard[] = [
  // ── Standard missions (1 Red Star, repeatable) ────────────────────────────
  {
    kind: 'mission', id: 'mc-6-cities',
    name: 'City Domination',
    type: 'control-cities',
    description: 'Control 6 or more cities.',
    stars: 1, singleUse: false, completed: false,
  },
  {
    kind: 'mission', id: 'mc-4-cities-turn',
    name: 'City Blitz',
    type: 'conquer-cities-turn',
    description: 'Conquer 4 or more cities this turn. (Conquer = taken by combat only.)',
    stars: 1, singleUse: false, completed: false,
  },
  {
    kind: 'mission', id: 'mc-9-territories-turn',
    name: 'Grand Conquest',
    type: 'conquer-territories-turn',
    description: 'Conquer 9 or more territories this turn. (Conquer = taken by combat only.)',
    stars: 1, singleUse: false, completed: false,
  },
  {
    kind: 'mission', id: 'mc-4-sea-turn',
    name: 'Naval Assault',
    type: 'conquer-sea-turn',
    description: 'Conquer 4 or more territories over sea lines this turn. (Conquer = taken by combat only.)',
    stars: 1, singleUse: false, completed: false,
  },
  {
    kind: 'mission', id: 'mc-continent-turn',
    name: 'Continental Sweep',
    type: 'conquer-continent-turn',
    description: 'Conquer all territories of one continent this turn. You must control all of them at turn end. (Conquer = taken by combat.)',
    stars: 1, singleUse: false, completed: false,
  },
  {
    kind: 'mission', id: 'mc-7-continent-bonus',
    name: 'Imperial Hold',
    type: 'continent-bonus',
    description: 'Have a total continent bonus of 7 or more troops.',
    stars: 1, singleUse: false, completed: false,
  },
  // ── Special missions (2 Red Stars, single use — destroyed when completed) ─
  {
    kind: 'mission', id: 'mc-world-capital',
    name: 'World Capital',
    type: 'world-capital',
    description: 'Earn a card draw while eligible to take a card worth 4 or more coins. You forgo that card — instead take 2 Red Stars and found the World Capital on that card’s territory, replacing any city there.',
    stars: 2, singleUse: true, completed: false,
  },
  {
    kind: 'mission', id: 'mc-7-islands',
    name: 'Island Empire',
    type: 'island-territories',
    description: 'Control 7 or more islands (Indonesia, New Guinea, Japan, Madagascar, Greenland, Iceland, Gr. Britain — and Alien Island once placed), then place a new sea line between any two coastal territories.',
    stars: 2, singleUse: true, completed: false,
  },
]

/**
 * Private missions — sealed until the World Capital is placed, then shuffled
 * into the same mission deck as the standard ones (so the face-up card may be
 * either kind).
 *
 * Each awards 1 red star AND permanently grants the completing faction that
 * mission as a STAR POWER, after which the card is destroyed so no other
 * faction can ever claim it. A faction holding a star power may re-complete
 * that same mission for 1 extra red star once per game.
 */
export const PRIVATE_MISSION_CARDS: MissionCard[] = [
  {
    kind: 'mission', id: 'pm-advanced-tactics',
    name: 'Advanced Tactics',
    type: 'private-rich-trade',
    description: 'When recruiting troops, turn in at least 2 territory cards that each have 4 or more resources.',
    stars: 1, singleUse: true, completed: false,
  },
  {
    kind: 'mission', id: 'pm-advanced-training',
    name: 'Advanced Training',
    type: 'private-bulk-trade',
    description: 'When recruiting troops, turn in 10 or more total resources for troops.',
    stars: 1, singleUse: true, completed: false,
  },
  {
    kind: 'mission', id: 'pm-forced-occupation',
    name: 'Forced Occupation',
    type: 'private-knockout',
    description: 'Knock out or eliminate a player who holds a card with 3 or more resources.',
    stars: 1, singleUse: true, completed: false,
  },
  {
    kind: 'mission', id: 'pm-guerrilla-warfare',
    name: 'Guerrilla Warfare',
    type: 'private-scar-control',
    description: 'Control every Bunker and Mercenary territory on the board.',
    stars: 1, singleUse: true, completed: false,
  },
  {
    kind: 'mission', id: 'pm-urban-troop-surge',
    name: 'Urban Troop Surge',
    type: 'private-urban-surge',
    description: 'Control the World Capital and 3 major cities.',
    stars: 1, singleUse: true, completed: false,
  },
  {
    kind: 'mission', id: 'pm-wide-border',
    name: 'Wide Border',
    type: 'private-two-continents',
    description: 'Control 2 whole continents at the start of your turn.',
    stars: 1, singleUse: true, completed: false,
  },
]

export const PRIVATE_MISSION_IDS = PRIVATE_MISSION_CARDS.map(m => m.id)
export const isPrivateMission = (id: string) => PRIVATE_MISSION_IDS.includes(id)

/**
 * Factions that already own a built-in star power (the red slot on their
 * faction card) and therefore cannot claim one from a private mission.
 * They may still COMPLETE the mission for its red star — the card is then
 * reshuffled into the deck rather than destroyed, so another faction can
 * still claim the power.
 */
export const STAR_POWER_EXCLUDED_FACTIONS = new Set(['aliens', 'mutants'])
export const canClaimStarPower = (factionId: string) => !STAR_POWER_EXCLUDED_FACTIONS.has(factionId)

/**
 * Shuffle the private missions into an existing mission deck — called once,
 * when the World Capital is placed. Already-destroyed missions (claimed as a
 * star power in an earlier game) are never re-added.
 */
export function seedPrivateMissions(
  deck: string[],
  destroyedMissionIds: string[],
  seedText: string,
): string[] {
  const destroyed = new Set(destroyedMissionIds)
  const additions = PRIVATE_MISSION_IDS.filter(id => !destroyed.has(id) && !deck.includes(id))
  if (additions.length === 0) return deck
  let seed = 0
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0
  return seededShuffle([...deck, ...additions], seed)
}

// ─── Event cards (8 base + 7 unlocked after 9th minor city) ─────────────────
export const EVENT_CARDS: EventCard[] = [
  {
    kind: 'event', id: 'ec-boom',
    name: 'Population Boom',
    description: 'Every player receives 3 bonus troops during this round\'s draft phase.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-ammo',
    name: 'Ammunition Shortage',
    description: 'The defender\'s highest die is reduced by 1 for all attacks this round.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-ceasefire',
    name: 'Ceasefire',
    description: 'No attacks may be launched this round. All players skip the attack phase.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-arms-race',
    name: 'Arms Race',
    description: 'The player controlling the fewest territories receives 4 bonus troops during draft.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-epidemic',
    name: 'Epidemic',
    description: 'Every territory bearing a Biohazard scar immediately loses 1 troop (minimum 1).',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-fallout',
    name: 'Nuclear Fallout',
    description: 'Radioactive clouds drift across the board. Any attack or defense on a territory with Nuclear Fallout or Radiation scar costs 1 extra troop loss this round.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-march',
    name: 'Forced March',
    description: 'Each player may make up to 2 fortify moves this round instead of 1.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-famine',
    name: 'Famine',
    description: 'Territories in Africa each lose 1 troop immediately (minimum 1).',
    removeAfterUse: false,
  },
]

// ─── 9th-city event cards (added to event deck once ninthCityUnlocked is true) ─
export const NINTH_CITY_EVENT_CARDS: EventCard[] = [
  {
    kind: 'event', id: 'ec-fortify-1',
    name: 'Fortify',
    description: 'The player with the largest population chooses one: add 2 troops to each of 2 different cities they control, OR permanently fortify one city they control. The fortification needs one of the campaign’s 5 fortifications to be left — taking it DESTROYS this card for the whole campaign. Taking the troops only discards it, and it returns in later games.',
    // Conditionally destroyed, so this stays TRUE — same as Die Humans. It
    // keeps the DRAW from auto-discarding; the handler then either destroys the
    // card (fortification taken) or returns it to the discard itself (troops).
    // With false, the draw discards AND the troops path discards, and the card
    // comes round twice in one game.
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-fortify-2',
    name: 'Fortify',
    description: 'The player with the largest population chooses one: add 2 troops to each of 2 different cities they control, OR permanently fortify one city they control. The fortification needs one of the campaign’s 5 fortifications to be left — taking it DESTROYS this card for the whole campaign. Taking the troops only discards it, and it returns in later games.',
    // Conditionally destroyed, so this stays TRUE — same as Die Humans. It
    // keeps the DRAW from auto-discarding; the handler then either destroys the
    // card (fortification taken) or returns it to the discard itself (troops).
    // With false, the draw discards AND the troops path discards, and the card
    // comes round twice in one game.
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-control-1',
    name: 'Control the People',
    description: 'The player with the largest population chooses one: gain 5 troops in any one city they control, OR make one immediate maneuver. This card is removed from the game after use.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-control-2',
    name: 'Control the People',
    description: 'The player with the largest population chooses one: gain 5 troops in any one city they control, OR make one immediate maneuver. This card is removed from the game after use.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-riot',
    name: 'Riot',
    description: 'Every major city rolls 1 die, adding 1 for each troop and each HQ standing on it. If the modified roll is less than 6, that city loses troops equal to the NATURAL die roll and any HQ there is demolished. A city that loses its last troop becomes uncontrolled.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-resistance-1',
    name: 'Resistance',
    description: 'Every minor city holding 1 or 2 troops loses 1 troop. A city reduced to 0 becomes uncontrolled. This card is removed from the game after use.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-resistance-2',
    name: 'Resistance',
    description: 'Every minor city holding 1 or 2 troops loses 1 troop. A city reduced to 0 becomes uncontrolled. This card is removed from the game after use.',
    removeAfterUse: true,
  },
]

export const NINTH_CITY_EVENT_CARD_IDS = NINTH_CITY_EVENT_CARDS.map(c => c.id)

// ─── Double-winner milestone event cards — added when a player wins twice ─────
export const DOUBLE_WINNER_EVENT_CARDS: EventCard[] = [
  {
    kind: 'event', id: 'ec-join-cause-1',
    name: 'Join the Cause',
    description: 'The player with the largest population (territories + 1 per minor city + 2 per major city) either gains 3 troops placed in any cities they control, OR replaces their active mission with any available mission of their choice.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-join-cause-2',
    name: 'Join the Cause',
    description: 'The player with the largest population (territories + 1 per minor city + 2 per major city) either gains 3 troops placed in any cities they control, OR replaces their active mission with any available mission of their choice.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-join-cause-3',
    name: 'Join the Cause',
    description: 'The player with the largest population (territories + 1 per minor city + 2 per major city) either gains 3 troops placed in any cities they control, OR replaces their active mission with any available mission of their choice.',
    removeAfterUse: false,
  },
]

export const DOUBLE_WINNER_EVENT_CARD_IDS = DOUBLE_WINNER_EVENT_CARDS.map(c => c.id)

// ─── Alien Invasion Milestone event cards (unlocked when alienMilestoneTriggered) ──
export const ALIEN_INVASION_EVENT_CARDS: EventCard[] = [
  {
    kind: 'event', id: 'ec-die-humans-1', name: 'Die Humans',
    description: 'The Alien player may replace a minor city with this card\'s Ruin sticker. Remove all troops from the Ruin, demolish any HQ there, destroy any fortification, and DESTROY this card. Ruins are not cities and may not be fortified, but new cities may be built atop them.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-die-humans-2', name: 'Die Humans',
    description: 'The Alien player may replace a minor city with this card\'s Ruin sticker. Remove all troops from the Ruin, demolish any HQ there, destroy any fortification, and DESTROY this card. Ruins are not cities and may not be fortified, but new cities may be built atop them.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-die-humans-3', name: 'Die Humans',
    description: 'The Alien player may replace a minor city with this card\'s Ruin sticker. Remove all troops from the Ruin, demolish any HQ there, destroy any fortification, and DESTROY this card. Ruins are not cities and may not be fortified, but new cities may be built atop them.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-beam-down-1', name: 'Beam Down',
    description: 'The Aliens place 5 troops into any unoccupied city on the board. Unlike similar events, the Aliens get the benefit of this whether or not they have a population edge.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-beam-down-2', name: 'Beam Down',
    description: 'The Aliens place 5 troops into any unoccupied city on the board. Unlike similar events, the Aliens get the benefit of this whether or not they have a population edge.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-mysterious-island-1', name: 'Mysterious Island',
    description: 'The controller of Alien Island immediately draws a face-up territory card from the sideboard. This is an exception to the "one card draw per turn" rule — it can trigger immediately after a conquest draw, and can even chain into another Mysterious Island event.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-mysterious-island-2', name: 'Mysterious Island',
    description: 'The controller of Alien Island immediately draws a face-up territory card from the sideboard. This is an exception to the "one card draw per turn" rule — it can trigger immediately after a conquest draw, and can even chain into another Mysterious Island event.',
    removeAfterUse: false,
  },
]

export const ALIEN_INVASION_EVENT_CARD_IDS = ALIEN_INVASION_EVENT_CARDS.map(c => c.id)

// ─── Nuclear Milestone event cards (unlocked when nuclearMilestoneTriggered) ──
export const NUCLEAR_EVENT_CARDS: EventCard[] = [
  {
    kind: 'event', id: 'ec-fallout-1', name: 'Fallout',
    description: 'Remove 1 die of troops from each territory connected to the Fallout Zone by land. DESTROY this card after use.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-fallout-2', name: 'Fallout',
    description: 'Remove 1 die of troops from each territory connected to the Fallout Zone by land. DESTROY this card after use.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-fallout-3', name: 'Fallout',
    description: 'Remove 1 die of troops from each territory connected to the Fallout Zone by land. DESTROY this card after use.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-agent-of-chaos-1', name: 'Agent of Chaos',
    description: 'If no human faction has a continent bonus, the Mutants get one Red Star token.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-agent-of-chaos-2', name: 'Agent of Chaos',
    description: 'If no human faction has a continent bonus, the Mutants get one Red Star token.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-agent-of-chaos-3', name: 'Agent of Chaos',
    description: 'If no human faction has a continent bonus, the Mutants get one Red Star token.',
    removeAfterUse: false,
  },
  {
    kind: 'event', id: 'ec-mutants-evolve-1', name: 'The Mutants Evolve',
    description: 'The Mutants choose between Offensive/Defensive and Brains/Brawn. The pairing reveals a permanent new Mutant power — the symbols are secret until after you\'ve chosen.',
    removeAfterUse: true,
  },
  {
    kind: 'event', id: 'ec-mutants-evolve-2', name: 'The Mutants Evolve',
    description: 'The Mutants choose between Offensive/Defensive and Brains/Brawn. The pairing reveals a permanent new Mutant power — the symbols are secret until after you\'ve chosen.',
    removeAfterUse: true,
  },
]

export const NUCLEAR_EVENT_CARD_IDS = NUCLEAR_EVENT_CARDS.map(c => c.id)

// ─── Resource cards (10 base + 1 Alien Island) ────────────────────────────────
export const COIN_CARDS: CoinCard[] = Array.from({ length: 10 }, (_, i) => ({
  kind: 'coin' as const,
  id: `resource-${i + 1}`,
  suit: 'wild' as const,
}))

/** Special Alien Island resource card — added to the resource deck after alien milestone */
export const ALIEN_ISLAND_CARD_ID = 'resource-alien-island'
export const ALIEN_ISLAND_COIN_CARD: CoinCard = {
  kind: 'coin' as const,
  id: ALIEN_ISLAND_CARD_ID,
  suit: 'wild' as const,
}

// ─── Event effects (mechanical) ───────────────────────────────────────────────
export type EventEffect =
  | { kind: 'population-boom'; bonusTroops: number }
  | { kind: 'ammunition-shortage' }
  | { kind: 'ceasefire' }
  | { kind: 'arms-race'; bonusTroops: number }
  | { kind: 'epidemic' }
  | { kind: 'nuclear-fallout-round' }
  | { kind: 'forced-march' }
  | { kind: 'famine' }
  | { kind: 'fortify-city'; troops: number }
  | { kind: 'control-the-people' }
  | { kind: 'riot' }
  | { kind: 'resistance'; troops: number }
  | { kind: 'join-the-cause' }
  | { kind: 'die-humans' }
  | { kind: 'beam-down'; troops: number }
  | { kind: 'mysterious-island' }
  | { kind: 'fallout-event' }
  | { kind: 'agent-of-chaos' }
  | { kind: 'mutants-evolve' }

export const EVENT_EFFECTS: Record<string, EventEffect> = {
  'ec-boom':        { kind: 'population-boom', bonusTroops: 3 },
  'ec-ammo':        { kind: 'ammunition-shortage' },
  'ec-ceasefire':   { kind: 'ceasefire' },
  'ec-arms-race':   { kind: 'arms-race', bonusTroops: 4 },
  'ec-epidemic':    { kind: 'epidemic' },
  'ec-fallout':     { kind: 'nuclear-fallout-round' },
  'ec-march':       { kind: 'forced-march' },
  'ec-famine':      { kind: 'famine' },
  'ec-fortify-1':   { kind: 'fortify-city', troops: 2 },
  'ec-fortify-2':   { kind: 'fortify-city', troops: 2 },
  'ec-control-1':   { kind: 'control-the-people' },
  'ec-control-2':   { kind: 'control-the-people' },
  'ec-riot':        { kind: 'riot' },
  'ec-resistance-1':  { kind: 'resistance', troops: 3 },
  'ec-resistance-2':  { kind: 'resistance', troops: 3 },
  'ec-join-cause-1':  { kind: 'join-the-cause' },
  'ec-join-cause-2':  { kind: 'join-the-cause' },
  'ec-join-cause-3':  { kind: 'join-the-cause' },
  'ec-die-humans-1':  { kind: 'die-humans' },
  'ec-die-humans-2':  { kind: 'die-humans' },
  'ec-die-humans-3':  { kind: 'die-humans' },
  'ec-beam-down-1':   { kind: 'beam-down', troops: 5 },
  'ec-beam-down-2':   { kind: 'beam-down', troops: 5 },
  'ec-mysterious-island-1': { kind: 'mysterious-island' },
  'ec-mysterious-island-2': { kind: 'mysterious-island' },
  'ec-fallout-1':           { kind: 'fallout-event' },
  'ec-fallout-2':           { kind: 'fallout-event' },
  'ec-fallout-3':           { kind: 'fallout-event' },
  'ec-agent-of-chaos-1':    { kind: 'agent-of-chaos' },
  'ec-agent-of-chaos-2':    { kind: 'agent-of-chaos' },
  'ec-agent-of-chaos-3':    { kind: 'agent-of-chaos' },
  'ec-mutants-evolve-1':    { kind: 'mutants-evolve' },
  'ec-mutants-evolve-2':    { kind: 'mutants-evolve' },
}

// ─── Lookup ───────────────────────────────────────────────────────────────────
const _all: Card[] = [...TERRITORY_CARDS, ...MISSION_CARDS, ...PRIVATE_MISSION_CARDS, ...EVENT_CARDS, ...NINTH_CITY_EVENT_CARDS, ...DOUBLE_WINNER_EVENT_CARDS, ...ALIEN_INVASION_EVENT_CARDS, ...NUCLEAR_EVENT_CARDS, ...COIN_CARDS, ALIEN_ISLAND_COIN_CARD]
export const CARD_LOOKUP = new Map<string, Card>(_all.map(c => [c.id, c]))

export function getCard(id: string): Card | undefined {
  return CARD_LOOKUP.get(id)
}

export function getTerritoryCard(id: string): TerritoryCard | undefined {
  const c = CARD_LOOKUP.get(id)
  return c?.kind === 'territory' ? c : undefined
}

export function getMissionCard(id: string): MissionCard | undefined {
  const c = CARD_LOOKUP.get(id)
  return c?.kind === 'mission' ? c : undefined
}

export function getEventCard(id: string): EventCard | undefined {
  const c = CARD_LOOKUP.get(id)
  return c?.kind === 'event' ? c : undefined
}

// ─── Deck building ────────────────────────────────────────────────────────────

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed >>> 0
  const rand = () => { s = ((s * 1664525) + 1013904223) >>> 0; return s / 0xFFFFFFFF }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Unbiased Fisher–Yates shuffle on a fresh array.
 *
 * Use this rather than `sort(() => Math.random() - 0.5)`: an inconsistent
 * comparator gives a badly skewed distribution, so cards near where they started
 * tend to stay there — the discard pile comes back in almost the order it went in.
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * A fresh unpredictable seed for one game's deal.
 *
 * Deck order used to come from the game number alone, which meant game 5 dealt
 * the same events, missions and face-up cards in every campaign and again on
 * every restart — the cards were effectively face up to anyone who had played
 * that game before. The seed is generated once per deal and stored on the card
 * state, so the deal survives a reload without ever being guessable in advance.
 */
export function newDealSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1)
    c.getRandomValues(buf)
    return buf[0] >>> 0
  }
  return (Math.random() * 0x100000000) >>> 0
}

export function buildTerritoryDeck(seed: number): string[] {
  return seededShuffle(TERRITORY_CARDS.map(c => c.id), seed)
}

export function buildEventDeck(
  seed: number,
  opts?: {
    eventsUnlocked?: boolean
    ninthCityUnlocked?: boolean
    doubleWinnerMilestoneTriggered?: boolean
    alienMilestoneTriggered?: boolean
    nuclearMilestoneTriggered?: boolean
    destroyedEventCardIds?: string[]
  },
): string[] {
  // Base event cards removed from play entirely
  const ninth   = opts?.ninthCityUnlocked ? NINTH_CITY_EVENT_CARD_IDS : []
  const double  = opts?.doubleWinnerMilestoneTriggered ? DOUBLE_WINNER_EVENT_CARD_IDS : []
  const alien   = opts?.alienMilestoneTriggered ? ALIEN_INVASION_EVENT_CARD_IDS : []
  const nuclear = opts?.nuclearMilestoneTriggered ? NUCLEAR_EVENT_CARD_IDS : []
  const destroyed = new Set(opts?.destroyedEventCardIds ?? [])
  const pool = [...ninth, ...double, ...alien, ...nuclear].filter(id => !destroyed.has(id))
  return seededShuffle(pool, seed)
}

/**
 * The mission deck for a new game.
 *
 * Once the World Capital has been placed, the six private missions are part of
 * the deck for the REST of the campaign — not just the game they were unlocked
 * in. `seedPrivateMissions` shuffles them into the live deck at the moment the
 * World Capital lands, and `privateMissionsSeeded` then blocks it from ever
 * running again; but every new game rebuilds the deck from here, and this only
 * knew about MISSION_CARDS. So the private missions appeared for the remainder
 * of one game and silently vanished from the campaign at the next new game.
 *
 * Claimed ones are already recorded in `destroyedMissionIds`, so the same
 * filter that retires a used single-use mission keeps them out.
 */
export function buildMissionDeck(
  seed: number,
  opts?: {
    doubleWinnerMilestoneTriggered?: boolean
    destroyedMissionIds?: string[]
    /** True once the World Capital has been placed — unlocks the private missions. */
    privateMissionsSeeded?: boolean
  },
): string[] {
  if (!opts?.doubleWinnerMilestoneTriggered) return []
  const destroyed = new Set(opts?.destroyedMissionIds ?? [])
  const cards = opts?.privateMissionsSeeded
    ? [...MISSION_CARDS, ...PRIVATE_MISSION_CARDS]
    : MISSION_CARDS
  const pool = cards.filter(m => !destroyed.has(m.id)).map(m => m.id)
  return seededShuffle(pool, seed)
}

// ─── Trade-in ─────────────────────────────────────────────────────────────────

// Troops earned per total coins spent: index 0 = 2 coins, index 1 = 3 coins, …
export const CARD_TRADE_IN_VALUES = [2, 4, 7, 10, 13, 17, 21, 25, 30]

/** Returns the troop reward for spending totalCoins, or null if below minimum (2). */
export function coinTradeInTroops(totalCoins: number): number | null {
  if (totalCoins < 2) return null
  return CARD_TRADE_IN_VALUES[Math.min(totalCoins - 2, CARD_TRADE_IN_VALUES.length - 1)]
}

const TRADE_IN_VALUES: Record<string, number> = {
  'soldiers-soldiers-soldiers': 4,
  'cavalry-cavalry-cavalry':    6,
  'artillery-artillery-artillery': 8,
  'mixed': 10,  // one of each suit
}

export interface TradeSet {
  cardIds: string[]
  suits: CardSuit[]
  bonus: number
  label: string
}

/** Find the best trade-in set from a player's hand, or null if none valid. */
export function findBestTradeIn(handIds: string[]): TradeSet | null {
  const cards = handIds.map(id => getTerritoryCard(id)).filter(Boolean) as TerritoryCard[]
  if (cards.length < 3) return null

  // Check for one-of-each (worth most)
  const soldiers  = cards.filter(c => c.suit === 'soldiers')
  const cavalry   = cards.filter(c => c.suit === 'cavalry')
  const artillery = cards.filter(c => c.suit === 'artillery')

  if (soldiers.length >= 1 && cavalry.length >= 1 && artillery.length >= 1) {
    return {
      cardIds: [soldiers[0].id, cavalry[0].id, artillery[0].id],
      suits: ['soldiers', 'cavalry', 'artillery'],
      bonus: 10,
      label: '1 of each — +10 troops',
    }
  }

  // Check for 3 artillery (highest of same-suit)
  if (artillery.length >= 3) {
    return {
      cardIds: artillery.slice(0, 3).map(c => c.id),
      suits: ['artillery', 'artillery', 'artillery'],
      bonus: 8,
      label: '3 Artillery — +8 troops',
    }
  }

  // Check for 3 cavalry
  if (cavalry.length >= 3) {
    return {
      cardIds: cavalry.slice(0, 3).map(c => c.id),
      suits: ['cavalry', 'cavalry', 'cavalry'],
      bonus: 6,
      label: '3 Cavalry — +6 troops',
    }
  }

  // Check for 3 infantry
  if (soldiers.length >= 3) {
    return {
      cardIds: soldiers.slice(0, 3).map(c => c.id),
      suits: ['soldiers', 'soldiers', 'soldiers'],
      bonus: 4,
      label: '3 Infantry — +4 troops',
    }
  }

  return null
}

// ─── Mission completion checks ────────────────────────────────────────────────

const CONTINENT_SIZES: Record<string, number> = {
  'north-america': 9,
  'south-america': 4,
  'europe': 7,
  'africa': 6,
  'asia': 12,
  'australia': 4,
}

export function checkMissionComplete(missionId: string, gameState: GameState, playerId: string): boolean {
  const territories = Object.values(gameState.territories)
  const owned = territories.filter(t => t.occupyingPlayerId === playerId)

  switch (missionId) {
    case 'mc-asia': {
      const asiaOwned = owned.filter(t => t.continentId === 'asia').length
      return asiaOwned >= CONTINENT_SIZES['asia']
    }
    case 'mc-americas': {
      const naOwned = owned.filter(t => t.continentId === 'north-america').length
      const saOwned = owned.filter(t => t.continentId === 'south-america').length
      return naOwned >= CONTINENT_SIZES['north-america'] && saOwned >= CONTINENT_SIZES['south-america']
    }
    case 'mc-europe': {
      const euOwned = owned.filter(t => t.continentId === 'europe').length
      return euOwned >= CONTINENT_SIZES['europe']
    }
    case 'mc-4-continents': {
      const continentControl = Object.entries(CONTINENT_SIZES).filter(([cont, size]) =>
        owned.filter(t => t.continentId === cont).length >= size,
      )
      return continentControl.length >= 4
    }
    case 'mc-24-territories': {
      return owned.length >= 24
    }
    case 'mc-2-hqs': {
      // Check if player has captured 2 HQs (cities with headquartersFactionId belonging to others)
      const capturedHqs = owned.reduce((count, t) => {
        const hqCities = t.cities.filter(
          c => c.headquartersFactionId && c.headquartersFactionId !== playerId && !c.isDestroyed,
        )
        return count + hqCities.length
      }, 0)
      return capturedHqs >= 2
    }
    default:
      return false
  }
}

// ─── Card persistence shape (stored in LegacyState.activeGameCards) ──────────
export interface ActiveGameCards {
  gameNumber: number
  territoryDeck: string[]
  territoryDiscard: string[]
  eventDeck: string[]
  eventDiscard: string[]
  playerHands: Record<string, string[]>    // playerId → territory card IDs
  playerMissions: Record<string, string>   // legacy field — unused since missions became shared
  missionDeck: string[]
  /** The single shared face-up mission — any player may complete it at the end
   *  of their turn (one per turn; not on a turn they drew a card) */
  currentMissionId?: string | null
  /** 4 face-up Territory card IDs (from the 42-card territory deck) */
  sideboard: string[]
  /** Separate resource pile — 10 cards; drawn when player controls none of the 4 face-up territories.
   *  When this pile hits 0, the player with the most territories earns a Red Star. */
  resourceDeck: string[]
  /** Legacy alias kept for migration; prefer resourceDeck */
  coinDeck?: string[]
  /** Set once the pile has emptied and the Red Star been resolved. Traded-in
   *  coins return to the pile, so it can empty more than once in a game — but
   *  the star is claimed only on the first emptying. Absent on old saves,
   *  which is correct: they predate any award. */
  resourceStarAwarded?: boolean
  /** Seed this game's decks were shuffled from. Stored so a migration that has to
   *  rebuild a missing pile reproduces THIS deal instead of dealing a new one.
   *  Absent on saves made before deals became random. */
  dealSeed?: number
}

export function buildInitialGameCards(
  gameNumber: number,
  opts?: {
    eventsUnlocked?: boolean
    ninthCityUnlocked?: boolean
    doubleWinnerMilestoneTriggered?: boolean
    alienMilestoneTriggered?: boolean
    nuclearMilestoneTriggered?: boolean
    destroyedEventCardIds?: string[]
    destroyedMissionIds?: string[]
    privateMissionsSeeded?: boolean
  },
  /** Omit for a fresh random deal; pass a stored `dealSeed` to reproduce one. */
  seed: number = newDealSeed(),
): ActiveGameCards {
  const deck = buildTerritoryDeck(seed)
  const sideboard = deck.splice(0, 4)
  const resourceDeck = [
    ...COIN_CARDS.map(c => c.id),
    ...(opts?.alienMilestoneTriggered ? [ALIEN_ISLAND_CARD_ID] : []),
  ]
  return {
    gameNumber,
    territoryDeck: deck,
    territoryDiscard: [],
    eventDeck: buildEventDeck(seed ^ 0xf00dcafe, opts),
    eventDiscard: [],
    playerHands: {},
    playerMissions: {},
    missionDeck: buildMissionDeck(seed ^ 0xc0ffee, opts),
    currentMissionId: null,
    sideboard,
    resourceDeck,
    dealSeed: seed,
  }
}

/** Add getCoinCard lookup helper */
export function getCoinCard(id: string): CoinCard | undefined {
  const c = CARD_LOOKUP.get(id)
  return c?.kind === 'coin' ? c : undefined
}

export { TRADE_IN_VALUES }
