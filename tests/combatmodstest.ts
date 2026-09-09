import { readFileSync } from 'node:fs'
import { gameReducer, createMathRng, clampDisplayMods, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'
// THE TABLE AGREES ABOUT WHAT WAS ROLLED.
//
// Every screen used to derive the battle's die modifiers from its own copy of
// the board and the campaign — three derivations of the same stack, in the
// attack modal, the defender's prompt and the AI. The campaign has no live
// sync, so a Bunker's +1 (and a fortification sticker, a comeback power, an
// ability) could be applied on the attacker's screen alone while the defender
// and every spectator watched the unmodified roll (2026-09-07). The stack the
// attacker's machine resolves under now travels with the offer, bounded by
// the reducer, and the defender's prompt shows the dice under THAT stack.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')
const rng = createMathRng()
const terr = (id: string, owner: string, troops: number) => ({
  id, name: id, continentId: 'c', occupyingPlayerId: owner, troops, adjacentTerritoryIds: [], scars: [], activeHqPlayerId: null,
})
const base = (): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'attack', currentPlayerIndex: 0, turnNumber: 2,
  players: [
    { id: 'p1', name: 'Attacker', cards: [], isEliminated: false },
    { id: 'p2', name: 'Defender', cards: [], isEliminated: false },
  ] as never,
  territories: { src: terr('src', 'p1', 8), tgt: terr('tgt', 'p2', 4) } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
} as never)
const offer = (over: object = {}): Action => ({
  type: 'COMBAT_OFFER', key: 'k1', srcId: 'src', tgtId: 'tgt',
  attackerId: 'p1', defenderId: 'p2', defDiceMax: 2, ...over,
} as Action)
const bunker = {
  defHighest: 1, defLowest: 0,
  parts: [{ label: '🏰 Bunker — defender highest +1', highest: 1 }],
  atkBonusAllDice: 0, attackerSixesWin: false, nuclearFallout: false,
}

console.log('\n— the offer carries the stack —')
{
  const { state: s } = gameReducer(base(), offer({ mods: bunker }), rng)
  check('the session holds the stack the attacker sent', s.combat?.mods, bunker)
  const { state: plain } = gameReducer(base(), offer(), rng)
  check('an offer from a build that sends none leaves it absent', plain.combat?.mods, undefined)
  check('...and the session still opens', plain.combat?.key, 'k1')
}

console.log('\n— bounded like every other caller-supplied number —')
{
  const wild = clampDisplayMods({
    defHighest: 40, defLowest: -40, atkBonusAllDice: 9, attackerSixesWin: 'yes', nuclearFallout: 0,
    parts: [
      { label: 'x'.repeat(200), highest: 99 },
      { label: '', highest: 1 },
      'junk',
      { label: 'lowest only', lowest: -7 },
      ...Array.from({ length: 10 }, (_, i) => ({ label: 'p' + i })),
    ],
  })
  check('die shifts clamp to ±5 and the attacker bonus to 0–3', [wild?.defHighest, wild?.defLowest, wild?.atkBonusAllDice], [5, -5, 3])
  check('flags coerce to booleans', [wild?.attackerSixesWin, wild?.nuclearFallout], [true, false])
  check('labels are cut at 80, unlabeled and junk parts dropped, at most eight kept', [wild?.parts.length, wild?.parts[0].label.length, wild?.parts[0].highest, wild?.parts[1]], [8, 80, 5, { label: 'lowest only', lowest: -5 }])
  check('a part naming no die shift carries none', clampDisplayMods({ parts: [{ label: 'Resilient — Ammo Shortage ignored' }] })?.parts, [{ label: 'Resilient — Ammo Shortage ignored' }])
  check('nothing sensible in → nothing out', [clampDisplayMods(null), clampDisplayMods('mods'), clampDisplayMods(7)], [undefined, undefined, undefined])
}

console.log('\n— the wiring —')
{
  const modal = bare(readFileSync('src/components/AttackModal.tsx', 'utf8'))
  check('the attack modal opens the session with its own stack',
    /interactiveDefense\.offer\(maxDefDice, \{\s*defHighest: defenderDieBonus\?\.highest \?\? 0,\s*defLowest: defenderDieBonus\?\.lowest \?\? 0,[\s\S]{0,400}?nuclearFallout,\s*\}\)/.test(modal), true)
  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('the board forwards it on the offer', /type: 'COMBAT_OFFER', key, srcId, tgtId, attackerId, defenderId, defDiceMax, mods,/.test(board), true)
  const prompt = bare(readFileSync('src/components/DefenderBattlePrompt.tsx', 'utf8'))
  check("the defender's prompt shows the session's stack, its own only as the fallback",
    /const shown: DefenderBattleMods = combat\.mods \?\? mods/.test(prompt), true)
  check('...no read of the local stack remains in the settle', /\bmods\.(defHighest|defLowest|atkBonusAllDice|attackerSixesWin|nuclearFallout|parts)\b/.test(prompt), false)
  check('...and a stack that arrives re-settles the dice', /JSON\.stringify\(\[combat\.atkDice, combat\.defDice, flips, !!combat\.emp, shown\]\)/.test(prompt) && /combat\.mods, atkSpin, defSpin\]\)/.test(prompt), true)
  const reducer = bare(readFileSync('src/lib/gameReducer.ts', 'utf8'))
  check('the reducer bounds the stack before storing it', /const mods = clampDisplayMods\(action\.mods\)\s*return only\(\{ \.\.\.state, combat: mods \? \{ \.\.\.combat, mods \} : combat \}\)/.test(reducer), true)
}

console.log('\n— and a screen says which battle it is showing —')
{
  // Dice that were never modified look exactly like dice that had nothing to
  // modify, so neither state is left silent: a session that arrives without
  // the attacker's stack says so once, and every settle says which stack it
  // used and what it did to the roll (2026-09-09).
  const prompt = bare(readFileSync('src/components/DefenderBattlePrompt.tsx', 'utf8'))
  check('a session with no stack warns, once per battle',
    /if \(saidRef\.current === combat\.key\) return\s*saidRef\.current = combat\.key\s*if \(combat\.mods\) return\s*console\.warn\(/.test(prompt), true)
  check('...naming the fallback and what it costs',
    /the offer carried no modifier stack[\s\S]{0,220}?no live[\s\S]{0,40}?sync/.test(prompt), true)
  check('every settle reports the raw roll and what this screen showed',
    /console\.info\(`\[Battle\] \$\{combat\.key\} round \$\{combat\.round\}: attacker[\s\S]{0,200}?defender \$\{rawDef\.join\(','\)\} → \$\{def\.join\(','\)\}/.test(prompt), true)
  check('...and says whose stack it used',
    /combat\.mods \? "the table's stack" : "THIS SCREEN'S OWN"/.test(prompt), true)
  check('...with the shifts and the named parts', /hi \$\{sign\(shown\.defHighest\)\} lo \$\{sign\(shown\.defLowest\)\}/.test(prompt), true)
  check('...and EMP said rather than shown as a zero stack', /EMP — every modifier dead/.test(prompt), true)
  check('the report is written where the dice are settled, not where they arrive',
    prompt.indexOf('[Battle] ${combat.key} round') < prompt.indexOf('setAnimAtk(atk)'), true)
}

console.log(pass ? '\nall combat-mods pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
