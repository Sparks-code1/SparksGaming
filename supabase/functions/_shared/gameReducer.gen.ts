// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/gameReducer.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact rules engine the client runs. The server MUST run the same
// bytes: a divergence here is two machines playing different games while both
// believe they agree.

// src/types/game.ts
function initialTurnState() {
  return {
    captured: false,
    captureCount: 0,
    conqueredIds: [],
    conqueredViaSeaIds: [],
    bearTrapTerritoryId: null,
    attackedTerritoryIds: [],
    shieldedTerritoryIds: [],
    placedThisTurn: {},
    expandedIntoCity: false,
    richCardsTradedIn: 0,
    resourcesTradedIn: 0,
    knockedOutRichPlayer: false,
    continentsAtTurnStart: 0,
    eligibleForRichCard: false,
    richCardTerritoryIds: []
  };
}

// src/data/territoryData.ts
function r(x1, y1, x2, y2) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}
function lbl(x, y) {
  return { labelX: x, labelY: y };
}
var TERRITORY_DEFINITIONS = [
  // ── North America ───────────────────────────────────────────────────────
  {
    id: "alaska",
    name: "Alaska",
    continentId: "north-america",
    shape: "",
    ...lbl(63, 112),
    polygon: r(18, 41, 128, 171),
    adjacentIds: ["northwest-territory", "alberta", "kamchatka"]
  },
  {
    id: "northwest-territory",
    name: "NW Territory",
    continentId: "north-america",
    shape: "",
    ...lbl(185, 95),
    polygon: r(124, 64, 220, 144),
    adjacentIds: ["alaska", "alberta", "ontario", "greenland"]
  },
  {
    id: "greenland",
    name: "Greenland",
    continentId: "north-america",
    shape: "",
    ...lbl(333, 68),
    polygon: r(265, 10, 401, 126),
    adjacentIds: ["northwest-territory", "ontario", "quebec", "iceland"]
  },
  {
    id: "alberta",
    name: "Alberta",
    continentId: "north-america",
    shape: "",
    ...lbl(158, 162),
    // Top edge sits below NW Territory's bottom (144) — the old top of 95
    // buried the lower half of NW Territory's hit area
    polygon: r(76, 146, 226, 211),
    adjacentIds: ["alaska", "northwest-territory", "ontario", "western-us"]
  },
  {
    id: "ontario",
    name: "Ontario",
    continentId: "north-america",
    shape: "",
    ...lbl(214, 169),
    polygon: r(166, 129, 262, 209),
    adjacentIds: ["northwest-territory", "alberta", "greenland", "quebec", "western-us", "eastern-us"]
  },
  {
    id: "quebec",
    name: "Quebec",
    continentId: "north-america",
    shape: "",
    ...lbl(273, 169),
    polygon: r(233, 129, 313, 209),
    adjacentIds: ["greenland", "ontario", "eastern-us"]
  },
  {
    id: "western-us",
    name: "Western US",
    continentId: "north-america",
    shape: "",
    ...lbl(157, 221),
    polygon: r(105, 181, 209, 261),
    adjacentIds: ["alberta", "ontario", "eastern-us", "central-america"]
  },
  {
    id: "eastern-us",
    name: "Eastern US",
    continentId: "north-america",
    shape: "",
    ...lbl(229, 242),
    polygon: r(181, 202, 277, 282),
    adjacentIds: ["ontario", "quebec", "western-us", "central-america"]
  },
  {
    id: "central-america",
    name: "C. America",
    continentId: "north-america",
    shape: "",
    ...lbl(157, 299),
    polygon: r(107, 267, 207, 331),
    adjacentIds: ["western-us", "eastern-us", "venezuela"]
  },
  // ── South America ───────────────────────────────────────────────────────
  {
    id: "venezuela",
    name: "Venezuela",
    continentId: "south-america",
    shape: "",
    ...lbl(228, 361),
    polygon: r(176, 333, 280, 389),
    adjacentIds: ["central-america", "brazil", "peru"]
  },
  {
    id: "peru",
    name: "Peru",
    continentId: "south-america",
    shape: "",
    ...lbl(221, 438),
    polygon: r(181, 393, 261, 483),
    adjacentIds: ["venezuela", "brazil", "argentina"]
  },
  {
    id: "brazil",
    name: "Brazil",
    continentId: "south-america",
    shape: "",
    ...lbl(296, 418),
    polygon: r(234, 353, 358, 483),
    adjacentIds: ["venezuela", "peru", "argentina", "north-africa"]
  },
  {
    id: "argentina",
    name: "Argentina",
    continentId: "south-america",
    shape: "",
    ...lbl(253, 513),
    polygon: r(201, 465, 305, 561),
    adjacentIds: ["peru", "brazil"]
  },
  // ── Europe ──────────────────────────────────────────────────────────────
  {
    id: "iceland",
    name: "Iceland",
    continentId: "europe",
    shape: "",
    ...lbl(410, 133),
    polygon: r(366, 99, 454, 167),
    adjacentIds: ["greenland", "great-britain", "scandinavia"]
  },
  {
    id: "great-britain",
    name: "Gr. Britain",
    continentId: "europe",
    shape: "",
    ...lbl(396, 202),
    polygon: r(368, 170, 424, 234),
    adjacentIds: ["iceland", "scandinavia", "northern-europe", "western-europe"]
  },
  {
    id: "scandinavia",
    name: "Scandinavia",
    continentId: "europe",
    shape: "",
    ...lbl(488, 121),
    polygon: r(448, 73, 528, 169),
    adjacentIds: ["iceland", "great-britain", "northern-europe", "ukraine"]
  },
  {
    id: "northern-europe",
    name: "N. Europe",
    continentId: "europe",
    shape: "",
    ...lbl(475, 220),
    polygon: r(427, 182, 523, 258),
    adjacentIds: ["great-britain", "scandinavia", "ukraine", "southern-europe", "western-europe"]
  },
  {
    id: "western-europe",
    name: "W. Europe",
    continentId: "europe",
    shape: "",
    ...lbl(416, 284),
    polygon: r(388, 250, 444, 318),
    adjacentIds: ["great-britain", "northern-europe", "southern-europe", "north-africa"]
  },
  {
    id: "southern-europe",
    name: "S. Europe",
    continentId: "europe",
    shape: "",
    ...lbl(486, 267),
    polygon: r(434, 235, 538, 299),
    adjacentIds: ["northern-europe", "ukraine", "western-europe", "north-africa", "egypt", "middle-east"]
  },
  {
    id: "ukraine",
    name: "Ukraine",
    continentId: "europe",
    shape: "",
    ...lbl(568, 171),
    polygon: r(508, 83, 628, 259),
    adjacentIds: ["scandinavia", "northern-europe", "southern-europe", "ural", "afghanistan", "middle-east"]
  },
  // ── Africa ──────────────────────────────────────────────────────────────
  {
    id: "north-africa",
    name: "North Africa",
    continentId: "africa",
    shape: "",
    ...lbl(445, 389),
    polygon: r(349, 334, 541, 444),
    adjacentIds: ["western-europe", "southern-europe", "egypt", "east-africa", "congo", "brazil"]
  },
  {
    id: "egypt",
    name: "Egypt",
    continentId: "africa",
    shape: "",
    ...lbl(520, 378),
    polygon: r(490, 348, 562, 412),
    adjacentIds: ["southern-europe", "north-africa", "east-africa", "middle-east"]
  },
  {
    id: "east-africa",
    name: "East Africa",
    continentId: "africa",
    shape: "",
    ...lbl(574, 442),
    polygon: r(548, 365, 616, 535),
    adjacentIds: ["egypt", "north-africa", "congo", "south-africa", "madagascar", "middle-east"]
  },
  {
    id: "congo",
    name: "Congo",
    continentId: "africa",
    shape: "",
    ...lbl(514, 472),
    polygon: r(468, 420, 568, 532),
    adjacentIds: ["north-africa", "east-africa", "south-africa"]
  },
  {
    id: "south-africa",
    name: "South Africa",
    continentId: "africa",
    shape: "",
    ...lbl(524, 545),
    polygon: r(452, 480, 596, 610),
    adjacentIds: ["congo", "east-africa", "madagascar"]
  },
  {
    id: "madagascar",
    name: "Madagascar",
    continentId: "africa",
    shape: "",
    ...lbl(606, 558),
    polygon: r(578, 508, 634, 608),
    adjacentIds: ["south-africa", "east-africa"]
  },
  // ── Asia ────────────────────────────────────────────────────────────────
  {
    id: "ural",
    name: "Ural",
    continentId: "asia",
    shape: "",
    ...lbl(657, 151),
    // Right edge kept clear of Siberia's hit rect (Siberia starts at x=695)
    polygon: r(609, 71, 693, 231),
    adjacentIds: ["ukraine", "siberia", "afghanistan", "china"]
  },
  {
    id: "siberia",
    name: "Siberia",
    continentId: "asia",
    shape: "",
    ...lbl(701, 109),
    // Left edge kept clear of Ural's hit rect (Ural ends at x=693)
    polygon: r(695, 49, 753, 169),
    adjacentIds: ["ural", "yakutsk", "irkutsk", "mongolia", "china"]
  },
  {
    id: "yakutsk",
    name: "Yakutsk",
    continentId: "asia",
    shape: "",
    ...lbl(782, 83),
    polygon: r(752, 28, 812, 138),
    adjacentIds: ["siberia", "irkutsk", "kamchatka"]
  },
  {
    id: "kamchatka",
    name: "Kamchatka",
    continentId: "asia",
    shape: "",
    ...lbl(845, 98),
    polygon: r(801, 18, 889, 178),
    adjacentIds: ["yakutsk", "irkutsk", "mongolia", "japan", "alaska"]
  },
  {
    id: "irkutsk",
    name: "Irkutsk",
    continentId: "asia",
    shape: "",
    ...lbl(770, 163),
    polygon: r(712, 126, 828, 200),
    adjacentIds: ["siberia", "yakutsk", "kamchatka", "mongolia"]
  },
  {
    id: "mongolia",
    name: "Mongolia",
    continentId: "asia",
    shape: "",
    ...lbl(782, 223),
    polygon: r(702, 195, 862, 251),
    adjacentIds: ["siberia", "irkutsk", "kamchatka", "japan", "china", "afghanistan"]
  },
  {
    id: "japan",
    name: "Japan",
    continentId: "asia",
    shape: "",
    ...lbl(876, 229),
    polygon: r(836, 186, 916, 272),
    adjacentIds: ["kamchatka", "mongolia"]
  },
  {
    id: "afghanistan",
    name: "Afghanistan",
    continentId: "asia",
    shape: "",
    ...lbl(648, 243),
    polygon: r(596, 198, 700, 288),
    adjacentIds: ["ukraine", "ural", "china", "india", "middle-east", "mongolia"]
  },
  {
    id: "china",
    name: "China",
    continentId: "asia",
    shape: "",
    ...lbl(758, 286),
    polygon: r(678, 246, 838, 326),
    adjacentIds: ["ural", "siberia", "mongolia", "afghanistan", "india", "southeast-asia"]
  },
  {
    id: "middle-east",
    name: "Middle East",
    continentId: "asia",
    shape: "",
    ...lbl(592, 331),
    polygon: r(530, 265, 645, 405),
    adjacentIds: ["southern-europe", "ukraine", "egypt", "east-africa", "afghanistan", "india"]
  },
  {
    id: "india",
    name: "India",
    continentId: "asia",
    shape: "",
    ...lbl(697, 336),
    polygon: r(670, 286, 725, 388),
    adjacentIds: ["afghanistan", "china", "middle-east", "southeast-asia"]
  },
  {
    id: "southeast-asia",
    name: "SE Asia",
    continentId: "asia",
    shape: "",
    ...lbl(773, 368),
    // Left edge kept clear of India's hit rect (India ends at x=725)
    polygon: r(727, 323, 863, 413),
    adjacentIds: ["china", "india", "indonesia"]
  },
  // ── Australia ───────────────────────────────────────────────────────────
  {
    id: "indonesia",
    name: "Indonesia",
    continentId: "australia",
    shape: "",
    ...lbl(785, 464),
    polygon: r(713, 436, 857, 492),
    adjacentIds: ["southeast-asia", "new-guinea", "western-australia"]
  },
  {
    id: "new-guinea",
    name: "New Guinea",
    continentId: "australia",
    shape: "",
    ...lbl(869, 442),
    polygon: r(821, 404, 917, 480),
    adjacentIds: ["indonesia", "eastern-australia", "western-australia"]
  },
  {
    id: "western-australia",
    name: "W. Australia",
    continentId: "australia",
    shape: "",
    ...lbl(831, 551),
    polygon: r(771, 473, 891, 629),
    adjacentIds: ["indonesia", "new-guinea", "eastern-australia"]
  },
  {
    id: "eastern-australia",
    name: "E. Australia",
    continentId: "australia",
    shape: "",
    ...lbl(907, 547),
    polygon: r(855, 469, 959, 625),
    adjacentIds: ["new-guinea", "western-australia"]
  }
];

// src/lib/gameLogic.ts
var CONTINENT_SIZES = TERRITORY_DEFINITIONS.reduce(
  (acc, d) => ({ ...acc, [d.continentId]: (acc[d.continentId] ?? 0) + 1 }),
  {}
);
function continentsHeldInFull(playerId, territories) {
  const counts = {};
  for (const t of Object.values(territories)) {
    if (t.occupyingPlayerId !== playerId) continue;
    counts[t.continentId] = (counts[t.continentId] ?? 0) + 1;
  }
  return Object.entries(counts).filter(([cId, n]) => n >= (CONTINENT_SIZES[cId] ?? Infinity)).map(([cId]) => cId);
}
function applyCustomSeaLines(territories, pairs) {
  let result = territories;
  for (const [a, b] of pairs ?? []) {
    const ta = result[a];
    const tb = result[b];
    if (!ta || !tb) continue;
    if (!ta.adjacentIds.includes(b)) {
      result = { ...result, [a]: { ...ta, adjacentIds: [...ta.adjacentIds, b] } };
    }
    if (!result[b].adjacentIds.includes(a)) {
      result = { ...result, [b]: { ...result[b], adjacentIds: [...result[b].adjacentIds, a] } };
    }
  }
  return result;
}
var ALIEN_ISLAND_TERRITORY_ID = "alien-island";
function injectAlienIslandTerritory(territories, island) {
  if (!island) return territories;
  const result = { ...territories };
  if (!result[ALIEN_ISLAND_TERRITORY_ID]) {
    const r2 = 22;
    const poly = Array.from({ length: 8 }, (_, i) => {
      const a = Math.PI / 4 * i + Math.PI / 8;
      return [Math.round(island.x + r2 * Math.cos(a)), Math.round(island.y + r2 * Math.sin(a))];
    });
    result[ALIEN_ISLAND_TERRITORY_ID] = {
      id: ALIEN_ISLAND_TERRITORY_ID,
      name: "Alien Island",
      continentId: "alien-island",
      shape: JSON.stringify(poly),
      labelX: island.x,
      labelY: island.y,
      adjacentIds: [...island.connectedTerritoryIds],
      occupyingPlayerId: null,
      troops: 0,
      scars: [],
      cities: []
    };
  }
  for (const cid of island.connectedTerritoryIds) {
    const t = result[cid];
    if (t && !t.adjacentIds.includes(ALIEN_ISLAND_TERRITORY_ID)) {
      result[cid] = { ...t, adjacentIds: [...t.adjacentIds, ALIEN_ISLAND_TERRITORY_ID] };
    }
  }
  return result;
}
function controlledHqTerritoryIds(playerId, territories) {
  return Object.values(territories).filter((t) => t.occupyingPlayerId === playerId && !!t.activeHqPlayerId).map((t) => t.id);
}
function applyHqReserveTroops(territories, playerId, ability) {
  if (ability !== "khan-hq-troops") return { territories, grantedTerritoryIds: [] };
  const ids = controlledHqTerritoryIds(playerId, territories);
  if (ids.length === 0) return { territories, grantedTerritoryIds: [] };
  const next = { ...territories };
  for (const id of ids) next[id] = { ...next[id], troops: next[id].troops + 1 };
  return { territories: next, grantedTerritoryIds: ids };
}
function legalJoinWarTerritoryIds(territories, hqTerritoryIds, falloutZoneTerritoryId) {
  const blocked = new Set(hqTerritoryIds);
  for (const hqId of hqTerritoryIds) {
    for (const adj of territories[hqId]?.adjacentIds ?? []) blocked.add(adj);
  }
  return Object.values(territories).filter(
    (t) => !t.occupyingPlayerId && !(t.cities ?? []).some((c) => !c.isDestroyed) && !blocked.has(t.id) && !(falloutZoneTerritoryId && t.id === falloutZoneTerritoryId)
  ).map((t) => t.id);
}
function troopsAfterEntry(moving, cost) {
  const survivors = moving - (cost?.total ?? 0);
  if (survivors < 1) return 0;
  return cost?.falloutHalf ? Math.ceil(survivors / 2) : survivors;
}

// src/lib/gameReducer.ts
function createMathRng() {
  const next = () => Math.random();
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    shuffle: (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  };
}
function createSeededRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    shuffle: (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  };
}
function checkReinforcementPlacement(state, territoryId, rules) {
  const t = state.territories[territoryId];
  if (!t) return { ok: false, reason: "No such territory" };
  if (territoryId === rules.falloutZoneTerritoryId && rules.playerFactionId !== "mutants") {
    return { ok: false, reason: "\xE2\u02DC\xA2 Only the Mutants can draft troops into the Fallout Zone" };
  }
  if (rules.isCautiousWeakness) {
    const placedInto = new Set(rules.placementHistory);
    if (!placedInto.has(territoryId) && placedInto.size >= 2) {
      return { ok: false, reason: "\xE2\u0161\xA0 Cautious \xE2\u20AC\u201D you can only place recruited troops into 2 territories" };
    }
  }
  return { ok: true };
}
function canStartAttack(state, srcId, tgtId, playerId) {
  const src = state.territories[srcId];
  const tgt = state.territories[tgtId];
  if (!src || !tgt) return false;
  return src.occupyingPlayerId === playerId && src.troops > 1 && src.adjacentIds.includes(tgtId) && tgt.occupyingPlayerId !== playerId;
}
function canStartFortify(state, srcId, playerId) {
  const src = state.territories[srcId];
  if (!src) return false;
  return src.occupyingPlayerId === playerId && src.troops > 1;
}
function skipEliminatedPlayer(state, idx) {
  const p = state.players[idx];
  if (!p?.isEliminated) return false;
  if (p.joinedWarThisGame !== void 0) return true;
  return legalJoinWarTerritoryIds(
    state.territories,
    Object.values(state.activeHqs ?? {}),
    state.legacySnapshot?.falloutZoneTerritoryId
  ).length === 0;
}
function computeTurnAdvance(state) {
  const n = state.players.length;
  let nextIdx = (state.currentPlayerIndex + 1) % n;
  let guard = 0;
  while (guard++ < n && nextIdx !== state.currentPlayerIndex && skipEliminatedPlayer(state, nextIdx)) {
    nextIdx = (nextIdx + 1) % n;
  }
  return { nextIdx, isNewRound: nextIdx <= state.currentPlayerIndex };
}
function applyEndOfTurnScarEffects(territories, endingPlayerId, endingIsMutant, falloutZoneId, mercenaryComeback = false) {
  const result = { ...territories };
  const vacatedNames = [];
  const ownedIds = Object.entries(result).filter(([, t]) => t.occupyingPlayerId === endingPlayerId).map(([id]) => id);
  let ownedCount = ownedIds.length;
  const applyLoss = (id, t) => {
    if (t.troops <= 1) {
      if (ownedCount > 1) {
        result[id] = { ...t, troops: 0, occupyingPlayerId: null };
        vacatedNames.push(t.name);
        ownedCount--;
      }
    } else {
      result[id] = { ...t, troops: t.troops - 1 };
    }
  };
  for (const id of ownedIds) {
    const t = result[id];
    const hasBio = t.scars.some((s) => s.type === "biological");
    const hasMerc = t.scars.some((s) => s.type === "mercenary");
    if (hasBio) {
      if (endingIsMutant) result[id] = { ...t, troops: t.troops + 1 };
      else applyLoss(id, t);
    } else if (hasMerc) {
      if (!endingIsMutant) result[id] = { ...t, troops: t.troops + (mercenaryComeback ? 2 : 1) };
      else applyLoss(id, t);
    }
  }
  if (falloutZoneId) {
    const fzT = result[falloutZoneId];
    if (fzT?.occupyingPlayerId === endingPlayerId) {
      if (endingIsMutant) result[falloutZoneId] = { ...fzT, troops: fzT.troops + 1 };
      else applyLoss(falloutZoneId, fzT);
    }
  }
  return { territories: result, vacatedNames };
}
function wrongActor(state, playerId) {
  return !!playerId && state.players[state.currentPlayerIndex]?.id !== playerId;
}
function gameReducer(state, action, rng) {
  const only = (s) => ({ state: s, effects: [] });
  switch (action.type) {
    case "PLACE_REINFORCEMENT": {
      const t = state.territories[action.territoryId];
      if (!t) return only(state);
      const placed = state.turn?.placedThisTurn ?? {};
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: {
            ...t,
            // Claim the territory if it was unoccupied (expand / stealthy drops);
            // for an already-owned territory this is a no-op.
            occupyingPlayerId: t.occupyingPlayerId ?? action.playerId,
            troops: t.troops + 1
          }
        },
        // On the record: this is what bounds UNDO_PLACEMENT below.
        turn: { ...state.turn, placedThisTurn: { ...placed, [action.territoryId]: (placed[action.territoryId] ?? 0) + 1 } }
      });
    }
    case "UNDO_PLACEMENT": {
      const t = state.territories[action.territoryId];
      if (!t) return only(state);
      const placed = state.turn?.placedThisTurn ?? {};
      const onRecord = placed[action.territoryId] ?? 0;
      if (state.phase !== "reinforce" || onRecord <= 0 || t.troops <= 1) return only(state);
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: { ...t, troops: t.troops - 1 }
        },
        turn: { ...state.turn, placedThisTurn: { ...placed, [action.territoryId]: onRecord - 1 } }
      });
    }
    case "END_REINFORCE_PHASE": {
      if (state.phase !== "reinforce") return only(state);
      if (wrongActor(state, action.playerId)) return only(state);
      return only({ ...state, phase: "attack" });
    }
    case "END_ATTACK_PHASE": {
      if (state.phase !== "attack") return only(state);
      if (wrongActor(state, action.playerId)) return only(state);
      return only({ ...state, phase: "fortify" });
    }
    case "DECLARE_ATTACK": {
      const src0 = state.territories[action.srcId];
      const tgt0 = state.territories[action.tgtId];
      if (!src0 || !tgt0) return only(state);
      if (!canStartAttack(state, action.srcId, action.tgtId, action.playerId)) return only(state);
      const outcome = resolveCombat(src0.troops, tgt0.troops, action.mods, rng);
      const result = applyCombatOutcome(state, {
        srcId: action.srcId,
        tgtId: action.tgtId,
        totalAtkLoss: outcome.totalAtkLoss,
        totalDefLoss: outcome.totalDefLoss,
        captured: outcome.captured,
        // Never advance more than survived. The client picks the number before
        // the dice exist, so it can legitimately exceed what is left.
        troopsToAdvance: Math.min(action.troopsToAdvance, Math.max(1, outcome.atkTroopsAfter - 1)),
        entryCostTotal: action.entryCostTotal,
        entryCostFalloutHalf: action.entryCostFalloutHalf,
        defenderCloningBonus: outcome.defDoublesRounds > 0 ? action.defenderCloningBonus : 0
      });
      return {
        state: result.state,
        effects: [{ kind: "combat-resolved", srcId: action.srcId, tgtId: action.tgtId, outcome }, ...result.effects]
      };
    }
    case "RESOLVE_COMBAT":
      return applyCombatOutcome(state, action);
    case "RETREAT":
      if (state.combat) return only({ ...state, combat: null });
      return only(state);
    case "OPEN_COMBAT_WINDOW": {
      const die = (v) => typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(6, Math.trunc(v))) : 1;
      const atkId = state.combat?.attackerId ?? state.territories[action.srcId]?.occupyingPlayerId ?? "";
      const defId = state.combat?.defenderId ?? state.territories[action.tgtId]?.occupyingPlayerId ?? "";
      return only({
        ...state,
        combatWindow: {
          roundKey: String(action.roundKey).slice(0, 80),
          srcId: action.srcId,
          tgtId: action.tgtId,
          atkDice: (Array.isArray(action.atkDice) ? action.atkDice : []).slice(0, 3).map(die),
          defDice: (Array.isArray(action.defDice) ? action.defDice : []).slice(0, 3).map(die),
          flips: [],
          claims: [],
          expiresAt: typeof action.expiresAt === "number" ? action.expiresAt : void 0,
          priority: missilePriority(state.players, atkId, defId)
        }
      });
    }
    case "SPECTATOR_MISSILE": {
      const w = state.combatWindow;
      if (!w || w.roundKey !== action.roundKey) return only(state);
      const dice = action.side === "atk" ? w.atkDice : w.defDice;
      if (action.dieIndex < 0 || action.dieIndex >= dice.length) return only(state);
      const claims = w.claims ?? [];
      if (claims.some((c) => c.side === action.side && c.dieIndex === action.dieIndex && c.playerId === action.playerId)) return only(state);
      const nextClaims = [...claims, {
        playerId: action.playerId,
        side: action.side,
        dieIndex: action.dieIndex
      }];
      const flipped = dice.map((d, i) => i === action.dieIndex ? 6 : d);
      const asked = typeof action.expiresAt === "number" ? action.expiresAt : 0;
      const ceiling = (w.expiresAt ?? asked) + MISSILE_WINDOW_MS;
      const expiresAt = Math.max(w.expiresAt ?? 0, Math.min(asked, ceiling));
      return {
        state: {
          ...state,
          combatWindow: {
            ...w,
            atkDice: action.side === "atk" ? flipped : w.atkDice,
            defDice: action.side === "def" ? flipped : w.defDice,
            claims: nextClaims,
            flips: resolveMissileClaims(nextClaims, w.priority),
            expiresAt: expiresAt || void 0
          }
        },
        effects: [{
          kind: "spectator-missile",
          roundKey: w.roundKey,
          playerId: action.playerId,
          side: action.side,
          dieIndex: action.dieIndex,
          srcId: w.srcId,
          tgtId: w.tgtId
        }]
      };
    }
    case "CLOSE_COMBAT_WINDOW": {
      const w = state.combatWindow;
      if (w && w.roundKey !== action.roundKey) return only(state);
      if (!w) return only({ ...state, combatWindow: null });
      const spends = { ...state.missileSpends ?? {} };
      for (const f of w.flips) spends[f.playerId] = (spends[f.playerId] ?? 0) + 1;
      return only({ ...state, combatWindow: null, missileSpends: spends });
    }
    case "DRAW_CARD": {
      const piles = state.cards;
      if (!piles) return only(state);
      const player = state.players.find((p) => p.id === action.playerId);
      if (!player) return only(state);
      if (action.source === "face-up") {
        const at = piles.sideboard.indexOf(action.cardId);
        if (at < 0) return only(state);
        const deck = [...piles.territoryDeck];
        const newSpot1Id = deck.length > 0 ? deck.shift() : null;
        const sideboard = [
          ...newSpot1Id ? [newSpot1Id] : [],
          ...piles.sideboard.filter((id) => id !== action.cardId)
        ];
        return {
          state: {
            ...state,
            cards: { ...piles, territoryDeck: deck, sideboard },
            players: state.players.map((p) => p.id === action.playerId ? { ...p, cards: [...p.cards, action.cardId] } : p)
          },
          effects: [{ kind: "card-drawn", playerId: action.playerId, cardId: action.cardId, source: "face-up", newSpot1Id }]
        };
      }
      if (!piles.resourceDeck.includes(action.cardId)) return only(state);
      return {
        state: {
          ...state,
          cards: { ...piles, resourceDeck: piles.resourceDeck.filter((id) => id !== action.cardId) },
          players: state.players.map((p) => p.id === action.playerId ? { ...p, cards: [...p.cards, action.cardId] } : p)
        },
        effects: [{ kind: "card-drawn", playerId: action.playerId, cardId: action.cardId, source: "coin", newSpot1Id: null }]
      };
    }
    case "APPLY_EVENT_TROOPS": {
      if (!Array.isArray(action.changes) || action.changes.length === 0) return only(state);
      const territories = { ...state.territories };
      const applied = [];
      for (const c of action.changes.slice(0, 12)) {
        const t = territories[c?.territoryId];
        if (!t) continue;
        const delta = typeof c.delta === "number" && Number.isFinite(c.delta) ? Math.max(-6, Math.min(6, Math.trunc(c.delta))) : 0;
        if (delta === 0) continue;
        const troops = Math.max(0, t.troops + delta);
        const settling = typeof c.occupyingPlayerId === "string" && !t.occupyingPlayerId && t.troops === 0 && delta > 0 && state.players.some((p) => p.id === c.occupyingPlayerId);
        territories[c.territoryId] = {
          ...t,
          troops,
          occupyingPlayerId: settling ? c.occupyingPlayerId : troops === 0 ? null : t.occupyingPlayerId
        };
        applied.push({ territoryId: c.territoryId, delta });
      }
      if (applied.length === 0) return only(state);
      return {
        state: { ...state, territories },
        effects: [{ kind: "event-troops", note: String(action.note ?? "").slice(0, 120), changes: applied }]
      };
    }
    case "MOVE_HQ": {
      const from = state.territories[action.fromId];
      const to = state.territories[action.toId];
      if (!from || !to) return only(state);
      if (from.activeHqPlayerId !== action.playerId) return only(state);
      if (to.activeHqPlayerId) return only(state);
      if (from.occupyingPlayerId !== action.playerId || to.occupyingPlayerId !== action.playerId) return only(state);
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.fromId]: { ...from, activeHqPlayerId: void 0 },
          [action.toId]: { ...to, activeHqPlayerId: action.playerId }
        },
        activeHqs: { ...state.activeHqs, [action.playerId]: action.toId }
      });
    }
    case "JOIN_WAR": {
      const player = state.players.find((p) => p.id === action.playerId);
      if (!player || !player.isEliminated || player.joinedWarThisGame !== void 0) return only(state);
      const legal = legalJoinWarTerritoryIds(
        state.territories,
        Object.values(state.activeHqs ?? {}),
        state.legacySnapshot?.falloutZoneTerritoryId
      );
      if (!legal.includes(action.territoryId)) return only(state);
      const t = state.territories[action.territoryId];
      return {
        state: {
          ...state,
          territories: {
            ...state.territories,
            // 3 troops on re-entry â€” the same number the component always used.
            [action.territoryId]: { ...t, occupyingPlayerId: action.playerId, troops: 3 }
          },
          players: state.players.map((p) => p.id === action.playerId ? { ...p, isEliminated: false, joinedWarThisGame: true } : p),
          // Rejoining IS the start of their turn.
          phase: "reinforce"
        },
        effects: [{ kind: "joined-war", playerId: action.playerId, territoryId: action.territoryId }]
      };
    }
    case "FORFEIT_WAR": {
      const player = state.players.find((p) => p.id === action.playerId);
      if (!player || !player.isEliminated || player.joinedWarThisGame !== void 0) return only(state);
      return only({
        ...state,
        players: state.players.map((p) => p.id === action.playerId ? { ...p, joinedWarThisGame: false } : p)
      });
    }
    case "END_GAME": {
      const winner = state.players.find((p) => p.id === action.winnerId);
      if (!winner || winner.isEliminated) return only(state);
      if (state.phase === "game-over") return only(state);
      return {
        state: {
          ...state,
          phase: "game-over",
          winnerId: action.winnerId,
          // Seed the shared ceremony: every machine renders the reward
          // progress and the continue gate from this one document.
          endGame: {
            winnerId: action.winnerId,
            condition: action.condition,
            rewardsDone: {},
            continues: {}
          }
        },
        effects: [{ kind: "game-ended", winnerId: action.winnerId, condition: action.condition }]
      };
    }
    case "ENDGAME_REWARDS_DONE": {
      const eg = state.endGame;
      if (!eg || !state.players.some((p) => p.id === action.playerId)) return only(state);
      if (eg.rewardsDone[action.playerId]) return only(state);
      return only({
        ...state,
        endGame: { ...eg, rewardsDone: { ...eg.rewardsDone, [action.playerId]: true } }
      });
    }
    case "ENDGAME_CONTINUE": {
      const eg = state.endGame;
      if (!eg || !state.players.some((p) => p.id === action.playerId)) return only(state);
      if (eg.continues[action.playerId]) return only(state);
      const choice = action.choice === "quit" ? "quit" : "continue";
      return only({
        ...state,
        endGame: { ...eg, continues: { ...eg.continues, [action.playerId]: choice } }
      });
    }
    case "PLACE_SEA_LINE": {
      if (action.a === action.b) return only(state);
      if (!state.territories[action.a] || !state.territories[action.b]) return only(state);
      return only({ ...state, territories: applyCustomSeaLines(state.territories, [[action.a, action.b]]) });
    }
    case "INJECT_ALIEN_ISLAND": {
      const island = action.island;
      if (!island || !Number.isFinite(island.x) || !Number.isFinite(island.y)) return only(state);
      const [c1, c2] = island.connectedTerritoryIds ?? [];
      if (!state.territories[c1] || !state.territories[c2] || c1 === c2) return only(state);
      return only({ ...state, territories: injectAlienIslandTerritory(state.territories, island) });
    }
    case "OBLITERATE_TERRITORY": {
      const t = state.territories[action.territoryId];
      if (!t) return only(state);
      const activeHqs = Object.fromEntries(
        Object.entries(state.activeHqs ?? {}).filter(([, tId]) => tId !== action.territoryId)
      );
      return only({
        ...state,
        activeHqs,
        territories: {
          ...state.territories,
          [action.territoryId]: {
            ...t,
            occupyingPlayerId: null,
            troops: 0,
            cities: [],
            activeHqPlayerId: void 0,
            scars: action.clearScars ? [] : t.scars
          }
        }
      });
    }
    case "DESTROY_CITIES": {
      const t = state.territories[action.territoryId];
      if (!t || !Array.isArray(action.cityIds)) return only(state);
      if (action.cityIds.length === 0 && !action.demolishHq) return only(state);
      const doomed = new Set(action.cityIds.slice(0, 4).map(String));
      const cities = (t.cities ?? []).map((c) => doomed.has(c.id) && !c.isDestroyed ? { ...c, isDestroyed: true, destroyedInGame: state.gameNumber } : c);
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: {
            ...t,
            cities,
            activeHqPlayerId: action.demolishHq ? void 0 : t.activeHqPlayerId
          }
        }
      });
    }
    case "COMBAT_OFFER": {
      const src = state.territories[action.srcId];
      const tgt = state.territories[action.tgtId];
      if (!src || !tgt) return only(state);
      if (src.occupyingPlayerId !== action.attackerId) return only(state);
      if (tgt.occupyingPlayerId !== action.defenderId) return only(state);
      if (action.attackerId === action.defenderId) return only(state);
      const combat = {
        key: String(action.key).slice(0, 80),
        srcId: action.srcId,
        tgtId: action.tgtId,
        attackerId: action.attackerId,
        defenderId: action.defenderId,
        defDiceMax: typeof action.defDiceMax === "number" && Number.isFinite(action.defDiceMax) ? Math.max(1, Math.min(3, Math.trunc(action.defDiceMax))) : 2,
        autoProposed: false,
        defenderAuto: null,
        round: 1,
        atkDice: null,
        defDice: null,
        emp: !!action.emp
      };
      return only({ ...state, combat });
    }
    case "COMBAT_PROPOSE_AUTO": {
      const c = state.combat;
      if (!c || c.key !== action.key) return only(state);
      return only({ ...state, combat: { ...c, autoProposed: true } });
    }
    case "COMBAT_SET_EMP": {
      const c = state.combat;
      if (!c || c.key !== action.key || c.emp) return only(state);
      return only({ ...state, combat: { ...c, emp: true } });
    }
    case "COMBAT_DEFENSE_CHOICE": {
      const c = state.combat;
      if (!c || c.key !== action.key) return only(state);
      if (c.defenderAuto !== null) return only(state);
      return only({ ...state, combat: { ...c, defenderAuto: !!action.accept } });
    }
    case "POST_COMBAT_DICE": {
      const c = state.combat;
      if (!c || c.key !== action.key || c.round !== action.round) return only(state);
      if (!Array.isArray(action.dice) || action.dice.length === 0) return only(state);
      const dice = action.dice.slice(0, 3).map((d) => typeof d === "number" && Number.isFinite(d) ? Math.max(1, Math.min(6, Math.trunc(d))) : 1);
      if (action.side === "atk") {
        if (c.atkDice) return only(state);
        return only({ ...state, combat: { ...c, atkDice: dice } });
      }
      if (c.defDice) return only(state);
      return only({
        ...state,
        combat: {
          ...c,
          defDice: dice,
          defDiceBy: action.by === "attacker-idle" ? "attacker-idle" : action.by === "ai" ? "ai" : "defender"
        }
      });
    }
    case "POST_COMBAT_MISSILES": {
      const c = state.combat;
      if (!c || c.key !== action.key || c.round !== action.round) return only(state);
      if (!c.atkDice || !c.defDice || c.missileFlips) return only(state);
      if (!Array.isArray(action.flips) || action.flips.length === 0) return only(state);
      const seen = /* @__PURE__ */ new Set();
      const flips = action.flips.slice(0, 5).filter((f) => {
        if (!f || f.side !== "atk" && f.side !== "def") return false;
        const len = f.side === "atk" ? c.atkDice.length : c.defDice.length;
        if (!Number.isInteger(f.dieIndex) || f.dieIndex < 0 || f.dieIndex >= len) return false;
        const id = `${f.side}${f.dieIndex}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }).map((f) => ({ side: f.side, dieIndex: f.dieIndex }));
      if (flips.length === 0) return only(state);
      return only({ ...state, combat: { ...c, missileFlips: flips } });
    }
    case "COMBAT_NEXT_ROUND": {
      const c = state.combat;
      if (!c || c.key !== action.key || c.round !== action.round) return only(state);
      return only({
        ...state,
        combat: { ...c, round: c.round + 1, atkDice: null, defDice: null, defDiceBy: void 0, missileFlips: void 0 }
      });
    }
    case "CLEAR_COMBAT":
      if (!state.combat) return only(state);
      return only({ ...state, combat: null });
    case "SEED_CARD_PILES": {
      if (state.cards) return only(state);
      const c = action.cards;
      if (!c || !Array.isArray(c.territoryDeck) || !Array.isArray(c.sideboard) || !Array.isArray(c.resourceDeck) || !Array.isArray(c.territoryDiscard)) return only(state);
      const clean = (a) => a.slice(0, 60).map(String);
      const hands = action.hands ?? {};
      return only({
        ...state,
        cards: {
          territoryDeck: clean(c.territoryDeck),
          sideboard: clean(c.sideboard),
          resourceDeck: clean(c.resourceDeck),
          territoryDiscard: clean(c.territoryDiscard)
        },
        players: state.players.map((p) => Array.isArray(hands[p.id]) ? { ...p, cards: clean(hands[p.id]) } : p)
      });
    }
    case "PLACE_SCAR": {
      const t = state.territories[action.territoryId];
      if (!t) return only(state);
      if ((t.scars?.length ?? 0) > 0) return only(state);
      const scarType = String(action.scarType).slice(0, 40);
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: {
            ...t,
            scars: [...t.scars, { type: scarType, appliedInGame: state.gameNumber }]
          }
        }
      });
    }
    case "TRADE_IN_CARDS": {
      const piles = state.cards;
      if (!piles) return only(state);
      const player = state.players.find((p) => p.id === action.playerId);
      if (!player) return only(state);
      const ids = [...new Set(action.cardIds)];
      if (ids.length === 0 || !ids.every((id) => player.cards.includes(id))) return only(state);
      const coins = ids.filter((id) => id.startsWith("resource-"));
      const territory = ids.filter((id) => !coins.includes(id));
      return {
        state: {
          ...state,
          cards: {
            ...piles,
            resourceDeck: [...piles.resourceDeck, ...coins],
            territoryDiscard: [...piles.territoryDiscard, ...territory]
          },
          players: state.players.map((p) => p.id === action.playerId ? { ...p, cards: p.cards.filter((id) => !ids.includes(id)) } : p)
        },
        effects: [{ kind: "cards-traded", playerId: action.playerId, cardIds: ids }]
      };
    }
    case "CONFIRM_FORTIFY": {
      const src = state.territories[action.srcId];
      const dst = state.territories[action.dstId];
      if (!src || !dst) return only(state);
      if (action.troopsRemoved < 0 || action.troopsArriving < 0 || src.troops - action.troopsRemoved < 1) return only(state);
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.srcId]: { ...src, troops: src.troops - action.troopsRemoved },
          [action.dstId]: { ...dst, troops: dst.troops + action.troopsArriving }
        }
      });
    }
    case "END_TURN": {
      if (wrongActor(state, action.playerId)) return only(state);
      const withEnd = {
        ...state,
        territories: { ...state.territories, ...action.endTerritories }
      };
      const { nextIdx, isNewRound } = computeTurnAdvance(withEnd);
      const nextPlayerId = withEnd.players[nextIdx]?.id ?? "";
      const reserve = (action.hqReservePlayerIds ?? []).includes(nextPlayerId) ? applyHqReserveTroops(withEnd.territories, nextPlayerId, "khan-hq-troops") : { territories: withEnd.territories, grantedTerritoryIds: [] };
      return {
        state: {
          ...withEnd,
          territories: reserve.territories,
          phase: "reinforce",
          currentPlayerIndex: nextIdx,
          turnNumber: isNewRound ? state.turnNumber + 1 : state.turnNumber,
          // A fresh turn for the incoming player. Without this the SERVER's
          // copy of `turn` was never reset (or set at all) â€” it served the
          // initial board's zeroes forever, and every echo overwrote the
          // client's own tracking with them mid-turn.
          turn: {
            ...initialTurnState(),
            // Wide Border is judged at the start of a turn: snapshot the
            // incoming player's whole-continent count off the end-of-turn board.
            continentsAtTurnStart: continentsHeldInFull(
              nextPlayerId,
              reserve.territories
            ).length
          },
          // Neither a missile window nor a battle session outlives the turn.
          combatWindow: null,
          combat: null
        },
        effects: reserve.grantedTerritoryIds.length > 0 ? [{ kind: "hq-reserve", playerId: nextPlayerId, territoryIds: reserve.grantedTerritoryIds }] : []
      };
    }
    default:
      return only(state);
  }
}
function endTurnTerritories(state, rules) {
  const endingPlayerId = state.players[state.currentPlayerIndex]?.id ?? "";
  return applyEndOfTurnScarEffects(
    state.territories,
    endingPlayerId,
    rules.endingIsMutant,
    rules.falloutZoneId,
    rules.mercenaryComeback ?? false
  ).territories;
}
function clampCombatModifiers(m) {
  const clamp = (v, lo, hi, dflt = 0) => typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : dflt;
  const override = m?.attackerMaxDiceOverride;
  return {
    // Never MORE than the standard 3 attacker dice â€” only ever a restriction.
    attackerMaxDiceOverride: typeof override === "number" ? clamp(override, 1, 3, 3) : void 0,
    attackerBonusAllDice: clamp(m?.attackerBonusAllDice, -5, 5),
    attackerSubtractLowest: !!m?.attackerSubtractLowest,
    tripleKillEnabled: !!m?.tripleKillEnabled,
    defenderDieBonus: m?.defenderDieBonus ? { highest: clamp(m.defenderDieBonus.highest, -5, 5), lowest: clamp(m.defenderDieBonus.lowest, -5, 5) } : void 0,
    defenderDieBonusSingle: typeof m?.defenderDieBonusSingle === "number" ? clamp(m.defenderDieBonusSingle, -5, 5) : void 0,
    // 2 base + at most 2 bonus dice; anything above that is not a rule.
    defenderBonusDiceCap: clamp(m?.defenderBonusDiceCap, 0, 2),
    nuclearFallout: !!m?.nuclearFallout,
    attackerSixesWin: !!m?.attackerSixesWin,
    attackerRerollOnes: !!m?.attackerRerollOnes
  };
}
function clampCombatResolution(state, a) {
  const int = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : lo;
  const src = state.territories[a.srcId];
  const tgt = state.territories[a.tgtId];
  const srcTroops = src?.troops ?? 0;
  const tgtTroops = tgt?.troops ?? 0;
  const totalAtkLoss = int(a.totalAtkLoss, 0, Math.max(0, srcTroops - 1));
  const totalDefLoss = int(a.totalDefLoss, 0, tgtTroops);
  const uncontested = !!a.uncontested;
  const captured = uncontested ? !!a.captured && !!tgt && tgtTroops === 0 && !tgt.occupyingPlayerId : !!a.captured && totalDefLoss >= tgtTroops && tgtTroops > 0;
  const boundedDefLoss = !uncontested && !captured ? Math.min(totalDefLoss, Math.max(0, tgtTroops - 1)) : totalDefLoss;
  const survivors = srcTroops - totalAtkLoss;
  const rounds = !uncontested && Array.isArray(a.rounds) ? a.rounds.slice(0, 40).flatMap((r2) => {
    const dice = (v) => Array.isArray(v) ? v.slice(0, 3).map((d) => int(d, 1, 6)) : [];
    const atkDice = dice(r2?.atkDice);
    const defDice = dice(r2?.defDice);
    if (atkDice.length === 0 || defDice.length === 0) return [];
    return [{ atkDice, defDice, aLoss: int(r2.aLoss, 0, 99), dLoss: int(r2.dLoss, 0, 99) }];
  }) : void 0;
  return {
    ...a,
    totalAtkLoss: uncontested ? 0 : totalAtkLoss,
    totalDefLoss: uncontested ? 0 : boundedDefLoss,
    captured,
    uncontested,
    // A capture moves at least one troop in — unless the source cannot spare
    // one, and then it moves none. Forcing the minimum to 1 in THAT case
    // emptied the source instead, leaving an owned 0-troop ghost behind; the
    // reducer reads 0 as "the ground was cleared but not taken".
    troopsToAdvance: captured ? survivors - 1 >= 1 ? int(a.troopsToAdvance, 1, survivors - 1) : 0 : 0,
    entryCostTotal: int(a.entryCostTotal, 0, 12),
    defenderCloningBonus: int(a.defenderCloningBonus, 0, 12),
    // Mission bookkeeping only, but untrusted input still gets a type: any
    // JSON value collapses to a plain boolean here.
    viaSea: !!a.viaSea,
    sealDefender: !!a.sealDefender,
    rounds
  };
}
var MISSILE_WINDOW_MS = 5e3;
function missilePriority(players, attackerId, defenderId) {
  const rank = { [attackerId]: 0, [defenderId]: 1 };
  const start = players.findIndex((p) => p.id === attackerId);
  let next = 2;
  for (let i = 1; i <= players.length; i++) {
    const p = players[(Math.max(0, start) + i) % players.length];
    if (!p || p.id === attackerId || p.id === defenderId) continue;
    if (rank[p.id] === void 0) rank[p.id] = next++;
  }
  return rank;
}
function resolveMissileClaims(claims, priority) {
  const best = /* @__PURE__ */ new Map();
  claims.forEach((c, at) => {
    const key = `${c.side}${c.dieIndex}`;
    const rank = priority?.[c.playerId] ?? Number.MAX_SAFE_INTEGER;
    const cur = best.get(key);
    if (!cur || rank < cur.rank) best.set(key, { claim: c, rank, at });
  });
  return [...best.values()].sort((a, b) => a.at - b.at).map((x) => x.claim);
}
function missilesCommittedBy(state, playerId) {
  const ledger = (state.missileSpends ?? {})[playerId] ?? 0;
  const pending = (state.combatWindow?.claims ?? []).filter((c) => c.playerId === playerId).length;
  return ledger + pending;
}
function spectatorMissileRefusal(state, action, spenderId, opts) {
  const w = state.combatWindow;
  if (!w || w.roundKey !== action.roundKey) return "window-closed";
  const dice = action.side === "atk" ? w.atkDice : w.defDice;
  if (!Number.isInteger(action.dieIndex) || action.dieIndex < 0 || action.dieIndex >= dice.length) return "bad-die";
  if ((w.claims ?? []).some((c) => c.side === action.side && c.dieIndex === action.dieIndex && c.playerId === spenderId)) return "die-taken";
  if (opts.legacyMissiles - missilesCommittedBy(state, spenderId) < 1) return "no-missiles";
  return null;
}
function applyCombatOutcome(state, action) {
  const only = (s) => ({ state: s, effects: [] });
  const src0 = state.territories[action.srcId];
  const tgt0 = state.territories[action.tgtId];
  if (!src0 || !tgt0) return only(state);
  const src = { ...src0 };
  const tgt = { ...tgt0 };
  const attackerId = src0.occupyingPlayerId ?? "";
  const defenderId = tgt0.occupyingPlayerId;
  const preHqPlayerId = tgt0.activeHqPlayerId;
  src.troops -= action.totalAtkLoss;
  const spare = src.troops - 1;
  const occupies = action.captured && spare >= 1;
  if (occupies) {
    const moving = Math.min(Math.max(1, action.troopsToAdvance), spare);
    tgt.occupyingPlayerId = src.occupyingPlayerId;
    const survivors = troopsAfterEntry(moving, {
      total: action.entryCostTotal,
      parts: [],
      falloutHalf: action.entryCostFalloutHalf
    });
    if (survivors < 1) {
      console.warn(
        `[Combat] ${moving} troops cannot pay the ${action.entryCostTotal}-troop entry at ${action.tgtId} \xE2\u20AC\u201D capping at 1 survivor; the entry cost was not fully paid.`
      );
    }
    tgt.troops = Math.max(1, survivors);
    src.troops -= moving;
  } else {
    tgt.troops -= action.totalDefLoss;
    tgt.troops += action.defenderCloningBonus;
    if (action.captured && tgt.troops < 1) tgt.troops = 1;
  }
  const territories = { ...state.territories, [action.srcId]: src, [action.tgtId]: tgt };
  let players = state.players;
  const effects = [];
  if (occupies) {
    if (preHqPlayerId && preHqPlayerId !== defenderId) {
      effects.push({ kind: "hq-captured", territoryId: action.tgtId, territoryName: tgt0.name, hqPlayerId: preHqPlayerId, byPlayerId: attackerId });
    }
    if (!action.uncontested) {
      effects.push({ kind: "territory-captured", territoryId: action.tgtId, fromPlayerId: defenderId, byPlayerId: attackerId, firstCaptureThisTurn: !state.turn.captured });
    }
    const eliminatedIds = players.filter((p) => !p.isEliminated && !Object.values(territories).some((t) => t.occupyingPlayerId === p.id)).map((p) => p.id);
    if (eliminatedIds.length > 0) {
      const capturedCards = players.filter((p) => eliminatedIds.includes(p.id)).flatMap((p) => p.cards);
      players = players.map((p) => {
        if (eliminatedIds.includes(p.id)) return { ...p, isEliminated: true, cards: [] };
        if (p.id === attackerId) return { ...p, cards: [...p.cards, ...capturedCards] };
        return p;
      });
      effects.push({ kind: "players-eliminated", playerIds: eliminatedIds, byPlayerId: attackerId, capturedCardIds: capturedCards });
    }
  }
  const t0 = state.turn;
  let turn = t0;
  if (action.uncontested) {
    if (occupies) {
      turn = {
        ...t0,
        // Uncontested advances count toward Balkania's Imperial Expansion.
        captureCount: t0.captureCount + 1,
        // Resourceful comeback power: the turn's expansion landed on a city.
        expandedIntoCity: t0.expandedIntoCity || (tgt0.cities ?? []).some((c) => !c.isDestroyed)
      };
    }
  } else {
    turn = {
      ...t0,
      // Blocks bunker/ammo-shortage scar placement on a fought-over territory.
      attackedTerritoryIds: t0.attackedTerritoryIds.includes(action.tgtId) ? t0.attackedTerritoryIds : [...t0.attackedTerritoryIds, action.tgtId],
      // Bear Trap locks onto the first territory attacked this turn.
      bearTrapTerritoryId: t0.bearTrapTerritoryId ?? action.tgtId,
      // Iron Shield: a defending double-6 seals the territory this turn.
      shieldedTerritoryIds: action.sealDefender && !t0.shieldedTerritoryIds.includes(action.tgtId) ? [...t0.shieldedTerritoryIds, action.tgtId] : t0.shieldedTerritoryIds,
      ...occupies ? {
        captured: true,
        captureCount: t0.captureCount + 1,
        conqueredIds: [...t0.conqueredIds, action.tgtId],
        conqueredViaSeaIds: action.viaSea ? [...t0.conqueredViaSeaIds, action.tgtId] : t0.conqueredViaSeaIds
      } : {}
    };
  }
  return { state: { ...state, territories, players, turn, combatWindow: null, combat: null }, effects };
}
function singleDieDelta(part) {
  const { highest, lowest } = part;
  if (highest !== void 0 && highest !== 0) return highest;
  return lowest ?? 0;
}
function singleDieBonus(parts) {
  return (parts ?? []).reduce((sum, p) => sum + singleDieDelta(p), 0);
}
var clampDie = (v) => Math.max(1, Math.min(6, v));
function applyDefenderDieBonus(dice, bonus, single) {
  if (dice.length === 0) return dice;
  const out = [...dice];
  if (out.length === 1) {
    out[0] = clampDie(out[0] + (single ?? bonus.highest));
  } else {
    out[0] = clampDie(out[0] + bonus.highest);
    out[out.length - 1] = clampDie(out[out.length - 1] + bonus.lowest);
  }
  return out;
}
function defenderDieSteps(rawDef, parts) {
  const delta = rawDef.map(() => 0);
  const snapshots = [];
  for (const part of parts) {
    if (rawDef.length === 0) break;
    if (rawDef.length === 1) {
      delta[0] += singleDieDelta(part);
    } else {
      delta[0] += part.highest ?? 0;
      delta[delta.length - 1] += part.lowest ?? 0;
    }
    snapshots.push(rawDef.map((d, i) => clampDie(d + delta[i])));
  }
  return snapshots;
}
function rollDie(rng, rerollOnes = false) {
  let v = rng.int(1, 6);
  while (rerollOnes && v === 1) v = rng.int(1, 6);
  return v;
}
function rollN(rng, n, rerollOnes = false) {
  return Array.from({ length: n }, () => rollDie(rng, rerollOnes)).sort((a, b) => b - a);
}
function hasDoubles(dice) {
  return dice.length >= 2 && new Set(dice).size < dice.length;
}
function compareRolls(atk, def, atkSixesWin = false) {
  const pairs = Math.min(atk.length, def.length);
  let aLoss = 0, dLoss = 0;
  for (let i = 0; i < pairs; i++) {
    if (atk[i] > def[i] || atkSixesWin && atk[i] === 6 && def[i] === 6) dLoss++;
    else aLoss++;
  }
  return { aLoss, dLoss };
}
function resolveCombat(atkTroopsStart, defTroopsStart, mods, rng) {
  const rounds = [];
  let atkTroops = atkTroopsStart;
  let defTroops = defTroopsStart;
  let totalAtkLoss = 0;
  let totalDefLoss = 0;
  let maxAtkDiceUsed = 0;
  let defDoublesRounds = 0;
  while (atkTroops > 1 && defTroops > 0) {
    const numAtk = Math.min(mods.attackerMaxDiceOverride ?? 3, Math.min(3, atkTroops - 1));
    const numDef = Math.min(2 + mods.defenderBonusDiceCap, Math.max(1, defTroops));
    maxAtkDiceUsed = Math.max(maxAtkDiceUsed, numAtk);
    const rawAtk = rollN(rng, numAtk, mods.attackerRerollOnes);
    let finalAtk = mods.attackerSubtractLowest && rawAtk.length > 0 ? (() => {
      const d = [...rawAtk].sort((a, b) => a - b);
      d[0] = Math.max(1, d[0] - 1);
      return d.sort((a, b) => b - a);
    })() : rawAtk;
    if (mods.attackerBonusAllDice !== 0) {
      finalAtk = finalAtk.map((d) => Math.max(1, Math.min(6, d + mods.attackerBonusAllDice)));
    }
    let rawDef = rollN(rng, numDef).sort((a, b) => b - a);
    if (hasDoubles(rawDef)) defDoublesRounds++;
    if (mods.defenderDieBonus) {
      rawDef = applyDefenderDieBonus(rawDef, mods.defenderDieBonus, mods.defenderDieBonusSingle);
    }
    const base = compareRolls(finalAtk, rawDef, mods.attackerSixesWin);
    const aLoss = base.aLoss + (mods.nuclearFallout ? 1 : 0);
    let dLoss = base.dLoss + (mods.nuclearFallout ? 1 : 0);
    const tripleKill = mods.tripleKillEnabled && finalAtk.length === 3 && finalAtk[0] === finalAtk[1] && finalAtk[1] === finalAtk[2] && base.dLoss > 0;
    if (tripleKill) dLoss = defTroops;
    const defDoubleMax = rawDef.length >= 2 && rawDef.every((d) => d === 6);
    rounds.push({ atkDice: finalAtk, defDice: rawDef, aLoss, dLoss, tripleKill, defDoubleMax });
    totalAtkLoss += aLoss;
    totalDefLoss += dLoss;
    atkTroops -= aLoss;
    defTroops -= dLoss;
    if (tripleKill || defTroops <= 0) break;
    if (atkTroops <= 1) break;
  }
  return {
    rounds,
    totalAtkLoss,
    totalDefLoss,
    captured: defTroops <= 0,
    atkTroopsAfter: Math.max(0, atkTroops),
    defTroopsAfter: Math.max(0, defTroops),
    maxAtkDiceUsed,
    defDoublesRounds
  };
}
export {
  MISSILE_WINDOW_MS,
  applyDefenderDieBonus,
  applyEndOfTurnScarEffects,
  canStartAttack,
  canStartFortify,
  checkReinforcementPlacement,
  clampCombatModifiers,
  clampCombatResolution,
  compareRolls,
  computeTurnAdvance,
  createMathRng,
  createSeededRng,
  defenderDieSteps,
  endTurnTerritories,
  gameReducer,
  hasDoubles,
  missilePriority,
  missilesCommittedBy,
  resolveCombat,
  resolveMissileClaims,
  singleDieBonus,
  singleDieDelta,
  spectatorMissileRefusal
};
