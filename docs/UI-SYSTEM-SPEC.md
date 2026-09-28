# EasySpace — UI/UX System Spec

> เอกสารนี้สรุป design system ของ EasySpace สำหรับใช้นำไปคัดลอกรูปแบบไปใช้กับระบบอื่น
> ทุก token, component pattern, และ convention ที่ใช้จริงใน production

---

## 1. Tech Stack

| Layer | Choice | Version | หมายเหตุ |
|---|---|---|---|
| Framework | Next.js (App Router) | ^15.0.3 | server components + server actions |
| UI lib | React | ^18.3.1 | |
| CSS | Tailwind CSS | ^3.4.14 | `tailwind.config.ts` + custom CSS vars |
| Icons | lucide-react | ^0.460.0 | `strokeWidth={1.75}` เป็น default · ไม่ใช้ emoji ใน UI |
| Database | Supabase Postgres | — | row-level via service_role admin client |
| Validation | zod | ^3.23.8 | schemas สำหรับ server actions ทุกตัว |
| Date | date-fns | ^3.6.0 | + locale `th` สำหรับวันที่ไทย |
| Type | TypeScript | ^5.6.3 | strict mode |

ไม่ใช้: shadcn/ui, MUI, Chakra — components เขียนเองทั้งหมดใน `src/components/ui/`

---

## 2. Typography

**Fonts (load ผ่าน `next/font/google`):**
- **Plus Jakarta Sans** (Latin) — weights 400, 500, 600, 700, 800
- **IBM Plex Sans Thai** (Thai) — weights 300, 400, 500, 600, 700
- Fallback: Inter, ui-sans-serif, system-ui

**CSS variable:** `--font-jakarta`, `--font-plex-thai` (set ผ่าน next/font แล้วประกาศใน `<html>`)

**Global letter-spacing:**
- `body`: `letter-spacing: -0.011em`
- `h1-h4`: `letter-spacing: -0.02em`
- Tailwind extends: `tracking-tightest` (-0.025em), `tighter` (-0.02em), `tight` (-0.015em)

**Typography scale (ที่ใช้บ่อย):**

| Class | Size | Use |
|---|---|---|
| `text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600` | 28px | **Page Title** (H1) |
| `text-lg font-semibold tracking-tight text-ink-1` | 18px | **Card Title** (H2) |
| `text-2xl md:text-[28px] font-bold tracking-tighter tabular-nums` | 28px | KPI value |
| `text-3xl md:text-5xl font-bold tracking-tighter` | 48px | Hero value (gradient card) |
| `text-sm text-ink-2` | 14px | Body |
| `text-xs text-ink-3` | 12px | Helper / subtitle |
| `text-[11px] uppercase tracking-[0.06em]` | 11px | Eyebrow label |
| `text-[10px]` | 10px | Tiny meta |
| `tabular-nums` | — | ใส่ทุกตัวเลขที่จัด column (เวลา, จำนวน, เงิน) |

**Heading rule:** ใช้ `tracking-tighter` (-0.02em) เสมอ — ไม่เคยใช้ default tracking

---

## 3. Color Tokens

### Primary (Royal Blue — แบรนด์)
```
50  #EEF2FF   tint background, ring focus
100 #E0E7FF   chip / soft bg
200 #C7D2FE   border accent
300 #A5B4FC
400 #7C8EF9
500 #3B5BDB   gradient start
600 #2D4EF5   ★ primary action (button bg, header H1)
700 #1E3AE8   hover
800 #1730BD   active
900 #0F1F8F
```

### Ink (text grays)
```
ink-1 #0F172A   ★ heading / strong body
ink-2 #475569   body / labels
ink-3 #94A3B8   muted / placeholder / helper
```

### Surface
```
page    #F5F7FA   page background
card    #FFFFFF   card / input / dropdown
subtle  #F8FAFC   muted blocks, hover
```

### Line
```
line       #E8ECF2   default border (card, input)
line-soft  #F1F4F8   inner divider
```

### Status (เฉพาะ badges, pills, dots)
```
success #10B981  · pill bg #D1FAE5 text #065F46
warning #F59E0B  · pill bg #FEF3C7 text #92400E
danger  #EF4444  · pill bg #FEE2E2 text #991B1B
info    #3B82F6  · pill bg #DBEAFE text #1E40AF
```

### Gradient
```css
--primary-gradient:       linear-gradient(135deg, #2D4EF5 0%, #4F6FFC 100%);
--primary-gradient-deep:  linear-gradient(135deg, #1E3AE8 0%, #3B5BDB 100%);
```

### Theme color (meta tag)
`#2D4EF5`

---

## 4. Radius, Shadow, Spacing

### Border radius
| Token | px | Use |
|---|---|---|
| `rounded-card` | 20 | ★ Card หลัก |
| `rounded-card-lg` | 24 | Hero card |
| `rounded-card-sm` | 16 | Inner panel / event block |
| `rounded-input` | 12 | Inputs, Select, small buttons, dropdown |
| `rounded-pill` | 999 | ★ Buttons, chips, badges |
| `rounded-full` | 999 | Avatar, dot indicator |

### Shadows (อ่อน, ไม่มี hard shadow)
```css
shadow-card        0 1px 3px rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.03)
shadow-card-hover  0 4px 16px rgba(45,78,245,.08)   /* tint blue on hover */
shadow-hero        0 12px 32px rgba(45,78,245,.20)
shadow-pop         0 8px 24px rgba(15,23,42,.10)   /* dropdown / modal */
```

### Spacing convention
- **Card padding:** `p-6` (24px) ปกติ; `p-7 md:p-8` สำหรับ hero
- **Page padding:** `p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5`
- **Gap:** `gap-2 / gap-3 / gap-5` — gap-3 (12px) เป็น default ระหว่าง KPI cards
- **Section spacing:** `space-y-5` ระหว่าง cards

### Border
- All cards: `border border-line` (1px #E8ECF2)
- Inner divider: `border-line-soft` (#F1F4F8)
- Focus ring: `focus:ring-4 focus:ring-primary-50` (4px tint blue, ไม่ใช่ shadow)

---

## 5. Component Patterns

### Button (`src/components/ui/button.tsx`)
- **Shape:** `rounded-pill` ทุกตัว (ห้าม rounded-input)
- **Active scale:** `active:scale-[0.98]`
- **Transition:** `transition-all duration-200 ease-out`
- **Focus:** ring-4 primary-100

**Variants:**
| Variant | Use |
|---|---|
| `primary` | bg-primary-600 → 700 → 800 (hover/active) + shadow-card |
| `gradient` ★ | bg-primary-gradient + shadow-hero — สำหรับ CTA หลัก |
| `secondary` | white + border-line, hover bg-surface-subtle |
| `ghost` | text-ink-2, hover bg-surface-subtle |
| `danger` | bg-red-50, text-red-700 |

**Sizes:** `sm h-9 px-4`, `md h-10 px-5`, `lg h-12 px-6 text-[15px]`

**Props:** `iconLeft?` / `iconRight?` (มักใช้ lucide icon size 14-16)

### Card (`src/components/ui/card.tsx`)
```tsx
<Card>                          // surface-card p-6 (white + border-line + radius-20 + shadow-card)
  <CardHeader>                  // flex justify-between mb-4
    <CardTitle>...</CardTitle>  // text-lg font-semibold tracking-tight text-ink-1
    <CardSubtitle>...</CardSubtitle> // text-xs text-ink-3 mt-1
  </CardHeader>
  ...
  <CardFooter>...</CardFooter>  // mt-5 pt-5 border-t border-line-soft
</Card>
```

### Input / Select / Textarea (`src/components/ui/input.tsx`)
- **Height:** `h-11` (44px) สำหรับ Input/Select
- **Bg:** white, border-line, radius-input, px-4
- **Focus:** `focus:border-primary-600 focus:ring-4 focus:ring-primary-50`
- **Label:** `<Label>` — block text-xs font-medium text-ink-2 mb-1.5
- **Select arrow:** SVG inline (ลูกศร 10x6 stroke #94A3B8) bg-right 14px

### Badge (`src/components/ui/badge.tsx`)
- Pill shape: `px-2.5 py-1 rounded-pill text-[11px] font-medium`
- Tones: `success / warning / danger / info / muted / primary`
- ใช้ class จาก globals.css: `.pill-success`, etc.

### KpiCard (`src/components/ui/kpi-card.tsx`)
```
┌─────────────────────────────┐
│ EYEBROW (11px upper)   [icon]│  ← surface-card p-5 hover -translate-y-0.5
│                              │
│ 1,234                        │  ← text-2xl md:text-[28px] font-bold tracking-tighter tabular-nums
│                              │
│ ↗ +12% vs last week          │  ← trend (emerald-600 / red-600)
└─────────────────────────────┘
```
Grid: `grid-cols-2 md:grid-cols-4 gap-3 md:gap-4`

### IconTile (`src/components/ui/icon-tile.tsx`)
Square tile with tinted bg + icon. Used inside cards/headers.
- Sizes: `sm w-8 h-8 rounded-input` / `md w-10 h-10 rounded-input` / `lg w-12 h-12 rounded-card-sm`
- Tones: primary (bg-primary-50 text-primary-600), success, warning, danger, info, muted
- Always `strokeWidth={1.75}` on the icon

### HeroCard (`src/components/ui/hero-card.tsx`)
Gradient blue card with white text + decorative blobs (white/10 blur-2xl).
- `surface-hero` class: bg gradient + shadow-hero + rounded-card-lg + white text
- Big number `text-3xl md:text-5xl font-bold tracking-tighter`
- CTA = pill backdrop-blur `bg-white/15 hover:bg-white/25`

### EmptyState
Centered icon (in tinted circle) + title + description + optional CTA. Used when list is 0.

### Modal
Fixed inset overlay `bg-ink-1/40 backdrop-blur-sm`, card max-w-2xl `surface-card !p-0 overflow-hidden`, header bg-gradient-to-br from-primary-50 to white.

---

## 6. Layout Patterns

### Admin Page Structure
```tsx
<>
  <AdminTopbar
    title="ปฏิทินการจอง"
    subtitle="ภาพรวมการจองทั้งหมด · drag/drop · keyboard shortcuts"
    actions={<Button size="sm" iconLeft={<Plus size={16} />}>จองใหม่</Button>}
  />
  <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
    <PageHeader
      title="ปฏิทินการจอง"
      description="ดู / แก้ไข / จัดการการจองทั้งหมด · กด ? เพื่อดูคีย์ลัด"
    />
    {/* content cards */}
  </div>
</>
```

**PageHeader rule:**
- Title = `text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600`
- Description = `text-sm text-ink-3 mt-1.5`
- Actions on right (md+), stack below (mobile)
- mb-6

### Section Structure (inside page)
- KPI row: `grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4`
- Main content: `grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-5` (when sidebar needed)
- Tables: full-width inside a `<Card className="!p-0">` with `overflow-hidden`

---

## 7. Conventions & Rules

### Mandatory
1. **ห้ามใช้ emoji ใน UI** — ใช้ Lucide icons เท่านั้น (Telegram/Email templates ใช้ emoji ได้)
2. **Tight letter-spacing ทุก heading** — `tracking-tighter` หรือ `tracking-tight`
3. **Thai labels ทุก user-facing text** — English ใน admin tooling เฉพาะ technical terms
4. **`tabular-nums` กับตัวเลขทุกที่** ที่อยู่ใน column / sum / time
5. **Buttons = `rounded-pill` เสมอ** (ห้าม rounded-input / rounded-md)
6. **Forms = `h-11` inputs + `h-9` หรือ `h-12` buttons** (เลือกตามขนาด)
7. **Focus rings = `ring-4 ring-primary-50`** ไม่ใช่ outline default browser

### Icon usage
- Lucide React, `strokeWidth={1.75}` เป็น default (`2` เฉพาะ trend arrows)
- ขนาดทั่วไป: 11 (in chip), 12-14 (in button/badge), 16-20 (in card title), 22 (in IconTile lg)
- ใส่ `aria-label` ถ้า icon ยืน standalone

### Status mapping
- Active / Confirmed / Paid → success (emerald)
- Pending / In-use / Deposit → warning (amber)
- Suspended / Cancelled / Unpaid → danger (red)
- Free / Archived / Completed → muted (slate)
- Public / Info → info (blue) หรือ primary

### Animation
- `transition-all duration-200 ease-out` (buttons)
- `transition-shadow / -transform` (cards on hover)
- `hover:-translate-y-0.5` (KPI cards)
- `active:scale-[0.98]` (buttons)
- Custom `ease-out-expo` = cubic-bezier(0.16, 1, 0.3, 1) สำหรับ overlay/modal

### Loading
- `.skeleton` class — gradient shimmer animation 1.5s loop
- Spinner = lucide `Loader2` with `animate-spin`

### Dark mode
- **ยังไม่ support** — ระบบเป็น light mode only ทั้งหมด

---

## 8. Quick Snippets (Copy-paste ready)

### Page wrapper
```tsx
<div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
  <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
    หัวข้อหน้า
  </h1>
  <p className="text-sm text-ink-3">คำอธิบายสั้น ๆ</p>
  {/* cards */}
</div>
```

### Primary card
```tsx
<Card>
  <CardHeader>
    <div>
      <CardTitle>ชื่อ Card</CardTitle>
      <CardSubtitle>คำอธิบาย</CardSubtitle>
    </div>
    <Badge tone="primary">Real-time</Badge>
  </CardHeader>
  <div className="space-y-4">{/* content */}</div>
</Card>
```

### KPI row
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
  <KpiCard label="ยอดขายเดือนนี้" value="฿12,400" delta={{ value: 8 }} icon={DollarSign} />
  <KpiCard label="สมาชิก" value="248 คน" hint="active 30 วัน" icon={Users} iconTone="success" />
</div>
```

### Form field
```tsx
<div>
  <Label>ชื่อองค์กร *</Label>
  <Input value={name} onChange={(e) => setName(e.target.value)} required />
</div>
```

### Action button row
```tsx
<div className="flex gap-2 pt-2">
  <Button variant="secondary" className="flex-1">ยกเลิก</Button>
  <Button variant="gradient" className="flex-1" iconLeft={<Save size={16} />}>
    ยืนยัน
  </Button>
</div>
```

### Status chip with dot
```tsx
<span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
  <span className="dot dot-success" />
  ใช้งานอยู่
</span>
```

---

## 9. ไฟล์อ้างอิงในโปรเจคต้นทาง

ถ้าจะให้ AI อ่านโค้ดจริง ๆ ให้ดูที่:
- `tailwind.config.ts` — tokens ทั้งหมด
- `src/app/globals.css` — CSS vars + utility classes (`.surface-card`, `.pill-*`, `.dot-*`, `.kbd`, `.skeleton`)
- `src/app/layout.tsx` — font setup
- `src/components/ui/*` — components ทุกตัว (button, card, input, badge, kpi-card, icon-tile, hero-card, modal, image-uploader, empty-state, section-header)
- `src/components/admin/*` — admin layout (topbar, sidebar, page-header)

---

## 10. การนำไป Adapt กับระบบอื่น

**ขั้นตอนแนะนำให้ AI ทำ:**
1. คัดลอก `tailwind.config.ts` colors / radius / shadow / fontFamily section
2. คัดลอก `globals.css` `@layer base` + `@layer utilities` ทั้งหมด
3. ติดตั้ง fonts ผ่าน `next/font/google` (Plus Jakarta Sans + IBM Plex Sans Thai)
4. คัดลอก `src/components/ui/*` มาทั้งโฟลเดอร์ ไม่ต้องดัดแปลง
5. แทนทุก `<button>` ในระบบเดิม → `<Button variant="primary|gradient|secondary" />`
6. แทนทุก wrapper card → `<Card>` + `<CardHeader><CardTitle>...</CardTitle></CardHeader>`
7. แทนทุก `<input>` → `<Input />` (+ `<Label>` ข้างบน)
8. หน้า list → ใช้ KPI row + table card pattern
9. Page header → `<PageHeader title="..." description="..." actions={...} />`
10. ลบ emoji ทั้งหมดใน UI → ใช้ Lucide icons แทน
