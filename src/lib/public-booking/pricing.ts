/**
 * Online price estimate / quotation maths — one function for the customer
 * page, the server and the admin quotation editor, so the number a customer
 * sees is the number the team quotes.
 *
 *   room price (package or hourly)
 * + OT (hours after ot_start)
 * = subtotal
 *   → VAT (inclusive or exclusive)       = grand total
 *   → minus withholding tax (juristic)   = net payable (what is transferred)
 *
 * Pure and client-safe.
 */

import { timeToMinutes } from "@/lib/time/bkk";
import { PUBLIC_CLOSE_TIME, quotePublic, type PublicPackage } from "./shared";

export interface PricingConfig {
  vat_enabled: boolean;
  vat_rate: number;
  /** Room prices already include VAT. */
  vat_inclusive: boolean;
  wht_enabled: boolean;
  wht_rate: number;
  ot_enabled: boolean;
  /** "18:00" — minutes from here to the end of the booking are OT. */
  ot_start: string;
  /** per_hour = baht per OT hour; percent = % of the room's hourly rate per OT hour. */
  ot_type: "per_hour" | "percent";
  ot_value: number;
  /** Customer sends a request, admin quotes, customer confirms, then pays. */
  quote_required: boolean;
  /** How long a request holds the room while the team prepares a quote. */
  request_hold_hours: number;
  /** How long a quotation stays valid (and the room held) once issued. */
  quote_valid_hours: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  vat_enabled: true,
  vat_rate: 7,
  vat_inclusive: true,
  wht_enabled: true,
  wht_rate: 3,
  ot_enabled: true,
  ot_start: "18:00",
  ot_type: "per_hour",
  ot_value: 100,
  quote_required: true,
  request_hold_hours: 24,
  quote_valid_hours: 48,
};

export interface PriceLine {
  label: string;
  amount: number;
  qty?: number;
  unitPrice?: number;
}

export interface PriceBreakdown {
  /** Room + OT + extra lines, before discount. */
  lines: PriceLine[];
  discount: number;
  subtotal: number;
  vatEnabled: boolean;
  vatRate: number;
  vatInclusive: boolean;
  preVat: number;
  vat: number;
  grandTotal: number;
  withholding: boolean;
  whtRate: number;
  wht: number;
  netPayable: number;
  /** Informational: what OT covered. */
  otMinutes: number;
  packageName: string | null;
  hourlyTotal: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Totals from any list of lines — used by both the estimate and quotations. */
export function totalsFromLines(
  lines: PriceLine[],
  discount: number,
  cfg: PricingConfig,
  withholding: boolean,
): Omit<PriceBreakdown, "otMinutes" | "packageName" | "hourlyTotal"> {
  const gross = r2(lines.reduce((s, l) => s + l.amount, 0));
  const disc = Math.min(Math.max(0, r2(discount)), gross);
  const subtotal = r2(gross - disc);
  let preVat = subtotal;
  let vat = 0;
  let grandTotal = subtotal;
  if (cfg.vat_enabled && cfg.vat_rate > 0) {
    if (cfg.vat_inclusive) {
      preVat = r2((subtotal * 100) / (100 + cfg.vat_rate));
      vat = r2(subtotal - preVat);
      grandTotal = subtotal;
    } else {
      vat = r2((subtotal * cfg.vat_rate) / 100);
      grandTotal = r2(subtotal + vat);
    }
  }
  const whtOn = withholding && cfg.wht_enabled && cfg.wht_rate > 0;
  const wht = whtOn ? r2((preVat * cfg.wht_rate) / 100) : 0;
  return {
    lines,
    discount: disc,
    subtotal,
    vatEnabled: cfg.vat_enabled,
    vatRate: cfg.vat_rate,
    vatInclusive: cfg.vat_inclusive,
    preVat,
    vat,
    grandTotal,
    withholding: whtOn,
    whtRate: cfg.wht_rate,
    wht,
    netPayable: r2(grandTotal - wht),
  };
}

/** Minutes of [start, start+minutes) that fall after the OT start. */
export function otMinutesFor(startTime: string, minutes: number, cfg: PricingConfig): number {
  if (!cfg.ot_enabled) return 0;
  const s = timeToMinutes(startTime);
  const e = s + minutes;
  const ot = timeToMinutes(cfg.ot_start);
  const close = Math.max(timeToMinutes(PUBLIC_CLOSE_TIME), e);
  return Math.max(0, Math.min(e, close) - Math.max(s, ot));
}

export function estimatePrice(opts: {
  hourlyRate: number;
  packages: PublicPackage[];
  startTime: string;
  minutes: number;
  cfg: PricingConfig;
  withholding: boolean;
}): PriceBreakdown {
  const q = quotePublic(opts.hourlyRate, opts.packages, opts.minutes);
  const hours = opts.minutes / 60;
  const lines: PriceLine[] = [
    {
      label: q.packageName ? `ค่าห้อง · แพ็กเกจ ${q.packageName}` : `ค่าห้อง ${hours} ชม.`,
      amount: q.total,
      qty: q.packageName ? 1 : hours,
      unitPrice: q.packageName ? q.total : opts.hourlyRate,
    },
  ];
  const otMin = otMinutesFor(opts.startTime, opts.minutes, opts.cfg);
  if (otMin > 0) {
    const otHours = otMin / 60;
    const perHour =
      opts.cfg.ot_type === "percent" ? r2((opts.hourlyRate * opts.cfg.ot_value) / 100) : opts.cfg.ot_value;
    if (perHour > 0) {
      lines.push({
        label: `ค่า OT หลัง ${opts.cfg.ot_start} น. (${otHours} ชม.)`,
        amount: r2(perHour * otHours),
        qty: otHours,
        unitPrice: perHour,
      });
    }
  }
  return {
    ...totalsFromLines(lines, 0, opts.cfg, opts.withholding),
    otMinutes: otMin,
    packageName: q.packageName,
    hourlyTotal: q.hourlyTotal,
  };
}

export const thb = (n: number) =>
  `฿${n.toLocaleString("th-TH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Normalise a tax ID to 13 digits, or null. */
export function normaliseTaxId(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 13 ? d : null;
}
