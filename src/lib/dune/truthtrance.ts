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

/**
 * The slice of the secret store this reads.
 *
 * Partial by seat because a game is two to six factions, not always six. That
 * makes a MISSING seat different from an empty one, and the difference matters:
 * a seat with no hand recorded must be an error, never a silent "no". A server
 * that answers "no, they hold no Karama" because it failed to load their hand
 * has lied under a rule whose entire promise is that it cannot.
 */
export interface TruthtranceSecrets {
  /** Treachery card ids, per seat. */
  hands: Partial<Record<FactionId, readonly string[]>>
  /** Leader names, per seat. Harkonnen keep four; everyone else one. */
  traitors: Partial<Record<FactionId, readonly string[]>>
  spice: Partial<Record<FactionId, number>>
  /** The Bene Gesserit's, made at setup. Absent before it is made. */
  prediction?: { faction: FactionId; turn: number }
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
  }
}

/**
 * Every question the bank can offer, for a menu.
 *
 * Generated from the deck, the factions and their leaders rather than listed, so
 * a card or a leader added later is askable about without touching this file —
 * and so the menu cannot offer a question the answerer has never heard of.
 *
 * `maxSpice` bounds the one open-ended parameter. It is a UI concern, not a
 * rule: any amount is answerable, but a menu cannot show infinitely many.
 */
export function truthtranceBank(opts: { maxSpice?: number } = {}): TruthtranceQuestion[] {
  const maxSpice = opts.maxSpice ?? 20
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
  ]
}

/** Which questions only the Bene Gesserit can be asked. */
export const isPredictionQuestion = (q: TruthtranceQuestion) =>
  q.ask === 'predicted-faction' || q.ask === 'predicted-turn'

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
}
