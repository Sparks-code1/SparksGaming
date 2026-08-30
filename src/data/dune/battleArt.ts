/**
 * The battle backdrops: what exists, and which one a battle gets.
 *
 * THE MANIFEST IS THE LAW. Every file in public/dune-battle is named here by
 * somebody who looked at it and said which place it shows — battlearttest
 * holds this list and the folder to each other, so a picture cannot sit
 * there unclaimed and the app cannot point at one that is not there.
 *
 * THE HIERARCHY, most specific first:
 *   1. the FIGHTERS' OWN SCENE — <Territory>-<Faction> when that faction is
 *      in this battle, the aggressor's before the defender's
 *   2. the TERRITORY'S OWN ART — <Territory>, with numbered variants
 *      (<Territory>-2, -3 …) ALTERNATING between battles fought there, so a
 *      second fight in Arrakeen is not the first one replayed
 *   3. the GROUND ITSELF — Dune-Stronghold for strongholds, Dune-Sand and
 *      Dune-Rock for the open desert
 *
 * Null when nothing listed covers the place: the reveal simply draws its
 * plain frame, which is what it did before any art existed.
 */
import { DUNE_TERRITORIES } from './boardData'
import { factionById } from './factions'
import type { FactionId } from '@/types/Dune/Faction'

export const BATTLE_BACKDROPS = [
  'Arrakeen.jpg',
  'Arrakeen-Atreides.jpg',
  'Carthag.jpg',
  'Carthag-Harkonnen.jpg',
  'Dune-Rock.png',
  'Dune-Sand.png',
  'Dune-Stronghold.png',
] as const

/** `<stem>-<n>` parsed, or null for a plain name. */
const variantOf = (file: string) => {
  const m = /^(.+)-(\d+)\.(?:jpg|png)$/.exec(file)
  return m ? { place: m[1], n: Number(m[2]) } : null
}
const stemOf = (file: string) => file.replace(/\.(?:jpg|png)$/, '')

export function battleBackdrop(input: {
  territoryId: string
  /** The combatants, aggressor first — the order is the tiebreak. */
  factions: readonly FactionId[]
  /** Battles already fought in this territory this phase — the variant clock. */
  foughtHere?: number
  /** The list to resolve against; the manifest unless a test injects one. */
  from?: readonly string[]
}): string | null {
  const list = input.from ?? BATTLE_BACKDROPS
  const t = DUNE_TERRITORIES.find(x => x.id === input.territoryId)
  if (!t) return null

  // 1. the fighters' own scene
  for (const fa of input.factions) {
    const name = factionById(fa)?.name
    const hit = name && list.find(f => stemOf(f) === `${t.displayName}-${name}`)
    if (hit) return hit
  }

  // 2. the territory's own art, variants alternating per battle fought here
  const variants = list
    .filter(f => stemOf(f) === t.displayName || variantOf(f)?.place === t.displayName)
    .sort((a, b) => (variantOf(a)?.n ?? 1) - (variantOf(b)?.n ?? 1))
  if (variants.length > 0) {
    return variants[(input.foughtHere ?? 0) % variants.length]
  }

  // 3. the ground itself
  const ground = t.terrain === 'stronghold' ? 'Dune-Stronghold'
    : t.terrain === 'rock' ? 'Dune-Rock'
    : t.terrain === 'sand' ? 'Dune-Sand'
    : null
  return ground ? (list.find(f => stemOf(f) === ground) ?? null) : null
}
