/**
 * The soft-lock this covers: the draw modal offers Take Card with nothing
 * selectable and no Skip, so the draw can neither be finished nor abandoned.
 *
 * The predicates below mirror CardDrawModal exactly. They are duplicated here
 * ONLY because they are inline JSX expressions in the component; if the
 * component's rules change these must be updated with them.
 */

interface Offer {
  anyControlled: boolean
  hasResource: boolean
  coinBlocked: boolean
  freeChoice: boolean
  reconActive: boolean
  /** Per-sideboard-card: does the player control it (or reach it via homeland)? */
  controls: boolean[]
}

const sideboardSelectable = (o: Offer, controls: boolean) =>
  (o.freeChoice || o.reconActive) ? true : (o.anyControlled ? controls : false)

const resourceSelectable = (o: Offer) =>
  o.coinBlocked ? false : (o.freeChoice ? true : !o.anyControlled)

const anySelectable = (o: Offer) =>
  o.controls.some(c => sideboardSelectable(o, c)) || (o.hasResource && resourceSelectable(o))

/** The OLD condition for showing Skip — kept to prove the gap it left. */
const oldSkipShown = (o: Offer) => !o.hasResource && !o.anyControlled
/** The new one. */
const newSkipShown = (o: Offer) => !anySelectable(o)

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const base: Offer = {
  anyControlled: false, hasResource: true, coinBlocked: false,
  freeChoice: false, reconActive: false, controls: [false, false, false, false],
}

console.log('\n— the reported lock: coins left, none controlled, coin blocked —')
{
  const o: Offer = { ...base, coinBlocked: true }
  check('nothing is selectable', !anySelectable(o))
  check('the OLD code showed no Skip — this was the dead end', !oldSkipShown(o))
  check('the new code offers Skip', newSkipShown(o))
}

console.log('\n— every combination has a way forward —')
{
  const bools = [false, true]
  let locked: Offer[] = []
  let total = 0
  for (const anyControlled of bools)
    for (const hasResource of bools)
      for (const coinBlocked of bools)
        for (const freeChoice of bools)
          for (const reconActive of bools)
            // Sideboard shapes: none controlled, one controlled, all controlled
            for (const controls of [[false,false,false,false],[true,false,false,false],[true,true,true,true]]) {
              // anyControlled is derived from `controls` in the component, so keep
              // the pair consistent or the case is not reachable.
              if (anyControlled !== controls.some(Boolean)) continue
              total++
              const o: Offer = { anyControlled, hasResource, coinBlocked, freeChoice, reconActive, controls }
              if (!anySelectable(o) && !newSkipShown(o)) locked.push(o)
            }
  check(`no reachable state is stuck (${total} combinations)`, locked.length === 0,
    locked.length ? JSON.stringify(locked[0]) : '')
}

console.log('\n— the old rule left real gaps —')
{
  const bools = [false, true]
  const gaps: Offer[] = []
  for (const hasResource of bools)
    for (const coinBlocked of bools)
      for (const controls of [[false,false,false,false],[true,false,false,false]]) {
        const anyControlled = controls.some(Boolean)
        const o: Offer = { anyControlled, hasResource, coinBlocked, freeChoice: false, reconActive: false, controls }
        if (!anySelectable(o) && !oldSkipShown(o)) gaps.push(o)
      }
  check('the old rule stranded at least one state', gaps.length > 0, `${gaps.length} found`)
  check('and every one of them is now escapable', gaps.every(newSkipShown))
}

console.log('\n— Skip is not offered when a pick IS available —')
{
  check('coins available, none controlled → take the coin', !newSkipShown(base))
  const controlled: Offer = { ...base, anyControlled: true, controls: [true, false, false, false] }
  check('controls a face-up card → take it', !newSkipShown(controlled))
  const emptyPileControlled: Offer = { ...controlled, hasResource: false }
  check('pile empty but controls a card → take it', !newSkipShown(emptyPileControlled))
  const recon: Offer = { ...base, coinBlocked: true, reconActive: true }
  check('Recon opens the face-up cards even with the coin blocked', !newSkipShown(recon))
  const free: Offer = { ...base, coinBlocked: true, freeChoice: true }
  check('freeChoice opens the face-up cards too', !newSkipShown(free))
}

console.log('\n— pile empty and nothing controlled (already worked) —')
{
  const o: Offer = { ...base, hasResource: false }
  check('nothing selectable', !anySelectable(o))
  check('old rule showed Skip here', oldSkipShown(o))
  check('new rule still does', newSkipShown(o))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
