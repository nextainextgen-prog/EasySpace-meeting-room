import { format as fnsFormat, formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";

const TZ = process.env.APP_TIMEZONE ?? "Asia/Bangkok";

export function formatBaht(amount: number, opts: { sign?: boolean } = {}) {
  const formatted = new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));

  if (opts.sign) {
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
  }
  return formatted;
}

export function formatCompactBaht(amount: number) {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `฿${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `฿${(amount / 1_000).toFixed(0)}K`;
  if (abs >= 1_000) return `฿${(amount / 1_000).toFixed(1)}K`;
  return formatBaht(amount);
}

export function formatPercent(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

export function formatDelta(delta: number, digits = 0) {
  const arrow = delta >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(delta).toFixed(digits)}%`;
}

export function formatDate(input: string | Date, pattern = "d MMM yyyy") {
  return formatInTimeZone(input, TZ, pattern, { locale: th });
}

export function formatThaiBuddhistDate(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input;
  const beYear = d.getFullYear() + 543;
  const month = fnsFormat(d, "MMM", { locale: th });
  return `${d.getDate()} ${month} ${beYear}`;
}

export function formatTime(input: string | Date) {
  return formatInTimeZone(input, TZ, "HH:mm");
}

export function formatTimeRange(start: string | Date, end: string | Date) {
  return `${formatTime(start)} – ${formatTime(end)} น.`;
}

export function relativeFromNow(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input;
  return formatDistanceToNow(d, { addSuffix: true, locale: th });
}

export function durationHours(start: string | Date, end: string | Date) {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  return Math.max(0, (e.getTime() - s.getTime()) / 3_600_000);
}
