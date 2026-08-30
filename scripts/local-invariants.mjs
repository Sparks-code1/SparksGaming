/**
 * The conservation-invariant harness, against the LOCAL stack.
 *
 * WHAT THIS IS. Every painful bug of the battle build was a conservation
 * violation that surfaced turns after the write that caused it: the public
 * hand count drifting from the hand, a force annihilated by a lift, a deck
 * dealt without being stocked. This harness drives REAL matches through the
 * REAL endpoint — served by the local Supabase stack — and asserts the
 * conserved quantities after EVERY SINGLE ACTION, so the next violation dies
 * at the write that commits it rather than in somebody's play session.
 *
 * WHAT IT CHECKS, after every dispatch:
 *   - the FORCE ECONOMY: each faction's board + reserves + tanks total never
 *     changes from its seeded baseline — deaths move tokens, nothing mints
 *     or destroys them
 *   - HAND HONESTY: the public handCount equals the secret hand, every seat
 *   - the TREACHERY ECONOMY: pile + lot + discard + hands is the same
 *     multiset it was seeded as — no card minted, none destroyed, no id
 *     duplicated
 *   - PURSES AND PILES never go negative
 *   - the VERSION moves by exactly one per accepted write and not at all on
 *     a refusal
 *
 * HOW TO RUN. Needs Docker and `npx supabase start` already up:
 *
 *   node scripts/local-invariants.mjs
 *
 * The harness starts its own `supabase functions serve`, creates its own
 * local accounts, seeds its own matches, and never touches the hosted
 * project. `--selftest` additionally corrupts a row on purpose at the end
 * and proves the checker actually screams.
 */
import { createClient } from '@supabase/supabase-js'
import { spawn, execSync } from 'node:child_process'
import { classifyDispatch } from './lib/dispatchVerdict.ts'
import { stormOrder } from '../supabase/functions/_shared/dunePhase.gen.ts'
import {
  pendingBattles, battlesFor, nextAggressor, allocationsFor, piecesInBattle,
  eliteWorth, fullWithoutSpice,
} from '../supabase/functions/_shared/duneBattle.gen.ts'

// ── the stack's own coordinates ───────────────────────────────────────────
const statusOut = execSync('npx supabase status -o env', { encoding: 'utf8' })
const statusEnv = Object.fromEntries(
  statusOut.split(/\r?\n/).filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
)
const API = statusEnv.API_URL
const ANON = statusEnv.ANON_KEY
const SERVICE = statusEnv.SERVICE_ROLE_KEY
if (!API || !ANON || !SERVICE) {
  console.error('supabase status did not yield API_URL / ANON_KEY / SERVICE_ROLE_KEY — is the stack up?')
  process.exit(2)
}
if (!/127\.0\.0\.1|localhost/.test(API)) {
  console.error(`refusing to run against a non-local API: ${API}`)
  process.exit(2)
}
const admin = createClient(API, SERVICE, { auth: { persistSession: false } })

let pass = true
let checksRun = 0
const fail = (label, detail) => {
  pass = false
  console.log(`  VIOLATION  ${label}\n             ${detail}`)
}

// ── six local accounts, created idempotently ──────────────────────────────
const EMAILS = Array.from({ length: 6 }, (_, i) => `invariant-${i + 1}@local.test`)
const PASSWORD = 'local-harness-only'
for (const email of EMAILS) {
  const { error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  })
  if (error && !/already/i.test(error.message)) {
    console.error(`createUser ${email}: ${error.message}`)
    process.exit(1)
  }
}

// ── the endpoint, served ──────────────────────────────────────────────────
const envFile = 'supabase/.local-functions.env'
execSync(`node -e "require('node:fs').writeFileSync('${envFile}', 'DUNE_DEV_SEEDING=on')"`)
const serve = spawn('npx', ['supabase', 'functions', 'serve', '--env-file', envFile],
  { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
let serveLog = ''
serve.stdout.on('data', d => { serveLog += d })
serve.stderr.on('data', d => { serveLog += d })
const killServe = () => {
  try { execSync(`taskkill /pid ${serve.pid} /T /F`, { stdio: 'ignore' }) } catch { /* gone */ }
}
process.on('exit', killServe)

// ready when the gateway answers for the function at all (401 counts)
{
  let up = false
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/functions/v1/dune-action`, { method: 'POST' })
      void r
      up = true
      break
    } catch { await new Promise(r => setTimeout(r, 1000)) }
  }
  if (!up) {
    console.error(`functions serve never came up.\n${serveLog.slice(-2000)}`)
    process.exit(1)
  }
}

// ── seats: signed-in clients, keyed by faction ────────────────────────────
const FACTIONS = ['atreides', 'fremen', 'harkonnen', 'emperor', 'spacing-guild', 'bene-gesserit']
const seatClients = {}
for (const [i, email] of EMAILS.entries()) {
  const c = createClient(API, ANON, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) { console.error(`sign-in ${email}: ${error.message}`); process.exit(1) }
  seatClients[FACTIONS[i]] = { client: c, token: data.session.access_token }
}

// ── seeding, through the same script a human uses ─────────────────────────
const seed = (phase) => {
  const out = execSync(`node scripts/seed-dune-match.mjs --phase=${phase}`, {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_URL: API,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      DUNE_SEED_ACCOUNTS: EMAILS.join(','),
    },
  })
  const m = /seeded \w+ match ([0-9a-f-]{36})/.exec(out)
  if (!m) throw new Error(`seed did not print a match id:\n${out}`)
  return m[1]
}

// ── the snapshot and the invariants ───────────────────────────────────────
const snapshot = async (matchId) => {
  const { data: match } = await admin.from('matches')
    .select('version, state').eq('id', matchId).single()
  const { data: secrets } = await admin.from('match_secrets')
    .select('player_id, data').eq('match_id', matchId)
  const { data: decks } = await admin.from('match_decks')
    .select('deck, cards').eq('match_id', matchId)
  const { data: players } = await admin.from('match_players')
    .select('player_id, faction_id').eq('match_id', matchId)
  return {
    version: match.version,
    state: match.state ?? {},
    rows: Object.fromEntries((secrets ?? []).map(r => [r.player_id, r.data ?? {}])),
    decks: Object.fromEntries((decks ?? []).map(r => [r.deck, r.cards ?? []])),
    factionOf: Object.fromEntries((players ?? []).map(r => [r.player_id, r.faction_id])),
  }
}

const forceTotals = (snap) => {
  const totals = {}
  for (const f of (snap.state.forces ?? [])) {
    totals[f.faction] = (totals[f.faction] ?? 0) + f.count
  }
  for (const p of (snap.state.players ?? [])) {
    totals[p.faction] = (totals[p.faction] ?? 0)
      + (p.reserves ?? 0) + (p.reservesStarred ?? 0)
  }
  for (const [fa, t] of Object.entries(snap.state.tanks?.forces ?? {})) {
    totals[fa] = (totals[fa] ?? 0) + (t.plain ?? 0) + (t.starred ?? 0)
  }
  return totals
}

const treacheryMultiset = (snap) => {
  // THE AWARDED GHOSTS ARE EXCLUDED: a card the auction has already awarded
  // stays in the lot row until the settlement's end-write empties it,
  // because later cards are dealt BY INDEX and shortening the lot would
  // shift them. The card's real life is in the winner's hand; the lot copy
  // is bookkeeping, and counting it would flag the design as a duplication.
  const awards = snap.state.auction?.status === 'awaiting'
    ? (snap.state.auction.carry?.awards ?? [])
    : (snap.state.auction?.result?.awards ?? [])
  const ghost = new Set(awards.map(a => a.index))
  const all = [
    ...(snap.decks.treachery ?? []),
    ...(snap.decks['auction-lot'] ?? []).filter((_, i) => !ghost.has(i)),
    ...(snap.state.treacheryDiscard ?? []),
    ...Object.values(snap.rows).flatMap(r => r.cards ?? []),
  ]
  const bag = {}
  for (const id of all) bag[id] = (bag[id] ?? 0) + 1
  return bag
}

let baseline = null
const rebaseline = (snap) => {
  baseline = { forces: forceTotals(snap), cards: treacheryMultiset(snap) }
}

const checkInvariants = (snap, label) => {
  checksRun++
  const totals = forceTotals(snap)
  for (const [fa, base] of Object.entries(baseline.forces)) {
    if ((totals[fa] ?? 0) !== base) {
      fail(label, `force economy: ${fa} totals ${totals[fa] ?? 0}, seeded ${base}`)
    }
  }
  for (const [pid, row] of Object.entries(snap.rows)) {
    const fa = snap.factionOf[pid]
    const pub = (snap.state.players ?? []).find(p => p.faction === fa)
    const hand = (row.cards ?? []).length
    if (pub && (pub.handCount ?? 0) !== hand) {
      fail(label, `hand honesty: ${fa} holds ${hand}, the table says ${pub.handCount}`)
    }
    if ((row.spice ?? 0) < 0) fail(label, `purse below zero: ${fa} at ${row.spice}`)
  }
  const bag = treacheryMultiset(snap)
  for (const id of new Set([...Object.keys(bag), ...Object.keys(baseline.cards)])) {
    if ((bag[id] ?? 0) !== (baseline.cards[id] ?? 0)) {
      fail(label, `treachery economy: '${id}' appears ${bag[id] ?? 0} time(s), seeded ${baseline.cards[id] ?? 0}`)
    }
  }
  for (const [t, n] of Object.entries(snap.state.spiceOnBoard ?? {})) {
    if (n < 0) fail(label, `spice on the board below zero at ${t}: ${n}`)
  }
  for (const [fa, t] of Object.entries(snap.state.tanks?.forces ?? {})) {
    if ((t.plain ?? 0) < 0 || (t.starred ?? 0) < 0) {
      fail(label, `tanks below zero for ${fa}: ${JSON.stringify(t)}`)
    }
  }
}

// ── one dispatch, one audit ───────────────────────────────────────────────
let matchId = null
let lastVersion = null
const act = async (faction, action, expect = 'ok') => {
  const before = lastVersion
  // RETRIES on a response that is not the endpoint's — the local edge
  // runtime occasionally 502s through the gateway WHILE THE WRITE LANDS
  // (at-least-once delivery; the app's own dispatch treats a network
  // failure the same way, as "may or may not have applied"). A blip is not
  // a refusal, HOWEVER MANY IN A ROW: the verdict below asks the database
  // whether the write landed, and an answer that never carried the
  // endpoint's own shape can prove acceptance (the version moved) but
  // never refusal. What it cannot prove it reports as unreachable — a
  // violation nobody can trust is worse than no check.
  let res
  let body
  let spoke = false
  let blipped = false
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(`${API}/functions/v1/dune-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${seatClients[faction].token}`,
      },
      body: JSON.stringify({ matchId, action }),
    })
    const text = await res.text()
    try {
      body = JSON.parse(text)
      // a JSON answer that names neither error nor code is not the
      // endpoint's own refusal shape — the gateway or the runtime spoke
      // instead; treat it as the same transient a non-JSON blip is
      if (!res.ok && body.error === undefined && body.code === undefined) {
        blipped = true
        console.log(`  (blip, ${res.status}: ${text.slice(0, 100)} — retrying)`)
        await new Promise(r => setTimeout(r, 700 * (attempt + 1)))
        continue
      }
      spoke = true
      break
    } catch {
      body = {}
      blipped = true
      console.log(`  (non-JSON response, ${res.status}: ${text.slice(0, 100)} — retrying)`)
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)))
    }
  }
  const label = `${action.type} by ${faction}`
  const snap = await snapshot(matchId)
  lastVersion = snap.version
  const ruled = classifyDispatch({
    expect, spoke, ok: !!res.ok, code: body.code, error: body.error,
    blipped, before, after: snap.version,
  })
  if (ruled.verdict === 'unreachable') {
    // INFRASTRUCTURE, NOT A RULES VIOLATION — and not silently a pass
    // either: the steps after this one assume this one happened, so the
    // only honest move is to stop and say so, on the same exit the
    // stack-not-up check uses.
    console.error(`\n  UNREACHABLE  ${label} — the endpoint never answered in its own`
      + ` voice and no write landed (last status ${res.status}, v${snap.version}).`
      + ` This is the gateway or the runtime, not the rules. Rerun when the stack settles.`)
    process.exit(2)
  }
  if (ruled.verdict === 'violation') fail(label, ruled.detail)
  checkInvariants(snap, label)
  const said = ruled.verdict === 'ok-through-blip' ? 'ok (through a blip)'
    : ruled.verdict === 'refused' ? `refused ${body.code}`
    : res.ok ? 'ok      ' : `refused ${body.code ?? '?'}`
  console.log(`  ${said}  ${label}  (v${snap.version})`)
  return { body, snap }
}

const open = async (phase) => {
  matchId = seed(phase)
  const snap = await snapshot(matchId)
  lastVersion = snap.version
  rebaseline(snap)
  checkInvariants(snap, `${phase} seed`)
  console.log(`\n━━ ${phase} match ${matchId.slice(0, 8)}… seeded (v${snap.version})`)
  return snap
}

// ═══ SCENARIO 1: the battles, end to end in the advanced game ═════════════
{
  const s0 = await open('battle')
  const st = () => snapshot(matchId)

  // The rotation is the fixture's own; the script reads it rather than
  // assuming it, the same way a table would.
  let snap = s0
  const LEADER = {
    atreides: { strong: 'Lady Jessica', weak: 'Dr. Wellington Yueh' },
    harkonnen: { strong: 'Feyd-Rautha', weak: 'Umman Kudu' },
    emperor: { strong: 'Hasimir Fenring', weak: 'Bashar' },
    fremen: { strong: 'Stilgar', weak: 'Jamis' },
  }

  // fight every battle the rotation offers, the aggressor winning each with
  // a dial of 1 on 1 spice, until the phase is fought out — except the
  // Fremen, who dial 1 for free. Each pass advances ONE window, and the
  // fixture holds up to four battles of five windows each.
  for (let round = 0; round < 40; round++) {
    snap = await st()
    const b = snap.state.battles
    if (!b) break
    if (b.capture) {
      // ADVANCED: the Harkonnen deal with their prisoner before the next pick
      await act('harkonnen', { type: 'BATTLE_CAPTURE', choice: round % 2 ? 'kill' : 'keep' })
      continue
    }
    if (!b.current) {
      const aggressor = b.order[b.at]
      const mine = battlesFor(pendingBattles(snap.state.forces, snap.state.storm), aggressor)
      if (mine.length === 0) break
      const opponent = mine[0].factions.find(f => f !== aggressor)
      await act(aggressor, {
        type: 'BATTLE_PICK', territoryId: mine[0].territoryId, opponent,
      })
      continue
    }
    const c = b.current
    if (c.revealed?.allocate) {
      // the winner names their dead: the law's own first option
      const al = c.revealed.allocate
      const plan = c.revealed.plans[al.by]
      const opp = [c.aggressor, c.defender].find(f => f !== al.by)
      const options = allocationsFor({
        pieces: piecesInBattle(snap.state.forces, al.by, c.territoryId, c.sectors),
        dial: plan.dial, spice: plan.spice ?? 0,
        worth: eliteWorth(al.by, opp), freeFull: fullWithoutSpice(al.by),
      })
      await act(al.by, { type: 'BATTLE_ALLOCATE', ...options[0] })
      continue
    }
    if (c.revealed) {
      // the beat: decline, both sides
      for (const f of [c.aggressor, c.defender]) {
        if (!c.revealed.traitor.answered.includes(f)) {
          await act(f, { type: 'BATTLE_CONTINUE' })
        }
      }
      continue
    }
    if (c.prescience && !c.prescience.done) {
      await act('atreides', { type: 'BATTLE_PRESCIENCE', ask: 'weapon' })
      continue
    }
    if (c.voice && !c.voice.done) {
      await act('bene-gesserit', { type: 'BATTLE_VOICE', command: null })
      continue
    }
    // plans: the aggressor wins on a strong leader and a spiced dial of one;
    // the defender dials nothing behind its weakest
    for (const [f, winning] of [[c.aggressor, true], [c.defender, false]]) {
      if (c.committed.includes(f)) continue
      const free = fullWithoutSpice(f)
      await act(f, {
        type: 'BATTLE_PLAN', territoryId: c.territoryId,
        dial: winning ? 1 : 0,
        ...(winning && !free ? { spice: 1 } : null),
        leader: LEADER[f]?.[winning ? 'strong' : 'weak'] ?? undefined,
      })
    }
  }

  // a refusal changes nothing: an illegal dial against whatever stands
  snap = await st()
  if (snap.state.battles?.current && !snap.state.battles.current.revealed) {
    await act(snap.state.battles.current.aggressor, {
      type: 'BATTLE_PLAN', territoryId: snap.state.battles.current.territoryId,
      dial: 99,
    }, 'dial-out-of-range')
  }
}

// ═══ SCENARIO 2: an auction, with the Harkonnen's bonus card ══════════════
{
  const s0 = await open('bidding')
  const order = stormOrder(s0.state.storm, s0.state.players)
  const hands = Object.fromEntries(
    (s0.state.players ?? []).map(p => [p.faction, p.handCount ?? 0]))
  const limits = {
    atreides: 4, fremen: 4, harkonnen: 8, emperor: 4,
    'spacing-guild': 4, 'bene-gesserit': 4,
  }
  await act(order[0], { type: 'OPEN_BIDDING', order, hands, limits })

  // card one: the opener bids one, everyone else passes — the opener buys
  // it; card two: everyone passes to the Harkonnen at one, whose win must
  // draw the bonus card inside the same audited write
  for (let card = 0; card < 2; card++) {
    let snap = await snapshot(matchId)
    for (let i = 0; i < 12; i++) {
      snap = await snapshot(matchId)
      const step = snap.state.auction
      if (!step || step.status !== 'awaiting') break
      if (step.carry.index > card) break
      if (step.carry.pauseUntil && Date.now() < step.carry.pauseUntil) {
        await new Promise(r => setTimeout(r, (step.carry.pauseUntil - Date.now()) + 250))
        continue
      }
      const toAct = step.carry.toAct
      const wantsIt = card === 0
        ? toAct === step.carry.order.find(f => (hands[f] ?? 0) < limits[f])
        : toAct === 'harkonnen'
      const minimum = step.carry.high ? step.carry.high.spice + 1 : 1
      await act(toAct, wantsIt && !step.carry.high
        ? { type: 'BID', bid: { kind: 'bid', spice: minimum } }
        : { type: 'BID', bid: { kind: 'pass' } })
      if (!wantsIt || step.carry.high) continue
    }
  }

  // and a refusal that must not move anything: a bid below the minimum by
  // whoever acts next, if the auction still stands
  const snap = await snapshot(matchId)
  if (snap.state.auction?.status === 'awaiting'
    && !(snap.state.auction.carry.pauseUntil && Date.now() < snap.state.auction.carry.pauseUntil)) {
    await act(snap.state.auction.carry.toAct,
      { type: 'BID', bid: { kind: 'bid', spice: 0 } }, 'below-the-minimum')
  }
}

// ═══ SCENARIO 3: charity claims, over and under the threshold ═════════════
{
  const s0 = await open('charity')
  await act('atreides', { type: 'OPEN_CHARITY' })
  // seeded purses run 0,1,2,3,7,12: the poor claim, the rich are refused
  await act('atreides', { type: 'CLAIM_CHARITY' })
  await act('fremen', { type: 'CLAIM_CHARITY' })
  await act('emperor', { type: 'CLAIM_CHARITY' }, 'not-eligible')
  // the fixture is ADVANCED, where the Bene Gesserit claim however rich —
  // the mode gate has its own coverage; here the claim must simply conserve
  await act('bene-gesserit', { type: 'CLAIM_CHARITY' })
  void s0
}

// ═══ SELF-TEST: prove the checker can scream ══════════════════════════════
if (process.argv.includes('--selftest')) {
  console.log('\n━━ self-test: corrupting a hand count on purpose')
  const snap = await snapshot(matchId)
  const before = pass
  const players = snap.state.players.map(p =>
    p.faction === 'harkonnen' ? { ...p, handCount: (p.handCount ?? 0) + 3 } : p)
  await admin.from('matches').update({ state: { ...snap.state, players } })
    .eq('id', matchId)
  const corrupted = await snapshot(matchId)
  const failuresBefore = pass
  checkInvariants(corrupted, 'selftest corruption')
  if (pass === failuresBefore && pass === before && pass) {
    console.log('  SELF-TEST FAILED: the checker did not notice the corruption')
    pass = false
  } else {
    console.log('  self-test: the checker screamed, as it must')
    pass = before   // the deliberate violation does not fail the run
  }
}

killServe()
console.log(`\n${checksRun} audits run — ${pass ? 'EVERY INVARIANT HELD' : 'VIOLATIONS FOUND'}`)
process.exit(pass ? 0 : 1)
