-- ============================================================================
-- EasySpace — Add `owner` role (highest privilege, above super_admin)
-- The owner is the system creator/proprietor. Only owners can change billing,
-- delete the workspace, transfer ownership, or disable other super_admins.
-- ============================================================================

-- Postgres requires `ADD VALUE` to run outside a transaction block in some
-- versions; the Supabase migration runner handles this for us.
alter type role_t add value if not exists 'owner' before 'super_admin';
