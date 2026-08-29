// Revival: the dead come back, at a price, to the reserves.
//
// WHY THIS EXISTS. Until this phase the dead simply stopped being — the storm
// dropped them from `forces` and reported them, the worm did the same, and
// nothing kept a total. Revival reads that total, so the Tleilaxu Tanks became
// state and BOTH killers now owe it their dead. Everything here is the rules
// as ruled: three a turn, the sheet's free ones first then two spice each to
// the BANK (never the Emperor — that redirect is treachery's alone), one
// starred among them, revived forces to RESERVES and never the board; and the
// leader cycle — the all-five gate that opens once and never closes, one
// leader a turn at fighting strength, face-down for the revived-and-killed
// until the whole rotation completes.
import { readFileSync } from 'node:fs'
import {
  bankDead, emptyTanks, reviveForces, reviveLeader, returnLeaderToTanks,
  revivableLeaders, REVIVAL_CAP, REVIVAL_SPICE, STARRED_REVIVALS_PER_TURN,
} from '@/lib/dune/revival'
import { stormEntry } from '@/lib/dune/phaseAdvance'
import type { AdvanceState } from '@/lib/dune/phaseAdvance'
import { factionById, FACTION_IDS } from '@/data/dune/factions'
import type { Force, DunePlayerPublic } from '@/types/Dune/Game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const f = (faction: string, count: number, starred = 0): Force =>
  ({ faction, territoryId: 'territory-01', sector: 'sector-5', count, starred } as Force)

const none = { forces: 0, starred: 0 }

// ── the tanks take the dead, split the way revival spends them ────────────
{
  const t = bankDead(undefined, [f('harkonnen', 5), f('fremen', 4, 2)])
  check('the dead land by faction', t.forces.harkonnen, { plain: 5, starred: 0 })
  check('...with the elite counted apart', t.forces.fremen, { plain: 2, starred: 2 })
  const more = bankDead(t, [f('harkonnen', 1)])
  check('...and the pile grows, never resets', more.forces.harkonnen, { plain: 6, starred: 0 })
  check('...without touching anybody else', more.forces.fremen, { plain: 2, starred: 2 })
  check('an empty report changes nothing', bankDead(t, []).forces, t.forces)
  // A DEAD ADVISOR IS AS DEAD AS A FIGHTER — posture does not follow a corpse.
  const advisor = bankDead(undefined, [{ ...f('bene-gesserit', 1), posture: 'advisor' } as Force])
  check('a dead advisor is banked like anyone', advisor.forces['bene-gesserit'], { plain: 1, starred: 0 })
}

// ── the storm pays in ─────────────────────────────────────────────────────
{
  const state: AdvanceState = {
    phase: 'Storm', turn: 3, mode: 'advanced', storm: 'sector-1', shieldWall: 'intact',
    forces: [
      // Harg Pass is sand in sector-4 — a roll of 4 sweeps it.
      { ...f('harkonnen', 5, 2), territoryId: 'territory-02', sector: 'sector-4' } as Force,
    ],
    players: [] as DunePlayerPublic[],
  }
  const { patch } = stormEntry(state, 4)
  check('the storm banks its dead in the same patch',
    patch.tanks.forces.harkonnen, { plain: 3, starred: 2 })
  check('...and the board no longer holds them', patch.forces.length, 0)
}

// ── forces come back: three a turn, free ones first, to the reserves ──────
{
  const tanks = bankDead(undefined, [f('atreides', 6, 0), f('emperor', 4, 3)])

  // ATREIDES SHEET: 2 free. One is free; three at once cost 2 spice for the third.
  check('the sheet says atreides revive two free', factionById('atreides')?.freeRevivals, 2)
  const one = reviveForces({ faction: 'atreides', tanks, plain: 1, starred: 0, soFar: none, spice: 0 })
  check('the first force is free', one.ok && one.cost, 0)
  const three = reviveForces({ faction: 'atreides', tanks, plain: 3, starred: 0, soFar: none, spice: 10 })
  check('three at once price only the third', three.ok && three.cost, REVIVAL_SPICE)
  check('...and go to reserves, never the board',
    three.ok && three.toReserves, { plain: 3, starred: 0 })
  check('...leaving the tanks lighter', three.ok && three.tanks.forces.atreides, { plain: 3, starred: 0 })

  // THE COST IS MARGINAL ACROSS PRESSES: two free presses then a paid one.
  const second = reviveForces({
    faction: 'atreides', tanks, plain: 1, starred: 0, soFar: { forces: 2, starred: 0 }, spice: 2,
  })
  check('a later press pays only past the free allowance', second.ok && second.cost, REVIVAL_SPICE)

  // THE CAP IS THREE, however they are split.
  check('a fourth is refused',
    (reviveForces({ faction: 'atreides', tanks, plain: 1, starred: 0, soFar: { forces: 3, starred: 0 }, spice: 9 }) as { refusal: string }).refusal,
    'over-the-cap')
  check('...and so is asking past it at once',
    (reviveForces({ faction: 'atreides', tanks, plain: 4, starred: 0, soFar: none, spice: 99 }) as { refusal: string }).refusal,
    'over-the-cap')

  // ONE STARRED A TURN — Sardaukar and Fedaykin come back one at a time.
  const sard = reviveForces({ faction: 'emperor', tanks, plain: 0, starred: 1, soFar: none, spice: 9 })
  check('one starred revives', sard.ok && sard.toReserves, { plain: 0, starred: 1 })
  check('...a second the same turn does not',
    (reviveForces({ faction: 'emperor', tanks, plain: 0, starred: 1, soFar: { forces: 1, starred: 1 }, spice: 9 }) as { refusal: string }).refusal,
    'starred-limit')
  check('...nor two at once',
    (reviveForces({ faction: 'emperor', tanks, plain: 0, starred: 2, soFar: none, spice: 9 }) as { refusal: string }).refusal,
    'starred-limit')
  check('the limit is the named constant', STARRED_REVIVALS_PER_TURN, 1)

  // WHAT IS NOT THERE CANNOT RETURN, and poverty is a refusal, not a debt.
  check('an empty pile refuses',
    (reviveForces({ faction: 'fremen', tanks, plain: 1, starred: 0, soFar: none, spice: 9 }) as { refusal: string }).refusal,
    'nothing-there')
  check('an empty purse refuses',
    (reviveForces({ faction: 'atreides', tanks, plain: 3, starred: 0, soFar: none, spice: 1 }) as { refusal: string }).refusal,
    'cannot-pay')
  check('asking for nothing refuses',
    (reviveForces({ faction: 'atreides', tanks, plain: 0, starred: 0, soFar: none, spice: 9 }) as { refusal: string }).refusal,
    'nothing-asked')
  check('the cap is the named constant', REVIVAL_CAP, 3)
}

// ── the leader cycle ──────────────────────────────────────────────────────
{
  const five = factionById('atreides')!.leaders.map(l => l.name)
  check('a faction fields five leaders', five.length, 5)

  // THE GATE OPENS ON THE FIFTH DEATH, and not before.
  let t = emptyTanks()
  for (const name of five.slice(0, 4)) t = returnLeaderToTanks(t, 'atreides', name)
  check('four dead do not open the gate', t.leaderRevivalOpen ?? [], [])
  check('...and the picker offers nobody', revivableLeaders(t, 'atreides'), [])
  t = returnLeaderToTanks(t, 'atreides', five[4])
  check('the fifth opens it', t.leaderRevivalOpen, ['atreides'])
  check('...and every leader is on offer', revivableLeaders(t, 'atreides').length, 5)

  // ONE A TURN, AT FIGHTING STRENGTH. Duncan Idaho fights at 2.
  const duncan = reviveLeader({ faction: 'atreides', tanks: t, leader: 'Duncan Idaho', soFar: none, spice: 9 })
  check('a leader costs their fighting strength', duncan.ok && duncan.cost, 2)
  // TWO PRICES, because one alone cannot catch a flat fee that happens to
  // equal it: Jessica fights at 5, and a tariff of 2 would sell her cheap.
  const jessica = reviveLeader({ faction: 'atreides', tanks: t, leader: 'Lady Jessica', soFar: none, spice: 9 })
  check('...each their own', jessica.ok && jessica.cost, 5)
  check('...and walks out of the tanks',
    duncan.ok && duncan.tanks.leaders.atreides.some(l => l.name === 'Duncan Idaho'), false)
  // ONCE OPEN, OPEN FOR GOOD: the revival that thinned the tanks keeps the gate.
  check('...with the gate still open behind them',
    duncan.ok && duncan.tanks.leaderRevivalOpen, ['atreides'])
  check('a second leader the same turn is refused',
    (reviveLeader({ faction: 'atreides', tanks: t, leader: 'Lady Jessica', soFar: { ...none, leader: 'Duncan Idaho' }, spice: 9 }) as { refusal: string }).refusal,
    'leader-already-this-turn')
  check('a shut gate refuses',
    (reviveLeader({ faction: 'harkonnen', tanks: t, leader: 'Feyd Rautha', soFar: none, spice: 9 }) as { refusal: string }).refusal,
    'not-open')
  check('strength unaffordable refuses',
    (reviveLeader({ faction: 'atreides', tanks: t, leader: 'Lady Jessica', soFar: none, spice: 4 }) as { refusal: string }).refusal,
    'cannot-pay')

  // KILLED AGAIN, FACE DOWN — and waiting for the rest of the rotation.
  const back = duncan.ok ? returnLeaderToTanks(duncan.tanks, 'atreides', 'Duncan Idaho', { wasRevived: true }) : emptyTanks()
  check('a revived leader returns face down',
    back.leaders.atreides.find(l => l.name === 'Duncan Idaho')?.faceDown, true)
  check('...and cannot be revived while down',
    (reviveLeader({ faction: 'atreides', tanks: back, leader: 'Duncan Idaho', soFar: none, spice: 9 }) as { refusal: string }).refusal,
    'face-down')
  check('...or picked', revivableLeaders(back, 'atreides').some(l => l.name === 'Duncan Idaho'), false)

  // THE CYCLE TURNS when all five lie face down: everyone flips up at once.
  let cycle = emptyTanks()
  for (const name of five) cycle = returnLeaderToTanks(cycle, 'atreides', name)
  for (const name of five) {
    const up = reviveLeader({ faction: 'atreides', tanks: cycle, leader: name, soFar: none, spice: 9 })
    cycle = up.ok ? returnLeaderToTanks(up.tanks, 'atreides', name, { wasRevived: true }) : cycle
  }
  check('all five down turns the cycle: all face up again',
    cycle.leaders.atreides.every(l => !l.faceDown), true)
  check('...five of them', cycle.leaders.atreides.length, 5)

  // A DOUBLE REPORT IS ONE DEATH.
  const twice = returnLeaderToTanks(returnLeaderToTanks(emptyTanks(), 'atreides', five[0]), 'atreides', five[0])
  check('a leader dies once per death', twice.leaders.atreides.length, 1)
}

// ── the endpoint and the feeds ────────────────────────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const revCase = fn.slice(fn.indexOf("case 'REVIVE'"), fn.indexOf("case 'SEED_SPICE'"))
  check('the endpoint revives', revCase.length > 500, true)
  check('...at the revival phase alone', /'wrong-phase'/.test(revCase), true)

  // TO THE BANK, NEVER THE EMPEROR: the redirect is treachery's alone, and
  // the ledger reason says which rule moved the spice.
  check('the spice goes to the bank',
    /from: playerId, to: BANK, amount: asked\.cost, reason: 'revival'/.test(revCase), true)
  check('...never to a seat', /to: seatOfFaction/.test(revCase), false)

  // TO RESERVES, NEVER THE BOARD.
  check('revived forces go to reserves',
    /reserves: p\.reserves \+ back\.plain/.test(revCase), true)
  check('...the starred beside them',
    /reservesStarred: \(p\.reservesStarred \?\? 0\) \+ back\.starred/.test(revCase), true)
  // SCOPED TO THE WRITE. "forces:" appears in the ledger's TYPE too, so the
  // claim is about what p_state carries: the board rides through on the state
  // spread, never re-stated, never touched.
  const revWrite = revCase.slice(revCase.indexOf('p_state'), revCase.indexOf('p_secrets'))
  check('...and the board is not written', /forces:/.test(revWrite), false)

  // THE LEDGER IS THE TURN'S, like charity's window.
  check('the ledger is stamped with the turn',
    /ledger\?\.turn === turn \? \{ \.\.\.ledger\.done \} : \{\}/.test(revCase), true)
  // THE PURSE MERGES — the smallest write is where a hand gets lost.
  check('the purse merges into the row',
    /\{ \.\.\.secrets, spice: moved\.purses\[playerId\] \}/.test(revCase), true)
  // THE COST GOES BACK TO THE CALLER, not into the row the table reads.
  check('the cost is the caller\'s alone', /cost: asked\.cost/.test(revCase), true)

  // BOTH KILLERS PAY IN. The worm's commit banks its dead in the same write
  // that removes them from the board; the storm's entry patch is behavioural,
  // tested above.
  const commit = fn.slice(fn.indexOf('const commitBlow'), fn.indexOf('const publishBlowStep'))
  check('the worm banks its dead in the commit',
    /tanks: bankDead\(/.test(commit), true)
  check('...fed by the advanced path', /dead: out\.toTanks \?\? \[\]/.test(fn), true)
  check('...and the basic path', /dead: out\.toTanks,/.test(fn), true)
}

// ── every sheet's free allowance is real ──────────────────────────────────
// ── the rail is revival's one surface, everywhere the screen is ───────────
// The panel this replaced lived on the match screen's notice board — the one
// revival control the harness's embed could not reach, which surfaced as
// "revival isn't letting me claim" with nothing to press. The rail lives on
// the game screen itself, so both the real match and the harness carry it,
// each posting through its own session.
{
  const code = (p: string) => readFileSync(p, 'utf8')
  const game = code('src/components/dune/DuneGameScreen.tsx')
  check('the game screen raises the rail at the phase',
    /state\.phase === 'Revival' && seat && mine && onRevive && \(/.test(game), true)
  const match = code('src/components/dune/DuneMatchScreen.tsx')
  check('the match screen hands the rail its sender',
    /onRevive=\{seat \? a => void revive\(a\) : undefined\}/.test(match), true)
  check('...and its own panel is gone',
    /Revive 1/.test(match), false)
  const harness = code('src/components/dune/DuneMultiSeatView.tsx')
  check('the harness posts revivals as the selected seat',
    /onRevive=\{mine\s*[\r\n]+\s*\? a => void send\(mine, 'REVIVE', a as never\)/.test(harness), true)
}

check('every faction sheet names its free revivals',
  FACTION_IDS.filter(id => typeof factionById(id)?.freeRevivals !== 'number'), [])
check('...all within the cap',
  FACTION_IDS.filter(id => (factionById(id)?.freeRevivals ?? 0) > REVIVAL_CAP), [])

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
