# ให้ผู้ใช้ภายในเลื่อนการจองซ้ำเองได้ — Analysis & Design

สถานะ: **implement แล้ว** · เขียนหลังเคสย้ายซีรีส์ BoostSMS (พุธ 14:00 → อังคาร 15:00, 44 occurrence)

## ไฟล์ที่ส่งมอบ

| ไฟล์ | บทบาท |
|---|---|
| `src/lib/time/bkk.ts` | คำนวณเวลาแบบ Bangkok-safe (ห้าม `setHours` ฝั่ง server) |
| `src/lib/server/conflicts.ts` | `findConflicts()` — จุดเดียวที่ตอบว่า "ห้องว่างมั้ย" + จัดลำดับความสำคัญ + ปิดบังข้อมูลลูกค้า |
| `src/lib/policy/member-reschedule.ts` | type + ค่า default ของนโยบาย |
| `src/lib/actions/member-reschedule.ts` | `previewMemberReschedule` / `applyMemberReschedule` / `getSeriesSummary` |
| `src/app/app/booking/[id]/reschedule-panel.tsx` | UI: scope picker → preview → ยืนยัน |
| `src/app/app/booking/[id]/page.tsx` | ต่อปุ่มเข้ากับหน้ารายละเอียด + label ของ audit ใหม่ |
| `src/app/admin/settings/member-reschedule/page.tsx` | หน้าตั้งค่านโยบาย (+ เมนูใน `_nav.ts`) |
| `src/lib/actions/calendar.ts` | แก้บั๊ก `moveBooking` เขียนทับ metadata |
| `supabase/migrations/00000000000014_member_reschedule.sql` | index + exclusion constraint (hardening — ระบบทำงานได้แม้ยังไม่รัน) |
| `src/lib/server/reschedule-plan.ts` | ส่วนที่เป็น pure function (วางแผนวัน/เวลา + guard) แยกออกมาให้เทสได้ตรง ๆ |
| `scripts/test-reschedule-plan.ts` | เทสเลขวัน/เวลา/timezone — `npm run test:plan` (18 เคส) |
| `scripts/e2e/` + `tsconfig.e2e.json` | เทส end-to-end กับ DB จริง — `npm run test:reschedule` (57 เคส) |

## การทดสอบ

`npm run test:plan` — pure function ล้วน ไม่แตะ DB
`npm run test:reschedule` — เรียก server action ตัวจริงกับฐานข้อมูลจริง โดยสลับเฉพาะ auth /
การส่ง Telegram / `next/cache` เป็น test double (ดู `tsconfig.e2e.json`) จึงไม่ต้อง login
และไม่มีข้อความหลุดเข้ากลุ่มจริง สคริปต์สร้าง fixture เองในช่วงเวลาว่างของ PRIME ROOM
แล้วลบทิ้งใน `finally` เสมอ แม้เทสจะ fail

---

## 1. โจทย์

ผู้ใช้ภายใน (member) จองห้องแบบซ้ำ (recurring) ไว้แล้ว ต้องการ **เลื่อนวัน/เวลาเองทั้งซีรีส์** โดยไม่ต้องแจ้ง admin
แต่ต้องมีเงื่อนไขกันไม่ให้ไปทับ **การจองของลูกค้าภายนอกที่ลงไว้ก่อนแล้ว**

เคสจริงที่เพิ่งเจอ: ซีรีส์ "ประชุม BoostSMS Product" 44 occurrence ต้องขยับทั้งชุด — ทำด้วยมือผ่าน script
(`scripts/move-boostsms-to-tuesday.ts`) เพราะ UI ไม่มีทางทำ

---

## 2. ของที่มีอยู่แล้ว (ต่อยอดได้เลย)

| ส่วน | ที่อยู่ | ใช้ทำอะไร |
|---|---|---|
| สร้าง booking ซ้ำ | `src/lib/actions/members.ts:330` `createMemberBooking` | ต้นแบบ expand ซีรีส์ + skip ตัวที่ชน |
| ขยายวันที่ซีรีส์ | `src/lib/actions/members.ts:295` `expandRecurrenceDates` | daily/weekly/monthly/yearly/weekdays |
| ยกเลิกโดย member | `src/lib/actions/members.ts:646` `cancelMemberBooking` | ต้นแบบ ownership check + audit + notify |
| ย้าย booking (admin) | `src/lib/actions/calendar.ts:59` `moveBooking` | conflict check + audit `moved` |
| เช็คชน | `src/lib/actions/bookings.ts:46` `checkBookingConflict` | ฐานของ helper กลาง |
| เสนอเวลาว่าง | `src/lib/actions/calendar.ts:749` `suggestAlternativeSlots` | ปุ่ม "หาเวลาอื่นให้" |
| แจ้งเตือน | `dispatchEvent("booking.updated")` + `bookingUpdatedTemplate` (`src/lib/templates/telegram.ts:107`) | มีครบแล้ว ไม่ต้องเขียนใหม่ |
| ปิดบังข้อมูลลูกค้า | `src/app/app/calendar/member-calendar-board.tsx:608` | member เห็น external เป็น "ลูกค้าภายนอก" ไม่เห็นชื่อ — reuse ใน preview |

**สรุป: 70% ของชิ้นส่วนมีแล้ว งานหลักคือ orchestration + guard + UX**

---

## 3. ช่องโหว่ที่ต้องปิดก่อน (ไม่ปิดแล้วฟีเจอร์นี้จะพัง)

### 3.1 ซีรีส์ไม่มี ID จริง
occurrence ผูกกันด้วย `metadata.recurrence_of = "<reference_code ของตัวแรก>"` (string ใน jsonb, ไม่มี index)
→ query "ทุก occurrence ในซีรีส์นี้" ต้องสแกน jsonb ทั้งตาราง

**ที่ทำจริง:** ไม่ได้เพิ่มคอลัมน์ `series_id` — ใช้ **functional index บน `(metadata->>'recurrence_of')`** แทน
ได้ประสิทธิภาพเท่ากันโดยไม่ต้อง backfill และไม่ต้องมีโค้ดสองทาง (ก่อน/หลัง migration)
ผลพลอยได้: ฟีเจอร์ทำงานได้ทันทีแม้ยังไม่ได้รัน migration

### 3.2 ตรรกะเช็คชนซ้ำอยู่ 9 ที่
`bookings.ts` (3) · `members.ts` (2) · `calendar.ts` (1) · `users.ts` (1) · `agent-api/core.ts` (1) · `app/page.tsx` (1)
ทุกที่เขียน `.lt("starts_at", end).gt("ends_at", start)` เองหมด → กติกาใหม่ (buffer / ลำดับความสำคัญ) จะหลุดแน่นอน

**แก้:** ยุบเป็น `src/lib/server/conflicts.ts` ตัวเดียว แล้วให้ทุกที่เรียกผ่านมัน

### 3.3 ไม่มี guard ระดับ DB — race condition
ระหว่างที่ member กด preview → กดยืนยัน (อาจ 30 วินาที) admin อาจรับจองลูกค้าลงช่องนั้นพอดี
ตรวจแล้ว: ปัจจุบัน **311 active bookings, overlap = 0** → ใส่ exclusion constraint ได้ทันทีโดยไม่ต้องล้างข้อมูล

### 3.4 `buffer_minutes` ตั้งค่าได้แต่ไม่เคยถูกใช้
มีแค่ในหน้า `src/app/admin/settings/rooms/rooms-manager.tsx` — ไม่มี logic ไหนอ่านเลย
นี่คือเหตุผลที่ BoostSMS ไปต่อท้าย Easy CRM แบบ 15:00 ชนขอบ 15:00 พอดีได้ 44 สัปดาห์

### 3.5 บั๊กที่ต้องไม่ทำซ้ำ
- `calendar.ts:125` `moveBooking` เขียนทับ `metadata` ทั้งก้อนด้วย `{ alerts_sent: [] }` → **`metadata.recurrence` / `recurrence_of` หายทันที** ต้อง merge ไม่ใช่ replace
- `suggestAlternativeSlots` (`calendar.ts:786`) และ `booking-shell.tsx:191` `isoForDateSlot` ใช้ `setHours()/getHours()` = เวลา local ของ server (UTC บน Vercel) → เพี้ยน 7 ชม. เป็นบั๊กเดียวกับที่ `scripts/fix-thunder-recurring.ts` เคยตามแก้

---

## 4. กติกาการเลื่อน (Reschedule Policy) — หัวใจของเรื่อง

### 4.1 ลำดับความสำคัญของช่องเวลา

| ระดับ | ใครถือช่องอยู่ | ผลลัพธ์ |
|---|---|---|
| P0 | external ที่จ่ายแล้ว / มัดจำแล้ว (`source='external'` และ `payment_status ≠ free`) | **ห้ามชนเด็ดขาด** ไม่มี override |
| P1 | external ติดจอง (`hold_expires_at` ยังไม่หมด) | ห้ามชน |
| P2 | external ที่ยังไม่จ่าย | ห้ามชน |
| P3 | internal ขององค์กรอื่น | ห้ามชน |
| P4 | internal องค์กรเดียวกัน คนอื่นจอง | ห้ามชน + แสดงชื่อคนจอง ให้ไปคุยกันเอง |
| P5 | internal ของตัวเอง (คนละรายการ) | **บล็อก** — ห้องรับสองประชุมพร้อมกันไม่ได้ ไม่ว่าใครเป็นเจ้าของ · occurrence ที่ย้ายพร้อมกันถูกกันด้วย `excludeBookingIds` ไม่ใช่ด้วยการปล่อยให้ทับ |
| P6 | ห่างจาก external ไม่ถึง `room.buffer_minutes` | เตือน (⚠️) — บล็อกหรือไม่ ขึ้นกับ `respect_room_buffer` |

**หลักการ: member ย้ายได้เฉพาะเข้าช่องว่างจริงเท่านั้น — ระบบไม่มีทางไปเบียดใครออก ไม่ว่ากรณีไหน**

### 4.2 Guard เพิ่มเติม — `settings` key ใหม่: `booking.member_reschedule`

```jsonc
{
  "enabled": true,
  "allowed_tiers": ["manager", "member"],   // จาก member_organizations.tier
  "min_notice_hours": 2,                    // ห้ามย้าย occurrence ที่จะเริ่มใน 2 ชม.
  "max_advance_days": 90,                   // ปลายทางต้องไม่เกิน 90 วัน (ล้อ booking.policy)
  "max_occurrences_per_request": 60,        // กัน request ยักษ์
  "allow_room_change": false,               // default: ย้ายได้แค่วัน/เวลา ห้องเดิม
  "respect_room_buffer": "external_only",   // off | external_only | all
  "respect_service_days": true,             // rooms.service_days + วันหยุด (settings มีอยู่แล้ว)
  "max_reschedules_per_series_per_month": 2 // กันเลื่อนวนไปมา
}
```

เงื่อนไขเจ้าของ: `booking.member_id = ctx.member.id` เท่านั้น (`tier = 'manager'` อาจให้ย้ายของคนในแผนกตัวเองได้ — เฟส 2)

---

## 5. UX

### 5.1 ปุ่มอยู่ตรงไหน
- **หลัก:** `src/app/app/booking/[id]/page.tsx` — ปุ่ม "เลื่อนวัน/เวลา" วางคู่ `CancelBookingButton`
- **รอง:** `src/app/app/my-bookings/page.tsx` — ไอคอนลัดบนการ์ด
- **ทางเลือก (เฟส 3):** ลากบน `member-calendar-board.tsx` เหมือน admin

### 5.2 เลือกขอบเขต (แบบ Google Calendar)
เมื่อ booking เป็นส่วนหนึ่งของซีรีส์ ให้เลือกก่อน:
1. **เฉพาะครั้งนี้** — ย้าย occurrence เดียว ซีรีส์ที่เหลือคงเดิม
2. **ครั้งนี้และครั้งต่อ ๆ ไป** ← *default* และเป็นเคสของ BoostSMS
3. **ทั้งซีรีส์** — เฉพาะ occurrence ที่ยังไม่ผ่าน (ตัวที่ผ่านไปแล้วไม่แตะ ตามที่ตัดสินใจไปในเคส BoostSMS)

### 5.3 Flow 3 จังหวะ — **Preview คือหัวใจ**

```
[1] เลือกปลายทาง          [2] Preview (dry-run)             [3] ยืนยัน
วันในสัปดาห์: อังคาร  →   ✓ ย้ายได้        41 ครั้ง      →   "ย้ายเฉพาะที่ว่าง (41)"
เวลา: 15:00–16:00         ✗ ชนลูกค้าภายนอก  2 ครั้ง          "ยกเลิก"
ห้อง: MEETING ROOM        ✗ ชนทีมภายใน      1 ครั้ง          "หาเวลาอื่นให้"
(ล็อกไว้)                 ⚠ ชิด buffer      44 ครั้ง
```

ตาราง preview รายแถว:
```
✓  9 ก.ย.  พุธ 14:00 → อังคาร 8 ก.ย. 15:00–16:00
✗ 16 ก.ย.  ชนกับ ลูกค้าภายนอก (จองไว้ 12 ส.ค.)      ← ไม่โชว์ชื่อลูกค้า
✗ 23 ก.ย.  ชนกับ สมชาย (ฝ่ายขาย) — ประชุมทีม        ← internal โชว์ชื่อได้
⚠ 30 ก.ย.  ย้ายได้ แต่ติดกับ ประชุม Easy CRM (เว้น 0 นาที / นโยบาย 15)
```

**สองโหมดตอนยืนยัน**
- `skip_conflicts` (default) — ย้ายเฉพาะที่ว่าง ตัวที่ชนอยู่ที่เดิม สอดคล้องกับพฤติกรรมตอนสร้างซีรีส์ที่ skip อยู่แล้ว
- `all_or_nothing` — มีชนแม้ตัวเดียวก็ไม่ย้ายเลย (สำหรับคนที่ยอมรับซีรีส์ครึ่ง ๆ ไม่ได้)

### 5.4 ข้อความ error ที่ member ต้องเข้าใจได้ทันที
> "ย้ายไม่ได้ 2 ครั้ง เพราะช่วงเวลานั้นมีลูกค้าจองไว้ก่อนแล้ว — ที่เหลือ 41 ครั้งย้ายได้"

ห้ามโชว์ชื่อ/เบอร์ลูกค้าให้ member เห็น (ยึดกติกาเดิมของ `member-calendar-board.tsx`)

---

## 6. โค้ดที่ต้องเพิ่ม

### 6.1 `src/lib/server/conflicts.ts` (ใหม่ — ใช้ร่วมทั้งระบบ)
```ts
export type ConflictTier = "external_paid" | "external_hold" | "external_unpaid"
                         | "internal_other_org" | "internal_same_org" | "buffer_touch";

export interface ConflictHit {
  id: string; reference_code: string;
  starts_at: string; ends_at: string;
  tier: ConflictTier;
  blocking: boolean;
  label: string;          // ผ่าน masking แล้ว ปลอดภัยที่จะโชว์ให้ member
}

/** เช็คหลายช่วงเวลาในครั้งเดียว — 1 query ต่อ 1 ห้อง ไม่ใช่ 44 query */
export async function findConflicts(input: {
  roomId: string;
  slots: Array<{ key: string; startsAt: string; endsAt: string }>;
  excludeBookingIds?: string[];        // ตัวเอง + siblings ที่ย้ายพร้อมกัน
  bufferMinutes?: number;
  viewerScope: "admin" | { memberId: string; orgId: string };  // คุม masking
}): Promise<Map<string, ConflictHit[]>>
```

### 6.2 `src/lib/actions/member-reschedule.ts` (ใหม่)
```ts
previewMemberReschedule(input) → {
  ok, occurrences: Array<{ bookingId, ref, from, to, status: "ok"|"blocked"|"warn", conflicts }>,
  summary: { movable, blocked, warned }, previewHash
}

applyMemberReschedule(input & { previewHash, mode }) → {
  ok, moved, skipped, occurrences
}
```
`input`: `{ bookingId, scope: "one"|"following"|"series", target: { weekdayShift?, date?, startTime, durationMin }, roomId? }`

**`apply` ต้อง re-run การเช็คทั้งหมดอีกรอบเสมอ** — `previewHash` ใช้แค่ตรวจว่าผลเปลี่ยนไปจากที่ user เห็นหรือเปล่า ถ้าเปลี่ยนให้เด้งกลับไป preview ใหม่ ไม่ใช่เขียนทับเงียบ ๆ

### 6.3 UI
- `src/app/app/booking/[id]/reschedule-panel.tsx` (client) — scope picker + date/time picker + ตาราง preview
- แก้ `src/app/app/booking/[id]/page.tsx` ให้ส่ง `seriesId` / `isSeriesOwner` ลงไป

### 6.4 คำนวณเวลาแบบ Bangkok-safe
ห้ามใช้ `setHours()/getHours()` ฝั่ง server เด็ดขาด — ใช้แพตเทิร์นเดียวกับ `scripts/move-boostsms-to-tuesday.ts`
(`Date.UTC(...) - 7h` และ `new Date("YYYY-MM-DDTHH:mm:00+07:00")`) แล้วดึงออกเป็น helper กลาง `src/lib/time/bkk.ts`

---

## 7. Migration (ต้อง paste ใน Supabase SQL editor เอง)

ไฟล์: `supabase/migrations/00000000000014_member_reschedule.sql` — เป็น **hardening ล้วน** ฟีเจอร์ทำงานได้แม้ยังไม่รัน

1. functional index บน `(metadata->>'recurrence_of')` — หาซีรีส์เร็ว
2. index บน `booking_audit_log (action, created_at desc)` — สำหรับ rate limit
3. `exclude using gist` กัน double-booking ระดับ DB (ตรวจแล้ว: 311 active bookings, overlap 0 → ใส่ได้เลย)

ไม่ได้เพิ่ม `reschedule_count` — นับจาก `booking_audit_log` ที่มีอยู่แล้ว จึงไม่ต้อง migrate

ข้อควรระวังกับ exclusion constraint: การย้ายทีละแถวอาจชนกันเองชั่วคราว → `applyMemberReschedule`
จึงเรียงลำดับการเขียนตามทิศทางการย้าย (ย้ายไปก่อนหน้า = เรียงจากเก่าไปใหม่, ย้ายไปหลัง = เรียงกลับ)

---

## 8. Audit / แจ้งเตือน / side-effect

| สิ่งที่ต้องทำ | รายละเอียด |
|---|---|
| audit ต่อแถว | `booking_audit_log` action `rescheduled` เก็บ from/to + `source: "member_portal"` |
| audit สรุป | 1 แถวบน primary: "ย้ายซีรีส์ 41/44 · 3 ตัวชน" |
| Telegram | `dispatchEvent("booking.updated", ...)` **ครั้งเดียว สรุปทั้งซีรีส์** — ไม่ใช่ 44 ข้อความ |
| in-app | `createInAppNotification` แจ้ง admin ว่า member เลื่อนเอง |
| อีเมลผู้เข้าร่วม | ใช้ `metadata.attendee_emails` ที่มีอยู่ ส่ง "นัดหมายเปลี่ยนเวลา" |
| Google Calendar | ถ้ามี `google_event_id` ต้อง update ไม่ใช่สร้างใหม่ (ปัจจุบันซีรีส์นี้ยังไม่มี event) |
| metadata ตัวตั้งต้น | อัปเดต `metadata.recurrence.startHour/startMinute` — **merge ไม่ใช่ overwrite** |
| ล้าง alert | `metadata.alerts_sent = []` แบบ merge |
| revalidate | `/app/my-bookings`, `/app/booking/[id]`, `/app/calendar`, `/admin/calendar`, `/admin/notifications` |

---

## 9. ความเสี่ยง

| ความเสี่ยง | ทางแก้ |
|---|---|
| race ระหว่าง preview → apply | exclusion constraint + re-check ตอน apply + `previewHash` |
| อัปเดต 44 แถวในคำขอเดียว | RPC transaction เดียว + cap `max_occurrences_per_request` |
| ซีรีส์ย้ายไปชนกันเอง | exclude ทั้งชุดที่กำลังย้ายออกจาก conflict scan (P5) แล้วเช็คภายในชุดแยก |
| TZ เพี้ยน 7 ชม. บน Vercel | helper `bkk.ts` + ห้าม `setHours` ฝั่ง server (ลาม 3 ไฟล์ที่ยังผิดอยู่) |
| member เลื่อนวนไปมารบกวนคนอื่น | `reschedule_count` + `max_reschedules_per_series_per_month` |
| ข้อมูลลูกค้ารั่วผ่านหน้า preview | masking ที่ชั้น `findConflicts` (ไม่ใช่ที่ UI) — server ไม่ส่งชื่อออกมาตั้งแต่แรก |
| ยกเลิกไม่ได้ถ้าย้ายผิด | audit เก็บ from/to ครบ → ทำปุ่ม "ย้อนกลับการเลื่อนล่าสุด" ได้ในเฟส 3 |

---

## 10. แผนลงมือ

**Phase 1 — โครง (ประมาณ 1 วัน)**
1. Migration: `series_id` + backfill + exclusion constraint
2. `src/lib/time/bkk.ts` + `src/lib/server/conflicts.ts` และย้าย 9 จุดมาใช้
3. `previewMemberReschedule` / `applyMemberReschedule` — รองรับ scope `"one"` ก่อน
4. ปุ่ม + panel ในหน้า `/app/booking/[id]`

**Phase 2 — ซีรีส์ (ประมาณ 1 วัน)**
5. scope `"following"` / `"series"` + ตาราง preview เต็ม
6. โหมด `skip_conflicts` / `all_or_nothing`
7. audit สรุป + Telegram สรุปครั้งเดียว

**Phase 3 — ขัดเงา**
8. บังคับใช้ `buffer_minutes` จริง (แก้ 3.4) + `respect_service_days` + วันหยุด
9. ปุ่ม "หาเวลาอื่นให้" ผูก `suggestAlternativeSlots` (แก้บั๊ก TZ ในนั้นด้วย)
10. หน้า settings ของ `booking.member_reschedule` + ปุ่ม undo

**ไฟล์ที่แตะ:** ใหม่ 4 · แก้ ~12 · migration 1
