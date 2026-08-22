/**
 * Truthtrance, rebuilt so a server can enforce it.
 *
 * The printed card says: ask any player any yes/no question, and they must
 * answer truthfully. A server cannot hold anyone to that. It can neither parse
 * an arbitrary question nor check an arbitrary answer, and the questions players
 * most want to ask — will you ally with me, are you coming for Arrakeen — are
 * about INTENT, which is not state at all and never becomes checkable.
 *
 * So the card changes hands: the holder names another player and picks a
 * question from a fixed set, and the SERVER answers it out of the secret store.
 * Nobody is trusted, so nobody can lie. Question and answer are both public.
 *
 * WHAT MAKES A QUESTION ENFORCEABLE. Exactly one thing: its answer is a pure
 * function of state the server holds. That makes this file the other half of the
 * secret store — every template below names a secret, and a secret nothing asks
 * about is one nothing here can offer. The store does not exist yet (see the
 * foot of types/Dune/Game.ts), so TruthtranceSecrets is written as the contract
 * it must satisfy rather than as a mirror of something already built.
 *
 * TEMPLATES, NOT A LIST. Nine templates with typed parameters, not two hundred
 * questions. Each template is one function and one secret; the parameter does
 * the rest. "Is Duncan Idaho your traitor" and "is Stilgar your traitor" should
 * not be two entries in a table that can drift apart.
 *
 * AN ANSWER IS A FACT ABOUT A MOMENT. Hands, spice and traitors all move.
 * "Do you hold a Karama" answered on turn 3 is not a claim about turn 5, so the
 * answer carries the turn and phase it was true in. Without that the log reads
 * as a standing fact and players will use it as one.
 *
 * WHAT IT COSTS. The bluffing is gone — the original card's bite was watching
 * somebody squirm, and a server answering from a table has none of that. What
 * replaces it is that the answer is worth something: under the printed rules a
 * liar simply lies, and everyone knows it, so the card is mostly a bluff
 * detector for players who were never going to be honest anyway.
 *
 * ASKING COSTS THE ASKER TOO. The question is public, so asking "do you hold
 * the Lasgun" tells the table what you are afraid of. That is deliberate and
 * worth keeping: a free question would be strictly better than no question.
 */
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { FACTIONS, FACTION_IDS } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'
import type { GamePhase } from '@/types/Dune/Game'
import type { TreacheryCard, TreacheryKind } from '@/types/Dune/Treachery'

/** The two classes a defence can answer. `lasgun` is not among them by rule. */
export type AskableClass = 'poison' | 'projectile'

/**
 * The nine questions, as data.
 *
 * Plain objects of primitives on purpose: a question is chosen on a client,
 * travels to the server, is answered there and is written into a public log, so
 * it goes through JSON at least twice. Same reason the pause continuations in
 * ./phase.ts are data — see the note there.
 */
export type TruthtranceQuestion =
  /** Named card. The sharpest question in the bank, and the most expensive to
   *  ask, because naming a card says what you are frightened of. */
  | { ask: 'holds-card'; cardId: string }
  | { ask: 'holds-kind'; kind: TreacheryKind }
  /** A weapon of this class — the thing a battle plan is actually afraid of. */
  | { ask: 'holds-weapon-of-class'; battleClass: AskableClass }
  /** ...and whether they can answer one. */
  | { ask: 'holds-defence-of-class'; battleClass: AskableClass }
  | { ask: 'traitor-is'; leader: string }
  | { ask: 'traitor-in-faction'; faction: FactionId }
  /** Spice is held behind the shield, so this is the bidding question. */
  | { ask: 'spice-at-least'; amount: number }
  /** Both only askable of the Bene Gesserit, and one bit each — so cracking the
   *  prediction outright takes two cards or a good guess. */
  | { ask: 'predicted-faction'; faction: FactionId }
  | { ask: 'predicted-turn'; turn: number }
  /** The seven below read a COMMITTED battle plan, and are legal only in the
   *  window described on TruthtranceSecrets.battle. */
  | { ask: 'plan-leader-is'; leader: string }
  | { ask: 'plan-uses-cheap-hero' }
  | { ask: 'plan-has-weapon' }
  | { ask: 'plan-has-defence' }
  | { ask: 'plan-weapon-of-class'; battleClass: AskableClass }
  | { ask: 'plan-defence-of-class'; battleClass: AskableClass }
  | { ask: 'plan-dialled-at-least'; amount: number }

/**
 * The slice of the secret store this reads.
 *
 * Partial by seat because a game is two to six factions, not always six. That
 * makes a MISSING seat different from an empty one, and the difference matters:
 * a seat with no hand recorded must be an error, never a silent "no". A server
 * that answers "no, they hold no Karama" because it failed to load their hand
 * has lied under a rule whose entire promise is that it cannot.
 */
/**
 * A battle plan as committed: who leads, how many forces, and the two cards.
 *
 * The card slots hold card IDS, not classes, because a WORTHLESS card can be
 * played in either slot. That is the whole of the bluff — a Jubba Cloak in the
 * weapon slot looks exactly like a weapon until the reveal — and it is why
 * "are you playing a weapon?" reads the card's kind rather than asking whether
 * the slot is occupied. How many cards someone played is visible at the table
 * anyway; what they are is not.
 */
export type PlanLeader =
  | { kind: 'leader'; name: string }
  | { kind: 'cheap-hero' }

export interface CommittedPlan {
  leader: PlanLeader
  /** Forces committed to the wheel. Zero is a legal dial. */
  dialled: number
  /** Card id, or null for an empty slot. */
  weapon: string | null
  defence: string | null
}

export interface TruthtranceSecrets {
  /** Treachery card ids, per seat. */
  hands: Partial<Record<FactionId, readonly string[]>>
  /** Leader names, per seat. Harkonnen keep four; everyone else one. */
  traitors: Partial<Record<FactionId, readonly string[]>>
  spice: Partial<Record<FactionId, number>>
  /** The Bene Gesserit's, made at setup. Absent before it is made. */
  prediction?: { faction: FactionId; turn: number }
  /**
   * The battle in progress, if there is one.
   *
   * THE WINDOW IS THE WHOLE DESIGN HERE. Battle plan questions are answerable
   * only once EVERY combatant has committed, and only before the reveal.
   *
   * Not a fussy restriction — it is what stops the card breaking simultaneity.
   * Plans are meant to be written blind and turned over together. Digitally the
   * commits arrive at different moments and the server knows it, so a card that
   * could be played in that gap would read one plan and then write its own
   * against it. That is not a strong card, it is the end of the phase as a
   * phase.
   *
   * Waiting for every commit also settles the balance question the bank
   * otherwise raises. The Atreides power sees one element of a plan BEFORE
   * committing, which is what makes it worth a faction. Truthtrance sees one bit
   * AFTER everyone has committed, which cannot change anyone's plan and is
   * therefore strictly the weaker thing — it informs a Karama, an alliance, and
   * the next battle, and that is all.
   */
  battle?: {
    /** Everyone whose plan this battle is waiting on, allies included. */
    combatants: readonly FactionId[]
    plans: Partial<Record<FactionId, CommittedPlan>>
    /** Once true the plans are public and the card would be spent on nothing. */
    revealed: boolean
  }
}

export interface TruthtranceAnswer {
  asker: FactionId
  target: FactionId
  question: TruthtranceQuestion
  /** The wording, so the public log reads as English rather than as a tag. */
  asked: string
  answer: boolean
  /** When it was true. An answer is a fact about a moment, not a standing one. */
  asOf: { turn: number; phase: GamePhase }
}

/**
 * Why a question could not be asked.
 *
 * `no-secret-for-seat` is the important one and is deliberately not a `false`:
 * see the note on TruthtranceSecrets.
 */
export type TruthtranceRefusal =
  | 'target-is-self'
  | 'no-such-card'
  | 'no-such-leader'
  | 'no-such-faction'
  | 'amount-out-of-range'
  | 'turn-out-of-range'
  | 'not-the-bene-gesserit'
  | 'no-prediction-made'
  | 'no-secret-for-seat'
  | 'no-battle-in-progress'
  | 'plans-not-all-committed'
  | 'plans-already-revealed'
  | 'not-in-this-battle'

export type TruthtranceResult =
  | { ok: true; answer: TruthtranceAnswer }
  | { ok: false; refusal: TruthtranceRefusal }

const cardById = (id: string): TreacheryCard | undefined =>
  TREACHERY_CARDS.find(c => c.id === id)

const allLeaders = (): string[] =>
  FACTION_IDS.flatMap(id => FACTIONS[id]?.leaders.map(l => l.name) ?? [])

/** "the Lasgun" but "a Shield" — there is one of the first and four of the
 *  second, and the deck already knows which. */
const nameWithArticle = (c: TreacheryCard) =>
  `${c.copies === 1 ? 'the' : 'a'} ${c.name}`

const KIND_WORDS: Record<TreacheryKind, string> = {
  weapon: 'a weapon',
  defense: 'a defence',
  special: 'a special card',
  worthless: 'a worthless card',
}

/** The public wording. Second person, because it is asked of a player. */
export function phraseQuestion(q: TruthtranceQuestion): string {
  switch (q.ask) {
    case 'holds-card': {
      const c = cardById(q.cardId)
      return `Do you hold ${c ? nameWithArticle(c) : q.cardId}?`
    }
    case 'holds-kind':
      return `Do you hold ${KIND_WORDS[q.kind]}?`
    case 'holds-weapon-of-class':
      return `Do you hold a ${q.battleClass} weapon?`
    case 'holds-defence-of-class':
      return `Do you hold a defence against ${q.battleClass}?`
    case 'traitor-is':
      return `Is ${q.leader} your traitor?`
    case 'traitor-in-faction':
      return `Do you hold a traitor from the ${FACTIONS[q.faction]?.name ?? q.faction}?`
    case 'spice-at-least':
      return `Do you have at least ${q.amount} spice?`
    case 'predicted-faction':
      return `Did you predict the ${FACTIONS[q.faction]?.name ?? q.faction}?`
    case 'predicted-turn':
      return `Did you predict turn ${q.turn}?`
    case 'plan-leader-is':
      return `Is ${q.leader} your leader in this battle?`
    case 'plan-uses-cheap-hero':
      return 'Are you using a Cheap Hero in this battle?'
    case 'plan-has-weapon':
      return 'Are you playing a weapon in this battle?'
    case 'plan-has-defence':
      return 'Are you playing a defence in this battle?'
    case 'plan-weapon-of-class':
      return `Are you playing a ${q.battleClass} weapon in this battle?`
    case 'plan-defence-of-class':
      return `Are you playing a defence against ${q.battleClass} in this battle?`
    case 'plan-dialled-at-least':
      return `Have you dialled at least ${q.amount} forces?`
  }
}

/**
 * Every question the bank can offer, for a menu.
 *
 * Generated from the deck, the factions and their leaders rather than listed, so
 * a card or a leader added later is askable about without touching this file —
 * and so the menu cannot offer a question the answerer has never heard of.
 *
 * `maxSpice` and `maxDial` bound the two open-ended parameters. They are a UI
 * concern, not a rule: any amount is answerable, but a menu cannot show
 * infinitely many.
 *
 * The battle plan questions are always in the bank, even out of a battle. A menu
 * that hid them would leave a player unable to see what the card can do until
 * the moment they need it; asking one at the wrong time refuses with a reason,
 * which is what the menu should be showing instead.
 */
export function truthtranceBank(opts: { maxSpice?: number; maxDial?: number } = {}): TruthtranceQuestion[] {
  const maxSpice = opts.maxSpice ?? 20
  const maxDial = opts.maxDial ?? 20
  const kinds: TreacheryKind[] = ['weapon', 'defense', 'special', 'worthless']
  const classes: AskableClass[] = ['poison', 'projectile']
  return [
    ...TREACHERY_CARDS.map((c): TruthtranceQuestion => ({ ask: 'holds-card', cardId: c.id })),
    ...kinds.map((kind): TruthtranceQuestion => ({ ask: 'holds-kind', kind })),
    ...classes.map((battleClass): TruthtranceQuestion =>
      ({ ask: 'holds-weapon-of-class', battleClass })),
    ...classes.map((battleClass): TruthtranceQuestion =>
      ({ ask: 'holds-defence-of-class', battleClass })),
    ...allLeaders().map((leader): TruthtranceQuestion => ({ ask: 'traitor-is', leader })),
    ...FACTION_IDS.map((faction): TruthtranceQuestion => ({ ask: 'traitor-in-faction', faction })),
    ...Array.from({ length: maxSpice }, (_, i): TruthtranceQuestion =>
      ({ ask: 'spice-at-least', amount: i + 1 })),
    ...FACTION_IDS.map((faction): TruthtranceQuestion => ({ ask: 'predicted-faction', faction })),
    ...Array.from({ length: 10 }, (_, i): TruthtranceQuestion =>
      ({ ask: 'predicted-turn', turn: i + 1 })),
    ...allLeaders().map((leader): TruthtranceQuestion => ({ ask: 'plan-leader-is', leader })),
    { ask: 'plan-uses-cheap-hero' },
    { ask: 'plan-has-weapon' },
    { ask: 'plan-has-defence' },
    ...classes.map((battleClass): TruthtranceQuestion =>
      ({ ask: 'plan-weapon-of-class', battleClass })),
    ...classes.map((battleClass): TruthtranceQuestion =>
      ({ ask: 'plan-defence-of-class', battleClass })),
    ...Array.from({ length: maxDial }, (_, i): TruthtranceQuestion =>
      ({ ask: 'plan-dialled-at-least', amount: i + 1 })),
  ]
}

/** Which questions only the Bene Gesserit can be asked. */
export const isPredictionQuestion = (q: TruthtranceQuestion) =>
  q.ask === 'predicted-faction' || q.ask === 'predicted-turn'

/** Which questions read a committed battle plan, and so have a window. */
export const isBattlePlanQuestion = (q: TruthtranceQuestion) => q.ask.startsWith('plan-')

/**
 * Ask it.
 *
 * Pure and total: same inputs, same answer, and every path either answers or
 * refuses with a reason. Nothing here reads a clock or a random number, which is
 * the reducer contract the rest of lib/dune keeps.
 */
export function askTruthtrance(input: {
  asker: FactionId
  target: FactionId
  question: TruthtranceQuestion
  secrets: TruthtranceSecrets
  turn: number
  phase: GamePhase
}): TruthtranceResult {
  const { asker, target, question: q, secrets, turn, phase } = input
  const no = (refusal: TruthtranceRefusal): TruthtranceResult => ({ ok: false, refusal })

  // "one other player" — the card cannot be turned on its own holder.
  if (asker === target) return no('target-is-self')

  const answered = (answer: boolean): TruthtranceResult => ({
    ok: true,
    answer: { asker, target, question: q, asked: phraseQuestion(q), answer, asOf: { turn, phase } },
  })

  if (isPredictionQuestion(q)) {
    if (target !== 'bene-gesserit') return no('not-the-bene-gesserit')
    if (!secrets.prediction) return no('no-prediction-made')
    if (q.ask === 'predicted-faction') {
      if (!FACTION_IDS.includes(q.faction)) return no('no-such-faction')
      return answered(secrets.prediction.faction === q.faction)
    }
    if (q.turn < 1 || q.turn > 10 || !Number.isInteger(q.turn)) return no('turn-out-of-range')
    return answered(secrets.prediction.turn === q.turn)
  }

  if (isBattlePlanQuestion(q)) {
    const battle = secrets.battle
    if (!battle) return no('no-battle-in-progress')
    if (battle.revealed) return no('plans-already-revealed')
    if (!battle.combatants.includes(target)) return no('not-in-this-battle')
    // EVERY combatant, not just the target. See the note on secrets.battle: the
    // point is that nobody can still be writing a plan when this is answered.
    if (!battle.combatants.every(c => battle.plans[c])) return no('plans-not-all-committed')
    const plan = battle.plans[target]
    if (!plan) return no('no-secret-for-seat')

    /** The card in a slot, when there is one and the deck knows it. */
    const inSlot = (id: string | null) => id === null ? undefined : cardById(id)

    switch (q.ask) {
      case 'plan-leader-is':
        if (!allLeaders().includes(q.leader)) return no('no-such-leader')
        return answered(plan.leader.kind === 'leader' && plan.leader.name === q.leader)
      case 'plan-uses-cheap-hero':
        return answered(plan.leader.kind === 'cheap-hero')
      case 'plan-has-weapon':
        return answered(inSlot(plan.weapon)?.kind === 'weapon')
      case 'plan-has-defence':
        return answered(inSlot(plan.defence)?.kind === 'defense')
      case 'plan-weapon-of-class': {
        const c = inSlot(plan.weapon)
        return answered(c?.kind === 'weapon' && c.subtype === q.battleClass)
      }
      case 'plan-defence-of-class': {
        const c = inSlot(plan.defence)
        return answered(c?.kind === 'defense' && c.subtype === q.battleClass)
      }
      case 'plan-dialled-at-least':
        if (!Number.isInteger(q.amount) || q.amount < 1) return no('amount-out-of-range')
        return answered(plan.dialled >= q.amount)
    }
  }

  switch (q.ask) {
    case 'holds-card':
    case 'holds-kind':
    case 'holds-weapon-of-class':
    case 'holds-defence-of-class': {
      const hand = secrets.hands[target]
      if (!hand) return no('no-secret-for-seat')
      const cards = hand.map(cardById).filter((c): c is TreacheryCard => !!c)
      if (q.ask === 'holds-card') {
        if (!cardById(q.cardId)) return no('no-such-card')
        return answered(hand.includes(q.cardId))
      }
      if (q.ask === 'holds-kind') return answered(cards.some(c => c.kind === q.kind))
      const kind = q.ask === 'holds-weapon-of-class' ? 'weapon' : 'defense'
      return answered(cards.some(c => c.kind === kind && c.subtype === q.battleClass))
    }

    case 'traitor-is': {
      const held = secrets.traitors[target]
      if (!held) return no('no-secret-for-seat')
      if (!allLeaders().includes(q.leader)) return no('no-such-leader')
      return answered(held.includes(q.leader))
    }

    case 'traitor-in-faction': {
      const held = secrets.traitors[target]
      if (!held) return no('no-secret-for-seat')
      if (!FACTION_IDS.includes(q.faction)) return no('no-such-faction')
      const theirs = FACTIONS[q.faction]?.leaders.map(l => l.name) ?? []
      return answered(held.some(name => theirs.includes(name)))
    }

    case 'spice-at-least': {
      const spice = secrets.spice[target]
      if (spice === undefined) return no('no-secret-for-seat')
      if (!Number.isInteger(q.amount) || q.amount < 1) return no('amount-out-of-range')
      return answered(spice >= q.amount)
    }
  }

  // Unreachable: the prediction and battle plan questions are handled above and
  // the switch covers the rest. Present because the compiler can no longer see
  // that, and because falling off the end of a function whose promise is a true
  // answer should be a refusal rather than undefined.
  return no('no-secret-for-seat')
}
