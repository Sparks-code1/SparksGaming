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

/** The phase has stopped and cannot go on until someone answers. */
export interface Awaiting<TAsk, TCarry> {
  status: 'awaiting'
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

export const awaiting = <TAsk, TCarry>(
  from: FactionId[], ask: TAsk, carry: TCarry,
): Awaiting<TAsk, TCarry> => ({ status: 'awaiting', from, ask, carry })

export const settled = <TResult>(result: TResult): Settled<TResult> =>
  ({ status: 'settled', result })

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
