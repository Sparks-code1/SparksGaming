-- Joining, as one audited function.
--
-- Joining is the operation that must cross the membership boundary: a joiner is
-- by definition not yet on the roster, so once campaigns are scoped to their
-- roster (20260816160000) neither half of the join can work through the table.
-- Rather than leave a permanent hole in the policy, both halves go through here.
--
-- Lands BEFORE the policy migration and is wired up first, so that if joining
-- breaks after the tightening, this function has already been proven against
-- the permissive policies and is not the suspect.
--
-- SECURITY DEFINER, so it sees rows the caller cannot. Everything below exists
-- to keep that reach narrow.

-- Dropped first, not just replaced. CREATE OR REPLACE cannot change a
-- function's return type, and the first version of this shipped with an
-- explicit RETURNS TABLE; replacing it in place fails with "cannot change
-- return type of existing function" on any database that already has it.
drop function if exists join_campaign_by_code(text, text);

create or replace function join_campaign_by_code(
  p_code      text,
  -- null  -> look the campaign up only, so the joiner can see the roster and
  --          choose which member they are. The code is the credential.
  -- set    -> also claim that member for the caller.
  p_member_id text default null
)
-- `setof campaigns`, not an explicit column list. The campaigns table is not
-- created by any migration in this repo — it predates them — so its column
-- types cannot be read from source, and a hand-written RETURNS TABLE is a guess.
-- The first guess was wrong and failed with "structure of query does not match
-- function result type". Borrowing the table's own rowtype cannot mismatch it.
--
-- Extra columns ride along; the client names the four it wants.
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

-- Callable by signed-in users and by guests looking a code up. The function's
-- own checks are what limit it; the grant only decides who may knock.
revoke all on function join_campaign_by_code(text, text) from public;
grant execute on function join_campaign_by_code(text, text) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'join_campaign_by_code') then
    raise exception 'join_campaign_by_code was not created';
  end if;

  if not exists (select 1 from pg_proc where proname = 'join_campaign_by_code' and prosecdef) then
    raise exception 'join_campaign_by_code is not SECURITY DEFINER — it cannot see a campaign the joiner is not on';
  end if;

  -- The search_path pin is the difference between a scoped helper and a
  -- privilege escalation, so its absence is an error rather than a nag.
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
