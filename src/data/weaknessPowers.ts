export interface WeaknessPower {
  id: string
  name: string
  color: string
  description: string
}

export const WEAKNESS_POWERS: WeaknessPower[] = [
  {
    id: 'wp-cautious',
    name: 'Cautious',
    color: '#e67e22',
    description: 'When placing recruited troops, you can place them into no more than 2 territories.',
  },
  {
    id: 'wp-purist',
    name: 'Purist',
    color: '#2980b9',
    description: 'You cannot have more than 2 coin cards in your hand at any time.',
  },
  {
    id: 'wp-short-sighted',
    name: 'Short Sighted',
    color: '#8e44ad',
    description: 'You can only maneuver into adjacent territories during the Fortify phase.',
  },
  {
    id: 'wp-unpopular',
    name: 'Unpopular',
    color: '#c0392b',
    description: 'Lose 1 additional troop when expanding into any city (occupied or empty).',
  },
  {
    id: 'wp-primitive',
    name: 'Primitive',
    color: '#7f8c8d',
    description: 'You do not add population when recruiting troops — territories count toward your draft total but cities do not.',
  },
]

/** Factions exempt from choosing a weakness power */
export const WEAKNESS_EXEMPT_FACTIONS = new Set(['aliens', 'alien-collaborator', 'mutants'])

/** Whether a faction must pick a weakness power during setup. */
export function needsWeaknessPower(
  factionId: string,
  legacy: {
    alienMilestoneTriggered?: boolean
    alienCollaboratorFactionId?: string | null
    alienWeaknessPowers?: Record<string, string>
  } | null | undefined,
): boolean {
  if (!legacy?.alienMilestoneTriggered) return false
  if (WEAKNESS_EXEMPT_FACTIONS.has(factionId)) return false
  if (factionId === legacy.alienCollaboratorFactionId) return false
  if ((legacy.alienWeaknessPowers ?? {})[factionId]) return false
  return true
}
