import { notFound } from "next/navigation";
import { computeOverage, currentPeriod, shiftPeriod, type OverageBooking } from "@/lib/billing/overage";
import { fromBkk } from "@/lib/time/bkk";
import { toInvoiceLines, type BillTo, type OrgInvoice, type OrgMonth } from "@/lib/server/org-billing";
import { BillingBoard } from "@/app/admin/orgs/billing/billing-board";
import { InvoiceDoc } from "@/app/admin/orgs/billing/[id]/invoice-doc";
import { InvoiceActions } from "@/app/admin/orgs/billing/[id]/invoice-actions";

export const dynamic = "force-dynamic";

/**
 * Development only: the over-quota billing screens with made-up companies,
 * for checking the layout without signing in. Every company, person and
 * number here is fictional.
 *   /dev/billing?view=board | invoice
 */
export default async function DevBilling({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view = "board" } = await searchParams;
  const period = shiftPeriod(currentPeriod(), -1);

  const rooms = [
    { id: "p", name: "PRIME ROOM", rate: 200 },
    { id: "m", name: "MASTER ROOM", rate: 380 },
    { id: "e", name: "MEETING ROOM", rate: 600 },
  ];
  let n = 0;
  const bk = (day: number, from: string, to: string, r: number, who: string, status = "completed"): OverageBooking => {
    n++;
    const d = `${period}-${String(day).padStart(2, "0")}`;
    return {
      id: `dev-${n}`,
      reference: `BK${String(900 + n).padStart(5, "0")}`,
      startsAt: fromBkk(d, from).toISOString(),
      endsAt: fromBkk(d, to).toISOString(),
      status,
      roomId: rooms[r].id,
      roomName: rooms[r].name,
      rate: rooms[r].rate,
      memberName: who,
      title: "ประชุม",
      createdAt: fromBkk(`${period}-01`, "08:00").toISOString(),
    };
  };
  const bill = (name: string): BillTo => ({ name, taxId: "0105500000000", branch: "สำนักงานใหญ่", address: "99 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10000", email: "billing@example.com" });
  const org = (id: string, name: string, quota: number, bookings: OverageBooking[], unlimited = false): OrgMonth => ({
    orgId: id,
    orgName: name,
    orgStatus: "active",
    logoUrl: null,
    brandColor: null,
    billTo: bill(name),
    ...computeOverage(bookings, { hours: quota, unlimited }),
  });

  const months: OrgMonth[] = [
    org("a", "บริษัท ตัวอย่างหนึ่ง จำกัด", 10, [
      bk(3, "09:00", "12:00", 0, "สมชาย ใจดี"),
      bk(7, "13:00", "17:00", 1, "สมหญิง รักงาน"),
      bk(12, "09:00", "11:00", 1, "สมชาย ใจดี"),
      bk(18, "14:00", "16:30", 2, "วิชัย มั่นคง", "no_show"),
      bk(25, "10:00", "12:00", 0, "สมหญิง รักงาน"),
    ]),
    org("b", "บริษัท ตัวอย่างสอง จำกัด", 20, [bk(4, "09:00", "12:00", 1, "ปรีชา ตั้งใจ"), bk(20, "13:00", "15:00", 0, "ปรีชา ตั้งใจ")]),
    org("c", "บริษัท ตัวอย่างสาม จำกัด", 0, [bk(10, "09:00", "18:00", 2, "อารีย์ ใจงาม")], true),
  ];

  const a = months[0];
  const inv: OrgInvoice = {
    id: "dev-inv",
    invoiceNo: `INV-${period.replace("-", "")}-0001`,
    orgId: a.orgId,
    orgName: a.orgName,
    period,
    status: "partial",
    quotaHours: a.quotaHours,
    usedHours: a.usedHours,
    overHours: a.overHours,
    subtotal: a.amount,
    vatRate: 7,
    vatInclusive: true,
    preVat: Math.round((a.amount * 100) / 1.07) / 100,
    vatAmount: Math.round((a.amount - a.amount / 1.07) * 100) / 100,
    grandTotal: a.amount,
    whtRate: 3,
    whtAmount: Math.round(((a.amount / 1.07) * 3)) / 100,
    netPayable: Math.round((a.amount - (a.amount / 1.07) * 0.03) * 100) / 100,
    paidAmount: 1000,
    lines: toInvoiceLines(a.lines),
    billTo: a.billTo,
    issuer: { name: "EasySpace", legal_name: "บริษัท อาคารตัวอย่าง จำกัด", tax_id: "0105500000001", address: "1 ถนนตัวอย่าง กรุงเทพฯ", phone: "02-000-0000", email: "office@example.com" },
    dueDate: `${currentPeriod()}-15`,
    notes: "โอนเข้าบัญชีบริษัท อาคารตัวอย่าง จำกัด",
    issuedByName: "ฝ่ายบัญชี",
    issuedAt: fromBkk(`${currentPeriod()}-01`, "10:00").toISOString(),
    sentAt: fromBkk(`${currentPeriod()}-01`, "10:05").toISOString(),
    paidAt: null,
    voidedAt: null,
    voidReason: null,
    replacesId: null,
  };
  const at = (h: string) => fromBkk(`${currentPeriod()}-01`, h).toISOString();
  const events = [
    { id: "e1", action: "issued", detail: { netPayable: inv.netPayable, bookings: 3 }, actorName: "ฝ่ายบัญชี", createdAt: at("10:00") },
    { id: "e2", action: "sent", detail: { to: "billing@example.com", viaEmail: true }, actorName: "ฝ่ายบัญชี", createdAt: at("10:05") },
    { id: "e3", action: "payment", detail: { amount: 1000, method: "bank_transfer", reference: "TX0001", balance: inv.netPayable - 1000 }, actorName: "ฝ่ายบัญชี", createdAt: at("15:20") },
  ];
  const payments = [{ id: "p1", amount: 1000, paidOn: `${currentPeriod()}-01`, method: "bank_transfer", reference: "TX0001", notes: null, recordedByName: "ฝ่ายบัญชี", createdAt: at("15:20") }];

  if (view === "invoice") {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <InvoiceDoc inv={inv} />
        <InvoiceActions inv={inv} payments={payments} events={events} month={null} />
      </div>
    );
  }
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <BillingBoard
        period={period}
        ended
        tablesReady
        months={months}
        invoices={[{ ...inv, orgId: "b-none" }]}
        checks={[
          { level: "warn", orgId: "a", title: `${a.orgName}: เดือนนี้จบแล้วแต่ยังไม่ได้ออกใบแจ้งหนี้`, detail: `ใช้เกิน ${a.overHours} ชม. ยอด ${a.amount.toLocaleString()} บาท` },
          { level: "info", title: "ตัวอย่างข้อความแจ้งเพื่อทราบ", detail: "ยอดเงินยังตรงกันอยู่ ไม่ต้องทำอะไร" },
        ]}
      />
    </div>
  );
}
