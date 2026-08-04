/**
 * A player who has earned the face-up mission is never offered a territory card.
 *
 * The decision below mirrors `missionEarnedBy` + `awardTerritoryCard` +
 * `dropCardDrawForMission` in GameBoard. Those are inline in the component, so
 * this is a model of them: if the component's rules change this must change too.
 */
import { checkMission } from '@/lib/missionLogic'
import { isPrivateMission, canClaimStarPower } from '@/data/cards'
import { initialTurnState } from '@/types/game'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

interface World {
  missionId: string | null
  playerId: string
  factionId: string
  eliminated?: boolean
  doubleWinnerMilestoneTriggered?: boolean
  factionStarPowerMissions?: Record<string, string>
  territories: any
  turn?: any
  namedContinents?: any
  continentBonusModifiers?: any
}

function missionEarnedBy(w: World): boolean {
  if (!w.doubleWinnerMilestoneTriggered) return false
  if (!w.missionId) return false
  if (w.eliminated) return false
  const held = (w.factionStarPowerMissions ?? {})[w.factionId]
  if (isPrivateMission(w.missionId) && canClaimStarPower(w.factionId) && held && held !== w.missionId) return false
  const turn = { ...initialTurnState(), ...(w.turn ?? {}) }
  return checkMission(w.missionId, w.playerId, w.territories,
    { turn } as any,
    { conqueredIds: turn.conqueredIds, conqueredViaSeaIds: turn.conqueredViaSeaIds }, 0,
    { namedContinents: w.namedContinents, continentBonusModifiers: w.continentBonusModifiers })
}

/** What the player gets for capturing: a card, or nothing plus the mission. */
function outcomeOfCapture(w: World): 'card' | 'mission-no-card' {
  return missionEarnedBy(w) ? 'mission-no-card' : 'card'
}

const ME = 'p1', THEM = 'p2'
function board(heldContinents: string[]): any {
  const t: any = {}
  for (const d of TERRITORY_DEFINITIONS) {
    t[d.id] = { id: d.id, name: d.name, continentId: d.continentId, adjacentIds: [],
      occupyingPlayerId: heldContinents.includes(d.continentId) ? ME : THEM,
      troops: 1, scars: [], cities: [] }
  }
  return t
}
const base = (over: Partial<World> = {}): World => ({
  missionId: 'mc-7-continent-bonus', playerId: ME, factionId: 'khan-industries',
  doubleWinnerMilestoneTriggered: true, territories: board([]), ...over,
})

console.log('\n— the card is withheld exactly when the mission is earned —')
{
  check('mission not met -> a card, as always',
    outcomeOfCapture(base({ territories: board(['australia']) })) === 'card')
  check('mission met -> NO card',
    outcomeOfCapture(base({ territories: board(['asia']) })) === 'mission-no-card')
  check('mission met by a campaign modifier -> still no card',
    outcomeOfCapture(base({
      territories: board(['africa', 'australia']),
      continentBonusModifiers: [{ continentId: 'australia', bonusDelta: 1 }],
      namedContinents: { australia: { namedByPlayerId: ME } },
    })) === 'mission-no-card')
  check('...whereas the printed value alone would have handed over a card',
    outcomeOfCapture(base({ territories: board(['africa', 'australia']) })) === 'card')
}

console.log('\n— things that keep the card in play —')
{
  check('no face-up mission -> card',
    outcomeOfCapture(base({ missionId: null, territories: board(['asia']) })) === 'card')
  check('missions still locked -> card',
    outcomeOfCapture(base({ doubleWinnerMilestoneTriggered: false, territories: board(['asia']) })) === 'card')
  check('an eliminated player -> card path (they claim nothing)',
    outcomeOfCapture(base({ eliminated: true, territories: board(['asia']) })) === 'card')
}

console.log('\n— a faction that cannot claim the private mission still gets its card —')
{
  const w = base({
    missionId: 'pm-wide-border', factionId: 'khan-industries',
    turn: { continentsAtTurnStart: 2 },
    territories: board(['asia']),
  })
  check('with no star power held, the mission is earned -> no card',
    outcomeOfCapture(w) === 'mission-no-card')
  check('holding a DIFFERENT star power blocks the claim -> card is kept',
    outcomeOfCapture({ ...w, factionStarPowerMissions: { 'khan-industries': 'pm-advanced-tactics' } }) === 'card')
  check('holding THIS star power still earns it -> no card',
    outcomeOfCapture({ ...w, factionStarPowerMissions: { 'khan-industries': 'pm-wide-border' } }) === 'mission-no-card')
  check('the Aliens never take a power, so they are never blocked -> no card',
    outcomeOfCapture({ ...w, factionId: 'aliens', factionStarPowerMissions: { aliens: 'pm-advanced-tactics' } }) === 'mission-no-card')
}

console.log('\n— a mission earned mid-turn is caught before the draw modal —')
{
  // awardTerritoryCard fires on the FIRST capture; the deciding re-check happens
  // when the attack phase ends, so a mission finished later still cancels the card.
  const atFirstCapture = base({ territories: board(['australia']) })
  const atAttackEnd    = base({ territories: board(['asia']) })
  check('first capture would have queued a card', outcomeOfCapture(atFirstCapture) === 'card')
  check('by the end of the attack phase it is cancelled',
    outcomeOfCapture(atAttackEnd) === 'mission-no-card')
}

console.log('\n— the World Capital keeps its own forgo path —')
{
  // It reads turn.eligibleForRichCard, which awardTerritoryCard sets as it declines
  // the draw — so the generic check must NOT be what decides it.
  const w = base({ missionId: 'mc-world-capital', territories: board(['asia']) })
  check('before the draw is offered it is not yet earned',
    outcomeOfCapture(w) === 'card')
  check('once eligibility is recorded it is earned',
    outcomeOfCapture({ ...w, turn: { eligibleForRichCard: true } }) === 'mission-no-card')
}

console.log('\n— an event draw is separate from the turn\'s card —')
{
  // Models eventDrawCreditsRef + consumeEventDrawCredit + dropCardDrawForMission.
  class Turn {
    queue: string[] = []
    credits = new Map<string, number>()
    forfeited = new Set<string>()

    /** Mysterious Island: the Alien Island controller draws immediately. */
    grantEventDraw(pid: string) {
      this.queue.unshift(pid)
      this.credits.set(pid, (this.credits.get(pid) ?? 0) + 1)
    }
    /** The card you collect for conquering — declined if the mission is earned. */
    awardConquestCard(pid: string, missionEarned: boolean) {
      if (missionEarned) return false
      this.queue.push(pid); return true
    }
    /** Resolving the next draw. */
    resolveNext() {
      const pid = this.queue.shift()
      if (!pid) return null
      const n = this.credits.get(pid) ?? 0
      if (n > 0) this.credits.set(pid, n - 1)      // event draw: mission survives
      else this.forfeited.add(pid)                  // the turn's card: mission lost
      return pid
    }
    /** Attack phase ends: cancel conquest draws only. */
    dropForMission(pid: string, missionEarned: boolean) {
      const queued = this.queue.filter(id => id === pid).length
      let droppable = queued - (this.credits.get(pid) ?? 0)
      if (droppable <= 0 || !missionEarned) return
      this.queue = this.queue.filter(id => {
        if (id === pid && droppable > 0) { droppable--; return false }
        return true
      })
    }
    canClaimMission(pid: string) { return !this.forfeited.has(pid) }
  }

  {
    const t = new Turn()
    t.grantEventDraw(ME)
    t.resolveNext()
    check('taking the island card does NOT forfeit the mission', t.canClaimMission(ME))
    check('and no credit is left over', (t.credits.get(ME) ?? 0) === 0)
  }
  {
    const t = new Turn()
    t.awardConquestCard(ME, false)
    t.resolveNext()
    check('the ordinary conquest card still forfeits it', !t.canClaimMission(ME))
  }
  {
    // Both queued: the island card is resolved first (it is unshifted to the front).
    const t = new Turn()
    t.awardConquestCard(ME, false)
    t.grantEventDraw(ME)
    check('the island draw is first in the queue', t.queue[0] === ME && t.queue.length === 2)
    t.resolveNext()
    check('after the island card the mission is still claimable', t.canClaimMission(ME))
    t.resolveNext()
    check('...but the conquest card that follows forfeits it', !t.canClaimMission(ME))
  }
  {
    // Mission earned: the conquest card is never offered, the island card stands.
    const t = new Turn()
    check('no conquest card is queued', t.awardConquestCard(ME, true) === false)
    t.grantEventDraw(ME)
    t.dropForMission(ME, true)
    check('the island draw survives the cancellation', t.queue.length === 1)
    t.resolveNext()
    check('and the mission is still claimable', t.canClaimMission(ME))
  }
  {
    // Mission earned only mid-turn, after a conquest card was already queued.
    const t = new Turn()
    t.awardConquestCard(ME, false)
    t.grantEventDraw(ME)
    t.dropForMission(ME, true)
    check('only the conquest draw is cancelled', t.queue.length === 1)
    t.resolveNext()
    check('the remaining draw is the island one, so the mission holds', t.canClaimMission(ME))
    check('no draws left', t.queue.length === 0)
  }
  {
    const t = new Turn()
    t.grantEventDraw(ME); t.grantEventDraw(ME)
    t.resolveNext(); t.resolveNext()
    check('two island draws in one turn both stay exempt', t.canClaimMission(ME))
  }
  {
    // The controller may be a player whose turn it is not.
    const t = new Turn()
    t.grantEventDraw(THEM)
    t.awardConquestCard(ME, false)
    t.dropForMission(ME, true)
    check("another player's island draw is untouched", t.queue.includes(THEM))
    check('while my conquest draw is cancelled', !t.queue.includes(ME))
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
