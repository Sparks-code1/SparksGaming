// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/gameReducer.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact rules engine the client runs. The server MUST run the same
// bytes: a divergence here is two machines playing different games while both
// believe they agree.

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
    return { ok: false, reason: "\u2622 Only the Mutants can draft troops into the Fallout Zone" };
  }
  if (rules.isCautiousWeakness) {
    const placedInto = new Set(rules.placementHistory);
    if (!placedInto.has(territoryId) && placedInto.size >= 2) {
      return { ok: false, reason: "\u26A0 Cautious \u2014 you can only place recruited troops into 2 territories" };
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
function gameReducer(state, action, rng) {
  const only = (s) => ({ state: s, effects: [] });
  switch (action.type) {
    case "PLACE_REINFORCEMENT": {
      const t = state.territories[action.territoryId];
      if (!t) return only(state);
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
        }
      });
    }
    case "UNDO_PLACEMENT": {
      const t = state.territories[action.territoryId];
      if (!t) return only(state);
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: { ...t, troops: t.troops - 1 }
        }
      });
    }
    case "END_REINFORCE_PHASE": {
      if (state.phase !== "reinforce") return only(state);
      return only({ ...state, phase: "attack" });
    }
    case "END_ATTACK_PHASE": {
      if (state.phase !== "attack") return only(state);
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
      return only(state);
    case "CONFIRM_FORTIFY": {
      const src = state.territories[action.srcId];
      const dst = state.territories[action.dstId];
      if (!src || !dst) return only(state);
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
      const withEnd = {
        ...state,
        territories: { ...state.territories, ...action.endTerritories }
      };
      const { nextIdx, isNewRound } = computeTurnAdvance(withEnd);
      return only({
        ...withEnd,
        phase: "reinforce",
        currentPlayerIndex: nextIdx,
        turnNumber: isNewRound ? state.turnNumber + 1 : state.turnNumber
      });
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
    // Never MORE than the standard 3 attacker dice — only ever a restriction.
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
  const survivors = srcTroops - totalAtkLoss;
  return {
    ...a,
    totalAtkLoss: uncontested ? 0 : totalAtkLoss,
    totalDefLoss: uncontested ? 0 : totalDefLoss,
    captured,
    uncontested,
    troopsToAdvance: captured ? int(a.troopsToAdvance, 1, Math.max(1, survivors - 1)) : 0,
    entryCostTotal: int(a.entryCostTotal, 0, 12),
    defenderCloningBonus: int(a.defenderCloningBonus, 0, 12)
  };
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
  if (action.captured) {
    const moving = Math.max(1, action.troopsToAdvance);
    tgt.occupyingPlayerId = src.occupyingPlayerId;
    const survivors = troopsAfterEntry(moving, {
      total: action.entryCostTotal,
      parts: [],
      falloutHalf: action.entryCostFalloutHalf
    });
    if (survivors < 1) {
      console.warn(
        `[Combat] ${moving} troops cannot pay the ${action.entryCostTotal}-troop entry at ${action.tgtId} \u2014 capping at 1 survivor; the entry cost was not fully paid.`
      );
    }
    tgt.troops = Math.max(1, survivors);
    src.troops -= moving;
  } else {
    tgt.troops -= action.totalDefLoss;
    tgt.troops += action.defenderCloningBonus;
  }
  const territories = { ...state.territories, [action.srcId]: src, [action.tgtId]: tgt };
  let players = state.players;
  const effects = [];
  if (action.captured) {
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
  return { state: { ...state, territories, players }, effects };
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
  resolveCombat,
  singleDieBonus,
  singleDieDelta
};
