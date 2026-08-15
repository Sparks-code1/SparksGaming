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
  phase: 'dice' | 'draft' | 'faction' | 'weakness' | 'ability' | 'territory' | 'done'
  /** Dice reroll round. A roll is accepted only when cast for the current round. */
  round: number
  /** Accepted rolls for the current round, playerId → 1–6. */
  rolls: Record<string, number>
  /**
   * Turn order. In an ordinary game the dice settle it. In a DRAFT it holds the
   * dice order while the draft runs — that is the order players claim in — and
   * is replaced by the drafted order the moment the last claim lands, because
   * from there on (territories, and the game itself) the drafted order is the
   * turn order.
   */
  order: string[] | null
  /** Index into `order`: whose pick it is. In the draft it cycles. */
  turnIdx: number
  factions: Record<string, string>      // playerId → factionId
  weaknesses: Record<string, string>    // factionId → weakness power id
  abilities: Record<string, string>     // factionId → ability id chosen THIS game
  territories: Record<string, string>   // playerId → starting territory id
  /** Draft only — playerId → index into DRAFT_TROOP_SLOTS(n). */
  troops?: Record<string, number>
  /** Draft only — playerId → index into DRAFT_COIN_SLOTS(n). */
  coins?: Record<string, number>
  /** Draft only — playerId → the 1-based turn position they claimed. */
  orderSlots?: Record<string, number>
}

/**
 * The draft board's four lists. Each player claims exactly one item from each,
 * one item per turn, going round in dice order.
 *
 * Shared with the hotseat draft screen rather than copied: the two boards must
 * offer the same slots or the same campaign plays by different rules depending
 * on who is at the keyboard.
 */
export const DRAFT_LISTS = ['faction', 'troops', 'coins', 'order'] as const
export type DraftList = typeof DRAFT_LISTS[number]

/** Starting-troop slots, best first. */
export function DRAFT_TROOP_SLOTS(n: number): number[] {
  if (n === 4) return [10, 8, 8, 6]
  if (n === 5) return [10, 10, 8, 8, 6]
  return [10, 8, 8, 6, 6].slice(0, n)
}

/** Starting coin-card slots, best first. */
export function DRAFT_COIN_SLOTS(n: number): number[] {
  return [2, 1, 1, 0, 0].slice(0, n)
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
  /**
   * Does this campaign draft? Unlocked campaigns replace the faction phase
   * with the draft board, and skip the ability phase — matching the hotseat
   * draft screen, which hands its existing abilities straight through.
   */
  draft?: boolean
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
  return { ...doc, order, phase: ctx.draft ? 'draft' : 'faction', turnIdx: 0 }
}

/**
 * The key a pick must carry to address the current turn.
 *
 * The draft counts claims as well as the picker, because the picker CYCLES
 * there — "draft:2" comes round again every rotation, so a pick that was too
 * slow to land would otherwise be applied a full turn later, against whatever
 * the player is looking at now.
 */
export function turnKey(doc: SetupDoc): string {
  if (doc.phase === 'draft' || doc.phase === 'weakness') {
    return `${doc.phase}:${doc.turnIdx}:${draftClaimTotal(doc)}`
  }
  return `${doc.phase}:${doc.turnIdx}`
}

/** How many of their four claims this player has made. */
export function draftPickCount(doc: SetupDoc, playerId: string): number {
  return (doc.factions[playerId] !== undefined ? 1 : 0)
    + ((doc.troops ?? {})[playerId] !== undefined ? 1 : 0)
    + ((doc.coins ?? {})[playerId] !== undefined ? 1 : 0)
    + ((doc.orderSlots ?? {})[playerId] !== undefined ? 1 : 0)
}

function draftClaimTotal(doc: SetupDoc): number {
  return Object.keys(doc.factions).length
    + Object.keys(doc.troops ?? {}).length
    + Object.keys(doc.coins ?? {}).length
    + Object.keys(doc.orderSlots ?? {}).length
}

/** Which list a player still owes, for a screen to grey out the rest. */
export function draftListOpen(doc: SetupDoc, playerId: string, list: DraftList): boolean {
  if (list === 'faction') return doc.factions[playerId] === undefined
  if (list === 'troops') return (doc.troops ?? {})[playerId] === undefined
  if (list === 'coins') return (doc.coins ?? {})[playerId] === undefined
  return (doc.orderSlots ?? {})[playerId] === undefined
}

/** Who claimed this item, or null. `value` is a faction id or a slot number. */
export function draftClaimant(doc: SetupDoc, list: DraftList, value: string | number): string | null {
  const map: Record<string, string | number> =
    list === 'faction' ? doc.factions
    : list === 'troops' ? (doc.troops ?? {})
    : list === 'coins' ? (doc.coins ?? {})
    : (doc.orderSlots ?? {})
  for (const [pid, v] of Object.entries(map)) if (v === value) return pid
  return null
}

/**
 * The turn order the draft produced: by claimed position, and — for a draft
 * abandoned half-finished — everyone else after them in dice order, so this
 * never returns a short list.
 */
export function draftedOrder(doc: SetupDoc): string[] {
  const order = doc.order ?? []
  const slots = doc.orderSlots ?? {}
  return [...order].sort((a, b) =>
    (slots[a] ?? 99) - (slots[b] ?? 99) || order.indexOf(a) - order.indexOf(b))
}

/**
 * The next player in dice order (cyclic) who still owes a claim, or null when
 * the draft is finished.
 */
function nextDraftPicker(doc: SetupDoc): number | null {
  const order = doc.order ?? []
  for (let step = 1; step <= order.length; step++) {
    const idx = (doc.turnIdx + step) % order.length
    if (draftPickCount(doc, order[idx]) < 4) return idx
  }
  return null
}

/** Hand the draft on, or close it and open the territory phase. */
function advanceDraft(doc: SetupDoc): SetupDoc {
  const idx = nextDraftPicker(doc)
  if (idx !== null) return { ...doc, phase: 'draft', turnIdx: idx }
  // Done: the drafted positions BECOME the turn order, and territories are
  // taken in it — same as the hotseat board, which sorts by claimed slot and
  // then walks that list.
  return { ...doc, order: draftedOrder(doc), phase: 'territory', turnIdx: 0 }
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
    case 'draft': {
      // "list:value" — one string on the wire, so a draft claim travels as any
      // other pick does.
      const sep = value.indexOf(':')
      if (sep < 0) return doc
      const list = value.slice(0, sep) as DraftList
      const raw = value.slice(sep + 1)
      if (!DRAFT_LISTS.includes(list)) return doc
      if (!draftListOpen(doc, playerId, list)) return doc   // one item per list

      if (list === 'faction') {
        if (!ctx.availableFactions.includes(raw)) return doc
        if (draftClaimant(doc, 'faction', raw)) return doc
        const next = { ...doc, factions: { ...doc.factions, [playerId]: raw } }
        // A faction that owes a weakness power stops the draft on this player
        // until they have chosen one — the hotseat board does the same, and
        // the choice belongs to whoever just took the faction.
        if (ctx.needsWeakness(raw)) return { ...next, phase: 'weakness' as const }
        return advanceDraft(next)
      }

      const slot = Number(raw)
      if (!Number.isInteger(slot)) return doc
      const n = doc.order.length
      // Troops and coins are claimed by SLOT INDEX; turn order by 1-based
      // position, which is what the board shows and what sorts the order.
      const inRange = list === 'order' ? slot >= 1 && slot <= n : slot >= 0 && slot < n
      if (!inRange) return doc
      if (draftClaimant(doc, list, slot)) return doc

      const key = list === 'troops' ? 'troops' : list === 'coins' ? 'coins' : 'orderSlots'
      return advanceDraft({ ...doc, [key]: { ...(doc[key] ?? {}), [playerId]: slot } })
    }
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
      const next = { ...doc, weaknesses: { ...doc.weaknesses, [factionId]: value } }
      // In a draft the weakness was an interruption of this player's claim —
      // the draft resumes with the next picker, not with the faction phase.
      return ctx.draft ? advanceDraft(next) : afterFactionStage(next, ctx)
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
  // 32: a five-player draft is twenty claims, and one ingest may legitimately
  // carry several of them.
  for (let guard = 0; guard < 32; guard++) {
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
