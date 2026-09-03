// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/truthtrance.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact truthtrance questions the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/data/dune/treachery.ts
var KEEP_IF_WON = " You may keep this card if you win this battle.";
var WORTHLESS = "Play as part of your Battle Plan, in place of a weapon, defense, or both.\n\nThis card has no value in play, and you can discard it only by playing it in your Battle Plan.";
var PLAY_IN_PLAN = "Play as part of your Battle Plan.";
var TREACHERY_CARDS = [
  // ── Projectile weapons ────────────────────────────────────────────────────
  // Four of them, one copy each, all with the same text and all stopped by a
  // Shield. They differ only by name — and now by picture. Four of the five
  // weapon images are square; the Maula Pistol is wide, which is why the art box
  // fits an image to the whole box rather than to a square inside it.
  {
    id: "crysknife",
    name: "Crysknife",
    kind: "weapon",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Crysknife.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Shield." + KEEP_IF_WON
  },
  {
    id: "stunner",
    name: "Stunner",
    kind: "weapon",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Stunner.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Shield." + KEEP_IF_WON
  },
  {
    id: "sliptip",
    name: "Slip Tip",
    kind: "weapon",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Slip_tip.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Shield." + KEEP_IF_WON
  },
  {
    id: "maulapistol",
    name: "Maula Pistol",
    kind: "weapon",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Maula_Pistol.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Shield." + KEEP_IF_WON
  },
  // ── Poison weapons ────────────────────────────────────────────────────────
  {
    id: "gomjabbar",
    name: "Gom Jabbar",
    kind: "weapon",
    subtype: "poison",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Gom_Jabbar.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper." + KEEP_IF_WON
  },
  {
    id: "ellacadrug",
    name: "Ellaca Drug",
    kind: "weapon",
    subtype: "poison",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Ellaca_Drug.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper." + KEEP_IF_WON
  },
  {
    id: "chaumas",
    name: "Chaumas",
    kind: "weapon",
    subtype: "poison",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Chaumas.jpg",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper." + KEEP_IF_WON
  },
  {
    id: "chaumurky",
    name: "Chaumurky",
    kind: "weapon",
    subtype: "poison",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Chaumurky.jpg",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper." + KEEP_IF_WON
  },
  // ── The one weapon nothing defends against ────────────────────────────────
  // Its class is its own, and there is no defence card to match it. That is the
  // card, not a gap in the data: a Shield played in the same battle does not
  // save anyone, it destroys the territory.
  //
  // RULING: "anyone" includes the Lasgun's own owner. A Lasgun and a Shield on
  // the table together destroy the territory whoever held which — shielding your
  // own leader behind your own Lasgun sets it off exactly as the defender's
  // Shield would.
  //
  // So the explosion is a property of the PAIR being present, not of who played
  // what. Battle resolution should ask "were both cards played in this battle",
  // never "did my opponent play a Shield". The word carrying that is "anyone",
  // and treacherytest pins it, because nothing else in the repo can enforce a
  // battle rule while battles do not exist.
  {
    id: "lasgun",
    name: "Lasgun",
    kind: "weapon",
    subtype: "lasgun",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Lasgun.png",
    text: PLAY_IN_PLAN + "\n\nAutomatically kills opponent's leader regardless of defense card used.\n\nYou may keep this card if you win this battle.\n\nIf anyone plays a Shield in this battle all forces, leaders, and spice in this battle's territory are lost to the Tleilaxu Tanks. Both players lost this battle, no spice is paid for leaders, and all cards played are discarded."
  },
  // ── Defences ──────────────────────────────────────────────────────────────
  {
    id: "shield",
    name: "Shield",
    kind: "defense",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 4,
    image: "/treachery/Shield.png",
    text: PLAY_IN_PLAN + "\n\nProtects your leader from a projectile weapon in this battle.\n\nYou may keep this card if you win this battle."
  },
  {
    id: "snooper",
    name: "Snooper",
    kind: "defense",
    subtype: "poison",
    timing: "battle-plan",
    copies: 4,
    image: "/treachery/Snooper.png",
    text: PLAY_IN_PLAN + "\n\nProtects your leader from a poison weapon in this battle.\n\nYou may keep this card if you win this battle."
  },
  // ── Worthless ─────────────────────────────────────────────────────────────
  // Five cards, one copy each, rather than one card five times. They are
  // mechanically identical — same text, same timing, same nothing — and differ
  // only in name and picture, which is the whole joke: five ordinary objects
  // from a desert planet, none of which will win you a battle.
  //
  // The names are the ones Dune prints. Worth checking against your own copy:
  // they came from memory of the game rather than from anything in this repo,
  // and this is the second time that has been a way to be wrong.
  {
    id: "baliset",
    name: "Baliset",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/baliset.svg",
    text: WORTHLESS
  },
  {
    id: "jubbacloak",
    name: "Jubba Cloak",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/jubba-cloak.svg",
    text: WORTHLESS
  },
  {
    id: "kulon",
    name: "Kulon",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/kulon.svg",
    text: WORTHLESS
  },
  {
    id: "lalala",
    name: "LA, LA, LA",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/la-la-la.svg",
    text: WORTHLESS
  },
  {
    id: "triptogamont",
    name: "Trip to Gamont",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/trip-to-gamont.svg",
    text: WORTHLESS
  },
  // ── Specials ──────────────────────────────────────────────────────────────
  {
    id: "cheaphero",
    name: "Cheap Hero",
    kind: "special",
    subtype: "leader",
    timing: "battle-plan",
    copies: 3,
    image: "/treachery/Cheap_Hero.png",
    text: "Play as a leader with zero strength on your Battle Plan and discard after the battle.\n\nYou may also play a weapon and a defense. The cheap hero may be played in place of a leader or when you have no leaders available."
  },
  {
    id: "truthtrance",
    name: "Truthtrance",
    kind: "special",
    subtype: "information",
    timing: "any-time",
    copies: 2,
    image: "/treachery/Truthtrance.png",
    // REWRITTEN, and the only card in the deck whose text is not the printed
    // one. The printed card asks a player to answer truthfully; nothing can hold
    // them to it, and the questions worth asking are about intent, which is not
    // state and never becomes checkable. So the server answers instead of the
    // player, out of a fixed set of questions it can prove — see
    // lib/dune/truthtrance.ts for the set and for what had to be given up.
    text: "Play at any time. Name another player and choose one question from the Truthtrance list.\n\nThe question and its answer are announced to every player. The answer is yes or no, and is always true."
  },
  {
    id: "tleilaxughola",
    name: "Tleilaxu Ghola",
    kind: "special",
    subtype: "revival",
    timing: "any-time",
    copies: 1,
    image: "/treachery/Tleilaxu_Ghola.png",
    text: "Play at any time to gain an extra revival.\n\nYou may immediately revive 1 of your leaders regardless of how many leaders you have in the tanks, or up to 5 of your forces from the Tleilaxu Tanks to your reserves at no cost in spice."
  },
  {
    id: "hajr",
    name: "Hajr",
    kind: "special",
    subtype: "movement",
    timing: "movement",
    copies: 1,
    image: "/treachery/HAJR.png",
    text: "Play during Movement Phase.\n\nMake an extra on-planet force movement subject to normal movement rules.\n\nThe forces you move may be a group you've already moved this phase or another group."
  },
  {
    id: "weathercontrol",
    name: "Weather Control",
    kind: "special",
    subtype: "storm",
    timing: "mentat-storm",
    copies: 1,
    image: "/treachery/weather_control.png",
    text: "Play during the Mentat Pause. You control the NEXT turn's storm and may move it from 0 to 10 sectors in a counterclockwise direction.\n\nTHIS GAME: at the Pause, not during the Storm Phase \u2014 which is the moment just before, so the sequence is unchanged."
  },
  {
    id: "karama",
    name: "Karama",
    kind: "special",
    subtype: "none",
    timing: "any-time",
    copies: 2,
    // Text by design, not by omission — there is more rules text here than a
    // picture would leave room for.
    textOnly: true,
    // The text below is the BASIC card. In the advanced game it gains a second,
    // alternative use: instead of stopping an opponent's advantage, spend it on
    // your own faction's Karama power. Those live on the factions rather than
    // here — see AdvancedRules.karama — because they differ per faction and the
    // card is the same card. Either use, not both, and it discards afterwards.
    text: 'After the factions complete their "At Start" actions and after game set-up, use this card to stop a player from using one of their faction advantages when they attempt to use it. Stops the use of that advantage during one game phase.\n\nOr, this card may be used to do either of these things when appropriate:\n\nPurchase a shipment of forces onto the planet at Guild rates (1/2 normal) not paid to the Spacing Guild, or\n\nPurchase a Treachery Card without paying spice for it.\n\nCannot be used to stop a win condition advantage. Discard after use.'
  },
  {
    id: "familyatomics",
    name: "Family Atomics",
    kind: "special",
    subtype: "storm",
    timing: "mentat-storm",
    copies: 1,
    image: "/treachery/Family_atomics.png",
    text: "Play during the Mentat Pause, only if you have forces on the Shield Wall or a territory adjacent to it with no storm between your sector and the Wall.\n\nAll forces on the Shield Wall are destroyed. The Imperial Basin, Arrakeen and Carthag are no longer protected from the storm, from next turn's on.\n\nTHIS GAME: at the Pause, not after the storm is calculated \u2014 so the coming roll is not yet known."
  }
];

// src/data/dune/factions.ts
var FACTION_IDS = [
  "atreides",
  "emperor",
  "spacing-guild",
  "fremen",
  "harkonnen",
  "bene-gesserit"
];
var ATREIDES = {
  id: "atreides",
  name: "Atreides",
  startingSpice: 10,
  forces: {
    onPlanet: 10,
    placement: { kind: "fixed", territoryId: "territory-13" },
    // Arrakeen
    reserves: 10,
    starred: 0
  },
  reservesHeld: "off-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 2,
  abilities: {
    bidding: "Atreides may look at each Treachery Card as it comes up for purchase before any faction bids on it.",
    movement: "At the start of the Movement Phase, before anyone moves, you may look at the top card of the Spice Deck.",
    battle: "During the Battle Phase, you may force your opponent to reveal your choice of one of the four elements of battle (the leader, the weapon, the defense, or the forces in battle) before they reveal their choice."
  },
  alliance: "The Atreides may assist your allies by forcing their opponent to show them one element of their battle plan.",
  advanced: {
    karama: "You may use a Karama Card to look at any one player's entire Battle Plan.",
    kwisatzHaderach: "Use the Kwisatz Haderach card and counter token to secretly keep track of force losses. Once you have lost 7 or more forces in a battle or battles, the Kwisatz Haderach card becomes active for the rest of the game and may be used as follows: it cannot be used alone in battle but may add its +2 strength to leaders or cheap heroes in one territory per turn. If the leader or cheap hero is killed, the Kwisatz Haderach has no effect in the battle. A leader accompanied by Kwisatz Haderach cannot turn traitor. The Kwisatz Haderach can only be killed if blown up by a lasgun/shield explosion. If killed, the Kwisatz Haderach must be revived like any other leader. Alive or dead, the Kwisatz Haderach has no effect on the rule governing revival of Atreides leaders."
  },
  // Nothing here is beyond a Karama card.
  unsuppressable: [],
  karamaStops: {
    "abilities.bidding": { stops: "Seeing each Treachery Card before the bidding.", enforced: true },
    "abilities.movement": { stops: "Looking at the top of the Spice Deck before the move.", enforced: false },
    "abilities.battle": { stops: "Forcing an opponent to reveal one element of their battle plan.", enforced: true },
    "advanced.kwisatzHaderach": { stops: "The Kwisatz Haderach adding its +2 to a leader.", enforced: false }
  },
  leaders: [
    { name: "Lady Jessica", strength: 5 },
    { name: "Thufir Hawat", strength: 5 },
    { name: "Gurney Halleck", strength: 4 },
    { name: "Duncan Idaho", strength: 2 },
    { name: "Dr. Wellington Yueh", strength: 1 }
  ]
};
var EMPEROR = {
  id: "emperor",
  name: "Emperor",
  startingSpice: 10,
  forces: {
    onPlanet: 0,
    placement: { kind: "reserve-only" },
    reserves: 20,
    starred: 5
    // Sardaukar — see StartingForces.starred
  },
  reservesHeld: "off-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 1,
  abilities: {
    bidding: "Whenever any other faction pays spice for a Treachery card, they pay it to you instead of the Spice Bank. You may not discount the price of Treachery Cards; the full price must be paid."
  },
  alliance: "You may share your great wealth with your allies as well as paying spice (directly to the bank) for the revival of up to 3 extra of their forces (for a possible total of 6 during each revival phase) from the Tleilaxu tanks.",
  advanced: {
    karama: "You may use a Karama Card to revive up to three forces or one leader for free.",
    // UNDER `forces`, not `general`. The card labels each entry with the key it
    // came from, and GENERAL says nothing — where FORCES says which of these
    // rules is the one about your soldiers. The Fremen's Fedaykin entry has
    // always been shaped this way; this is the same rule for the same reason.
    //
    // The rulebook's opening clause, "If you are playing the advanced game,
    // Sardaukar is in play", is dropped: it sits on the back of the card, which
    // is the advanced side and says so.
    forces: "Sardaukar: Your 5 starred forces, elite Sardaukar, have a special fighting capability. They are worth two normal forces in battle and in taking losses against all opponents except Fremen. Your starred forces are worth just one force against Fremen. They are treated as one force in revival. Only one Sardaukar force can be revived per turn."
  },
  unsuppressable: [],
  karamaStops: {
    "abilities.bidding": { stops: "Being paid the spice other factions spend on Treachery Cards.", enforced: true },
    "advanced.forces": { stops: "Sardaukar counting double in battle and in taking losses.", enforced: true }
  },
  leaders: [
    { name: "Hasimir Fenring", strength: 6 },
    { name: "Captain Aramsham", strength: 5 },
    { name: "Caid", strength: 3 },
    { name: "Burseg", strength: 3 },
    { name: "Bashar", strength: 2 }
  ]
};
var FREMEN = {
  id: "fremen",
  name: "Fremen",
  startingSpice: 3,
  forces: {
    onPlanet: 10,
    // Distributed by the player at setup, in whatever split they choose.
    placement: {
      kind: "distribute",
      among: [
        "territory-40",
        // Sietch Tabr
        "territory-17",
        // False Wall South
        "territory-10"
        // False Wall West
      ]
    },
    reserves: 10,
    starred: 3
    // Fedaykin — see StartingForces.starred
  },
  // The one faction whose reserves are already on Arrakis. This is what makes
  // their shipment free and keeps them out of the Guild's income — see
  // ReserveLocation.
  reservesHeld: "on-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 3,
  abilities: {
    shipment: "You may bring any or all of your reserves for free onto the Great Flat or onto any one territory within two territories of the Great Flat (subject to storm and occupancy rules).",
    movement: "You may move your forces two territories instead of one.",
    shaiHulud: "If Shai-Hulud appears in a territory where you have forces, they are not devoured. Upon conclusion of the Nexus, you may ride the sandworm and move some or all of the forces in that territory to any territory subject to storm and occupancy rules. Any forces in that territory are not devoured. If Shai-Hulud appears again and you still have forces in the original territory, you may do this again."
  },
  alliance: "You may choose to protect (or not protect) your allies from the effects of Shai-Hulud (sandworm), and at your discretion, may also allow them to revive 3 forces for free during the revival phase. In addition, your allies win with you if you win with the special victory condition.",
  specialVictory: "If no faction has won by the end of turn 10, and you (or no one) occupies Sietch Tabr and Habbanya Sietch, and neither Harkonnen, Atreides nor Emperor occupies Tuek's Sietch, you and your allies win the game.",
  advanced: {
    karama: "You may use a Karama Card to place your sandworm token in any sand territory that you wish. This is treated as a normal sandworm.",
    storm: "The first storm in the game is normal. All subsequent storms can move either 1-6 sectors and you get to know the number of sectors before the storm moves on the previous turn.",
    spiceBlow: "Sandworms: During a spice blow, all additional sandworms that appear after the first sandworm can be placed by you in any territory, any forces there except yours are devoured. Storm Losses: If your forces are caught in a storm, only half of them are killed (rounded up).",
    shipment: "You may also bring your reserves into a storm at half losses.",
    forces: "Fedaykin: Your 3 starred forces, elite Fedaykin, have a special fighting capability. They are worth two normal forces in battle and in taking losses against all opponents. They are treated as one force in revival. Only one Fedaykin force can be revived per turn.",
    battle: "Your forces do not require spice to count at their full strength."
  },
  // Their special victory. Karama cannot stop a win condition.
  unsuppressable: ["specialVictory"],
  karamaStops: {
    "abilities.shipment": { stops: "Riding free onto the Great Flat, or within two territories of it.", enforced: true },
    "abilities.movement": { stops: "Moving two territories instead of one.", enforced: false },
    "abilities.shaiHulud": { stops: "Surviving Shai-Hulud, and riding it after the Nexus.", enforced: false },
    "advanced.storm": { stops: "Knowing the storm distance a turn early.", enforced: true },
    "advanced.spiceBlow": { stops: "Placing every sandworm after the first, and half losses in a storm.", enforced: false },
    "advanced.shipment": { stops: "Shipping into a storm at half losses.", enforced: true },
    "advanced.forces": { stops: "Fedaykin counting double in battle and in taking losses.", enforced: true },
    "advanced.battle": { stops: "Fighting at full strength without spice.", enforced: true }
  },
  leaders: [
    { name: "Stilgar", strength: 7 },
    { name: "Chani", strength: 6 },
    { name: "Otheym", strength: 5 },
    { name: "Shadout Mapes", strength: 3 },
    { name: "Jamis", strength: 2 }
  ]
};
var SPACING_GUILD = {
  id: "spacing-guild",
  name: "Spacing Guild",
  startingSpice: 5,
  forces: {
    onPlanet: 5,
    placement: { kind: "fixed", territoryId: "territory-33" },
    // Tuek's Sietch
    reserves: 15,
    starred: 0
  },
  reservesHeld: "off-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 1,
  abilities: {
    shipment: "When other factions ship forces on to Dune, from their off-planet reserves, they pay the spice to you instead of to the Spice Bank. You are able to make three types of shipment: (1) you may ship normally from off planet reserves, (2) you may ship any number of forces from any one territory to any other territory on the board, or (3) you may ship any number of forces from any one territory back to your reserves. You pay half the normal fee when shipping your forces, and pay 1 spice for every 2 of your forces shipped back to reserves."
  },
  alliance: "Allies may ship from their off-planet reserves onto Dune or cross-ship from one territory to another with forces that are already on Dune at the half-price rate. In addition, allies win with the Spacing Guild Special Victory Condition.",
  specialVictory: "If no faction has been able to win the game by the end of play, you automatically win the game.",
  advanced: {
    karama: "You may use a Karama Card to stop one off-planet shipment of any one player.",
    shipment: "You may take your shipment and move action out of turn. This would allow you to go first or last or in between other players' turns, however you wish. The rest of the factions must make their shipments and moves in the proper sequence. You do not have to reveal when you intend to make your shipment and movement until the moment you wish to take it."
  },
  // Their special victory. Karama cannot stop a win condition.
  unsuppressable: ["specialVictory"],
  karamaStops: {
    "abilities.shipment": { stops: "Collecting the shipping fees, and shipping at half rate.", enforced: true },
    "abilities.shipment#kinds": { stops: "Shipping between territories, and back to reserves.", enforced: true },
    "advanced.shipment": { stops: "Taking their shipment and move out of turn.", enforced: true }
  },
  leaders: [
    { name: "Staban Tuek", strength: 5 },
    { name: "Master Bewt", strength: 3 },
    { name: "Esmar Tuek", strength: 3 },
    { name: "Soo-Soo Sook", strength: 2 },
    { name: "Guild Representative", strength: 1 }
  ]
};
var BENE_GESSERIT = {
  id: "bene-gesserit",
  name: "Bene Gesserit",
  startingSpice: 5,
  forces: {
    onPlanet: 1,
    placement: { kind: "fixed", territoryId: "territory-03" },
    // Polar Sink
    reserves: 19,
    starred: 0
  },
  reservesHeld: "off-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 1,
  abilities: {
    beforeGame: "When selecting this faction you secretly predict when one other faction will win, choosing the turn number and faction, this will remain a secret until game end. If your prediction is correct, your prediction is revealed and you and your allies win the game and win alone, you cannot predict the spacing-guild or Fremen will win with their special victory conditions",
    shipment: "Whenever any other faction ships forces onto Dune from off-planet, you may ship 1 force for free from your reserves into the Polar Sink. You may also ship normally, of course.",
    battle: "You may Voice your opponent to do as you wish with respect to one of the cards they play in their battle. For instance, to play or not play a specific weapon (poison weapon, projectile weapon, or lasgun) or defense (snooper or shield), a worthless card, or a cheap hero. If your opponent cannot comply with your command, they may do as they wish."
  },
  alliance: "You may Voice an ally opponent",
  advanced: {
    beforeGame: "After the fremen placement in the first turn (if that faction is in the game) you start with one peaceful advisor in any territory of your choice. If you are alone in the territory, the advisor turns into a fighter.",
    shipment: "Whenever any other faction ships forces to Dune from off-planet, you may ship for free one advisor from your reserves into that same territory (instead of the Polar Sink).",
    charity: "You always receive CHOAM charity of 2 spice regardless of how many spice you already have.",
    // NOT from docs/dune-advance-rules.md — that file lists Karama powers for
    // five factions and omits the Bene Gesserit entirely, which is how their
    // absence came to be read as "they get nothing". This wording is mine and
    // wants replacing with yours.
    treachery: "You may play a Worthless Card as though it were a Karama Card.",
    advisors: "Advisors coexist peacefully with other faction forces in the same territory. Advisors have no effect on the play of the other factions whatsoever and cannot collect spice, be involved in combat, prevent another faction from challenging a stronghold (second force), use ornithopters, or play Family Atomics. Advisors are susceptible to storms, sandworms, lasgun/shield explosions, and atomics.",
    fighters: "When you ship forces into an unoccupied territory, you must ship as fighters. If you move advisors into an unoccupied territory they turn into fighters. If you move advisors into occupied territories they remain as advisors or flip to fighters; fighters follow the same rules for battles. When another faction ships or moves into a territory where you have fighters, you may flip them to advisors.",
    battle: "On each turn after the Spice Blow and Nexus Phase and before any shipment occurs, in all territories in which you have advisors and wish to battle, announce you are doing so and turn all those advisors to fighters."
  },
  // The prediction win, which lives in abilities.beforeGame rather than in
  // specialVictory — see the note on Faction.unsuppressable.
  unsuppressable: ["abilities.beforeGame"],
  karamaStops: {
    "abilities.shipment": { stops: "Shipping one force free into the Polar Sink.", enforced: false },
    "abilities.battle": { stops: "The Voice: commanding one card in an opponent battle plan.", enforced: true },
    "advanced.shipment": { stops: "Shipping one advisor free into a territory somebody else ships into.", enforced: false },
    "advanced.charity": { stops: "Always collecting CHOAM charity, whatever they hold.", enforced: false },
    "advanced.advisors": { stops: "Advisors sharing a territory without a fight.", enforced: false },
    "advanced.fighters": { stops: "Flipping fighters to advisors when somebody arrives.", enforced: false },
    "advanced.battle": { stops: "Standing advisors up as fighters before the shipment.", enforced: false }
  },
  leaders: [
    { name: "Mother Ramallo", strength: 5 },
    { name: "Wanna Yueh", strength: 5 },
    { name: "Margot Lady Fenring", strength: 5 },
    { name: "Princess Irulan", strength: 5 },
    { name: "Alia", strength: 5 }
  ]
};
var HARKONNEN = {
  id: "harkonnen",
  name: "Harkonnen",
  startingSpice: 10,
  forces: {
    onPlanet: 10,
    placement: { kind: "fixed", territoryId: "territory-26" },
    // Carthag
    reserves: 10,
    starred: 0
  },
  reservesHeld: "off-planet",
  handLimit: 8,
  startingTreachery: 2,
  freeRevivals: 2,
  abilities: {
    traitors: "At the start of the game when you draw 4 Traitor Cards, you keep them all, including your own, and any leader cards of other factions can be revealed in a battle as a traitor.",
    treachery: "You may hold up to 8 Treachery Cards. When you have 8 cards you must pass during bidding. At the beginning of the game you are dealt 2 cards instead of 1, and every time you buy a card you get an extra card for free from the Treachery Deck (unless you are at 7 cards, because you can never have more than 8 in your hand)."
  },
  alliance: "Traitor Cards that you hold may be used against your ally's opponent if you so choose",
  advanced: {
    karama: "You may use a Karama Card to take without looking any number of cards, up to the entire hand of any one player of your choice. For each card you take, you must give that player one of your cards in return.",
    capturedLeaders: "Every time you win a battle, you can either randomly select 1 leader from the loser (including the leader used in battle, if not killed, but excluding all leaders already used elsewhere that turn) and place the Leader Disc face down into the Tleilaxu Tanks to gain 2 spice from the Spice Bank; or you can keep the leader and use it once in a battle, after which, if it was not killed during that battle, you must return that leader to its faction. When all of your own leaders have been killed, you must return all captured leaders immediately to their factions. Killed leaders are put in the Tleilaxu Tanks from which their factions can revive them (subject to revival rules). A captured leader used in battle may be claimed as a traitor"
  },
  unsuppressable: [],
  karamaStops: {
    "abilities.treachery": { stops: "The extra Treachery Card they draw whenever they buy one.", enforced: true },
    "advanced.capturedLeaders": { stops: "Capturing a leader from a battle they win.", enforced: false }
  },
  leaders: [
    { name: "Feyd-Rautha", strength: 6 },
    { name: "Beast Rabban", strength: 4 },
    { name: "Piter De Vries", strength: 3 },
    { name: "Captain Iakin Nefud", strength: 2 },
    { name: "Umman Kudu", strength: 1 }
  ]
};
var FACTIONS = {
  atreides: ATREIDES,
  emperor: EMPEROR,
  fremen: FREMEN,
  "spacing-guild": SPACING_GUILD,
  harkonnen: HARKONNEN,
  "bene-gesserit": BENE_GESSERIT
};

// src/lib/dune/truthtrance.ts
function planFromRow(row) {
  return {
    leader: row.leader ? { kind: "leader", name: row.leader } : row.cheapHero ? { kind: "cheap-hero" } : { kind: "none" },
    dialled: row.dial ?? 0,
    weapon: row.weapon ?? null,
    defence: row.defence ?? null
  };
}
var cardById = (id) => TREACHERY_CARDS.find((c) => c.id === id);
var allLeaders = () => FACTION_IDS.flatMap((id) => FACTIONS[id]?.leaders.map((l) => l.name) ?? []);
var nameWithArticle = (c) => `${c.copies === 1 ? "the" : "a"} ${c.name}`;
var KIND_WORDS = {
  weapon: "a weapon",
  defense: "a defence",
  special: "a special card",
  worthless: "a worthless card"
};
function phraseQuestion(q) {
  switch (q.ask) {
    case "holds-card": {
      const c = cardById(q.cardId);
      return `Do you hold ${c ? nameWithArticle(c) : q.cardId}?`;
    }
    case "holds-kind":
      return `Do you hold ${KIND_WORDS[q.kind]}?`;
    case "holds-weapon-of-class":
      return `Do you hold a ${q.battleClass} weapon?`;
    case "holds-defence-of-class":
      return `Do you hold a defence against ${q.battleClass}?`;
    case "traitor-is":
      return `Is ${q.leader} your traitor?`;
    case "traitor-in-faction":
      return `Do you hold a traitor from the ${FACTIONS[q.faction]?.name ?? q.faction}?`;
    case "spice-at-least":
      return `Do you have at least ${q.amount} spice?`;
    case "predicted-faction":
      return `Did you predict the ${FACTIONS[q.faction]?.name ?? q.faction}?`;
    case "predicted-turn":
      return `Did you predict turn ${q.turn}?`;
    case "plan-leader-is":
      return `Is ${q.leader} your leader in this battle?`;
    case "plan-uses-cheap-hero":
      return "Are you using a Cheap Hero in this battle?";
    case "plan-has-weapon":
      return "Are you playing a weapon in this battle?";
    case "plan-has-defence":
      return "Are you playing a defence in this battle?";
    case "plan-weapon-of-class":
      return `Are you playing a ${q.battleClass} weapon in this battle?`;
    case "plan-defence-of-class":
      return `Are you playing a defence against ${q.battleClass} in this battle?`;
    case "plan-dialled-at-least":
      return `Have you dialled at least ${q.amount} forces?`;
  }
}
function truthtranceBank(opts = {}) {
  const maxSpice = opts.maxSpice ?? 20;
  const maxDial = opts.maxDial ?? 20;
  const kinds = ["weapon", "defense", "special", "worthless"];
  const classes = ["poison", "projectile"];
  return [
    ...TREACHERY_CARDS.map((c) => ({ ask: "holds-card", cardId: c.id })),
    ...kinds.map((kind) => ({ ask: "holds-kind", kind })),
    ...classes.map((battleClass) => ({ ask: "holds-weapon-of-class", battleClass })),
    ...classes.map((battleClass) => ({ ask: "holds-defence-of-class", battleClass })),
    ...allLeaders().map((leader) => ({ ask: "traitor-is", leader })),
    ...FACTION_IDS.map((faction) => ({ ask: "traitor-in-faction", faction })),
    ...Array.from({ length: maxSpice }, (_, i) => ({ ask: "spice-at-least", amount: i + 1 })),
    ...FACTION_IDS.map((faction) => ({ ask: "predicted-faction", faction })),
    ...Array.from({ length: 10 }, (_, i) => ({ ask: "predicted-turn", turn: i + 1 })),
    ...allLeaders().map((leader) => ({ ask: "plan-leader-is", leader })),
    { ask: "plan-uses-cheap-hero" },
    { ask: "plan-has-weapon" },
    { ask: "plan-has-defence" },
    ...classes.map((battleClass) => ({ ask: "plan-weapon-of-class", battleClass })),
    ...classes.map((battleClass) => ({ ask: "plan-defence-of-class", battleClass })),
    ...Array.from({ length: maxDial }, (_, i) => ({ ask: "plan-dialled-at-least", amount: i + 1 }))
  ];
}
var isPredictionQuestion = (q) => q.ask === "predicted-faction" || q.ask === "predicted-turn";
var isBattlePlanQuestion = (q) => q.ask.startsWith("plan-");
function askTruthtrance(input) {
  const { asker, target, question: q, secrets, turn, phase } = input;
  const no = (refusal) => ({ ok: false, refusal });
  if (asker === target) return no("target-is-self");
  const answered = (answer) => ({
    ok: true,
    answer: { asker, target, question: q, asked: phraseQuestion(q), answer, asOf: { turn, phase } }
  });
  if (isPredictionQuestion(q)) {
    if (target !== "bene-gesserit") return no("not-the-bene-gesserit");
    if (!secrets.prediction) return no("no-prediction-made");
    if (q.ask === "predicted-faction") {
      if (!FACTION_IDS.includes(q.faction)) return no("no-such-faction");
      return answered(secrets.prediction.faction === q.faction);
    }
    if (q.turn < 1 || q.turn > 10 || !Number.isInteger(q.turn)) return no("turn-out-of-range");
    return answered(secrets.prediction.turn === q.turn);
  }
  if (isBattlePlanQuestion(q)) {
    const battle = secrets.battle;
    if (!battle) return no("no-battle-in-progress");
    if (battle.revealed) return no("plans-already-revealed");
    if (!battle.combatants.includes(target)) return no("not-in-this-battle");
    if (!battle.combatants.every((c) => battle.plans[c])) return no("plans-not-all-committed");
    const plan = battle.plans[target];
    if (!plan) return no("no-secret-for-seat");
    const inSlot = (id) => id === null ? void 0 : cardById(id);
    switch (q.ask) {
      case "plan-leader-is":
        if (!allLeaders().includes(q.leader)) return no("no-such-leader");
        return answered(plan.leader.kind === "leader" && plan.leader.name === q.leader);
      case "plan-uses-cheap-hero":
        return answered(plan.leader.kind === "cheap-hero");
      case "plan-has-weapon":
        return answered(inSlot(plan.weapon)?.kind === "weapon");
      case "plan-has-defence":
        return answered(inSlot(plan.defence)?.kind === "defense");
      case "plan-weapon-of-class": {
        const c = inSlot(plan.weapon);
        return answered(c?.kind === "weapon" && c.subtype === q.battleClass);
      }
      case "plan-defence-of-class": {
        const c = inSlot(plan.defence);
        return answered(c?.kind === "defense" && c.subtype === q.battleClass);
      }
      case "plan-dialled-at-least":
        if (!Number.isInteger(q.amount) || q.amount < 1) return no("amount-out-of-range");
        return answered(plan.dialled >= q.amount);
    }
  }
  switch (q.ask) {
    case "holds-card":
    case "holds-kind":
    case "holds-weapon-of-class":
    case "holds-defence-of-class": {
      const hand = secrets.hands[target];
      if (!hand) return no("no-secret-for-seat");
      const cards = hand.map(cardById).filter((c) => !!c);
      if (q.ask === "holds-card") {
        if (!cardById(q.cardId)) return no("no-such-card");
        return answered(hand.includes(q.cardId));
      }
      if (q.ask === "holds-kind") return answered(cards.some((c) => c.kind === q.kind));
      const kind = q.ask === "holds-weapon-of-class" ? "weapon" : "defense";
      return answered(cards.some((c) => c.kind === kind && c.subtype === q.battleClass));
    }
    case "traitor-is": {
      const held = secrets.traitors[target];
      if (!held) return no("no-secret-for-seat");
      if (!allLeaders().includes(q.leader)) return no("no-such-leader");
      return answered(held.includes(q.leader));
    }
    case "traitor-in-faction": {
      const held = secrets.traitors[target];
      if (!held) return no("no-secret-for-seat");
      if (!FACTION_IDS.includes(q.faction)) return no("no-such-faction");
      const theirs = FACTIONS[q.faction]?.leaders.map((l) => l.name) ?? [];
      return answered(held.some((name) => theirs.includes(name)));
    }
    case "spice-at-least": {
      const spice = secrets.spice[target];
      if (spice === void 0) return no("no-secret-for-seat");
      if (!Number.isInteger(q.amount) || q.amount < 1) return no("amount-out-of-range");
      return answered(spice >= q.amount);
    }
  }
  return no("no-secret-for-seat");
}
export {
  askTruthtrance,
  isBattlePlanQuestion,
  isPredictionQuestion,
  phraseQuestion,
  planFromRow,
  truthtranceBank
};
