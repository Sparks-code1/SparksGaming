-- ============================================================================
-- apply_match_write: the service role's execute, stated.
--
-- Both apply_match_write migrations revoke execute from public, anon and
-- authenticated — the whole point of the function is that only the edge
-- functions' service role may call it — but neither ever GRANTS it to
-- service_role, because on hosted Supabase the platform's function defaults
-- did that invisibly. A database built from the migrations alone therefore
-- left the service role itself locked out, and every write the local edge
-- function attempted died on 'permission denied for function'.
--
-- Idempotent, and a no-op against the live database, which already holds
-- the same grant by the platform's hand.
-- ============================================================================

-- WHICHEVER SIGNATURES STAND, by name rather than by arity. The function has
-- been replaced twice already — p_decks added one parameter, p_status a
-- sixth — and a grant that names an arity is a grant that silently misses
-- the next replacement. Any future migration that drops and recreates the
-- function must restate its own grant; this one covers every form standing
-- at the time it runs.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'apply_match_write' and n.nspname = 'public'
  loop
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end $$;
