-- ============================================================================
-- EasySpace — Online payment (slip upload + EasySlip) and LINE messaging
--
-- 1. app_secrets     — server-only credentials (EasySlip key, LINE token).
--                      `settings` is readable with the public anon key, so
--                      secrets must never live there.
-- 2. payment_slips   — every slip a customer uploads, with the EasySlip
--                      verdict. Holds customer PII: service role only.
-- 3. payment-slips   — private storage bucket for the slip images.
-- 4. Telegram route for slips that need a human look.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ─── 1. Secrets ────────────────────────────────────────────────────────────
create table if not exists app_secrets (
  key         text primary key,
  value       text not null,
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table app_secrets enable row level security;
-- Default privileges (migration 03) grant SELECT on new tables to anon.
-- Take it back: only the service role (server) may touch secrets.
revoke all on table app_secrets from anon, authenticated;

-- ─── 2. Slip log ───────────────────────────────────────────────────────────
create table if not exists payment_slips (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid references bookings(id) on delete cascade,
  customer_id      uuid references customers(id) on delete set null,
  -- verified | approved | rejected | amount_mismatch | receiver_mismatch
  -- | duplicate | too_old | not_slip | pending_bank | api_error
  status           text not null,
  api_status       int,
  api_message      text,
  trans_ref        text,
  amount           numeric(12,2),
  expected_amount  numeric(12,2),
  slip_date        timestamptz,
  slip_type        text,
  sender_bank      text,
  sender_name      text,
  sender_account   text,
  receiver_bank    text,
  receiver_name    text,
  receiver_account text,
  image_path       text,
  raw              jsonb,
  reviewed_by      uuid references profiles(id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now()
);

create index if not exists payment_slips_created_idx on payment_slips (created_at desc);
create index if not exists payment_slips_booking_idx on payment_slips (booking_id);
create index if not exists payment_slips_status_idx on payment_slips (status);
-- One transfer can only ever pay for one thing.
create unique index if not exists payment_slips_trans_ref_accepted_uniq
  on payment_slips (trans_ref)
  where status in ('verified', 'approved') and trans_ref is not null;

alter table payment_slips enable row level security;
revoke all on table payment_slips from anon, authenticated;

-- ─── 3. Private bucket for slip images ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-slips',
  'payment-slips',
  false,
  8388608,                                                   -- 8 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- No storage policies on purpose: the server reads/writes with the service
-- role and hands admins short-lived signed URLs.

-- ─── 4. Telegram ───────────────────────────────────────────────────────────
-- payment.slip_review → topic 4 (ยอดเข้าไม่พัก): a slip EasySlip could not
-- accept and a person should check.
insert into telegram_routes (event_key, group_id, topic_id, enabled, template) values
  ('payment.slip_review', '11111111-1111-1111-1111-111111111111', 4, true, 'ยอดเข้าไม่พัก')
on conflict (event_key) do nothing;
