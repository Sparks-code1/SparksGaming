// The end of a game, and the one colour nobody could read.
//
// Two unrelated-looking things in one suite because they were reported and
// fixed together, and because the second is what makes the first legible: a
// victory screen naming the Harkonnen in the Harkonnen's own black is a
// ceremony for a winner nobody can see.
import { readFileSync } from 'node:fs'
import { factionInk, FACTION_LOOK } from '@/components/dune/SeatLayer'
import { WIN_REASON } from '@/components/dune/VictoryScreen'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** Rec. 601 luma of a #rrggbb, 0..1 — the same measure factionInk works in. */
const luma = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// ── the ink ────────────────────────────────────────────────────────────────
console.log('--- a faction colour, made readable as text ---')

// THE PANELS THIS TEXT SITS ON are around #0d1220 — luma about 0.07. Anything
// near that is not dark-but-legible, it is invisible, which is what the
// Harkonnen name in the battle screen and the chat actually was.
check('the Harkonnen are lifted off the background',
  luma(factionInk('harkonnen')) > 0.45, true)
check('...and are no longer their own raw colour',
  factionInk('harkonnen') !== FACTION_LOOK.harkonnen.colour, true)

// EVERY OTHER FACTION IS LEFT ALONE. A sweep that "fixed" all six would be a
// palette change nobody asked for — these colours are the board's identity.
for (const f of Object.keys(FACTION_LOOK) as FactionId[]) {
  if (f === 'harkonnen') continue
  check(`${f} keeps its own colour`,
    factionInk(f), FACTION_LOOK[f].colour)
}

// IT KEEPS THE HUE. Lifting toward white rather than substituting a colour is
// what stops the Harkonnen turning into somebody else's faction — their ink
// should still be the greyest thing on the sheet.
{
  const ink = factionInk('harkonnen')
  const n = parseInt(ink.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  check('...and stays grey rather than becoming a colour',
    Math.max(r, g, b) - Math.min(r, g, b) < 12, true)
}

// AN UNKNOWN FACTION MUST NOT CRASH A BATTLE SCREEN. It is a lookup on data
// that comes off the wire.
check('an unknown faction falls back rather than throwing',
  typeof factionInk('nobody' as FactionId), 'string')

// ── the ceremony ───────────────────────────────────────────────────────────
console.log('--- every way of winning has a sentence ---')

// THE VERDICT'S SIX REASONS, read off the type that declares them. A reason
// with no sentence renders its raw slug — "most-spice" in 15px serif at the
// end of a ten-turn game — and the only way that gets noticed is by somebody
// winning that way.
{
  const src = readFileSync('src/lib/dune/phaseAdvance.ts', 'utf8')
  const at = src.indexOf("reason: 'strongholds'")
  const decl = src.slice(at, src.indexOf('turn: number', at))
  const reasons = [...decl.matchAll(/'([a-z-]+)'/g)].map(m => m[1])
  check('the verdict declares six ways to win', reasons.length, 6)
  const missing = reasons.filter(r => !WIN_REASON[r])
  check('...and each one has a sentence on the victory screen', missing, [])
}

// ── the screen itself ──────────────────────────────────────────────────────
console.log('--- the ceremony gets out of the way ---')
{
  const src = readFileSync('src/components/dune/VictoryScreen.tsx', 'utf8')

  // BACK TO THE BOARD is half the point: the final position is what people
  // want to look at once they know the result. A ceremony with no way out is
  // a ceremony that eats the board.
  check('there is a way out, by button and by key',
    [/data-close-victory/.test(src), /e\.key === 'Escape'/.test(src)],
    [true, true])

  // ONCE PER MATCH. The row goes on saying there is a winner for as long as
  // anyone is looking at the finished board, so a ceremony driven straight
  // off it would reopen on every poll.
  check('it is remembered per match, not per render',
    /dune:victory-seen:\$\{matchId\}/.test(src), true)

  // THE WINNERS' NAMES IN INK. This is the screen the contrast fix exists
  // for; drawing it from FACTION_LOOK directly would put it straight back.
  check('the winner is named in readable ink',
    [/color: factionInk\(f\)/.test(src),
      /color: FACTION_LOOK\[f\]\.colour/.test(src)],
    [true, false])

  // AND THE CONFETTI TOO — Harkonnen black on a near-black backdrop was a
  // celebration only the other five could see.
  check('...and the burst is thrown in ink as well',
    /colors=\{\[\.\.\.won\.map\(f => factionInk\(f\)\), GOLD\]\}/.test(src), true)
}

// ── the battle screen, when there is no battle ──────────────────────────────
console.log('--- an empty battle screen is not shown ---')
{
  const src = readFileSync('src/components/dune/DuneGameScreen.tsx', 'utf8')

  // A BATTLE IS BEING FOUGHT OR WAITING TO BE PICKED. With neither, the panel
  // drew a header over the board and an empty list under it.
  check('the panel needs a battle in it',
    /\(!!state\.battles\.current \|\| battlesLeft\.length > 0\)/.test(src), true)

  // AND IT COUNTS THEM THE WAY THE SERVER DOES. This is the dangerous half:
  // a client that counted FEWER battles than the endpoint would take the pick
  // screen away from an aggressor the server is still waiting on, turning a
  // cosmetic fix into a wedged phase. The advisor stop is what makes the
  // counts differ — stopped, robed forces fight, so there are MORE battles.
  check('...counted with the advisor stop the endpoint reads',
    [/const advisorsFight = isSuppressed\(/.test(src),
      /'bene-gesserit', 'advanced\.advisors',/.test(src),
      /pendingBattles\(\s*\(state\.forces \?\? \[\]\) as never, state\.storm as never, advisorsFight\)/.test(src)],
    [true, true, true])

  // ── ONE DERIVATION, NOT TWO THAT AGREE ────────────────────────────────
  // The panel used to call pendingBattles itself, passing two of its three
  // arguments — so the endpoint and the screen counted a Karama'd advisor
  // battle and the pick list did not. Three call sites, one wrong, all
  // claiming to agree.
  //
  // The list is handed in now. This holds that shape rather than the old one,
  // because "the panel counts it the same way" is a thing that drifts and
  // "the panel does not count it" is a thing that cannot.
  const panel = readFileSync('src/components/dune/BattlePanel.tsx', 'utf8')
  check('the panel is given the list rather than working it out',
    [/pending: ReturnType<typeof pendingBattles>/.test(panel),
      /const pending = pendingBattles\(/.test(panel)],
    [true, false])
  check('...and the screen hands it the one it gated on',
    /pending=\{battlesLeft\}/.test(src), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
