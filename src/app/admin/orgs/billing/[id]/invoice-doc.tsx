import { periodLabel } from "@/lib/billing/overage";
import { bkkDateLabel } from "@/lib/time/bkk";
import type { OrgInvoice } from "@/lib/server/org-billing";

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00+07:00`).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });

/** The invoice as a document — A4 on paper. Server-safe (no hooks). */
export function InvoiceDoc({ inv }: { inv: OrgInvoice }) {
  const charged = inv.lines.filter((l) => l.chargedHours > 0);
  return (
    <article className="relative rounded-[24px] bg-white p-6 text-ink-1 ring-1 ring-slate-900/[0.07] sm:p-8 print:rounded-none print:p-0 print:ring-0">
      {inv.status === "void" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-18deg] rounded-xl border-4 border-red-500/60 px-8 py-2 text-5xl font-bold tracking-tight text-red-500/60">
            ยกเลิก
          </span>
        </div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-900/[0.08] pb-5">
        <div className="min-w-0">
          <p className="text-[18px] font-bold tracking-tighter">{inv.issuer.legal_name || inv.issuer.name}</p>
          {inv.issuer.address && <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-2">{inv.issuer.address}</p>}
          <p className="mt-1 text-[12px] text-ink-2">
            {[inv.issuer.tax_id && `เลขผู้เสียภาษี ${inv.issuer.tax_id}`, inv.issuer.phone, inv.issuer.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-bold tracking-tighter">ใบแจ้งหนี้</p>
          <p className="text-[12px] text-ink-3">Invoice</p>
          <p className="mt-2 font-mono text-[14px] font-bold">{inv.invoiceNo}</p>
          <p className="text-[12px] text-ink-2">ออกวันที่ {bkkDateLabel(inv.issuedAt)}</p>
          {inv.dueDate && <p className="text-[12px] text-ink-2">ครบกำหนดชำระ {bkkDateLabel(`${inv.dueDate}T12:00:00+07:00`)}</p>}
        </div>
      </header>

      <section className="grid gap-4 border-b border-slate-900/[0.08] py-5 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">ลูกค้า</p>
          <p className="mt-1 text-[14px] font-semibold">{inv.billTo.name}</p>
          {inv.billTo.address && <p className="text-[12px] leading-relaxed text-ink-2">{inv.billTo.address}</p>}
          <p className="text-[12px] text-ink-2">
            {[inv.billTo.taxId && `เลขผู้เสียภาษี ${inv.billTo.taxId}`, inv.billTo.branch].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">รายการ</p>
          <p className="mt-1 text-[14px] font-semibold">ค่าใช้ห้องประชุมส่วนที่เกินโควตา</p>
          <p className="text-[12px] text-ink-2">ประจำเดือน {periodLabel(inv.period)}</p>
          <p className="text-[12px] text-ink-2">
            โควตา {inv.quotaHours} ชม. · ใช้จริง {inv.usedHours} ชม. · เกิน {inv.overHours} ชม.
          </p>
        </div>
      </section>

      <table className="mt-4 w-full text-[12px]">
        <thead className="text-ink-3">
          <tr className="border-b border-slate-900/[0.08]">
            <th className="py-2 text-left font-medium">วันที่ / เวลา</th>
            <th className="py-2 text-left font-medium">ห้อง / ผู้จอง</th>
            <th className="py-2 text-right font-medium">ชม. ที่คิด</th>
            <th className="py-2 text-right font-medium">ราคา/ชม.</th>
            <th className="py-2 text-right font-medium">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {charged.map((l) => (
            <tr key={l.bookingId} className="border-b border-slate-900/[0.05] align-top">
              <td className="py-2 tabular-nums whitespace-nowrap">
                {dayLabel(l.date)} {l.start}–{l.end}
              </td>
              <td className="py-2">
                {l.roomName}
                <span className="block text-ink-3">
                  {l.memberName} · {l.reference}
                  {l.status === "no_show" && " · ไม่มาใช้ห้อง"}
                  {l.freeHours > 0 && ` · ใช้โควตา ${l.freeHours} ชม.`}
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">{l.chargedHours}</td>
              <td className="py-2 text-right tabular-nums">{baht(l.rate)}</td>
              <td className="py-2 text-right tabular-nums">{baht(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-[13px]">
        <Row label="รวมเป็นเงิน" value={baht(inv.subtotal)} />
        {inv.vatRate > 0 && (
          <>
            <Row label={inv.vatInclusive ? "มูลค่าก่อนภาษี" : "มูลค่าสินค้า/บริการ"} value={baht(inv.preVat)} muted />
            <Row label={`ภาษีมูลค่าเพิ่ม ${inv.vatRate}%${inv.vatInclusive ? " (รวมในราคา)" : ""}`} value={baht(inv.vatAmount)} muted />
            <Row label="ยอดรวมทั้งสิ้น" value={baht(inv.grandTotal)} />
          </>
        )}
        {inv.whtAmount > 0 && <Row label={`หัก ณ ที่จ่าย ${inv.whtRate}%`} value={`-${baht(inv.whtAmount)}`} muted />}
        <div className="flex justify-between border-t border-slate-900/[0.1] pt-2 text-[15px] font-bold">
          <span>ยอดชำระ</span>
          <span className="tabular-nums">{baht(inv.netPayable)} บาท</span>
        </div>
      </div>

      {inv.notes && <p className="mt-6 whitespace-pre-line text-[12px] text-ink-2">{inv.notes}</p>}
      <p className="mt-6 text-[11px] text-ink-3">
        คิดชั่วโมงที่เกินโควตาตามราคาห้องต่อชั่วโมง ชั่วโมงฟรีถูกใช้ตามลำดับวันเวลาที่ใช้ห้อง การจองที่ไม่มาใช้ห้องคิดตามปกติ
      </p>
    </article>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={muted ? "flex justify-between text-ink-2" : "flex justify-between"}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
