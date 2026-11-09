-- ============================================================================
-- EasySpace — Billing companies for hours over their monthly quota
--
-- Hours beyond a company's monthly quota are charged at each room's hourly
-- rate (no-shows included, no OT). The running figure is computed live from
-- bookings; at month end the building issues one invoice per company.
--
-- 1. org_invoices          — one invoice per company per month. Lines, bill-to
--                            and totals are a frozen snapshot: an issued
--                            invoice never changes. Mistakes are voided and
--                            reissued, so every number stays traceable.
-- 2. org_invoice_payments  — money received against an invoice.
-- 3. org_invoice_events    — append-only trail of everything done to an
--                            invoice (issued, sent, payment, void …).
--
-- Service role only (the admin app talks through the server).
-- Idempotent: safe to run more than once.
-- ============================================================================

create table if not exists org_invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_no      text unique not null,                 -- INV-202611-0001
  org_id          uuid not null references organizations(id) on delete restrict,
  period          text not null check (period ~ '^\d{4}-\d{2}$'),  -- 2026-11
  status          text not null default 'issued'
                  check (status in ('issued', 'sent', 'partial', 'paid', 'void')),
  quota_hours     numeric(8,2) not null,
  used_hours      numeric(8,2) not null,
  over_hours      numeric(8,2) not null,
  subtotal        numeric(12,2) not null,
  vat_rate        numeric(5,2) not null default 0,
  vat_inclusive   boolean not null default true,
  pre_vat         numeric(12,2) not null,
  vat_amount      numeric(12,2) not null default 0,
  grand_total     numeric(12,2) not null,
  wht_rate        numeric(5,2) not null default 0,
  wht_amount      numeric(12,2) not null default 0,
  net_payable     numeric(12,2) not null,
  paid_amount     numeric(12,2) not null default 0,
  lines           jsonb not null,                       -- booking-level snapshot
  bill_to         jsonb not null,                       -- name, tax id, address
  issuer          jsonb not null,                       -- building letterhead
  due_date        date,
  notes           text,
  issued_by       uuid references profiles(id) on delete set null,
  issued_by_name  text,
  issued_at       timestamptz not null default now(),
  sent_at         timestamptz,
  paid_at         timestamptz,
  voided_at       timestamptz,
  void_reason     text,
  replaces_id     uuid references org_invoices(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists org_invoices_period_idx on org_invoices (period);
create index if not exists org_invoices_org_idx on org_invoices (org_id, period);
-- At most one live invoice per company per month.
create unique index if not exists org_invoices_one_live
  on org_invoices (org_id, period) where status <> 'void';

create table if not exists org_invoice_payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references org_invoices(id) on delete restrict,
  amount        numeric(12,2) not null check (amount > 0),
  paid_on       date not null,
  method        payment_method_t not null,
  reference     text,
  notes         text,
  recorded_by   uuid references profiles(id) on delete set null,
  recorded_by_name text,
  created_at    timestamptz not null default now()
);
create index if not exists org_invoice_payments_invoice_idx on org_invoice_payments (invoice_id);

create table if not exists org_invoice_events (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references org_invoices(id) on delete restrict,
  action      text not null,          -- issued | sent | payment | void | reissued | note
  detail      jsonb,
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text,
  created_at  timestamptz not null default now()
);
create index if not exists org_invoice_events_invoice_idx on org_invoice_events (invoice_id, created_at);

alter table org_invoices enable row level security;
alter table org_invoice_payments enable row level security;
alter table org_invoice_events enable row level security;
-- Default privileges (migration 03) grant SELECT on new tables to anon.
revoke all on table org_invoices from anon, authenticated;
revoke all on table org_invoice_payments from anon, authenticated;
revoke all on table org_invoice_events from anon, authenticated;
