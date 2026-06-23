import { escapeHtml } from "@/lib/integrations/telegram";
import { formatBaht, formatTimeRange } from "@/lib/format";
import { format as fnsFormat } from "date-fns";
import { th } from "date-fns/locale";

/** Divider used between sections in all Telegram templates. */
const SEP = "--------------------------";

/** Full Thai date with Buddhist year, e.g. "20 พฤษภาคม 2569". */
function formatThaiFullDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const beYear = d.getFullYear() + 543;
  const month = fnsFormat(d, "MMMM", { locale: th });
  return `${d.getDate()} ${month} ${beYear}`;
}

function formatHour(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

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

/* ─── Booking lifecycle ─── */

/** Telegram template — new booking. */
export function bookingCreatedTemplate(b: BookingMessageInput): string {
  const lines: string[] = [];
  lines.push("🎉 <b>มีการจองใหม่</b>");
  lines.push(SEP);
  lines.push(`<b>รหัสการจอง:</b> <code>${escapeHtml(b.reference)}</code>`);
  lines.push(`🏢 <b>ผู้จอง:</b> ${escapeHtml(b.customerName)}`);
  if (b.customerPhone) lines.push(`📞 <b>เบอร์โทร:</b> ${escapeHtml(b.customerPhone)}`);
  if (b.customerType) lines.push(`👤 <b>ประเภทลูกค้า:</b> ${escapeHtml(b.customerType)}`);
  lines.push("");
  lines.push(" <b>รายละเอียดห้อง</b>");
  lines.push(
    `🏛️ <b>ห้อง:</b> ${escapeHtml(b.roomName)}${b.roomCapacity ? ` (${escapeHtml(b.roomCapacity)})` : ""}`,
  );
  lines.push(`📅 <b>วันที่:</b> ${formatThaiFullDate(b.startsAt)}`);
  lines.push(`⏰ <b>เวลา:</b> ${formatTimeRange(b.startsAt, b.endsAt)}`);
  if (b.attendees) lines.push(`👥 <b>จำนวนผู้เข้าร่วม:</b> ${b.attendees} คน`);
  lines.push("");
  lines.push(SEP);
  if (b.packageName) lines.push(`💼 <b>แพ็กเกจ:</b> ${escapeHtml(b.packageName)}`);
  if (b.addons && b.addons.length > 0) {
    lines.push(`➕ <b>Add-on:</b> ${b.addons.map(escapeHtml).join(", ")}`);
  }
  if (b.discountAmount && b.discountAmount > 0) {
    lines.push(
      `🏷️ <b>ส่วนลด:</b> -${formatBaht(b.discountAmount)}${b.discountNote ? ` (${escapeHtml(b.discountNote)})` : ""}`,
    );
  }
  lines.push("");
  lines.push(`💰 <b>ยอดรวม:</b> <b>${formatBaht(b.totalAmount)}</b>`);
  if (b.depositAmount && b.depositAmount > 0) {
    lines.push(`💵 <b>มัดจำ:</b> ${formatBaht(b.depositAmount)}`);
  }
  lines.push(`✅ <b>สถานะ:</b> ${STATUS_LABEL[b.paymentStatus]}`);
  if (b.paymentStatus === "free" && b.freeReason) {
    lines.push(`🆓 <b>เหตุผลฟรี:</b> ${escapeHtml(b.freeReason)}`);
  }
  if (b.notes) {
    lines.push("");
    lines.push("📝 <b>หมายเหตุ:</b>");
    lines.push(escapeHtml(b.notes));
  }
  if (b.createdBy) {
    lines.push("");
    lines.push(SEP);
    lines.push(`👨‍💼 <b>บันทึกโดย:</b> ${escapeHtml(b.createdBy)}`);
  }
  return lines.join("\n");
}

/** Telegram template — booking edited (drag-drop / time change / room change). */
export function bookingUpdatedTemplate(opts: {
  reference: string;
  customerName: string;
  roomName: string;
  previousStartsAt?: string;
  previousEndsAt?: string;
  newStartsAt: string;
  newEndsAt: string;
  previousRoomName?: string;
  changedFields?: string[];
  actor?: string;
}): string {
  const lines: string[] = [];
  lines.push("✏️ <b>แก้ไขการจอง</b>");
  lines.push(SEP);
  lines.push(`🎫 <b>รหัสการจอง:</b> <code>${escapeHtml(opts.reference)}</code>`);
  lines.push(`🏢 <b>ผู้จอง:</b> ${escapeHtml(opts.customerName)}`);
  lines.push(`🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`);
  lines.push("");
  lines.push(SEP);
  if (opts.previousRoomName && opts.previousRoomName !== opts.roomName) {
    lines.push(`🔄 <b>ห้องเดิม:</b> ${escapeHtml(opts.previousRoomName)}`);
    lines.push(`✅ <b>ห้องใหม่:</b> ${escapeHtml(opts.roomName)}`);
  }
  if (opts.previousStartsAt && opts.previousEndsAt) {
    lines.push(
      `🔄 <b>เวลาเดิม:</b> ${formatTimeRange(opts.previousStartsAt, opts.previousEndsAt)}`,
    );
  }
  lines.push(
    `✅ <b>เวลาใหม่:</b> ${formatTimeRange(opts.newStartsAt, opts.newEndsAt)}`,
  );
  lines.push(`📅 <b>วันที่:</b> ${formatThaiFullDate(opts.newStartsAt)}`);
  if (opts.changedFields && opts.changedFields.length > 0) {
    lines.push("");
    lines.push(`🔧 <b>ฟิลด์ที่แก้ไข:</b> ${opts.changedFields.join(", ")}`);
  }
  if (opts.actor) {
    lines.push(SEP);
    lines.push(`👨‍💼 <b>แก้ไขโดย:</b> ${escapeHtml(opts.actor)}`);
  }
  return lines.join("\n");
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
  const lines: string[] = [];
  lines.push("❌ <b>ยกเลิกการจอง</b>");
  lines.push(SEP);
  lines.push(`🎫 <b>รหัสการจอง:</b> <code>${escapeHtml(opts.reference)}</code>`);
  lines.push(`🏢 <b>ผู้จอง:</b> ${escapeHtml(opts.customerName)}`);
  lines.push(`🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`);
  lines.push(SEP);
  lines.push(`📅 <b>วันที่:</b> ${formatThaiFullDate(opts.startsAt)}`);
  lines.push(`⏰ <b>เวลา:</b> ${formatTimeRange(opts.startsAt, opts.endsAt)}`);
  if (opts.reason || opts.actor) {
    lines.push(SEP);
    if (opts.reason) lines.push(`📝 <b>เหตุผล:</b> ${escapeHtml(opts.reason)}`);
    if (opts.actor) lines.push(`👨‍💼 <b>ยกเลิกโดย:</b> ${escapeHtml(opts.actor)}`);
  }
  return lines.join("\n");
}

/** Admin คืนห้องของผู้ใช้ภายในเพื่อให้ลูกค้าภายนอกจอง — รวมส่วนชดเชย. */
export function adminRevokedBookingTemplate(opts: {
  reference: string;
  memberName: string;
  orgName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  compensationHours?: number;
  alternativeRoom?: string;
  alternativeStartsAt?: string;
  alternativeEndsAt?: string;
  actor?: string;
}): string {
  const lines: string[] = [];
  lines.push("⚠️ <b>Admin คืนห้อง (Revoke)</b>");
  lines.push(SEP);
  lines.push(`🎫 <b>รหัสการจอง:</b> <code>${escapeHtml(opts.reference)}</code>`);
  lines.push(`🙋‍♂️ <b>สมาชิก:</b> ${escapeHtml(opts.memberName)}`);
  lines.push(`🏢 <b>องค์กร:</b> ${escapeHtml(opts.orgName)}`);
  lines.push(`🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`);
  lines.push(`📅 <b>วันที่:</b> ${formatThaiFullDate(opts.startsAt)}`);
  lines.push(`⏰ <b>เวลา:</b> ${formatTimeRange(opts.startsAt, opts.endsAt)}`);
  lines.push(SEP);
  lines.push(`📝 <b>เหตุผล:</b> ${escapeHtml(opts.reason)}`);
  if (opts.compensationHours) {
    lines.push(`🎁 <b>ชดเชย:</b> คืน quota ${opts.compensationHours} ชม.`);
  }
  if (opts.alternativeRoom && opts.alternativeStartsAt && opts.alternativeEndsAt) {
    lines.push(SEP);
    lines.push("🔁 <b>เสนอเวลาทดแทน</b>");
    lines.push(`🏛️ <b>ห้อง:</b> ${escapeHtml(opts.alternativeRoom)}`);
    lines.push(
      `⏰ <b>เวลา:</b> ${formatTimeRange(opts.alternativeStartsAt, opts.alternativeEndsAt)}`,
    );
  }
  if (opts.actor) {
    lines.push(SEP);
    lines.push(`👨‍💼 <b>ดำเนินการโดย:</b> ${escapeHtml(opts.actor)}`);
  }
  return lines.join("\n");
}

/* ─── Payments (B series) ─── */

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
  const isPaidInFull = p.remainingAmount <= 0;
  const lines: string[] = [];

  if (isPaidInFull) {
    lines.push("💳 <b>บันทึกการชำระเงิน</b>");
    lines.push(SEP);
    lines.push("");
    lines.push("✅ <b>สถานะ:</b> ชำระครบแล้ว");
    lines.push(`<b>รหัสการจอง:</b> <code>${escapeHtml(p.reference)}</code>`);
    lines.push(`<b>ผู้จอง:</b> ${escapeHtml(p.customerName)}`);
    lines.push(` <b>ห้อง:</b> ${escapeHtml(p.roomName)}`);
    lines.push("");
    lines.push(SEP);
    lines.push(`💰 <b>ชำระครั้งนี้:</b> <b>${formatBaht(p.amount)}</b>`);
    lines.push(`🏦 <b>ช่องทาง:</b> ${escapeHtml(p.method)}`);
    lines.push(
      `📊 <b>ยอดสะสม:</b> ${formatBaht(p.paidAmount)} / ${formatBaht(p.totalAmount)}`,
    );
    lines.push(`🧾 <b>คงเหลือ:</b> ${formatBaht(0)}`);
    lines.push("");
    lines.push(SEP);
    lines.push("รวยเเล้ว รวยไม่ไหวเเล้ว");
  } else {
    lines.push("💵 <b>รับมัดจำ / ชำระบางส่วน</b>");
    lines.push(SEP);
    lines.push("");
    lines.push("🟡 <b>สถานะ:</b> ชำระบางส่วน");
    lines.push(`🎫 <b>รหัสการจอง:</b> <code>${escapeHtml(p.reference)}</code>`);
    lines.push(`🏢 <b>ผู้จอง:</b> ${escapeHtml(p.customerName)}`);
    lines.push(`🏛️ <b>ห้อง:</b> ${escapeHtml(p.roomName)}`);
    lines.push(SEP);
    lines.push(`💰 <b>ชำระครั้งนี้:</b> <b>${formatBaht(p.amount)}</b>`);
    lines.push(`🏦 <b>ช่องทาง:</b> ${escapeHtml(p.method)}`);
    lines.push(
      `📊 <b>ยอดสะสม:</b> ${formatBaht(p.paidAmount)} / ${formatBaht(p.totalAmount)}`,
    );
    lines.push(`🧾 <b>คงเหลือ:</b> ${formatBaht(p.remainingAmount)}`);
  }

  if (p.recordedBy) {
    lines.push(SEP);
    lines.push(`👨‍💼 <b>บันทึกโดย:</b> ${escapeHtml(p.recordedBy)}`);
  }
  return lines.join("\n");
}

/** จองฟรี — แสดง opportunity cost ไม่บวกยอดสะสม. */
export function paymentFreeTemplate(opts: {
  reference: string;
  customerName: string;
  roomName: string;
  normalPrice: number;
  reason: string;
  freeMonthToDate?: number;
  approvedBy?: string;
}): string {
  const lines: string[] = [];
  lines.push("🆓 <b>บันทึกการจองฟรี</b>");
  lines.push(SEP);
  lines.push(`🎫 <b>รหัสการจอง:</b> <code>${escapeHtml(opts.reference)}</code>`);
  lines.push(`🏢 <b>ผู้จอง:</b> ${escapeHtml(opts.customerName)}`);
  lines.push(`🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`);
  lines.push(SEP);
  lines.push(`💸 <b>มูลค่าปกติ:</b> ${formatBaht(opts.normalPrice)} (ไม่ได้รับเงิน)`);
  lines.push(`📝 <b>เหตุผล:</b> ${escapeHtml(opts.reason)}`);
  if (opts.freeMonthToDate !== undefined) {
    lines.push(SEP);
    lines.push(`📊 <b>ยอดฟรีสะสมเดือนนี้:</b> ${formatBaht(opts.freeMonthToDate)}`);
  }
  if (opts.approvedBy) {
    lines.push(SEP);
    lines.push(`👨‍💼 <b>อนุมัติโดย:</b> ${escapeHtml(opts.approvedBy)}`);
  }
  return lines.join("\n");
}

/** คืนเงิน (Refund). */
export function paymentRefundTemplate(opts: {
  reference: string;
  customerName: string;
  roomName: string;
  refundAmount: number;
  reason: string;
  method: string;
  approvedBy?: string;
}): string {
  const lines: string[] = [];
  lines.push("↩️ <b>คืนเงิน (Refund)</b>");
  lines.push(SEP);
  lines.push(`🎫 <b>รหัสการจอง:</b> <code>${escapeHtml(opts.reference)}</code>`);
  lines.push(`🏢 <b>ผู้จอง:</b> ${escapeHtml(opts.customerName)}`);
  lines.push(`🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`);
  lines.push(SEP);
  lines.push(`💰 <b>ยอดคืน:</b> <b>-${formatBaht(opts.refundAmount)}</b>`);
  lines.push(`🏦 <b>ช่องทาง:</b> ${escapeHtml(opts.method)}`);
  lines.push(`📝 <b>เหตุผล:</b> ${escapeHtml(opts.reason)}`);
  if (opts.approvedBy) {
    lines.push(SEP);
    lines.push(`👨‍💼 <b>อนุมัติโดย:</b> ${escapeHtml(opts.approvedBy)}`);
  }
  return lines.join("\n");
}

/** บันทึกรายจ่าย. */
export function expenseRecordedTemplate(opts: {
  category: string;
  itemName: string;
  amount: number;
  vendor?: string;
  monthlyExpenseTotal?: number;
  recordedBy?: string;
}): string {
  const lines: string[] = [];
  lines.push("💸 <b>บันทึกรายจ่าย</b>");
  lines.push(SEP);
  lines.push(`📂 <b>หมวด:</b> ${escapeHtml(opts.category)}`);
  lines.push(`📋 <b>รายการ:</b> ${escapeHtml(opts.itemName)}`);
  lines.push(`💵 <b>จำนวน:</b> <b>-${formatBaht(opts.amount)}</b>`);
  if (opts.vendor) lines.push(`🏪 <b>Vendor:</b> ${escapeHtml(opts.vendor)}`);
  if (opts.monthlyExpenseTotal !== undefined) {
    lines.push(SEP);
    lines.push(`📊 <b>รายจ่ายเดือนนี้:</b> ${formatBaht(opts.monthlyExpenseTotal)}`);
  }
  if (opts.recordedBy) {
    lines.push(SEP);
    lines.push(`👨‍💼 <b>บันทึกโดย:</b> ${escapeHtml(opts.recordedBy)}`);
  }
  return lines.join("\n");
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
    `⏰ <b>เริ่มประชุมใน ${opts.minutesUntil} นาที</b>`,
    SEP,
    `🎫 <b>รหัส:</b> <code>${escapeHtml(opts.reference)}</code>`,
    `🏢 <b>ผู้จอง:</b> ${escapeHtml(opts.customerName)}`,
    `🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`,
    `🕘 <b>เวลา:</b> ${formatTimeRange(opts.startsAt, opts.endsAt)}`,
    SEP,
    "✅ เตรียมห้อง · ❄️ เปิดแอร์ · 📽️ ตรวจ AV · 🤝 พร้อมต้อนรับ",
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
    `⏳ <b>ใกล้หมดเวลา (${opts.minutesUntil} นาที)</b>`,
    SEP,
    `🎫 <b>รหัส:</b> <code>${escapeHtml(opts.reference)}</code>`,
    `🏢 <b>ผู้จอง:</b> ${escapeHtml(opts.customerName)}`,
    `🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`,
    `🕛 <b>หมดเวลา:</b> ${formatHour(opts.endsAt)} น.`,
    SEP,
    "🔔 เตือนผู้ใช้ห้องอย่างสุภาพ · ⏱️ ตรวจการต่อเวลา",
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
    `⚠️ <b>No-show (เกิน ${opts.minutesPast} นาที)</b>`,
    SEP,
    `🎫 <b>รหัส:</b> <code>${escapeHtml(opts.reference)}</code>`,
    `🏢 <b>ผู้จอง:</b> ${escapeHtml(opts.customerName)}`,
    opts.customerPhone ? `📞 <b>เบอร์:</b> ${escapeHtml(opts.customerPhone)}` : "",
    `🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`,
    `🕘 <b>เริ่มที่:</b> ${formatHour(opts.startsAt)} น.`,
    SEP,
    "☎️ โทรเช็คก่อนทำเครื่องหมาย no-show · 💵 พิจารณายึดมัดจำ",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─── Outstanding (B series) ─── */

export function outstandingAlertTemplate(opts: {
  reference: string;
  customerName: string;
  amountOutstanding: number;
  daysOverdue: number;
  dueAt: string;
}): string {
  const tone =
    opts.daysOverdue > 7
      ? "🚨 <b>เกินกำหนดมาก</b>"
      : opts.daysOverdue > 0
        ? "⚠️ <b>เกินกำหนด</b>"
        : "🔔 <b>ใกล้ครบกำหนด</b>";
  return [
    `${tone}: <b>${formatBaht(opts.amountOutstanding)}</b>`,
    SEP,
    `🎫 <b>รหัส:</b> <code>${escapeHtml(opts.reference)}</code>`,
    `🏢 <b>ลูกค้า:</b> ${escapeHtml(opts.customerName)}`,
    `📅 <b>กำหนดชำระ:</b> ${formatThaiFullDate(opts.dueAt)}`,
    opts.daysOverdue > 0 ? `⏰ <b>เกินมา:</b> ${opts.daysOverdue} วัน` : "",
    SEP,
    "📞 โทรติดตาม · 💬 ส่ง LINE follow-up",
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
    "🔔 <b>ใกล้ครบกำหนดชำระ</b>",
    SEP,
    `🎫 <b>รหัส:</b> <code>${escapeHtml(opts.reference)}</code>`,
    `🏢 <b>ลูกค้า:</b> ${escapeHtml(opts.customerName)}`,
    `💰 <b>ยอดคงค้าง:</b> ${formatBaht(opts.amountOutstanding)}`,
    `📅 <b>กำหนด:</b> ${formatThaiFullDate(opts.dueAt)}`,
    SEP,
    "💬 ส่ง LINE สุภาพเตือนล่วงหน้า",
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
    "🤖 <b>AI Daily Brief — สรุปปลายวัน</b>",
    `📅 ${today}`,
    "",
    "📊 <b>ตัวเลขสำคัญ</b>",
    `· การจอง ${opts.bookingsToday} รายการ`,
    `· รายได้รับจริง ${formatBaht(opts.revenuePaid)} / ยอดรวม ${formatBaht(opts.revenueTotal)}`,
    `· Utilization ${opts.utilization}%`,
    `· ค้างชำระ ${opts.outstandingCount} ราย รวม ${formatBaht(opts.outstandingAmount)}`,
    "",
    SEP,
    "✨ <b>Highlights</b>",
    ...opts.highlights.map((h) => `· ${escapeHtml(h)}`),
    "",
    "⚠️ <b>Alerts</b>",
    ...(opts.alerts.length > 0
      ? opts.alerts.map((a) => `· ${escapeHtml(a)}`)
      : ["· ไม่มีรายการต้องระวัง"]),
    "",
    "💡 <b>Recommendations</b>",
    ...opts.recommendations.map((r) => `· ${escapeHtml(r)}`),
  ].join("\n");
}

/** Morning brief — ส่งเช้า 08:00. */
export function morningBriefTemplate(opts: {
  bookingsToday: number;
  rooms: Array<{ roomName: string; status: "full" | "partial" | "empty" }>;
  forecastRevenue: number;
  outstandingToday: Array<{ customerName: string; reference: string }>;
  highlights?: string[];
}): string {
  const today = new Date().toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const lines: string[] = [];
  lines.push("☀️ <b>AI Morning Brief — สรุปเช้าวันนี้</b>");
  lines.push(`📅 ${today}`);
  lines.push("");
  lines.push("📊 <b>วันนี้</b>");
  lines.push(`· การจอง ${opts.bookingsToday} รายการ`);
  lines.push(`· รายได้คาดวันนี้ ${formatBaht(opts.forecastRevenue)}`);
  lines.push("");
  lines.push(SEP);
  lines.push("🏛️ <b>สถานะห้อง</b>");
  for (const r of opts.rooms) {
    const icon = r.status === "full" ? "🟥" : r.status === "partial" ? "🟨" : "🟩";
    const label =
      r.status === "full" ? "เต็ม" : r.status === "partial" ? "บางช่วง" : "ว่างทั้งวัน";
    lines.push(`${icon} ${escapeHtml(r.roomName)} — ${label}`);
  }
  if (opts.outstandingToday.length > 0) {
    lines.push(SEP);
    lines.push("⚠️ <b>ค้างชำระที่จะมาวันนี้</b>");
    for (const o of opts.outstandingToday) {
      lines.push(`· ${escapeHtml(o.customerName)} (<code>${escapeHtml(o.reference)}</code>)`);
    }
  }
  if (opts.highlights && opts.highlights.length > 0) {
    lines.push(SEP);
    lines.push("✨ <b>เน้นย้ำ</b>");
    for (const h of opts.highlights) lines.push(`· ${escapeHtml(h)}`);
  }
  return lines.join("\n");
}

/** Weekly summary — ส่งจันทร์ 09:00. */
export function weeklyDigestTemplate(opts: {
  weekLabel: string;
  bookingsCount: number;
  revenue: number;
  expense: number;
  netProfit: number;
  marginPct: number;
  growthPct: number;
  topCustomer?: { name: string; amount: number };
  topRoom?: { name: string };
  topSource?: { name: string; rating: string };
  highlights?: string[];
}): string {
  const lines: string[] = [];
  lines.push("📈 <b>สรุปสัปดาห์ที่ผ่านมา</b>");
  lines.push(`📅 ${escapeHtml(opts.weekLabel)}`);
  lines.push("");
  lines.push(SEP);
  lines.push("💰 <b>ตัวเลข</b>");
  lines.push(`· รายรับ ${formatBaht(opts.revenue)} (${opts.bookingsCount} รายการ)`);
  lines.push(`· รายจ่าย ${formatBaht(opts.expense)}`);
  lines.push(`· กำไร ${formatBaht(opts.netProfit)} (Margin ${opts.marginPct}%)`);
  lines.push("");
  const arrow = opts.growthPct >= 0 ? "📈" : "📉";
  const sign = opts.growthPct >= 0 ? "+" : "";
  lines.push(`${arrow} <b>เทียบสัปดาห์ก่อน:</b> ${sign}${opts.growthPct}%`);
  if (opts.topCustomer || opts.topRoom || opts.topSource) {
    lines.push(SEP);
    lines.push("🏆 <b>Highlights</b>");
    if (opts.topCustomer)
      lines.push(
        `· ลูกค้าใหญ่สุด: ${escapeHtml(opts.topCustomer.name)} (${formatBaht(opts.topCustomer.amount)})`,
      );
    if (opts.topRoom) lines.push(`· ห้องทำเงินสูงสุด: ${escapeHtml(opts.topRoom.name)}`);
    if (opts.topSource)
      lines.push(
        `· ที่มาดีสุด: ${escapeHtml(opts.topSource.name)} (${escapeHtml(opts.topSource.rating)})`,
      );
  }
  if (opts.highlights && opts.highlights.length > 0) {
    lines.push(SEP);
    lines.push("✨ <b>Insights</b>");
    for (const h of opts.highlights) lines.push(`· ${escapeHtml(h)}`);
  }
  return lines.join("\n");
}

/** Weekly AI insight — แนะนำเชิงกลยุทธ์ (Phase 2). */
export function weeklyInsightTemplate(opts: {
  insights: Array<{ title: string; detail: string; suggestion?: string }>;
}): string {
  const lines: string[] = [];
  lines.push("💡 <b>AI Insight ประจำสัปดาห์</b>");
  lines.push(SEP);
  opts.insights.forEach((insight, i) => {
    if (i > 0) lines.push("");
    lines.push(`<b>${escapeHtml(insight.title)}</b>`);
    lines.push(escapeHtml(insight.detail));
    if (insight.suggestion) {
      lines.push(`💬 <b>แนะนำ:</b> ${escapeHtml(insight.suggestion)}`);
    }
  });
  return lines.join("\n");
}

/* ─── Internal users (D series) ─── */

export function memberJoinedTemplate(opts: {
  memberName: string;
  orgName: string;
  email: string;
}): string {
  return [
    "👤 <b>สมาชิกใหม่เข้าระบบ</b>",
    SEP,
    `🙋‍♂️ <b>ชื่อ:</b> ${escapeHtml(opts.memberName)}`,
    `🏢 <b>องค์กร:</b> ${escapeHtml(opts.orgName)}`,
    `📧 <b>Email:</b> ${escapeHtml(opts.email)}`,
  ].join("\n");
}

/** Member จองครั้งแรกในระบบ. */
export function memberFirstBookingTemplate(opts: {
  memberName: string;
  orgName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
}): string {
  return [
    "🎉 <b>จองครั้งแรก!</b>",
    SEP,
    `🙋‍♂️ <b>สมาชิก:</b> ${escapeHtml(opts.memberName)}`,
    `🏢 <b>องค์กร:</b> ${escapeHtml(opts.orgName)}`,
    `🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}`,
    `📅 <b>วันที่:</b> ${formatThaiFullDate(opts.startsAt)}`,
    `⏰ <b>เวลา:</b> ${formatTimeRange(opts.startsAt, opts.endsAt)}`,
  ].join("\n");
}

/** Internal user จองห้องเอง (ผ่าน portal /app). */
export function internalBookingCreatedTemplate(opts: {
  reference: string;
  memberName: string;
  position?: string;
  department?: string;
  orgName: string;
  roomName: string;
  roomCapacity?: string;
  startsAt: string;
  endsAt: string;
  attendees?: number;
  topic?: string;
  /** Hours of THIS booking — shown on its own line. */
  bookingHours: number;
  /** Cumulative hours used by the org this month (including this booking). */
  quotaUsed: number;
  /** Monthly quota set by admin. Ignored when quotaUnlimited is true. */
  quotaTotal: number;
  quotaUnlimited?: boolean;
}): string {
  const lines: string[] = [];
  lines.push("🎉 <b>มีการจองใหม่ (ภายในองค์กร)</b>");
  lines.push(SEP);
  lines.push(`<b>รหัสการจอง:</b> <code>${escapeHtml(opts.reference)}</code>`);
  lines.push(`🏢 <b>องค์กร:</b> ${escapeHtml(opts.orgName)}`);
  lines.push(`🙋‍♂️ <b>ผู้จอง:</b> ${escapeHtml(opts.memberName)}`);
  if (opts.position) {
    lines.push(`💼 <b>ตำแหน่ง:</b> ${escapeHtml(opts.position)}`);
  }
  if (opts.department) {
    lines.push(`🏷️ <b>แผนก:</b> ${escapeHtml(opts.department)}`);
  }
  lines.push("");
  lines.push("  <b>รายละเอียดห้อง</b>");
  lines.push(
    `🏛️ <b>ห้อง:</b> ${escapeHtml(opts.roomName)}${opts.roomCapacity ? ` (${escapeHtml(opts.roomCapacity)})` : ""}`,
  );
  lines.push(`📅 <b>วันที่:</b> ${formatThaiFullDate(opts.startsAt)}`);
  lines.push(`🕐 <b>เวลา:</b> ${formatTimeRange(opts.startsAt, opts.endsAt)}`);
  lines.push(
    `⏱️ <b>จำนวนชั่วโมง:</b> ${opts.bookingHours.toFixed(1)} ชม.`,
  );
  if (opts.attendees) {
    lines.push(`👥 <b>จำนวนผู้เข้าร่วม:</b> ${opts.attendees} คน`);
  }
  if (opts.topic) {
    lines.push(`📝 <b>หัวข้อ:</b> ${escapeHtml(opts.topic)}`);
  }
  lines.push("");
  lines.push(SEP);
  lines.push("");
  lines.push("💵 <b>ค่าใช้จ่าย:</b> ฟรี (สมาชิกองค์กร)");

  // Quota line — different shapes for limited vs unlimited vs near-cap.
  const used = Math.round(opts.quotaUsed * 10) / 10;
  if (opts.quotaUnlimited) {
    lines.push(
      `📊 <b>โควต้าองค์กรเดือนนี้:</b> ${used} ชม. · ไม่จำกัด ∞`,
    );
  } else {
    const total = opts.quotaTotal;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    const remaining = Math.max(0, total - used);
    const warn = pct >= 80;
    lines.push(
      `📊 <b>โควต้าองค์กรเดือนนี้:</b> ${used}/${total} ชม. (${pct}%)${
        warn ? " ⚠️" : ""
      }`,
    );
    if (warn) {
      lines.push(`   ⚠ ใกล้หมด — เหลืออีก ${remaining.toFixed(1)} ชม.`);
    } else {
      lines.push(`   ✓ คงเหลืออีก ${remaining.toFixed(1)} ชม.`);
    }
  }

  lines.push("");
  lines.push(SEP);
  const ts = new Date().toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  lines.push(`✅ บันทึกผ่านระบบสมาชิก · ${ts} น.`);
  return lines.join("\n");
}

export function quotaAlertTemplate(opts: {
  orgName: string;
  used: number;
  total: number;
  percentage: number;
}): string {
  return [
    `📊 <b>Quota ใช้ใกล้หมด · ${escapeHtml(opts.orgName)}</b>`,
    SEP,
    `⏱️ <b>ใช้แล้ว:</b> ${opts.used}/${opts.total} ชม. (${opts.percentage}%)`,
    SEP,
    "💬 พิจารณา top-up หรือเตือนผู้จัดการองค์กร",
  ].join("\n");
}

/** Org สัญญาเช่าใกล้หมด (Phase 2). */
export function contractExpiringTemplate(opts: {
  orgName: string;
  contractEndsAt: string;
  daysRemaining: number;
}): string {
  return [
    "📅 <b>สัญญาเช่าใกล้หมด</b>",
    SEP,
    `🏢 <b>องค์กร:</b> ${escapeHtml(opts.orgName)}`,
    `📆 <b>วันสิ้นสุดสัญญา:</b> ${formatThaiFullDate(opts.contractEndsAt)}`,
    `⏰ <b>เหลือ:</b> ${opts.daysRemaining} วัน`,
    SEP,
    "💬 ติดต่อ Org Admin เพื่อต่อสัญญา",
  ].join("\n");
}

/** สมาชิกที่ dormant > 60 วัน (Phase 2). */
export function dormantMembersTemplate(opts: {
  orgName: string;
  dormantCount: number;
  members: Array<{ name: string; daysInactive: number }>;
}): string {
  const lines: string[] = [];
  lines.push("💤 <b>สมาชิกไม่ active 60+ วัน</b>");
  lines.push(SEP);
  lines.push(`🏢 <b>องค์กร:</b> ${escapeHtml(opts.orgName)}`);
  lines.push(`👥 <b>จำนวน:</b> ${opts.dormantCount} คน`);
  lines.push(SEP);
  lines.push("🙋‍♂️ <b>รายชื่อ</b>");
  for (const m of opts.members.slice(0, 10)) {
    lines.push(`· ${escapeHtml(m.name)} — ${m.daysInactive} วัน`);
  }
  if (opts.members.length > 10) {
    lines.push(`... และอีก ${opts.members.length - 10} คน`);
  }
  lines.push(SEP);
  lines.push("💬 ส่ง LINE/Email ทักทาย · พิจารณา archive");
  return lines.join("\n");
}
