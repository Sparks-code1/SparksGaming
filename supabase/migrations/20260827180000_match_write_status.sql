-- The write RPC learns to end a match.
--
-- The Mentat Pause that ends the game writes state.winner, and the row's
-- status has to flip to 'complete' IN THE SAME TRANSACTION: written apart, a
-- crash between them leaves a match whose board says somebody won while every
-- lobby list still offers it as a game in progress — or the reverse, a match
-- closed with no winner recorded anywhere.
--
-- The 5-argument version is DROPPED rather than left beside this one, for the
-- reason the decks migration gave when it dropped the 4-argument one: Postgres
-- overloads on arity, PostgREST sends named arguments, and two candidates
-- differing only by a defaulted parameter are ambiguous. Every caller resolves
-- here; callers that pass no status get the default and the row keeps the
-- status it had.

drop function if exists apply_match_write(uuid, int, jsonb, jsonb, jsonb);

create or replace function apply_match_write(
  p_match_id         uuid,
  p_expected_version int,
  p_state            jsonb,
  -- { "p1": { ... }, "p2": { ... } } — only the seats this action changed.
  -- Seats left out keep the rows they already have.
  p_secrets          jsonb default '{}'::jsonb,
  -- { "treachery": [...], "spice": [...] } — only the decks this action
  -- changed. A deck left out keeps the row it already has.
  p_decks            jsonb default '{}'::jsonb,
  -- 'complete' to end the match with this write; null leaves status alone.
  -- Constrained to the one transition this exists for — a state write is not
  -- the place to reopen a lobby or abandon a game.
  p_status           text default null
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
  if p_status is not null and p_status <> 'complete' then
    raise exception 'apply_match_write only ends matches: status % refused', p_status;
  end if;

  -- Same compare-and-swap as before: if another action committed since this one
  -- read, the guard fails and this write is refused rather than overwriting it.
  update matches m
     set state      = p_state,
         version    = m.version + 1,
         action_seq = m.action_seq + 1,
         status     = coalesce(p_status, m.status),
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
revoke all on function apply_match_write(uuid, int, jsonb, jsonb, jsonb, text) from public;
