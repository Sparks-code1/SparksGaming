/**
 * The die's turning, in numbers the screen can reason about.
 *
 * The cube used to tumble under a CSS keyframe animation and land through a
 * CSS transition. Dropping the animation handed the transition the cube's last
 * animated angles as its start and the face's fixed angles as its end — a
 * smaller number more often than not — so the landing rotated BACKWARDS: the
 * die spun one way, stopped, and unwound the other way onto its face (the
 * defender's dice, 2026-09-07). Now the spin advances a running angle every
 * frame, and the landing continues forward to the next turn that shows the
 * face. One direction, from the throw to the rest.
 */

/** Cube orientation that brings each value to the front, in degrees. */
export const FACE_ANGLES: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
}

/** Degrees per millisecond while rolling, per axis — unequal, so the tumble never repeats. */
export const SPIN_RATE = { x: 0.62, y: 0.47 }

/** The wobble about the third axis while rolling; gone on landing. */
export function spinWobble(x: number): number {
  return 35 * Math.sin(x / 120)
}

/**
 * The nearest angle at or beyond `current` that shows `target` (the same face
 * every full turn), so a landing keeps turning the way the spin was turning.
 */
export function forwardTo(current: number, target: number): number {
  const t = ((target % 360) + 360) % 360
  let out = Math.floor(current / 360) * 360 + t
  if (out < current) out += 360
  return out
}

/** The cube's transform for a set of angles. */
export function cubeTransform(x: number, y: number, z: number): string {
  return `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`
}
