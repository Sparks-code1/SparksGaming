/**
 * The six Dune factions.
 *
 * Four are filled in; Harkonnen and Bene Gesserit follow the same shape. Rules
 * text is verbatim from the rulebook apart from the corrections listed at the
 * foot of this file — every change is recorded there rather than made silently,
 * and so is every place the wording is ambiguous.
 *
 * Territory ids come from boardData, not from names, so a faction cannot start
 * in a territory the board does not have. factionstest asserts the link, which
 * is not decoration: the draft of this file named the right territories in its
 * comments and the wrong ids beside them.
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
    placement: { kind: 'fixed', territoryId: 'territory-13' },   // Arrakeen
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
  advanced: {
    general:
      'If you are playing the advanced game, Kwisatz Haderach is in play. If you are the Atreides, use the '
      + 'Kwisatz Haderach card and counter token to secretly keep track of force losses. Once you have lost 7 or '
      + 'more forces in a battle or battles, the Kwisatz Haderach card becomes active for the rest of the game and '
      + 'may be used as follows: it cannot be used alone in battle but may add its +2 strength to leaders or cheap '
      + 'heroes in one territory per turn. If the leader or cheap hero is killed, the Kwisatz Haderach has no effect '
      + 'in the battle. A leader accompanied by Kwisatz Haderach cannot turn traitor. The Kwisatz Haderach can only '
      + 'be killed if blown up by a lasgun/shield explosion. If killed, the Kwisatz Haderach must be revived like '
      + 'any other leader. Alive or dead, the Kwisatz Haderach has no effect on the rule governing revival of '
      + 'Atreides leaders.',
  },
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
    placement: { kind: 'reserve-only' },
    reserves: 20,
    starred: 5,                        // Sardaukar — see StartingForces.starred
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
  advanced: {
    general:
      'If you are playing the advanced game, Sardaukar is in play. Your 5 starred forces, elite Sardaukar, have a '
      + 'special fighting capability. They are worth two normal forces in battle and in taking losses against all '
      + 'opponents except Fremen. Your starred forces are worth just one force against Fremen. They are treated as '
      + 'one force in revival. Only one Sardaukar force can be revived per turn.',
  },
  leaders: [
    { name: 'Hasimir Fenring', strength: 6 },
    { name: 'Captain Aramsham', strength: 5 },
    { name: 'Caid', strength: 3 },
    { name: 'Burseg', strength: 3 },
    { name: 'Bashar', strength: 2 },
  ],
}

export const FREMEN: Faction = {
  id: 'fremen',
  name: 'Fremen',
  startingSpice: 3,
  forces: {
    onPlanet: 10,
    // Distributed by the player at setup, in whatever split they choose.
    placement: {
      kind: 'distribute',
      among: [
        'territory-40',                // Sietch Tabr
        'territory-17',                // False Wall South
        'territory-10',                // False Wall West
      ],
    },
    reserves: 10,
    starred: 3,                        // Fedaykin — see StartingForces.starred
  },
  freeRevivals: 3,
  abilities: {
    shipment:
      'You may bring any or all of your reserves for free onto the Great Flat or onto any one territory within '
      + 'two territories of the Great Flat (subject to storm and occupancy rules).',
    movement:
      'You may move your forces two territories instead of one.',
    shaiHulud:
      'If Shai-Hulud appears in a territory where you have forces, they are not devoured. Upon conclusion of the '
      + 'Nexus, you may ride the sandworm and move some or all of the forces in that territory to any territory '
      + 'subject to storm and occupancy rules. Any forces in that territory are not devoured. If Shai-Hulud '
      + 'appears again and you still have forces in the original territory, you may do this again.',
  },
  alliance:
    'You may choose to protect (or not protect) your allies from the effects of Shai-Hulud, and at your '
    + 'discretion, may also allow them to revive 3 forces for free during the revival phase. In addition, your '
    + 'allies win with you if you win with the special victory condition.',
  specialVictory:
    'If no faction has won by the end of turn 10, and you (or no one) occupies Sietch Tabr and Habbanya Sietch, '
    + 'and neither Harkonnen, Atreides nor Emperor occupies Tuek\'s Sietch, you and your allies win the game.',
  advanced: {
    storm:
      'The first storm in the game is normal. All subsequent storms can move either 1-6 sectors and you get to '
      + 'know the number of sectors before the storm moves on the previous turn.',
    spiceBlow:
      'Sandworms: During a spice blow, all additional sandworms that appear after the first sandworm can be '
      + 'placed by you in any territory, any forces there except yours are devoured. Storm Losses: If your forces '
      + 'are caught in a storm, only half of them are killed (rounded up).',
    shipment:
      'You may also bring your reserves into a storm at half losses.',
    forces:
      'Fedaykin: Your 3 starred forces, elite Fedaykin, have a special fighting capability. They are worth two '
      + 'normal forces in battle and in taking losses against all opponents. They are treated as one force in '
      + 'revival. Only one Fedaykin force can be revived per turn.',
    battle:
      'Your forces do not require spice to count at their full strength.',
  },
  leaders: [
    { name: 'Stilgar', strength: 7 },
    { name: 'Chani', strength: 6 },
    { name: 'Otheym', strength: 5 },
    { name: 'Shadout Mapes', strength: 3 },
    { name: 'Jamis', strength: 2 },
  ],
}

export const SPACING_GUILD: Faction = {
  id: 'spacing-guild',
  name: 'Spacing Guild',
  startingSpice: 5,
  forces: {
    onPlanet: 5,
    placement: { kind: 'fixed', territoryId: 'territory-33' },   // Tuek's Sietch
    reserves: 15,
    starred: 0,
  },
  freeRevivals: 1,
  abilities: {
    shipment:
      'When other factions ship forces on to Dune, from their off-planet reserves, they pay the spice to you '
      + 'instead of to the Spice Bank. You are able to make three types of shipment: (1) you may ship normally '
      + 'from off planet reserves, (2) you may ship any number of forces from any one territory to any other '
      + 'territory on the board, or (3) you may ship any number of forces from any one territory back to your '
      + 'reserves. You pay half the normal fee when shipping your forces, and pay 1 spice for every 2 of your '
      + 'forces shipped back to reserves.',
  },
  alliance:
    'Allies may ship from their off-planet reserves onto Dune or cross-ship from one territory to another with '
    + 'forces that are already on Dune at the half-price rate. In addition, allies win with the Spacing Guild '
    + 'Special Victory Condition.',
  specialVictory:
    'If no faction has been able to win the game by the end of play, you automatically win the game.',
  advanced: {
    shipment:
      'You may take your shipment and move action out of turn. This would allow you to go first or last or in '
      + 'between other players\' turns, however you wish. The rest of the factions must make their shipments and '
      + 'moves in the proper sequence. You do not have to reveal when you intend to make your shipment and '
      + 'movement until the moment you wish to take it.',
  },
  leaders: [
    { name: 'Staban Tuek', strength: 5 },
    { name: 'Master Bewt', strength: 3 },
    { name: 'Esmar Tuek', strength: 3 },
    { name: 'Soo-Soo Sook', strength: 2 },
    { name: 'Guild Representative', strength: 1 },
  ],
}

/** Filled in as they are written. Two to go: Harkonnen and Bene Gesserit. */
export const FACTIONS: Partial<Record<FactionId, Faction>> = {
  atreides: ATREIDES,
  emperor: EMPEROR,
  fremen: FREMEN,
  'spacing-guild': SPACING_GUILD,
}

export const factionById = (id: FactionId): Faction | null => FACTIONS[id] ?? null

// ─── Territory ids: what the draft said, and what the board says ─────────────
//
// The comments named the right places; the ids beside them did not. Checked
// against boardData rather than against the comments:
//
//   Sietch Tabr        draft territory-14  ->  territory-40
//                      territory-14 is Rim Wall West, a real but different place
//   Tuek's Sietch      draft territory-5   ->  territory-33
//                      territory-5 is not an id at all — they are zero-padded,
//                      and territory-05 is the Imperial Basin
//   False Wall South   territory-17, correct, but the comment beside it named
//   False Wall West    territory-10, correct, the other one; the pair was swapped
//
// The zero-padding is the trap worth remembering. 'territory-5' looks perfectly
// reasonable and matches nothing, so it fails as a MISSING territory rather than
// as a wrong one — the better failure, but only because the ids are checked at
// all. 'territory-14' is the dangerous kind: a real id for the wrong place, and
// nothing but the board can tell you so.
//
// ─── Changes made to the draft ────────────────────────────────────────────────
//
// SYNTAX, in the two new factions:
//   object values ran on without commas, and several ability blocks held two
//     adjacent string literals with no operator between them
//   'shai-hulud:' is not a valid key unquoted            -> shaiHulud
//   'strenght' throughout the Guild leaders               -> strength
//   'spacing-guild:' unquoted in the FACTIONS map         -> quoted
//   a stub `export const bene-gesserit: faction = {}`     -> removed. The id is
//     not a valid identifier and `faction` is not a type; it joins FACTIONS when
//     it is written, like the others
//   `advanced` was a bare string on two factions and an object on two others; it
//     is an object throughout now, with the prose ones under `general`
//   Fremen was exported as `Fremen`                       -> FREMEN
//
// SPELLING, corrected because these strings are shown to players:
//   forrces -> forces, inthe -> in the, NExus -> Nexus, tunr -> turn,
//   'Tuek Sietch' -> "Tuek's Sietch", 'they pay for spice to you' -> 'they pay
//   the spice to you', 'Shadout-Mapes' -> 'Shadout Mapes',
//   'Guild rep' -> 'Guild Representative' (read as an abbreviation, not a name —
//   worth a glance, since it is the one correction that invents a word)
//
// ORDER:
//   Fremen leaders had Jamis (2) above Shadout Mapes (3); every other faction is
//   descending by strength, so the two were swapped. Cosmetic only.
//
// ─── Ambiguous, left exactly as written ──────────────────────────────────────
//
// 1. Fremen Shai-Hulud, last clause: 'Any forces in that territory are not
//    devoured.' The sentence before it already says Fremen forces survive, so
//    this either means forces in the DESTINATION territory after the ride, or
//    other factions' forces in the origin. Those are very different rules and
//    the second would make the Fremen far stronger.
//
// 2. Fremen special victory: 'you (or no one) occupies Sietch Tabr and Habbanya
//    Sietch'. Unclear whether '(or no one)' distributes across both sietches,
//    and whether 'and' requires both at once.
//
// 3. Fremen advanced storm: 'can move either 1-6 sectors'. 'Either' implies a
//    choice between two options, but 1-6 is a range. And 'you get to know the
//    number of sectors before the storm moves on the previous turn' reads as
//    knowing a full turn early — which changes what the storm phase has to
//    reveal, and to whom, so it is worth settling before that phase is built.
//
// 4. TWO special victory conditions now exist and they can both hold at once.
//    The Fremen win 'if no faction has won by the end of turn 10' subject to the
//    sietches; the Guild wins 'if no faction has been able to win by the end of
//    play' subject to nothing. Neither says which resolves first, and as written
//    the Guild condition appears to subsume the Fremen one.
//
// 5. The Atreides battle text reads oddly — 'force your opponent to reveal YOUR
//    choice of one of the four elements' — but that is the rule: you pick which
//    element they must show. Not touched.
