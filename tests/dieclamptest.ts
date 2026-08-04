// Defender die modifiers must survive the 1/6 rails.
//
// Reported bug: Chris (Bear Trap) attacked Brazil, which has a Bunker. The
// defender rolled a 6; Bunker's +1 was thrown away by the clamp, then Bear
// Trap's −1 landed unopposed, leaving a 5 (or a 4 with a third modifier).
// The two should cancel to 6.
import {
  applyDefenderDieBonus, defenderDieSteps, singleDieBonus, singleDieDelta,
  type DefenderDiePart,
} from '@/lib/gameReducer'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const BUNKER: DefenderDiePart       = { label: 'Bunker', highest: 1 }
const BEAR_TRAP: DefenderDiePart    = { label: 'Bear Trap', lowest: -1 }
const AMMO: DefenderDiePart         = { label: 'Ammo Shortage', highest: -1 }
const FORTIFICATION: DefenderDiePart = { label: 'Fortification', highest: 1, lowest: 1 }
const RESILIENT: DefenderDiePart    = { label: 'Resilient — ignored' }   // informational

/** Last animation snapshot = the dice combat actually resolves on. */
const animated = (raw: number[], parts: DefenderDiePart[]) => {
  const steps = defenderDieSteps(raw, parts)
  return steps.length > 0 ? steps[steps.length - 1] : raw
}
/** What the engine computes from the summed modifiers. */
const engine = (raw: number[], parts: DefenderDiePart[]) => applyDefenderDieBonus(
  raw,
  {
    highest: parts.reduce((s, p) => s + (p.highest ?? 0), 0),
    lowest:  parts.reduce((s, p) => s + (p.lowest ?? 0), 0),
  },
  singleDieBonus(parts),
)

// ─── 1. The reported bug ──────────────────────────────────────────────────
console.log('--- the Brazil attack ---')
check('lone defender 6, Bunker + Bear Trap -> stays a 6 (they cancel)',
  animated([6], [BUNKER, BEAR_TRAP]), [6])
check('...and the engine agrees', engine([6], [BUNKER, BEAR_TRAP]), [6])
check('order does not matter',
  animated([6], [BEAR_TRAP, BUNKER]), [6])
check('the 6 -> 5 -> 4 slide is gone (Bunker no longer reads as a penalty)',
  defenderDieSteps([6], [BUNKER, BEAR_TRAP]), [[6], [6]])

check('two dice: a 6 high with Bunker + Bear Trap',
  animated([6, 3], [BUNKER, BEAR_TRAP]), [6, 2])
check('three modifiers on a lone 6 nets −1, not −2',
  animated([6], [BUNKER, AMMO, BEAR_TRAP]), [5])

// ─── 2. Both rails ────────────────────────────────────────────────────────
console.log('\n--- clamping at 1 and 6 ---')
check('a lone 1: Bear Trap then Bunker returns to 1, not 2',
  animated([1], [BEAR_TRAP, BUNKER]), [1])
check('a 1 cannot be pushed below 1', animated([1], [AMMO, BEAR_TRAP]), [1])
check('a 6 cannot be pushed above 6', animated([6], [BUNKER, FORTIFICATION]), [6])
check('mid-range dice are unaffected by clamping',
  animated([4, 2], [BUNKER, BEAR_TRAP]), [5, 1])

// ─── 3. Single-die semantics preserved ────────────────────────────────────
console.log('\n--- a lone die is both highest and lowest ---')
check('Bear Trap alone still bites a single die', animated([6], [BEAR_TRAP]), [5])
check('Bunker alone still lifts a single die', animated([3], [BUNKER]), [4])
check('Fortification names both but applies once to a lone die',
  animated([3], [FORTIFICATION]), [4])
check('...and applies to both dice when there are two',
  animated([3, 2], [FORTIFICATION]), [4, 3])
check('an informational part changes nothing', animated([4], [RESILIENT]), [4])
check('...but still gets its own animation step',
  defenderDieSteps([4], [RESILIENT]).length, 1)
check('singleDieDelta: highest wins when a source names both',
  singleDieDelta(FORTIFICATION), 1)

// ─── 4. Animation and engine agree on EVERY combination ───────────────────
console.log('\n--- exhaustive animation vs engine ---')
{
  const ALL = [BUNKER, BEAR_TRAP, AMMO, FORTIFICATION, RESILIENT]
  const rolls: number[][] = []
  for (let a = 1; a <= 6; a++) {
    rolls.push([a])
    for (let b = 1; b <= a; b++) {
      rolls.push([a, b])
      for (let c = 1; c <= b; c++) rolls.push([a, b, c])   // 3 dice: HQ defence
    }
  }
  let mismatches = 0, cases = 0
  for (let mask = 0; mask < (1 << ALL.length); mask++) {
    const parts = ALL.filter((_, i) => mask & (1 << i))
    for (const raw of rolls) {
      cases++
      if (JSON.stringify(animated(raw, parts)) !== JSON.stringify(engine(raw, parts))) {
        if (mismatches === 0) {
          console.log(`        first mismatch: raw=${JSON.stringify(raw)} ` +
            `parts=${parts.map(p => p.label).join('+') || 'none'} ` +
            `anim=${JSON.stringify(animated(raw, parts))} engine=${JSON.stringify(engine(raw, parts))}`)
        }
        mismatches++
      }
    }
  }
  console.log(`        (${cases} combinations checked)`)
  check('the animated dice always match the engine', mismatches, 0)
}

// ─── 5. Middle die is never touched ───────────────────────────────────────
check('a 3-die defence modifies only the highest and lowest',
  animated([5, 3, 2], [BUNKER, BEAR_TRAP]), [6, 3, 1])

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
