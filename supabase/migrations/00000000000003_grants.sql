-- ============================================================================
-- EasySpace — Grants for Supabase API roles
-- Supabase's newer projects don't auto-grant SELECT to `anon` on tables
-- created via raw SQL, so PostgREST returns empty results. This migration
-- grants the minimum needed for Phase 1.
--
-- Future hardening: replace these blanket grants with row-level security
-- policies once Supabase Auth is wired up.
-- ============================================================================

-- Reference / read-only data the booking portal needs without auth
grant select on table
  rooms,
  room_packages,
  addons,
  expense_categories,
  bank_accounts,
  holidays,
  settings,
  telegram_groups,
  telegram_routes
to anon;

-- Authenticated users (admins + internal members) can read/write everything
-- via the application layer. RLS policies will narrow this in a follow-up.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Service role (server-side) already bypasses RLS, but keep it explicit
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Make sure future tables inherit these defaults
alter default privileges in schema public
  grant select on tables to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
