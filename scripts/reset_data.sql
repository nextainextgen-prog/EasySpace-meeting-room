-- ─────────────────────────────────────────────────────────────────────────
-- EasySpace data reset (preserves rooms, packages, settings, super_admins)
-- ─────────────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor on the production project.
-- Whole reset is wrapped in a single DO block so it executes atomically
-- (Supabase SQL Editor may auto-commit between statements otherwise).
--
-- Preserved:
--   • rooms, room_packages, addons
--   • promotions, holidays, expense_categories, bank_accounts
--   • telegram_groups, telegram_routes, settings
--   • profiles with role IN ('super_admin','admin','staff','accountant','marketing')
--     (only viewer profiles that were linked to a member get deleted)
--
-- Wiped:
--   • all bookings + booking_payments + booking_addons + booking_audit_log
--   • all customers + customer_activities + promotion_usages
--   • all members + member_organizations
--   • all organizations + departments + invite_links
--   • member-linked viewer profiles
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  v_profile_ids uuid[];
  v_bookings_before   int;
  v_customers_before  int;
  v_members_before    int;
  v_orgs_before       int;
begin
  -- Snapshot pre-counts.
  select count(*) into v_bookings_before  from bookings;
  select count(*) into v_customers_before from customers;
  select count(*) into v_members_before   from members;
  select count(*) into v_orgs_before      from organizations;

  -- Capture member profile_ids BEFORE deleting members.
  select coalesce(array_agg(profile_id), '{}'::uuid[])
    into v_profile_ids
    from members
   where profile_id is not null;

  -- 1. Bookings + cascade children (audit_log, payments, addons).
  delete from bookings;

  -- 2. Customers + cascade (customer_activities, promotion_usages tied to them).
  delete from customers;

  -- 3. Membership join, then members, then orgs (cascades departments + invite_links).
  delete from member_organizations;
  delete from members;
  delete from organizations;

  -- 4. Member-linked viewer profiles only — never delete staff/admin.
  delete from profiles
   where id = any(v_profile_ids)
     and role = 'viewer';

  raise notice 'Reset complete. bookings %->0, customers %->0, members %->0, orgs %->0',
    v_bookings_before, v_customers_before, v_members_before, v_orgs_before;
end $$;

-- ─── Sanity counts — run this after the DO block above ──────────────────
select 'bookings'              as table_name, count(*) from bookings
union all select 'customers',                  count(*) from customers
union all select 'members',                    count(*) from members
union all select 'organizations',              count(*) from organizations
union all select 'member_organizations',       count(*) from member_organizations
union all select 'profiles_left',              count(*) from profiles
union all select 'rooms_preserved',            count(*) from rooms;
