-- ============================================================================
-- BASELINE: the hand-run schema, captured.
--
-- Everything below predates the migrations folder: schema.sql, join-codes.sql
-- and multiplayer-schema.sql were pasted into the Supabase SQL editor by hand,
-- so the earliest migration (20260805000000_online_play) assumed tables no
-- migration had ever created — and a database built from zero, the local
-- stack's first act, failed on its first statement.
--
-- CONTENTS COPIED, NOT REWRITTEN, in the order they were run. Every statement
-- is idempotent (the four policies of schema.sql gained drop-guards here, the
-- house style the other files already follow), so replaying this against the
-- LIVE database — which already holds all of it — is a no-op.
-- ============================================================================

-- ── supabase/schema.sql ─────────────────────────────────────────────────────
-- Risk Legacy Digital — Supabase schema
-- Run this in the Supabase SQL editor to set up persistence.

create table if not exists campaigns (
  id          text primary key,
  world_name  text not null default 'New World',
  -- Short shareable code (see supabase/join-codes.sql for the constraints).
  -- Nullable: campaigns created before codes existed get one on first open.
  join_code   text,
  legacy_state jsonb not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Existing databases: run supabase/join-codes.sql, which adds join_code to an
-- already-created table along with its uniqueness and shape constraints.

create table if not exists game_sessions (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         text references campaigns(id) on delete cascade,
  game_number         int  not null,
  winner_player_name  text,
  winner_faction_id   text,
  legacy_events       jsonb default '[]'::jsonb,
  created_at          timestamptz default now()
);

create index if not exists game_sessions_campaign_idx on game_sessions (campaign_id, game_number);

-- Enable Row Level Security (open read/write for now — add auth later)
alter table campaigns    enable row level security;
alter table game_sessions enable row level security;

drop policy if exists "public read campaigns" on campaigns;
create policy "public read campaigns"  on campaigns    for select using (true);
drop policy if exists "public write campaigns" on campaigns;
create policy "public write campaigns" on campaigns    for all    using (true);
drop policy if exists "public read sessions" on game_sessions;
create policy "public read sessions"   on game_sessions for select using (true);
drop policy if exists "public write sessions" on game_sessions;
create policy "public write sessions"  on game_sessions for all    using (true);


-- ── supabase/join-codes.sql ─────────────────────────────────────────────────
-- Risk Legacy Digital — campaign join codes
-- Run this in the Supabase SQL editor. Safe to run more than once.
--
-- Codes are Crockford Base32 (see src/lib/joinCode.ts): six characters from
-- 0-9 A-Z minus I, L, O, U. Uniqueness lives HERE rather than in the app —
-- two people creating a campaign at the same moment cannot be serialised
-- client-side, so the constraint is what actually prevents a duplicate.

alter table campaigns add column if not exists join_code text;

-- Case-insensitive uniqueness: the app always stores upper case, but a unique
-- index on upper(join_code) means a stray lower-case write still cannot create
-- a second campaign answering to the same spoken code.
-- Partial, so the many existing rows with a null code do not collide.
create unique index if not exists campaigns_join_code_key
  on campaigns (upper(join_code))
  where join_code is not null;

-- Lookup path for "join with a code".
create index if not exists campaigns_join_code_lookup
  on campaigns (upper(join_code));

-- Shape check — six characters, alphabet only. Rejects a malformed code at the
-- database rather than letting it become an unshareable campaign.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'campaigns_join_code_shape'
  ) then
    alter table campaigns add constraint campaigns_join_code_shape
      check (join_code is null or join_code ~ '^[0-9A-HJKMNP-TV-Z]{6}$');
  end if;
end $$;


-- ── supabase/multiplayer-schema.sql ─────────────────────────────────────────
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

-- ─── Column backfill ──────────────────────────────────────────────────────────
-- `create table if not exists` does nothing at all when the table is already
-- there — including when it is there with an OLDER shape, from a run of this
-- file that failed partway. These add anything missing, so a half-applied
-- schema is repaired by re-running rather than by dropping and starting over.
alter table matches add column if not exists state       jsonb;
alter table matches add column if not exists version     int    not null default 0;
alter table matches add column if not exists action_seq  int    not null default 0;
alter table matches add column if not exists rng_seed    bigint not null default (floor(random() * 9223372036854775807)::bigint);
alter table matches add column if not exists status      text   not null default 'lobby';
alter table matches add column if not exists created_by  uuid references auth.users(id) on delete set null;
alter table matches add column if not exists created_at  timestamptz not null default now();
alter table matches add column if not exists updated_at  timestamptz not null default now();

alter table match_players add column if not exists user_id       uuid references auth.users(id) on delete set null;
alter table match_players add column if not exists is_ai         boolean not null default false;
alter table match_players add column if not exists ai_difficulty text;

alter table match_actions add column if not exists actor_user_id   uuid references auth.users(id) on delete set null;
alter table match_actions add column if not exists actor_player_id text;
alter table match_actions add column if not exists effects         jsonb not null default '[]'::jsonb;
alter table match_actions add column if not exists created_at      timestamptz not null default now();

-- Constraints have no IF NOT EXISTS either, so they are guarded by name —
-- the same pattern join-codes.sql uses.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_status_check') then
    alter table matches add constraint matches_status_check
      check (status in ('lobby','active','complete','abandoned'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'match_players_ai_difficulty_check') then
    alter table match_players add constraint match_players_ai_difficulty_check
      check (ai_difficulty is null or ai_difficulty in ('easy','medium','hard'));
  end if;
end $$;

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
--
-- `enable row level security` is already safe to repeat; the policies are not.
-- Postgres has no CREATE POLICY IF NOT EXISTS at any version, so each one is
-- dropped first. That also means editing a policy here and re-running the file
-- actually REPLACES it, rather than failing and leaving the old rule in force —
-- which is the more dangerous half of the problem.
alter table matches        enable row level security;
alter table match_players  enable row level security;
alter table match_actions  enable row level security;

drop policy if exists "participants read matches" on matches;
create policy "participants read matches"
  on matches for select using (is_match_participant(id));

drop policy if exists "authed create lobby" on matches;
create policy "authed create lobby"
  on matches for insert with check (auth.uid() = created_by);

drop policy if exists "participants read roster" on match_players;
create policy "participants read roster"
  on match_players for select using (is_match_participant(match_id));

-- Let the lobby creator seat players before the game starts.
drop policy if exists "creator seats players" on match_players;
create policy "creator seats players"
  on match_players for insert
  with check (exists (
    select 1 from matches m where m.id = match_id and m.created_by = auth.uid() and m.status = 'lobby'
  ));

drop policy if exists "participants read actions" on match_actions;
create policy "participants read actions"
  on match_actions for select using (is_match_participant(match_id));

-- NOTE: no client INSERT/UPDATE policies on matches.state, matches.version,
-- match_actions. Those are written exclusively by the Edge Function via the
-- service-role key. This is what makes the model server-authoritative.

-- ─── Realtime ─────────────────────────────────────────────────────────────────
-- Without this the tables exist but push nothing, and every client sits on a
-- board that never updates. `alter publication ... add table` errors if the
-- table is already a member, so each is guarded rather than commented out and
-- left to be forgotten.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_actions'
  ) then
    alter publication supabase_realtime add table match_actions;
  end if;
end $$;

-- Applied 2026-08-05, and worth knowing why it is not optional.
--
-- Identity DEFAULT still sends the NEW row in full — which is why the client
-- reading `payload.new.state` worked even before this landed. What DEFAULT
-- omits is the OLD image, which carries nothing but the primary key. Realtime
-- evaluates an UPDATE's filter against that old image, so `id=eq.<matchId>`
-- survives (id is the key) while a filter on status, game_number or anything
-- else would match nothing at all — with no error, on either side. The client
-- would simply stop being told about turns.
--
-- The cost is WAL: every update to `matches` now writes the previous `state`
-- blob alongside the new one. At a few hundred actions a game that is nothing
-- against a failure mode that is invisible.
alter table matches       replica identity full;
alter table match_actions replica identity full;

-- ─── Verification ─────────────────────────────────────────────────────────────
-- Run this after applying, to see what actually landed.
--
--   select 'table' kind, tablename  name from pg_tables
--     where schemaname = 'public' and tablename in ('matches','match_players','match_actions')
--   union all
--   select 'policy', policyname from pg_policies
--     where schemaname = 'public' and tablename in ('matches','match_players','match_actions')
--   union all
--   select 'realtime', tablename from pg_publication_tables
--     where pubname = 'supabase_realtime' and tablename in ('matches','match_actions')
--   union all
--   select 'function', proname from pg_proc where proname = 'is_match_participant'
--   order by 1, 2;
--
-- Expect 3 tables, 5 policies, 2 realtime entries, 1 function.

