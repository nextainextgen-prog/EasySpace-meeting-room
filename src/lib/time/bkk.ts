/**
 * Bangkok-safe date math.
 *
 * Everything the booking system stores is an absolute instant (timestamptz),
 * but every rule people care about — "Tuesday", "15:00", "the same week" — is
 * expressed in Bangkok wall-clock. `Date.setHours()` / `getHours()` read the
 * *runtime's* timezone, which is UTC on Vercel, so using them server-side
 * silently shifts a morning slot to the previous calendar day. That bug has
 * already been paid for once (see scripts/fix-thunder-recurring.ts).
 *
 * Bangkok has no DST and has been fixed at UTC+07:00 since 1920, so a constant
 * offset is exact — no Intl round-trip needed for the arithmetic.
 */

export const BKK_TZ = "Asia/Bangkok";
export const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const THAI_WEEKDAY_LABEL: Record<Weekday, string> = {
  1: "จันทร์",
  2: "อังคาร",
  3: "พุธ",
  4: "พฤหัสบดี",
  5: "ศุกร์",
  6: "เสาร์",
  7: "อาทิตย์",
};

/** `rooms.service_days` uses 0 = Sunday … 6 = Saturday (JS convention). */
export function weekdayToServiceDay(w: Weekday): number {
  return w === 7 ? 0 : w;
}

function toDate(input: string | Date): Date {
  return typeof input === "string" ? new Date(input) : input;
}

/** The instant shifted so that UTC getters read Bangkok wall-clock. */
function asBkkClock(input: string | Date): Date {
  return new Date(toDate(input).getTime() + BKK_OFFSET_MS);
}

export interface BkkParts {
  /** `YYYY-MM-DD` in Bangkok. */
  date: string;
  /** 1 = Monday … 7 = Sunday. */
  weekday: Weekday;
  weekdayLabel: string;
  hour: number;
  minute: number;
  /** `HH:mm` in Bangkok. */
  time: string;
}

export function bkkParts(input: string | Date): BkkParts {
  const d = asBkkClock(input);
  const dow = d.getUTCDay();
  const weekday = (dow === 0 ? 7 : dow) as Weekday;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    weekday,
    weekdayLabel: THAI_WEEKDAY_LABEL[weekday],
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export function bkkDate(input: string | Date): string {
  return bkkParts(input).date;
}

export function bkkTime(input: string | Date): string {
  return bkkParts(input).time;
}

export function bkkWeekday(input: string | Date): Weekday {
  return bkkParts(input).weekday;
}

/**
 * Build the exact instant for a Bangkok wall-clock date + time.
 * `date` is `YYYY-MM-DD`, `time` is `HH:mm`.
 */
export function fromBkk(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) - BKK_OFFSET_MS);
}

/** Add whole days to a `YYYY-MM-DD` Bangkok date string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * The given weekday inside the same Monday-Sunday week as `input`.
 * Moving a Wednesday booking to `TUESDAY` therefore lands on the day before,
 * not on the following Tuesday — which is what "ย้ายไปวันอังคาร" means for a
 * weekly series.
 */
export function sameWeekWeekday(input: string | Date, target: Weekday): string {
  const parts = bkkParts(input);
  return addDays(parts.date, target - parts.weekday);
}

/** `HH:mm` shifted by whole minutes, clamped inside the same day. */
export function addMinutesToTime(time: string, minutes: number): string {
  const [hh, mm] = time.split(":").map(Number);
  const total = Math.max(0, Math.min(24 * 60, hh * 60 + mm + minutes));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/** Minutes since midnight for an `HH:mm` string. */
export function timeToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

/** `13 ก.ย.` style label, built without pulling in a formatter. */
const THAI_MONTH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function bkkDateLabel(input: string | Date): string {
  const d = asBkkClock(input);
  return `${d.getUTCDate()} ${THAI_MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}
