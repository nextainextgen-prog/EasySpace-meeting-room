/**
 * Mock data for Phase 1 builds. Replace with Supabase queries as schema
 * gets provisioned. Each export here mirrors the table it will eventually
 * come from so swapping is mechanical.
 */

import {
  addDays,
  addHours,
  setHours,
  setMinutes,
  startOfDay,
  subDays,
} from "date-fns";

const TODAY = startOfDay(new Date());
const at = (day: Date, h: number, m = 0) =>
  setMinutes(setHours(day, h), m).toISOString();

// ─── Rooms ─────────────────────────────────────────────────────────────────
export const rooms = [
  {
    id: "room-prime",
    name: "PRIME ROOM",
    size: "small" as const,
    capacityMin: 2,
    capacityMax: 6,
    hourlyRate: 200,
    color: "#2D4EF5",
    amenities: ["จอโทรทัศน์", "Free Wi-Fi", "ปลั๊กไฟ", "แอร์"],
    packages: [
      { id: "pkg-prime-3", name: "3 ชั่วโมง", hours: 3, price: 550 },
      { id: "pkg-prime-4", name: "4 ชั่วโมง", hours: 4, price: 700 },
      { id: "pkg-prime-5", name: "5 ชั่วโมง", hours: 5, price: 850 },
      { id: "pkg-prime-6", name: "6 ชั่วโมง", hours: 6, price: 1000 },
    ],
  },
  {
    id: "room-master",
    name: "MASTER ROOM",
    size: "small" as const,
    capacityMin: 8,
    capacityMax: 10,
    hourlyRate: 200,
    color: "#10B981",
    amenities: ["จอโทรทัศน์", "Free Wi-Fi", "ปลั๊กไฟ", "แอร์"],
    packages: [
      { id: "pkg-master-3", name: "3 ชั่วโมง", hours: 3, price: 550 },
      { id: "pkg-master-4", name: "4 ชั่วโมง", hours: 4, price: 700 },
      { id: "pkg-master-5", name: "5 ชั่วโมง", hours: 5, price: 850 },
      { id: "pkg-master-6", name: "6 ชั่วโมง", hours: 6, price: 1000 },
    ],
  },
  {
    id: "room-meeting",
    name: "MEETING ROOM",
    size: "large" as const,
    capacityMin: 10,
    capacityMax: 40,
    hourlyRate: 600,
    color: "#F59E0B",
    amenities: [
      "โปรเจคเตอร์ไร้สาย",
      "ระบบเครื่องเสียง",
      "ไมโครโฟนไร้สาย Lavalier x4",
      "Free Wi-Fi",
    ],
    packages: [
      { id: "pkg-meeting-hr", name: "รายชั่วโมง", hours: 1, price: 600 },
      { id: "pkg-meeting-half", name: "ครึ่งวัน", hours: 4, price: 2000 },
      { id: "pkg-meeting-full", name: "เต็มวัน", hours: 8, price: 3500 },
    ],
  },
];

// ─── Customers ─────────────────────────────────────────────────────────────
export const customers = [
  {
    id: "cus-1",
    name: "บริษัท สยามเทค จำกัด",
    type: "company" as const,
    phone: "081-234-5678",
    email: "contact@siamtech.com",
    source: "line",
    tags: ["VIP", "Recurring"],
    totalBookings: 12,
    totalSpent: 45200,
    lastBookedAt: subDays(TODAY, 4).toISOString(),
    rfm: "555",
    churnRisk: "low" as const,
  },
  {
    id: "cus-2",
    name: "ABC Corporation",
    type: "company" as const,
    phone: "082-345-6789",
    email: "office@abc.co.th",
    source: "facebook",
    tags: ["Loyal"],
    totalBookings: 5,
    totalSpent: 12350,
    lastBookedAt: subDays(TODAY, 12).toISOString(),
    rfm: "433",
    churnRisk: "low" as const,
  },
  {
    id: "cus-3",
    name: "BNI Bangkok Chapter",
    type: "company" as const,
    phone: "081-987-6543",
    email: "chapter@bni-bkk.com",
    source: "referral_bni",
    tags: ["Champion", "BNI"],
    totalBookings: 24,
    totalSpent: 96000,
    lastBookedAt: subDays(TODAY, 1).toISOString(),
    rfm: "555",
    churnRisk: "low" as const,
  },
  {
    id: "cus-4",
    name: "บริษัท ก. จำกัด",
    type: "company" as const,
    phone: "02-555-0001",
    email: "k@kor.co.th",
    source: "walk_in",
    tags: ["At-risk"],
    totalBookings: 3,
    totalSpent: 7200,
    lastBookedAt: subDays(TODAY, 18).toISOString(),
    rfm: "212",
    churnRisk: "high" as const,
  },
  {
    id: "cus-5",
    name: "คุณวริทธิ์ ก้าวหน้า",
    type: "individual" as const,
    phone: "089-111-2222",
    email: "warit@gmail.com",
    source: "line",
    tags: ["New"],
    totalBookings: 1,
    totalSpent: 550,
    lastBookedAt: subDays(TODAY, 2).toISOString(),
    rfm: "511",
    churnRisk: "medium" as const,
  },
];

// ─── Bookings (today + a week) ─────────────────────────────────────────────
export const bookings = [
  {
    id: "bk-001",
    code: "BK001",
    customerId: "cus-1",
    customerName: "บริษัท สยามเทค จำกัด",
    roomId: "room-master",
    startsAt: at(TODAY, 9),
    endsAt: at(TODAY, 12),
    attendees: 8,
    total: 530,
    deposit: 200,
    paid: 200,
    paymentStatus: "deposit" as const,
    status: "confirmed" as const,
    source: "external" as const,
    notes: "ต้องการ HDMI adapter",
  },
  {
    id: "bk-002",
    code: "BK002",
    customerId: "cus-2",
    customerName: "ABC Corporation",
    roomId: "room-prime",
    startsAt: at(TODAY, 10),
    endsAt: at(TODAY, 11, 30),
    attendees: 5,
    total: 400,
    deposit: 400,
    paid: 400,
    paymentStatus: "paid" as const,
    status: "confirmed" as const,
    source: "external" as const,
  },
  {
    id: "bk-003",
    code: "BK003",
    customerId: "cus-4",
    customerName: "บริษัท ก. จำกัด",
    roomId: "room-meeting",
    startsAt: at(TODAY, 11),
    endsAt: at(TODAY, 14),
    attendees: 25,
    total: 2000,
    deposit: 0,
    paid: 0,
    paymentStatus: "unpaid" as const,
    status: "confirmed" as const,
    source: "external" as const,
    flags: ["overdue"],
  },
  {
    id: "bk-004",
    code: "BK004",
    customerId: "cus-3",
    customerName: "BNI Bangkok Chapter",
    roomId: "room-meeting",
    startsAt: at(TODAY, 13),
    endsAt: at(TODAY, 16),
    attendees: 32,
    total: 1800,
    deposit: 1800,
    paid: 1800,
    paymentStatus: "paid" as const,
    status: "confirmed" as const,
    source: "external" as const,
    flags: ["vip"],
  },
  {
    id: "bk-005",
    code: "BK005",
    customerId: "cus-5",
    customerName: "คุณวริทธิ์ ก้าวหน้า",
    roomId: "room-prime",
    startsAt: at(addDays(TODAY, 1), 9, 30),
    endsAt: at(addDays(TODAY, 1), 11, 30),
    attendees: 4,
    total: 550,
    deposit: 0,
    paid: 0,
    paymentStatus: "unpaid" as const,
    status: "pending" as const,
    source: "external" as const,
    flags: ["new"],
  },
  {
    id: "bk-006",
    code: "BK006",
    customerName: "บริษัท ABC ฝ่าย Tech",
    roomId: "room-master",
    startsAt: at(addDays(TODAY, 1), 13),
    endsAt: at(addDays(TODAY, 1), 15),
    attendees: 8,
    total: 0,
    deposit: 0,
    paid: 0,
    paymentStatus: "free" as const,
    status: "confirmed" as const,
    source: "internal" as const,
    orgName: "บริษัท ABC จำกัด",
  },
];

// ─── KPI snapshot ──────────────────────────────────────────────────────────
export const dashboardKpis = {
  bookingsToday: { value: 8, delta: 12 },
  revenueToday: { value: 7430, delta: 18 },
  utilization: { value: 67, delta: -3 },
  outstanding: { value: 8500, count: 3 },
  newCustomers: { value: 2, period: "7 days" },
  churnRisk: { value: 5, level: "high" },
  monthIncome: { value: 58400, target: 200000 },
  netProfit: { value: 6230, margin: 84 },
};

// ─── AI Daily Brief ────────────────────────────────────────────────────────
export const dailyBrief = {
  generatedAt: addHours(TODAY, 9).toISOString(),
  highlights: [
    "รายได้วันนี้ +18% เทียบวันเดียวกันสัปดาห์ก่อน",
    "BNI Chapter จอง weekly 24 ครั้งติด — ลูกค้า Champion",
    "ลูกค้าใหม่ 2 รายมาจาก LINE OA",
  ],
  alerts: [
    "บริษัท ก. ค้างชำระ 18 วัน (฿3,500)",
    "ค่าไฟเดือนนี้ +22% เทียบเดือนก่อน",
    "Walk-in churn rate ขึ้น 28% (จาก 22%)",
  ],
  recommendations: [
    "3 VIP เหมาะส่งโปรแพ็กเกจเต็มวัน",
    "วันพุธบ่าย Utilization 92% — น่าขึ้นราคา premium",
    "PRIME ROOM ใช้น้อย — พิจารณาโปรพิเศษ",
  ],
  forecast: {
    monthly: { value: 185000, target: 200000, deltaPct: 8 },
    tomorrow: { value: 4200, bookings: 3 },
  },
};

// ─── Recent activity feed ──────────────────────────────────────────────────
export const recentActivity = [
  {
    id: "ev-1",
    type: "payment",
    text: "สมชายชำระค่ามัดจำ ฿200 · BK001",
    timeAgo: "ตอนนี้",
  },
  {
    id: "ev-2",
    type: "booking_cancelled",
    text: "ABC ยกเลิก BK002 — เหตุผล: เลื่อน",
    timeAgo: "5 นาทีที่แล้ว",
  },
  {
    id: "ev-3",
    type: "customer_new",
    text: "ลูกค้าใหม่: คุณวริทธิ์ ก้าวหน้า (LINE)",
    timeAgo: "15 นาทีที่แล้ว",
  },
  {
    id: "ev-4",
    type: "booking",
    text: "BNI Chapter จอง weekly meeting",
    timeAgo: "30 นาทีที่แล้ว",
  },
  {
    id: "ev-5",
    type: "ai_alert",
    text: "ค่าไฟเดือนนี้สูงผิดปกติ",
    timeAgo: "1 ชั่วโมงที่แล้ว",
  },
];

// ─── Tasks ─────────────────────────────────────────────────────────────────
export const pendingTasks = [
  {
    id: "task-1",
    title: "โทรเตือนค่าค้างชำระ บริษัท ก.",
    level: "urgent" as const,
  },
  { id: "task-2", title: "ตอบ LINE คุณสมศรี (รอ 1 ชั่วโมง)", level: "today" as const },
  { id: "task-3", title: "Approve โปรโมชั่น SUMMER25", level: "today" as const },
  {
    id: "task-4",
    title: "ตรวจสอบ booking conflict 14:00 MASTER",
    level: "today" as const,
  },
  { id: "task-5", title: "ทำใบเสร็จส่ง BNI", level: "today" as const },
];

// ─── Revenue trend (12 months) ─────────────────────────────────────────────
export const revenueTrend = [
  { month: "มิ.ย.", income: 92000, expense: 18000 },
  { month: "ก.ค.", income: 108000, expense: 19500 },
  { month: "ส.ค.", income: 124000, expense: 21200 },
  { month: "ก.ย.", income: 145000, expense: 22500 },
  { month: "ต.ค.", income: 132000, expense: 24800 },
  { month: "พ.ย.", income: 158000, expense: 23900 },
  { month: "ธ.ค.", income: 174000, expense: 26800 },
  { month: "ม.ค.", income: 142000, expense: 22000 },
  { month: "ก.พ.", income: 156000, expense: 24300 },
  { month: "มี.ค.", income: 168000, expense: 25800 },
  { month: "เม.ย.", income: 182000, expense: 27200 },
  { month: "พ.ค.", income: 58400, expense: 8200 },
];

// ─── Telegram routes (mirror DB) ───────────────────────────────────────────
export const telegramRoutes = [
  { key: "booking.created", label: "รายการจองห้องประชุม — สร้างใหม่", topic: 12, enabled: true },
  { key: "booking.updated", label: "รายการจองห้องประชุม — แก้ไข", topic: 12, enabled: true },
  { key: "booking.cancelled", label: "รายการจองห้องประชุม — ยกเลิก", topic: 12, enabled: true },
  { key: "payment.paid", label: "ยอดเข้าไม่พัก — ชำระเต็ม", topic: 34, enabled: true },
  { key: "payment.deposit", label: "ยอดเข้าไม่พัก — มัดจำ", topic: 34, enabled: true },
  { key: "payment.free", label: "ยอดเข้าไม่พัก — รายการฟรี", topic: 34, enabled: true },
  { key: "payment.refund", label: "ยอดเข้าไม่พัก — คืนเงิน", topic: 34, enabled: true },
  { key: "outstanding.alert", label: "ยอดเข้าไม่พัก — ค้างชำระ", topic: 34, enabled: true },
  { key: "finance.daily_brief", label: "ยอดเข้าไม่พัก — Brief 19:00", topic: 34, enabled: true },
  { key: "notification.time_alert", label: "ติดตามสถานะ — เตือนเวลา", topic: 56, enabled: true },
  { key: "internal.member_joined", label: "ติดตามสถานะ — สมาชิกใหม่", topic: 56, enabled: false },
  { key: "internal.quota_alert", label: "ติดตามสถานะ — Quota", topic: 56, enabled: true },
];

// ─── Org snapshot (for /admin/users) ───────────────────────────────────────
export const organizations = [
  {
    id: "org-abc",
    name: "บริษัท ABC จำกัด",
    floor: "ชั้น 5",
    industry: "เทคโนโลยี",
    members: 28,
    activeToday: 5,
    quotaUsed: 18,
    quotaTotal: 40,
    status: "active",
    contractEnd: "2026-12-31",
  },
  {
    id: "org-def",
    name: "บริษัท DEF จำกัด",
    floor: "ชั้น 8",
    industry: "การเงิน",
    members: 12,
    activeToday: 3,
    quotaUsed: 38,
    quotaTotal: 40,
    status: "active",
    contractEnd: "2026-08-15",
  },
];

// ─── Outstanding (Finance) ─────────────────────────────────────────────────
export const outstanding = [
  {
    id: "out-1",
    customer: "บริษัท สยามเทค",
    bookingCode: "BK001",
    amount: 330,
    daysOverdue: 4,
    dueDate: addDays(TODAY, 1).toISOString(),
  },
  {
    id: "out-2",
    customer: "บริษัท ก. จำกัด",
    bookingCode: "BK006",
    amount: 3500,
    daysOverdue: 18,
    dueDate: subDays(TODAY, 10).toISOString(),
  },
  {
    id: "out-3",
    customer: "ABC Corp",
    bookingCode: "BK008",
    amount: 1200,
    daysOverdue: 0,
    dueDate: addDays(TODAY, 2).toISOString(),
  },
];

// ─── Promotions ────────────────────────────────────────────────────────────
export const promotions = [
  {
    id: "promo-1",
    name: "Summer Sale 2026",
    code: "SUMMER10",
    discountType: "percentage" as const,
    value: 10,
    used: 23,
    quota: 100,
    saving: 4200,
    roi: 4.2,
    status: "active" as const,
    endsAt: addDays(TODAY, 8).toISOString(),
  },
  {
    id: "promo-2",
    name: "VIP -15%",
    code: "VIP15",
    discountType: "percentage" as const,
    value: 15,
    used: 8,
    quota: null,
    saving: 1800,
    roi: 5.8,
    status: "active" as const,
    endsAt: null,
  },
  {
    id: "promo-3",
    name: "Welcome ฿200 off",
    code: "NEW200",
    discountType: "fixed" as const,
    value: 200,
    used: 12,
    quota: 50,
    saving: 2400,
    roi: 3.1,
    status: "active" as const,
    endsAt: addDays(TODAY, 60).toISOString(),
  },
];

// ─── Notifications feed ────────────────────────────────────────────────────
export const notifications = [
  {
    id: "n-1",
    level: "danger" as const,
    category: "time" as const,
    title: "ใกล้หมดเวลา (5 นาที)",
    body: "PRIME ROOM — ABC Corp · หมด 11:00",
    createdAt: subDays(TODAY, 0).toISOString(),
    read: false,
  },
  {
    id: "n-2",
    level: "warning" as const,
    category: "finance" as const,
    title: "ค้างชำระเกินกำหนด",
    body: "บริษัท ก. จำกัด · ฿3,500 · 18 วัน",
    createdAt: subDays(TODAY, 0).toISOString(),
    read: false,
  },
  {
    id: "n-3",
    level: "info" as const,
    category: "ai_digest" as const,
    title: "AI รายงานประจำวัน",
    body: "วันนี้มี 8 รายการ · รายได้คาด ฿9,200",
    createdAt: subDays(TODAY, 0).toISOString(),
    read: true,
  },
  {
    id: "n-4",
    level: "success" as const,
    category: "finance" as const,
    title: "ชำระครบแล้ว",
    body: "บริษัท ทดสอบ จำกัด · ฿2,000",
    createdAt: subDays(TODAY, 1).toISOString(),
    read: true,
  },
];

export const todayTotals = {
  income: 7430,
  expense: 1200,
  net: 6230,
  margin: 84,
  byMethod: [
    { method: "โอนธนาคาร", amount: 4500 },
    { method: "PromptPay", amount: 2000 },
    { method: "เงินสด", amount: 930 },
  ],
};
