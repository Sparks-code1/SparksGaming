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

create policy "public read campaigns"  on campaigns    for select using (true);
create policy "public write campaigns" on campaigns    for all    using (true);
create policy "public read sessions"   on game_sessions for select using (true);
create policy "public write sessions"  on game_sessions for all    using (true);
