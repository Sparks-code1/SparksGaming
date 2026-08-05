/**
 * The shared game-setup state machine: dice, factions, weaknesses, abilities,
 * HQ territories — as one document every screen renders from.
 *
 * Online, setup used to run only on the host's machine: every other player
 * stared at a frozen lobby while their die was rolled and their faction picked
 * for them. Now the HOST holds this document, publishes it to the match row
 * after every change, and each player submits their own choice from their own
 * screen. The host is the only machine that runs these transitions — joiners
 * render the document and declare intentions; the host validates and applies.
 *
 * Everything here is pure so the rules are testable without a lobby, and so
 * there is exactly ONE copy of "whose turn is it to pick" — the standoff where
 * two screens disagree about who everyone is waiting for has no code to live
 * in.
 *
 * The phase order mirrors GameSetupScreen's hotseat flow exactly: every player
 * picks a faction in turn (a faction that must take a weakness power picks it
 * immediately), then abilities for factions that still have a choice, then
 * territories in turn order.
 */

export interface SetupDoc {
  phase: 'dice' | 'faction' | 'weakness' | 'ability' | 'territory' | 'done'
  /** Dice reroll round. A roll is accepted only when cast for the current round. */
  round: number
  /** Accepted rolls for the current round, playerId → 1–6. */
  rolls: Record<string, number>
  /** Turn order, settled once the dice are done. */
  order: string[] | null
  /** Index into `order`: whose pick it is during the pick phases. */
  turnIdx: number
  factions: Record<string, string>      // playerId → factionId
  weaknesses: Record<string, string>    // factionId → weakness power id
  abilities: Record<string, string>     // factionId → ability id chosen THIS game
  territories: Record<string, string>   // playerId → starting territory id
}

/** One player's declared intention, written to their own seat row. */
export interface SetupChoice {
  kind: 'roll' | 'pick'
  /** roll: which reroll round this die was cast for. */
  round?: number
  roll?: number
  /** pick: which phase+turn it addresses, e.g. "faction:2" — stale picks die here. */
  turnKey?: string
  value?: string
}

/** What the rules need to know about the campaign — supplied, never imported,
 *  so this module stays pure and the tests stay in charge of the world. */
export interface SetupCtx {
  /** Seat order before dice (the lobby's seat order). */
  players: string[]
  /** factionId → ability locked in by a PAST game (skips the ability phase). */
  existingAbilities: Record<string, string>
  availableFactions: string[]
  /** Ability ids this faction may pick from now (empty = nothing to choose). */
  abilityOptionIds: (factionId: string) => string[]
  /** Must this faction take a weakness power this game? */
  needsWeakness: (factionId: string) => boolean
}

export function initialSetup(players: string[]): SetupDoc {
  void players
  return {
    phase: 'dice', round: 1, rolls: {}, order: null, turnIdx: 0,
    factions: {}, weaknesses: {}, abilities: {}, territories: {},
  }
}

/** Whose pick the current phase is waiting on, or null (dice waits on everyone). */
export function expectedActor(doc: SetupDoc): string | null {
  if (doc.phase === 'dice' || doc.phase === 'done' || !doc.order) return null
  return doc.order[doc.turnIdx] ?? null
}

/** Players who still owe a die this round. */
export function awaitedRolls(doc: SetupDoc, ctx: SetupCtx): string[] {
  if (doc.phase !== 'dice') return []
  return ctx.players.filter(p => doc.rolls[p] === undefined)
}

/**
 * Accept one die. Refused (returns the same doc) when the phase has moved on,
 * the roll was cast for a stale round, the value is not a die face, or this
 * player already rolled — a second roll is how you cheat, not how you retry.
 */
export function acceptRoll(doc: SetupDoc, ctx: SetupCtx, playerId: string, roll: number, round: number): SetupDoc {
  if (doc.phase !== 'dice') return doc
  if (round !== doc.round) return doc
  if (!ctx.players.includes(playerId)) return doc
  if (doc.rolls[playerId] !== undefined) return doc
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) return doc
  const next = { ...doc, rolls: { ...doc.rolls, [playerId]: roll } }
  return settleDice(next, ctx)
}

/**
 * When everyone has rolled: reroll the players tied at the TOP (matching the
 * hotseat screen — lower ties keep seat order), or settle the turn order and
 * open the faction phase.
 */
function settleDice(doc: SetupDoc, ctx: SetupCtx): SetupDoc {
  if (ctx.players.some(p => doc.rolls[p] === undefined)) return doc
  const top = Math.max(...ctx.players.map(p => doc.rolls[p]))
  const tied = ctx.players.filter(p => doc.rolls[p] === top)
  if (tied.length > 1) {
    const rolls = { ...doc.rolls }
    for (const p of tied) delete rolls[p]
    return { ...doc, round: doc.round + 1, rolls }
  }
  // Stable: equal rolls below the top keep their seat order.
  const order = [...ctx.players].sort((a, b) => doc.rolls[b] - doc.rolls[a])
  return { ...doc, order, phase: 'faction', turnIdx: 0 }
}

/** The key a pick must carry to address the current turn. */
export function turnKey(doc: SetupDoc): string {
  return `${doc.phase}:${doc.turnIdx}`
}

/**
 * Apply the current actor's pick. Returns the same doc for anything invalid —
 * wrong actor, taken faction, stale key — because on the host these arrive
 * from the network and "ignore and republish" is the whole protocol.
 */
export function applyPick(doc: SetupDoc, ctx: SetupCtx, playerId: string, value: string): SetupDoc {
  if (!doc.order) return doc
  if (playerId !== expectedActor(doc)) return doc

  switch (doc.phase) {
    case 'faction': {
      if (!ctx.availableFactions.includes(value)) return doc
      if (Object.values(doc.factions).includes(value)) return doc
      const next = { ...doc, factions: { ...doc.factions, [playerId]: value } }
      if (ctx.needsWeakness(value)) return { ...next, phase: 'weakness' as const }
      return afterFactionStage(next, ctx)
    }
    case 'weakness': {
      const factionId = doc.factions[playerId]
      if (!factionId) return doc
      if (Object.values(doc.weaknesses).includes(value)) return doc
      return afterFactionStage(
        { ...doc, weaknesses: { ...doc.weaknesses, [factionId]: value } }, ctx)
    }
    case 'ability': {
      const factionId = doc.factions[playerId]
      if (!factionId) return doc
      if (!ctx.abilityOptionIds(factionId).includes(value)) return doc
      const next = { ...doc, abilities: { ...doc.abilities, [factionId]: value } }
      const idx = nextAbilityIdx(next, ctx, doc.turnIdx + 1)
      return idx !== null
        ? { ...next, turnIdx: idx }
        : { ...next, phase: 'territory' as const, turnIdx: 0 }
    }
    case 'territory': {
      if (Object.values(doc.territories).includes(value)) return doc
      const next = { ...doc, territories: { ...doc.territories, [playerId]: value } }
      if (doc.turnIdx + 1 < doc.order.length) return { ...next, turnIdx: doc.turnIdx + 1 }
      return { ...next, phase: 'done' as const }
    }
    default:
      return doc
  }
}

/** After a faction (and any weakness) lands: next picker, or on to abilities. */
function afterFactionStage(doc: SetupDoc, ctx: SetupCtx): SetupDoc {
  if (!doc.order) return doc
  if (doc.turnIdx + 1 < doc.order.length) {
    return { ...doc, phase: 'faction', turnIdx: doc.turnIdx + 1 }
  }
  const idx = nextAbilityIdx(doc, ctx, 0)
  return idx !== null
    ? { ...doc, phase: 'ability', turnIdx: idx }
    : { ...doc, phase: 'territory', turnIdx: 0 }
}

/** First player at or after `from` whose faction still owes an ability choice. */
function nextAbilityIdx(doc: SetupDoc, ctx: SetupCtx, from: number): number | null {
  if (!doc.order) return null
  for (let i = from; i < doc.order.length; i++) {
    const fid = doc.factions[doc.order[i]]
    if (!fid) continue
    if (ctx.existingAbilities[fid]) continue          // locked in a past game
    if (doc.abilities[fid]) continue                  // picked this game
    if (ctx.abilityOptionIds(fid).length === 0) continue  // nothing to choose
    return i
  }
  return null
}

/**
 * Fold every seat's pending declaration into the document — the host's step,
 * run on each subscription refresh. Order-independent for rolls; for picks
 * only the expected actor's declaration can land, so a stale one from someone
 * else is skipped rather than saved up.
 */
export function ingestChoices(
  doc: SetupDoc,
  ctx: SetupCtx,
  choices: Record<string, SetupChoice | null | undefined>,
): SetupDoc {
  let next = doc
  for (const [pid, c] of Object.entries(choices)) {
    if (!c) continue
    if (c.kind === 'roll' && typeof c.roll === 'number' && typeof c.round === 'number') {
      next = acceptRoll(next, ctx, pid, c.roll, c.round)
    }
  }
  // Picks after rolls: the roll that completes the dice phase may have opened
  // the faction phase this very ingest, and the actor's pick may already be
  // waiting. Loop because one landed pick can make the NEXT pick current.
  for (let guard = 0; guard < 16; guard++) {
    const actor = expectedActor(next)
    if (!actor) break
    const c = choices[actor]
    if (!c || c.kind !== 'pick' || !c.value || c.turnKey !== turnKey(next)) break
    const applied = applyPick(next, ctx, actor, c.value)
    if (applied === next) break
    next = applied
  }
  return next
}
