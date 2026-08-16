# Extracting a platform from Risk

The goal is a second game living in this application, reusing everything that
is not about Risk: the shell, accounts, campaigns, matches, rooms, join codes,
realtime sync, the server dispatch pattern, and the updater.

Written from the working code, not from a whiteboard. Everything named here
exists today; the work is moving it, not inventing it.

**Rule for the whole job: extract only what Risk actually uses.** No hooks for
games that do not exist yet. If a second game later needs something the
platform does not offer, that is the moment to widen it — with a real second
implementation to check the shape against.

---

## What is already game-agnostic

These need moving, not rewriting. They mention Risk in names and comments and
in almost nothing else.

| Today | Becomes |
|---|---|
| `lib/auth.ts` | `platform/auth.ts` — untouched |
| `lib/matchSync.ts` | `platform/sync.ts` — transport + poll + channel; already generic over the state it carries |
| `lib/lobby.ts` | `platform/room.ts` — seats, readiness, join codes, `setLobbyShape`, `closeOtherLobbies`. `reconcileSeats` is roster logic and goes with the campaign module |
| `lib/onlineMatch.ts` | `platform/match.ts` — create, adopt, seats-from-state, `isComputerSeat` |
| `lib/actionDispatch.ts` | `platform/dispatch.ts` — the POST + retry + optimistic-apply pattern |
| `electron/*`, `electron-updater` | `platform/desktop/*` — untouched |
| `components/AuthPanel`, `AccountMenu`, `JoinCodeCard`, `CampaignPicker`, `LobbyScreen`, `ConnectionStatus` | `platform/ui/*` |

`lib/legacyApi.ts` is the awkward one: it is half platform (campaign row CRUD,
the CAS-and-rebuild protocol, `saveGameSession`) and half Risk (scar metadata,
missile counts, `awardRedStars`). Split it:

- `platform/campaign.ts` — load/save with `legacy_version` CAS, the refusal +
  `reapply` protocol, `onLegacyOverwritten`, roster, join codes, session rows.
  **The rebuild protocol is the most valuable thing in this codebase and the
  easiest to break. Move it verbatim; do not "clean it up" in the same commit.**
- `games/risk/campaign.ts` — everything that knows what a scar or a red star is.

---

## The contract

One interface, derived from what `App.tsx` and `GameBoard.tsx` actually ask of
Risk today.

```ts
// platform/game.ts
export interface GameDefinition<State, Action, Campaign> {
  /** Stable id. Stored on campaigns.game and matches.game. */
  readonly id: string
  readonly name: string

  /** Pure, seeded, clock-free — the same contract the Risk reducer honours,
   *  because the server runs it too. */
  reducer(state: State, action: Action, rng: Rng): { state: State; effects: Effect[] }

  /** Which actions the server will run, and what it must rewrite before it
   *  does. Today this is SERVER_ACTIONS + sanitize() inside the edge
   *  function; it belongs to the game, not the platform. */
  readonly serverActions: ReadonlySet<string>
  sanitize(action: Action, state: State, campaign: Campaign): Action
  /** Off-turn permissions: the defender's roll, a spectator missile, the
   *  ceremony flags. Returns null to allow, or a refusal code. */
  authorize(action: Action, ctx: SeatContext<State>): string | null

  /** Build the opening state once setup has produced its seats. */
  initialState(seats: SeatResolution[], campaign: Campaign): State

  /** The board, and the screens. The platform owns the shell around them. */
  Board: React.ComponentType<BoardProps<State, Campaign>>
  Setup: React.ComponentType<SetupProps<Campaign>>

  /** Campaign persistence hooks the platform cannot know: what a fresh
   *  campaign looks like, and how two divergent copies are merged. */
  emptyCampaign(): Campaign
  reapplyCampaignEdits(fresh: Campaign, baseline: Campaign, edited: Campaign): Campaign
}
```

Four notes on why it is shaped like that.

**`serverActions` / `sanitize` / `authorize` live with the game.** They are the
security model, and the security model is game-specific: only Risk knows that a
defender may post dice during someone else's turn. The edge function keeps the
JWT, the seat lookup, the version CAS and the action log — the parts that are
the same whatever is being played.

**The reducer contract is already met.** `gameReducer` is pure, takes an
injected `Rng`, and has no clock. That is what makes server authority possible
and it is the reason this extraction is feasible at all.

**Campaign merge belongs to the game.** `reapplyLegacyEdits` merges lists by
entry key because Risk's campaign is lists of stickers and scars. Another game's
campaign will not be. The platform owns the CAS and the refusal; the game owns
what a merge means.

**No renderer abstraction.** Risk draws with PixiJS + an SVG overlay. Do not
invent a rendering interface for one implementation — `Board` is a React
component and that is the whole contract.

---

## Database

Additive, defaulted, no backfill risk:

```sql
alter table campaigns add column if not exists game text not null default 'risk';
alter table matches   add column if not exists game text not null default 'risk';
create index if not exists matches_game_idx on matches (game, status);
```

Every existing row is Risk and says so. `findOpenLobby`, `matchState` and the
campaign list gain a `game` filter so two games' rooms never see each other.

---

## Edge function

Today `apply-action/index.ts` imports the Risk reducer directly. It becomes a
registry:

```ts
const GAMES = { risk: riskDefinition }          // one entry until there are two
const game = GAMES[match.game ?? 'risk']
if (!game) return json({ error: 'unknown game', code: 'unknown-game' }, 400)
```

…then the existing flow, with `SERVER_ACTIONS` → `game.serverActions`,
`sanitize` → `game.sanitize`, and the hand-written authorization branches →
`game.authorize`. The shared-reducer build (`scripts/build-edge-shared.mjs`)
generates one bundle per registered game.

**This is the riskiest step**, because the authorization branches are subtle and
were each written for a bug that actually happened. Move them one at a time,
keeping `serverauthtest` green after each.

---

## Launcher

A screen before the campaign picker: which game. It reads the registry, and
with one game registered it should pass straight through rather than asking a
question with one answer.

---

## Order of work

Each step ends green and shippable. Do not start the next until the previous
is committed.

1. **`game` columns + filters.** Nothing else changes. Risk keeps working
   because every row already says `'risk'`.
2. **Move the untouched modules** — auth, sync, dispatch, desktop, the UI
   listed above. Imports only; no logic edits. Whole suite green.
3. **Split `legacyApi`** into `platform/campaign` and `games/risk/campaign`.
   The CAS/reapply protocol moves verbatim. `savequeuetest` and
   `ceremonyracetest` are the ones that matter here.
4. **Define `GameDefinition`** and make Risk implement it, still called
   directly. No routing yet.
5. **Registry in the edge function**, one game in it. Deploy. Play a real
   online game before going further.
6. **Launcher**, pass-through with one game.

## How "identical behaviour" is checked

The suite is necessary and not sufficient — most of tonight's bugs were in the
wiring between modules, which is exactly what this refactor churns. Before
calling it done, play one real online game and one hotseat game, and confirm:

- an attack resolved by the server, with a human defender rolling their own dice
- a missile fired into the window by a third player
- an event choice landing on the right screen
- a full ceremony: rewards recorded, recap non-empty, continue gate, next game
  hosted by the same machine that hosted the last

The ceremony is the one to watch. It is where the campaign write, the match
teardown and the room hand-off all meet, and it has broken in a new way three
times.
