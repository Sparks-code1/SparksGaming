// End of a 15-game campaign: the world belongs to whoever signed the board
// most. Decided after game 15, or earlier once nobody can catch the leader.
import {
  campaignOutcome, championLabel, applyCampaignCompletion, CAMPAIGN_GAMES,
} from '@/lib/campaign'
import { createRoster } from '@/lib/roster'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const ROSTER = createRoster(['Ryan', 'Alice', 'Bob', 'Carol'], 1)

/** Build a legacy state where each player has won the given number of games. */
const withWins = (wins: Record<string, number>, gamesPlayed?: number) => {
  const victoryLog: any[] = []
  let g = 1
  for (const [playerId, n] of Object.entries(wins)) {
    for (let i = 0; i < n; i++) {
      victoryLog.push({ gameNumber: g++, winnerName: playerId, winnerPlayerId: playerId, factionId: 'f' })
    }
  }
  const played = gamesPlayed ?? victoryLog.length
  return { roster: ROSTER, victoryLog, currentGameNumber: played + 1, historyLog: [] } as any
}

// ─── 1. The full 15 games ─────────────────────────────────────────────────
console.log('--- the full campaign ---')
check('a campaign is 15 games', CAMPAIGN_GAMES, 15)
{
  const o = campaignOutcome(withWins({ p1: 6, p2: 4, p3: 3, p4: 2 }))
  check('after 15 games the leader takes the world', o.championIds, ['p1'])
  check('...and it is decided', o.decided, true)
  check('...not an early clinch', o.clinchedEarly, false)
  check('games played is 15', o.gamesPlayed, 15)
  check('standings are ordered by games won',
    o.standings.map(s => `${s.name}:${s.signatures}`),
    ['Ryan:6', 'Alice:4', 'Bob:3', 'Carol:2'])
  check('the announcement names the champion', championLabel(o), 'Ryan')
}

// ─── 2. Mid-campaign: not decided ─────────────────────────────────────────
console.log('\n--- while games remain ---')
{
  const o = campaignOutcome(withWins({ p1: 3, p2: 1, p3: 1 }))   // 5 played, 10 left
  check('a 2-game lead with 10 to play is not decided', o.decided, false)
  check('no champion yet', o.championIds, [])
  check('games remaining', o.gamesRemaining, 10)
}
check('an untouched campaign is not decided', campaignOutcome(withWins({})).decided, false)
check('no roster -> nothing to decide',
  campaignOutcome({ roster: [], victoryLog: [], currentGameNumber: 16 } as any).decided, false)
check('15 games with no winners recorded crowns nobody',
  campaignOutcome({ roster: ROSTER, victoryLog: [], currentGameNumber: 16 } as any).decided, false)

// ─── 3. The early clinch ──────────────────────────────────────────────────
console.log('\n--- clinching early ---')
{
  // 12 played, 3 left. Ryan 8, Alice 2: even winning all 3 Alice reaches 5.
  const o = campaignOutcome(withWins({ p1: 8, p2: 2, p3: 1, p4: 1 }))
  check('unassailable lead ends the campaign early', o.decided, true)
  check('flagged as an early clinch', o.clinchedEarly, true)
  check('the champion is the leader', o.championIds, ['p1'])
  check('3 games were left on the calendar', o.gamesRemaining, 3)
}
{
  // 12 played, 3 left. Ryan 6, Alice 3: Alice can reach 6 and TIE, so the
  // race is still alive — a tie would leave the world shared.
  const o = campaignOutcome(withWins({ p1: 6, p2: 3, p3: 2, p4: 1 }))
  check('a rival who can still draw level keeps the campaign open', o.decided, false)
}
{
  // 12 played, 3 left. Ryan 7, Alice 3: Alice tops out at 6. Clinched.
  const o = campaignOutcome(withWins({ p1: 7, p2: 3, p3: 1, p4: 1 }))
  check('a rival who tops out one short means it is over', o.decided, true)
  check('...and it clinched early', o.clinchedEarly, true)
}
{
  // Only the BEST rival matters, not the sum of everyone chasing.
  const o = campaignOutcome(withWins({ p1: 8, p2: 2, p3: 2 }))   // 12 played, 3 left
  check('several distant rivals cannot combine to catch the leader', o.decided, true)
}
{
  // Two players tied at the top mid-campaign is never a clinch.
  const o = campaignOutcome(withWins({ p1: 5, p2: 5, p3: 1, p4: 1 }))
  check('a shared lead mid-campaign is not decided', o.decided, false)
}

// ─── 4. A tie at the end ──────────────────────────────────────────────────
console.log('\n--- a shared world ---')
{
  const o = campaignOutcome(withWins({ p1: 5, p2: 5, p3: 3, p4: 2 }))
  check('a tie after 15 games crowns both', o.championIds, ['p1', 'p2'])
  check('...and is decided', o.decided, true)
  check('...and reads naturally', championLabel(o), 'Ryan and Alice')
}
{
  const o = campaignOutcome(withWins({ p1: 4, p2: 4, p3: 4, p4: 3 }))
  check('a three-way tie names all three', championLabel(o), 'Ryan, Alice and Bob')
}

// ─── 5. Stamping the result onto legacy state ─────────────────────────────
console.log('\n--- persisting completion ---')
{
  const base = withWins({ p1: 8, p2: 2, p3: 1, p4: 1 })
  const o = campaignOutcome(base)
  const done = applyCampaignCompletion(base, o)
  check('campaign marked complete', done.campaignComplete, true)
  check('champion recorded', done.campaignWinnerId, 'p1')
  check('all champions recorded', done.campaignChampionIds, ['p1'])
  check('no game may be left in progress', done.gameInProgress, false)
  check('the saved game snapshot is cleared', done.activeGameState, null)
  check('the campaign story gets a closing line',
    done.historyLog[done.historyLog.length - 1].entry,
    'The world belongs to Ryan — campaign complete after 12 games')

  // Re-running must never rewrite the champion (remounts, replayed saves).
  const again = applyCampaignCompletion(done, campaignOutcome(done))
  check('applying completion twice changes nothing', again, done)
  check('...and does not duplicate the history line', again.historyLog.length, done.historyLog.length)
}
{
  const open = withWins({ p1: 2, p2: 1 })
  check('an undecided campaign is left untouched',
    applyCampaignCompletion(open, campaignOutcome(open)), open)
}

// ─── 6. Game counting is robust ───────────────────────────────────────────
console.log('\n--- counting games ---')
{
  // A game that ended without a recorded winner still advances the counter;
  // trusting the victory log alone would overstate the games remaining.
  const lg = withWins({ p1: 8, p2: 2 }, 13)   // 10 signed, counter says 13
  check('the larger of signed games and the counter is used',
    campaignOutcome(lg).gamesPlayed, 13)
  check('...so 2 games remain, and the lead is unassailable',
    [campaignOutcome(lg).gamesRemaining, campaignOutcome(lg).decided], [2, true])
}
check('games played never exceeds the campaign length',
  campaignOutcome(withWins({ p1: 9, p2: 9 }, 40)).gamesPlayed, 15)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
