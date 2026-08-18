// 'fortified' became 'bunker'. The old id sat one letter from 'fortification',
// a different scar with different dice, which is exactly how a rename earns its
// keep — and exactly why saved campaigns must be healed rather than left to
// silently stop matching.
import { healRenamedScarTypes } from '@/lib/legacyApi'
import type { LegacyState } from '@/types/legacy'
import { SCAR_CARDS } from '@/data/scarCards'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const ls = (scars: { territoryId: string; type: string }[]) =>
  ({ scars } as unknown as LegacyState)

// ── the heal ─────────────────────────────────────────────────────────────────
check('a saved fortified scar becomes a bunker',
  healRenamedScarTypes(ls([{ territoryId: 'ural', type: 'fortified' }])).scars.map(s => s.type),
  ['bunker'])

// The whole point of the rename: these two are NOT the same scar and must not
// be collapsed into one another.
check('fortification is left alone — it is a different scar',
  healRenamedScarTypes(ls([{ territoryId: 'ural', type: 'fortification' }])).scars.map(s => s.type),
  ['fortification'])

check('a mixed save heals only the one',
  healRenamedScarTypes(ls([
    { territoryId: 'a', type: 'fortified' },
    { territoryId: 'b', type: 'fortification' },
    { territoryId: 'c', type: 'wasteland' },
  ])).scars.map(s => s.type),
  ['bunker', 'fortification', 'wasteland'])

check('already-healed saves are untouched',
  healRenamedScarTypes(ls([{ territoryId: 'ural', type: 'bunker' }])).scars.map(s => s.type),
  ['bunker'])

// ── it must not throw on the shapes a real save can be in ────────────────────
check('no scars key at all', healRenamedScarTypes({} as LegacyState).scars, undefined)
check('empty scars', healRenamedScarTypes(ls([])).scars, [])

// ── the deck agrees with the union ───────────────────────────────────────────
// If the deck still deals 'fortified' the rename missed a file, and every
// Bunker dealt from here on would be a scar nothing recognises.
check('the deck deals bunker, not fortified',
  SCAR_CARDS.some(c => (c.type as string) === 'fortified'), false)
check('...and bunker is really in there',
  SCAR_CARDS.filter(c => c.type === 'bunker').length, 3)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
