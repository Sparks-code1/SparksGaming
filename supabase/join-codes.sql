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
