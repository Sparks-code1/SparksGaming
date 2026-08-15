/**
 * The missile strike announcement channel.
 *
 * A missile is a fact in match state — the die is a 6, and every screen learns
 * that from the window's flip list. The STRIKE is theatre, and theatre has to
 * be told when to start: state alone cannot say "this die just changed" once
 * the change has already been rendered.
 *
 * Deliberately a plain event bus rather than React state. The strike layer is
 * mounted once at the top of the board and the dice are drawn deep inside two
 * unrelated screens (the attacker's modal, the defender/spectator prompt);
 * threading a callback through both would put animation plumbing in the way of
 * everything between. Nothing here can block or fail a round: an announcement
 * with no listener simply evaporates.
 */

export interface MissileStrike {
  /** Which die was hit — matched to `data-die` on the rendered die. */
  side: 'atk' | 'def'
  dieIndex: number
  /** Who fired it, as the table would say it ("Test", "You"). */
  who: string
  /** Distinguishes two strikes on the same die across rounds. */
  id: string
}

type Listener = (s: MissileStrike) => void

const listeners = new Set<Listener>()
let seq = 0

/** Announce a strike. Safe to call from anywhere, including an effect handler. */
export function emitMissileStrike(s: Omit<MissileStrike, 'id'>): void {
  const full: MissileStrike = { ...s, id: `${Date.now()}-${++seq}` }
  for (const l of listeners) {
    try { l(full) } catch { /* a broken listener must never break a battle */ }
  }
}

/** Listen for strikes. Returns the unsubscribe. */
export function onMissileStrike(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * The attribute a die carries so a strike can find it on screen.
 *
 * Both battle screens render the same DieFace, and both are on screen at once
 * for different people — but never for the same person, so one key per side
 * and index is unambiguous on any given screen.
 */
export const dieKey = (side: 'atk' | 'def', dieIndex: number) => `${side}-${dieIndex}`
