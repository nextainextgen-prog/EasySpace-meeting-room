import { escapeHtml } from "@/lib/integrations/telegram";
import { formatBaht, formatDate, formatTimeRange } from "@/lib/format";

interface BookingMessageInput {
  reference: string;
  customerName: string;
  customerPhone?: string;
  customerType?: string;
  roomName: string;
  roomCapacity?: string;
  startsAt: string;
  endsAt: string;
  attendees?: number;
  packageName?: string;
  addons?: string[];
  discountAmount?: number;
  discountNote?: string;
  totalAmount: number;
  depositAmount?: number;
  paidAmount?: number;
  paymentStatus: "paid" | "deposit" | "unpaid" | "free";
  freeReason?: string;
  notes?: string;
  createdBy?: string;
  isReturningCustomer?: boolean;
  customerBookingCount?: number;
}

const STATUS_LABEL: Record<BookingMessageInput["paymentStatus"], string> = {
  paid: "จ่ายแล้ว",
  deposit: "มัดจำแล้ว",
  unpaid: "ยังไม่มัดจำ",
  free: "ฟรี",
};

/** Telegram template — new booking. */
export function bookingCreatedTemplate(b: BookingMessageInput): string {
  const lines: string[] = [];
  lines.push("<b>การจองใหม่</b>");
  lines.push("");
  lines.push(`รหัส: <code>${escapeHtml(b.reference)}</code>`);
  lines.push(`ผู้จอง: <b>${escapeHtml(b.customerName)}</b>`);
  if (b.customerPhone) lines.push(`เบอร์: ${escapeHtml(b.customerPhone)}`);
  if (b.customerType) lines.push(`ประเภท: ${escapeHtml(b.customerType)}`);
  lines.push(`ห้อง: ${escapeHtml(b.roomName)}${b.roomCapacity ? ` (${escapeHtml(b.roomCapacity)})` : ""}`);
  lines.push(`วันที่: ${formatDate(b.startsAt)}`);
  lines.push(`เวลา: ${formatTimeRange(b.startsAt, b.endsAt)}`);
  if (b.attendees) lines.push(`จำนวน: ${b.attendees} คน`);
  lines.push("─────────────────────");
  if (b.packageName) lines.push(`แพ็กเกจ: ${escapeHtml(b.packageName)}`);
  if (b.addons && b.addons.length > 0) {
    lines.push(`Add-on: ${b.addons.map(escapeHtml).join(", ")}`);
  }
  if (b.discountAmount && b.discountAmount > 0) {
    lines.push(
      `ส่วนลด: -${formatBaht(b.discountAmount)}${b.discountNote ? ` (${escapeHtml(b.discountNote)})` : ""}`,
    );
  }
  lines.push(`ยอดรวม: <b>${formatBaht(b.totalAmount)}</b>`);
  if (b.depositAmount && b.depositAmount > 0) {
    lines.push(`มัดจำ: ${formatBaht(b.depositAmount)}`);
  }
  lines.push(`สถานะ: ${STATUS_LABEL[b.paymentStatus]}`);
  if (b.paymentStatus === "free" && b.freeReason) {
    lines.push(`เหตุผลฟรี: ${escapeHtml(b.freeReason)}`);
  }
  if (b.notes) {
    lines.push(`หมายเหตุ: ${escapeHtml(b.notes)}`);
  }
  lines.push("─────────────────────");
  if (b.isReturningCustomer) {
    lines.push(
      `AI: ลูกค้าเก่า · จองครั้งที่ ${b.customerBookingCount ?? "?"}`,
    );
  } else {
    lines.push("AI: ลูกค้าใหม่");
  }
  if (b.createdBy) lines.push(`บันทึกโดย: ${escapeHtml(b.createdBy)}`);
  return lines.join("\n");
}

interface PaymentMessageInput {
  reference: string;
  customerName: string;
  roomName: string;
  amount: number;
  method: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  recordedBy?: string;
}

export function paymentRecordedTemplate(p: PaymentMessageInput): string {
  const status =
    p.remainingAmount <= 0 ? "ชำระครบแล้ว" : "มัดจำ/ชำระบางส่วน";
  return [
    `<b>${status}</b>`,
    "",
    `รหัส: <code>${escapeHtml(p.reference)}</code>`,
    `ผู้จอง: <b>${escapeHtml(p.customerName)}</b>`,
    `ห้อง: ${escapeHtml(p.roomName)}`,
    "─────────────────────",
    `ชำระครั้งนี้: <b>${formatBaht(p.amount)}</b>`,
    `ช่องทาง: ${escapeHtml(p.method)}`,
    `ยอดสะสม: ${formatBaht(p.paidAmount)} / ${formatBaht(p.totalAmount)}`,
    p.remainingAmount > 0 ? `คงเหลือ: ${formatBaht(p.remainingAmount)}` : "",
    p.recordedBy ? `บันทึกโดย: ${escapeHtml(p.recordedBy)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function bookingCancelledTemplate(opts: {
  reference: string;
  customerName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
  actor?: string;
}): string {
  return [
    "<b>ยกเลิกการจอง</b>",
    "",
    `รหัส: <code>${escapeHtml(opts.reference)}</code>`,
    `ผู้จอง: <b>${escapeHtml(opts.customerName)}</b>`,
    `ห้อง: ${escapeHtml(opts.roomName)}`,
    `วันที่: ${formatDate(opts.startsAt)}`,
    `เวลา: ${formatTimeRange(opts.startsAt, opts.endsAt)}`,
    opts.reason ? `เหตุผล: ${escapeHtml(opts.reason)}` : "",
    opts.actor ? `ยกเลิกโดย: ${escapeHtml(opts.actor)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─── Time-based alerts (A series) ─── */

export function bookingStartingSoonTemplate(opts: {
  reference: string;
  customerName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  minutesUntil: number;
}): string {
  return [
    `<b>เริ่มประชุมใน ${opts.minutesUntil} นาที</b>`,
    "",
    `รหัส: <code>${escapeHtml(opts.reference)}</code>`,
    `ผู้จอง: <b>${escapeHtml(opts.customerName)}</b>`,
    `ห้อง: ${escapeHtml(opts.roomName)}`,
    `เวลา: ${formatTimeRange(opts.startsAt, opts.endsAt)}`,
    "─────────────────────",
    "เตรียมห้อง · เปิดแอร์ · ตรวจ AV · พร้อมต้อนรับ",
  ].join("\n");
}

export function bookingEndingSoonTemplate(opts: {
  reference: string;
  customerName: string;
  roomName: string;
  endsAt: string;
  minutesUntil: number;
}): string {
  return [
    `<b>ใกล้หมดเวลา (${opts.minutesUntil} นาที)</b>`,
    "",
    `รหัส: <code>${escapeHtml(opts.reference)}</code>`,
    `ผู้จอง: <b>${escapeHtml(opts.customerName)}</b>`,
    `ห้อง: ${escapeHtml(opts.roomName)}`,
    `หมด: ${new Date(opts.endsAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`,
    "─────────────────────",
    "เตือนผู้ใช้ห้องอย่างสุภาพ · ตรวจการต่อเวลา",
  ].join("\n");
}

export function bookingNoShowTemplate(opts: {
  reference: string;
  customerName: string;
  customerPhone?: string;
  roomName: string;
  startsAt: string;
  minutesPast: number;
}): string {
  return [
    `<b>No-show (เกิน ${opts.minutesPast} นาที)</b>`,
    "",
    `รหัส: <code>${escapeHtml(opts.reference)}</code>`,
    `ผู้จอง: <b>${escapeHtml(opts.customerName)}</b>`,
    opts.customerPhone ? `เบอร์: ${escapeHtml(opts.customerPhone)}` : "",
    `ห้อง: ${escapeHtml(opts.roomName)}`,
    `เริ่มที่: ${new Date(opts.startsAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`,
    "─────────────────────",
    "โทรเช็คก่อนทำเครื่องหมาย no-show · พิจารณายึดมัดจำ",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─── Finance (B series) ─── */

export function outstandingAlertTemplate(opts: {
  reference: string;
  customerName: string;
  amountOutstanding: number;
  daysOverdue: number;
  dueAt: string;
}): string {
  const tone =
    opts.daysOverdue > 7 ? "เกินกำหนดมาก" : opts.daysOverdue > 0 ? "เกินกำหนด" : "ใกล้ครบกำหนด";
  return [
    `<b>${tone}: ${formatBaht(opts.amountOutstanding)}</b>`,
    "",
    `รหัส: <code>${escapeHtml(opts.reference)}</code>`,
    `ลูกค้า: <b>${escapeHtml(opts.customerName)}</b>`,
    `กำหนดชำระ: ${formatDate(opts.dueAt)}`,
    opts.daysOverdue > 0 ? `เกินมา: ${opts.daysOverdue} วัน` : "",
    "─────────────────────",
    "โทรติดตาม · ส่ง LINE follow-up",
  ]
    .filter(Boolean)
    .join("\n");
}

export function paymentDueSoonTemplate(opts: {
  reference: string;
  customerName: string;
  amountOutstanding: number;
  dueAt: string;
}): string {
  return [
    `<b>ใกล้ครบกำหนดชำระ</b>`,
    "",
    `รหัส: <code>${escapeHtml(opts.reference)}</code>`,
    `ลูกค้า: <b>${escapeHtml(opts.customerName)}</b>`,
    `ยอดคงค้าง: ${formatBaht(opts.amountOutstanding)}`,
    `กำหนด: ${formatDate(opts.dueAt)}`,
    "─────────────────────",
    "ส่ง LINE สุภาพเตือนล่วงหน้า",
  ].join("\n");
}

/* ─── AI digest (C series) ─── */

export function dailyDigestTemplate(opts: {
  bookingsToday: number;
  revenuePaid: number;
  revenueTotal: number;
  outstandingCount: number;
  outstandingAmount: number;
  utilization: number;
  highlights: string[];
  alerts: string[];
  recommendations: string[];
}): string {
  const today = new Date().toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return [
    "<b>AI Daily Brief — สรุปปลายวัน</b>",
    today,
    "",
    "<b>ตัวเลขสำคัญ</b>",
    `· การจอง ${opts.bookingsToday} รายการ`,
    `· รายได้รับจริง ${formatBaht(opts.revenuePaid)} / ยอดรวม ${formatBaht(opts.revenueTotal)}`,
    `· Utilization ${opts.utilization}%`,
    `· ค้างชำระ ${opts.outstandingCount} ราย รวม ${formatBaht(opts.outstandingAmount)}`,
    "─────────────────────",
    "<b>Highlights</b>",
    ...opts.highlights.map((h) => `· ${escapeHtml(h)}`),
    "",
    "<b>Alerts</b>",
    ...(opts.alerts.length > 0
      ? opts.alerts.map((a) => `· ${escapeHtml(a)}`)
      : ["· ไม่มีรายการต้องระวัง"]),
    "",
    "<b>Recommendations</b>",
    ...opts.recommendations.map((r) => `· ${escapeHtml(r)}`),
  ].join("\n");
}

/* ─── Internal users (D series) ─── */

export function memberJoinedTemplate(opts: {
  memberName: string;
  orgName: string;
  email: string;
}): string {
  return [
    "<b>สมาชิกใหม่เข้าระบบ</b>",
    "",
    `ชื่อ: <b>${escapeHtml(opts.memberName)}</b>`,
    `องค์กร: ${escapeHtml(opts.orgName)}`,
    `Email: ${escapeHtml(opts.email)}`,
  ].join("\n");
}

export function quotaAlertTemplate(opts: {
  orgName: string;
  used: number;
  total: number;
  percentage: number;
}): string {
  return [
    `<b>Quota ใช้ใกล้หมด · ${opts.orgName}</b>`,
    "",
    `ใช้แล้ว: ${opts.used}/${opts.total} ชม. (${opts.percentage}%)`,
    "─────────────────────",
    "พิจารณา top-up หรือเตือนผู้จัดการองค์กร",
  ].join("\n");
}
