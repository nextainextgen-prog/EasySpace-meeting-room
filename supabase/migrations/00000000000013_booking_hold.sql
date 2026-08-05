-- ============================================================================
-- EasySpace — "ติดจอง" (tentative hold)
--
-- A hold is a booking that blocks the room but is NOT confirmed and has no
-- money attached. It reuses booking_status = 'pending' (already excluded from
-- revenue queries and already honoured by every conflict check), so no enum
-- changes are needed. The only new state is when the hold goes stale.
-- ============================================================================

alter table bookings
  add column if not exists hold_expires_at timestamptz;

comment on column bookings.hold_expires_at is
  'Deadline for a ติดจอง (booking_status = pending) to be confirmed. Cleared once the booking leaves pending. Null on every non-hold booking.';

-- Cron scans expiring holds only — a partial index keeps it cheap.
create index if not exists bookings_hold_expires_idx
  on bookings (hold_expires_at)
  where booking_status = 'pending' and hold_expires_at is not null;

-- ─── Telegram routes for the hold lifecycle ────────────────────────────────
-- booking.hold        → topic 2 (จองห้องประชุมเเล้ว) alongside the other booking events
-- booking.hold_expiring / booking.hold_expired → topic 6 (ติดตามสถานะ)
insert into telegram_routes (event_key, group_id, topic_id, enabled, template) values
  ('booking.hold',          '11111111-1111-1111-1111-111111111111', 2, true, 'รายการจองห้องประชุม'),
  ('booking.hold_expiring', '11111111-1111-1111-1111-111111111111', 6, true, 'ติดตามสถานะ'),
  ('booking.hold_expired',  '11111111-1111-1111-1111-111111111111', 6, true, 'ติดตามสถานะ')
on conflict (event_key) do nothing;
