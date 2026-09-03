// The rules card is a VIEW OF THE DATA, and the only way it can lie is by
// leaving something out.
//
// Every sentence on the card is read from the faction sheets or from
// DUNE_PHASES — except the list of WHICH sheet entries to draw, which is nine
// plus fifteen <Rule> lines written by hand. A faction that grows a new ability
// key would render on the card exactly as it did before, with the new rule
// silently absent, and the player looking it up would conclude the faction does
// not have it. That is worse than a missing card: it is a card that answers.
//
// So: the union of keys actually present across the six sheets must be a subset
// of the keys the card draws. Not equality — the card may name a key no faction
// currently uses, which renders nothing and costs nothing.
import { readFileSync } from 'node:fs'
import { FACTIONS, FACTION_IDS } from '@/data/dune/factions'
import { DUNE_PHASES } from '@/types/Dune/Game'
import { WHAT_HAPPENS } from '@/components/dune/RulesCard'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const src = readFileSync('src/components/dune/RulesCard.tsx', 'utf8')

// ── what the card draws ─────────────────────────────────────────────────────
// The <Rule text={f.abilities.X}> and <Rule text={f.advanced.X}> lines. Read as
// the source rather than by rendering, because rendering would need a DOM and
// what is being asserted is which keys the JSX MENTIONS — a key that reaches a
// <Rule> is drawn, since Rule's only condition is that the text is non-empty.
const drawn = (group: 'abilities' | 'advanced') =>
  new Set([...src.matchAll(new RegExp(`f\.${group}\.([A-Za-z]+)`, 'g'))]
    .map(m => m[1]))

// ── what the sheets hold ────────────────────────────────────────────────────
const held = (group: 'abilities' | 'advanced') => {
  const keys = new Set<string>()
  for (const id of FACTION_IDS) {
    const f = FACTIONS[id]
    if (!f) continue
    for (const [k, v] of Object.entries(f[group])) if (v) keys.add(k)
  }
  return keys
}

for (const group of ['abilities', 'advanced'] as const) {
  const shown = drawn(group)
  const missing = [...held(group)].filter(k => !shown.has(k)).sort()
  check(`every ${group} key on a sheet is drawn`, missing, [])
}

// The two that sit outside both groups and are just as easy to drop.
check('the alliance text is drawn', /f\.alliance/.test(src), true)
check('the victory condition is drawn', /f\.specialVictory/.test(src), true)

// ── and the numbers ─────────────────────────────────────────────────────────
// FORCES ARE THE ONE ARITHMETIC on the card. reserves alone is not the force
// count — the Atreides hold ten more in Arrakeen before a card is turned — and
// reading the wrong field would understate five of the six factions by half.
check('the force count adds the reserves to what is placed',
  /f\.forces\.onPlanet \+ f\.forces\.reserves/.test(src), true)
check('the hand limit is read, not written', /f\.handLimit/.test(src), true)
check('the starting spice is read, not written', /f\.startingSpice/.test(src), true)

// ── the sequence of play is the sequence ────────────────────────────────────
// The card maps over DUNE_PHASES rather than listing nine names, so the order
// cannot drift from the board's. What CAN drift is the prose beside them: the
// map is typed Record<GamePhase, string>, which makes a MISSING phase a compile
// error, so this only has to catch prose that went blank.
//
// THE VALUES, not the source. A first pass read the characters after each key
// out of the file and let a blanked line through — the sentence had been
// replaced by an expression that was still long. What is being asserted is
// what a player reads, so read what a player reads.
for (const phase of DUNE_PHASES) {
  const text = WHAT_HAPPENS[phase] ?? ''
  check(`${phase} says what happens in it`,
    [text.trim().length > 40, text.trim().endsWith('.')], [true, true])
}
check('the phase list is walked, not retyped', /DUNE_PHASES\.map/.test(src), true)

// ── the board marks ─────────────────────────────────────────────────────────
// Each one is DRAWN beside its explanation. A mark described in words only is
// the thing this page exists to avoid: "a tinted ring round the medallion" is a
// sentence the reader has to translate back into what they are looking at.
const marks = [...src.matchAll(/<Mark name="([^"]+)"/g)].map(m => m[1])
check('the board page draws its marks', marks.length >= 8, true)
check('the phase medallion is one of them',
  marks.some(m => /phase/i.test(m)), true)
check('the turn dial is one of them', marks.some(m => /turn/i.test(m)), true)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
