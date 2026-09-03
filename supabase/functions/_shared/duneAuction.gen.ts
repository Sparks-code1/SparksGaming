// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/auctionSettlement.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact auction settlement the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/dune/spice.ts
var BANK = "bank";
function applySpiceMoves(purses, moves) {
  const next = { ...purses };
  for (const move of moves) {
    if (!Number.isInteger(move.amount)) return { ok: false, refusal: "not-a-whole-number", move };
    if (move.amount <= 0) return { ok: false, refusal: "not-positive", move };
    if (move.from === move.to) return { ok: false, refusal: "same-holder", move };
    if (move.from !== BANK && (next[move.from] ?? 0) < move.amount) {
      return { ok: false, refusal: "insufficient-spice", move };
    }
    if (move.from !== BANK) next[move.from] = (next[move.from] ?? 0) - move.amount;
    if (move.to !== BANK) next[move.to] = (next[move.to] ?? 0) + move.amount;
  }
  return { ok: true, purses: next, applied: moves };
}
function payForTreachery(input) {
  const { winner, price, seated } = input;
  if (price <= 0) return [];
  const emperorPlaying = seated.includes("emperor");
  const to = emperorPlaying && winner !== "emperor" ? "emperor" : BANK;
  return [{ from: winner, to, amount: price, reason: "treachery-bid" }];
}
function allyShare(cost, ownPurse) {
  const own = Math.min(cost, Math.max(0, ownPurse));
  return { own, ally: cost - own };
}
function payForAuction(awards, seated) {
  return awards.flatMap((a) => payForTreachery({ winner: a.winner, price: a.price, seated }));
}

// src/data/dune/factions.ts
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
    "abilities.movement": { stops: "Moving two territories instead of one.", enforced: true },
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
    "abilities.shipment": { stops: "Shipping one force free into the Polar Sink.", enforced: true },
    "abilities.battle": { stops: "The Voice: commanding one card in an opponent battle plan.", enforced: true },
    "advanced.shipment": { stops: "Shipping one advisor free into a territory somebody else ships into.", enforced: true },
    "advanced.charity": { stops: "Always collecting CHOAM charity, whatever they hold.", enforced: true },
    "advanced.advisors": { stops: "Advisors sharing a territory without a fight.", enforced: true },
    "advanced.fighters": { stops: "Flipping fighters to advisors when somebody arrives.", enforced: true },
    "advanced.battle": { stops: "Standing advisors up as fighters before the shipment.", enforced: true }
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
var factionById = (id) => FACTIONS[id] ?? null;
var DEFAULT_HAND_LIMIT = 4;
function handLimitOf(faction) {
  return factionById(faction)?.handLimit ?? DEFAULT_HAND_LIMIT;
}

// src/lib/dune/auctionSettlement.ts
var BONUS_FACTION = "harkonnen";
function bonusCardsDue(awards, handAfter, limit) {
  const won = awards.filter((a) => a.winner === BONUS_FACTION).length;
  return Math.max(0, Math.min(won, limit - handAfter));
}
function settleCard(input) {
  const { award, card, hands, purses, seated } = input;
  const bonus = input.bonus ?? [];
  const moves = (award.winner === input.freeFor ? [] : payForAuction([award], seated)).flatMap((m) => {
    if (m.from !== award.winner || !input.ally) return [m];
    const share = allyShare(m.amount, purses[award.winner] ?? 0);
    if (share.ally <= 0) return [m];
    return [
      ...share.own > 0 ? [{ ...m, amount: share.own }] : [],
      { ...m, from: input.ally, amount: share.ally }
    ];
  }).filter((m) => m.from !== m.to);
  const paid = applySpiceMoves(purses, moves);
  if (!paid.ok) {
    return {
      ok: false,
      refusal: "a-winner-cannot-pay",
      detail: `${paid.move.from} owes ${paid.move.amount} and cannot pay it (${paid.refusal})`
    };
  }
  const secrets = {};
  const touch = (who) => {
    if (!secrets[who]) {
      secrets[who] = { hand: [...hands[who] ?? []], spice: paid.purses[who] ?? 0 };
    }
    return secrets[who];
  };
  touch(award.winner).hand.push(card);
  for (const move of moves) {
    if (move.from !== "bank") touch(move.from);
    if (move.to !== "bank") touch(move.to);
  }
  const limit = input.limits?.[BONUS_FACTION] ?? handLimitOf(BONUS_FACTION);
  const handAfter = (secrets[BONUS_FACTION]?.hand ?? hands[BONUS_FACTION] ?? []).length;
  const due = Math.min(
    bonusCardsDue([award], handAfter, limit),
    input.deckHolds ?? Infinity
  );
  if (due > bonus.length) {
    return {
      ok: false,
      refusal: "not-enough-bonus-cards",
      detail: `${BONUS_FACTION} is due ${due} extra card(s) and ${bonus.length} were supplied`
    };
  }
  for (let i = 0; i < due; i++) touch(BONUS_FACTION).hand.push(bonus[i]);
  return { ok: true, writes: { secrets, discard: [], moves } };
}
function settleAuction(input) {
  const { result, cards, hands, purses, seated } = input;
  const bonus = input.bonus ?? [];
  const offered = result.awards.length + result.unsold.length;
  if (cards.length !== offered) {
    return {
      ok: false,
      refusal: "wrong-number-of-cards",
      detail: `the auction settled ${offered} card(s) and ${cards.length} were drawn`
    };
  }
  const claimed = [...result.awards.map((a) => a.index), ...result.unsold].sort((a, b) => a - b);
  const expected = cards.map((_, i) => i);
  if (JSON.stringify(claimed) !== JSON.stringify(expected)) {
    return {
      ok: false,
      refusal: "a-card-was-lost",
      detail: `indices accounted for were [${claimed}], expected [${expected}]`
    };
  }
  let runningHands = { ...hands };
  let runningPurses = { ...purses };
  const secrets = {};
  const moves = [];
  let bonusTaken = 0;
  for (const award of result.awards) {
    const before = (runningHands[BONUS_FACTION] ?? []).length;
    const one = settleCard({
      award,
      card: cards[award.index],
      hands: runningHands,
      purses: runningPurses,
      seated,
      // The bonus cards not yet used, so a second award takes the ones after
      // the first's rather than dealing the same card twice.
      bonus: bonus.slice(bonusTaken),
      limits: input.limits
    });
    if (!one.ok) return one;
    const bonusHand = one.writes.secrets[BONUS_FACTION]?.hand;
    if (bonusHand) {
      const ownCard = award.winner === BONUS_FACTION ? 1 : 0;
      bonusTaken += Math.max(0, bonusHand.length - before - ownCard);
    }
    for (const [who, write] of Object.entries(one.writes.secrets)) {
      secrets[who] = write;
      runningHands = { ...runningHands, [who]: write.hand };
      runningPurses = { ...runningPurses, [who]: write.spice };
    }
    moves.push(...one.writes.moves);
  }
  return {
    ok: true,
    writes: { secrets, discard: result.unsold.map((i) => cards[i]), moves }
  };
}
export {
  BONUS_FACTION,
  bonusCardsDue,
  settleAuction,
  settleCard
};
