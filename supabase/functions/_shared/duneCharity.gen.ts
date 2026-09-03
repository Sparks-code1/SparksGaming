// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/charity.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact CHOAM charity the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/dune/charity.ts
var CHARITY_TOPS_UP_TO = 2;
var CHARITY_WINDOW_MS = 15e3;
var readSpice = (s) => {
  const v = s?.spice;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};
var ALWAYS_ELIGIBLE = "bene-gesserit";
function isEligibleForCharity(secrets, faction, mode, suppressed = false) {
  if (!suppressed && faction === ALWAYS_ELIGIBLE && mode === "advanced") return true;
  return readSpice(secrets) <= CHARITY_TOPS_UP_TO;
}
function charityGrant(secrets, faction, mode, suppressed = false) {
  if (!suppressed && faction === ALWAYS_ELIGIBLE && mode === "advanced") {
    return CHARITY_TOPS_UP_TO;
  }
  const spice = readSpice(secrets);
  return spice <= CHARITY_TOPS_UP_TO ? CHARITY_TOPS_UP_TO - spice : 0;
}
function applyCharity(secrets, faction, mode, suppressed = false) {
  const spice = readSpice(secrets);
  return {
    ...secrets ?? {},
    spice: spice + charityGrant(secrets, faction, mode, suppressed)
  };
}
function openCharityWindow(now, turn) {
  return { expiresAt: now + CHARITY_WINDOW_MS, claims: [], turn };
}
function refuseCharityOpen(window, phase, turn) {
  if (phase !== "CHOAM Charity") return "wrong-phase";
  if (window && window.turn === turn) return "already-opened";
  return null;
}
var charityWindowIsOpen = (w, now) => !!w && now < w.expiresAt;
function refuseCharityClaim(window, secrets, playerId, now, faction, mode) {
  if (!window) return "no-window";
  if (now >= window.expiresAt) return "window-closed";
  if (window.claims.includes(playerId)) return "already-claimed";
  if (!isEligibleForCharity(secrets, faction, mode)) return "not-eligible";
  return null;
}
function applyCharityClaim(window, secrets, playerId) {
  return {
    window: { ...window, claims: [...window.claims, playerId] },
    secrets: applyCharity(secrets),
    granted: charityGrant(secrets)
  };
}
export {
  CHARITY_TOPS_UP_TO,
  CHARITY_WINDOW_MS,
  applyCharity,
  applyCharityClaim,
  charityGrant,
  charityWindowIsOpen,
  isEligibleForCharity,
  openCharityWindow,
  readSpice,
  refuseCharityClaim,
  refuseCharityOpen
};
