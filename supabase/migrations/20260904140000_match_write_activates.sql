-- apply_match_write may also START a match, not only end one.
--
-- WHY. The deal now happens server-side (functions/deal-match), so that a
-- match's first state is written already split — nobody's hand on the shared
-- row, each hand in its own RLS'd secrets row, the decks where only the service
-- role reads them. Before, the client wrote the whole board raw and the match
-- healed on its first action, which is to say every hand was public until
-- somebody took a turn.
--
-- That write has to set `status` to 'active' IN THE SAME TRANSACTION as the
-- board. The two orders are both half-states and both bad:
--
--   active first  -> a match visible as playable with no board on it
--   board first   -> a dealt game still advertising itself as an open lobby
--
-- apply_match_write already writes state, secrets and decks together, which is
-- exactly the transaction the status belongs in — it was simply built when the
-- only status change it ever made was the ending one, and said so.
--
-- STILL A CLOSED LIST. 'active' and 'complete' and nothing else: the point of
-- the guard is that this function cannot be talked into an arbitrary status by
-- a caller, and widening it to any text would give that away for nothing.

create or replace function apply_match_write(
  p_match_id         uuid,
  p_expected_version int,
  p_state            jsonb,
  p_secrets          jsonb default '{}'::jsonb,
  p_decks            jsonb default '{}'::jsonb,
  -- 'active' to start the match with this write, 'complete' to end it, null to
  -- leave the status alone.
  p_status           text default null
)
returns table (version int, action_seq int)
language plpgsql
-- INVOKER, deliberately — unchanged. The edge function writes with the service
-- role, which bypasses RLS; a DEFINER function would hand that same power to
-- anyone able to call it.
security invoker
as $$
declare
  v_version int;
  v_seq     int;
begin
  if p_status is not null and p_status not in ('active', 'complete') then
    raise exception 'apply_match_write sets only active or complete: status % refused', p_status;
  end if;

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

  -- Reached only when the CAS held, so secrets can never be written against a
  -- state that was rejected.
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

revoke all on function apply_match_write(uuid, int, jsonb, jsonb, jsonb, text) from public;
revoke all on function apply_match_write(uuid, int, jsonb, jsonb, jsonb, text) from anon;
revoke all on function apply_match_write(uuid, int, jsonb, jsonb, jsonb, text) from authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  v_ok boolean;
begin
  if not exists (select 1 from pg_proc where proname = 'apply_match_write') then
    raise exception 'apply_match_write is missing';
  end if;

  -- THE GUARD IS STILL A GUARD. Widening it to any text would be the easy
  -- mistake here, and nothing else in the file would notice.
  select exists (
    select 1 from pg_proc
    where proname = 'apply_match_write'
      and prosrc like '%not in (''active'', ''complete'')%'
  ) into v_ok;
  if not v_ok then
    raise exception 'apply_match_write no longer restricts p_status to a closed list';
  end if;

  -- AND STILL NOT REACHABLE BY A CLIENT. It can overwrite any match's entire
  -- state; the service role is the only caller.
  if has_function_privilege('authenticated',
      'apply_match_write(uuid, int, jsonb, jsonb, jsonb, text)', 'execute') then
    raise exception 'signed-in users can call apply_match_write';
  end if;
end $$;
