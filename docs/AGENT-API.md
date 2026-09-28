# EasySpace Agent API

REST API สำหรับ AI Agent (Telegram — ข้อความและเสียง) ใช้สั่งงานระบบจองห้องประชุมได้ครบวงจร:
ถามห้อง → ส่งรูป → เลือกวัน/เวลา → แสดงตารางช่วงเวลา → ถามหัวข้อประชุม → ลงระบบ → ตอบกลับสรุป

- **Base URL**: `https://easy-space-meeting-room-yjqk.vercel.app`
- **Auth**: `Authorization: Bearer <AGENT_API_KEY>` (หรือ `X-Api-Key: <AGENT_API_KEY>`)
- **Timezone**: ทุก `date` / `startTime` / `endTime` เป็นเวลาไทย (Asia/Bangkok) — ส่วน `startsAt` / `endsAt` ใน response เป็น ISO UTC
- **เวลาทำการ**: 08:30–22:30 ช่องละ 30 นาที (ตรงกับหน้าจองในเว็บ)
- ทุก response ที่สำเร็จมี `ok: true`; ที่ผิดพลาดมี `ok: false`, `error` (code), `message` (ข้อความไทยส่งต่อผู้ใช้ได้เลย)
- หลาย endpoint คืน field **`text`** — ข้อความ HTML สำเร็จรูป ส่งเข้า Telegram ด้วย `parse_mode: "HTML"` ได้ทันที

---

## 0. Discovery

```
GET /api/agent
```
คืนรายการ endpoint ทั้งหมด + ตาราง slot + ลำดับบทสนทนาแนะนำ (ให้บอทดึงตอน boot ได้)

---

## 1. รายการห้อง — “ขอดูห้องประชุม”

```
GET /api/agent/rooms?attendees=6
```

| query | ความหมาย |
|---|---|
| `attendees` | กรองเฉพาะห้องที่รองรับจำนวนคนนี้ได้ |
| `includeInactive=1` | รวมห้องที่ปิดปรับปรุง |

**Response (ย่อ)**
```json
{
  "ok": true,
  "count": 3,
  "rooms": [{
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "PRIME ROOM",
    "capacity_min": 2, "capacity_max": 6,
    "hourly_rate": 200,
    "amenities": ["จอโทรทัศน์", "Free Wi-Fi", "ปลั๊กไฟ"],
    "thumbnail_url": "https://.../prime.png",
    "photos": ["https://.../prime.png"],
    "packages": [{ "name": "3 ชั่วโมง", "hours": 3, "price": 550 }],
    "text": "<b>PRIME ROOM</b>\nรองรับ 2–6 ท่าน · 200 บาท/ชม. ..."
  }]
}
```

**วิธีใช้ในบอท**: ส่ง `sendPhoto` ด้วย `photos[0]` และใส่ `text` เป็น caption จากนั้นทำปุ่ม inline จาก `rooms[].id`

ห้องเดียว (ระบุด้วย uuid หรือชื่อบางส่วน เช่น `prime`, `master`, `meeting`):
```
GET /api/agent/rooms/prime?date=2026-08-20
```
ใส่ `date` ด้วยจะแนบตารางเวลาของวันนั้นมาให้ในคำขอเดียว

---

## 2. ตารางช่วงเวลา — “วันที่ 20 ว่างกี่โมงบ้าง”

```
GET /api/agent/availability?date=2026-08-25&room=meeting
```

| query | ความหมาย |
|---|---|
| `date` | YYYY-MM-DD (ไม่ใส่ = วันนี้) |
| `room` | uuid หรือชื่อบางส่วน (ไม่ใส่ = ทุกห้อง) |
| `attendees` | กรองห้องตามจำนวนคน |
| `startTime`, `endTime` | ถ้าใส่ จะเพิ่ม `windowCheck` บอกว่าห้องไหนว่างช่วงนั้น |

**Response**
```json
{
  "ok": true,
  "date": "2026-08-25",
  "dateLabel": "วันอังคารที่ 25 สิงหาคม 2569",
  "openHours": { "start": "08:30", "end": "22:30", "slotMinutes": 30 },
  "rooms": [{
    "room": { "id": "...", "name": "MEETING ROOM", "capacity_max": 40 },
    "fullyFree": false,
    "freeRanges": [{ "start": "08:30", "end": "14:00", "hours": 5.5 }],
    "busy": [{ "startTime": "14:00", "endTime": "15:00", "title": "ประชุม Easy CRM Product", "status": "confirmed" }],
    "slots": [{ "start": "08:30", "end": "09:00", "available": true, "label": "ว่าง",
                "startsAt": "2026-08-25T01:30:00.000Z", "endsAt": "2026-08-25T02:00:00.000Z" }],
    "text": "<b>MEETING ROOM</b> · วันอังคารที่ 25 สิงหาคม 2569\n\n<b>ช่วงที่ว่าง</b>\n  08:30–14:00 (5.5 ชม.) ..."
  }]
}
```

- `text` = ตารางเวลาแบบข้อความ ส่งเข้า Telegram ได้เลย
- `slots` = ใช้สร้างปุ่ม inline keyboard ทีละ 30 นาที (`available: false` = ทำเป็นปุ่มสีเทา/ข้าม)
- `freeRanges` = ใช้พูดสรุปสั้น ๆ ตอนตอบด้วยเสียง

**เช็กเวลาเดียวว่าว่างไหม**
```
POST /api/agent/availability
{ "room": "prime", "date": "2026-08-25", "startTime": "10:00", "endTime": "11:30" }
→ { "ok": true, "available": true, "text": "PRIME ROOM ว่างช่วง 10:00–11:30 น." }
```
(ใช้ `durationMinutes` แทน `endTime` ได้ เช่นผู้ใช้พูดว่า “ขอ 1 ชั่วโมง”)

---

## 3. ราคา (เฉพาะลูกค้าภายนอก)

```
GET /api/agent/quote?room=meeting&date=2026-08-25&startTime=09:00&endTime=12:00
→ { "quote": { "hours": 3, "hourlyRate": 600, "baseAmount": 1800, "packageName": null, "savingsVsHourly": 0 },
    "text": "..." }
```
ใช้กฎเดียวกับหน้าแอดมิน: เลือกแพ็กเกจที่ใหญ่ที่สุดที่ไม่เกินจำนวนชั่วโมงที่จอง ถ้าไม่มีก็คิดรายชั่วโมง
การจองภายใน (member) ฟรีเสมอ ไม่ต้องเรียก endpoint นี้

---

## 4. รู้จักผู้ใช้ + โควตา

ผูก Telegram user id เข้ากับสมาชิก (ทำครั้งเดียวต่อคน):
```
POST /api/agent/members/link
{ "telegramUserId": "123456789", "email": "hello@thunder.in.th" }
```
ยกเลิกการผูก: `{ "telegramUserId": "123456789", "unlink": true }`

ตรวจว่าใครคุยอยู่:
```
GET /api/agent/members/resolve?telegramUserId=123456789
GET /api/agent/members/resolve?email=hello@thunder.in.th
→ {
  "member": { "memberId": "...", "fullName": "Hello Thunder Solution",
              "orgId": "...", "orgName": "Thunder Solution", "tier": "member" },
  "quota": { "usedHours": 186, "quotaHours": 40, "unlimited": true, "remainingHours": null }
}
```

---

## 5. ลงระบบ — “จองเลย”

```
POST /api/agent/bookings
```

### 5.1 การจองภายใน (mode: "member") — ฟรี ยืนยันทันที
```json
{
  "mode": "member",
  "room": "prime",
  "date": "2026-08-20",
  "startTime": "10:00",
  "endTime": "11:30",
  "title": "ประชุมทีมขาย",
  "attendees": 4,
  "agenda": "สรุปยอดเดือนสิงหาคม",
  "notes": "ขอน้ำดื่ม 4 ขวด",
  "attendeeEmails": ["a@thunder.in.th"],
  "telegramUserId": "123456789"
}
```
- ระบุตัวผู้จองด้วย `telegramUserId` (ถ้าผูกไว้แล้ว) หรือ `memberEmail` / `memberId` / `memberPhone`
- `title` (หัวข้อประชุม) **บังคับ** — เป็นคำถามสุดท้ายที่บอทควรถาม
- ใช้ `durationMinutes` แทน `endTime` ได้
- ทำงานเหมือนกดจองในเว็บทุกอย่าง: แจ้ง Telegram, สร้าง Google Calendar event, ส่งอีเมลเชิญผู้เข้าร่วม

**Response**
```json
{
  "ok": true,
  "reference": "BK00346",
  "bookingId": "...",
  "dateLabel": "วันอังคารที่ 15 กันยายน 2569",
  "startTime": "21:00", "endTime": "21:30", "hours": 0.5,
  "member": { "name": "Hello Thunder Solution", "org": "Thunder Solution" },
  "quota": { "usedHours": 186.5, "quotaHours": 40, "unlimited": true },
  "text": "<b>ยืนยันการจองเรียบร้อย</b>\n\nรหัส: <code>BK00346</code>\nห้อง: PRIME ROOM ..."
}
```

### 5.2 ลูกค้าภายนอก (mode: "customer") — มีราคา
```json
{
  "mode": "customer",
  "room": "meeting",
  "date": "2026-08-25",
  "startTime": "09:00",
  "endTime": "12:00",
  "attendees": 20,
  "customer": { "name": "บจก. ตัวอย่าง", "phone": "0812345678", "type": "company", "source": "line" },
  "paymentStatus": "unpaid",
  "asHold": true,
  "notes": "ขอไมค์เพิ่ม 2 ตัว"
}
```
- ราคาคำนวณอัตโนมัติ (ส่ง `totalAmount` / `discountAmount` มาทับได้)
- `asHold: true` = บันทึกเป็น **ติดจอง** (กันห้องไว้ รอยืนยัน มีวันหมดอายุ)
- `paymentStatus`: `unpaid` | `deposit` | `paid` | `free`

### 5.3 ตรวจก่อนลงจริง
ใส่ `"dryRun": true` ใน body เดียวกัน → ระบบตรวจห้อง/เวลา/ความจุ/ราคาให้ แต่ยังไม่บันทึก
ใช้ตอนให้ผู้ใช้กด “ยืนยัน” ก่อน แล้วค่อยยิงซ้ำโดยไม่ใส่ `dryRun`

### 5.4 ข้อผิดพลาดที่ต้องรับมือ
| HTTP | error | ความหมาย |
|---|---|---|
| 409 | `time_conflict` | เวลาชนกับการจองอื่น (มี `conflicts[]` มาด้วย) |
| 404 | `room_not_found` | ไม่พบห้องตามชื่อที่พูดมา |
| 404 | `member_not_found` | ยังไม่ได้ผูก Telegram user หรือไม่มีสมาชิกนี้ |
| 400 | `past_time` | จองย้อนหลัง |
| 400 | `over_capacity` | คนเกินความจุห้อง |
| 400 | `title_required` | ยังไม่ได้ถามหัวข้อประชุม |
| 401 | `unauthorized` | API key ผิด |

---

## 6. ดู / ยกเลิกการจอง

```
GET /api/agent/bookings?date=2026-08-25
GET /api/agent/bookings?from=2026-08-20&to=2026-08-31&room=meeting
GET /api/agent/bookings?telegramUserId=123456789&status=active
GET /api/agent/bookings/BK00346
```
`status`: `active` (ค่าเริ่มต้น) | `confirmed` | `pending` | `cancelled` | `all`

```
POST /api/agent/bookings/BK00346/cancel
{ "reason": "ลูกค้าเลื่อน", "telegramUserId": "123456789" }
```
การจองภายในยกเลิกได้เฉพาะเจ้าของ (ต้องส่งตัวตนมาด้วย) — การจองลูกค้าภายนอกยกเลิกได้เลย

---

## 7. ลำดับบทสนทนาที่แนะนำ

| ขั้น | ผู้ใช้พูด | บอทเรียก | บอทตอบ |
|---|---|---|---|
| 1 | “ลงห้องประชุม” | `GET /api/agent/rooms` | ส่งรูปทุกห้อง + ปุ่มเลือกห้อง |
| 2 | เลือก PRIME ROOM | `GET /api/agent/rooms/{id}` | รายละเอียด + ถามวันที่ |
| 3 | “พรุ่งนี้” | `GET /api/agent/availability?room=&date=` | ส่ง `text` ตารางเวลา + ปุ่ม slot |
| 4 | เลือก 10:00–11:30 | `POST /api/agent/availability` | ยืนยันว่ายังว่าง + ถามจำนวนคน |
| 5 | “4 คน” | `POST /api/agent/bookings` (`dryRun: true`) | สรุปให้ตรวจ + ถามหัวข้อประชุม |
| 6 | “ประชุมทีมขาย” | `POST /api/agent/bookings` | ตอบ `text` สรุปการจอง + รหัส |

**เคล็ดลับสำหรับคำสั่งเสียง**: ให้ LLM แปลงคำพูดเป็น `date` (YYYY-MM-DD) และ `startTime`/`durationMinutes` ก่อน
แล้วค่อยเรียก API — ชื่อห้องส่งเป็นคำที่ผู้ใช้พูดได้เลย (`"ไพร์ม"` ใช้ไม่ได้ แต่ `"prime"` / `"PRIME ROOM"` / `"meeting"` ใช้ได้)

---

## 8. Tool definitions (สำหรับ function calling)

```json
[
  { "name": "list_rooms", "description": "ดูรายการห้องประชุมทั้งหมดพร้อมรูปและราคา",
    "parameters": { "type": "object", "properties": { "attendees": { "type": "integer" } } } },
  { "name": "check_availability", "description": "ดูช่วงเวลาว่างของห้องในวันที่กำหนด",
    "parameters": { "type": "object",
      "properties": { "room": { "type": "string" }, "date": { "type": "string" },
                      "startTime": { "type": "string" }, "endTime": { "type": "string" } },
      "required": ["date"] } },
  { "name": "create_booking", "description": "ลงการจองห้องประชุมเข้าระบบ",
    "parameters": { "type": "object",
      "properties": { "room": { "type": "string" }, "date": { "type": "string" },
                      "startTime": { "type": "string" }, "endTime": { "type": "string" },
                      "title": { "type": "string" }, "attendees": { "type": "integer" },
                      "telegramUserId": { "type": "string" }, "dryRun": { "type": "boolean" } },
      "required": ["room", "date", "startTime", "title", "telegramUserId"] } },
  { "name": "cancel_booking", "description": "ยกเลิกการจองตามรหัส",
    "parameters": { "type": "object",
      "properties": { "reference": { "type": "string" }, "reason": { "type": "string" },
                      "telegramUserId": { "type": "string" } },
      "required": ["reference"] } }
]
```

---

## 9. ตัวอย่าง curl

```bash
KEY="<AGENT_API_KEY>"
BASE="https://easy-space-meeting-room-yjqk.vercel.app"

curl -H "Authorization: Bearer $KEY" "$BASE/api/agent/rooms"

curl -H "Authorization: Bearer $KEY" \
  "$BASE/api/agent/availability?room=prime&date=2026-08-25"

curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"mode":"member","room":"prime","date":"2026-08-25","startTime":"10:00",
       "endTime":"11:30","title":"ประชุมทีมขาย","attendees":4,
       "memberEmail":"hello@thunder.in.th"}' \
  "$BASE/api/agent/bookings"
```

---

## 10. การตั้งค่า

ตัวแปรเดียวที่ต้องมีคือ `AGENT_API_KEY` — ตั้งไว้แล้วบน Vercel (Production) และใน `.env.local`
เปลี่ยนคีย์ได้ด้วย `vercel env rm AGENT_API_KEY production && vercel env add AGENT_API_KEY production`
ถ้าไม่ได้ตั้งค่า API จะตอบ `503 not_configured` ทุกเส้นทาง (fail closed)

โค้ดอยู่ที่:
- `src/lib/agent-api/core.ts` — auth, slot grid, ราคา, ข้อความสำเร็จรูป
- `src/lib/agent-api/members.ts` — ผูก Telegram user เข้ากับสมาชิก (เก็บใน settings `agent.telegram_links`)
- `src/lib/agent-api/bookings.ts` — รูปแบบข้อมูลการจอง
- `src/app/api/agent/**` — route handlers
