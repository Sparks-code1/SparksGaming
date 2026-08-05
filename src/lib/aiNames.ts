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

/**
 * The name for a newly added AI seat, roster-aware.
 *
 * Normally a fresh pool name: reusing a campaign identity should be the host
 * typing it on purpose, not luck. But a FULL roster inverts that — no new name
 * can ever be added to it, so a fresh "Admiral Hark" is a name the game must
 * refuse at Start with "rename it to an existing player". On a full roster the
 * free identities (no account, not at this table) are exactly what the AI
 * seats should be.
 */
export function nextAiSeatName(
  roster: { name: string; userId?: string | null }[],
  atTable: string[],
  maxRoster: number,
  random: () => number = Math.random,
): string {
  const lc = (s: string) => s.trim().toLowerCase()
  const tableSet = new Set(atTable.map(lc))
  const newAtTable = atTable.filter(n => !roster.some(m => lc(m.name) === lc(n))).length
  const rosterHasRoom = roster.length + newAtTable < maxRoster
  if (!rosterHasRoom) {
    const free = roster.find(m => !m.userId && !tableSet.has(lc(m.name)))
    if (free) return free.name
  }
  return generateAiName([...atTable, ...roster.map(m => m.name)], random)
}
