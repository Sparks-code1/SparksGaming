// Table talk: a transport for the lines everybody may read, and only those.
//
// WHY THIS EXISTS. The chat panel has been drawing messages since it was
// written and had no way to send one: every line on screen was composed by the
// client that put it there, so nobody could talk to anybody. A Dune Nexus is a
// negotiation — alliances are proposed, argued over and agreed out loud — and a
// table where nobody can speak cannot have one.
//
// THE CLAIM THAT MATTERS is not that messages arrive. It is that the only ones
// that travel are the ones the whole table may read. ChatMessage carries `to`
// for lines addressed to a single seat, and "not eligible for charity" is a
// sentence about how much spice somebody holds. Marking a message private does
// not make its transport private — so those must never reach this table, and
// there is no column for them to reach.
import { readFileSync } from 'node:fs'
import { toMessage, mergeChat, sayable, MAX_CHAT } from '@/lib/dune/duneChat'
import { visibleTo, scopeLabel } from '@/components/dune/ChatPanel'
import type { FactionId } from '@/types/Dune/Faction'
import type { ChatMessage } from '@/components/dune/ChatPanel'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// A BLOCK BODY, not `=> ({…})`. An arrow returning a parenthesised object with
// no semicolon after it, followed by a bare { block, is the ASI hazard that has
// now bitten this codebase three times: esbuild accepts it, tsc reads the block
// as a continuation and rejects every property as a labelled statement — so the
// suite runs green while `npm run build` fails.
const row = (over: Partial<Parameters<typeof toMessage>[0]> = {}) => {
  return {
    id: 1, player_id: 'p1', faction_id: 'atreides',
    body: 'I will take Arrakeen', said_at: '2026-08-27T10:00:00.000Z', ...over,
  }
}

// ── a stored line, as the panel wants it ──────────────────────────────────
{
  const m = toMessage(row())
  check('a line keeps what was said', m.text, 'I will take Arrakeen')
  check('...and who said it', [m.faction, m.from], ['atreides', 'p1'])
  check('...when', m.at, Date.parse('2026-08-27T10:00:00.000Z'))
  // A STABLE ID, so the same line arriving twice — once on the changefeed, once
  // in a backlog read — is one line rather than two.
  check('...and an id from the row', m.id, 'chat-1')

  // NOTHING OFF THIS TRANSPORT IS EVER ADDRESSED TO ONE SEAT. There is no
  // column for it and no way to set it; a line that travels is a line the whole
  // table may read, and that is the only kind that does.
  check('a line off the table is addressed to nobody in particular',
    'to' in m, false)

  // A seat that has not chosen shows as nobody rather than as a faction called
  // 'unassigned', which the board would try to colour.
  check('an unassigned seat has no faction on its lines',
    toMessage(row({ faction_id: 'unassigned' })).faction, null)
  check('...and neither does a null one',
    toMessage(row({ faction_id: null })).faction, null)
}

// ── the same conversation, in the same order, on six screens ──────────────
{
  const at = (id: string, ms: number, text = id): ChatMessage =>
    ({ id, faction: null, from: 'x', text, at: ms })

  const merged = mergeChat([at('chat-2', 200), at('chat-1', 100)], [at('chat-3', 300)])
  check('lines come out oldest first', merged.map(m => m.id), ['chat-1', 'chat-2', 'chat-3'])

  // THE SAME LINE TWICE IS ONE LINE. The changefeed and the backlog read
  // overlap, and the client that sent it gets its own insert echoed back.
  const twice = mergeChat([at('chat-1', 100)], [at('chat-1', 100)])
  check('a line delivered twice is shown once', twice.length, 1)
  // The later copy wins, so an edited body would not be shown stale — and more
  // usefully, a locally composed line is replaced by the stored one.
  check('...and the newer copy is the one kept',
    mergeChat([at('chat-1', 100, 'old')], [at('chat-1', 100, 'new')])[0].text, 'new')

  // ORDERED BY WHEN IT WAS SAID, not when it arrived. Six screens receive these
  // in six different orders, and a conversation that reads differently on each
  // one is not a conversation.
  const shuffled = mergeChat([], [at('c', 300), at('a', 100), at('b', 200)])
  check('the order is the saying, not the arriving', shuffled.map(m => m.id), ['a', 'b', 'c'])
  // Two lines in the same millisecond still need one order, or the list
  // reshuffles under the reader on every frame.
  check('...and a tie is broken the same way every time',
    mergeChat([], [at('b', 5), at('a', 5)]).map(m => m.id), ['a', 'b'])

  // THE LOCAL HALF SURVIVES. This list holds two kinds of line: what the table
  // said, and what this client composed about its own turn. A frame that
  // replaced the list would wipe the second every time somebody spoke.
  const withLocal = mergeChat(
    [{ id: 'local-1', faction: null, from: 'Game', text: 'you bid 4', at: 50, to: 'atreides' }],
    [at('chat-1', 100)])
  check('a line this client made is not washed away by one from the table',
    withLocal.map(m => m.id), ['local-1', 'chat-1'])
  check('...and keeps who it was for', withLocal[0].to, 'atreides')
}

// ── what may be said ──────────────────────────────────────────────────────
{
  check('something is sayable', sayable('hello'), true)
  check('nothing is not', sayable(''), false)
  check('...nor whitespace pretending to be something', sayable('   \n  '), false)
  check('a long line is sayable up to the limit', sayable('x'.repeat(MAX_CHAT)), true)
  check('...and not past it', sayable('x'.repeat(MAX_CHAT + 1)), false)
  // THE COLUMN AGREES. A body the client accepts and the database refuses is a
  // message that vanishes on send with nothing to show for it.
  const sql = readFileSync('supabase/migrations/20260827090000_dune_table_talk.sql', 'utf8')
  check('the column allows exactly what the client does',
    sql.includes(`length(body) between 1 and ${MAX_CHAT}`), true)
}

// ── the transport carries nothing private ─────────────────────────────────
{
  const chat = code('src/lib/dune/duneChat.ts')
  const sql = readFileSync('supabase/migrations/20260827090000_dune_table_talk.sql', 'utf8')

  // NO RECIPIENT COLUMN. A field that cannot be set cannot be misused, and the
  // absence is what keeps this true rather than the discipline of whoever
  // writes the next caller.
  const table = sql.slice(sql.indexOf('create table if not exists match_chat'), sql.indexOf('create index'))
  check('the table is there to check', table.length > 100, true)
  check('...and has no column for a recipient',
    /\bto\b|recipient|private|addressed/i.test(table), false)
  check('the transport never sets one', /\bto:/.test(chat), false)

  // WHO SAID IT IS THE SERVER'S BUSINESS. user_id defaults to auth.uid() and
  // the insert policy checks it, so a client cannot post as anybody else
  // however it fills the row in.
  check('the row records the account that wrote it',
    /user_id\s+uuid not null default auth\.uid\(\)/.test(sql), true)
  // SCOPED TO THE WRITE POLICY. Both halves have to be in THAT one: the
  // seated check also appears in the read policy a few lines up, so a check
  // that searched the whole file passed while the write policy had lost it —
  // which would have let anybody post into a game they are not in.
  const writePolicy = sql.slice(sql.indexOf('create policy "seated write chat"'),
    sql.indexOf('comment on table match_chat'))
  check('the write policy is there to check', writePolicy.length > 60, true)
  check('...and insists the line is the caller\'s own',
    /user_id = auth\.uid\(\)/.test(writePolicy), true)
  check('...at a table they are actually at',
    /is_seated_in\(match_id\)/.test(writePolicy), true)
  // AND BOTH AT ONCE. Either alone is a hole: one lets you post as somebody
  // else, the other lets you post into somebody else's game.
  check('...both of them, not either',
    /with check \(user_id = auth\.uid\(\) and is_seated_in\(match_id\)\)/.test(writePolicy), true)
  check('the client does not try to set the account itself',
    /user_id:/.test(chat), false)

  // READING IS SEATED-ONLY TOO. A spectator reading a table's negotiation is
  // the same leak as a spectator reading its hands.
  check('only somebody at the table may read it',
    /create policy "seated read chat"[\s\S]{0,200}using \(is_seated_in\(match_id\)\)/.test(sql), true)

  // AND WHAT IS SAID IS KEPT. No update or delete policy exists, so a line
  // cannot be taken back — somebody agreeing to an alliance and then unsaying
  // it is the argument this exists to settle.
  check('nothing may edit a line', /for update/i.test(sql), false)
  check('...or take one back', /for delete/i.test(sql), false)
}

// ── and the screen actually sends ─────────────────────────────────────────
// The transport existing does not put a box on the screen. The panel has taken
// an onSend since it was written and nothing ever passed one.
{
  const screen = code('src/components/dune/DuneMatchScreen.tsx')
  check('the match screen watches the table talk', /watchDuneChat\(matchId, \{/.test(screen), true)
  check('...and gives the panel a way to send', /onSend=\{seat \?/.test(screen), true)
  // A SPECTATOR HAS NO BOX rather than a box that swallows what they type: the
  // insert policy would refuse it, and a refusal after the fact is worse.
  check('...which a spectator does not get', /onSend=\{seat \? [^}]*: undefined\}/.test(screen), true)
  check('what it sends goes to the table',
    /sayTo\(matchId, \{ playerId: seat\.playerId, faction: seat\.faction \}, text, scope\)/.test(screen), true)
  // MERGED, so the lines this client composed about its own turn survive.
  check('...and arriving lines are merged rather than replacing the list',
    /setChat\(c => mergeChat\(c, lines\)\)/.test(screen), true)
  // READ-YOUR-OWN-WRITES, as everywhere else here.
  check('...and a sent line is read back rather than waited for',
    /await talk\.current\?\.reread\(\)/.test(screen), true)
}

// ── three scopes, and the database decides ────────────────────────────────
// THE CLAIM THE WHOLE FEATURE RESTS ON. A client filtering its own inbox is a
// client that could choose not to: the rows would already be on the machine,
// one devtools tab away. What a seat may not read must never reach it.
{
  const sql = readFileSync('supabase/migrations/20260827140000_dune_private_talk.sql', 'utf8')
  const clean = sql.replace(/^\s*--.*$/gm, '')
  const chat = code('src/lib/dune/duneChat.ts')

  check('a line carries who it is for', /add column if not exists scope text/.test(sql), true)
  check('...one of the three', /scope in \('table', 'alliance', 'player'\)/.test(sql), true)
  // A NAMED RECIPIENT EXACTLY WHEN THERE IS ONE. 'table' plus a recipient is a
  // line that reads as private and is not — the most dangerous shape this row
  // could take, so the database refuses it rather than trusting the writer.
  check('...with a recipient exactly when the scope has one',
    /\(scope = 'player' and to_player_id is not null\)[\s\S]{0,120}\(scope <> 'player' and to_player_id is null\)/.test(clean), true)

  // ── the read policy is the enforcement ──────────────────────────────────
  const readPolicy = clean.slice(clean.indexOf('create policy "seated read chat"'),
    clean.indexOf('drop policy if exists "seated write chat"'))
  check('the read policy is there to check', readPolicy.length > 120, true)
  check('you must be at the table at all', /is_seated_in\(match_id\)/.test(readPolicy), true)
  check('...a table line reaches everybody there', /scope = 'table'/.test(readPolicy), true)
  // YOUR OWN, ALWAYS — or the line you just sent vanishes as you send it.
  check('...your own lines are always yours', /user_id = auth\.uid\(\)/.test(readPolicy), true)
  check('...a whisper reaches the seat it names',
    /scope = 'player' and to_player_id = my_seat_in\(match_id\)/.test(readPolicy), true)
  check('...and an alliance line reaches your ally',
    /scope = 'alliance' and allied_with_seat\(match_id, player_id\)/.test(readPolicy), true)

  // AND NOTHING ELSE. A fourth branch, or a stray 'or true', would be the whole
  // thing undone — this is the check that the list above is exhaustive.
  check('...and there is no other way in',
    (readPolicy.match(/\bor\b/g) ?? []).length, 3)

  // ── the alliance is the game's, and both halves must agree ──────────────
  check('an alliance is read off the match state',
    /state->'players'/.test(clean), true)
  // ONE-SIDED IS NOT AN ALLIANCE. Otherwise declaring yourself somebody's
  // friend would be enough to read their post.
  check('...and only counts when both name each other',
    /me\.ally = theirs\.faction_id[\s\S]{0,80}them\.ally = mine\.faction_id/.test(clean), true)
  check('the helpers are definer functions, to break the recursion',
    (clean.match(/security definer/g) ?? []).length >= 2, true)
  check('...and are not handed to anonymous callers',
    /\banon\b/i.test(sql), false)

  // ── writing ─────────────────────────────────────────────────────────────
  const writePolicy = clean.slice(clean.indexOf('create policy "seated write chat"'),
    clean.indexOf('comment on column match_chat.scope'))
  check('the write policy is there to check', writePolicy.length > 100, true)
  check('a line is still the caller\'s own', /user_id = auth\.uid\(\)/.test(writePolicy), true)
  check('...at a table they are at', /is_seated_in\(match_id\)/.test(writePolicy), true)
  // A RECIPIENT WHO IS NOT AT THE TABLE is a line nobody will ever read, sitting
  // in the log looking as though it had been delivered.
  check('...naming somebody who is actually there',
    /p\.player_id = match_chat\.to_player_id/.test(writePolicy), true)

  // ── and the client writes what it says it writes ────────────────────────
  check('the transport sends the scope', /scope: scope\.kind,/.test(chat), true)
  check('...and a recipient only for a whisper',
    /to_player_id: scope\.kind === 'player' \? scope\.playerId : null,/.test(chat), true)
  check('...and reads both back', /scope, to_player_id/.test(chat), true)
}

// ── what a reader is told about who else heard it ─────────────────────────
// A LABEL, NEVER A FILTER. A line being on screen means the policy allowed it;
// the marking tells the reader who ELSE knows, which is most of what decides
// whether they repeat it.
{
  const line = (over: Partial<ChatMessage>): ChatMessage =>
    ({ id: 'x', faction: 'atreides' as FactionId, from: 'p1', text: 't', at: 1, ...over })

  check('a table line is not marked at all',
    scopeLabel(line({ scope: 'table' }), 'fremen' as FactionId), null)
  check('an alliance line says so',
    scopeLabel(line({ scope: 'alliance' }), 'fremen' as FactionId), 'alliance')
  // THE TWO SIDES OF A WHISPER READ DIFFERENTLY: the sender needs to know who
  // they sent it to, the receiver only that nobody else heard it.
  check('a whisper you received says it was private',
    scopeLabel(line({ scope: 'player' }), 'fremen' as FactionId), 'privately')
  check('...and one you sent says who to',
    scopeLabel(line({ scope: 'player', toPlayer: 'p2' }), 'atreides' as FactionId), 'to p2')
  // The game's own notices, which never travelled.
  check('a local notice still says it is yours alone',
    scopeLabel(line({ faction: null, to: 'fremen' as FactionId }), 'fremen' as FactionId), 'only you')

  // ── AND THE CLIENT FILTER STILL ONLY GUARDS THE LOCAL ONES ──────────────
  // A clause almost went in here to keep your own lines — it was unnecessary,
  // because transport lines carry no recipient at all, and it leaked: a notice
  // has no faction and a spectator has no seat, so null === null showed every
  // private notice to every spectator.
  const notice: ChatMessage = {
    id: 'n', faction: null, from: 'Game', text: 'you hold too much spice',
    at: 1, to: 'atreides' as FactionId,
  }
  const whisper: ChatMessage = {
    id: 'w', faction: 'harkonnen' as FactionId, from: 'p2', text: 'ally with me',
    at: 2, scope: 'player', toPlayer: 'p1',
  }
  check('a spectator sees no private notice', visibleTo([notice], null).length, 0)
  check('...and the seat it is for does', visibleTo([notice], 'atreides' as FactionId).length, 1)
  // A whisper that ARRIVED was already allowed by the policy, so the filter
  // must not second-guess it — it carries no `to` and passes.
  check('a whisper that reached this session is shown',
    visibleTo([whisper], 'atreides' as FactionId).length, 1)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
