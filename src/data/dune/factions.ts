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
import type { Faction, FactionId, FactionRuleRef } from '@/types/Dune/Faction'

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
  reservesHeld: 'off-planet',
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
    karama:
      "You may use a Karama Card to look at any one player's entire Battle Plan.",
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
  // Nothing here is beyond a Karama card.
  unsuppressable: [],
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
  reservesHeld: 'off-planet',
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
    karama:
      'You may use a Karama Card to revive up to three forces or one leader for free.',
    general:
      'If you are playing the advanced game, Sardaukar is in play. Your 5 starred forces, elite Sardaukar, have a '
      + 'special fighting capability. They are worth two normal forces in battle and in taking losses against all '
      + 'opponents except Fremen. Your starred forces are worth just one force against Fremen. They are treated as '
      + 'one force in revival. Only one Sardaukar force can be revived per turn.',
  },
  unsuppressable: [],
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
  // The one faction whose reserves are already on Arrakis. This is what makes
  // their shipment free and keeps them out of the Guild's income — see
  // ReserveLocation.
  reservesHeld: 'on-planet',
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
    karama:
      'You may use a Karama Card to place your sandworm token in any sand territory that you wish. '
      + 'This is treated as a normal sandworm.',
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
  // Their special victory. Karama cannot stop a win condition.
  unsuppressable: ['specialVictory'],
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
  reservesHeld: 'off-planet',
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
    karama:
      'You may use a Karama Card to stop one off-planet shipment of any one player.',
    shipment:
      'You may take your shipment and move action out of turn. This would allow you to go first or last or in '
      + 'between other players\' turns, however you wish. The rest of the factions must make their shipments and '
      + 'moves in the proper sequence. You do not have to reveal when you intend to make your shipment and '
      + 'movement until the moment you wish to take it.',
  },
  // Their special victory. Karama cannot stop a win condition.
  unsuppressable: ['specialVictory'],
  leaders: [
    { name: 'Staban Tuek', strength: 5 },
    { name: 'Master Bewt', strength: 3 },
    { name: 'Esmar Tuek', strength: 3 },
    { name: 'Soo-Soo Sook', strength: 2 },
    { name: 'Guild Representative', strength: 1 },
  ],
}

// No `karama` in the advanced block below, and that is a narrow statement: the
// Bene Gesserit are the one faction with nothing to SPEND a Karama on. That is
// not the same as gaining nothing from the card, and reading it that way was a
// mistake — see `advanced.treachery` below, where their worthless cards become
// Karamas. One is about what a Karama buys; the other is about what counts as
// one.
export const BENE_GESSERIT: Faction = {
  id: 'bene-gesserit',
  name: 'Bene Gesserit',
  startingSpice: 5,
    forces: {
    onPlanet: 1,
    placement: { kind: 'fixed', territoryId: 'territory-03' },   // Polar Sink
    reserves: 19,
    starred: 0,
    },
    reservesHeld: 'off-planet',
    freeRevivals: 1,
    abilities: {
      beforeGame:
      'When selecting this faction you secretly predict when one other faction will win, choosing the turn number'
      + 'and faction, this will remain a secret until game end. If your prediction is correct, your prediction'
      + 'is revealed and you and your allies win the game and win alone, you cannot predict the spacing-guild'
      + 'or Fremen will win with their special victory conditions',
      shipment: 
      'Whenever any other faction ships forces onto Dune from off-planet, you may ship 1 force for free from your'
      + 'reserves into the Polar Sink. You may also ship normally, of course.',
      battle: 
      'You may Voice your opponent to do as you wish with respect to one of the cards they play in their battle'
      + 'For instance, to play or not play a specific weapon (poison weapon, projectile weapon, or lasgun) or'
      + 'defense (snooper or shield), a worthless card, or a cheap hero. If your opponent cannot comply with your'
      + 'command, they may do as they wish'
    },
  alliance: 
  'You may Voice an ally opponent',
  advanced:{
    beforeGame:
    'After the fremen placement in the first turn (if that faction is in the game) you start with one peaceful'
    + 'advisor in any territory of your choice. If you are alone in the territory flip the advisor turns into a fighter',
    shipment: 
    'Whenever any other faction ships forces to Dune from off-planet, you may ship for free one advisor from your'
    + 'reserves into that same territory (instead of the Polar Sink)'
    + 'When another faction ships or moves into a territory where you have fighters, you may flip them to advisors',
    charity:
    'You always receive CHOAM charity of 2 spice regardless of how many spice you already have',
    // NOT from docs/dune-advance-rules.md — that file lists Karama powers for
    // five factions and omits the Bene Gesserit entirely, which is how their
    // absence came to be read as "they get nothing". This wording is mine and
    // wants replacing with yours.
    treachery:
    'You may play a Worthless Card as though it were a Karama Card.',
    advisors:
      
      'Advisors coexist peacefully with other faction forces in the same territory. Advisors have no effect'
      + 'on the play of the other factions whatsoever and cannot collect spice, be involved in combat, prevent'
      + 'another faction from challenging a stronghold (second force), use ornithopters, or play Family Atomics.'
      + 'advisors are susceptible to storms, sandworms, lasgun/shield explosions, and atomics',
    fighters:
            'when you ship forces into an unoccupied territory, you must ship as fighters, If you move advisors'
      + 'into an unoccupied territory they turn into fighters. If you move advisors into occupied territories'
      + 'they remain as advisors or flip to fighters, fighters follow the same rules for battles',
    battle: 
    'On each turn after the Spice Blow and Nexus Phase and before any shipment occurs, in all territories in which you have'
    + 'advisors and wish to battle, announce you are doing so and turn all those advisors to fighters'
  },
  // The prediction win, which lives in abilities.beforeGame rather than in
  // specialVictory — see the note on Faction.unsuppressable.
  unsuppressable: ['abilities.beforeGame'],
  leaders: [
    { name: 'Mother Ramallo', strength: 5 },
    { name: 'Wanna Yueh', strength: 5 },
    { name: 'Margot Lady Fenring', strength: 5 },
    { name: 'Princess Irulan', strength: 5 },
    { name: 'Alia', strength: 5 },
  ]
}

export const HARKONNEN: Faction = {
  id: 'harkonnen',
  name: 'Harkonnen',
  startingSpice: 10,
    forces: {
    onPlanet: 10,
    placement: { kind: 'fixed', territoryId: 'territory-26' },   // Carthag
    reserves: 10,
    starred: 0,
    },
    reservesHeld: 'off-planet',
    freeRevivals: 2,
    abilities: {
      traitors:
      'At the start of the game when you draw 4 Traitor Cards, you keep them all including your own and,'
      + 'any leader cards of other factions can be revealed in a battle as a traitor',
      treachery:
      'You may hold up to 8 Treachery Cards. When you have 8 cards you must pass during bidding. At the beginning of the game'
      + 'you are dealt 2 cards instead of 1, and every time you buy a card you get an extra card for free from'
      + 'the Treachery Deck (unless you are at 7 cards, because you can never have more than 8 in your hand'
    },
  alliance: 
  'Traitor Cards that you hold may be used against your ally\'s opponent if you so choose',
  advanced: {
    karama:
      'You may use a Karama Card to take without looking any number of cards, up to the entire hand of '
      + 'any one player of your choice. For each card you take, you must give that player one of your '
      + 'cards in return.',
    capturedLeaders:
    'Every time you win a battle, you can either randomly select 1 leader from the loser (including the leader'
    + 'used in battle, if not killed, but excluding all leaders already used elsewhere that turn) and place'
    + 'the Leader Disc face down into the Tleilaxu Tanks to gain 2 spice from the Spice Bank; or you can keep'
    + 'the leader and use it once in a battle, after which, if it was not killed during that battle, after which'
    + 'you must return that leader to its faction. When all of your own leaders have been killed, you must return'
    + 'all captured leaders immediately to their factions. Killed leaders are put in the Tleilaxu Tanks from which their'
    + 'factions can revive them (subject to revival rules). A captured leader used in battle may be claimed as a traitor',
  },
  unsuppressable: [],
  leaders: [
    { name: 'Feyd-Rautha', strength: 6 },
    { name: 'Beast Rabban', strength: 4 },
    { name: 'Piter De Vries', strength: 3 },
    { name: 'Captain Iakin Nefud', strength: 2 },
    { name: 'Umman Kudu', strength: 1 },
  ],



}
/** All six. */
export const FACTIONS: Partial<Record<FactionId, Faction>> = {
  atreides: ATREIDES,
  emperor: EMPEROR,
  fremen: FREMEN,
  'spacing-guild': SPACING_GUILD,
  harkonnen: HARKONNEN,
  'bene-gesserit': BENE_GESSERIT,
}

export const factionById = (id: FactionId): Faction | null => FACTIONS[id] ?? null

/**
 * The text a rule reference points at, or undefined if there is none.
 *
 * Exists so a reference can be PROVED to point at something. A string key that
 * resolves to nothing is the failure mode of this shape, and it is silent —
 * "unsuppressable" listing a rule that does not exist reads exactly like a
 * faction with nothing to protect.
 */
export function factionRuleText(f: Faction, ref: FactionRuleRef): string | undefined {
  if (ref === 'specialVictory') return f.specialVictory
  const [group, key] = ref.split('.') as ['abilities' | 'advanced', string]
  return (f[group] as Record<string, string | undefined>)[key]
}

/**
 * Whether a Karama card may stop this faction doing this.
 *
 * The one rule of it: everything is stoppable except a win condition, and which
 * rules those are is stated by each faction rather than listed here. A check
 * that carried its own list would be a second place for the answer to live, and
 * the two would part company the first time a faction changed.
 */
export function canKaramaStop(f: Faction, ref: FactionRuleRef): boolean {
  return !f.unsuppressable.includes(ref)
}


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
