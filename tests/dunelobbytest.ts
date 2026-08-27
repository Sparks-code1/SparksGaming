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
  factionRefusal, freeFactions, duneReadiness, newJoinCode, normaliseCode,
  randomFreeFaction, isHost, hostSeat, CODE_LENGTH, DUNE_MIN_SEATS, DUNE_MAX_SEATS,
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
  check('...and your own games are found by that rather than by campaign',
    /\.eq\('game_type', 'dune'\)/.test(src), true)

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

// ── a table is found by its code, not by browsing ─────────────────────────
// THE ONE THAT MATTERS IN THIS SECTION. The select policy showed every open
// lobby to every signed-in account; Risk never noticed because its lobbies are
// reached through a campaign id you only have if somebody gave you the
// campaign's code. Dune has no campaign, so the screen listed the deployment.
{
  const src = code('src/lib/dune/duneLobby.ts')
  const screen = code('src/components/dune/DuneLobbyScreen.tsx')

  // NOTHING LISTS OTHER PEOPLE'S TABLES any more.
  check('the module offers no list of open tables', /openDuneLobbies/.test(src), false)
  check('...and the screen does not render one',
    /dune-open-tables/.test(screen), false)
  // What is left is a way back to your own, which is a different thing.
  check('what is listed is the tables you are at', /myDuneLobbies/.test(src), true)
  check('...and the screen says so', /YOUR GAMES/.test(screen), true)

  // JOINING GOES THROUGH THE SERVER, because the row is not readable until you
  // are seated. A client-side filter would be no gate at all: anything the
  // browser filters, the browser could have not filtered.
  check('joining by code asks the server',
    /supabase\.rpc\('join_dune_lobby', \{/.test(src), true)
  check('...passing the code as the credential', /p_code: tidy,/.test(src), true)
  check('...and never inserting a seat itself',
    /joinDuneByCode[\s\S]{0,900}from\('match_players'\)\.insert/.test(src), false)
  check('the screen joins that way too', /joinDuneByCode\(code, \{/.test(screen), true)
}

// ── the codes themselves ──────────────────────────────────────────────────
{
  // READ DOWN A PHONE AND TYPED BY SOMEBODY WHO DID NOT WRITE IT. The pairs
  // people confuse are worth more than the combinations they cost.
  const many = Array.from({ length: 400 }, () => newJoinCode())
  // A LENGTH, checked against a number rather than against itself. Every
  // assertion below builds its expectation out of CODE_LENGTH, so shortening
  // the constant changed both sides and none of them could fail — a code could
  // have gone to three characters with the suite green.
  check('a code is long enough to be worth having', CODE_LENGTH >= 5, true)
  check('...and short enough to read down a phone', CODE_LENGTH <= 10, true)
  check('a code is the length it says', new Set(many.map(c => c.length)), new Set([CODE_LENGTH]))
  check('...with no O or 0 in it', many.some(c => /[O0]/.test(c)), false)
  check('...and no I or 1', many.some(c => /[I1]/.test(c)), false)
  check('...uppercase and alphanumeric throughout',
    many.every(c => /^[A-Z2-9]+$/.test(c)), true)
  // NOT THE SAME CODE EVERY TIME, which a constant would also satisfy above.
  check('...and they differ from each other', new Set(many).size > 350, true)
  // Deterministic when it is handed a source of randomness, so a test can pin
  // one rather than hope.
  check('a fixed source gives a fixed code',
    newJoinCode(() => 0), 'A'.repeat(CODE_LENGTH))

  // TYPED BY HAND, so compared the way it is read.
  check('a code is read case-insensitively', normaliseCode('abcdef'), 'ABCDEF')
  check('...ignoring spacing', normaliseCode(' ab c de f '), 'ABCDEF')
  check('...and punctuation somebody adds', normaliseCode('AB-CD-EF'), 'ABCDEF')

  check('creating a table mints one',
    /join_code: newJoinCode\(\),/.test(code('src/lib/dune/duneLobby.ts')), true)
}

// ── the code rides beside the lobby, never on it ──────────────────────────
// readLobby is Risk's too. Adding join_code to its select would mean a database
// without the column erroring on every lobby read in BOTH games — the whole
// screen gone, for a decoration.
{
  const lobby = code('src/lib/lobby.ts')
  check('Risk\'s lobby read does not ask for the column',
    /join_code/.test(lobby), false)
  const src = code('src/lib/dune/duneLobby.ts')
  check('the Dune side reads it separately', /export async function duneJoinCode/.test(src), true)
  check('...and treats a failure as simply not having one',
    /if \(error \|\| !data\) return null/.test(src), true)
}

// ── the policy, which is where the gate actually is ───────────────────────
{
  const raw = readFileSync('supabase/migrations/20260826210000_dune_join_codes.sql', 'utf8')
  // WITHOUT THE COMMENTS, for the same reason the TypeScript checks strip
  // theirs: this file explains itself at length, and a structural check that
  // spans a paragraph of prose is measuring the prose. The comments are still
  // read below where the CLAIM is about what is written down.
  const sql = raw.replace(/^\s*--.*$/gm, '')

  check('the column is added', /add column if not exists join_code text/i.test(sql), true)
  // UNIQUE AMONG OPEN LOBBIES ONLY. A code may be handed out again once its
  // game is over, and a unique index over everything makes codes scarcer the
  // longer the deployment runs.
  check('...and codes are unique while a table is open',
    /create unique index[\s\S]{0,160}where status = 'lobby'/i.test(sql), true)

  // RISK IS UNTOUCHED. This is the part that would break somebody else's game,
  // so it is asserted rather than trusted.
  check('the policy leaves every non-Dune lobby as it was',
    /coalesce\(game_type, 'risk'\) <> 'dune'/.test(sql), true)
  check('...and a Dune lobby is visible only to its table',
    /created_by = auth\.uid\(\)[\s\S]{0,120}is_seated_in\(id\)/.test(sql), true)

  // THE RECURSION. A policy on matches that asks about match_players, whose own
  // policy asks about matches, is what Postgres refuses outright.
  check('the seated check is a definer function',
    /create or replace function is_seated_in[\s\S]{0,200}security definer/i.test(sql), true)
  // THE POLICY ON matches MUST NOT MENTION match_players. That is the cycle
  // Postgres refuses: its policy asks about the other table, whose policy asks
  // back. Scoped to the policy body, because the definer function above it
  // reads match_players quite legitimately — that is the whole point of it.
  const lobbyPolicy = sql.slice(sql.indexOf('create policy "authed read lobbies"'),
    sql.indexOf('drop policy if exists "authed read lobby seats"'))
  check('the lobby policy is there to check', lobbyPolicy.length > 80, true)
  check('...so the two policies do not ask each other',
    /match_players/.test(lobbyPolicy), false)

  // JOINING IS THE SERVER'S. The row cannot be selected, so it cannot be
  // joined by selecting it.
  check('joining is a definer function',
    /create or replace function join_dune_lobby[\s\S]{0,400}security definer/i.test(sql), true)
  check('...that checks the game as well as the code',
    /game_type = 'dune'/.test(sql), true)
  check('...and the table is not full', /taken >= coalesce\(m\.human_slots/.test(sql), true)
  check('...and the faction is free', /faction_id = p_faction/.test(sql), true)
  // COMING BACK IS NOT JOINING AGAIN.
  check('...while somebody already seated is let back in',
    /already seated is not an error/i.test(raw)
      && /return m\.id;/.test(sql), true)
  // AND IT IS NOT EXECUTABLE BY ANYBODY WHO IS NOT SIGNED IN.
  check('...taken away from everybody first',
    /revoke all on function join_dune_lobby/i.test(sql), true)
  check('...and granted to signed-in callers only',
    /grant execute on function join_dune_lobby\(text, text, text\) to authenticated/i.test(sql), true)
  // ANON APPEARS NOWHERE IN THE GRANT. Written as a word boundary rather than
  // as "to anon": the grant that let it in read "to authenticated, anon", which
  // the narrower pattern walked straight past.
  check('...never to anonymous ones', /\banon\b/i.test(sql), false)
}

// ── you sit down first, then choose ───────────────────────────────────────
// CHOOSING BEFORE JOINING MEANT CHOOSING BLIND. A Dune table is invisible until
// you are at it — that is what the join code buys — so somebody picking the
// Atreides had no way to see that it was taken, and was simply refused with no
// way to find out what was left.
{
  const src = code('src/lib/dune/duneLobby.ts')
  const screen = code('src/components/dune/DuneLobbyScreen.tsx')

  check('joining by code asks for no faction',
    /joinDuneByCode\(\s*code: string, request: \{ name: string \},/.test(src), true)
  check('...and sends none to the server', /p_faction: null,/.test(src), true)
  check('opening a table asks for none either',
    /createDuneLobby\(input: \{[\s\S]{0,200}faction: FactionId/.test(src), false)
  check('...seating the host holding the placeholder',
    /faction_id: UNASSIGNED_FACTION,/.test(src), true)
  check('the screen no longer offers one before joining',
    /FACTION<\/h2>/.test(screen), false)
  check('...and still offers one at the table',
    /YOUR FACTION/.test(screen), true)

  const sql = readFileSync('supabase/migrations/20260827090000_dune_table_talk.sql', 'utf8')
  check('the server seats without a faction too',
    /p_faction text default null/.test(sql), true)
  check('...refusing one only when it is actually taken',
    /want is not null and want <> 'unassigned' and exists/.test(sql), true)
  check('...and never treating the placeholder as taken',
    /coalesce\(want, 'unassigned'\)/.test(sql), true)
}

// ── random ────────────────────────────────────────────────────────────────
// SIX FACTIONS PLAY VERY DIFFERENTLY and picking one is most of a decision a
// new player has no basis for making.
{
  const seated = (factions: string[]) => factions.map((f, i) =>
    seat({ seat: i, userId: `u${i}`, playerId: `p${i}`, factionId: f }))

  // IT ONLY EVER DRAWS FROM WHAT IS FREE, which is the whole rule: two players
  // cannot be handed the same faction.
  const taken = seated(['atreides', 'harkonnen', 'fremen'])
  for (let i = 0; i < 60; i++) {
    const pick = randomFreeFaction(taken, 'somebody-else')
    if (pick && ['atreides', 'harkonnen', 'fremen'].includes(pick)) {
      check('random never lands on a faction somebody has', pick, 'never happens')
      break
    }
  }
  check('random draws only from what is free', true, true)

  // YOUR OWN IS FAIR GAME — re-rolling should be able to keep what you have.
  const mine = seated(['atreides'])
  const rolls = new Set(Array.from({ length: 80 }, () => randomFreeFaction(mine, 'u0')))
  check('...including the one you already hold', rolls.has('atreides' as FactionId), true)

  // NOTHING LEFT IS NULL rather than a faction somebody is playing.
  const full = seated(FACTION_IDS as unknown as string[])
  check('a full table gives nothing back', randomFreeFaction(full, 'nobody'), null)

  // Deterministic when handed a source of randomness, so this is pinnable.
  check('a fixed source gives a fixed pick',
    randomFreeFaction([], 'me', () => 0), FACTION_IDS[0])
  check('...and reaches the last one too',
    randomFreeFaction([], 'me', () => 0.999), FACTION_IDS[FACTION_IDS.length - 1])

  const screen = code('src/components/dune/DuneLobbyScreen.tsx')
  check('the screen offers it', /aria-label="Random faction"/.test(screen), true)
  check('...and it goes through the same choosing as a chip',
    /randomFreeFaction\(lobby\.seats, user\.id\)[\s\S]{0,200}chooseFaction\(matchId, pick\)/.test(screen), true)
  check('...and is offered only while something is free',
    /disabled=\{busy \|\| free\.length === 0\}/.test(screen), true)
}

// ── the table agrees which game it is playing ─────────────────────────────
// Basic and advanced are different games — a different storm die, the Kwisatz
// Haderach, Sardaukar, Fedaykin, the advisor. It used to be settled by whoever
// pressed Start, out of a default nobody was shown.
{
  const src = code('src/lib/dune/duneLobby.ts')
  const screen = code('src/components/dune/DuneLobbyScreen.tsx')
  const sql = readFileSync('supabase/migrations/20260827090000_dune_table_talk.sql', 'utf8')

  check('the mode is on the row', /add column if not exists game_mode/.test(sql), true)
  check('...and is one of the two games', /game_mode in \('basic', 'advanced'\)/.test(sql), true)
  check('the lobby writes it when the table is opened', /game_mode: input\.mode \?\? 'advanced',/.test(src), true)
  check('...and can change it while the table is open',
    /export async function setDuneMode/.test(src), true)
  check('...only while it is still a lobby',
    /update\(\{ game_mode: mode \}\)[\s\S]{0,80}\.eq\('status', 'lobby'\)/.test(src), true)

  // THE DEAL IS THE GAME EVERYBODY WAS LOOKING AT, which is the point: reading
  // it off the row rather than defaulting in whichever browser pressed Start.
  check('starting reads the agreed game off the row',
    /const agreed = mode \?\? \(await duneMode\(matchId\)\) \?\? 'advanced'/.test(src), true)
  check('...and sends that to the server', /type: 'START_DUNE', mode: agreed/.test(src), true)
  check('the screen shows which it is', /data-layer="dune-mode"/.test(screen), true)
  check('...and offers the change', /setDuneMode\(matchId, m\)/.test(screen), true)
}

// ── one of the six is the host ────────────────────────────────────────────
//
// WHY THIS EXISTS. Six people who can all press Start is the same standoff as
// none of them able to — the first press wins, and the other five find out the
// game began in the mode they were still arguing about. The database has gated
// writes to the match row on `created_by = auth.uid()` since Risk's lobby was
// written, so this was ALREADY the host's; what was missing was anybody being
// told. RLS on an update matches no rows rather than raising, so a non-host
// pressing Basic changed nothing, said nothing, and left a button that plainly
// did not work.
{
  const src = code('src/lib/dune/duneLobby.ts')
  const screen = code('src/components/dune/DuneLobbyScreen.tsx')

  const table = {
    createdBy: 'u-2',
    seats: [seat({ seat: 0, userId: 'u-1', name: 'Ryan' }),
      seat({ seat: 1, userId: 'u-2', name: 'Jess' }),
      seat({ seat: 2, userId: null, name: 'A bot', isAI: true })],
  }
  check('the host is the account that opened the table', isHost(table, 'u-2'), true)
  check('...and nobody else is', isHost(table, 'u-1'), false)
  // SIGNED OUT IS NOT THE HOST. `createdBy` is nullable, so a bare equality
  // hands the table to everybody who is not logged in — null === null. Asked
  // at a table nobody opened, because that is the only shape where the bad
  // comparison and the good one disagree; a signed-out viewer at a HOSTED
  // table reads false either way, and an assertion that cannot tell the two
  // implementations apart is a line of green that means nothing.
  check('...and being nobody is not being the host',
    isHost({ createdBy: null }, null), false)

  check('the host is found in the seat list', hostSeat(table)?.name, 'Jess')
  // A HOST WHO HAS NOT SAT DOWN yet is a real state: they open the table and
  // the seat write lands after. The screen falls back to saying "the host".
  check('...and is null when they have not sat down',
    hostSeat({ createdBy: 'u-9', seats: table.seats }), null)
  // AND AN EMPTY SEAT IS NOT THE HOST, which `s.userId === lobby.createdBy`
  // alone would make it at a table nobody opened.
  check('...and an empty chair never is',
    hostSeat({ createdBy: null, seats: table.seats }), null)

  // ── THE REFUSAL IS SAID OUT LOUD ────────────────────────────────────────
  // SCOPED TO THE FUNCTION. The whole file talks about matches and lobbies, so
  // a check searching all of it would pass with this write left silent.
  const setMode = src.slice(src.indexOf('export async function setDuneMode'),
    src.indexOf('export function isHost'))
  check('the mode change is there to check', setMode.length > 100, true)
  check('a refused mode change is noticed', /\.select\('id'\)/.test(setMode), true)
  check('...and explained rather than swallowed',
    /data\.length === 0[\s\S]{0,140}throw new Error/.test(setMode), true)

  // ── AND THE SCREEN SAYS WHOSE TABLE IT IS ───────────────────────────────
  const modeButtons = screen.slice(screen.indexOf('data-layer="dune-mode"'),
    screen.indexOf('data-layer="dune-mode"') + 700)
  check('the mode buttons are there to check', modeButtons.length > 200, true)
  check('only the host may change the game',
    /disabled=\{busy \|\| !yours\}/.test(modeButtons), true)
  check('...and only the host may deal it',
    /disabled=\{busy \|\| !readiness\.canStart \|\| !yours\}/.test(screen), true)
  // SHOWN TO EVERYBODY, so the table can see the game is ready and who is
  // holding it up — a hidden button is a table waiting on nothing visible.
  check('...but everybody can see it', /\{readiness\.canStart && /.test(screen), false)
  check('the seat list names the host', /HOST</.test(screen), true)
}

// ── there is a way out, and a way back ────────────────────────────────────
// AN EXIT YOU CANNOT COME BACK THROUGH is worse than no exit: leaving would
// mean abandoning a seat with your spice, your cards and your forces in it.
{
  const src = code('src/lib/dune/duneLobby.ts')
  const screen = code('src/components/dune/DuneLobbyScreen.tsx')
  const match = code('src/components/dune/DuneMatchScreen.tsx')
  const app = code('src/App.tsx')

  // THE LIST IS GAMES AS WELL AS TABLES. A match you walked away from is
  // 'active', and listing only lobbies would strand it.
  check('the list covers games in progress as well as tables',
    /\.in\('status', \['lobby', 'active'\]\)/.test(src), true)
  check('...and the screen tells them apart',
    /l\.status === 'lobby' \? 'Back to it' : 'Rejoin'/.test(screen), true)
  // A DEALT GAME GOES TO THE BOARD, not to a waiting room it has left behind —
  // that would be a room with no seats in it and no way on.
  check('...sending a game straight to the board',
    /if \(l\.status === 'lobby'\) setMatchId\(l\.matchId\)[\s\S]{0,60}else onPlay\(l\.matchId\)/.test(screen), true)

  // THE EXIT ITSELF, which confirms first: it sits near controls pressed in a
  // hurry, and leaving mid-auction because a finger slipped ends an evening.
  // SCOPED TO THE MENU ITEM. "Leave this game" is on the item AND on the
  // dialog it opens, so searching the file found it either way — relabelling
  // the item walked through, and so did wiring it straight to onExit.
  const menu = match.slice(match.indexOf('data-layer="dune-menu"'),
    match.indexOf('{leaving && onExit && ('))
  check('the menu is there to check', menu.length > 100, true)
  check('the match screen offers a way out',
    /aria-label="Leave this game"/.test(menu), true)
  // ASKING FIRST IS ITS JOB. Leaving mid-auction because a finger slipped ends
  // an evening, and a menu item is easier to hit by accident than a corner
  // button was, not harder.
  check('...which asks rather than leaving',
    /setLeaving\(true\)/.test(menu), true)
  check('...and does not go straight out',
    /onClick=\{onExit\}/.test(menu), false)
  check('...with a dialog behind it', /\{leaving && onExit && \(/.test(match), true)

  // ── AND IT IS ONE CORNER RATHER THAN THREE ──────────────────────────────
  // Leaving and the volume are both between-turn things; scattered along
  // different edges they are two things to hunt for instead of one.
  // SCOPED TO THE MENU'S OWN WRAPPER. The notices column sat at the same
  // coordinates, so a check searching the whole file read ITS position and
  // stayed green with the menu moved to the opposite edge. It also hid the
  // fact that the two were drawn on top of each other.
  const menuBox = match.slice(
    Math.max(0, match.indexOf('aria-label="Menu"') - 300),
    match.indexOf('aria-label="Menu"'))
  check('the menu is in a corner of its own', menuBox.length > 100, true)
  check('the menu sits in the corner Risk uses',
    /position: 'fixed', right: 12, top: 12/.test(menuBox), true)
  check('...and nothing else is under it',
    (match.match(/right: 12, top: 12/g) ?? []).length, 1)
  check('...with the sound settings inside it', /<SoundSettings inline \/>/.test(menu), true)
  // A CLICK ELSEWHERE SHUTS IT, or it hangs over a board somebody is reading.
  check('...and it closes when you look away',
    /onClick=\{\(\) => setMenuOpen\(false\)\}/.test(match), true)
  check('...and says the game carries on without them',
    /The game carries on without you and your seat stays yours/.test(match), true)
  // NOT OFFERED WHEN THERE IS NOWHERE TO GO. The standalone ?dune-match route
  // has no screen behind it.
  check('...and is absent when the caller gives it nowhere to go',
    /\{onExit && \(/.test(match), true)

  // EVERY ROUTE, not just App's. The Leave button draws only when it is given
  // somewhere to go, and main.tsx's ?dune-match route passed nothing — so
  // anybody arriving by link, or by refreshing after App set that flag, got a
  // match screen with no way out and no sign there had ever been one.
  const mounts = [
    ...app.matchAll(/<DuneMatchScreen[\s\S]{0,600}?\/>/g),
    ...code('src/main.tsx').matchAll(/<DuneMatchScreen[\s\S]{0,600}?\/>/g),
  ].map(m => m[0])
  check('every route into a match renders one', mounts.length >= 2, true)
  check('...and every one of them offers a way out',
    mounts.filter(m => !/onExit=/.test(m)).length, 0)
  // AND THE WAY OUT GOES SOMEWHERE. `onExit={() => {}}` satisfies "has an
  // exit" and leaves somebody pressing a button that does nothing, which is
  // worse than the missing button it replaced: at least that one was honest.
  //
  // SCOPED TO THE HANDLER. Searching the whole mount for a navigation found the
  // window.location.search in the matchId prop right above it, so an empty
  // handler passed — the same mistake as every other check in this session that
  // searched too wide a slice.
  const exitBody = (mount: string) =>
    (/onExit=\{([\s\S]*?)\}\s*\/>/.exec(mount) ?? [])[1] ?? ''
  check('every exit handler is there to read',
    mounts.filter(m => exitBody(m).length < 5).length, 0)
  check('...and every one of them actually goes somewhere',
    mounts.filter(m => !/(setScreen|window\.location)/.test(exitBody(m))).length, 0)

  check('the app gives it somewhere to go', /onExit=\{\(\) => \{/.test(app), true)
  check('...back to the Dune screen', /setScreen\('dune-lobby'\)/.test(app), true)
  // AND THE URL GOES WITH IT, or a refresh drops them straight back into the
  // game they just left.
  check('...clearing the query flag on the way',
    /replaceState\(null, '', window\.location\.pathname\)/.test(app), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
