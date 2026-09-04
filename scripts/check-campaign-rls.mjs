/**
 * The campaigns policies, proven against a real database with real sessions.
 *
 * WHAT THIS IS FOR. The unit suite pins the CLIENT — that the claim goes
 * through the rpc and writes nothing through the table — and the migration's
 * own DO block proves the policies exist. Neither of those asks the question
 * that matters: can a signed-in stranger read, rewrite or destroy somebody
 * else's campaign? That needs two accounts, two sessions and the actual
 * policies, so it lives here rather than in tests/.
 *
 * The browser suite cannot cover it either: it runs SIGNED OUT, so every
 * campaign it creates is unclaimed and the scoping never bites.
 *
 * HOW TO RUN. Needs Docker and `npx supabase start` already up, and the
 * migration applied (`npx supabase db reset`):
 *
 *   node scripts/check-campaign-rls.mjs
 *
 * It mints two throwaway local accounts, creates one campaign, and leaves both
 * behind — `npx supabase db reset` clears them.
 *
 * LOCAL ONLY, AND IT REFUSES OTHERWISE. Every assertion below is about who can
 * destroy what; pointed at the hosted project it would be trying.
 */
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8' })
    .split(/\r?\n/).filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))

const API = env.API_URL
const ANON = env.ANON_KEY
const SERVICE = env.SERVICE_ROLE_KEY
if (!API || !ANON || !SERVICE) {
  console.error('supabase status gave no keys — is the stack up? npx supabase start')
  process.exit(1)
}
if (!/127\.0\.0\.1|localhost/.test(API)) {
  console.error(`refusing to run against a non-local API: ${API}`)
  process.exit(1)
}

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const admin = createClient(API, SERVICE, { auth: { persistSession: false } })
const PASSWORD = 'rls-check-only'

async function account(email) {
  await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  const c = createClient(API, ANON, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return { client: c, userId: data.user.id }
}

const owner = await account('rls-owner@local.test')
const stranger = await account('rls-stranger@local.test')

// ── One campaign, claimed by the owner ──────────────────────────────────────
const id = crypto.randomUUID()
// SIX CHARACTERS FROM THE CODE'S OWN ALPHABET. The column carries a shape
// check (campaigns_join_code_shape), so a readable-but-wrong code is refused at
// insert rather than at join time — which is a better place for it, and cost
// this script one run to learn.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const code = Array.from(
  { length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
).join('')
const legacy = {
  campaignId: id,
  worldName: 'RLS Check',
  currentGameNumber: 1,
  roster: [
    { id: 'p1', name: 'Owner', userId: owner.userId, joinedGame: 1 },
    { id: 'p2', name: 'Open Seat', joinedGame: 1 },
  ],
  joinCode: code,
}
{
  const { error } = await admin.from('campaigns')
    .insert({ id, world_name: 'RLS Check', legacy_state: legacy, join_code: code })
  if (error) throw new Error(`could not seed the campaign: ${error.message}`)
}

console.log('\n— a claimed campaign is the roster\'s —')
{
  const mine = await owner.client.from('campaigns').select('id').eq('id', id).maybeSingle()
  check('its owner can read it', mine.data?.id === id)

  const theirs = await stranger.client.from('campaigns').select('id').eq('id', id).maybeSingle()
  // NOT AN ERROR — a policy that hides a row returns no row. That is the
  // correct shape and the reason a broken policy is so quiet.
  check('a signed-in stranger cannot read it', !theirs.data)

  // ASKED OF THE ROW, NOT OF THE RETURN VALUE — an update that returned no
  // rows would look refused even if it had landed, because the stranger cannot
  // read back what it wrote. The only honest question is whether the row
  // CHANGED, so it is read with the service role afterwards.
  //
  // WHAT ACTUALLY STOPS THE WRITE is the SELECT policy, not the UPDATE one:
  // Postgres applies SELECT policies to the rows an UPDATE's WHERE clause
  // reads, so a row the stranger cannot see is a row they cannot target.
  // Adding a wide-open UPDATE policy on top changes nothing while the read
  // stays scoped — checked by putting one back on purpose. Worth knowing
  // before anyone "simplifies" the read policy on the grounds that the write
  // policy already covers it.
  await stranger.client.from('campaigns').update({ world_name: 'Taken' }).eq('id', id)
  {
    const row = await admin.from('campaigns').select('world_name').eq('id', id).single()
    check('...cannot rewrite it', row.data?.world_name === 'RLS Check',
      `world_name is now ${row.data?.world_name}`)
  }

  await stranger.client.from('campaigns').delete().eq('id', id)
  {
    const row = await admin.from('campaigns').select('id').eq('id', id).maybeSingle()
    check('...cannot delete it', !!row.data)
  }

  // AND NEITHER CAN THE OWNER — there is no delete policy at all, on purpose:
  // a legacy campaign is the one thing here that must not be destroyable by a
  // client. This is the assertion behind the picker's ✕ going quiet.
  await owner.client.from('campaigns').delete().eq('id', id)
  {
    const row = await admin.from('campaigns').select('world_name').eq('id', id).maybeSingle()
    check('...and neither can its owner, by design', row.data?.world_name === 'RLS Check')
  }

  // AND THE REFUSAL IS VISIBLE TO THE CALLER. This is the shape deleteCampaign
  // now reads: no error, and a count of zero. Checking only `error` reported a
  // deletion that never happened, which is how the picker's ✕ came to open a
  // confirmation, take the press and change nothing.
  {
    const res = await owner.client
      .from('campaigns').delete({ count: 'exact' }).eq('id', id)
    check('a refused delete is silent but countable',
      !res.error && res.count === 0, `error=${res.error?.message} count=${res.count}`)
  }
}

console.log('\n— but the code still lets a stranger in —')
{
  // THE ONE CROSSING. join_campaign_by_code is SECURITY DEFINER and treats the
  // code as the credential, which is what keeps joining possible at all once
  // the row is scoped.
  const look = await stranger.client
    .rpc('join_campaign_by_code', { p_code: code, p_member_id: null })
  check('the lookup reaches a row the stranger cannot select',
    (look.data ?? []).length === 1, look.error?.message ?? '')

  const claim = await stranger.client
    .rpc('join_campaign_by_code', { p_code: code, p_member_id: 'p2' })
  check('...and the claim lands', !claim.error, claim.error?.message ?? '')

  const after = await stranger.client.from('campaigns').select('legacy_state').eq('id', id).maybeSingle()
  check('having claimed, the stranger can now read it', !!after.data)

  const seat = (after.data?.legacy_state?.roster ?? []).find(m => m.id === 'p2')
  check('...and the seat is theirs', seat?.userId === stranger.userId)

  // A SEAT IS CLAIMED ONCE. Without this, anyone with the code could take an
  // account holder's seat and inherit their whole campaign record.
  const steal = await owner.client
    .rpc('join_campaign_by_code', { p_code: code, p_member_id: 'p2' })
  check('a claimed seat cannot be taken from its holder',
    !!steal.error && /already claimed/i.test(steal.error.message))
}

console.log('\n— an unclaimed campaign stays open, deliberately —')
{
  const openId = crypto.randomUUID()
  await admin.from('campaigns').insert({
    id: openId, world_name: 'Guest World',
    legacy_state: { campaignId: openId, worldName: 'Guest World', roster: [{ id: 'p1', name: 'Nobody' }] },
  })
  const seen = await stranger.client.from('campaigns').select('id').eq('id', openId).maybeSingle()
  // NOT A HOLE — it is what keeps guests working. A campaign played entirely
  // without accounts has no auth.uid() to match, and scoping it to accounts
  // would lock its own players out. The protection is the unguessable id, which
  // is also all that protects a join code.
  check('a campaign nobody has claimed is readable by anyone with the id', !!seen.data)
}


console.log('\n— joining a CLAIMED campaign as a new name —')
{
  // THE BREAK THIS CLOSES. saveLegacyState upserts, so adding yourself to a
  // claimed roster passed the INSERT check (you are on the new roster) and
  // failed the UPDATE USING (you were not on the old one) — the "(USING
  // expression)" report. It is the ordinary way somebody joins with a code.
  const joinId = crypto.randomUUID()
  const joinCode = Array.from({ length: 6 },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
  const ownerOnly = [{ id: 'p1', name: 'Owner', userId: owner.userId, joinedInGame: 1 }]
  await admin.from('campaigns').insert({
    id: joinId, world_name: 'Join Check', join_code: joinCode,
    legacy_state: {
      campaignId: joinId, worldName: 'Join Check', currentGameNumber: 1,
      roster: ownerOnly, scars: ['keep-me'],
    },
  })

  const proposed = [...ownerOnly,
    { id: 'p2', name: 'Newcomer', userId: stranger.userId, joinedInGame: 1 }]
  const joined = await stranger.client.rpc('join_campaign_by_code', {
    p_code: joinCode, p_member_id: null, p_roster: proposed,
  })
  check('a newcomer can add themselves through the rpc',
    !joined.error, joined.error?.message ?? '')

  const row = await admin.from('campaigns').select('legacy_state').eq('id', joinId).single()
  const roster = row.data?.legacy_state?.roster ?? []
  check('...and the roster has both seats', roster.length === 2)
  check('...with the newcomer\'s account on theirs',
    roster.find(m => m.id === 'p2')?.userId === stranger.userId)

  // ONLY THE ROSTER MOVED. The caller hands over an array, not a campaign, so
  // a joiner cannot overwrite the scars, the stickers or the history on the way
  // in — nor clobber whatever landed while they were reading it.
  check('...and nothing else on the campaign was touched',
    JSON.stringify(row.data?.legacy_state?.scars) === JSON.stringify(['keep-me']))

  // RULE 1: exactly one seat is yours.
  const greedy = await stranger.client.rpc('join_campaign_by_code', {
    p_code: joinCode, p_member_id: null,
    p_roster: [...proposed, { id: 'p3', name: 'Also Me', userId: stranger.userId }],
  })
  check('two seats for one account are refused',
    !!greedy.error && /exactly once/i.test(greedy.error.message))

  // RULE 2: nobody else's claimed seat is altered — in ANY field.
  const thief = await stranger.client.rpc('join_campaign_by_code', {
    p_code: joinCode, p_member_id: null,
    p_roster: [
      { id: 'p1', name: 'Owner', userId: stranger.userId, joinedInGame: 1 },
      { id: 'p2', name: 'Newcomer', userId: stranger.userId, joinedInGame: 1 },
    ],
  })
  check('taking somebody else\'s claimed seat is refused',
    !!thief.error, thief.error?.message ?? 'no error')

  const renamer = await stranger.client.rpc('join_campaign_by_code', {
    p_code: joinCode, p_member_id: null,
    p_roster: [
      { id: 'p1', name: 'Renamed', userId: owner.userId, joinedInGame: 1 },
      { id: 'p2', name: 'Newcomer', userId: stranger.userId, joinedInGame: 1 },
    ],
  })
  check('...and so is editing any field of it',
    !!renamer.error && /alters a seat claimed/i.test(renamer.error.message))
}


console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
