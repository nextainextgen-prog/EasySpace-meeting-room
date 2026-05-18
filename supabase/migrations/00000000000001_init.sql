-- ============================================================================
-- EasySpace — Initial schema (Phase 0)
-- Designed to support Phase 1 features today and Phase 2-3 features without
-- structural migration. See Plan-Roadmap section 5 for the rationale.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ─── Enums ─────────────────────────────────────────────────────────────────
create type role_t as enum (
  'super_admin', 'admin', 'staff', 'accountant', 'marketing', 'viewer'
);

create type customer_type_t as enum (
  'individual', 'company', 'government'
);

create type lead_source_t as enum (
  'line', 'walk_in', 'referral_bni', 'facebook', 'google', 'email', 'other'
);

create type booking_source_t as enum ('external', 'internal');

create type booking_status_t as enum (
  'pending', 'confirmed', 'in_use', 'completed', 'cancelled', 'no_show'
);

create type payment_status_t as enum ('unpaid', 'deposit', 'paid', 'free');

create type payment_method_t as enum (
  'cash', 'bank_transfer', 'promptpay', 'qr', 'credit_card'
);

create type room_status_t as enum ('active', 'maintenance', 'inactive');

create type room_size_t as enum ('small', 'large', 'vip');

create type promotion_status_t as enum (
  'draft', 'scheduled', 'active', 'paused', 'expired'
);

create type promotion_discount_t as enum (
  'percentage', 'fixed', 'package_upgrade', 'free_addon', 'bogo', 'voucher'
);

create type notification_level_t as enum ('info', 'success', 'warning', 'danger');

create type notification_category_t as enum (
  'time', 'finance', 'ai_digest', 'ai_insight', 'system'
);

-- ─── profiles (extend auth.users) ───────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  full_name   text,
  phone       text,
  avatar_url  text,
  role        role_t not null default 'viewer',
  is_active   boolean not null default true,
  two_factor_enabled boolean not null default false,
  last_login_at timestamptz,
  last_login_ip text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on profiles (role);

-- ─── Organizations (internal tenants in the building) ───────────────────────
create table if not exists organizations (
  id              uuid primary key default gen_random_uuid(),
  parent_org_id   uuid references organizations(id) on delete set null,
  name            text not null,
  short_name      text,
  brand_color     text,
  logo_url        text,
  industry        text,
  floor           text,
  email_domains   text[] default '{}',
  contact_phone   text,
  contact_email   text,
  contract_start  date,
  contract_end    date,
  status          text not null default 'active' check (status in (
    'active', 'pending', 'suspended', 'expired', 'archived'
  )),
  notes           text,
  tags            text[] default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on organizations (status);

-- ─── Departments (Phase 2 UI, Phase 0 schema) ───────────────────────────────
create table if not exists departments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  parent_dept_id  uuid references departments(id) on delete set null,
  name            text not null,
  created_at      timestamptz not null default now()
);
create index on departments (org_id);

-- ─── Members (internal users) ───────────────────────────────────────────────
create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid unique references profiles(id) on delete cascade,
  email       text unique not null,
  full_name   text not null,
  phone       text,
  position    text,
  birth_date  date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Many-to-many: a consultant can belong to multiple orgs (Phase 2 UI but schema
-- supports it today per Plan section 5.1 decision 2)
create table if not exists member_organizations (
  member_id      uuid not null references members(id) on delete cascade,
  org_id         uuid not null references organizations(id) on delete cascade,
  department_id  uuid references departments(id) on delete set null,
  tier           text not null default 'member' check (tier in ('manager', 'member', 'guest')),
  joined_at      timestamptz not null default now(),
  is_active      boolean not null default true,
  primary key (member_id, org_id)
);
create index on member_organizations (org_id);

-- ─── Invite links ──────────────────────────────────────────────────────────
create table if not exists invite_links (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  code          text unique not null,
  link_type     text not null default 'public' check (link_type in (
    'public', 'verified', 'token', 'time_limited', 'quota_limited'
  )),
  quota_total   int,
  quota_used    int not null default 0,
  email_domains text[],
  expires_at    timestamptz,
  enabled       boolean not null default true,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

-- ─── Customers (external) ──────────────────────────────────────────────────
create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  type          customer_type_t not null default 'individual',
  phone         text,
  email         text,
  tax_id        text,
  company_name  text,
  billing_address text,
  contact_name  text,
  line_id       text,
  source        lead_source_t default 'other',
  source_detail text,
  tags          text[] default '{}',
  notes         text,
  -- Aggregates (cached, recomputed on event)
  first_booked_at  timestamptz,
  last_booked_at   timestamptz,
  total_bookings   int not null default 0,
  total_spent      numeric(12,2) not null default 0,
  no_show_count    int not null default 0,
  cancellation_count int not null default 0,
  rfm_score        text,
  churn_risk       text check (churn_risk in ('low', 'medium', 'high')) default 'low',
  blacklisted_at   timestamptz,
  blacklist_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on customers using gin (display_name gin_trgm_ops);
create index on customers using gin (company_name gin_trgm_ops);
create index on customers (phone);
create index on customers (email);

-- ─── Rooms ─────────────────────────────────────────────────────────────────
create table if not exists rooms (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  size              room_size_t not null default 'small',
  capacity_min      int,
  capacity_max      int,
  hourly_rate       numeric(10,2) not null default 0,
  buffer_minutes    int not null default 15,
  amenities         text[] default '{}',
  perks             text[] default '{}',
  floor             text,
  room_number       text,
  color             text not null default '#2D4EF5',
  thumbnail_url     text,
  gallery_urls      text[] default '{}',
  status            room_status_t not null default 'active',
  allow_internal    boolean not null default true,
  service_days      smallint[] default '{1,2,3,4,5,6,7}',
  display_order     int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists room_packages (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  name          text not null,
  hours         numeric(4,2) not null,
  price         numeric(10,2) not null,
  max_hours     numeric(4,2),
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on room_packages (room_id);

-- ─── Add-ons ───────────────────────────────────────────────────────────────
create table if not exists addons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  price       numeric(10,2) not null,
  unit        text not null default 'per_use' check (unit in ('per_use', 'per_hour', 'per_person')),
  description text,
  icon        text,
  stock_total int,
  applies_to_room_ids uuid[] default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── Bookings (single table, discriminated) ────────────────────────────────
create table if not exists bookings (
  id                uuid primary key default gen_random_uuid(),
  reference_code    text unique not null,
  source            booking_source_t not null default 'external',
  customer_id       uuid references customers(id) on delete restrict,
  member_id         uuid references members(id) on delete set null,
  org_id            uuid references organizations(id) on delete set null,
  room_id           uuid not null references rooms(id) on delete restrict,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  attendees_count   int,
  package_id        uuid references room_packages(id),
  base_amount       numeric(10,2) not null default 0,
  addons_amount     numeric(10,2) not null default 0,
  discount_amount   numeric(10,2) not null default 0,
  discount_note     text,
  promotion_id      uuid,
  total_amount      numeric(10,2) not null default 0,
  deposit_amount    numeric(10,2) not null default 0,
  paid_amount       numeric(10,2) not null default 0,
  payment_status    payment_status_t not null default 'unpaid',
  booking_status    booking_status_t not null default 'confirmed',
  free_reason       text,
  is_recurring      boolean not null default false,
  recurrence_rule   text,
  source_channel    lead_source_t,
  source_detail     text,
  internal_title    text,
  internal_agenda   text,
  is_public         boolean not null default false,
  notes             text,
  metadata          jsonb default '{}'::jsonb,
  cancelled_at      timestamptz,
  cancelled_reason  text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on bookings (starts_at, ends_at);
create index on bookings (room_id, starts_at);
create index on bookings (customer_id);
create index on bookings (org_id);
create index on bookings (booking_status);

create table if not exists booking_addons (
  booking_id  uuid not null references bookings(id) on delete cascade,
  addon_id    uuid not null references addons(id) on delete restrict,
  quantity    int not null default 1,
  unit_price  numeric(10,2) not null,
  primary key (booking_id, addon_id)
);

create table if not exists booking_payments (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  paid_at         timestamptz not null default now(),
  amount          numeric(10,2) not null,
  method          payment_method_t not null,
  reference       text,
  slip_url        text,
  notes           text,
  recorded_by     uuid references profiles(id),
  created_at      timestamptz not null default now()
);
create index on booking_payments (booking_id);

-- Booking-level audit (separate from system audit_log because it's the most
-- frequently queried)
create table if not exists booking_audit_log (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  action        text not null,
  actor_id      uuid references profiles(id),
  actor_name    text,
  changes       jsonb,
  reason        text,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index on booking_audit_log (booking_id);

-- ─── Customer activities (360° timeline) ───────────────────────────────────
create table if not exists customer_activities (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  activity_type  text not null,
  payload        jsonb default '{}'::jsonb,
  actor_type     text check (actor_type in ('admin', 'customer', 'system', 'ai')),
  actor_id       uuid,
  source         text,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index on customer_activities (customer_id, occurred_at desc);

-- ─── Promotions ────────────────────────────────────────────────────────────
create table if not exists promotions (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  code                text unique,
  discount_type       promotion_discount_t not null,
  discount_value      numeric(10,2) not null default 0,
  max_discount        numeric(10,2),
  min_order           numeric(10,2),
  applicable_room_ids uuid[] default '{}',
  applicable_segments text[] default '{}',
  applicable_tags     text[] default '{}',
  time_constraint     jsonb default '{}'::jsonb,
  starts_at           timestamptz not null,
  ends_at             timestamptz,
  total_quota         int,
  per_customer_quota  int default 1,
  uses_count          int not null default 0,
  status              promotion_status_t not null default 'draft',
  stackable           boolean not null default false,
  cover_url           text,
  tags                text[] default '{}',
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists promotion_usages (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references promotions(id) on delete cascade,
  booking_id    uuid not null references bookings(id) on delete cascade,
  customer_id   uuid references customers(id) on delete set null,
  saving        numeric(10,2) not null,
  used_at       timestamptz not null default now()
);
create index on promotion_usages (promotion_id);

-- ─── Finance ───────────────────────────────────────────────────────────────
create table if not exists expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  icon        text,
  ai_keywords text[] default '{}',
  vat_default boolean not null default false,
  tax_deductible boolean not null default true,
  is_active   boolean not null default true,
  display_order int not null default 0
);

create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  occurred_on   date not null,
  category_id   uuid references expense_categories(id) on delete set null,
  description   text not null,
  amount        numeric(12,2) not null,
  vendor        text,
  vat_amount    numeric(10,2) default 0,
  withholding_amount numeric(10,2) default 0,
  receipt_url   text,
  is_recurring  boolean not null default false,
  recurrence_rule text,
  recorded_by   uuid references profiles(id),
  notes         text,
  created_at    timestamptz not null default now()
);
create index on expenses (occurred_on desc);

create table if not exists bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  bank_name     text not null,
  account_number text not null,
  account_name  text not null,
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  display_order int not null default 0
);

-- ─── Settings (generic key-value + structured side-tables) ─────────────────
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  category    text,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);

create table if not exists holidays (
  id            uuid primary key default gen_random_uuid(),
  occurred_on   date not null,
  name          text not null,
  is_annual     boolean not null default false,
  policy        text not null default 'block' check (policy in ('block', 'premium', 'vip_only')),
  premium_pct   int default 0,
  notes         text
);

-- ─── Telegram routing (single group, multiple topics) ──────────────────────
create table if not exists telegram_groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  chat_id       text not null,
  description   text,
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists telegram_routes (
  id            uuid primary key default gen_random_uuid(),
  event_key     text not null unique,
  group_id      uuid not null references telegram_groups(id) on delete cascade,
  topic_id      int,
  enabled       boolean not null default true,
  template      text,
  updated_at    timestamptz not null default now()
);

-- ─── In-app notifications (admin) ──────────────────────────────────────────
create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid references profiles(id) on delete cascade,
  recipient_role role_t,
  level         notification_level_t not null default 'info',
  category      notification_category_t not null,
  title         text not null,
  body          text,
  link          text,
  related_id    uuid,
  read_at       timestamptz,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on notifications (recipient_id, created_at desc);

-- ─── Global audit log ──────────────────────────────────────────────────────
create table if not exists audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references profiles(id),
  actor_name    text,
  actor_role    role_t,
  action        text not null,
  target_type   text not null,
  target_id     uuid,
  changes       jsonb,
  reason        text,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index on audit_log (created_at desc);
create index on audit_log (actor_id);
create index on audit_log (target_type, target_id);

-- ─── AI insight cache (Phase 1+) ───────────────────────────────────────────
create table if not exists ai_insights (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  for_date    date,
  recipient_role role_t,
  payload     jsonb not null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index on ai_insights (kind, for_date);

-- ─── Trigger: keep updated_at fresh ────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles', 'organizations', 'members', 'customers', 'rooms',
    'bookings', 'promotions'
  ])
  loop
    execute format(
      'drop trigger if exists touch_%s on %s', t, t
    );
    execute format(
      'create trigger touch_%s before update on %s for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end$$;

-- ─── Seed: minimal settings + telegram routes ──────────────────────────────
insert into settings (key, value, category) values
  ('company.name', '"EasySpace Co., Ltd."', 'business'),
  ('company.timezone', '"Asia/Bangkok"', 'business'),
  ('company.currency', '"THB"', 'business'),
  ('business.hours', '{"morning":{"start":"08:30","end":"12:00"},"afternoon":{"start":"13:00","end":"16:30"},"evening":{"start":"17:00","end":"22:00","enabled":true,"premium_pct":50}}', 'business'),
  ('booking.policy', '{"min_advance_hours":0,"max_advance_days":90,"deposit_pct":30,"payment_due_days":3,"max_session_hours":8,"max_concurrent_bookings":5}', 'business'),
  ('tax.vat_rate', '7', 'finance'),
  ('tax.vat_inclusive', 'true', 'finance')
on conflict (key) do nothing;

-- ============================================================================
-- Row-Level Security policies are added in a follow-up migration once Supabase
-- Auth is wired up. Tables intentionally left without RLS during local dev to
-- speed up seeding.
-- ============================================================================
