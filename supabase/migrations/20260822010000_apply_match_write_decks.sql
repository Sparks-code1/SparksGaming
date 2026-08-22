-- One transaction for the public row, every seat's hand, AND the deck orders.
--
-- apply_match_write already covered the first two. The deck orders are moving
-- out of matches.state into match_decks, and they have to move in the SAME
-- transaction as the state that describes them — a state whose draw pile has
-- been dealt from, committed without the pile it dealt from, is a game that
-- deals the same card twice. That is exactly the argument the hands made, and
-- it does not get weaker for a table nobody can read.
--
-- The 4-argument version is DROPPED rather than left beside this one. Postgres
-- overloads on arity, so keeping both would leave a 4-argument call ambiguous
-- once the new parameter has a default: PostgREST sends named arguments, and
-- both candidates would match. Dropping it means every caller resolves here,
-- including dune-action, which passes four and gets the default for the fifth.

drop function if exists apply_match_write(uuid, int, jsonb, jsonb);

create or replace function apply_match_write(
  p_match_id         uuid,
  p_expected_version int,
  p_state            jsonb,
  -- { "p1": { ... }, "p2": { ... } } — only the seats this action changed.
  -- Seats left out keep the rows they already have.
  p_secrets          jsonb default '{}'::jsonb,
  -- { "territoryDeck": [...], "eventDeck": [...] } — only the decks this action
  -- changed. A deck left out keeps the row it already has, so an action that
  -- touches no pile does not have to restate every one of them.
  p_decks            jsonb default '{}'::jsonb
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
  -- Same compare-and-swap as before: if another action committed since this one
  -- read, the guard fails and this write is refused rather than overwriting it.
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

  -- Reached only when the CAS held, so neither hands nor decks can be written
  -- against a state that was rejected.
  insert into match_secrets as ms (match_id, player_id, data, updated_at)
  select p_match_id, s.key, s.value, now()
    from jsonb_each(p_secrets) as s
  on conflict (match_id, player_id)
  do update set data = excluded.data, updated_at = excluded.updated_at;

  insert into match_decks as md (match_id, deck, cards, updated_at)
  select p_match_id, d.key, d.value, now()
    from jsonb_each(p_decks) as d
  on conflict (match_id, deck)
  do update set cards = excluded.cards, updated_at = excluded.updated_at;

  return query select v_version, v_seq;
end;
$$;

-- No client may call this. It writes arbitrary state to any match, so the only
-- caller is the edge function under the service role, which is not subject to
-- these grants.
revoke all on function apply_match_write(uuid, int, jsonb, jsonb, jsonb) from public;
revoke all on function apply_match_write(uuid, int, jsonb, jsonb, jsonb) from anon;
revoke all on function apply_match_write(uuid, int, jsonb, jsonb, jsonb) from authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  v_has_grant boolean;
  v_count     int;
begin
  select count(*) into v_count from pg_proc where proname = 'apply_match_write';
  if v_count = 0 then
    raise exception 'apply_match_write was not created';
  end if;
  -- The reason the old one was dropped. Two overloads make a four-argument call
  -- ambiguous, and the failure appears at the caller as a resolution error long
  -- after this migration has reported success.
  if v_count > 1 then
    raise exception 'apply_match_write has % overloads — a 4-arg call would be ambiguous', v_count;
  end if;

  if exists (select 1 from pg_proc where proname = 'apply_match_write' and prosecdef) then
    raise exception 'apply_match_write is SECURITY DEFINER — it would grant its callers service-role reach';
  end if;

  select bool_or(has_function_privilege(r, 'apply_match_write(uuid, int, jsonb, jsonb, jsonb)', 'execute'))
    into v_has_grant
    from unnest(array['anon', 'authenticated']) as r;
  if coalesce(v_has_grant, false) then
    raise exception 'apply_match_write is executable by a client role';
  end if;

  -- The table it now writes to must still be the unreadable one. If a policy
  -- appeared on match_decks, this function would be filling a store every
  -- client can read.
  if exists (select 1 from pg_policies where tablename = 'match_decks') then
    raise exception 'match_decks has a policy — the decks this function writes would be readable';
  end if;
end $$;
