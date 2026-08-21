/**
 * The treachery deck.
 *
 * Rules text verbatim as written, with one exception marked FIXED below.
 *
 * Concatenation spacing was repaired throughout. The draft joined string pieces
 * without a space at the seam — 'Opponent may' + 'protect leader' reads as
 * "mayprotect" — so the text is written as single strings here. That is a typo
 * fix, not a rules change.
 */
import type { TreacheryCard } from '@/types/Dune/Treachery'

const KEEP_IF_WON = ' You may keep this card if you win this battle.'
// The five worthless cards say exactly the same thing, so they share one string
// rather than five copies that could drift apart.
const WORTHLESS = 'Play as part of your Battle Plan, in place of a weapon, defense, or both.'
  + '\n\nThis card has no value in play, and you can discard it only by playing it in your Battle Plan.'
const PLAY_IN_PLAN = 'Play as part of your Battle Plan.'

export const TREACHERY_CARDS: TreacheryCard[] = [
  // ── Projectile weapons ────────────────────────────────────────────────────
  // Four of them, one copy each, all with the same text and all stopped by a
  // Shield. They differ only by name.
  {
    id: 'crysknife',
    name: 'Crysknife',
    kind: 'weapon',
    subtype: 'projectile',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved."
      + ' Opponent may protect leader with a Shield.' + KEEP_IF_WON,
  },
  {
    id: 'stunner',
    name: 'Stunner',
    kind: 'weapon',
    subtype: 'projectile',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved."
      + ' Opponent may protect leader with a Shield.' + KEEP_IF_WON,
  },
  {
    id: 'sliptip',
    name: 'Slip Tip',
    kind: 'weapon',
    subtype: 'projectile',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved."
      + ' Opponent may protect leader with a Shield.' + KEEP_IF_WON,
  },
  {
    id: 'maulapistol',
    name: 'Maula Pistol',
    kind: 'weapon',
    subtype: 'projectile',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved."
      + ' Opponent may protect leader with a Shield.' + KEEP_IF_WON,
  },

  // ── Poison weapons ────────────────────────────────────────────────────────
  {
    id: 'gomjabbar',
    name: 'Gom Jabbar',
    kind: 'weapon',
    subtype: 'poison',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved."
      + ' Opponent may protect leader with a Snooper.' + KEEP_IF_WON,
  },
  {
    id: 'ellacadrug',
    name: 'Ellaca Drug',
    kind: 'weapon',
    subtype: 'poison',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved."
      + ' Opponent may protect leader with a Snooper.' + KEEP_IF_WON,
  },
  {
    id: 'chaumas',
    name: 'Chaumas',
    kind: 'weapon',
    subtype: 'poison',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved."
      + ' Opponent may protect leader with a Snooper.' + KEEP_IF_WON,
  },
  {
    id: 'chaumurky',
    name: 'Chaumurky',
    kind: 'weapon',
    subtype: 'poison',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved."
      + ' Opponent may protect leader with a Snooper.' + KEEP_IF_WON,
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
    id: 'lasgun',
    name: 'Lasgun',
    kind: 'weapon',
    subtype: 'lasgun',
    timing: 'battle-plan',
    copies: 1,
    text: PLAY_IN_PLAN + "\n\nAutomatically kills opponent's leader regardless of defense card used."
      + '\n\nYou may keep this card if you win this battle.'
      + "\n\nIf anyone plays a Shield in this battle all forces, leaders, and spice in this battle's"
      + ' territory are lost to the Tleilaxu Tanks. Both players lost this battle, no spice is paid'
      + ' for leaders, and all cards played are discarded.',
  },

  // ── Defences ──────────────────────────────────────────────────────────────
  {
    id: 'shield',
    name: 'Shield',
    kind: 'defense',
    subtype: 'projectile',
    timing: 'battle-plan',
    copies: 4,
    text: PLAY_IN_PLAN + '\n\nProtects your leader from a projectile weapon in this battle.'
      + '\n\nYou may keep this card if you win this battle.',
  },
  {
    id: 'snooper',
    name: 'Snooper',
    kind: 'defense',
    subtype: 'poison',
    timing: 'battle-plan',
    copies: 4,
    text: PLAY_IN_PLAN + '\n\nProtects your leader from a poison weapon in this battle.'
      + '\n\nYou may keep this card if you win this battle.',
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
    id: 'baliset',
    name: 'Baliset',
    kind: 'worthless',
    subtype: 'none',
    timing: 'battle-plan',
    copies: 1,
    image: '/treachery/baliset.svg',
    text: WORTHLESS,
  },
  {
    id: 'jubbacloak',
    name: 'Jubba Cloak',
    kind: 'worthless',
    subtype: 'none',
    timing: 'battle-plan',
    copies: 1,
    image: '/treachery/jubba-cloak.svg',
    text: WORTHLESS,
  },
  {
    id: 'kulon',
    name: 'Kulon',
    kind: 'worthless',
    subtype: 'none',
    timing: 'battle-plan',
    copies: 1,
    image: '/treachery/kulon.svg',
    text: WORTHLESS,
  },
  {
    id: 'lalala',
    name: 'LA, LA, LA',
    kind: 'worthless',
    subtype: 'none',
    timing: 'battle-plan',
    copies: 1,
    image: '/treachery/la-la-la.svg',
    text: WORTHLESS,
  },
  {
    id: 'triptogamont',
    name: 'Trip to Gamont',
    kind: 'worthless',
    subtype: 'none',
    timing: 'battle-plan',
    copies: 1,
    image: '/treachery/trip-to-gamont.svg',
    text: WORTHLESS,
  },

  // ── Specials ──────────────────────────────────────────────────────────────
  {
    id: 'cheaphero',
    name: 'Cheap Hero',
    kind: 'special',
    subtype: 'leader',
    timing: 'battle-plan',
    copies: 3,
    text: 'Play as a leader with zero strength on your Battle Plan and discard after the battle.'
      + '\n\nYou may also play a weapon and a defense. The cheap hero may be played in place of a'
      + ' leader or when you have no leaders available.',
  },
  {
    id: 'truthtrance',
    name: 'Truthtrance',
    kind: 'special',
    subtype: 'information',
    timing: 'any-time',
    copies: 2,
    // PRESENT, though it was described as deliberately absent. Left in place
    // rather than deleted: removing it takes the deck to 31 and that is a
    // decision about the deck, not a tidy-up. See the note at the foot.
    text: 'Publicly ask one other player a single yes/no question about the game that must be'
      + ' answered publicly.\n\nThe player must answer "yes or no truthfully".',
  },
  {
    id: 'tleilaxughola',
    name: 'Tleilaxu Ghola',
    kind: 'special',
    subtype: 'revival',
    timing: 'any-time',
    copies: 1,
    text: 'Play at any time to gain an extra revival.\n\nYou may immediately revive 1 of your leaders'
      + ' regardless of how many leaders you have in the tanks, or up to 5 of your forces from the'
      + ' Tleilaxu Tanks to your reserves at no cost in spice.',
  },
  {
    id: 'hajr',
    name: 'Hajr',
    kind: 'special',
    subtype: 'movement',
    timing: 'movement',
    copies: 1,
    text: 'Play during Movement Phase.'
      + '\n\nMake an extra on-planet force movement subject to normal movement rules.'
      + "\n\nThe forces you move may be a group you've already moved this phase or another group.",
  },
  {
    id: 'weathercontrol',
    name: 'Weather Control',
    kind: 'special',
    subtype: 'storm',
    timing: 'storm-before-roll',
    copies: 1,
    text: 'After the first game turn, play during the Storm Phase before the Storm Marker is moved.'
      + '\n\nWhen you play this card, you control the storm this phase and may move it from 0 to 10'
      + ' sectors in a counterclockwise direction.',
  },
  {
    id: 'karama',
    name: 'Karama',
    kind: 'special',
    subtype: 'none',
    timing: 'any-time',
    copies: 2,
    // Text by design, not by omission — there is more rules text here than a
    // picture would leave room for.
    textOnly: true,
    // The text below is the BASIC card. In the advanced game it gains a second,
    // alternative use: instead of stopping an opponent's advantage, spend it on
    // your own faction's Karama power. Those live on the factions rather than
    // here — see AdvancedRules.karama — because they differ per faction and the
    // card is the same card. Either use, not both, and it discards afterwards.
    text: 'After the factions complete their "At Start" actions and after game set-up, use this card'
      + ' to stop a player from using one of their faction advantages when they attempt to use it.'
      + ' Stops the use of that advantage during one game phase.'
      + '\n\nOr, this card may be used to do either of these things when appropriate:'
      + '\n\nPurchase a shipment of forces onto the planet at Guild rates (1/2 normal) not paid to'
      + ' the Spacing Guild, or'
      + '\n\nPurchase a Treachery Card without paying spice for it.'
      + '\n\nCannot be used to stop a win condition advantage. Discard after use.',
  },
  {
    id: 'familyatomics',
    name: 'Family Atomics',
    kind: 'special',
    subtype: 'storm',
    timing: 'storm-after-roll',
    copies: 1,
    text: 'After the first game turn, play after the storm movement is calculated, but before the'
      + ' storm is moved, but only if you have one or more forces on the Shield Wall or a territory'
      + ' adjacent to the Shield Wall with no storm between your sector and the Wall.'
      + '\n\nAll forces on the Shield Wall are destroyed.'
      + '\n\nThe Shield Wall now turns blue as a reminder. The Imperial Basin, Arrakeen, and Carthag'
      + ' are no longer protected from the Storm for the rest of the game.',
  },
]

// ─── The deck's size, and Truthtrance ────────────────────────────────────────
//
// The copies above sum to 33 WITH Truthtrance's two included. Truthtrance was
// described as deliberately absent while being present in the file, so one of
// two things is true and only you can say which:
//
//   the deck is meant to be 33 and Truthtrance belongs in it, or
//   the deck is meant to be 31 while Truthtrance is redesigned, or 33 once two
//   replacements arrive.
//
// tests/treacherytest.ts asserts 33 and names Truthtrance's contribution, so
// removing the card fails the count with a message that says why rather than
// just a number that moved.

// ─── What these cards need that does not exist ───────────────────────────────
//
// Battle plans. Twelve of the eighteen entries are `battle-plan` timing and
// there is no battle plan to put them in. Leader, weapon, defence and forces,
// committed together and revealed together.
//
// Leaders as objects with state. "Kills opponent's leader" needs a leader that
// can be alive, dead in the tanks, or captured — Leader is still a name and a
// number.
//
// Card retention. "You may keep this card if you win this battle" makes discard
// conditional on an outcome and on a choice, so battle resolution has to ask the
// winner rather than sweeping the table.
//
// The lasgun/Shield explosion. Forces, leaders AND spice in the territory are
// destroyed, both sides lose, no spice is paid for leaders, every card is
// discarded. That is five exceptions to normal resolution in one card, and it
// fires on the PAIR being on the table rather than on an opponent's choice —
// ruled: "anyone" includes the Lasgun's own owner.
//
// Cheap Hero. A leader-shaped thing that is not a leader, playable in the leader
// slot at strength zero. Battle plans need a leader slot that accepts either.
//
// Karama. The heaviest of them. It stops a faction advantage at the moment it is
// used, for one phase — so every faction power has to be something that can be
// asked about and switched off. They are prose strings today. It also needs to
// know which advantages are win conditions, because it cannot stop those.
//
// And in the advanced game it does double duty: five of the six factions gain a
// one-time power of their own, spendable INSTEAD of the cancellation. Those are
// data now, in AdvancedRules.karama. What they still need is somewhere to fire:
// the Atreides one reads another player's battle plan, the Harkonnen one takes
// cards blindly from a hand and gives cards back, the Fremen one puts a worm on
// the board from outside the deck, the Guild one cancels a shipment, and the
// Emperor one revives for free. Every phase they touch is unbuilt.
//
// Truthtrance. Pauses the whole game for a question, at any time, in any phase.
// phase.ts stops a phase; this stops the game, which is a different thing and
// wants a level above the phase.
//
// Two storm windows, not one. `beginStorm` opens one window after the roll and
// before the move, which is exactly where Family Atomics belongs. Weather
// Control is earlier and different in kind: it REPLACES the roll rather than
// reacting to it, so the phase needs a window before the roll as well.
//
// A board query Family Atomics depends on: "no storm between your sector and the
// Wall". Adjacency exists; a line of sight along the sector ring, in the
// direction the storm is coming from, does not.
//
// The Shield Wall turning blue. Cosmetic, but it is board rendering driven by
// game state — the board SVG is generated once and identical in every match, so
// this belongs in an overlay like the seat marks, not in the generator.
//
// Revival and the Tleilaxu Tanks, for the Ghola.
//
// Per-group movement tracking, for Hajr. Its whole point is that the forces it
// moves "may be a group you've already moved this phase" — which only means
// something if movement remembers which groups have gone. Nothing tracks that
// today, so the card cannot be told from an ordinary move. Hajr is the reason
// the movement phase needs that flag, and the card that breaks it.
