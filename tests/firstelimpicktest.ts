import { readFileSync } from 'node:fs'
// FIRST BLOOD IS ANNOUNCED TO THE TABLE; THE PICK BELONGS TO ONE SEAT.
//
// The milestone modal opens on every screen — it should, it is news — and it
// ended on the same button everywhere: "💀 Choose a Comeback Power →". Only
// the fallen player's own machine can honour that, and when the fallen player
// is the computer NO machine can: the computer claims its power for itself in
// the same breath. Four humans were each offered General Vex's pick
// (2026-09-09).
//
// The modal is now told who answers, from this screen's point of view:
//   'you'      — offered the pick, as before
//   'computer' — told which power it took, and given a way out
//   'other'    — told whose screen is answering, and given a way out
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')
const modal = bare(readFileSync('src/components/FirstEliminationMilestoneModal.tsx', 'utf8'))
const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))

console.log('\n— the modal is told whose pick it is —')
{
  check('it takes a chooser', /chooser: 'you' \| 'computer' \| 'other'/.test(modal), true)
  check('...and the power the computer took', /chosenPowerName\?: string/.test(modal), true)
  check('...both read in the signature',
    /function FirstEliminationMilestoneModal\(\{[^}]*chooser, chosenPowerName[^}]*\}: Props\)/.test(modal), true)
}

console.log('\n— only one screen is offered the pick —')
{
  check('the button asks for a choice ONLY from the seat that owes one',
    /\{chooser === 'you' \? '💀 Choose a Comeback Power →' : 'Continue →'\}/.test(modal), true)
  check('no unconditional "Choose a Comeback Power" survives',
    /(?<!\? )'💀 Choose a Comeback Power →'|>\s*💀 Choose a Comeback Power →/.test(modal), false)
  check("the computer's screen text names the power it took",
    /chooser === 'computer' \?[\s\S]{0,400}?\{chosenPowerName \?\? 'the first power still free'\}/.test(modal), true)
  check('...and says nobody at the table picks for it', /Nobody at the table picks for it/.test(modal), true)
  check('a watcher is told whose screen answers', /Yours is not the screen that answers/.test(modal), true)
}

console.log('\n— the board decides which of the three this screen is —')
{
  check('the computer is named as the chooser when the fallen seat is one',
    /chooser: ep\.isAI \? 'computer'/.test(board), true)
  check("...'you' for the fallen seat's own machine, and hotseat's single screen",
    /: \(!onlineMatchRef\.current \|\| localSeatRef\.current === ep\.id\) \? 'you'/.test(board), true)
  check("...'other' for everybody else", /: 'other',/.test(board), true)
  check('the announcement carries the power the auto-claim will take',
    /const aiPick = ep\.isAI \? COMEBACK_POWERS\.find\(c => !claimedSoFar\.has\(c\.id\)\) : undefined/.test(board)
    && /chosenPowerName: aiPick\?\.name,/.test(board), true)
  check('...the same one, not a second search',
    (board.match(/COMEBACK_POWERS\.find\(c => !claimedSoFar\.has\(c\.id\)\)/g) ?? []).length, 1)
  check('the computer still claims for itself, on one machine only',
    /if \(aiPick\) \{\s*claimedSoFar\.add\(aiPick\.id\)\s*if \(!remote\) autoClaimComebackPower\(ep\)/.test(board), true)
  check('and the modal is handed both', /chooser=\{firstElimInfo\.chooser\}\s*chosenPowerName=\{firstElimInfo\.chosenPowerName\}/.test(board), true)
}

console.log(pass ? '\nall first-elimination pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
