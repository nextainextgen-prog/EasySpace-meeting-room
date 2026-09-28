-- ============================================================================
-- EasySpace — Public self-service booking (QR หน้าห้อง / LINE OA rich menu)
--
-- The feature ships and works WITHOUT this migration: new Telegram events
-- fall back to existing routes in code, and everything else is stored in
-- bookings.metadata. This file only makes the new events configurable and
-- keeps the rate-limit lookups cheap.
-- ============================================================================

-- ─── Telegram routes ───────────────────────────────────────────────────────
-- booking.public   → topic 2 (จองห้องประชุมเเล้ว) — new online booking, awaiting confirmation
-- booking.override → topic 2 — a customer took a slot an internal org held
insert into telegram_routes (event_key, group_id, topic_id, enabled, template) values
  ('booking.public',   '11111111-1111-1111-1111-111111111111', 2, true, 'รายการจองห้องประชุม'),
  ('booking.override', '11111111-1111-1111-1111-111111111111', 2, true, 'รายการจองห้องประชุม')
on conflict (event_key) do nothing;

-- ─── Abuse-guard lookups ───────────────────────────────────────────────────
-- Per-IP and per-phone limits read these on every public submission.
create index if not exists bookings_public_ip_idx
  on bookings ((metadata->'public'->>'ip'), created_at desc)
  where metadata ? 'public';

create index if not exists bookings_public_phone_idx
  on bookings ((metadata->'public'->>'phone'))
  where metadata ? 'public';
