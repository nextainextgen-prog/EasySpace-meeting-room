-- ============================================================================
-- EasySpace — Seed data (rooms, packages, addons, telegram routes)
-- Run after the initial schema migration. Safe to re-run (ON CONFLICT clauses).
-- ============================================================================

-- ─── Rooms ─────────────────────────────────────────────────────────────────
insert into rooms (id, name, size, capacity_min, capacity_max, hourly_rate,
                   amenities, perks, color, display_order)
values
  ('00000000-0000-0000-0000-000000000001', 'PRIME ROOM', 'small', 2, 6, 200,
   '{"จอโทรทัศน์","Free Wi-Fi","ปลั๊กไฟ","แอร์","บรรยากาศมินิมอล"}',
   '{}', '#2D4EF5', 1),
  ('00000000-0000-0000-0000-000000000002', 'MASTER ROOM', 'small', 8, 10, 200,
   '{"จอโทรทัศน์","Free Wi-Fi","ปลั๊กไฟ","แอร์","บรรยากาศมินิมอล"}',
   '{}', '#10B981', 2),
  ('00000000-0000-0000-0000-000000000003', 'MEETING ROOM', 'large', 10, 40, 600,
   '{"โปรเจคเตอร์ไร้สาย","ระบบเครื่องเสียง","ไมโครโฟนไร้สาย Lavalier x4","Free Wi-Fi","ปลั๊กไฟ","แอร์"}',
   '{"Pantry / ห้องทานอาหารส่วนกลาง","ห้องน้ำแยก ชาย-หญิง","บริการที่จอดรถ"}',
   '#F59E0B', 3)
on conflict (id) do nothing;

-- ─── Room packages ─────────────────────────────────────────────────────────
-- PRIME + MASTER share package structure
do $$
declare r record;
begin
  for r in select id from rooms where name in ('PRIME ROOM', 'MASTER ROOM') loop
    insert into room_packages (room_id, name, hours, price, max_hours) values
      (r.id, '3 ชั่วโมง', 3, 550, 3),
      (r.id, '4 ชั่วโมง', 4, 700, 4),
      (r.id, '5 ชั่วโมง', 5, 850, 5),
      (r.id, '6 ชั่วโมง', 6, 1000, 6)
    on conflict do nothing;
  end loop;
end$$;

-- MEETING ROOM packages
insert into room_packages (room_id, name, hours, price, max_hours)
select id, 'ครึ่งวัน', 4, 2000, 4 from rooms where name = 'MEETING ROOM'
on conflict do nothing;
insert into room_packages (room_id, name, hours, price, max_hours)
select id, 'เต็มวัน', 8, 3500, 8 from rooms where name = 'MEETING ROOM'
on conflict do nothing;

-- ─── Addons ────────────────────────────────────────────────────────────────
insert into addons (name, price, unit, icon) values
  ('ไมโครโฟนไร้สาย', 100, 'per_use', 'Mic'),
  ('กาแฟ / น้ำดื่ม', 80, 'per_person', 'Coffee'),
  ('Flipchart', 150, 'per_use', 'ClipboardList'),
  ('อาหารว่าง', 200, 'per_person', 'Cookie'),
  ('HDMI Adapter', 0, 'per_use', 'Cable')
on conflict do nothing;

-- ─── Expense categories ────────────────────────────────────────────────────
insert into expense_categories (name, icon, ai_keywords, vat_default) values
  ('ค่าเช่าสถานที่', 'Building', '{"ค่าเช่า","สำนักงาน"}', true),
  ('สาธารณูปโภค', 'Plug', '{"ค่าไฟ","ค่าน้ำ","อินเทอร์เน็ต","TOT","3BB","AIS"}', true),
  ('ทำความสะอาด', 'SprayCan', '{"แม่บ้าน","ทำความสะอาด","cleaning"}', false),
  ('เงินเดือนพนักงาน', 'Wallet', '{"salary","เงินเดือน"}', false),
  ('วัสดุสิ้นเปลือง', 'ShoppingCart', '{"กระดาษ","น้ำดื่ม"}', true),
  ('การตลาด', 'Megaphone', '{"Facebook Ads","Google Ads","LINE"}', true),
  ('ซ่อมบำรุง', 'Wrench', '{"ซ่อม","ช่าง"}', true),
  ('อุปกรณ์', 'Package', '{"จอ","ไมค์","เก้าอี้"}', true),
  ('ค่าธรรมเนียม', 'Receipt', '{"ค่าโอน","ค่าธรรมเนียม"}', false),
  ('อื่นๆ', 'Tag', '{}', false)
on conflict (name) do nothing;

-- ─── Telegram routing scaffold ─────────────────────────────────────────────
-- Single supergroup with topics. Admin edits chat_id and topic_id later.
insert into telegram_groups (id, name, chat_id, description, is_default)
values
  ('11111111-1111-1111-1111-111111111111',
   'EasySpace Hub',
   '0',
   'Single supergroup; each event uses message_thread_id (topic). Configure chat_id from admin.',
   true)
on conflict (id) do nothing;

insert into telegram_routes (event_key, group_id, topic_id, enabled, template) values
  ('booking.created',       '11111111-1111-1111-1111-111111111111', null, true, 'รายการจองห้องประชุม'),
  ('booking.updated',       '11111111-1111-1111-1111-111111111111', null, true, 'รายการจองห้องประชุม'),
  ('booking.cancelled',     '11111111-1111-1111-1111-111111111111', null, true, 'รายการจองห้องประชุม'),
  ('payment.paid',          '11111111-1111-1111-1111-111111111111', null, true, 'ยอดเข้าไม่พัก'),
  ('payment.deposit',       '11111111-1111-1111-1111-111111111111', null, true, 'ยอดเข้าไม่พัก'),
  ('payment.free',          '11111111-1111-1111-1111-111111111111', null, true, 'ยอดเข้าไม่พัก'),
  ('payment.refund',        '11111111-1111-1111-1111-111111111111', null, true, 'ยอดเข้าไม่พัก'),
  ('outstanding.alert',     '11111111-1111-1111-1111-111111111111', null, true, 'ยอดเข้าไม่พัก'),
  ('finance.daily_brief',   '11111111-1111-1111-1111-111111111111', null, true, 'ยอดเข้าไม่พัก'),
  ('finance.weekly_summary','11111111-1111-1111-1111-111111111111', null, true, 'ยอดเข้าไม่พัก'),
  ('notification.time_alert','11111111-1111-1111-1111-111111111111', null, true, 'ติดตามสถานะ'),
  ('notification.system',   '11111111-1111-1111-1111-111111111111', null, true, 'ติดตามสถานะ'),
  ('internal.member_joined','11111111-1111-1111-1111-111111111111', null, true, 'ติดตามสถานะ'),
  ('internal.quota_alert',  '11111111-1111-1111-1111-111111111111', null, true, 'ติดตามสถานะ'),
  ('internal.no_show',      '11111111-1111-1111-1111-111111111111', null, true, 'ติดตามสถานะ')
on conflict (event_key) do nothing;

-- ─── Bank accounts (placeholder) ──────────────────────────────────────────
insert into bank_accounts (bank_name, account_number, account_name, is_default, is_active, display_order)
values
  ('KBank', '000-0-00000-0', 'EasySpace Co., Ltd.', true, true, 1)
on conflict do nothing;
