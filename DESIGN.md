# Risk Legacy Digital — Design Document

## Overview

A digital adaptation of Risk Legacy supporting 2–5 players across a 15-game campaign. The board, rules, and world evolve permanently between sessions via a **legacy state** persisted in Supabase. PixiJS renders the map canvas; React manages UI chrome (HUD, menus, card hand, dice).

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend framework | React 18 + TypeScript | Component model suits HUD overlays |
| Map rendering | PixiJS 7 (WebGL) | GPU-accelerated canvas for smooth territory animations |
| React↔Pixi bridge | `@pixi/react` | Lets us write Pixi display objects as JSX where convenient |
| Backend / DB | Supabase (Postgres + Realtime) | Multiplayer sync, auth, persistent campaign state |
| Build tool | Vite | Fast HMR during development |

---

## Core Game State Types

### `Territory` (`src/types/territory.ts`)

Represents a single map region. Persistent fields (scars, stickers, cities, renamed names) survive between games as part of `LegacyState`. Runtime fields (troops, occupying player) are reset each game.

```
Territory
├── id / name / continentId
├── shape (SVG path for PixiJS polygon)
├── labelX / labelY (troop count position)
├── adjacentIds[]  — borders + sea lanes
│
├── [runtime]
│   ├── occupyingPlayerId
│   └── troops
│
└── [legacy-owned]
    ├── scars: Scar[]         — ScarType enum, gameNumber applied
    ├── cities: City[]        — can be destroyed or hold an HQ sticker
    └── stickerId?            — one legacy sticker per territory
```

**ScarTypes:** `nuclear-fallout | fortified | rich-land | wasteland | biological`

---

### `Player` (`src/types/player.ts`)

One entry per seat per game. Links to a `Faction` and optionally a Supabase auth user. Tracks per-game hand + troop count and campaign-level win history.

---

### `Faction` (`src/types/faction.ts`)

The 6 printed factions: Enclave of the Bear, Imperial Balkania, Khan Industries, Saharan Republic, Die Mechaniker, Noble Vigil. Each has:
- A **starting power** (chosen at campaign start, then fixed)
- **Unlocked powers** accumulated from wins
- **HQ territories** (sticker placement, persists in legacy state)
- A `retired` flag (faction eliminated from campaign permanently)

---

### `Card` (`src/types/card.ts`)

A discriminated union of three card kinds:

```
Card = TerritoryCard | MissionCard | EventCard

TerritoryCard  — suit (soldiers/cavalry/artillery/wild) + linked territory
MissionCard    — reward troops on completion; removed from deck when done
EventCard      — some are removed after use (legacy)
```

Territory cards can gain a **bonus sticker** via legacy events, changing their trade-in value.

---

### `LegacyState` (`src/types/legacy.ts`)

The heart of the legacy system — the single source of truth for everything that permanently changes between games.

```
LegacyState
├── campaignId / currentGameNumber (1–15) / worldName
│
├── scars[]                   — ScarType applied to territory, game number
├── stickers[]                — placement target, game applied
├── destroyedCities[]         — city id, game, responsible player
├── renamedTerritories[]      — original + new name, who renamed it
├── continentBonusModifiers[] — delta on printed bonus, reason
├── unlockedContent[]         — sealed packets, rule sections, faction powers
├── removedCardIds[]          — cards torn up and gone forever
└── historyLog[]              — narrative entries written to the in-game book
```

---

### `GameState` (`src/types/game.ts`)

The per-session runtime state (reset each game, derived from `LegacyState` at game start).

```
GameState
├── id / campaignId / gameNumber
├── phase: GamePhase          — lobby → draft → reinforce → attack → fortify → end-turn → game-over
├── currentPlayerIndex / turnNumber
├── players[]
├── territories{}             — Record<id, Territory>
├── deck[] / discardPile[]
├── winnerId
├── legacySnapshot            — copy of LegacyState at game start
└── lastDiceRoll              — shown during attack resolution
```

---

## Database Schema (Supabase / Postgres)

```sql
campaigns       (id, world_name, current_game_number, created_at)
campaign_players(id, campaign_id, user_id, faction_id, wins)
legacy_state    (id, campaign_id, state jsonb, updated_at)   -- single JSONB blob
game_sessions   (id, campaign_id, game_number, state jsonb, winner_id, ended_at)
```

`legacy_state.state` stores the serialised `LegacyState` object. Supabase Realtime broadcasts row-level changes so all players see map updates live.

---

## PixiJS Rendering Architecture

```
PIXI.Application (GameBoard.tsx)
└── stage
    ├── MapLayer          — territory polygons, continent tints
    ├── ScarLayer         — scar overlays (fallout glow, fortification icon)
    ├── StickerLayer      — sticker sprites placed on territories
    ├── CityLayer         — city markers (intact / destroyed / HQ)
    ├── TroopLayer        — troop count labels per territory
    └── UILayer           — attack arrows, selection highlights
```

Territory shapes are stored as SVG path strings; a utility converts them to `PIXI.Graphics` polygon calls at load time.

---

## Legacy Event Flow

1. Game ends → winner declared → `game-over` phase.
2. UI walks players through the **legacy steps** in order:
   - Place/destroy city stickers
   - Apply scars to contested territories
   - Rename territories / the world
   - Open sealed packets if triggered
   - Remove cards torn up during the game
3. Updated `LegacyState` written to `legacy_state` in Supabase.
4. Next game loads and applies all accumulated legacy mutations before dealing cards.

---

## Future Work

- [ ] Full SVG territory map import and coordinate mapping
- [ ] Dice-roll animation in PixiJS
- [ ] Packet opening ceremony UI (seal / reveal animation)
- [ ] Campaign history "codex" view
- [ ] AI player for solo / bot-fill seats
- [ ] Mobile responsive layout
