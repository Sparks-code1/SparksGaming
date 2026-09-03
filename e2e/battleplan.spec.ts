/**
 * Two battles, both plans committed, through the real endpoint.
 *
 * WHY THIS EXISTS, precisely. A helper was extracted for the battle Karama
 * stops and parked between `case 'BATTLE_PICK'` and `case 'BATTLE_PLAN'` — a
 * lexical declaration inside a switch block. A switch does not run the
 * statements it jumps past, so control entering at BATTLE_PLAN skipped it and
 * every plan died on "Cannot access 'battleStops' before initialization".
 *
 * It typechecked. It bundled. All 107 unit suites passed, because they call the
 * pure rules and never enter the switch. The browser suite passed too, because
 * it drove the dial and stopped short of pressing Commit. It failed only in a
 * real match, and it took two deploys and a player's bug report to find.
 *
 * So what is asserted here is the ROUND TRIP a plan makes, twice: the endpoint
 * is entered at BATTLE_PLAN and comes back with an answer that is not a crash.
 * The arithmetic belongs to dunebattletest and is not repeated.
 *
 * TWICE, BECAUSE ONCE PROVES LESS. The first battle runs against a board no
 * action has touched; the second runs against one a resolution has rewritten —
 * leaders in the tanks, forces lifted, the rotation moved. The report that
 * found the bug read "the first battle's plan worked and the second one
 * throws", and a spec that stopped after one would have agreed with it.
 *
 * THE BEATS ARE PLAYED, NOT SCRIPTED. Between the two plans sit a Voice, a
 * prescience question, a traitor call and possibly a loss allocation, and which
 * of them open depends on who the storm put in which fight. A fixed script
 * would encode one seating and rot; `playTheBeat` reads the row and answers
 * whatever is actually waiting, which is also what makes a NEW beat appearing
 * unannounced a failure here rather than a silent skip.
 */
import { test, expect } from '@playwright/test'
import { readRun, stackOf } from './support/run'
import { seedPhase, act } from './support/stack'
import { signInSeat, openMatch, expectNothingOnTop } from './support/seat'
import { createClient } from '@supabase/supabase-js'

// THE SAME FUNCTION THE SERVER PICKS FROM — the generated bundle, not a copy.
// A spec with its own idea of which territories are contested is a spec that
// can disagree with the endpoint and blame the endpoint.
const { pendingBattles } = await import('../supabase/functions/_shared/duneBattle.gen.ts') as {
  pendingBattles: (forces: unknown[], storm: string) =>
    { territoryId: string; sectors: string[]; factions: string[] }[]
}

const run = readRun()
const stack = stackOf(run)

interface BattleState {
  phase?: string
  storm?: string
  forces?: unknown[]
  battles?: {
    order?: string[]
    at?: number
    fought?: unknown[]
    current?: {
      territoryId?: string
      aggressor?: string
      defender?: string
      committed?: string[]
      voice?: { by?: string; done?: boolean }
      prescience?: { by?: string; done?: boolean }
      revealed?: {
        traitor?: { answered?: string[]; calls?: unknown[] }
        allocate?: { by?: string }
      }
    } | null
  }
}

const admin = () => createClient(stack.api, stack.service, { auth: { persistSession: false } })

async function boardOf(matchId: string): Promise<BattleState> {
  const { data } = await admin().from('matches').select('state').eq('id', matchId).single()
  return (data?.state ?? {}) as BattleState
}

/** Every action this spec sends, with its answer, for the failure message. */
const trail: string[] = []

/**
 * One action, refused loudly.
 *
 * A CRASH IS NOT A REFUSAL and is called out by name: 'action-threw' means the
 * endpoint died inside, which is the whole thing this file exists to catch, and
 * it must never be mistaken for a rule saying no.
 */
async function send(
  faction: string, matchId: string, action: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await act(stack, faction, matchId, action)
  trail.push(`${faction} ${String(action.type)} → ${res.status} ${String(res.body.code ?? 'ok')}`)
  expect(res.body.code,
    `${String(action.type)} crashed the endpoint as ${faction}. `
    + `${String(res.body.error ?? '')}\n  ${trail.join('\n  ')}`).not.toBe('action-threw')
  return res
}

/**
 * Answer whichever beat the row is waiting on. Returns what it did, or null
 * when the battle is over and the next one needs picking.
 */
async function playTheBeat(matchId: string): Promise<string | null> {
  const state = await boardOf(matchId)
  const c = state.battles?.current
  if (!c) return null
  const combatants = [c.aggressor, c.defender].filter(Boolean) as string[]

  // The Voice speaks before the voiced may commit, so it goes first.
  if (c.voice && !c.voice.done) {
    await send(String(c.voice.by), matchId, { type: 'BATTLE_VOICE', command: null })
    return 'voice'
  }
  if (c.prescience && !c.prescience.done) {
    await send(String(c.prescience.by), matchId, { type: 'BATTLE_PRESCIENCE', ask: null })
    return 'prescience'
  }

  // ── THE PLAN. The one round trip this file is about. ────────────────────
  const owing = combatants.filter(f => !(c.committed ?? []).includes(f))
  if (owing.length > 0 && !c.revealed) {
    for (const f of owing) {
      const res = await send(f, matchId, {
        type: 'BATTLE_PLAN', territoryId: c.territoryId, dial: 0,
      })
      expect(res.status,
        `${f} could not commit a plan in ${c.territoryId}: `
        + `${String(res.body.code ?? res.status)} ${String(res.body.error ?? '')}`
        + `\n  ${trail.join('\n  ')}`).toBeLessThan(400)
    }
    return 'plans'
  }

  if (c.revealed?.allocate) {
    await send(String(c.revealed.allocate.by), matchId,
      { type: 'BATTLE_ALLOCATE', allocation: null })
    return 'allocate'
  }
  if (c.revealed?.traitor) {
    // EVERY SEAT THAT HAS NOT ANSWERED, not just the two fighting. The
    // Harkonnen alliance card admits a third answer — an ally outside the
    // battle may turn its traitors on the combatant — so a list built from the
    // combatants alone can leave the beat open forever and this spec spinning
    // to its step cap. The seats with no business here are refused, which is a
    // ruling and not a crash, and send() only fails on the crash.
    const answered = c.revealed.traitor.answered ?? []
    const owed = stack.factions.filter(f => !answered.includes(f))
    for (const f of owed) await send(f, matchId, { type: 'BATTLE_CONTINUE' })
    return 'traitor'
  }
  return 'waiting'
}

test('two battles are picked and both plans commit', async () => {
  const matchId = seedPhase(stack, 'battle')

  const fought: string[] = []
  // Generous, because each battle is several beats and a stuck row should fail
  // on the assertion below rather than by spinning.
  for (let step = 0; step < 40 && fought.length < 2; step++) {
    const state = await boardOf(matchId)
    if (state.phase !== 'Battles') break

    const c = state.battles?.current
    if (!c) {
      // Between battles: the rotation's aggressor picks the next one.
      const order = state.battles?.order ?? []
      const aggressor = order[state.battles?.at ?? 0]
      if (!aggressor) break
      // WHICH BATTLE, out of the same function the endpoint picks from. The
      // pending list is DERIVED from the forces and the storm and is on no
      // field of the row, so a spec that read state.battles.pending would be
      // sending an empty pick and calling the refusal a result.
      const pending = pendingBattles(state.forces ?? [], String(state.storm ?? ''))
      const theirs = pending.filter(x => x.factions.includes(aggressor))
      if (theirs.length === 0) break
      const opponent = theirs[0].factions.find(f => f !== aggressor)
      const res = await send(aggressor, matchId, {
        type: 'BATTLE_PICK', territoryId: theirs[0].territoryId, opponent,
      })
      if (res.status >= 400) break
      const after = await boardOf(matchId)
      if (after.battles?.current?.territoryId) {
        fought.push(String(after.battles.current.territoryId))
      }
      continue
    }
    const did = await playTheBeat(matchId)
    if (did === null || did === 'waiting') break
  }

  expect(fought.length,
    `only ${fought.length} battle(s) were opened; the fixture holds two contested `
    + `territories and this spec is worthless if it never reaches the second.`
    + `\n  ${trail.join('\n  ')}`).toBeGreaterThanOrEqual(2)

  // AND EVERY PLAN LANDED. The crash this file was written for answered 500
  // with code 'action-threw'; send() fails on that by name, so reaching here
  // means both battles took a committed plan through the endpoint and back.
  const plans = trail.filter(t => t.includes('BATTLE_PLAN'))
  expect(plans.length,
    `two battles were opened but fewer than two plans were sent:\n  ${trail.join('\n  ')}`)
    .toBeGreaterThanOrEqual(2)
  expect(plans.filter(t => !/→ 2\d\d ok$/.test(t)),
    `a plan was refused:\n  ${trail.join('\n  ')}`).toEqual([])
})

test('the commit button posts the plan the dial was set to', async ({ page, context }) => {
  // THE OTHER HALF OF THE ROUND TRIP. The test above proves the endpoint
  // survives a plan; this proves the button in front of a player is wired to
  // send one — the browser suite drove the dial and stopped there, which is
  // exactly the gap the crash lived in.
  const matchId = seedPhase(stack, 'battle')
  const state = await boardOf(matchId)
  const aggressor = state.battles?.order?.[state.battles?.at ?? 0] ?? 'atreides'

  await signInSeat(context, stack, aggressor)
  await openMatch(page, matchId)

  await page.locator('[data-pick]').first().click()
  await expect(page.locator('[data-dial-number]').first(),
    'the battle was picked and no plan opened').toBeVisible({ timeout: 30_000 })
  await page.locator('[data-dial-number="1"]').first().click()

  const commit = page.locator('[data-plan-commit]').first()
  await expect(commit, 'there is no way to commit the plan').toBeVisible({ timeout: 10_000 })
  await expectNothingOnTop(page, '[data-plan-commit]', 'the commit button')
  await expect(commit, 'the commit button is drawn but dead').toBeEnabled()
  await commit.click()

  // THE ROW IS THE WITNESS, not the screen. A button that changes its own label
  // and sends nothing would pass any check made against the panel.
  await expect.poll(async () => {
    const after = await boardOf(matchId)
    return after.battles?.current?.committed ?? []
  }, {
    message: 'the commit button was pressed and no plan reached the row',
    timeout: 30_000,
  }).toContain(aggressor)
})
