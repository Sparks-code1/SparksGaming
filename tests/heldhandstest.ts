import { readFileSync, readdirSync } from 'node:fs'
// The host plays the computer seats online, and so must hold their hands.
//
// FIELD REPORT, 2026-09-05: turn one of a new campaign, the host ended their
// turn, the computer's draft began on the host's machine — and the host's
// screen went blank. `aiTradeInDecision(cp.cards, …)` read `.length` off a
// seat that, online, carries only a cardCount; the throw was inside a passive
// effect, which unmounts the board. Every other screen was fine, because no
// other machine runs the computer.
//
// The split-hand shape in its fourth place — and the first where the reader was
// RIGHT to want the cards: a trade-in needs ids, not a count. So the fix has
// two sides, and both are pinned here.
//
//   1. The host is entitled to those hands. match_secrets was read-your-own,
//      and a computer seat has no account for anyone to be; the policy now
//      reads "the seats you play" — your own, plus every computer seat of a
//      match you created — the same rule apply-action already uses to accept
//      the computer's actions from the host and from nobody else.
//   2. The reader cannot crash. heldHand() is null for a hand this machine
//      does not hold, and the computer skips its trade-in that turn.
//
// Pinned as source: the policy is SQL, the join is closed over a live channel,
// and the board is a component. The browser spec risk-online-ai plays the turn.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
/** Comments out, so a pin can never be satisfied by its own explanation. */
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')

// ── 1. the policy ────────────────────────────────────────────────────────────
console.log('\n— the read policy on match_secrets —')
{
  const dir = 'supabase/migrations'
  const withPolicy = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .filter(f => readFileSync(`${dir}/${f}`, 'utf8').includes('on match_secrets for select'))
  const sql = withPolicy.length ? readFileSync(`${dir}/${withPolicy[withPolicy.length - 1]}`, 'utf8') : ''
  check('the newest migration touching the policy names "read the seats you play"',
    /create policy "read the seats you play"\s+on match_secrets for select/.test(sql), true)
  check('...a seat is readable by the account that holds it',
    /mp\.user_id = auth\.uid\(\)/.test(sql), true)
  check('...or, for a computer seat, by the account that created the match',
    /mp\.is_ai and exists \(\s*select 1 from matches m\s+where m\.id = match_secrets\.match_id\s+and m\.created_by = auth\.uid\(\)\)/.test(sql), true)
  check('...and the migration asserts the old read-your-own policy is gone',
    /policyname = 'read your own secrets'\)\s*then\s*raise exception/.test(sql), true)
  check('...and that no client may write',
    /cmd in \('INSERT', 'UPDATE', 'DELETE'\)\)\s*then\s*raise exception/.test(sql), true)
}

// ── 2. the channel and the join ──────────────────────────────────────────────
console.log('\n— the hook holds every seat this machine plays —')
{
  const hook = bare(readFileSync('src/lib/useMatchSync.ts', 'utf8'))
  check('the hook takes the extra seats this machine holds', /alsoHeld\?: string\[\]/.test(hook), true)
  check('...tells the channel about them, own seat first',
    /startSecretsSync\(matchId, \{\s*expectPlayerId: seatId,\s*alsoHeld:/.test(hook), true)
  check('...merges each row under the seat the ROW names',
    /secretsArrived\(row\.data as unknown as SeatSecrets, row\.playerId\)/.test(hook), true)
  check('...and rebuilds the subscription when the SET of held seats changes, not per render',
    /\}, \[matchId, seatId, transport, heldKey\]\)/.test(hook), true)
}

// ── 3. the board ─────────────────────────────────────────────────────────────
console.log('\n— the computer trade-in reads a hand it holds, or none —')
{
  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('heldHand is null for a hand this machine does not hold — never []',
    /function heldHand\(p: \{ cards\?: string\[\] \}\): string\[\] \| null \{\s*return Array\.isArray\(p\.cards\) \? p\.cards : null/.test(board), true)
  check('the computer trade-in reads through it', /const hand = heldHand\(cp\)/.test(board), true)
  check('...never cp.cards directly', /aiTradeInDecision\(cp\.cards/.test(board), false)
  check('...and a hand not held is a skipped trade, not a crash',
    /const decision = hand && aiTradeInDecision\(hand,/.test(board), true)
  check('the board asks the hook for the computer seats only when it drives them',
    /const heldSeats = useMemo\(\s*\(\) => \(hostsComputers && computerSeatsKey\)/.test(board)
      && /const hostsComputers = !!onlineMatch\?\.matchId && aiAuthority/.test(board), true)
  check('...and hands them over', /\n    \{ alsoHeld: heldSeats \},\n  \)/.test(board), true)
}

// ── 4. the lobby deals through the same door ─────────────────────────────────
// Found by the browser spec's console assertion: the host's wire check fired
// on every mount, at v0 — the opening position startLobby wrote RAW into the
// row, every seat's hand inline, and left the first action's hydrate to split
// it. createOnlineMatch had already stopped doing that (deal-match exists for
// it); the lobby path had not. Projecting that write instead was tried and
// broke the match outright: with no inline hands and no secrets rows, every
// action came back `secrets-missing`. The deal is a server write, once, from
// the host — the lobby goes through deal-match like everything else.
console.log('\n— the lobby deals through deal-match —')
{
  const lobby = bare(readFileSync('src/lib/lobby.ts', 'utf8'))
  check('startLobby hands the opening position to deal-match',
    /functions\.invoke\('deal-match', \{\s*body: \{ matchId, state: initialState/.test(lobby), true)
  check('...and never writes state into the row itself',
    /\.update\(\{[^}]*\bstate:/.test(lobby), false)
}

console.log(pass ? '\nall held-hands pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
