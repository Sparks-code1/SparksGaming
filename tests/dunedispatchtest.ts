// Posting a Dune action, and who the server thinks is posting it.
//
// Dune has no local mode: every action goes to dune-action, because the server
// is the only party that can see hidden state. So the interesting question is
// not whether the request is sent, it is WHOSE it is — and the answer has to be
// "the session's", in exactly one place, with nothing in the payload competing
// to say otherwise.
//
// That matters more here than it would elsewhere. The multi-seat harness holds
// six authenticated clients in one page. Every tempting shortcut for letting it
// act as each seat — an actAs field, a seat id in the body, one privileged
// session — moves the acting seat out of the token and into data the caller
// controls, in code that ships. The client-as-a-parameter design is what avoids
// that, and these checks are about it staying that way.
import { readFileSync } from 'node:fs'
import { dispatchDuneAction } from '@/lib/dune/duneDispatch'
import type { SupabaseClient } from '@supabase/supabase-js'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** A client that reports one seat's session, and nothing else. */
const clientFor = (token: string | null): SupabaseClient =>
  ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } }) as unknown as SupabaseClient

interface Sent { url: string; init: RequestInit }
const recorder = (status = 200, body: unknown = { ok: true }) => {
  const sent: Sent[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return {
      ok: status < 400,
      status,
      json: async () => body,
    } as unknown as Response
  }) as unknown as typeof fetch
  return { sent, fetchImpl }
}
const bodyOf = (s: Sent) => JSON.parse(String(s.init.body))

// ── the acting seat is the session, and only the session ──────────────────
{
  const { sent, fetchImpl } = recorder()
  const res = await dispatchDuneAction('match-1', { type: 'CLAIM_CHARITY' },
    { client: clientFor('token-for-p3'), fetchImpl })

  check('the action reaches dune-action', sent.length, 1)
  check('...at that endpoint and no other',
    sent[0].url.endsWith('/functions/v1/dune-action'), true)
  check('...as a POST', sent[0].init.method, 'POST')
  check('...bearing THIS client\'s token',
    (sent[0].init.headers as Record<string, string>).Authorization, 'Bearer token-for-p3')
  check('...and it succeeded', res.ok, true)

  // THE PAYLOAD NAMES NO SEAT. The server derives it from the token; a seat in
  // the body would be a second source of truth for the one fact the whole
  // hidden-state design rests on, and it would be supplied by the party whose
  // identity is in question.
  const body = bodyOf(sent[0])
  check('the body carries the match and the action', Object.keys(body).sort(), ['action', 'matchId'])
  check('...and names no seat anywhere in it',
    /\b(p[1-6]|actAs|asSeat|playerId|userId|impersonate)\b/.test(JSON.stringify(body)), false)
}

// ── a different seat means a different client, not a different field ──────
// This is the harness's whole mechanism: same code, same payload, different
// session. If acting as another seat required anything else, that thing would
// be a way to act as another seat — which is the property being avoided.
{
  const { sent, fetchImpl } = recorder()
  for (const token of ['token-a', 'token-b']) {
    await dispatchDuneAction('match-1', { type: 'OPEN_CHARITY' }, { client: clientFor(token), fetchImpl })
  }
  check('two seats send two requests', sent.length, 2)
  check('...distinguished only by the token', [
    (sent[0].init.headers as Record<string, string>).Authorization,
    (sent[1].init.headers as Record<string, string>).Authorization,
  ], ['Bearer token-a', 'Bearer token-b'])
  check('...with byte-identical bodies',
    String(sent[0].init.body) === String(sent[1].init.body), true)
}

// ── an impersonation field is refused at the caller ───────────────────────
// The server ignores these already, so this changes no outcome on the wire. It
// exists because a caller that sets one has misunderstood the model, and the
// useful moment to find that out is at the mistake rather than three hundred
// miles away where the field is silently dropped.
{
  for (const field of ['actAs', 'asSeat', 'impersonate', 'onBehalfOf', 'playerId', 'userId']) {
    const { sent, fetchImpl } = recorder()
    let threw = false
    try {
      await dispatchDuneAction('m', { type: 'CLAIM_CHARITY', [field]: 'p2' },
        { client: clientFor('t'), fetchImpl })
    } catch { threw = true }
    check(`${field} in the payload is refused`, threw, true)
    check(`...and nothing was sent`, sent.length, 0)
  }

  // A CONTROL. OPEN_BIDDING legitimately carries a bidding ORDER of seats —
  // that is about the auction, not about who is asking — so the rule must not
  // be "no seat-shaped string may appear in a payload".
  const { sent, fetchImpl } = recorder()
  const res = await dispatchDuneAction('m', { type: 'OPEN_BIDDING', order: ['atreides', 'harkonnen'] },
    { client: clientFor('t'), fetchImpl })
  check('an auction order is not impersonation', res.ok, true)
  check('...and goes out intact', bodyOf(sent[0]).action.order, ['atreides', 'harkonnen'])
}

// ── refusals are outcomes, not exceptions ─────────────────────────────────
// "already claimed", "not eligible", "the window has closed" are all things the
// server is supposed to say. A helper that threw on them would push every
// caller into a try/catch to handle the normal course of a game.
{
  const { fetchImpl } = recorder(409, { error: 'not eligible for charity', code: 'not-eligible' })
  const res = await dispatchDuneAction('m', { type: 'CLAIM_CHARITY' }, { client: clientFor('t'), fetchImpl })
  check('a refusal comes back as a result', res.ok, false)
  check('...carrying the server\'s own code', res.error?.code, 'not-eligible')
  check('...and its message', res.error?.message, 'not eligible for charity')

  // An unknown code passes through rather than being flattened into something
  // familiar — the caller can at least show it.
  const odd = recorder(409, { error: 'nope', code: 'a-code-from-the-future' })
  const res2 = await dispatchDuneAction('m', { type: 'X' }, { client: clientFor('t'), fetchImpl: odd.fetchImpl })
  check('an unrecognised code is not flattened', res2.error?.code, 'a-code-from-the-future')
}

// ── nothing is attempted without a session ────────────────────────────────
{
  const { sent, fetchImpl } = recorder()
  const res = await dispatchDuneAction('m', { type: 'OPEN_CHARITY' }, { client: clientFor(null), fetchImpl })
  check('a signed-out client sends nothing', sent.length, 0)
  check('...and says so', res.error?.code, 'unauthenticated')
}

// ── a network failure advances nothing ────────────────────────────────────
// The action may or may not have been applied. A client that guesses either way
// desyncs the match, which is the rule lib/actionDispatch already follows.
{
  const fetchImpl = (async () => { throw new Error('offline') }) as unknown as typeof fetch
  const res = await dispatchDuneAction('m', { type: 'OPEN_CHARITY' }, { client: clientFor('t'), fetchImpl })
  check('a network failure is a refusal, not a throw', res.ok, false)
  check('...marked as such', res.error?.code, 'network')
}

// ── the charity panel actually uses it ────────────────────────────────────
// The helper existing is not the same as the panel calling it, and a panel that
// still simulated everything would leave the round trip untested in the one
// place a person can press it.
{
  const panel = readFileSync('src/components/dune/CharityPanel.tsx', 'utf8')
  check('the panel dispatches', panel.includes('dispatchDuneAction'), true)
  for (const type of ['OPEN_CHARITY', 'CLAIM_CHARITY', 'CLOSE_CHARITY']) {
    check(`...including ${type}`, panel.includes(`'${type}'`), true)
  }
  // AND PASSES THE CLIENT THROUGH, or the harness is back to acting as one seat.
  check('...through the seat\'s own client', /\{ client \}/.test(panel), true)

  // The seat picker is simulation-only. Live it would imply a choice that does
  // not exist: the session decides, and offering a dropdown beside it invites
  // exactly the "why did my claim go out as p1" confusion.
  check('the seat dropdown is not offered in live mode',
    /live \? \([\s\S]{0,400}\) : \([\s\S]{0,200}<select/.test(panel), true)

  // Live, the claim button is NOT pre-judged. Eligibility depends on a purse
  // this client cannot read, so a disabled button is a guess — and a wrong one
  // either hides a legal claim or promises one the server will refuse.
  check('the claim button does not guess eligibility live',
    panel.includes('disabled={busy || (!live && !!refusal)}'), true)
}

// ── the harness drives, rather than only watching ─────────────────────────
// The helper taking a client is the mechanism; the harness using it is the
// point. Before this the harness could switch which seat's SECRETS fed the
// screen and nothing else — every action still went out on the app's session,
// so a turn could be watched from six seats and played from one.
{
  const view = readFileSync('src/components/dune/DuneMultiSeatView.tsx', 'utf8')

  check('the harness renders something that can act', view.includes('CharityPanel'), true)
  check('...on the ACTIVE seat\'s client', /client=\{mine\.client\}/.test(view), true)

  // AND NOT ON A FALLBACK. dispatchDuneAction defaults to the app's own session
  // when handed none — correct for the app, wrong here: a seat mid-sign-in would
  // post as whoever this browser happens to be, and the action would SUCCEED
  // under the wrong seat rather than fail. Acting as the wrong seat is possible
  // in exactly one place, and this is it.
  check('...never on the app\'s session by default',
    /mine\?\.client\s*\n?\s*\? <CharityPanel/.test(view), true)

  // The public row is read, not invented. A seat that posts an action and
  // watches a fixture cannot tell a working round trip from a broken one — and
  // the fixture's `remaining: 21` was the literal permanent "21 LEFT".
  check('the harness reads the shared row', /from\('matches'\)/.test(view), true)
  // THE SHAPE, not the word. This matched `/postgres_changes/` alone, which a
  // sabotage walked straight through: `.on('nothing' as 'postgres_changes', …)`
  // still contains the string and subscribes to nothing at all.
  check('...and watches it for changes',
    /\.on\('postgres_changes',\s*\n?\s*\{ event: 'UPDATE', schema: 'public', table: 'matches'/.test(view),
    true)
  check('...and actually subscribes', /\.subscribe\(\)/.test(view), true)
  check('...rendering it rather than the fixture',
    /state=\{publicRow \?\? PUBLIC_FIXTURE\}/.test(view), true)

  // THE PUBLIC ROW IS READ ON ANY SEAT'S CLIENT, and that is fine — it is
  // public, identical for everyone. The check is that it does NOT go the other
  // way: secrets must never be read on a shared or arbitrary client, because
  // there WHICH session asks is the entire mechanism.
  check('the harness does not fetch secrets itself',
    /from\('match_secrets'\)/.test(view), false)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
