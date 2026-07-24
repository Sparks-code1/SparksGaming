import type { Territory, ContinentId } from '@/types/territory'

// Canvas dimensions match the Risk board image exactly: /public/Risk_board.svg.png
export const MAP_WIDTH  = 960
export const MAP_HEIGHT = 665

export const CONTINENT_COLORS: Record<ContinentId, number> = {
  'north-america': 0x9BBF30,
  'south-america': 0xCC3322,
  'europe':        0x44AACC,
  'africa':        0x8B6914,
  'asia':          0x44AA44,
  'australia':     0x8844CC,
  'alien-island':  0x00C8A0,
}

export const CONTINENT_BONUSES: Record<ContinentId, number> = {
  'north-america': 5,
  'south-america': 2,
  'europe':        5,
  'africa':        3,
  'asia':          7,
  'australia':     2,
  'alien-island':  0,
}

type TerritoryDef = Omit<Territory, 'occupyingPlayerId' | 'troops' | 'scars' | 'cities'> & {
  polygon: number[][]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Rectangle hit area: top-left (x1,y1) → bottom-right (x2,y2) */
function r(x1: number, y1: number, x2: number, y2: number): number[][] {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
}
function lbl(x: number, y: number) { return { labelX: x, labelY: y } }

// ─── Territory definitions ────────────────────────────────────────────────────
// All coordinates are pixel positions on the 960×665 Risk_board.svg.png image.
// polygon = rectangular hit area; labelX/Y = troop bubble center.

export const TERRITORY_DEFINITIONS: TerritoryDef[] = [

  // ── North America ───────────────────────────────────────────────────────
  {
    id: 'alaska', name: 'Alaska', continentId: 'north-america', shape: '',
    ...lbl(63, 112),
    polygon: r(18, 41, 128, 171),
    adjacentIds: ['northwest-territory', 'alberta', 'kamchatka'],
  },
  {
    id: 'northwest-territory', name: 'NW Territory', continentId: 'north-america', shape: '',
    ...lbl(185, 95),
    polygon: r(124, 64, 220, 144),
    adjacentIds: ['alaska', 'alberta', 'ontario', 'greenland'],
  },
  {
    id: 'greenland', name: 'Greenland', continentId: 'north-america', shape: '',
    ...lbl(333, 68),
    polygon: r(265, 10, 401, 126),
    adjacentIds: ['northwest-territory', 'ontario', 'quebec', 'iceland'],
  },
  {
    id: 'alberta', name: 'Alberta', continentId: 'north-america', shape: '',
    ...lbl(158, 162),
    // Top edge sits below NW Territory's bottom (144) — the old top of 95
    // buried the lower half of NW Territory's hit area
    polygon: r(76, 146, 226, 211),
    adjacentIds: ['alaska', 'northwest-territory', 'ontario', 'western-us'],
  },
  {
    id: 'ontario', name: 'Ontario', continentId: 'north-america', shape: '',
    ...lbl(214, 169),
    polygon: r(166, 129, 262, 209),
    adjacentIds: ['northwest-territory', 'alberta', 'greenland', 'quebec', 'western-us', 'eastern-us'],
  },
  {
    id: 'quebec', name: 'Quebec', continentId: 'north-america', shape: '',
    ...lbl(273, 169),
    polygon: r(233, 129, 313, 209),
    adjacentIds: ['greenland', 'ontario', 'eastern-us'],
  },
  {
    id: 'western-us', name: 'Western US', continentId: 'north-america', shape: '',
    ...lbl(157, 221),
    polygon: r(105, 181, 209, 261),
    adjacentIds: ['alberta', 'ontario', 'eastern-us', 'central-america'],
  },
  {
    id: 'eastern-us', name: 'Eastern US', continentId: 'north-america', shape: '',
    ...lbl(229, 242),
    polygon: r(181, 202, 277, 282),
    adjacentIds: ['ontario', 'quebec', 'western-us', 'central-america'],
  },
  {
    id: 'central-america', name: 'C. America', continentId: 'north-america', shape: '',
    ...lbl(157, 299),
    polygon: r(107, 267, 207, 331),
    adjacentIds: ['western-us', 'eastern-us', 'venezuela'],
  },

  // ── South America ───────────────────────────────────────────────────────
  {
    id: 'venezuela', name: 'Venezuela', continentId: 'south-america', shape: '',
    ...lbl(228, 361),
    polygon: r(176, 333, 280, 389),
    adjacentIds: ['central-america', 'brazil', 'peru'],
  },
  {
    id: 'peru', name: 'Peru', continentId: 'south-america', shape: '',
    ...lbl(221, 438),
    polygon: r(181, 393, 261, 483),
    adjacentIds: ['venezuela', 'brazil', 'argentina'],
  },
  {
    id: 'brazil', name: 'Brazil', continentId: 'south-america', shape: '',
    ...lbl(296, 418),
    polygon: r(234, 353, 358, 483),
    adjacentIds: ['venezuela', 'peru', 'argentina', 'north-africa'],
  },
  {
    id: 'argentina', name: 'Argentina', continentId: 'south-america', shape: '',
    ...lbl(253, 513),
    polygon: r(201, 465, 305, 561),
    adjacentIds: ['peru', 'brazil'],
  },

  // ── Europe ──────────────────────────────────────────────────────────────
  {
    id: 'iceland', name: 'Iceland', continentId: 'europe', shape: '',
    ...lbl(410, 133),
    polygon: r(366, 99, 454, 167),
    adjacentIds: ['greenland', 'great-britain', 'scandinavia'],
  },
  {
    id: 'great-britain', name: 'Gr. Britain', continentId: 'europe', shape: '',
    ...lbl(396, 202),
    polygon: r(368, 170, 424, 234),
    adjacentIds: ['iceland', 'scandinavia', 'northern-europe', 'western-europe'],
  },
  {
    id: 'scandinavia', name: 'Scandinavia', continentId: 'europe', shape: '',
    ...lbl(488, 121),
    polygon: r(448, 73, 528, 169),
    adjacentIds: ['iceland', 'great-britain', 'northern-europe', 'ukraine'],
  },
  {
    id: 'northern-europe', name: 'N. Europe', continentId: 'europe', shape: '',
    ...lbl(475, 220),
    polygon: r(427, 182, 523, 258),
    adjacentIds: ['great-britain', 'scandinavia', 'ukraine', 'southern-europe', 'western-europe'],
  },
  {
    id: 'western-europe', name: 'W. Europe', continentId: 'europe', shape: '',
    ...lbl(416, 284),
    polygon: r(388, 250, 444, 318),
    adjacentIds: ['great-britain', 'northern-europe', 'southern-europe', 'north-africa'],
  },
  {
    id: 'southern-europe', name: 'S. Europe', continentId: 'europe', shape: '',
    ...lbl(486, 267),
    polygon: r(434, 235, 538, 299),
    adjacentIds: ['northern-europe', 'ukraine', 'western-europe', 'north-africa', 'egypt', 'middle-east'],
  },
  {
    id: 'ukraine', name: 'Ukraine', continentId: 'europe', shape: '',
    ...lbl(568, 171),
    polygon: r(508, 83, 628, 259),
    adjacentIds: ['scandinavia', 'northern-europe', 'southern-europe', 'ural', 'afghanistan', 'middle-east'],
  },

  // ── Africa ──────────────────────────────────────────────────────────────
  {
    id: 'north-africa', name: 'North Africa', continentId: 'africa', shape: '',
    ...lbl(445, 389),
    polygon: r(349, 334, 541, 444),
    adjacentIds: ['western-europe', 'southern-europe', 'egypt', 'east-africa', 'congo', 'brazil'],
  },
  {
    id: 'egypt', name: 'Egypt', continentId: 'africa', shape: '',
    ...lbl(520, 378),
    polygon: r(490, 348, 562, 412),
    adjacentIds: ['southern-europe', 'north-africa', 'east-africa', 'middle-east'],
  },
  {
    id: 'east-africa', name: 'East Africa', continentId: 'africa', shape: '',
    ...lbl(574, 442),
    polygon: r(548, 365, 616, 535),
    adjacentIds: ['egypt', 'north-africa', 'congo', 'south-africa', 'madagascar', 'middle-east'],
  },
  {
    id: 'congo', name: 'Congo', continentId: 'africa', shape: '',
    ...lbl(514, 472),
    polygon: r(468, 420, 568, 532),
    adjacentIds: ['north-africa', 'east-africa', 'south-africa'],
  },
  {
    id: 'south-africa', name: 'South Africa', continentId: 'africa', shape: '',
    ...lbl(524, 545),
    polygon: r(452, 480, 596, 610),
    adjacentIds: ['congo', 'east-africa', 'madagascar'],
  },
  {
    id: 'madagascar', name: 'Madagascar', continentId: 'africa', shape: '',
    ...lbl(606, 558),
    polygon: r(578, 508, 634, 608),
    adjacentIds: ['south-africa', 'east-africa'],
  },

  // ── Asia ────────────────────────────────────────────────────────────────
  {
    id: 'ural', name: 'Ural', continentId: 'asia', shape: '',
    ...lbl(657, 151),
    // Right edge kept clear of Siberia's hit rect (Siberia starts at x=695)
    polygon: r(609, 71, 693, 231),
    adjacentIds: ['ukraine', 'siberia', 'afghanistan', 'china'],
  },
  {
    id: 'siberia', name: 'Siberia', continentId: 'asia', shape: '',
    ...lbl(701, 109),
    // Left edge kept clear of Ural's hit rect (Ural ends at x=693)
    polygon: r(695, 49, 753, 169),
    adjacentIds: ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china'],
  },
  {
    id: 'yakutsk', name: 'Yakutsk', continentId: 'asia', shape: '',
    ...lbl(782, 83),
    polygon: r(752, 28, 812, 138),
    adjacentIds: ['siberia', 'irkutsk', 'kamchatka'],
  },
  {
    id: 'kamchatka', name: 'Kamchatka', continentId: 'asia', shape: '',
    ...lbl(845, 98),
    polygon: r(801, 18, 889, 178),
    adjacentIds: ['yakutsk', 'irkutsk', 'mongolia', 'japan', 'alaska'],
  },
  {
    id: 'irkutsk', name: 'Irkutsk', continentId: 'asia', shape: '',
    ...lbl(770, 163),
    polygon: r(712, 126, 828, 200),
    adjacentIds: ['siberia', 'yakutsk', 'kamchatka', 'mongolia'],
  },
  {
    id: 'mongolia', name: 'Mongolia', continentId: 'asia', shape: '',
    ...lbl(782, 223),
    polygon: r(702, 195, 862, 251),
    adjacentIds: ['siberia', 'irkutsk', 'kamchatka', 'japan', 'china', 'afghanistan'],
  },
  {
    id: 'japan', name: 'Japan', continentId: 'asia', shape: '',
    ...lbl(876, 229),
    polygon: r(836, 186, 916, 272),
    adjacentIds: ['kamchatka', 'mongolia'],
  },
  {
    id: 'afghanistan', name: 'Afghanistan', continentId: 'asia', shape: '',
    ...lbl(648, 243),
    polygon: r(596, 198, 700, 288),
    adjacentIds: ['ukraine', 'ural', 'china', 'india', 'middle-east', 'mongolia'],
  },
  {
    id: 'china', name: 'China', continentId: 'asia', shape: '',
    ...lbl(758, 286),
    polygon: r(678, 246, 838, 326),
    adjacentIds: ['ural', 'siberia', 'mongolia', 'afghanistan', 'india', 'southeast-asia'],
  },
  {
    id: 'middle-east', name: 'Middle East', continentId: 'asia', shape: '',
    ...lbl(592, 331),
    polygon: r(530, 265, 645, 405),
    adjacentIds: ['southern-europe', 'ukraine', 'egypt', 'east-africa', 'afghanistan', 'india'],
  },
  {
    id: 'india', name: 'India', continentId: 'asia', shape: '',
    ...lbl(697, 336),
    polygon: r(670, 286, 725, 388),
    adjacentIds: ['afghanistan', 'china', 'middle-east', 'southeast-asia'],
  },
  {
    id: 'southeast-asia', name: 'SE Asia', continentId: 'asia', shape: '',
    ...lbl(773, 368),
    // Left edge kept clear of India's hit rect (India ends at x=725)
    polygon: r(727, 323, 863, 413),
    adjacentIds: ['china', 'india', 'indonesia'],
  },

  // ── Australia ───────────────────────────────────────────────────────────
  {
    id: 'indonesia', name: 'Indonesia', continentId: 'australia', shape: '',
    ...lbl(785, 464),
    polygon: r(713, 436, 857, 492),
    adjacentIds: ['southeast-asia', 'new-guinea', 'western-australia'],
  },
  {
    id: 'new-guinea', name: 'New Guinea', continentId: 'australia', shape: '',
    ...lbl(869, 442),
    polygon: r(821, 404, 917, 480),
    adjacentIds: ['indonesia', 'eastern-australia', 'western-australia'],
  },
  {
    id: 'western-australia', name: 'W. Australia', continentId: 'australia', shape: '',
    ...lbl(831, 551),
    polygon: r(771, 473, 891, 629),
    adjacentIds: ['indonesia', 'new-guinea', 'eastern-australia'],
  },
  {
    id: 'eastern-australia', name: 'E. Australia', continentId: 'australia', shape: '',
    ...lbl(907, 547),
    polygon: r(855, 469, 959, 625),
    adjacentIds: ['new-guinea', 'western-australia'],
  },

]

export function buildTerritory(
  def: TerritoryDef & { polygon: number[][] },
  overrides?: Partial<Territory>,
): Territory {
  return {
    id: def.id,
    name: def.name,
    continentId: def.continentId,
    shape: JSON.stringify(def.polygon),
    labelX: def.labelX,
    labelY: def.labelY,
    adjacentIds: def.adjacentIds,
    occupyingPlayerId: null,
    troops: 0,
    scars: [],
    cities: [],
    ...overrides,
  }
}