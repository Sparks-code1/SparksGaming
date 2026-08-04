// A campaign may cancel at most SCAR_CANCEL_LIMIT scars, ever.
//
// Cancelling is the only thing in the whole campaign that REMOVES a scar —
// everything else is additive. It was unlimited, so a long campaign could erase
// its own history as fast as it wrote it: one scar gone per game, forever.
//
// Cancelling deletes the scar outright, so nothing on the board remembers it.
// `cancelledScars` is the only trace, and therefore the only way to count them.
import { SCAR_CANCEL_LIMIT, scarsCancelled, scarCancelsLeft, canCancelScar, mergeLegacyEdits }
  from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const scar = (territoryId: string, type: string, appliedInGame = 1) =>
  ({ territoryId, type, appliedInGame })
const cancelledEntry = (n: number) =>
  ({ type: 'wasteland', territoryId: `t${n}`, appliedInGame: 1, cancelledInGame: n, cancelledByPlayerId: 'p1' })
const withCancels = (n: number) =>
  ({ cancelledScars: Array.from({ length: n }, (_, i) => cancelledEntry(i + 1)) })

console.log('\n— the limit is four —')
{
  check('the constant is 4', SCAR_CANCEL_LIMIT === 4, String(SCAR_CANCEL_LIMIT))
  check('a fresh campaign has all four', scarCancelsLeft({ cancelledScars: [] }) === 4)
  check('...and may cancel', canCancelScar({ cancelledScars: [] }))
  for (let n = 0; n < 4; n++) {
    check(`with ${n} spent, ${4 - n} left`, scarCancelsLeft(withCancels(n)) === 4 - n)
    check(`with ${n} spent, still allowed`, canCancelScar(withCancels(n)))
  }
  check('at 4 spent, none left', scarCancelsLeft(withCancels(4)) === 0)
  check('at 4 spent, NO LONGER an option', !canCancelScar(withCancels(4)))
}

console.log('\n— it is a CAMPAIGN limit, not a per-game one —')
{
  // Four different winners across four different games spend the same budget.
  const log = [
    { ...cancelledEntry(1), cancelledInGame: 3, cancelledByPlayerId: 'ryan' },
    { ...cancelledEntry(2), cancelledInGame: 5, cancelledByPlayerId: 'chris' },
    { ...cancelledEntry(3), cancelledInGame: 8, cancelledByPlayerId: 'ryan' },
    { ...cancelledEntry(4), cancelledInGame: 11, cancelledByPlayerId: 'hard' },
  ]
  check('four cancels across four games exhaust it', !canCancelScar({ cancelledScars: log }))
  check('one player using two does not get extra',
    scarsCancelled({ cancelledScars: log.filter(c => c.cancelledByPlayerId === 'ryan') }) === 2)
  check('a new game does not refill it', scarCancelsLeft({ cancelledScars: log }) === 0)
}

console.log('\n— odd and missing data is safe —')
{
  check('an absent field means none spent', scarsCancelled({}) === 0)
  check('...and all four available', scarCancelsLeft({}) === 4)
  check('null is safe', scarCancelsLeft(null) === 4)
  check('undefined is safe', canCancelScar(undefined))
  // A save that somehow recorded more than the limit must not go negative and
  // must not wrap around into "allowed again".
  check('over-spent never goes negative', scarCancelsLeft(withCancels(7)) === 0)
  check('over-spent stays refused', !canCancelScar(withCancels(7)))
}

console.log('\n— cancelling records what was removed —')
{
  // Mirrors commitCancelScar: the scar leaves `scars` and appears in
  // `cancelledScars`, so the count survives the scar itself being gone.
  const legacy: any = {
    scars: [scar('egypt', 'wasteland', 4), scar('brazil', 'fortified', 2), scar('peru', 'mercenary', 6)],
    cancelledScars: [],
  }
  const commit = (state: any, idx: number, game: number, playerId: string) => {
    const s = state.scars[idx]
    if (!s || s.type === 'fortification') return state              // never cancellable
    if (!canCancelScar(state)) return state                          // budget spent
    return {
      ...state,
      scars: state.scars.filter((_: any, i: number) => i !== idx),
      cancelledScars: [...(state.cancelledScars ?? []), {
        type: s.type, territoryId: s.territoryId, appliedInGame: s.appliedInGame,
        cancelledInGame: game, cancelledByPlayerId: playerId,
      }],
    }
  }

  let st = commit(legacy, 0, 12, 'ryan')
  check('the scar is off the board', !st.scars.some((s: any) => s.territoryId === 'egypt'))
  check('and recorded as cancelled', st.cancelledScars.length === 1)
  check('with what it was', st.cancelledScars[0].type === 'wasteland')
  check('where it was', st.cancelledScars[0].territoryId === 'egypt')
  check('the game it was applied in', st.cancelledScars[0].appliedInGame === 4)
  check('the game it was cancelled in', st.cancelledScars[0].cancelledInGame === 12)
  check('and who cancelled it', st.cancelledScars[0].cancelledByPlayerId === 'ryan')
  check('three left', scarCancelsLeft(st) === 3)

  // A fortification is never cancellable and must not spend the budget.
  const fortIdx = st.scars.findIndex((s: any) => s.type === 'fortification')
  const afterFort = commit(st, fortIdx, 12, 'ryan')
  check('a fortification cannot be cancelled', afterFort.scars.length === st.scars.length)
  check('and costs nothing from the budget', scarCancelsLeft(afterFort) === 3)
}

console.log('\n— the fifth cancel is refused even with scars on the board —')
{
  let st: any = {
    scars: [scar('a', 'wasteland'), scar('b', 'biological'), scar('c', 'mercenary'),
            scar('d', 'wasteland'), scar('e', 'biological'), scar('f', 'mercenary')],
    cancelledScars: [],
  }
  const commit = (state: any) => {
    if (!canCancelScar(state)) return state
    const s = state.scars[0]
    return {
      ...state,
      scars: state.scars.slice(1),
      cancelledScars: [...state.cancelledScars, {
        type: s.type, territoryId: s.territoryId, appliedInGame: 1,
        cancelledInGame: 1, cancelledByPlayerId: 'p1',
      }],
    }
  }
  for (let i = 0; i < 4; i++) st = commit(st)
  check('four were cancelled', st.cancelledScars.length === 4)
  check('two scars still stand', st.scars.length === 2)

  const fifth = commit(st)
  check('the fifth changes nothing', fifth.scars.length === 2)
  check('and adds no record', fifth.cancelledScars.length === 4)
  check('the remaining scars are permanent now', fifth.scars.map((s: any) => s.territoryId).join(',') === 'e,f')
}

console.log('\n— the win screen merge carries the record back —')
{
  // The win screen edits a snapshot and folds it onto the latest state. A new
  // key must survive that, or the count resets and the limit never bites.
  const baseline: any = { historyLog: [], scars: [scar('egypt', 'wasteland')], cancelledScars: [] }
  const edited: any = {
    historyLog: [{ timestamp: 't1', entry: 'cancelled a scar' }],
    scars: [],
    cancelledScars: [cancelledEntry(1)],
  }
  // Something else wrote to the campaign while the win screen was open.
  const latest: any = { historyLog: [{ timestamp: 't0', entry: 'sea line placed' }], scars: [scar('egypt', 'wasteland')], cancelledScars: [] }
  const merged = mergeLegacyEdits(latest, baseline, edited)
  check('the cancellation is recorded after the merge', merged.cancelledScars.length === 1)
  check('the scar removal survives too', merged.scars.length === 0)
  check("the other write's history is kept", merged.historyLog.some((e: any) => e.entry === 'sea line placed'))
  check('and so is the cancellation entry', merged.historyLog.some((e: any) => e.entry === 'cancelled a scar'))
  check('the budget is now 3', scarCancelsLeft(merged) === 3)

  // A baseline that predates the field at all (an older save).
  const oldBaseline: any = { historyLog: [], scars: [scar('egypt', 'wasteland')] }
  const oldEdited: any = { historyLog: [], scars: [], cancelledScars: [cancelledEntry(1)] }
  const oldMerged = mergeLegacyEdits({ ...oldBaseline }, oldBaseline, oldEdited)
  check('an older save gains the field on first cancel', oldMerged.cancelledScars.length === 1)
  check('and starts counting from there', scarCancelsLeft(oldMerged) === 3)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
