/**
 * Names for computer players.
 *
 * The host adding an AI seat should not have to invent a name on the spot —
 * one is generated, and the host may overwrite it. Names come from a themed
 * pool rather than "AI 1"/"AI 2" because these become permanent roster
 * members once a game starts: they sign histories, found cities, and show up
 * in the victory log for the rest of the campaign, where "Computer 2 razed
 * Madrid" reads like a stage direction.
 */

export const AI_NAME_POOL = [
  'General Vex', 'Marshal Krieg', 'Warlord Osk', 'Commander Sloane',
  'Baroness Wren', 'Overseer Malik', 'Colonel Ashe', 'Captain Rook',
  'Duchess Ferro', 'Admiral Hark', 'Praetor Volk', 'Chancellor Nyx',
] as const

/**
 * A name no one at the table is using.
 *
 * `taken` should include every name already visible — lobby seats AND the
 * campaign roster — so the generator never hands out a name that would collide
 * with a person, or silently reuse a past AI's identity. Reuse is allowed, but
 * it should be the host CHOOSING to type an old name, not luck.
 */
export function generateAiName(
  taken: string[],
  random: () => number = Math.random,
): string {
  const used = new Set(taken.map(n => n.trim().toLowerCase()))
  const free = AI_NAME_POOL.filter(n => !used.has(n.toLowerCase()))
  if (free.length > 0) return free[Math.floor(random() * free.length)]
  // Twelve AI names exhausted (five seats — someone tried hard): fall back to
  // a numbered name that is still guaranteed unique.
  let i = 1
  while (used.has(`computer ${i}`)) i++
  return `Computer ${i}`
}
