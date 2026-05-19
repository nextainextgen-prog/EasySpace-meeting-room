-- ─── Customer 360° extension ──────────────────────────────────────────────
-- Adds the small set of optional fields needed by the /admin/customers spec
-- (birthday, company anniversary, owner, health score, VAT type, archive).
-- All columns are nullable so existing rows continue to work unchanged.

alter table customers
  add column if not exists birthday date,
  add column if not exists company_anniversary date,
  add column if not exists owner_id uuid references profiles(id) on delete set null,
  add column if not exists health_score int,
  add column if not exists vat_type text check (vat_type in ('vat', 'non_vat')) default 'non_vat',
  add column if not exists archived_at timestamptz;

create index if not exists customers_owner_id_idx on customers (owner_id);
create index if not exists customers_archived_at_idx on customers (archived_at);
