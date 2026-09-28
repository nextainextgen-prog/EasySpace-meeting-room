/**
 * Public (external-customer) booking — rules shared by the server and the
 * `/rooms/*` pages.
 *
 * Pure and client-safe: no Supabase, no env. Anything that decides whether a
 * customer may take a slot lives here once, so the grid the customer taps and
 * the check the server runs can never disagree.
 */

import { addDays, bkkParts, fromBkk, timeToMinutes } from "@/lib/time/bkk";

/** Service window shown to the public. Last booking must end by close. */
export const PUBLIC_OPEN_TIME = "08:30";
export const PUBLIC_CLOSE_TIME = "22:00";
export const PUBLIC_SLOT_MINUTES = 30;

/**
 * A slot that started this recently is still bookable — someone scanning the
 * QR at 10:10 wants the room *now*, not from 10:30.
 */
export const PUBLIC_LATE_START_GRACE_MINUTES = 15;

/** Where the customer came from. Recorded on the booking for reporting. */
export type PublicChannel = "qr" | "line" | "web";

export function parseChannel(raw: string | null | undefined): PublicChannel {
  if (raw === "line" || raw === "qr" || raw === "web") return raw;
  return "qr";
}

export const CHANNEL_LABEL: Record<PublicChannel, string> = {
  qr: "สแกน QR หน้าห้อง",
  line: "LINE OA (ริชเมนู)",
  web: "เว็บไซต์",
};

/** A busy stretch as the public sees it — no owner, no title, no status. */
export interface PublicBusyBlock {
  startsAt: string;
  endsAt: string;
}

export interface PublicPackage {
  id: string;
  name: string;
  hours: number;
  price: number;
}

export interface PublicQuote {
  hours: number;
  hourlyTotal: number;
  total: number;
  packageId: string | null;
  packageName: string | null;
  saving: number;
}

/**
 * The largest package that fits (the admin form's rule) — but a customer is
 * never quoted more than the plain hourly price. Some packages are priced
 * above hourly for their length; online, the cheaper of the two wins.
 */
export function quotePublic(
  hourlyRate: number,
  packages: PublicPackage[],
  minutes: number,
): PublicQuote {
  const hours = minutes / 60;
  const hourlyTotal = Math.round(hours * hourlyRate);
  const fits = packages
    .filter((p) => p.hours <= hours)
    .sort((a, b) => b.hours - a.hours)[0];
  const pkg = fits && fits.price < hourlyTotal ? fits : undefined;
  const total = pkg ? pkg.price : hourlyTotal;
  return {
    hours,
    hourlyTotal,
    total,
    packageId: pkg?.id ?? null,
    packageName: pkg?.name ?? null,
    saving: Math.max(0, hourlyTotal - total),
  };
}

/** Every bookable start time of the day, e.g. ["08:30", "09:00", …, "21:30"]. */
export function publicStartTimes(): string[] {
  const out: string[] = [];
  const open = timeToMinutes(PUBLIC_OPEN_TIME);
  const close = timeToMinutes(PUBLIC_CLOSE_TIME);
  for (let m = open; m + PUBLIC_SLOT_MINUTES <= close; m += PUBLIC_SLOT_MINUTES) {
    out.push(minutesToTime(m));
  }
  return out;
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Merge touching/overlapping blocks so the public can't count bookings. */
export function mergeBlocks(blocks: PublicBusyBlock[]): PublicBusyBlock[] {
  const sorted = [...blocks].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const out: PublicBusyBlock[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && new Date(b.startsAt).getTime() <= new Date(last.endsAt).getTime()) {
      if (new Date(b.endsAt).getTime() > new Date(last.endsAt).getTime()) {
        last.endsAt = b.endsAt;
      }
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

export type SlotState = "free" | "busy" | "past";

/** State of the 30-minute cell starting at `time` on `date`. */
export function slotState(
  date: string,
  time: string,
  busy: PublicBusyBlock[],
  now: Date,
): SlotState {
  const start = fromBkk(date, time).getTime();
  const end = start + PUBLIC_SLOT_MINUTES * 60_000;
  if (start + PUBLIC_LATE_START_GRACE_MINUTES * 60_000 <= now.getTime()) {
    return "past";
  }
  const clash = busy.some(
    (b) =>
      new Date(b.startsAt).getTime() < end &&
      new Date(b.endsAt).getTime() > start,
  );
  return clash ? "busy" : "free";
}

/**
 * Longest booking (minutes) that can start at `time` without running into a
 * busy block or past closing. 0 when the start itself is not bookable.
 */
export function maxRunFrom(
  date: string,
  time: string,
  busy: PublicBusyBlock[],
  now: Date,
): number {
  const close = timeToMinutes(PUBLIC_CLOSE_TIME);
  let minutes = 0;
  for (
    let m = timeToMinutes(time);
    m + PUBLIC_SLOT_MINUTES <= close;
    m += PUBLIC_SLOT_MINUTES
  ) {
    if (slotState(date, minutesToTime(m), busy, now) !== "free") break;
    minutes += PUBLIC_SLOT_MINUTES;
  }
  return minutes;
}

export interface PublicWindowCheck {
  ok: boolean;
  reason?:
    | "bad_format"
    | "outside_hours"
    | "in_past"
    | "too_far"
    | "too_short"
    | "too_long";
}

/** Server-side re-check of a window the client proposed. */
export function checkPublicWindow(opts: {
  date: string;
  startTime: string;
  durationMinutes: number;
  now: Date;
  daysAhead: number;
  minMinutes: number;
  maxMinutes: number;
}): PublicWindowCheck {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date) || !/^\d{2}:\d{2}$/.test(opts.startTime)) {
    return { ok: false, reason: "bad_format" };
  }
  const start = timeToMinutes(opts.startTime);
  const end = start + opts.durationMinutes;
  if (
    start < timeToMinutes(PUBLIC_OPEN_TIME) ||
    end > timeToMinutes(PUBLIC_CLOSE_TIME) ||
    start % PUBLIC_SLOT_MINUTES !== 0 ||
    opts.durationMinutes % PUBLIC_SLOT_MINUTES !== 0
  ) {
    return { ok: false, reason: "outside_hours" };
  }
  if (opts.durationMinutes < opts.minMinutes) return { ok: false, reason: "too_short" };
  if (opts.durationMinutes > opts.maxMinutes) return { ok: false, reason: "too_long" };

  const startsAt = fromBkk(opts.date, opts.startTime).getTime();
  if (startsAt + PUBLIC_LATE_START_GRACE_MINUTES * 60_000 <= opts.now.getTime()) {
    return { ok: false, reason: "in_past" };
  }
  const lastDay = addDays(bkkParts(opts.now).date, opts.daysAhead);
  if (opts.date > lastDay) return { ok: false, reason: "too_far" };
  return { ok: true };
}

/** Normalise a Thai phone number to digits only; null when implausible. */
export function normalisePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+66")) digits = `0${digits.slice(3)}`;
  digits = digits.replace(/\D/g, "");
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

/** 081-234-5678 / 02-123-4567 */
export function formatPhone(digits: string): string {
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

const THAI_WEEKDAY_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_MONTH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const THAI_WEEKDAY_LONG = [
  "อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์",
];
const THAI_MONTH_LONG = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** Calendar parts of a `YYYY-MM-DD` Bangkok date, for date chips. */
export function dateChip(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    weekdayShort: THAI_WEEKDAY_SHORT[dow],
    weekdayLong: THAI_WEEKDAY_LONG[dow],
    day: d,
    monthShort: THAI_MONTH_SHORT[m - 1],
    monthLong: THAI_MONTH_LONG[m - 1],
    yearBE: y + 543,
  };
}

/** "วันพุธที่ 1 ตุลาคม 2569" */
export function thaiDateLong(date: string): string {
  const c = dateChip(date);
  return `วัน${c.weekdayLong}ที่ ${c.day} ${c.monthLong} ${c.yearBE}`;
}

/** "พ. 1 ต.ค." */
export function thaiDateShort(date: string): string {
  const c = dateChip(date);
  return `${c.weekdayShort} ${c.day} ${c.monthShort}`;
}

export function formatBahtPlain(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

export type PublicRoomStatus =
  | { tone: "free"; label: string; sub: string }
  | { tone: "busy"; label: string; sub: string }
  | { tone: "closed"; label: string; sub: string };

/** "ว่างตอนนี้ · ว่างถึง 14:00" — the headline status of a room right now. */
export function publicRoomStatus(busy: PublicBusyBlock[], now: Date): PublicRoomStatus {
  const { date, time } = bkkParts(now);
  const nowMin = timeToMinutes(time);
  if (nowMin < timeToMinutes(PUBLIC_OPEN_TIME) || nowMin >= timeToMinutes(PUBLIC_CLOSE_TIME)) {
    return { tone: "closed", label: "นอกเวลาให้บริการ", sub: "เปิด 08:30 – 22:00 น." };
  }
  const t = now.getTime();
  const current = busy.find(
    (b) => new Date(b.startsAt).getTime() <= t && new Date(b.endsAt).getTime() > t,
  );
  if (current) {
    return { tone: "busy", label: "มีผู้ใช้งานอยู่", sub: `ว่างอีกครั้ง ${bkkParts(current.endsAt).time} น.` };
  }
  const closeAt = fromBkk(date, PUBLIC_CLOSE_TIME).getTime();
  const next = busy
    .map((b) => new Date(b.startsAt).getTime())
    .filter((s) => s > t && s < closeAt)
    .sort((a, b) => a - b)[0];
  return next
    ? { tone: "free", label: "ว่างตอนนี้", sub: `ว่างถึง ${bkkParts(new Date(next)).time} น.` }
    : { tone: "free", label: "ว่างตอนนี้", sub: "ว่างตลอดทั้งวัน" };
}

/** Bookable minutes left on `date` from `now` on (free cells only). */
export function freeMinutesOn(date: string, busy: PublicBusyBlock[], now: Date): number {
  return (
    publicStartTimes().filter((t) => slotState(date, t, busy, now) === "free").length *
    PUBLIC_SLOT_MINUTES
  );
}
