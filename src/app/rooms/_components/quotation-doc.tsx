import { bkkDate, bkkDateLabel, bkkTime } from "@/lib/time/bkk";
import { thaiDateLong } from "@/lib/public-booking/shared";
import { thb } from "@/lib/public-booking/pricing";
import type { PublicDocInfo, PublicQuotation } from "@/lib/server/public-booking";

export interface CompanyProfile {
  name: string;
  legal_name: string;
  tax_id: string;
  address: string;
  phone: string;
  email: string;
}

/**
 * The quotation as a document — A4 on paper, a clean card on a phone.
 * Server- and client-safe (no hooks), so the print page can render it too.
 */
export function QuotationDoc({
  quote,
  company,
  customer,
  doc,
  booking,
}: {
  quote: PublicQuotation;
  company: CompanyProfile;
  customer: { name: string; phone?: string | null; email?: string | null };
  doc: PublicDocInfo | null;
  booking: { reference: string; roomName: string; startsAt: string; endsAt: string; attendees: number | null };
}) {
  const b = quote.breakdown;
  return (
    <article className="rounded-[24px] bg-white p-5 text-ink-1 ring-1 ring-slate-900/[0.07] sm:p-8 print:rounded-none print:p-0 print:ring-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-900/[0.08] pb-5">
        <div className="min-w-0">
          <p className="text-[18px] font-bold tracking-tighter">{company.legal_name || company.name}</p>
          {company.address && <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-2">{company.address}</p>}
          <p className="mt-1 text-[12px] text-ink-2">
            {[company.tax_id && `เลขผู้เสียภาษี ${company.tax_id}`, company.phone, company.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-bold tracking-tighter">ใบเสนอราคา</p>
          <p className="text-[12px] text-ink-3">Quotation</p>
          <p className="mt-2 font-mono text-[14px] font-bold">{quote.number}</p>
          <p className="text-[12px] text-ink-2">ออกวันที่ {bkkDateLabel(quote.issuedAt)}</p>
          <p className="text-[12px] text-ink-2">
            ยืนราคาถึง {bkkDateLabel(quote.validUntil)} {bkkTime(quote.validUntil)} น.
          </p>
        </div>
      </header>

      <section className="grid gap-5 border-b border-slate-900/[0.08] py-5 text-[13px] sm:grid-cols-2">
        <div>
          <p className="text-[11.5px] font-medium text-ink-3">ลูกค้า</p>
          <p className="mt-1 font-semibold">{doc?.company || customer.name}</p>
          {doc?.company && <p className="text-ink-2">ผู้ติดต่อ: {customer.name}</p>}
          {doc?.taxId && (
            <p className="text-ink-2">
              เลขผู้เสียภาษี {doc.taxId}
              {doc.branch ? ` · ${doc.branch}` : ""}
            </p>
          )}
          {doc?.address && <p className="text-ink-2">{doc.address}</p>}
          <p className="text-ink-2">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-ink-3">รายละเอียดการใช้ห้อง</p>
          <p className="mt-1 font-semibold">{booking.roomName}</p>
          <p className="text-ink-2">{thaiDateLong(bkkDate(booking.startsAt))}</p>
          <p className="text-ink-2 tabular-nums">
            {bkkTime(booking.startsAt)} – {bkkTime(booking.endsAt)} น.
            {booking.attendees ? ` · ${booking.attendees} ท่าน` : ""}
          </p>
          <p className="text-ink-3">อ้างอิงการจอง {booking.reference}</p>
        </div>
      </section>

      <table className="mt-4 w-full text-[13px]">
        <thead>
          <tr className="border-b border-slate-900/[0.08] text-left text-[11.5px] text-ink-3">
            <th className="py-2 font-medium">รายการ</th>
            <th className="py-2 text-right font-medium">จำนวน</th>
            <th className="py-2 text-right font-medium">ราคา/หน่วย</th>
            <th className="py-2 text-right font-medium">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-900/[0.05] align-top">
              <td className="py-2.5 pr-2">{l.label}</td>
              <td className="py-2.5 text-right tabular-nums">{l.qty}</td>
              <td className="py-2.5 text-right tabular-nums">{thb(l.unitPrice)}</td>
              <td className="py-2.5 text-right tabular-nums">{thb(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-[13px] tabular-nums">
        {b.discount > 0 && <Total k="ส่วนลด" v={`−${thb(b.discount)}`} />}
        {b.vatEnabled && (
          <>
            <Total k="ราคาก่อน VAT" v={thb(b.preVat)} />
            <Total k={`VAT ${b.vatRate}%`} v={thb(b.vat)} />
          </>
        )}
        <Total k={b.vatEnabled ? "ราคารวม VAT" : "ราคารวม"} v={thb(b.grandTotal)} strong={!b.withholding} />
        {b.withholding && (
          <>
            <Total k={`หัก ณ ที่จ่าย ${b.whtRate}%`} v={`−${thb(b.wht)}`} />
            <Total k="ยอดชำระสุทธิ" v={thb(b.netPayable)} strong />
          </>
        )}
      </dl>

      {quote.note && (
        <p className="mt-5 border-l-2 border-ink-1 pl-3 text-[13px] leading-relaxed text-ink-2">{quote.note}</p>
      )}
      <p className="mt-5 text-[11.5px] leading-relaxed text-ink-3">
        {b.vatEnabled && b.vatInclusive ? "ราคารวมภาษีมูลค่าเพิ่มแล้ว · " : ""}
        ออกโดย {quote.issuedBy}
        {quote.acceptedAt ? ` · ลูกค้ายืนยันเมื่อ ${bkkDateLabel(quote.acceptedAt)} ${bkkTime(quote.acceptedAt)} น.` : ""}
      </p>
    </article>
  );
}

function Total({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-slate-900/[0.08] pt-1.5 text-[15px] font-bold" : "text-ink-2"}`}>
      <dt>{k}</dt>
      <dd className={strong ? "text-ink-1" : ""}>{v}</dd>
    </div>
  );
}
