-- Joining a CLAIMED campaign as a new name.
--
-- WHAT BROKE. saveLegacyState upserts, so every save is an
-- INSERT ... ON CONFLICT DO UPDATE and Postgres applies two checks against two
-- different rows: the INSERT policy's WITH CHECK against the row being written,
-- and the UPDATE policy's USING against the row already there. Adding yourself
-- to a claimed campaign passes the first — you are on the new roster — and
-- fails the second, because you were not on the old one. It surfaces as
--
--   new row violates row-level security policy (USING expression)
--
-- which reads like a bug in the save rather than the rule it is. And it is not
-- an edge case: it is the ordinary way somebody joins a campaign they were sent
-- the code for. scripts/repro-campaign-save.mjs walks all six cases.
--
-- THE SHAPE OF THE FIX. Joining is the operation that must cross the membership
-- boundary, so it crosses in the same audited function the claim already used,
-- with the code as the credential. TypeScript computes the roster — every rule
-- about who may be on one lives in lib/roster, where it is read and tested —
-- and this function enforces only what a caller must not be trusted with.
--
--   1. Your uid appears exactly ONCE in the roster you are proposing.
--   2. No seat somebody else has CLAIMED is altered, in any field.
--
-- AND ONE THING THAT IS NOT A ROSTER RULE: only the roster is written. The
-- caller hands over an array, not a campaign — so a joiner cannot overwrite the
-- scars, the stickers or the history on their way in, and cannot clobber
-- whatever else has landed on the campaign since they read it. That is what
-- jsonb_set below is for.

drop function if exists join_campaign_by_code(text, text);

create or replace function join_campaign_by_code(
  p_code      text,
  -- null  -> look the campaign up only, so the joiner can see the roster and
  --          choose which member they are. The code is the credential.
  -- set    -> also claim that existing member for the caller.
  p_member_id text default null,
  -- The whole roster, as TypeScript computed it. For joining as a name that is
  -- not on the roster yet, which p_member_id cannot express.
  p_roster    jsonb default null
)
returns setof campaigns
language plpgsql
security definer
-- Not optional on a DEFINER function: without it a caller can put a schema of
-- their own ahead of public and have this run their jsonb_array_elements.
set search_path = public, pg_temp
as $$
declare
  v_row      campaigns%rowtype;
  v_uid      uuid := auth.uid();
  v_member   jsonb;
  v_idx      int;
  v_mine     int;
  v_old      jsonb;
  v_altered  text;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return;
  end if;

  if p_member_id is not null and p_roster is not null then
    raise exception 'claim a seat or propose a roster, not both'
      using errcode = '22023';
  end if;

  -- ilike with no wildcards is a case-insensitive equality test, matching what
  -- the client did inline before.
  select * into v_row from campaigns c where c.join_code ilike trim(p_code) limit 1;
  if not found then
    return;                                   -- no such code; caller sees null
  end if;

  -- ── Lookup only ────────────────────────────────────────────────────────────
  if p_member_id is null and p_roster is null then
    return next v_row;
    return;
  end if;

  if v_uid is null then
    raise exception 'sign in before claiming a seat' using errcode = '28000';
  end if;

  -- ── Claim an existing seat ─────────────────────────────────────────────────
  if p_member_id is not null then
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
    -- take over an account holder's seat and inherit their entire campaign
    -- record — signatures, city claims, naming rights.
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
    return;
  end if;

  -- ── Propose a whole roster ─────────────────────────────────────────────────
  if jsonb_typeof(p_roster) <> 'array' then
    raise exception 'the roster must be an array' using errcode = '22023';
  end if;

  -- RULE 1: exactly one seat is yours. Zero means this is not a join at all;
  -- more than one means a caller giving themselves a second seat, which
  -- lib/roster refuses and which must not depend on lib/roster to refuse.
  select count(*) into v_mine
    from jsonb_array_elements(p_roster) as m
   where nullif(m ->> 'userId', '') = v_uid::text;
  if v_mine <> 1 then
    raise exception 'the roster must contain your seat exactly once (found %)', v_mine
      using errcode = '42501';
  end if;

  -- RULE 2: nobody else's claimed seat is touched. Compared as whole objects
  -- rather than field by field — a rule that named the fields would be a list
  -- to forget to extend, and there is no legitimate join that edits any part of
  -- somebody else's claimed seat.
  v_old := coalesce(v_row.legacy_state -> 'roster', '[]'::jsonb);
  select string_agg(o ->> 'id', ', ') into v_altered
    from jsonb_array_elements(v_old) as o
   where nullif(o ->> 'userId', '') is not null
     and nullif(o ->> 'userId', '') <> v_uid::text
     and not exists (
       select 1 from jsonb_array_elements(p_roster) as n where n = o
     );
  if v_altered is not null then
    raise exception 'that roster alters a seat claimed by somebody else: %', v_altered
      using errcode = '42501';
  end if;

  -- ONLY THE ROSTER. The caller handed over an array, and everything else on
  -- this campaign — scars, stickers, history, the game number — stays exactly
  -- as the server has it.
  update campaigns c
     set legacy_state = jsonb_set(c.legacy_state, array['roster'], p_roster, true),
         updated_at = now()
   where c.id = v_row.id
  returning * into v_row;

  return next v_row;
end;
$$;

revoke all on function join_campaign_by_code(text, text, jsonb) from public;
grant execute on function join_campaign_by_code(text, text, jsonb) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  v_rettype text;
begin
  if not exists (select 1 from pg_proc where proname = 'join_campaign_by_code') then
    raise exception 'join_campaign_by_code was not created';
  end if;

  -- ONE FUNCTION, NOT TWO. Adding a parameter creates an OVERLOAD rather than
  -- replacing, and a surviving two-argument version would keep answering the
  -- old calls — with the old behaviour — for as long as nobody looked.
  if (select count(*) from pg_proc where proname = 'join_campaign_by_code') <> 1 then
    raise exception 'join_campaign_by_code is overloaded; the old signature survived';
  end if;

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

  if not has_function_privilege('authenticated', 'join_campaign_by_code(text, text, jsonb)', 'execute') then
    raise exception 'signed-in users cannot call join_campaign_by_code';
  end if;
end $$;
