/**
 * Phases that stop mid-way and wait for a player.
 *
 * Most of a Dune turn is a function: state in, state out. Several phases are
 * not. The spice blow pauses so the Fremen can place the worms it handed back
 * before the next card is turned; bidding pauses on every player in sequence;
 * a battle pauses on two players at once while they commit their plans. In each
 * case the phase has to stop, name what it needs, and be picked up again later —
 * possibly on a different client, certainly after a round trip through the
 * database.
 *
 * That last part is the whole design constraint.
 *
 * The obvious implementations do not survive it. A generator holds its position
 * in a call stack; a callback holds it in a closure; an `await` holds it in a
 * suspended frame. None of those can be written to a jsonb column and read back
 * on another machine. So a pause here is DATA: everything needed to continue,
 * in a plain object, with a separate pure function to continue from it.
 *
 * The shape:
 *
 *   begin(input) -> Step
 *   answer(carry, whatThePlayerChose) -> Step
 *
 * where a `Step` is either `awaiting` — carrying who must answer, what they are
 * being asked, and the continuation — or `settled`, carrying the result. A
 * caller loops until it settles. A caller that cannot answer (a spectator, a
 * replay, a test) can drive it with empty answers and still reach the end.
 *
 * Two rules worth stating, because both are easy to break by accident:
 *
 *   `carry` must be serialisable. No functions, no class instances, no live
 *   references to anything. Test it by round-tripping through JSON — if that
 *   loses something, so will the database.
 *
 *   `from` is a list, not a single faction. Bidding asks one player at a time,
 *   but a battle asks two simultaneously, and a shape that only holds one would
 *   have to be widened later by whoever builds battles. Cheaper now.
 */
import type { FactionId } from '@/types/Dune/Faction'

/**
 * The phase has stopped.
 *
 * Two kinds of stop, and the difference is who is holding it up:
 *
 *   'required' — the phase is BLOCKED. Everyone in `from` must answer before it
 *   goes on. The Fremen placing worms is this: the next card cannot be turned
 *   until they have.
 *
 *   'optional' — the phase is OFFERING. Anyone in `from` may act, nobody has
 *   to, and it proceeds when the window shuts whether or not anyone did. Family
 *   Atomics is this: the card may be played between the storm's roll and its
 *   move, by whoever holds it, and usually nobody does.
 *
 * Collapsing them loses the distinction that matters to a caller — whether it is
 * waiting FOR someone or merely giving them the chance.
 */
export interface Awaiting<TAsk, TCarry> {
  status: 'awaiting'
  /** Whether the phase is blocked on an answer or merely offering one. */
  need: 'required' | 'optional'
  /**
   * When an optional window shuts. Stamped by whoever opened it, never read
   * from a clock here — the same rule the charity window follows, and for the
   * same reason: a window each client timed for itself would shut at six
   * different moments.
   *
   * A REQUIRED stop may carry one too — see `awaitingBy`. It used to be said
   * here that it could not, and bidding is the counterexample: the phase is
   * blocked on one player, and if they say nothing the clock passes for them.
   * That is still a required stop, because the phase cannot proceed until an
   * answer exists; the deadline only decides who supplies it.
   *
   * Absent means the stop ends when answered and not before.
   */
  closesAt?: number
  /**
   * Who must answer. More than one when the phase asks them simultaneously —
   * a battle's two sides commit at the same time and neither may see the other
   * first. The phase does not resume until every one of them has answered.
   */
  from: FactionId[]
  /** What they are being asked. Public: it says what is needed, never what
   *  anyone chose, so it is safe to show the whole table. */
  ask: TAsk
  /** Everything needed to resume. Plain data — see the note above. */
  carry: TCarry
}

/** The phase ran to the end. */
export interface Settled<TResult> {
  status: 'settled'
  result: TResult
}

export type Step<TAsk, TCarry, TResult> = Awaiting<TAsk, TCarry> | Settled<TResult>

/** A stop the phase is BLOCKED on: everyone in `from` must answer. */
export const awaiting = <TAsk, TCarry>(
  from: FactionId[], ask: TAsk, carry: TCarry,
): Awaiting<TAsk, TCarry> => ({ status: 'awaiting', need: 'required', from, ask, carry })

/**
 * A window the phase is OFFERING: anyone in `from` may act, nobody must.
 *
 * `closesAt` is when it shuts, and is the caller's to stamp. Passing nothing
 * makes a window that closes only when the caller says so, which is what a
 * hot-seat game or a test wants.
 */
export const offering = <TAsk, TCarry>(
  from: FactionId[], ask: TAsk, carry: TCarry, closesAt?: number,
): Awaiting<TAsk, TCarry> => ({ status: 'awaiting', need: 'optional', from, ask, carry, closesAt })

/**
 * A required stop with a deadline: blocked, but not forever.
 *
 * The phase cannot go on until `from` answers, AND if they have not answered by
 * `closesAt` the caller answers for them with whatever the rule says silence
 * means. Bidding is the case: a player who says nothing has passed.
 *
 * Distinct from `offering`, and the difference is what happens when the clock
 * runs out. An offered window that nobody takes simply shuts and the phase moves
 * on — nothing was owed. A required stop that times out still needs an answer,
 * and the caller supplies the default one; the phase is never left without a
 * decision, only without a decision anybody made.
 *
 * `closesAt` is stamped by the caller and never read from a clock here, the
 * same rule offering follows: a deadline each client timed for itself would
 * expire at six different moments.
 */
export const awaitingBy = <TAsk, TCarry>(
  from: FactionId[], ask: TAsk, carry: TCarry, closesAt: number,
): Awaiting<TAsk, TCarry> => ({ status: 'awaiting', need: 'required', from, ask, carry, closesAt })

export const settled = <TResult>(result: TResult): Settled<TResult> =>
  ({ status: 'settled', result })

/** True when the phase cannot proceed until someone answers. */
export function blocksOn<TAsk, TCarry, TResult>(
  step: Step<TAsk, TCarry, TResult>,
): step is Awaiting<TAsk, TCarry> {
  return step.status === 'awaiting' && step.need === 'required'
}

/** True when an offered window has run out. Never asks the clock itself. */
export function windowHasClosed<TAsk, TCarry>(
  step: Awaiting<TAsk, TCarry>, now: number,
): boolean {
  return step.need === 'optional' && step.closesAt != null && now >= step.closesAt
}

/**
 * True when a deadlined stop of EITHER kind has run out.
 *
 * windowHasClosed asks only about offered windows, and answering "no" for a
 * required stop that has plainly expired is the wrong answer to a reasonable
 * question. Kept separate rather than widening that one, because callers of it
 * are asking "may I stop waiting and move on", which is only ever true of an
 * offer — a required stop needs an answer supplied, not skipped.
 */
export function deadlinePassed<TAsk, TCarry>(
  step: Awaiting<TAsk, TCarry>, now: number,
): boolean {
  return step.closesAt != null && now >= step.closesAt
}

/** Narrowing helper, so callers can branch without repeating the string. */
export function isAwaiting<TAsk, TCarry, TResult>(
  step: Step<TAsk, TCarry, TResult>,
): step is Awaiting<TAsk, TCarry> {
  return step.status === 'awaiting'
}

/**
 * Drive a phase to the end, answering every pause the same way.
 *
 * For callers that cannot answer or do not need to: a test checking the cards,
 * a replay reconstructing a turn, a spectator view. `answer` is applied at every
 * pause, so passing the empty answer runs the phase as though every player
 * declined — which is a legal outcome for the spice blow, where placing a worm
 * is "can", not "must".
 *
 * The step limit is not defensive dressing. A resume function that returns a
 * pause identical to the one it was handed is an easy mistake to make and turns
 * this into a hang with no output; failing loudly on the tenth pass points
 * straight at it.
 */
export function runToSettled<TAsk, TCarry, TResult>(
  first: Step<TAsk, TCarry, TResult>,
  answer: (carry: TCarry, ask: TAsk) => Step<TAsk, TCarry, TResult>,
  limit = 10,
): TResult {
  let step = first
  for (let i = 0; i < limit; i++) {
    if (!isAwaiting(step)) return step.result
    step = answer(step.carry, step.ask)
  }
  throw new Error(
    `phase still awaiting after ${limit} answers — a resume function is most `
    + 'likely returning the same pause it was given',
  )
}
