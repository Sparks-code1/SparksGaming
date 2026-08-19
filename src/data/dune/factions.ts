/**
 * The six Dune factions.
 *
 * Two are filled in; the remaining four follow the same shape. Rules text is
 * verbatim from the rulebook apart from the corrections listed at the foot of
 * this file — every change is recorded there rather than made silently.
 *
 * Territory ids come from boardData, not from names, so a faction cannot start
 * in a territory the board does not have. factionstest asserts the link.
 */
import type { Faction, FactionId } from '@/types/Dune/Faction'

/** Turn order and setup both need a stable list, so the ids live in one place. */
export const FACTION_IDS: readonly FactionId[] = [
  'atreides',
  'emperor',
  'spacing-guild',
  'fremen',
  'harkonnen',
  'bene-gesserit',
]

export const ATREIDES: Faction = {
  id: 'atreides',
  name: 'Atreides',
  startingSpice: 10,
  forces: {
    onPlanet: 10,
    territoryId: 'territory-13',        // Arrakeen
    reserves: 10,
    starred: 0,
  },
  freeRevivals: 2,
  abilities: {
    bidding:
      'Atreides may look at each Treachery Card as it comes up for purchase before any faction bids on it.',
    movement:
      'At the start of the Movement Phase, before anyone moves, you may look at the top card of the Spice Deck.',
    battle:
      'During the Battle Phase, you may force your opponent to reveal your choice of one of the four elements '
      + 'of battle (the leader, the weapon, the defense, or the forces in battle) before they reveal their choice.',
  },
  alliance:
    'The Atreides may assist your allies by forcing their opponent to show them one element of their battle plan.',
  advanced:
    'If you are playing the advanced game, Kwisatz Haderach is in play. If you are the Atreides, use the '
    + 'Kwisatz Haderach card and counter token to secretly keep track of force losses. Once you have lost 7 or '
    + 'more forces in a battle or battles, the Kwisatz Haderach card becomes active for the rest of the game and '
    + 'may be used as follows: it cannot be used alone in battle but may add its +2 strength to leaders or cheap '
    + 'heroes in one territory per turn. If the leader or cheap hero is killed, the Kwisatz Haderach has no effect '
    + 'in the battle. A leader accompanied by Kwisatz Haderach cannot turn traitor. The Kwisatz Haderach can only '
    + 'be killed if blown up by a lasgun/shield explosion. If killed, the Kwisatz Haderach must be revived like '
    + 'any other leader. Alive or dead, the Kwisatz Haderach has no effect on the rule governing revival of '
    + 'Atreides leaders.',
  leaders: [
    { name: 'Lady Jessica', strength: 5 },
    { name: 'Thufir Hawat', strength: 5 },
    { name: 'Gurney Halleck', strength: 4 },
    { name: 'Duncan Idaho', strength: 2 },
    { name: 'Dr. Wellington Yueh', strength: 1 },
  ],
}

export const EMPEROR: Faction = {
  id: 'emperor',
  name: 'Emperor',
  startingSpice: 10,
  forces: {
    onPlanet: 0,
    territoryId: null,                  // begins entirely in reserve
    reserves: 20,
    starred: 5,                         // Sardaukar — see StartingForces.starred
  },
  freeRevivals: 1,
  abilities: {
    bidding:
      'Whenever any other faction pays spice for a Treachery card, they pay it to you instead of the Spice Bank. '
      + 'You may not discount the price of Treachery Cards; the full price must be paid.',
  },
  alliance:
    'You may share your great wealth with your allies as well as paying spice (directly to the bank) for the '
    + 'revival of up to 3 extra of their forces (for a possible total of 6 during each revival phase) from the '
    + 'Tleilaxu tanks.',
  advanced:
    'If you are playing the advanced game, Sardaukar is in play. Your 5 starred forces, elite Sardaukar, have a '
    + 'special fighting capability. They are worth two normal forces in battle and in taking losses against all '
    + 'opponents except Fremen. Your starred forces are worth just one force against Fremen. They are treated as '
    + 'one force in revival. Only one Sardaukar force can be revived per turn.',
  leaders: [
    { name: 'Hasimir Fenring', strength: 6 },
    { name: 'Captain Aramsham', strength: 5 },
    { name: 'Caid', strength: 3 },
    { name: 'Burseg', strength: 3 },
    { name: 'Bashar', strength: 2 },
  ],
}

/** Filled in as they are written. Four to go. */
export const FACTIONS: Partial<Record<FactionId, Faction>> = {
  atreides: ATREIDES,
  emperor: EMPEROR,
}

export const factionById = (id: FactionId): Faction | null => FACTIONS[id] ?? null

// ─── Changes made to the draft ────────────────────────────────────────────────
//
// TWO EDITOR ACCIDENTS, not typos. Both are tokens from the Risk codebase that
// autocomplete pasted into the prose, so they are corrected to what the sentence
// plainly wanted:
//
//   'Alive or dealScarCards, the Kwisatz Haderach...'  ->  'Alive or dead, ...'
//     dealScarCards is a real function in src/data/scarCards.ts
//   A leading `import { turnKey } from '@/lib/setupFlow'` — dropped entirely;
//     nothing in faction data needs it
//
// SPELLING, corrected because these strings are shown to players:
//
//   strenght          -> strength          (the field name, throughout)
//   oppent            -> opponent
//   focing            -> forcing
//   ot cammpt ne used -> it cannot be used
//   Kwiastaz Haderach -> Kwisatz Haderach  (spelled correctly elsewhere in the same paragraph)
//   anoy other leader -> any other leader
//   paided            -> paid
//   lasgun/ shield    -> lasgun/shield     (stray space)
//   Sardukar          -> Sardaukar         (draft used both spellings; the rulebook uses Sardaukar)
//   spacing guild     -> spacing-guild     (as an id; 'Spacing Guild' when it gets a name field)
//
// STRUCTURE:
//
//   'startingOnPlanet: 10 forces in Arrakeen' became a count and a territory id,
//   so setup can act on it without reading English. Arrakeen is territory-13,
//   asserted in factionstest rather than trusted.
//
// LEFT ALONE:
//
//   The Atreides battle text reads oddly — 'force your opponent to reveal YOUR
//   choice of one of the four elements' — but that is the rule: you pick which
//   element they must show. Not touched.
