-- One transaction for the public state and every seat's secrets.
--
-- A single action can change several hands at once. The Khan card steal is the
-- case that proves it: one action takes a card out of the victim's hand and puts
-- it in the thief's, touching two match_secrets rows plus the counts in
-- matches.state.
--
-- Done as separate PostgREST calls that is three unsynchronised writes, and a
-- failure between them duplicates a card or destroys one — silently, because
-- each half is valid on its own and nothing downstream re-derives the total.
-- A plpgsql body runs in a single transaction, so this is all of it or none.
--
-- Nothing calls this yet. It lands before the caller so the write path exists
-- and is verified before any secret depends on it.

create or replace function apply_match_write(
  p_match_id         uuid,
  p_expected_version int,
  p_state            jsonb,
  -- { "p1": { ... }, "p2": { ... } } — only the seats this action changed.
  -- Seats left out keep the rows they already have.
  p_secrets          jsonb default '{}'::jsonb
)
returns table (version int, action_seq int)
language plpgsql
-- INVOKER, deliberately. The edge function writes with the service role, which
-- bypasses RLS; a DEFINER function would hand that same power to anyone able to
-- call it. Execute is revoked below as well — belt and braces, because this
-- function can overwrite any match's entire state.
security invoker
as $$
declare
  v_version int;
  v_seq     int;
begin
  -- Same compare-and-swap the edge function performed inline: if another action
  -- committed since this one read, the guard fails and this write is refused
  -- rather than silently overwriting it.
  update matches m
     set state      = p_state,
         version    = m.version + 1,
         action_seq = m.action_seq + 1,
         updated_at = now()
   where m.id = p_match_id
     and m.version = p_expected_version
  returning m.version, m.action_seq into v_version, v_seq;

  -- Zero rows rather than an exception: the caller already handles "no row" by
  -- re-reading and returning 409 stale, and an exception would roll back a
  -- transaction the caller may be sharing.
  if not found then
    return;
  end if;

  -- Reached only when the CAS held, so secrets can never be written against a
  -- state that was rejected.
  insert into match_secrets as ms (match_id, player_id, data, updated_at)
  select p_match_id, s.key, s.value, now()
    from jsonb_each(p_secrets) as s
  on conflict (match_id, player_id)
  do update set data = excluded.data, updated_at = excluded.updated_at;

  return query select v_version, v_seq;
end;
$$;

-- No client may call this. It writes arbitrary state to any match, so the only
-- caller is the edge function under the service role, which is not subject to
-- these grants.
revoke all on function apply_match_write(uuid, int, jsonb, jsonb) from public;
revoke all on function apply_match_write(uuid, int, jsonb, jsonb) from anon;
revoke all on function apply_match_write(uuid, int, jsonb, jsonb) from authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  v_has_grant boolean;
begin
  -- Existence asked as a question rather than by selecting a column into a
  -- variable: the previous version read prosecdef (a boolean) into a char(1)
  -- and failed on 'false' before it could check anything.
  if not exists (select 1 from pg_proc where proname = 'apply_match_write') then
    raise exception 'apply_match_write was not created';
  end if;

  if exists (select 1 from pg_proc where proname = 'apply_match_write' and prosecdef) then
    raise exception 'apply_match_write is SECURITY DEFINER — it would grant its callers service-role reach';
  end if;

  select bool_or(has_function_privilege(r, 'apply_match_write(uuid, int, jsonb, jsonb)', 'execute'))
    into v_has_grant
    from (values ('anon'), ('authenticated')) as t(r);
  if coalesce(v_has_grant, false) then
    raise exception 'apply_match_write is callable by clients — a client could overwrite any match';
  end if;
end $$;
