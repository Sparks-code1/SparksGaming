/**
 * Sea-line route data for Risk Legacy.
 * A sea line is a printed dotted route on the board connecting territories across water.
 * The key is always sorted alphabetically: [a, b].sort().join('|')
 */

// All adjacencies that are sea routes (cross water rather than land borders)
const RAW_SEA_PAIRS: [string, string][] = [
  // Pacific — North America ↔ Asia
  ['alaska', 'kamchatka'],
  // North Atlantic — North America ↔ Europe
  ['greenland', 'iceland'],
  // South Atlantic — South America ↔ Africa
  ['brazil', 'north-africa'],
  // Mediterranean — Europe ↔ Africa
  ['western-europe', 'north-africa'],
  // Red Sea — Africa ↔ Asia
  ['east-africa', 'middle-east'],
  // Indian Ocean — Asia ↔ Australia
  ['southeast-asia', 'indonesia'],
  // Sea of Japan / Pacific — Japan island connections
  ['kamchatka', 'japan'],
  ['mongolia', 'japan'],
  // North Atlantic — Iceland island connections
  ['iceland', 'great-britain'],
  ['iceland', 'scandinavia'],
  // South Pacific — Australia cluster sea links
  ['indonesia', 'new-guinea'],
  ['indonesia', 'western-australia'],
]

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

export const SEA_LINE_SET: Set<string> = new Set(
  RAW_SEA_PAIRS.map(([a, b]) => pairKey(a, b)),
)

/** Returns true if the adjacency between two territories is a sea route. */
export function isSeaLine(a: string, b: string): boolean {
  return SEA_LINE_SET.has(pairKey(a, b))
}

/** Register campaign-placed sea lines (Island Empire reward) so isSeaLine
 *  treats them as sea routes — call on load and whenever a new line is drawn. */
export function registerCustomSeaLines(pairs: Array<[string, string]> | undefined | null) {
  for (const [a, b] of pairs ?? []) SEA_LINE_SET.add(pairKey(a, b))
}

/**
 * The board's island territories (official campaign list). Alien Island
 * counts too — it only exists as a territory once the milestone places it,
 * so including its id here is harmless before that.
 */
export const ISLAND_TERRITORY_IDS: Set<string> = new Set([
  'indonesia',
  'new-guinea',
  'japan',
  'madagascar',
  'greenland',
  'iceland',
  'great-britain',
  'alien-island',
])
