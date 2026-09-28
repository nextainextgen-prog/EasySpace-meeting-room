-- ─────────────────────────────────────────────────────────────────────────────
-- Member self-service rescheduling
--
-- The feature works without this migration; everything here is hardening.
--   1. indexes so resolving a recurring series stays cheap as bookings grow
--   2. a database-level guarantee that two active bookings can never share a
--      room and a moment — the last line of defence behind the app's own
--      conflict check, which cannot be atomic across a preview/confirm gap
--
-- Verified before writing: 311 active bookings, 0 overlapping pairs, so the
-- exclusion constraint applies cleanly with no data to repair first.
-- ─────────────────────────────────────────────────────────────────────────────

-- Siblings of a recurring booking are found by metadata->>'recurrence_of'.
-- Without this index that lookup is a full jsonb scan on every reschedule.
create index if not exists bookings_recurrence_of_idx
  on bookings ((metadata->>'recurrence_of'));

-- reference_code already carries a unique constraint, so the primary lookup
-- is covered. This one serves the audit-log rate limit.
create index if not exists booking_audit_log_action_idx
  on booking_audit_log (action, created_at desc);

-- ─── Room double-booking guard ──────────────────────────────────────────────
-- btree_gist lets a uuid equality sit alongside a range overlap in the same
-- exclusion constraint.
create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_no_room_overlap'
  ) then
    alter table bookings
      add constraint bookings_no_room_overlap
      exclude using gist (
        room_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      ) where (booking_status in ('pending', 'confirmed', 'in_use'));
  end if;
end $$;

-- Note for future writers: moving a whole series while this constraint is on
-- must order the updates so a row never transiently overlaps its own sibling —
-- ascending when the series moves earlier, descending when it moves later.
-- `applyMemberReschedule` already does this.
