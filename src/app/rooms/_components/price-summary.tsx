"use client";

import { cn } from "@/lib/cn";
import { thb, type PriceBreakdown } from "@/lib/public-booking/pricing";

/**
 * The full money picture, identical wherever it appears: estimate before a
 * request, the quotation, and the payment step.
 */
export function PriceSummary({
  p,
  estimate,
  dueNow,
  dueLabel,
  className,
}: {
  p: PriceBreakdown;
  /** Show the "estimate, final price on the quotation" note. */
  estimate?: boolean;
  dueNow?: number | null;
  dueLabel?: string;
  className?: string;
}) {
  const hasTax = p.vatEnabled || p.withholding;
  return (
    <div className={cn("space-y-2 text-[13.5px]", className)}>
      {p.lines.map((l, i) => (
        <Row key={i} k={l.label} v={thb(l.amount)} muted />
      ))}
      {p.packageName && p.hourlyTotal > p.lines[0]?.amount && (
        <p className="text-[12px] text-emerald-700">
          ใช้แพ็กเกจ ประหยัด {thb(p.hourlyTotal - p.lines[0].amount)} จากราคาปกติ {thb(p.hourlyTotal)}
        </p>
      )}
      {p.discount > 0 && <Row k="ส่วนลด" v={`−${thb(p.discount)}`} muted />}

      <div className="space-y-1.5 border-t border-dashed border-slate-900/10 pt-2.5">
        {p.vatEnabled && (
          <>
            <Row k="ราคาก่อน VAT" v={thb(p.preVat)} muted />
            <Row k={`VAT ${p.vatRate}%`} v={thb(p.vat)} muted />
          </>
        )}
        <Row
          k={p.vatEnabled ? "ราคารวม VAT" : "ราคารวม"}
          v={thb(p.grandTotal)}
          strong={!p.withholding}
          big={!p.withholding}
        />
        {p.withholding && (
          <>
            <Row k={`หัก ณ ที่จ่าย ${p.whtRate}%`} v={`−${thb(p.wht)}`} muted />
            <Row k="ยอดชำระจริง" v={thb(p.netPayable)} strong big />
          </>
        )}
      </div>

      {dueNow != null && dueNow > 0 && (
        <div className="flex items-baseline justify-between border-t border-slate-900/[0.07] pt-2.5 text-ink-1">
          <span className="font-semibold tracking-tight">{dueLabel ?? "ชำระตอนนี้"}</span>
          <span className="text-[16px] font-bold tabular-nums">{thb(dueNow)}</span>
        </div>
      )}

      {(estimate || hasTax) && (
        <p className="pt-1 text-[11.5px] leading-relaxed text-ink-3">
          {estimate ? "ราคาประเมินเบื้องต้น · ราคาจริงตามใบเสนอราคาจากแอดมิน" : ""}
          {estimate && hasTax ? " · " : ""}
          {p.vatEnabled ? (p.vatInclusive ? "ราคาห้องรวม VAT แล้ว" : "ราคาห้องยังไม่รวม VAT") : ""}
        </p>
      )}
    </div>
  );
}

function Row({ k, v, muted, strong, big }: { k: string; v: string; muted?: boolean; strong?: boolean; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 tabular-nums">
      <span className={cn(muted ? "text-ink-2" : "text-ink-1", strong && "font-semibold tracking-tight")}>{k}</span>
      <span className={cn("whitespace-nowrap", strong ? "font-bold text-ink-1" : "text-ink-1", big && "text-[20px] tracking-tighter")}>
        {v}
      </span>
    </div>
  );
}
