-- ============================================================================
-- EasySpace — Wire Telegram routes to real chat_id + topic_ids
-- Bot: @EZSpace_bot
-- Group: -1003916007260 (EasySpace Meeting Booking)
-- Topics created in the group:
--   2  = จองห้องประชุมเเล้ว   (booking events)
--   4  = ยอดเข้าไม่พัก         (payment events)
--   6  = ติดตามสถานะ           (status / time alerts)
--   8  = รายงานยอด             (daily / weekly brief)
--  12  = Report                 (reserved for ad-hoc reports)
-- ============================================================================

-- Update the default Telegram group with the real chat_id
update telegram_groups
set chat_id = '-1003916007260',
    name    = 'EasySpace Meeting Booking'
where id = '11111111-1111-1111-1111-111111111111';

-- Map each event_key → topic_id
update telegram_routes set topic_id = 2 where event_key in (
  'booking.created', 'booking.updated', 'booking.cancelled'
);

update telegram_routes set topic_id = 4 where event_key in (
  'payment.paid', 'payment.deposit', 'payment.free', 'payment.refund',
  'outstanding.alert'
);

update telegram_routes set topic_id = 6 where event_key in (
  'notification.time_alert', 'notification.system',
  'internal.member_joined', 'internal.quota_alert', 'internal.no_show'
);

update telegram_routes set topic_id = 8 where event_key in (
  'finance.daily_brief', 'finance.weekly_summary'
);
