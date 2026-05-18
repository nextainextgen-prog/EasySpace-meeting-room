# EasySpace — ระบบจองห้องประชุม

ระบบจัดการและจองห้องประชุมแบบครบวงจรสำหรับตึก/อาคารสำนักงาน — ครอบคลุมตั้งแต่หลังบ้านแอดมิน, การเงิน, CRM, การวิเคราะห์ลูกค้า, โปรโมชั่น ไปจนถึง portal สำหรับพนักงานในตึก

## Stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS v3 + custom design tokens (`#2D4EF5` primary)
- **Fonts:** Plus Jakarta Sans + IBM Plex Sans Thai (via `next/font`)
- **Icons:** lucide-react (no emojis in UI)
- **Database:** Supabase (Postgres + Auth + Storage + Realtime)
- **AI:** Google Gemini (`gemini-2.0-flash`) — fuzzy match, daily brief, anomaly detection
- **Notifications:** Telegram Bot API (single supergroup with topic threads)
- **Email:** Resend
- **Auth:** Supabase Auth + Google OAuth (planned)
- **Deployment:** Vercel

## Project structure

```
src/
├─ app/
│  ├─ admin/            หลังบ้านแอดมิน (Dashboard, Calendar, Bookings, ...)
│  ├─ app/              Internal user portal (member dashboard)
│  ├─ book/[code]/      Invite landing page
│  ├─ login/            Login page
│  └─ api/              Route handlers (auth callback, cron, telegram)
├─ components/
│  ├─ ui/               Design system primitives (Button, Card, KPI, Hero, ...)
│  └─ admin/            Admin shell (Sidebar, Topbar, PageHeader)
└─ lib/
   ├─ integrations/     Supabase, Gemini, Telegram, Google Calendar
   ├─ mocks/            Mock data (replaceable with Supabase queries)
   ├─ format/           Date/currency helpers
   ├─ icons.ts          Lucide icon mapping
   └─ types/            Shared TypeScript types

supabase/migrations/
├─ 00000000000001_init.sql   Full schema (rooms, bookings, customers, ...)
└─ 00000000000002_seed.sql   Default rooms, addons, telegram routes
```

## Quick start

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, RESEND_API_KEY, ...

npm install
npm run dev          # http://localhost:3000
```

### Type check / build

```bash
npm run typecheck
npm run build
```

## Telegram setup (single supergroup with topics)

ระบบใช้ supergroup เดียว + แตกหัวข้อด้วย `message_thread_id`:

1. สร้าง bot ผ่าน `@BotFather` → เก็บ `TELEGRAM_BOT_TOKEN`
2. สร้าง Telegram supergroup, เปิด Topics (forum), เพิ่ม bot เป็น admin
3. หา `chat_id` (negative number) → ใส่ใน `TELEGRAM_DEFAULT_CHAT_ID`
4. เปิด topic ละหัวข้อตาม spec ("รายการจองห้องประชุม", "ยอดเข้าไม่พัก", "ติดตามสถานะ"), หา `topic_id` (message_thread_id)
5. ใส่ `topic_id` ในหน้า `/admin/settings/notifications` ต่อ event

## Routes implemented (Phase 1)

| Route                              | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `/admin/dashboard`                 | KPI strip · AI Brief · Today's Schedule · Cash Flow  |
| `/admin/calendar`                  | Multi-room day timeline · drag & drop preview        |
| `/admin/bookings`                  | Booking form 40% + helper calendar 60%               |
| `/admin/customers`                 | CRM list + segment sidebar                           |
| `/admin/customers/analytics`       | RFM quadrant + Cohort heatmap + AI insights         |
| `/admin/finance`                   | Hero income · KPI · 12-month cash flow · outstanding |
| `/admin/promotions`                | Promotion cards · ROI tracking                       |
| `/admin/notifications`             | In-app notification feed                             |
| `/admin/users`                     | Admins · Organizations · Audit Log tabs              |
| `/admin/settings`                  | Settings hub (36 sections)                           |
| `/admin/settings/notifications`    | Telegram topic routing per event                     |
| `/admin/settings/rooms`            | Rooms + packages CRUD                                |
| `/app`                             | Internal user dashboard                              |
| `/book/[code]`                     | Invite landing page                                  |
| `/login`                           | Login (Google OAuth + email)                         |

## Roadmap (4 phases)

See `/Users/mx/Desktop/ระบบจองห้องประชุม/Plan - หน้าผู้ใช้งาน (Roadmap).md`.

- **Phase 0** (this build): schema, design system, integrations skeleton, page shells.
- **Phase 1**: wire pages to Supabase, Telegram, Gemini.
- **Phase 2**: Org Admin portal, Customer Analytics, Promotions wizard.
- **Phase 3**: AI advanced (forecast, OCR, voice brief), Calendar sync, e-Tax.

## License

Private — for EasySpace deployment only.
