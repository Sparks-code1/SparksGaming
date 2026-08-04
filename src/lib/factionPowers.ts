import { WEAKNESS_POWERS } from '@/data/weaknessPowers'
import { getAbilitiesForFaction, getAbility } from '@/data/factionAbilities'
import { COMEBACK_POWERS } from '@/components/ComebackPowerModal'
import { CARD_LOOKUP } from '@/data/cards'
import type { MissionCard } from '@/types/card'
import type { FactionId } from '@/types/faction'
import type { LegacyState } from '@/types/legacy'

/** One power/mark rendered on a faction card during setup. */
export interface PowerLine { label: string; name: string; description: string; color: string }

export const POWER_BLUE = '#2980b9', POWER_GREEN = '#27ae60', POWER_RED = '#e74c3c'
/**
 * Every weakness reads yellow.
 *
 * Each weakness power used to carry its own accent, so five of them appeared in
 * five different colours — orange, blue, purple, red, grey — and none of them
 * looked like a drawback. Blue and red in particular are what comeback and star
 * powers use, so a weakness read as a bonus. One colour for the whole category
 * makes the downside obvious at a glance while drafting.
 */
export const POWER_YELLOW = '#f0c000'

/**
 * Everything a faction carries INTO a new game because of what it did in past
 * ones: the nuclear mark, a claimed star power, comeback powers, and weaknesses.
 *
 * Shared by both setup screens — the draft screen and the faction-pick screen —
 * so a faction's record reads the same wherever you choose it. They used to
 * build these lists separately and the pick screen silently omitted comeback
 * powers entirely.
 */
export function factionCampaignMarks(
  fid: string,
  legacy: LegacyState | null | undefined,
): PowerLine[] {
  // Bringer of Nuclear Fire — permanent campaign mark, shown atop the card
  const bringer: PowerLine[] = fid === legacy?.nuclearBringerFactionId ? [{
    label: '☢ Bringer of Nuclear Fire',
    name: 'Marked Forever',
    description: 'This faction unleashed the nuclear device. In games where the Mutants are playing, it receives 2 bonus missiles.',
    color: POWER_RED,
  }] : []

  if (fid === 'aliens') {
    return [...bringer,
      { label: '★ Star Power', name: 'Domination',           description: 'Controlling every city on the board earns you 2 Red Stars instantly.', color: POWER_RED },
      { label: '↺ Comeback',   name: 'Alien Reinforcements', description: 'When recruiting, gain +2 troops if you control Alien Island and +1 troop for each Ruin you control.', color: POWER_BLUE },
    ]
  }
  if (fid === 'mutants') {
    return [...bringer,
      { label: '★ Star Power', name: 'Wasteland Kings', description: 'Controlling all bio-hazard territories and the Fallout Zone earns you a Red Star.', color: POWER_RED },
      { label: '↺ Comeback',   name: 'Nuclear Fury',    description: "When attacking the Bringer of Nuclear Fire's troops, re-roll 1's on all attack dice until they are no longer 1's.", color: POWER_BLUE },
      { label: '↺ Comeback',   name: 'Twisted Biology', description: 'Bio-hazard and Mercenary scar effects are reversed for you.', color: POWER_BLUE },
    ]
  }

  const lines: PowerLine[] = [...bringer]

  // Star power (red): a private mission this faction claimed permanently.
  // Re-completing it is worth 1 extra Red Star, once per game.
  const spId = (legacy?.factionStarPowerMissions ?? {})[fid]
  if (spId) {
    const sp = CARD_LOOKUP.get(spId) as MissionCard | undefined
    if (sp) {
      lines.push({
        label: '★ Star Power',
        name: sp.name,
        description: `${sp.description} Complete it again to earn 1 Red Star — once per game.`,
        color: POWER_RED,
      })
    }
  }

  // Claimed comeback power (blue)
  const cbId = (legacy?.comebackPowers ?? {})[fid]
  if (cbId) {
    const cb = COMEBACK_POWERS.find(c => c.id === cbId)
    if (cb) lines.push({ label: '↺ Comeback', name: cb.name, description: cb.desc, color: POWER_BLUE })
  }

  // Weakness power — yellow, like every weakness
  const wpId = (legacy?.alienWeaknessPowers ?? {})[fid]
  if (wpId) {
    const wp = WEAKNESS_POWERS.find(w => w.id === wpId)
    if (wp) lines.push({ label: '⚠ Weakness', name: wp.name, description: wp.description, color: POWER_YELLOW })
  }

  // Alien Collaborator weakness — a dedicated field, not in alienWeaknessPowers
  if (fid === legacy?.alienCollaboratorFactionId) {
    lines.push({
      label: '⚠ Weakness',
      name: 'Alien Collaborator',
      description: 'Gain +1 troop when trading in cards, but lose 2 extra troops when expanding into empty cities.',
      color: POWER_YELLOW,
    })
  }

  return lines
}

/**
 * The starting power (green): the ACTIVE chosen ability, or — if none is locked
 * in yet — the options still claimable. Removed/inactive options are filtered
 * out; they can no longer be taken.
 */
export function factionStartingPowerLines(
  fid: string,
  legacy: LegacyState | null | undefined,
  existingAbilities: Record<string, string>,
): PowerLine[] {
  if (fid === 'aliens') {
    return [{ label: '⊕ Starting Power', name: 'Alien Form', description: 'You do not lose troops when expanding into empty cities.', color: POWER_GREEN }]
  }
  if (fid === 'mutants') {
    return [{ label: '⊕ Starting Power', name: 'Radiation Born', description: "You don't lose troops in the Fallout Zone or from Mutant event cards.", color: POWER_GREEN }]
  }

  const chosenId = existingAbilities[fid]
  if (chosenId) {
    const ab = getAbility(chosenId)
    return ab ? [{ label: '⊕ Starting Power', name: ab.name, description: ab.description, color: POWER_GREEN }] : []
  }

  const removed = new Set(legacy?.removedAbilityIds ?? [])
  const [a, b] = getAbilitiesForFaction(fid as FactionId)
  return [a, b]
    .filter(opt => opt && !removed.has(opt.id))
    .map(opt => ({
      label: '⊕ Starting Power (choose in setup)',
      name: opt!.name,
      description: opt!.description,
      color: POWER_GREEN,
    }))
}

/** Every line for a faction card: campaign marks first, starting power last. */
export function factionPowers(
  fid: string,
  legacy: LegacyState | null | undefined,
  existingAbilities: Record<string, string>,
): PowerLine[] {
  return [
    ...factionCampaignMarks(fid, legacy),
    ...factionStartingPowerLines(fid, legacy, existingAbilities),
  ]
}
