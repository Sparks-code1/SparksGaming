/**
 * Which save the scoped campaigns policies refuse, and why the error names USING.
 *
 * THE REPORT: saving a campaign fails with
 *
 *   new row violates row-level security policy (USING expression)
 *     for table "campaigns"
 *
 * THE "(USING expression)" IS THE WHOLE CLUE. A plain UPDATE that fails its
 * WITH CHECK says "new row violates row-level security policy" with no
 * parenthetical. The suffix appears when Postgres is applying a policy's USING
 * clause AS a check — which is what it does for the UPDATE half of an
 * INSERT ... ON CONFLICT DO UPDATE, against the row ALREADY THERE.
 *
 * saveLegacyState upserts. So a save of an existing campaign is checked against
 * the UPDATE policy's USING on the CURRENT row: can this caller reach the row
 * as it stands. That is the read rule, applied to a write, which is why the
 * message sounds like it is complaining about the wrong thing.
 *
 * Run against the LOCAL stack with the migration applied:
 *   node scripts/repro-campaign-save.mjs
 */
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8' })
    .split(/\r?\n/).filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const { API_URL: API, ANON, SERVICE_ROLE_KEY: SERVICE } = { ...env, ANON: env.ANON_KEY }
if (!/127\.0\.0\.1|localhost/.test(API ?? '')) {
  console.error('local stack only'); process.exit(1)
}

const admin = createClient(API, SERVICE, { auth: { persistSession: false } })
const PASSWORD = 'repro-only'
async function account(email) {
  await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  const c = createClient(API, ANON, { auth: { persistSession: false } })
  const { data } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  return { client: c, userId: data.user.id }
}

const owner = await account('repro-owner@local.test')
const other = await account('repro-other@local.test')
const guest = createClient(API, ANON, { auth: { persistSession: false } })

/** Seed a campaign with the given roster and hand back its id. */
async function seed(roster) {
  const id = crypto.randomUUID()
  const legacy = { campaignId: id, worldName: 'Repro', currentGameNumber: 1, roster }
  await admin.from('campaigns').insert({ id, world_name: 'Repro', legacy_state: legacy })
  return { id, legacy }
}

/** The save the app makes: an upsert of the whole blob. */
async function save(client, id, legacy) {
  const { error } = await client.from('campaigns').upsert({
    id, world_name: 'Repro', legacy_state: legacy,
    updated_at: new Date().toISOString(),
  })
  return error?.message ?? null
}

const line = (name, msg) =>
  console.log(`  ${msg ? 'REFUSED' : 'saved  '}  ${name}${msg ? `\n            ${msg}` : ''}`)

console.log('\n— an UNCLAIMED campaign —')
{
  const { id, legacy } = await seed([{ id: 'p1', name: 'Ryan' }])
  line('a signed-out client saves it', await save(guest, id, legacy))
  line('a signed-in stranger saves it', await save(other.client, id, legacy))
}

console.log('\n— a CLAIMED campaign, saved by the account on it —')
{
  const { id, legacy } = await seed([{ id: 'p1', name: 'Ryan', userId: owner.userId }])
  line('its own member saves it', await save(owner.client, id, legacy))
}

console.log('\n— a CLAIMED campaign, saved by somebody else —')
{
  const { id, legacy } = await seed([{ id: 'p1', name: 'Ryan', userId: owner.userId }])
  line('a signed-in stranger saves it', await save(other.client, id, legacy))
  line('a signed-out client saves it', await save(guest, id, legacy))
}

console.log('\n— the mixed roster: a name with no account, once somebody else claims —')
{
  // THE CASE THE MIGRATION'S OWN NOTE 2 WARNED ABOUT. Ryan created this
  // campaign and never linked an account; Chris later claimed a seat, which
  // CLAIMS THE WHOLE CAMPAIGN. Ryan is still on the roster by name.
  const { id, legacy } = await seed([
    { id: 'p1', name: 'Ryan' },
    { id: 'p2', name: 'Chris', userId: other.userId },
  ])
  line('Ryan, signed out, saves it', await save(guest, id, legacy))
  line('Ryan, signed in but unlinked, saves it', await save(owner.client, id, legacy))
  line('Chris, who claimed a seat, saves it', await save(other.client, id, legacy))
}

console.log('\n— the transition: the save that CLAIMS the campaign —')
{
  const { id, legacy } = await seed([{ id: 'p1', name: 'Ryan' }])
  const claiming = {
    ...legacy,
    roster: [{ id: 'p1', name: 'Ryan', userId: owner.userId }],
  }
  // Old row unclaimed so USING passes; new row claimed and the writer is on it
  // so WITH CHECK passes. This is the one write that changes the campaign's
  // status, and it has to work or a campaign can never become claimed at all.
  line('an unclaimed campaign is claimed by a save', await save(owner.client, id, claiming))
}

console.log('\n— the write that ADDS the writer to a CLAIMED roster —')
{
  // THE ONE THAT PRODUCES "(USING expression)". Both checks apply to an upsert
  // and they look at DIFFERENT ROWS:
  //
  //   the INSERT policy's WITH CHECK, against the row being written
  //   the UPDATE policy's USING, against the row already there
  //
  // Adding yourself to a claimed campaign passes the first — you ARE on the
  // new roster — and fails the second, because you were not on the old one.
  // Postgres names the clause it was applying, which is why the message talks
  // about USING on what looks like an ordinary save.
  const { id, legacy } = await seed([{ id: 'p1', name: 'Chris', userId: other.userId }])
  const joining = {
    ...legacy,
    roster: [
      { id: 'p1', name: 'Chris', userId: other.userId },
      { id: 'p2', name: 'Ryan', userId: owner.userId },
    ],
  }
  line('a newcomer adds themselves by saving the blob', await save(owner.client, id, joining))
}
