// The Dune lobby: six seats, one faction each, and a deal nobody's browser does.
//
// WHY THIS EXISTS. Until now a Dune match could only be conjured by a script
// holding the service-role key. This is the path a player takes instead, and
// most of it is lib/lobby's — taking a seat, readying up, leaving, watching the
// room. What is genuinely new is small and worth checking hard: the table seats
// six rather than five, there is no campaign, every seat picks a faction and no
// two may pick the same, and starting the game is an ACTION rather than a
// client write, because the deal touches two tables no client may write at all.
import { readFileSync } from 'node:fs'
import {
  factionRefusal, freeFactions, duneReadiness, DUNE_MIN_SEATS, DUNE_MAX_SEATS,
} from '@/lib/dune/duneLobby'
import { nextFreeSeat, MAX_SEATS, UNASSIGNED_FACTION } from '@/lib/lobby'
import type { LobbySeat } from '@/lib/lobby'
import { FACTION_IDS } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const seat = (over: Partial<LobbySeat> = {}): LobbySeat => {
  return {
    seat: 0, playerId: 'p', userId: 'u', name: 'Somebody',
    factionId: 'atreides', isAI: false, aiDifficulty: null, ready: false, choice: null,
    ...over,
  }
}

// ── the table seats six ───────────────────────────────────────────────────
// Risk seats five and Dune six. With the cap hard-coded, the sixth player was
// handed the value nextFreeSeat returns when the lobby is FULL — which happened
// to be 5, the right number reached down the wrong path, and would have stopped
// being right the next time either game changed size.
{
  check('Dune seats two to six', [DUNE_MIN_SEATS, DUNE_MAX_SEATS], [2, 6])
  check('...which is more than Risk seats', DUNE_MAX_SEATS > MAX_SEATS, true)

  const five = [0, 1, 2, 3, 4].map(n => seat({ seat: n }))
  check('the sixth seat at a Dune table is the sixth',
    nextFreeSeat(five, DUNE_MAX_SEATS), 5)
  check('...and a full Dune table has no free seat',
    nextFreeSeat([...five, seat({ seat: 5 })], DUNE_MAX_SEATS), DUNE_MAX_SEATS)
  // RISK IS UNCHANGED, which is the point of defaulting the parameter.
  check('a Risk table is still full at five', nextFreeSeat(five), MAX_SEATS)
  check('...and gaps are filled before the end', nextFreeSeat([seat({ seat: 0 }), seat({ seat: 2 })]), 1)
}

// ── one faction each ──────────────────────────────────────────────────────
// THE FACTION IS THE SEAT. Two Atreides is not a variant, it is a game with two
// of the same rules card, two prescience powers and one set of leaders between
// them.
{
  const others = [seat({ userId: 'them', factionId: 'harkonnen' })]

  check('a free faction may be taken',
    factionRefusal(others, 'atreides', 'me'), null)
  // REFUSED, rather than refused IN THESE WORDS. Pinning the sentence made
  // rewording a message somebody reads look like a broken rule.
  const takenBy = factionRefusal(others, 'harkonnen', 'me')
  check('one somebody else holds may not', typeof takenBy === 'string' && takenBy.length > 0, true)
  // YOUR OWN IS NOT A CLASH. Re-picking what you already hold has to be a
  // no-op rather than a refusal, or the chip you are sitting on is disabled.
  check('...but your own is always yours',
    factionRefusal([seat({ userId: 'me', factionId: 'fremen' })], 'fremen', 'me'), null)
  const noSuch = factionRefusal([], 'sardaukar', 'me')
  check('a faction the game does not have is refused',
    typeof noSuch === 'string' && noSuch.length > 0, true)
  check('...and so is the placeholder a seat starts with',
    factionRefusal([], UNASSIGNED_FACTION, 'me') !== null, true)
  // AND THE TWO REFUSALS ARE DIFFERENT. Being told a faction is taken when it
  // does not exist sends somebody looking for whoever took it.
  check('...and the two are not the same refusal', noSuch === takenBy, false)

  // WHAT IS LEFT, from the same rule.
  check('an empty table leaves every faction free', freeFactions([]).length, FACTION_IDS.length)
  check('...and a taken one is gone',
    freeFactions(others).includes('harkonnen' as FactionId), false)
  check('...while your own stays yours to keep',
    freeFactions([seat({ userId: 'me', factionId: 'fremen' })], 'me')
      .includes('fremen' as FactionId), true)
}

// ── when the game may be dealt ────────────────────────────────────────────
// ONE FUNCTION, so the button and the status line cannot disagree — a joiner
// told "waiting for the host" while the host is told "waiting for a player" is
// a standoff with no way out from either screen.
{
  const two = [
    seat({ seat: 0, userId: 'a', playerId: 'a', name: 'Ann', factionId: 'atreides', ready: true }),
    seat({ seat: 1, userId: 'b', playerId: 'b', name: 'Bo', factionId: 'harkonnen', ready: true }),
  ]
  const ready = duneReadiness({ seats: two })
  check('two seated, chosen and ready is startable', ready.canStart, true)
  check('...with nothing to say about it', ready.reason, null)

  check('one player is not a game',
    duneReadiness({ seats: [two[0]] }).canStart, false)
  check('...and says how many are missing',
    duneReadiness({ seats: [two[0]] }).reason, 'Waiting for 1 more player')

  // A SEAT WITHOUT A FACTION CANNOT BE DEALT. openingPosition reads the faction
  // for spice, forces, leaders and hand limit; a seat holding the placeholder
  // would be dealt nothing and stand nowhere.
  const unchosen = duneReadiness({
    seats: [two[0], { ...two[1], factionId: UNASSIGNED_FACTION }],
  })
  check('a seat with no faction stops the deal', unchosen.canStart, false)
  check('...and is named', unchosen.reason, 'Waiting for Bo to pick a faction')
  check('...by name rather than by seat number', unchosen.unchosen, ['Bo'])

  const notReady = duneReadiness({ seats: [two[0], { ...two[1], ready: false }] })
  check('somebody not ready stops it too', notReady.canStart, false)
  check('...and says how many', notReady.reason, 'Waiting for 1 player to be ready')

  // THE ORDER OF THE COMPLAINTS matters: a player who has not picked is told
  // to pick rather than told to ready up, which they cannot usefully do.
  const both = duneReadiness({
    seats: [two[0], { ...two[1], factionId: UNASSIGNED_FACTION, ready: false }],
  })
  check('picking is asked for before readying', /pick a faction/.test(both.reason ?? ''), true)
}

// ── most of it is lib/lobby's ─────────────────────────────────────────────
// Two lobbies would drift the first time either was fixed, and the failure
// would be somebody joining a game that does not think they are in it.
{
  const src = code('src/lib/dune/duneLobby.ts')
  for (const shared of ['readLobby', 'takeSeat', 'setReady', 'leaveLobby', 'subscribeLobby']) {
    check(`${shared} is imported rather than rewritten`,
      new RegExp(`import \\{[^}]*\\b${shared}\\b[^}]*\\} from '@/lib/lobby'`).test(src), true)
  }
  // AND THE SEAT IS TAKEN AT A DUNE-SIZED TABLE.
  check('a seat is taken with the Dune cap',
    /takeSeat\([\s\S]{0,200}DUNE_MAX_SEATS,/.test(src), true)

  // ── BOTH PATHS THAT SET A FACTION CHECK IT FIRST ────────────────────────
  // The pure rule being right is not the rule being applied. Two functions set
  // a faction — joining with one, and changing to another — and the first
  // draft of this suite checked neither, so stripping the check out of both
  // walked straight through.
  const body = (name: string, until: string) =>
    src.slice(src.indexOf(`export async function ${name}`), src.indexOf(`export async function ${until}`))
  const joining = body('joinDuneLobby', 'chooseFaction')
  const changing = body('chooseFaction', 'startDuneMatch')
  check('both faction paths are there to check',
    joining.length > 100 && changing.length > 100, true)
  check('joining checks the faction is free',
    /factionRefusal\(lobby\.seats, request\.faction, user\.id\)/.test(joining), true)
  check('...and refuses rather than seating a duplicate',
    /if \(clash\) throw new Error\(clash\)/.test(joining), true)
  check('changing to another checks too',
    /factionRefusal\(lobby\.seats, faction, user\.id\)/.test(changing), true)
  check('...and refuses the same way',
    /if \(clash\) throw new Error\(clash\)/.test(changing), true)
  // YOUR OWN ROW AND NOBODY ELSE'S. The policy says so; so must the query, or
  // a player could hand every seat at the table the same faction.
  check('...writing only your own seat',
    /\.eq\('user_id', user\.id\)/.test(changing), true)
  check('...in this match', /\.eq\('match_id', matchId\)/.test(changing), true)
}

// ── a Dune match belongs to no campaign ───────────────────────────────────
{
  const src = code('src/lib/dune/duneLobby.ts')
  check('the lobby is created with no campaign', /campaign_id: null,/.test(src), true)
  check('...and says which game it is', /game_type: 'dune',/.test(src), true)
  check('...and is found by that rather than by campaign',
    /\.eq\('game_type', 'dune'\)[\s\S]{0,80}\.eq\('status', 'lobby'\)/.test(src), true)

  // THE COLUMN HAS TO ALLOW IT. Risk's queries all name their campaign and a
  // null never matches an equality test, so they cannot see these rows.
  const migration = readFileSync(
    'supabase/migrations/20260826180000_dune_lobbies_have_no_campaign.sql', 'utf8')
  check('a migration lets campaign_id be null',
    /alter table matches alter column campaign_id drop not null/i.test(migration), true)
}

// ── the deal is not a client write ────────────────────────────────────────
// THE ONE THAT MATTERS MOST HERE. Risk's startLobby writes the opening state
// from the browser. Dune cannot: the deal writes match_secrets, which has no
// client write policy, and match_decks, which has no client policy at all.
{
  const src = code('src/lib/dune/duneLobby.ts')
  check('starting a Dune game posts an action',
    /dispatchDuneAction\(matchId, \{ type: 'START_DUNE'/.test(src), true)
  check('...and never writes the state itself',
    /from\('matches'\)[\s\S]{0,120}\.update\(\{[^}]*state/.test(src), false)
  check('...nor touches the secrets', /match_secrets/.test(src), false)
  check('...nor the decks', /match_decks/.test(src), false)
  check('...and does not reuse Risk\'s start', /startLobby/.test(src), false)

  const screen = code('src/components/dune/DuneLobbyScreen.tsx')
  check('the screen deals nothing either', /match_secrets|match_decks|apply_match_write/.test(screen), false)
  check('...it asks the lobby to start the game', /startDuneMatch\(matchId\)/.test(screen), true)
}

// ── a dealt match stops being a lobby ─────────────────────────────────────
// Otherwise it sits in the open-tables list with a board on it: nobody can
// play it, because the deal is refused a second time, and nobody can clear it.
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const startCase = fn.slice(fn.indexOf("case 'START_DUNE'"), fn.indexOf("case 'SETUP_ANSWER'"))

  check('the deal flips the match out of the lobby',
    /update\(\{ status: 'active' \}\)/.test(startCase), true)
  // AFTER THE DEAL, not before: the other order leaves an active match with no
  // board on it, which is the worse of the two half-states.
  const dealt = startCase.indexOf('p_state: opening.state')
  const flips = [...startCase.matchAll(/update\(\{ status: 'active' \}\)/g)].map(m => m.index ?? -1)
  // EXACTLY TWO, and both after the board: the one that ends a fresh deal, and
  // the one that repairs a deal whose flip was interrupted. A third, earlier,
  // would leave an active match with no board on it — and counting rather than
  // finding the first one after the deal is what catches an extra put in
  // front, which searching forwards from the deal cannot see.
  check('the status is flipped once for the deal and once to repair', flips.length, 2)
  check('...and never before the board is written',
    dealt > 0 && flips.every(i => i > startCase.indexOf('const dealt =')), true)
  check('...with the deal itself flipping after its own write',
    flips.some(i => i > dealt), true)
  // AND THE HALF-STATE IT CAN LEAVE IS REPAIRED rather than being a match
  // nobody can do anything with.
  check('a dealt match still listed as open is repaired',
    /if \(match\.status === 'lobby'\)/.test(startCase), true)
  check('...and any other repeat is still refused',
    /'already-started'/.test(startCase), true)
  check('the status is read to decide that',
    /\.select\('[^']*status[^']*'\)/.test(fn), true)
}

// ── a way in that is not a query flag ─────────────────────────────────────
{
  const app = code('src/App.tsx')
  check('the app has a Dune lobby screen', /screen === 'dune-lobby'/.test(app), true)
  check('...and a match screen after it', /screen === 'dune-match' && duneMatch/.test(app), true)
  check('...reached from the campaign screen', /onPlayDune=\{\(\) => setScreen\('dune-lobby'\)\}/.test(app), true)
  // THE URL FOLLOWS so a refresh lands back in the same match and the address
  // bar is something a player can send somebody — the route main.tsx already
  // has, reached without anybody typing it.
  check('...and the address bar keeps up',
    /replaceState\(null, '', `\?dune-match=\$\{id\}`\)/.test(app), true)

  const between = code('src/components/BetweenGameScreen.tsx')
  check('the campaign screen offers it', /onPlayDune/.test(between), true)
  check('...where somebody is choosing what to play',
    /status === 'picking' && onPlayDune/.test(between), true)
  // NOT AMONG THE CAMPAIGNS. Dune has no world, no scars and no game number,
  // and a row in the picker would read as a campaign somebody could open.
  check('...as its own thing rather than a campaign',
    /OR PLAY SOMETHING ELSE/.test(between), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
