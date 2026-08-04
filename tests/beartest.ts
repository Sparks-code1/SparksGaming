// Bear Trap: −1 to the defender's LOWEST die — including when the defender
// rolls only one die (that die is both their highest and their lowest).
import { resolveCombat, singleDieBonus, singleDieDelta } from '@/lib/gameReducer'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// A scripted RNG so dice are exact, not random. resolveCombat pulls ints via
// rng.int(1,6); feed a fixed queue.
const scripted = (queue: number[]) => {
  let i = 0
  const nextVal = () => queue[i++ % queue.length]
  return { next: () => nextVal() / 6, int: () => nextVal(), shuffle: <T,>(a: T[]) => a }
}

const BEAR_TRAP = [{ label: 'Bear Trap', lowest: -1 }]
const FORTIFICATION = [{ label: 'Fortification', highest: 1, lowest: 1 }]
const BUNKER = [{ label: 'Bunker', highest: 1 }]

// ── the helper's semantics ────────────────────────────────────────────────
check('Bear Trap on a lone die = -1', singleDieDelta({ lowest: -1 }), -1)
check('Bunker on a lone die = +1', singleDieDelta({ highest: 1 }), 1)
check('Fortification (hi & lo) applies ONCE on a lone die', singleDieDelta({ highest: 1, lowest: 1 }), 1)
check('combined sources sum', singleDieBonus([...BEAR_TRAP, ...BUNKER]), 0)

// ── THE REPORTED BUG: defender rolls a single 6 ───────────────────────────
// 1 defending troop => 1 defence die. Attacker rolls a 5.
// Without Bear Trap the defender's 6 beats the 5 -> attacker loses.
// With Bear Trap the 6 becomes a 5; ties go to the defender, so still a
// defender win -- but the DIE ITSELF must show 5, proving the modifier fired.
const oneDieRound = (parts: any[] | undefined) => {
  const mods: any = {
    attackerBonusAllDice: 0, attackerSubtractLowest: false, tripleKillEnabled: false,
    defenderDieBonus: parts ? { highest: 0, lowest: -1 } : undefined,
    defenderDieBonusSingle: parts ? singleDieBonus(parts) : undefined,
    defenderBonusDiceCap: 0, nuclearFallout: false,
    attackerSixesWin: false, attackerRerollOnes: false,
  }
  // attacker die 5, defender die 6, repeated
  const out = resolveCombat(2, 1, mods, scripted([5, 6]) as any)
  return out.rounds[0].defDice
}

check('WITHOUT Bear Trap: lone defender die stays 6', oneDieRound(undefined), [6])
check('WITH Bear Trap: lone defender die 6 -> 5 (the reported bug)', oneDieRound(BEAR_TRAP), [5])

// ── multi-die still behaves as before ─────────────────────────────────────
const twoDieRound = (parts: any[] | undefined, agg: any) => {
  const mods: any = {
    attackerBonusAllDice: 0, attackerSubtractLowest: false, tripleKillEnabled: false,
    defenderDieBonus: agg,
    defenderDieBonusSingle: parts ? singleDieBonus(parts) : undefined,
    defenderBonusDiceCap: 0, nuclearFallout: false,
    attackerSixesWin: false, attackerRerollOnes: false,
  }
  // defender has 2 troops -> 2 dice. Queue: atk 5, then def 6 and 3.
  const out = resolveCombat(2, 2, mods, scripted([5, 6, 3]) as any)
  return out.rounds[0].defDice
}
check('2 dice, Bear Trap: only the LOWEST drops (6,3 -> 6,2)',
  twoDieRound(BEAR_TRAP, { highest: 0, lowest: -1 }), [6, 2])
check('2 dice, Fortification: both ends +1 (6,3 -> 6 capped, 4)',
  twoDieRound(FORTIFICATION, { highest: 1, lowest: 1 }), [6, 4])

// ── clamping: a lone die of 1 cannot go below 1 ───────────────────────────
{
  const mods: any = {
    attackerBonusAllDice: 0, attackerSubtractLowest: false, tripleKillEnabled: false,
    defenderDieBonus: { highest: 0, lowest: -1 }, defenderDieBonusSingle: -1,
    defenderBonusDiceCap: 0, nuclearFallout: false,
    attackerSixesWin: false, attackerRerollOnes: false,
  }
  const out = resolveCombat(2, 1, mods, scripted([5, 1]) as any)
  check('lone die of 1 clamps at 1 (never 0)', out.rounds[0].defDice, [1])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
