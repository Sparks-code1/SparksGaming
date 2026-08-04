import type { FactionId } from '@/types/faction'

export interface FactionAbilityOption {
  id: string
  factionId: FactionId
  name: string
  /** Short label shown on selection cards */
  tagline: string
  description: string
  /** Which phase/mechanic this applies to */
  phase: 'combat' | 'draft' | 'fortify' | 'any'
}

export const FACTION_ABILITY_OPTIONS: FactionAbilityOption[] = [
  // ── Die Mechaniker ──────────────────────────────────────────────────────────
  {
    id: 'dm-fortified-hq',
    factionId: 'die-mechaniker',
    name: 'Armored Command',
    tagline: 'HQ fortified with 8+ defenders',
    description: 'When defending your HQ with at least 8 troops, it is always considered fortified: +1 to your highest and lowest die.',
    phase: 'combat',
  },
  {
    id: 'dm-shield-of-6s',
    factionId: 'die-mechaniker',
    name: 'Iron Shield',
    tagline: 'Double-6 defense seals the territory',
    description: 'If you roll double 6s on defense, that territory cannot be attacked again for the rest of that player\'s turn.',
    phase: 'combat',
  },

  // ── Enclave of the Bear ─────────────────────────────────────────────────────
  {
    id: 'bear-subtract-die',
    factionId: 'enclave-of-the-bear',
    name: 'Bear Trap',
    tagline: "Defender's lowest die −1 in the first territory you attack",
    description: 'In the first territory you attack during your turn, the defender subtracts 1 from their lowest defense die on every roll until it falls (minimum 1).',
    phase: 'combat',
  },
  {
    id: 'bear-triple-kill',
    factionId: 'enclave-of-the-bear',
    name: 'Berserker Rage',
    tagline: 'Three of a kind attack wipes the territory',
    description: 'When you attack and roll three of a kind AND deal at least 1 kill, the entire defending army is immediately eliminated.',
    phase: 'combat',
  },

  // ── Imperial Balkania ────────────────────────────────────────────────────────
  {
    id: 'balk-expansion-card',
    factionId: 'imperial-balkania',
    name: 'Imperial Expansion',
    tagline: 'Extra card on 4th expansion in a turn',
    description: 'When you expand into your 4th territory in a single turn — whether by conquering an enemy or moving into an unoccupied territory — you immediately draw a territory card or coin card of your choice.',
    phase: 'combat',
  },
  {
    id: 'balk-round-up',
    factionId: 'imperial-balkania',
    name: 'Imperial Levy',
    tagline: 'Round up draft troop calculation',
    description: 'When calculating your draft troops, always round up (e.g. 7 territories = 3 troops instead of 2).',
    phase: 'draft',
  },

  // ── Khan Industries ──────────────────────────────────────────────────────────
  {
    id: 'khan-hq-troops',
    factionId: 'khan-industries',
    name: 'Strategic Reserve',
    tagline: '+1 troop placed on each HQ you control',
    description: 'At the start of your turn, 1 troop is placed directly onto each HQ territory you control — your own HQ and any you have captured. These troops are placed automatically, not added to your draft pool.',
    phase: 'draft',
  },
  {
    id: 'khan-card-bonus',
    factionId: 'khan-industries',
    name: 'Supply Lines',
    tagline: '+1 troop when card territory is yours',
    description: 'When you draw a territory card, if the territory shown is one you currently own you gain +1 bonus troop this draft.',
    phase: 'draft',
  },

  // ── Saharan Republic ─────────────────────────────────────────────────────────
  {
    id: 'sahara-free-fortify',
    factionId: 'saharan-republic',
    name: 'Desert Network',
    tagline: 'Fortify to any owned territory',
    description: 'You may fortify troops to any territory you own, even if your territories are not connected to each other.',
    phase: 'fortify',
  },
  {
    id: 'sahara-anytime-fortify',
    factionId: 'saharan-republic',
    name: 'Mobile Forces',
    tagline: 'Fortify at any point during your turn',
    description: 'You may make your one fortify move at any point during your turn — during draft, attack, or the normal fortify phase.',
    phase: 'fortify',
  },
]

export function getAbilitiesForFaction(factionId: FactionId): [FactionAbilityOption, FactionAbilityOption] {
  const opts = FACTION_ABILITY_OPTIONS.filter(a => a.factionId === factionId)
  return [opts[0], opts[1]] as [FactionAbilityOption, FactionAbilityOption]
}

export function getAbility(id: string): FactionAbilityOption | undefined {
  return FACTION_ABILITY_OPTIONS.find(a => a.id === id)
}
