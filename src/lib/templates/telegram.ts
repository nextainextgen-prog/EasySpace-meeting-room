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
