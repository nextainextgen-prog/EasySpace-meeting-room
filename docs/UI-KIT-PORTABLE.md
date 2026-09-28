# Portable UI Kit — สเปกสำหรับส่งต่อให้ AI ตัวอื่นสร้างงานแนวเดียวกัน

ไฟล์นี้คือ "ดีเอ็นเอหน้าตา" ของระบบหลังบ้าน EasySpace ที่ถอดโดเมนออกหมดแล้ว
ส่งไฟล์นี้ไฟล์เดียวให้ AI (Claude / Cursor / v0 / ฯลฯ) แล้วสั่งว่าจะทำระบบอะไร
มันจะได้หน้าตาแนวเดียวกันโดยไม่ต้องเห็นโค้ดเดิม

---

## 0. Prompt ที่ใช้สั่ง AI

> อ่านสเปกใน UI-KIT-PORTABLE.md แล้วสร้างระบบจัดการเว็บไซต์ร้านคาเฟ่ (admin)
> ด้วย Next.js App Router + TypeScript + Tailwind
> ต้องทำตามสเปกนี้ **ทุกข้อ** ห้ามใช้ default ของ Tailwind/shadcn มาทับ:
> - ก๊อป section 2 (tailwind.config) และ section 3 (globals.css) มาตรงตัว
> - สร้าง `src/components/ui/*` ตาม contract ใน section 4 ก่อนเขียนหน้าใดๆ
> - ทุกหน้าใน `/admin/*` ต้องตามโครงใน section 5 และสูตรหน้าใน section 7
> - เคารพกฎเหล็กใน section 1 โดยเฉพาะเรื่อง "ห้าม emoji"
> ขอบเขตงาน: (แปะ section 8 — feature map ของร้านคาเฟ่)

---

## 1. กฎเหล็ก (ผิดข้อไหนถือว่าไม่ผ่าน)

1. **ห้าม emoji ใน UI ทุกกรณี** — ใช้ไอคอน `lucide-react` (`strokeWidth={1.75}`) หรือจุดสี `.dot` แทน
2. **ตัวอักษรชิด** — body `letter-spacing: -0.011em`, หัวข้อ `-0.02em`, ตัวเลขใหญ่ `tracking-tighter`
3. **ตัวเลขใช้ `tabular-nums` เสมอ** (KPI, ราคา, เวลา) จะได้ไม่กระตุกตอนอัปเดต
4. **ไม่มีเงาหนัก ไม่มีเส้นขอบเข้ม** — ใช้ `shadow-card` + `border-line` เท่านั้น ความลึกมาจากพื้นหลังเทา (`surface-page`) ตัดกับการ์ดขาว
5. **ปุ่มเป็นแคปซูลเสมอ** (`rounded-pill`) — ไม่มีปุ่มเหลี่ยม
6. **สีหลักใช้แค่จุดเดียวต่อหน้าจอ** — hero หรือปุ่ม primary อย่างใดอย่างหนึ่ง อย่าให้น้ำเงินท่วมจอ
7. **สีสถานะสื่อความหมายเท่านั้น** (success/warning/danger/info) ห้ามใช้เพื่อความสวย
8. **ทุก state ต้องมีของจริง** — loading (skeleton), empty (EmptyState), error ห้ามปล่อยหน้าโล่ง
9. **โฟกัสต้องเห็น** — `focus-visible:ring-4 ring-primary-100`
10. **ภาษาไทยเป็นหลัก** — label/ปุ่ม/สถานะเป็นไทย, ชื่อเมนูระบบ (Dashboard) คงอังกฤษได้

---

## 2. `tailwind.config.ts` — ก๊อปตรงตัว

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-jakarta)", "var(--font-plex-thai)",
               "Plus Jakarta Sans", "IBM Plex Sans Thai", "Inter",
               "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // <<< จุดเดียวที่เปลี่ยนได้เมื่อเปลี่ยนแบรนด์ (ดู section 9)
        primary: {
          50: "#EEF2FF", 100: "#E0E7FF", 200: "#C7D2FE", 300: "#A5B4FC",
          400: "#7C8EF9", 500: "#3B5BDB", 600: "#2D4EF5", 700: "#1E3AE8",
          800: "#1730BD", 900: "#0F1F8F",
        },
        ink:     { 1: "#0F172A", 2: "#475569", 3: "#94A3B8" },
        surface: { page: "#F5F7FA", card: "#FFFFFF", subtle: "#F8FAFC" },
        line:    { DEFAULT: "#E8ECF2", soft: "#F1F4F8" },
        status:  { success: "#10B981", warning: "#F59E0B",
                   danger: "#EF4444", info: "#3B82F6" },
      },
      borderRadius: {
        card: "20px", "card-lg": "24px", "card-sm": "16px",
        pill: "999px", input: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.03)",
        "card-hover": "0 4px 16px rgba(45,78,245,0.08)",
        hero: "0 12px 32px rgba(45,78,245,0.20)",
        pop: "0 8px 24px rgba(15,23,42,0.10)",
      },
      letterSpacing: { tightest: "-0.025em", tighter: "-0.02em", tight: "-0.015em" },
      backgroundImage: {
        "primary-gradient": "linear-gradient(135deg, #2D4EF5 0%, #4F6FFC 100%)",
        "primary-gradient-deep": "linear-gradient(135deg, #1E3AE8 0%, #3B5BDB 100%)",
      },
      transitionTimingFunction: { "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)" },
    },
  },
  plugins: [],
};
export default config;
```

**ความหมายของ token (AI ต้องเข้าใจ ไม่ใช่แค่ก๊อป):**

| กลุ่ม | ใช้ตอนไหน |
|---|---|
| `ink-1` | ข้อความหลัก หัวข้อ ตัวเลข |
| `ink-2` | ข้อความรอง, label, ปุ่ม ghost |
| `ink-3` | คำอธิบาย, placeholder, eyebrow |
| `surface-page` | พื้นหลังทั้งหน้า (เทา) |
| `surface-card` | การ์ดขาวที่ลอยอยู่บนพื้นเทา |
| `surface-subtle` | พื้นที่ยุบลงไป เช่น footer modal, hover ghost |
| `line` / `line-soft` | ขอบการ์ด / เส้นคั่นภายในการ์ด |
| `rounded-card` 20px | การ์ดปกติ, modal |
| `rounded-input` 12px | input, ปุ่มเมนู, icon tile |
| `rounded-pill` | ปุ่มทุกตัว, badge |

---

## 3. `globals.css` — ก๊อปตรงตัว

```css
@tailwind base; @tailwind components; @tailwind utilities;

@layer base {
  :root {
    --bg-page:#f5f7fa; --bg-card:#fff; --bg-subtle:#f8fafc;
    --line:#e8ecf2; --line-soft:#f1f4f8;
    --ink-1:#0f172a; --ink-2:#475569; --ink-3:#94a3b8;
    --primary-50:#eef2ff; --primary-100:#e0e7ff; --primary-500:#3b5bdb;
    --primary-600:#2d4ef5; --primary-700:#1e3ae8; --primary-800:#1730bd;
  }
  html {
    font-family: var(--font-jakarta), var(--font-plex-thai), "Plus Jakarta Sans",
      "IBM Plex Sans Thai", "Inter", ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  body { background: var(--bg-page); color: var(--ink-1); letter-spacing: -0.011em; }
  * { box-sizing: border-box; }
  h1, h2, h3, h4 { letter-spacing: -0.02em; }
  .tabular-nums { font-variant-numeric: tabular-nums; }
}

@layer utilities {
  .scrollbar-thin::-webkit-scrollbar { width:8px; height:8px; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background:#d4dae3; border-radius:8px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }

  .surface-card {
    background: var(--bg-card); border: 1px solid var(--line); border-radius: 20px;
    box-shadow: 0 1px 3px rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.03);
  }
  .surface-hero {
    background: linear-gradient(135deg,#2d4ef5 0%,#4f6ffc 100%);
    border-radius: 24px; box-shadow: 0 12px 32px rgba(45,78,245,.2); color:#fff;
  }
  .surface-subtle {
    background: var(--bg-subtle); border: 1px solid var(--line-soft); border-radius: 16px;
  }

  .pill-success { background:#d1fae5; color:#065f46; }
  .pill-warning { background:#fef3c7; color:#92400e; }
  .pill-danger  { background:#fee2e2; color:#991b1b; }
  .pill-info    { background:#dbeafe; color:#1e40af; }
  .pill-muted   { background: var(--line-soft); color: var(--ink-2); }

  /* จุดบอกสถานะ — ใช้แทน emoji */
  .dot { display:inline-block; width:8px; height:8px; border-radius:999px; }
  .dot-success{background:#10b981} .dot-warning{background:#f59e0b}
  .dot-danger{background:#ef4444}  .dot-info{background:#3b82f6}
  .dot-muted{background:#cbd5e1}
}

@keyframes shimmer { 0%{background-position:-1000px 0} 100%{background-position:1000px 0} }
.skeleton {
  background: linear-gradient(90deg,#eef2f7 0%,#f8fafc 50%,#eef2f7 100%);
  background-size: 1000px 100%; animation: shimmer 1.5s ease-in-out infinite;
}
.kbd {
  display:inline-block; padding:1px 5px; border:1px solid var(--line); border-bottom-width:2px;
  border-radius:4px; background:#fff; font-family:ui-monospace,SFMono-Regular,monospace;
  font-size:10px; color:var(--ink-2); line-height:1.2; vertical-align:middle;
}
```

ฟอนต์โหลดผ่าน `next/font/google` ที่ root layout:
```tsx
const jakarta  = Plus_Jakarta_Sans({ subsets:["latin"], display:"swap",
  variable:"--font-jakarta", weight:["400","500","600","700","800"] });
const plexThai = IBM_Plex_Sans_Thai({ subsets:["thai"], display:"swap",
  variable:"--font-plex-thai", weight:["300","400","500","600","700"] });
// <html lang="th" className={`${jakarta.variable} ${plexThai.variable}`}>
//   <body className="bg-surface-page text-ink-1 antialiased">
```

---

## 4. Component contract — `src/components/ui/*`

สร้างครบ 11 ตัวนี้ก่อนเขียนหน้าใดๆ ทุกตัวรับ `className` และ merge ด้วย
`cn()` = `twMerge(clsx(...))` (`src/lib/cn.ts`)

| ไฟล์ | export | props สำคัญ | สเปกหน้าตา |
|---|---|---|---|
| `button.tsx` | `Button` | `variant` primary\|gradient\|secondary\|ghost\|danger, `size` sm\|md\|lg, `iconLeft/iconRight` | `rounded-pill`, `font-medium`, `active:scale-[0.98]`, `focus-visible:ring-4 ring-primary-100`, สูง 36/40/48px |
| `card.tsx` | `Card` `CardHeader` `CardTitle` `CardSubtitle` `CardBody` `CardFooter` | — | `Card`=`surface-card p-6`; Title=`text-lg font-semibold tracking-tight`; Subtitle=`text-xs text-ink-3`; Footer=`mt-5 pt-5 border-t border-line-soft` |
| `badge.tsx` | `Badge` | `tone` success\|warning\|danger\|info\|muted\|primary | `rounded-pill px-2.5 py-1 text-[11px] font-medium` map ไป `.pill-*` |
| `input.tsx` | `Input` `Textarea` `Select` `Label` | `iconLeft` (Input) | สูง `h-11`, `rounded-input`, `border-line`, focus = `border-primary-600 ring-4 ring-primary-50`; Select ใช้ลูกศร SVG inline (ไม่ใช่ appearance ของเบราว์เซอร์); Label = `text-xs font-medium text-ink-2 mb-1.5` |
| `icon-tile.tsx` | `IconTile` | `icon` (LucideIcon), `tone`, `size` sm\|md\|lg | สี่เหลี่ยมมนใส่ไอคอน พื้น `*-50` ไอคอน `*-600`; 32/40/48px |
| `kpi-card.tsx` | `KpiCard` | `label` `value` `delta{value,suffix}` `icon` `hint` | การ์ดตัวเลข: label เล็ก uppercase `tracking-[0.06em]` มุมซ้าย + IconTile มุมขวา, ตัวเลข `text-[28px] font-bold tracking-tighter tabular-nums`, delta มีลูกศร TrendingUp/Down เขียว/แดง, hover `-translate-y-0.5 shadow-card-hover` |
| `hero-card.tsx` | `HeroCard` | `eyebrow` `value` `trailing` `cta` | `surface-hero` ไล่เฉดน้ำเงิน + วงกลมเบลอ `bg-white/10` ตกแต่งมุม, ตัวเลข `text-5xl tracking-tighter`, CTA เป็นแคปซูล `bg-white/15 backdrop-blur` |
| `modal.tsx` | `Modal` `ModalBody` | `open` `onClose` `title` `subtitle` `size` sm→3xl `footer` `headerTone` | สูงสุด `max-h-[calc(100dvh-2rem)]`, header/footer ตรึง เลื่อนเฉพาะ body, backdrop `bg-ink-1/40 backdrop-blur-sm`, ESC + คลิกพื้นหลังปิด, ล็อก `body.overflow`, header ไล่เฉด `from-primary-50 to-white` |
| `section-header.tsx` | `SectionHeader` | `eyebrow` `title` `subtitle` `actions` | หัวข้อในหน้า: eyebrow `text-[11px] uppercase tracking-[0.08em]`, title `text-xl font-bold tracking-tighter` |
| `empty-state.tsx` | `EmptyState` | `icon` `title` `description` `action` | `surface-card p-10` กลางจอ + IconTile lg tone muted |
| `image-uploader.tsx` | `ImageUploader` | ตามงาน | ลาก-วาง + พรีวิว, ใช้ตอนอัปโหลดรูป |

**Button variant ตรงตัว:**
```ts
primary:   "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-card"
gradient:  "bg-primary-gradient text-white hover:opacity-95 shadow-hero"
secondary: "bg-white text-ink-1 border border-line hover:bg-surface-subtle"
ghost:     "text-ink-2 hover:bg-surface-subtle"
danger:    "bg-red-50 text-red-700 hover:bg-red-100"
```
สังเกต: **danger เป็นปุ่มพื้นอ่อน ไม่ใช่แดงทึบ** — ปุ่มทึบสงวนไว้ให้ action หลักเท่านั้น

---

## 5. โครงหน้าจอ (App Router)

```
src/
  app/
    globals.css
    layout.tsx                 ← โหลดฟอนต์ + <body className="bg-surface-page text-ink-1">
    admin/
      layout.tsx               ← เช็คสิทธิ์ (server) + <AdminSidebar> + <main>
      loading.tsx              ← skeleton
      dashboard/page.tsx       ← page.tsx = server component (ดึงข้อมูล)
      dashboard/dashboard-shell.tsx  ← "use client" (interactive)
      <feature>/page.tsx
      <feature>/<feature>-board.tsx
      <feature>/<feature>-form.tsx / -modal.tsx
  components/
    ui/                        ← primitives ตาม section 4
    admin/  sidebar.tsx  topbar.tsx  page-header.tsx
  lib/  cn.ts  icons.ts  types.ts  auth.ts
```

**กติกาการแบ่งไฟล์ (สำคัญมาก):**
- `page.tsx` = **server component** เสมอ — ทำหน้าที่เช็คสิทธิ์ + ดึงข้อมูล แล้วส่ง props ลงไป ห้ามมี `"use client"`
- ส่วน interactive แยกเป็นไฟล์ `-board.tsx` / `-shell.tsx` / `-modal.tsx` ที่มี `"use client"` บนสุด
- ไฟล์ย่อยที่ใช้เฉพาะในหน้านั้นวางในโฟลเดอร์ของหน้านั้น นำหน้าด้วย `_` ถ้าไม่ใช่ route (`_nav.ts`)
- ไอคอน nav รวมศูนย์ที่ `lib/icons.ts` (`export const navIcons = { dashboard: LayoutDashboard, ... }`) แล้ว nav อ้างด้วย key ไม่ใช่ import ตรง

**Admin layout:**
```tsx
<div className="min-h-screen flex bg-surface-page">
  <AdminSidebar profile={...} />
  <main className="flex-1 min-w-0 flex flex-col">{children}</main>
</div>
```

---

## 6. Sidebar + Topbar spec

**Sidebar** (`w-60 hidden lg:flex`, `bg-white border-r border-line h-screen sticky top-0`):
1. โลโก้สูง `h-16` = ไทล์ `w-9 h-9 rounded-card-sm bg-primary-600` ใส่ไอคอน + ชื่อแบรนด์ `font-bold tracking-tight text-[15px]`
2. เมนู **จัดกลุ่มเป็น section** มีหัวข้อกลุ่ม `text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold`
3. เมนูปกติ `text-ink-2 hover:bg-surface-subtle` / **active** = `bg-primary-50 text-primary-700 font-medium` + **แถบ 3px `bg-primary-600` ชิดขอบซ้าย** (`absolute left-0 h-5 w-[3px] rounded-r`)
4. เมนูลูกใส่ `ml-3`
5. active ตัดสินจาก `pathname === href || pathname.startsWith(href + "/")`
6. ท้าย sidebar = อวาตาร์วงกลม (fallback = ตัวอักษรแรกบนพื้น `bg-primary-100`) + ชื่อ + ป้ายบทบาท + ปุ่มออกจากระบบ (hover เป็น `text-red-700`)
7. **กรองเมนูตามสิทธิ์** ด้วย rank: `ROLE_RANK[item.minRole] <= userRank` — ไม่มีสิทธิ์คือไม่เห็นเมนู (ไม่ใช่กดแล้วเด้ง)

**Topbar** (`h-16 sticky top-0 z-20`): `bg-white/85 backdrop-blur border-b border-line` — ซ้ายเป็น title/subtitle, ขวาเป็น actions + เมนูผู้ใช้

**PageHeader** (ในเนื้อหน้า): `h1` = `text-[28px] font-bold tracking-tighter text-primary-600` (หัวข้อหน้า **เป็นสีหลัก** ไม่ใช่สีดำ) + description `text-sm text-ink-3` + actions ชิดขวา

---

## 7. สูตรหน้ามาตรฐาน

**หน้า Dashboard**
```
PageHeader
HeroCard (ตัวเลขใหญ่สุดของธุรกิจวันนี้)
grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4  → KpiCard × 4
grid grid-cols-1 lg:grid-cols-3 gap-4                 → Card(กราฟ recharts, span-2) + Card(รายการล่าสุด)
```

**หน้า List/จัดการ**
```
PageHeader + actions=[Button primary "เพิ่ม…"]
Toolbar: Card p-4 → Input iconLeft={Search} + Select ตัวกรอง + Badge นับผลลัพธ์
Card p-0 → ตาราง: thead `bg-surface-subtle text-[11px] uppercase tracking-[0.06em] text-ink-3`,
           แถว `border-b border-line-soft hover:bg-surface-subtle/60`, สถานะเป็น Badge
ไม่มีข้อมูล → EmptyState  |  กำลังโหลด → .skeleton
```

**ฟอร์ม** — อยู่ใน `Modal` เสมอ (ไม่เปิดหน้าใหม่) เว้นแต่ฟอร์มยาวมาก:
`Label` → control → error `text-xs text-red-600 mt-1`; ปุ่มไปอยู่ที่ `footer` ของ Modal
(`Button ghost "ยกเลิก"` + `Button primary "บันทึก"`); react-hook-form + zod; toast ด้วย `sonner`

**Wizard หลายขั้น** — ใช้ `Modal size="2xl"` + แถบ step ด้านบน (จุดสี + เส้นเชื่อม, ขั้นที่ผ่านแล้ว `bg-primary-600`)

---

## 8. Feature map — ระบบจัดการเว็บไซต์ร้านคาเฟ่

โครงเดิมแมปมาตรงๆ ได้เลย (ซ้าย = ของเดิม เอาไว้ให้ AI เทียบแพตเทิร์น, ขวา = ของคาเฟ่)

| เดิม (EasySpace) | คาเฟ่ | หน้าที่ต้องมี |
|---|---|---|
| Dashboard | Dashboard | ยอดขายวันนี้ (HeroCard), KPI: ออเดอร์วันนี้ / ยอดเฉลี่ยต่อบิล / เมนูขายดี / ลูกค้าใหม่; กราฟยอดขาย 7 วัน; ออเดอร์ล่าสุด |
| ปฏิทินการจอง | ตารางออเดอร์ / รอบจองโต๊ะ | ตารางเวลาแบบ board |
| ลงข้อมูลการจอง | รับออเดอร์ / จองโต๊ะ | ฟอร์มใน Modal |
| ห้องประชุม (rooms) | **เมนูเครื่องดื่ม/อาหาร** | list + รูป (ImageUploader) + ราคา + หมวด + สถานะขาย/หมด (Badge) |
| — | **หมวดหมู่เมนู** | จัดลำดับ, เปิด/ปิดหมวด |
| ข้อมูลลูกค้า | สมาชิก/ลูกค้า | list + หน้ารายละเอียดแบบแท็บ |
| วิเคราะห์ลูกค้า | วิเคราะห์ยอดขาย | กราฟ + export |
| การเงิน | ยอดขาย/รายรับ | สรุปรายวัน/เดือน |
| โปรโมชั่น | โปรโมชั่น/คูปอง | wizard หลายขั้น + การ์ดพรีวิว |
| — | **จัดการหน้าเว็บ (CMS)** | Hero, About, แกลเลอรี, เวลาเปิด-ปิด, ที่อยู่/แผนที่, โซเชียล |
| — | **สาขา** | ถ้ามีหลายสาขา |
| การแจ้งเตือน | การแจ้งเตือน | — |
| ผู้ใช้งาน | พนักงาน | บทบาท: owner / manager / barista / viewer |
| บันทึกการใช้งาน | บันทึกการใช้งาน | audit log |
| ตั้งค่าระบบ | ตั้งค่าร้าน | — |
| บัญชีของฉัน | บัญชีของฉัน | โปรไฟล์, รหัสผ่าน, 2FA, sessions |

**กลุ่มเมนู sidebar ที่แนะนำ:** ภาพรวม (Dashboard, ออเดอร์) · เมนู (เมนู, หมวดหมู่, โปรโมชั่น) · ลูกค้า (สมาชิก, วิเคราะห์) · เว็บไซต์ (หน้าเว็บ, แกลเลอรี) · ระบบ (พนักงาน, ตั้งค่า, บัญชีของฉัน)

---

## 9. เปลี่ยนแบรนด์ให้เข้ากับคาเฟ่ (ทางเลือก)

โครงสร้าง/สเปซ/รัศมี/เงา **ห้ามแตะ** — เปลี่ยนแค่ 2 ที่คือ `colors.primary` ใน tailwind.config
กับ `--primary-*` + `.surface-hero` gradient ใน globals.css แล้วทั้งระบบเปลี่ยนตาม

โทนกาแฟที่ผ่านคอนทราสต์แล้ว (แทนน้ำเงินได้ตรงๆ):
```
50:#FAF6F2  100:#F3E9DF  200:#E7D3BF  300:#D4B295  400:#B98A63
500:#96633C  600:#7B4B2A  700:#63391F  800:#4A2A17  900:#331D10
gradient: linear-gradient(135deg, #7B4B2A 0%, #A2653A 100%)
```
เงา hero/`card-hover` ให้เปลี่ยน rgba เป็นสีเดียวกับ primary-600 ใหม่ (`rgba(123,75,42,…)`)
ส่วน `ink` / `surface` / `line` / `status` **ห้ามเปลี่ยน** — นั่นคือสิ่งที่ทำให้มันยัง "แนวเดียวกัน"

---

## 10. Stack ที่ต้องใช้ให้ตรง

`next@15` (App Router) · `react@18` · `tailwindcss@3.4` · `typescript`
`lucide-react` (ไอคอนตัวเดียวในระบบ) · `recharts` (กราฟ) · `sonner` (toast)
`react-hook-form` + `@hookform/resolvers` + `zod` (ฟอร์ม)
`clsx` + `tailwind-merge` (→ `cn()`) · `date-fns` + `date-fns-tz` (เวลา, TZ = Asia/Bangkok)

**ห้าม:** shadcn/ui หรือ component library อื่น (มันจะพารัศมี/เงา/สีของตัวเองเข้ามาจนหน้าตาเพี้ยน),
ไอคอนเซ็ตอื่น, ฟอนต์อื่น, dark mode (ระบบนี้เป็น light-only โดยตั้งใจ)

---

## 11. เช็กลิสต์ก่อนส่งงาน

- [ ] ไม่มี emoji ใน UI แม้แต่ตัวเดียว
- [ ] ไม่มี `rounded-md/lg/xl` ของ Tailwind default — ใช้ `card/card-sm/input/pill` เท่านั้น
- [ ] ไม่มี hex code ลอยในโค้ด — ใช้ชื่อ token ทั้งหมด
- [ ] ทุกตาราง/ลิสต์มี empty state + loading skeleton
- [ ] ทุกปุ่ม `rounded-pill` และมี focus ring
- [ ] ตัวเลขทุกตัวมี `tabular-nums`
- [ ] `page.tsx` ไม่มี `"use client"` สักไฟล์
- [ ] sidebar กรองเมนูตามบทบาทจริง
- [ ] มือถือ: sidebar ซ่อน (`hidden lg:flex`) และมีทางเข้าเมนูสำรอง
