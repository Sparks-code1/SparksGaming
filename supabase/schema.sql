-- Risk Legacy Digital — Supabase schema
-- Run this in the Supabase SQL editor to set up persistence.

create table if not exists campaigns (
  id          text primary key,
  world_name  text not null default 'New World',
  legacy_state jsonb not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

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
