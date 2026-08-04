// Comeback powers: Mercenary (scar pays +2) and the draft pool no longer
// carrying either Mercenary or Khan's HQ bonus.
import { applyEndOfTurnScarEffects } from '@/lib/gameReducer'
import { calcDraftTroops } from '@/lib/gameLogic'

const T = (id: string, owner: string | null, troops: number, scar?: string): any => ({
  id, name: id, occupyingPlayerId: owner, troops, cities: [], adjacentIds: [],
  scars: scar ? [{ type: scar }] : [],
})

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const board = (): Record<string, any> => ({
  m1: T('m1', 'p1', 3, 'mercenary'),  // merc scar, owned
  m2: T('m2', 'p1', 1, 'mercenary'),  // merc scar, owned, low troops
  pl: T('pl', 'p1', 4),               // plain owned
  en: T('en', 'p2', 5, 'mercenary'),  // merc scar but ENEMY owned
  bio: T('bio', 'p1', 4, 'biological'),
})
const troops = (t: Record<string, any>) => ({ m1: t.m1.troops, m2: t.m2.troops, pl: t.pl.troops, en: t.en.troops })

// ── WITHOUT the comeback power: mercenary scar pays the normal +1 ─────────
{
  const r = applyEndOfTurnScarEffects(board(), 'p1', false, null)
  check('no power: merc scars pay +1', troops(r.territories), { m1: 4, m2: 2, pl: 4, en: 5 })
}

// ── WITH Mercenary comeback: those same scars pay +2 ─────────────────────
{
  const r = applyEndOfTurnScarEffects(board(), 'p1', false, null, true)
  check('Mercenary power: merc scars pay +2', troops(r.territories), { m1: 5, m2: 3, pl: 4, en: 5 })
  check('troops land ON the scarred territories, enemy untouched',
    r.territories.en.troops, 5)
}

// ── the power must not leak to other players' turns ──────────────────────
{
  // p2 ends their turn; p1 holds the power. p2's own merc scar pays +1 only.
  const r = applyEndOfTurnScarEffects(board(), 'p2', false, null, false)
  check("other player's turn is unaffected", r.territories.en.troops, 6)
  check("...and p1's territories don't tick on p2's turn",
    troops(r.territories).m1, 3)
}

// ── Mutants keep the scar reversed; the power cannot rescue it ───────────
{
  const r = applyEndOfTurnScarEffects(board(), 'p1', true, null, true)
  check('Mutant + Mercenary power: merc scar still LOSES a troop', r.territories.m1.troops, 2)
}

// ── draft pool no longer carries Mercenary or Khan's HQ bonus ────────────
{
  const terr = board()
  const withPower = calcDraftTroops({
    playerId: 'p1', factionId: 'f1', territories: terr,
    legacy: { comebackPowers: { f1: 'mercenary' } }, ability: null,
  })
  const without = calcDraftTroops({
    playerId: 'p1', factionId: 'f1', territories: terr, legacy: null, ability: null,
  })
  check('Mercenary no longer inflates the draft pool', withPower, without)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
