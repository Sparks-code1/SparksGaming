-- Re-declare join_campaign_by_code with the table's own rowtype.
--
-- Why this exists as a separate file: 20260816150000 shipped with an explicit
-- RETURNS TABLE (id uuid, world_name text, legacy_state jsonb, join_code text),
-- which did not match the real column types and failed at call time with
-- "structure of query does not match function result type". The campaigns table
-- predates this migration history — nothing here creates it — so its column
-- types cannot be read from source and that declaration was a guess.
--
-- The corrected function was applied by hand through the SQL editor, because
-- `db push` treats 150000 as already applied and will not re-run an edited
-- file. This migration is that hand-applied change, recorded so the history
-- reproduces the database.
--
-- 150000 was left holding the corrected text rather than reverted to the broken
-- version. A fresh replay therefore gets a working function from 150000 and
-- this file re-applies the identical definition — idempotent, and it avoids
-- deliberately replaying a known-broken function into a new environment. The
-- cost is that 150000 as committed is not byte-identical to what ran here;
-- this note is the record of that.

-- CREATE OR REPLACE cannot change a return type, so the old signature has to go
-- first. Harmless where the hand-applied fix is already in place.
drop function if exists join_campaign_by_code(text, text);

create or replace function join_campaign_by_code(
  p_code      text,
  -- null  -> look the campaign up only, so the joiner can see the roster and
  --          choose which member they are. The code is the credential.
  -- set    -> also claim that member for the caller.
  p_member_id text default null
)
returns setof campaigns
language plpgsql
security definer
-- Not optional on a DEFINER function: without it a caller can put a schema of
-- their own ahead of public and have this run their jsonb_array_elements.
set search_path = public, pg_temp
as $$
declare
  v_row    campaigns%rowtype;
  v_uid    uuid := auth.uid();
  v_member jsonb;
  v_idx    int;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return;
  end if;

  -- ilike with no wildcards is a case-insensitive equality test, matching what
  -- the client did inline before.
  select * into v_row from campaigns c where c.join_code ilike trim(p_code) limit 1;
  if not found then
    return;                                   -- no such code; caller sees null
  end if;

  -- ── Lookup only ────────────────────────────────────────────────────────────
  if p_member_id is null then
    return next v_row;
    return;
  end if;

  -- ── Claim ──────────────────────────────────────────────────────────────────
  if v_uid is null then
    raise exception 'sign in before claiming a seat' using errcode = '28000';
  end if;

  select idx - 1, m
    into v_idx, v_member
    from jsonb_array_elements(coalesce(v_row.legacy_state -> 'roster', '[]'::jsonb))
         with ordinality as t(m, idx)
   where m ->> 'id' = p_member_id;

  if v_idx is null then
    raise exception 'no roster member % in that campaign', p_member_id
      using errcode = '22023';
  end if;

  -- Seats are claimed once. Without this, anyone holding the join code could
  -- take over an account holder's seat and inherit their entire campaign record
  -- — signatures, city claims, naming rights.
  if nullif(v_member ->> 'userId', '') is not null
     and v_member ->> 'userId' <> v_uid::text then
    raise exception 'that seat is already claimed' using errcode = '42501';
  end if;

  update campaigns c
     set legacy_state = jsonb_set(
           c.legacy_state,
           array['roster', v_idx::text, 'userId'],
           to_jsonb(v_uid::text),
           true),
         updated_at = now()
   where c.id = v_row.id
  returning * into v_row;

  return next v_row;
end;
$$;

revoke all on function join_campaign_by_code(text, text) from public;
grant execute on function join_campaign_by_code(text, text) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  v_rettype text;
begin
  if not exists (select 1 from pg_proc where proname = 'join_campaign_by_code') then
    raise exception 'join_campaign_by_code was not created';
  end if;

  -- The point of this migration. Anything other than the campaigns rowtype means
  -- the old hand-written column list survived and the function will fail at call
  -- time rather than here — which is how the original got as far as the app.
  select pg_catalog.format_type(p.prorettype, null) into v_rettype
    from pg_proc p where p.proname = 'join_campaign_by_code';
  if v_rettype is distinct from 'campaigns' then
    raise exception 'join_campaign_by_code returns %, expected the campaigns rowtype', v_rettype;
  end if;

  if not exists (select 1 from pg_proc where proname = 'join_campaign_by_code' and prosecdef) then
    raise exception 'join_campaign_by_code is not SECURITY DEFINER';
  end if;

  if not exists (
    select 1 from pg_proc
    where proname = 'join_campaign_by_code'
      and array_to_string(proconfig, ',') like '%search_path%'
  ) then
    raise exception 'join_campaign_by_code has no pinned search_path';
  end if;

  if not has_function_privilege('authenticated', 'join_campaign_by_code(text, text)', 'execute') then
    raise exception 'signed-in users cannot call join_campaign_by_code';
  end if;
end $$;
