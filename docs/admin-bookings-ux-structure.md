# โครงสร้าง UX/UI — หน้า `/admin/bookings` (ลงข้อมูลการจอง)

เอกสารนี้สรุป "โครงกระดูก" ของหน้าฟอร์มจองห้องฝั่งแอดมิน เพื่อใช้เป็น
ต้นแบบ (reference) สำหรับออกแบบหน้าฟอร์มที่ซับซ้อนแบบ 2 คอลัมน์
(ฟอร์ม + พรีวิว/สรุป real-time)

> ที่มาของโค้ด: `src/app/admin/bookings/page.tsx` + `src/app/admin/bookings/booking-form.tsx`

---

## 1. แนวคิดหลัก (Design Intent)

หน้านี้คือ **"ฟอร์มกรอกซ้าย + พรีวิวผลลัพธ์ขวา"** ที่อัปเดตแบบ real-time:

- **ซ้าย (40%)** = กรอกข้อมูล (ใคร / ห้องไหน / เงิน)
- **ขวา (60%)** = เห็นผลทันที (ปฏิทินเวลาว่าง + สรุปค่าบริการที่ลอยตาม scroll)
- ผู้ใช้ไม่ต้อง "กดส่งแล้วลุ้น" — เห็นราคา, เวลาชนกัน, และความคุ้มของแพ็กเกจตลอดเวลา

หลักการ UX 3 ข้อที่ทั้งหน้าออกแบบมารองรับ:
1. **ลดข้อผิดพลาด** — ตรวจเวลาทับซ้อน real-time, เตือนส่วนลดเกิน, ปิดปุ่มเมื่อ invalid
2. **เร่งความเร็ว** — AI จับลูกค้าเก่าอัตโนมัติ, autosave draft, เลือกช่วงเวลาเป็น range
3. **โปร่งใส** — สรุปยอดแยกบรรทัด (มัดจำ/ชำระแล้ว/คงเหลือ), บอกว่าจะส่งเข้า Telegram

---

## 2. Stack & Design Primitives

| ชั้น | ใช้อะไร |
|------|---------|
| Framework | Next.js App Router (Server Component ดึงข้อมูล → ส่ง props ให้ Client Component) |
| รูปแบบหน้า | `page.tsx` = Server (`force-dynamic`, ดึง rooms/addons/promotions แบบ parallel) · `booking-form.tsx` = `"use client"` |
| UI kit | `@/components/ui/*` → `Card`, `CardHeader`, `CardTitle`, `Input`, `Label`, `Select`, `Textarea`, `Button`, `Badge` |
| Layout เพจ | `@/components/admin/topbar` (`AdminTopbar`) + `@/components/admin/page-header` (`PageHeader`) |
| ไอคอน | `lucide-react` (Search, Sparkles, Check, AlertTriangle, Users, Calendar, Tag, Save …) |
| Utils | `cn()` (รวม className), `formatBaht()`, `date-fns/format` |
| Data actions | `createBooking`, `checkBookingConflict`, `searchCustomers`, `listDayBookings` |

---

## 3. ลำดับชั้นคอมโพเนนต์ (Component Tree)

```
BookingsPage (server)
├─ AdminTopbar            ← แถบบนสุด: title + subtitle
└─ PageHeader             ← หัวข้อหน้า: title + description
   └─ BookingForm (client)
      ├─ FuzzyMatchModal              (popup AI จับลูกค้าซ้ำ — แสดงตามเงื่อนไข)
      └─ <form> grid 12 คอลัมน์
         ├─ LEFT  (col-span-5)  ────────────────
         │  ├─ Card "ข้อมูลผู้จอง"
         │  │   ├─ Input ชื่อ + dropdown suggestion (AI)
         │  │   ├─ Input เบอร์ / Email   (2 คอลัมน์)
         │  │   ├─ Input จำนวนผู้เข้าประชุม
         │  │   ├─ Select ประเภท / ที่มา (2 คอลัมน์)
         │  │   └─ Input รายละเอียดที่มา
         │  ├─ Card "เลือกห้อง"
         │  │   ├─ grid RoomCard (2 คอลัมน์)
         │  │   └─ Room detail panel (amenities / perks / packages)
         │  └─ Card "การเงิน & บริการเสริม"
         │      ├─ ปุ่มสถานะชำระเงิน (4 ปุ่ม toggle)
         │      ├─ ฟิลด์มัดจำ/ชำระ (แสดงตามสถานะ)
         │      ├─ checkbox บริการเสริม (addons)
         │      ├─ Select โปรโมชั่น (auto)
         │      ├─ Input ส่วนลด + หมายเหตุ
         │      └─ Textarea หมายเหตุ
         └─ RIGHT (col-span-7) ────────────────
            ├─ Card "ปฏิทิน"
            │   ├─ CardHeader: วันที่ + Input date picker
            │   ├─ SlotLegend          (คำอธิบายสี 5 สถานะ)
            │   ├─ SlotPicker          (grid ช่วงเวลา 30 นาที)
            │   ├─ รายการจองในวันนี้    (list)
            │   └─ แถบสถานะเวลา         (กำลังตรวจ / ทับซ้อน / ว่าง)
            └─ Card "สรุปค่าบริการ"  (sticky top-24)
                ├─ Header gradient + Badge real-time/draft
                ├─ Feedback banner (success/info/error)
                ├─ SummaryRow หลายบรรทัด (ห้อง/วันที่/เวลา/ชม./ราคา…)
                ├─ การ์ดความคุ้มแพ็กเกจ / upsell
                ├─ ยอดรวมสุทธิ (ตัวใหญ่)
                ├─ grid 3 ช่อง: มัดจำ / ชำระแล้ว / คงเหลือ
                └─ footer: ปุ่ม Save Draft + บันทึกการจอง
```

---

## 4. โครงกริดหลัก (Layout Grid)

```
┌──────────────────────── AdminTopbar ────────────────────────┐
├──────────────────────── PageHeader ─────────────────────────┤
│ container: p-6 lg:p-8 · max-w-[1600px] · mx-auto · space-y-5 │
│                                                              │
│  <form> grid-cols-1  xl:grid-cols-12  gap-5                  │
│  ┌─────────────── 5/12 ───────────────┬──────── 7/12 ──────┐│
│  │ LEFT — ฟอร์ม (space-y-5)           │ RIGHT — พรีวิว     ││
│  │ • ข้อมูลผู้จอง                     │ • ปฏิทิน+slot     ││
│  │ • เลือกห้อง                        │ • สรุป (sticky)   ││
│  │ • การเงิน                          │                    ││
│  └────────────────────────────────────┴────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

- มือถือ/แท็บเล็ต: `grid-cols-1` (ซ้อนกันแนวตั้ง)
- จอใหญ่ (`xl:`): แยก 12 คอลัมน์ → ซ้าย `col-span-5` (~40%), ขวา `col-span-7` (~60%)
- ทุก Card คั่นด้วย `space-y-5`; ภายใน Card ใช้ `space-y-4`

**กฎสำคัญ:** การ์ด "สรุปค่าบริการ" ใช้ `sticky top-24` — เลื่อนหน้าลงไปกรอกฟอร์มยาว ๆ
สรุปยอด+ปุ่มบันทึกยังลอยติดตามอยู่เสมอ (ไม่ต้อง scroll กลับขึ้นไปกด)

---

## 5. คอลัมน์ซ้าย — Sections การกรอก

แต่ละกลุ่มห่อด้วย `<Card>` + `<CardHeader><CardTitle>…</CardTitle></CardHeader>`

### 5.1 ข้อมูลผู้จอง
- Input ชื่อ + **dropdown suggestion ลอย** (`absolute … z-30`) ที่โผล่ตอนพิมพ์
  - แต่ละ suggestion = avatar ตัวอักษรแรก + ชื่อ + เบอร์/อีเมล + สถิติ (จองกี่ครั้ง/ยอดรวม/% similarity) + tag
- ฟิลด์คู่ใช้ `grid grid-cols-2 gap-3` (เบอร์/Email, ประเภท/ที่มา)
- มี hint บรรทัดเล็ก (`text-[11px] text-ink-3`) อธิบายว่า AI ทำงานยังไง

### 5.2 เลือกห้อง
- `CardHeader` มี title + จำนวนห้องทางขวา
- `grid grid-cols-1 md:grid-cols-2 gap-3` ของ `RoomCard` (เลือกได้ทีละห้อง)
- เมื่อเลือกห้อง → โผล่ **detail panel** ด้านล่าง (แถบสีห้อง + capacity/ราคา + amenities + perks + packages)

### 5.3 การเงิน & บริการเสริม
- **สถานะชำระเงิน** = ปุ่ม toggle 4 ช่อง (`grid-cols-4`) สไตล์ segmented
- ฟิลด์เพิ่มเติม **แสดงตามเงื่อนไข**: `deposit` → ช่องมัดจำ+คงเหลือ, `paid` → ช่องจำนวนที่ชำระ
- addons = รายการ checkbox + ราคา
- โปรโมชั่น = `Select` (กรองเฉพาะที่ใช้กับห้องที่เลือก) + บรรทัดยืนยันการหักลบอัตโนมัติ
- ส่วนลด: validate ทันที — ถ้าเกินยอดรวม กรอบแดง + ข้อความเตือน

---

## 6. คอลัมน์ขวา — Preview / Summary

### 6.1 ปฏิทิน + SlotPicker
- `CardHeader`: ชื่อเดือน/วันที่ (จาก `date-fns`) + `Input type="date"` ปรับวัน
- `<SlotLegend />` — คำอธิบายสี 5 สถานะ: ว่าง / กำลังเลือก / เลือกแล้ว / ถูกจอง / กำลังใช้
- `<SlotPicker />` — grid ช่วงเวลา 30 นาที (`grid-cols-6 sm:grid-cols-8`), คลิกเลือกเป็น **ช่วง (range)**
- **รายการจองในวันนี้** — list ที่แสดงสถานะ (จุดสี + reference code + ช่วงเวลา + ชื่อ + Badge)
- **แถบสถานะเวลา** (แสดงเมื่อเลือก slot): 3 สถานะ
  - กำลังตรวจ (จุด pulse) → ทับซ้อน (กล่องแดง + list การจองที่ชน) → ว่าง (กล่องเขียว)

### 6.2 สรุปค่าบริการ (sticky)
- Header gradient (`from-primary-50 to-white`) + Badge `Real-time` / สถานะ draft
- Feedback banner เปลี่ยนสีตามชนิด: success(เขียว) / info(เหลือง) / error(แดง)
- `SummaryRow` หลายบรรทัด (label ซ้าย / value ขวา tabular-nums)
- การ์ด upsell: "ใช้แพ็กเกจคุ้มกว่า" / "แนะนำแพ็กเกจถัดไป"
- **ยอดรวมสุทธิ** ตัวใหญ่ (`text-xl text-primary-600`)
- grid 3 ช่อง: มัดจำ / ชำระแล้ว / คงเหลือ (คงเหลือ > 0 → โทนเหลืองเตือน)
- Footer: ปุ่ม `Save Draft` (secondary) + `บันทึกการจอง` (gradient)
  - ปุ่มหลัก **disabled** เมื่อ: กำลังบันทึก / มีเวลาทับซ้อน / ส่วนลดเกิน — และข้อความปุ่มเปลี่ยนตามเหตุผล

---

## 7. Sub-components ที่ reuse ได้

| Component | หน้าที่ | Pattern UI |
|-----------|---------|------------|
| `RoomCard` | การ์ดเลือกห้อง | คลิกเลือก, แสดงแถบสี/ความจุ/ราคา/amenities |
| `SlotLegend` | คำอธิบายสีสถานะ | แถว chip สี + label (`text-[10px]`) |
| `SlotPicker` | grid เลือกช่วงเวลา | ปุ่ม slot 30 นาที, สีตามสถานะ, hover preview, เลือกเป็น range |
| `SummaryRow` | บรรทัดสรุป | label–value, รองรับ tone `danger` |
| `FuzzyMatchModal` | popup ยืนยันลูกค้าซ้ำ | modal: ใช้ลูกค้าเดิม / สร้างใหม่ |

---

## 8. Design Tokens & Conventions

โทเค็นที่ใช้ซ้ำทั้งหน้า (อิงดีไซน์ระบบของโปรเจกต์):

```
สี
  primary-50/100/500/600/700   = สีหลัก (ฟ้า-น้ำเงิน) ปุ่ม/ไฮไลต์/ลิงก์
  ink-1 / ink-2 / ink-3        = ลำดับสีตัวอักษร (เข้ม → จาง)
  line / line-soft             = เส้นขอบ (ปกติ / อ่อน)
  surface-subtle               = พื้นหลังกล่องรอง
  สถานะ: emerald(สำเร็จ) · amber(เตือน/กำลังใช้) · red(ผิดพลาด/ทับซ้อน)

ตัวอักษร
  หัวข้อ: font-bold tracking-tight
  ป้ายเล็ก: text-[10px]/[11px] uppercase tracking-[0.06em]–[0.08em] text-ink-3
  ตัวเลข: tabular-nums (จัดหลักตรง)
  *** ไม่ใช้ emoji ใน UI · letter-spacing แน่น ***

ระยะ & รูปทรง
  radius: rounded-input (ฟิลด์/ปุ่มเล็ก) · rounded-pill (chip/badge) · rounded-card-sm
  เงา: shadow-card → hover:shadow-card-hover
  ระยะกลุ่ม: space-y-5 (ระหว่าง Card) · space-y-4 (ในกลุ่ม) · gap-2/gap-3 (ฟิลด์คู่)
  ฟิลด์สูง h-11 · ปุ่มเล็ก h-9
```

---

## 9. UX Patterns สำคัญ (จุดที่ลอกไปใช้ได้)

1. **Two-pane form + live preview** — กรอกซ้าย เห็นผลขวา ลดการ "เดา"
2. **Sticky summary/action bar** — สรุป+ปุ่มหลักลอยตาม scroll เสมอ
3. **Real-time validation** — ตรวจเวลาทับซ้อน (debounce) + เตือนส่วนลดเกิน + disable ปุ่มพร้อมบอกเหตุผลบนปุ่ม
4. **AI assist แบบไม่ขวางทาง** — suggestion ลอย + auto-confirm เมื่อมั่นใจ, popup เฉพาะตอนก้ำกึ่ง
5. **Progressive disclosure** — ฟิลด์มัดจำ/ชำระโผล่เฉพาะเมื่อเลือกสถานะนั้น
6. **Segmented toggle** แทน dropdown สำหรับตัวเลือกน้อย ๆ (สถานะชำระเงิน)
7. **Autosave draft** + Badge บอกสถานะ (`บันทึกร่าง` / `กู้ร่างเดิม`)
8. **Range selection** บน grid เวลา (คลิกหัว-ท้าย เลือกทั้งช่วง)
9. **Legend + สีสื่อสถานะ** ให้ผู้ใช้อ่าน grid ได้โดยไม่ต้องเดา
10. **Conditional CTA copy** — ข้อความปุ่มเปลี่ยนตามสถานะ (บันทึก / เวลาทับซ้อน / ส่วนลดเกิน / กำลังบันทึก)

---

## 10. ภาพรวม State (ใน `BookingForm`)

จัดกลุ่มด้วย `useState`/`useMemo`/`useTransition`:

```
customer {name, phone, email, type, source, sourceDetail}
selectedRoomId · attendees · date · selectedSlots[] · hoverSlot
paymentStatus · depositAmount · paidAmount · addonsSelected[] · promotionId · discount · discountNote · notes
suggestions[] · fuzzyMatch · showSuggestions          (AI ลูกค้า)
dayBookings[] · bookedSlotSet · conflicts[] · conflictChecking   (ปฏิทิน/ชนเวลา)
summary (useMemo: hours, baseAmount, addonsAmount, savings, nextPackage)
feedback · draftStatus · pending(useTransition)
```

> ดาต้าไหลทางเดียว: แก้ฟิลด์ซ้าย → คำนวณ `summary`/conflict → render พรีวิวขวา → submit ผ่าน server action `createBooking`
