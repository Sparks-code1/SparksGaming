-- ============================================================================
-- The platform's grants, stated.
--
-- On hosted Supabase, every table reaches anon, authenticated and
-- service_role through the platform's default privileges — invisible,
-- because the dashboard set them before the first table existed. The local
-- stack's migration runner has no such defaults, so a database built from
-- the migrations alone denied even the service role on every table.
--
-- TABLES AND SEQUENCES ONLY, deliberately. Functions keep PostgreSQL's own
-- default (execute to public), which is exactly what the later migrations'
-- explicit REVOKES on apply_match_write assume they are undoing — a blanket
-- function grant here, or in default privileges, would silently re-open the
-- one door those migrations exist to shut.
--
-- RLS remains the actual gate for anon and authenticated: granting a table
-- does not grant its rows. This migration is timestamped just after the
-- baseline so everything later builds on hosted footing.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
