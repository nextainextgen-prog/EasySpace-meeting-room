/**
 * Over-quota billing maths — one function for the admin dashboard, the
 * invoice snapshot, the member booking screens and the Telegram bot, so every
 * screen shows the same number.
 *
 * Rules (agreed with the building, 2026-11):
 *   - A company's free hours are used up in the order rooms are actually used
 *     (start time), whenever the booking was made. Cancel an early booking
 *     and its hours go back to whatever comes after.
 *   - Hours past the quota are charged at the room's normal hourly rate.
 *   - No-shows count and are charged like any booking; only cancelled ones
 *     are left out. No OT surcharge.
 *   - Unlimited companies are never charged.
 *
 * Pure and client-safe. Works in whole minutes so halves never drift.
 */

import { addDays, bkkDate, fromBkk } from "@/lib/time/bkk";

export interface OverageBooking {
  id: string;
  reference: string;
  startsAt: string;
  endsAt: string;
  status: string;
  roomId: string;
  roomName: string;
  /** Baht per hour, VAT as configured in pricing settings. */
  rate: number;
  memberName: string;
  title: string;
  createdAt: string;
}

export interface OverageLine extends OverageBooking {
  hours: number;
  freeHours: number;
  chargedHours: number;
  amount: number;
}

export interface OverageResult {
  lines: OverageLine[];
  quotaHours: number;
  unlimited: boolean;
  usedHours: number;
  overHours: number;
  amount: number;
}

/** Bookings that never count: the room was given back. */
export const NOT_BILLED = ["cancelled"] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const minutes = (b: { startsAt: string; endsAt: string }) =>
  Math.max(0, Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000));

export function computeOverage(
  bookings: OverageBooking[],
  quota: { hours: number; unlimited: boolean },
): OverageResult {
  const counted = bookings
    .filter((b) => !(NOT_BILLED as readonly string[]).includes(b.status))
    .sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );

  let freeLeft = quota.unlimited ? Infinity : Math.max(0, Math.round(quota.hours * 60));
  let used = 0;
  let over = 0;
  let amount = 0;
  const lines = counted.map((b) => {
    const m = minutes(b);
    const free = Math.min(m, freeLeft);
    freeLeft -= free;
    const charged = m - free;
    const lineAmount = r2((charged / 60) * b.rate);
    used += m;
    over += charged;
    amount += lineAmount;
    return {
      ...b,
      hours: r2(m / 60),
      freeHours: r2(free / 60),
      chargedHours: r2(charged / 60),
      amount: lineAmount,
    };
  });

  return {
    lines,
    quotaHours: quota.hours,
    unlimited: quota.unlimited,
    usedHours: r2(used / 60),
    overHours: r2(over / 60),
    amount: r2(amount),
  };
}

/**
 * What one more booking would cost, given the company's month so far.
 * Used on the confirm screens; the month-end figure comes from
 * computeOverage over the whole month.
 */
export function previewCharge(
  remainingFreeHours: number | null,
  hours: number,
  rate: number,
): { chargedHours: number; amount: number } {
  if (remainingFreeHours === null) return { chargedHours: 0, amount: 0 };
  const chargedHours = r2(Math.max(0, hours - Math.max(0, remainingFreeHours)));
  return { chargedHours, amount: r2(chargedHours * rate) };
}

// ─── Periods ("2026-11", Bangkok calendar months) ─────────────────────────

export function currentPeriod(now: Date = new Date()): string {
  return bkkDate(now).slice(0, 7);
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** [start, end) of the month as UTC instants. */
export function periodRange(period: string): { start: string; end: string } {
  const start = fromBkk(`${period}-01`, "00:00");
  const end = fromBkk(`${shiftPeriod(period, 1)}-01`, "00:00");
  return { start: start.toISOString(), end: end.toISOString() };
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** "พฤศจิกายน 2569" */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/** Last day of the period, as YYYY-MM-DD (Bangkok). */
export function periodLastDay(period: string): string {
  return addDays(`${shiftPeriod(period, 1)}-01`, -1);
}

export const INVOICE_STATUS: Record<"issued" | "sent" | "partial" | "paid" | "void", { label: string; tone: "info" | "primary" | "warning" | "success" | "muted" }> = {
  issued: { label: "ออกแล้ว", tone: "info" },
  sent: { label: "ส่งแล้ว", tone: "primary" },
  partial: { label: "รับเงินบางส่วน", tone: "warning" },
  paid: { label: "ชำระแล้ว", tone: "success" },
  void: { label: "ยกเลิก", tone: "muted" },
};
