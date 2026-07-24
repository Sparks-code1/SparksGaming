-- Risk Legacy Digital — Server-authoritative multiplayer schema
-- ============================================================================
-- This REPLACES the "one global default-campaign blob" model (see schema.sql)
-- with per-match rows and a server-authoritative action flow:
--
--   client sends an ACTION  ->  Edge Function `apply-action` (service role)
--     validates it's your turn/slot, runs the PURE gameReducer with a SEEDED
--     rng, writes the new state + appends to the action log
--   ->  all clients receive the update via Supabase Realtime and re-render
--
-- Clients never write game state directly (that's the whole point of server
-- authority). They only: read matches they're in, and call the Edge Function.
--
-- Run in the Supabase SQL editor AFTER schema.sql (campaigns/game_sessions stay
-- for legacy/campaign-permanent state; a match references its campaign).
-- ============================================================================

-- ─── Matches ────────────────────────────────────────────────────────────────
-- One row per game (a campaign has up to 15). Holds the authoritative GameState.
create table if not exists matches (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    text not null references campaigns(id) on delete cascade,
  game_number    int  not null,
  status         text not null default 'lobby'
                   check (status in ('lobby','active','complete','abandoned')),

  -- Authoritative game state (the GameState shape from src/types/game.ts).
  -- Written ONLY by the Edge Function (service role). Null until the game starts.
  state          jsonb,

  -- Optimistic-concurrency guard: bumped on every applied action. The Edge
  -- Function rejects an action whose expected version != current (stale client).
  version        int  not null default 0,

  -- Monotonic action counter — also the per-action RNG seed input
  -- (seed = hash(rng_seed, action_seq)) so combat is deterministic + auditable.
  action_seq     int  not null default 0,
  rng_seed       bigint not null default (floor(random() * 9223372036854775807)::bigint),

  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists matches_campaign_idx on matches (campaign_id, game_number);
create index if not exists matches_status_idx   on matches (status);

-- ─── Match players ──────────────────────────────────────────────────────────
-- The roster: one row per seat. Maps an auth user (or an AI) to a player slot
-- ('p1'..'p5') — this is the identity mapping the hotseat build never had.
create table if not exists match_players (
  match_id       uuid not null references matches(id) on delete cascade,
  seat           int  not null,                 -- turn order 0..4
  player_id      text not null,                 -- 'p1'..'p5' (matches GameState.players[].id)
  user_id        uuid references auth.users(id) on delete set null,  -- null for AI
  name           text not null,
  faction_id     text not null,
  is_ai          boolean not null default false,
  ai_difficulty  text check (ai_difficulty in ('easy','medium','hard')),
  primary key (match_id, seat)
);

create index if not exists match_players_user_idx on match_players (user_id);
create unique index if not exists match_players_slot_idx on match_players (match_id, player_id);

-- ─── Action log ───────────────────────────────────────────────────────────────
-- Append-only authoritative event stream. Every applied action + the effects
-- the reducer emitted. Clients SUBSCRIBE to this for realtime: they replay the
-- new state and interpret effects (sounds/modals/legacy) exactly as the local
-- effect interpreter does today. Also the audit/replay record.
create table if not exists match_actions (
  match_id       uuid not null references matches(id) on delete cascade,
  seq            int  not null,                 -- == matches.action_seq at apply time
  actor_user_id  uuid references auth.users(id) on delete set null,
  actor_player_id text,                         -- 'p1'.. (who acted; null for system)
  action         jsonb not null,               -- the Action union value
  effects        jsonb not null default '[]',  -- Effect[] the reducer emitted
  created_at     timestamptz not null default now(),
  primary key (match_id, seq)
);

-- ─── Membership helper (used by RLS) ──────────────────────────────────────────
create or replace function is_match_participant(m uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from match_players mp
    where mp.match_id = m and mp.user_id = auth.uid()
  );
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Read: participants can read their match, its roster, and its action log.
-- Write: NOBODY writes state/actions from the client. The Edge Function uses the
-- service-role key, which bypasses RLS, and is the only writer. Match creation
-- (lobby) is the one client insert we allow.
alter table matches        enable row level security;
alter table match_players  enable row level security;
alter table match_actions  enable row level security;

create policy "participants read matches"
  on matches for select using (is_match_participant(id));

create policy "authed create lobby"
  on matches for insert with check (auth.uid() = created_by);

create policy "participants read roster"
  on match_players for select using (is_match_participant(match_id));

-- Let the lobby creator seat players before the game starts.
create policy "creator seats players"
  on match_players for insert
  with check (exists (
    select 1 from matches m where m.id = match_id and m.created_by = auth.uid() and m.status = 'lobby'
  ));

create policy "participants read actions"
  on match_actions for select using (is_match_participant(match_id));

-- NOTE: no client INSERT/UPDATE policies on matches.state, matches.version,
-- match_actions. Those are written exclusively by the Edge Function via the
-- service-role key. This is what makes the model server-authoritative.

-- ─── Realtime ─────────────────────────────────────────────────────────────────
-- Add these tables to the supabase_realtime publication so clients get pushes.
-- (Run once; ignore "already member" errors.)
--   alter publication supabase_realtime add table matches;
--   alter publication supabase_realtime add table match_actions;
