"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, FileText, ShieldCheck, AlertTriangle, Info, CircleAlert, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal, ModalBody } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { INVOICE_STATUS, periodLabel } from "@/lib/billing/overage";
import { issueOrgInvoice } from "@/lib/actions/org-billing";
import type { BillingCheck, OrgInvoice, OrgMonth } from "@/lib/server/org-billing";

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (n: number) => `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ชม.`;


const STATUS_TH: Record<string, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  in_use: "กำลังใช้",
  completed: "ใช้แล้ว",
  no_show: "ไม่มาใช้",
  cancelled: "ยกเลิก",
};

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

export function BillingBoard({
  period,
  ended,
  tablesReady,
  months,
  invoices,
  checks,
}: {
  period: string;
  ended: boolean;
  tablesReady: boolean;
  months: OrgMonth[];
  invoices: OrgInvoice[];
  checks: BillingCheck[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<OrgMonth | null>(null);
  const live = (orgId: string) => invoices.find((i) => i.orgId === orgId && i.period === period && i.status !== "void");
  const sorted = [...months].sort((a, b) => b.amount - a.amount || b.usedHours - a.usedHours);

  return (
    <>
      <ChecksCard checks={checks} />

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-4">
          <CardTitle>บริษัทในเดือน{periodLabel(period)}</CardTitle>
          <CardSubtitle>
            ชั่วโมงฟรีถูกใช้ตามลำดับวันเวลาที่ใช้ห้องจริง ชั่วโมงหลังจากนั้นคิดตามราคาห้อง กดแถวเพื่อดูรายการจอง
          </CardSubtitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-ink-3 text-xs">
              <tr>
                <th className="text-left font-medium px-6 py-2.5">บริษัท</th>
                <th className="text-right font-medium px-3 py-2.5">โควตา</th>
                <th className="text-right font-medium px-3 py-2.5">ใช้จริง</th>
                <th className="text-right font-medium px-3 py-2.5">เกิน</th>
                <th className="text-right font-medium px-3 py-2.5">ยอดเงิน</th>
                <th className="text-left font-medium px-6 py-2.5">ใบแจ้งหนี้</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const inv = live(m.orgId);
                const expanded = open === m.orgId;
                return (
                  <Fragment key={m.orgId}>
                    <tr
                      className={cn("border-t border-line cursor-pointer hover:bg-surface-subtle/60", expanded && "bg-surface-subtle/60")}
                      onClick={() => setOpen(expanded ? null : m.orgId)}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2 font-medium text-ink-1">
                          <ChevronDown size={14} className={cn("text-ink-3 transition-transform", !expanded && "-rotate-90")} />
                          {m.orgName}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-2">{m.unlimited ? "ไม่จำกัด" : hrs(m.quotaHours)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{hrs(m.usedHours)}</td>
                      <td className={cn("px-3 py-3 text-right tabular-nums", m.overHours > 0 ? "text-red-600 font-semibold" : "text-ink-3")}>
                        {m.overHours > 0 ? hrs(m.overHours) : "-"}
                      </td>
                      <td className={cn("px-3 py-3 text-right tabular-nums", m.amount > 0 ? "font-semibold text-ink-1" : "text-ink-3")}>
                        {m.amount > 0 ? baht(m.amount) : "-"}
                      </td>
                      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                        {inv ? (
                          <Link href={`/admin/orgs/billing/${inv.id}`} className="inline-flex items-center gap-2 hover:underline">
                            <span className="font-mono text-xs">{inv.invoiceNo}</span>
                            <Badge tone={INVOICE_STATUS[inv.status].tone}>{INVOICE_STATUS[inv.status].label}</Badge>
                          </Link>
                        ) : m.amount <= 0 ? (
                          <span className="text-xs text-ink-3">ไม่ต้องออก</span>
                        ) : !ended ? (
                          <span className="text-xs text-ink-3">ออกได้เมื่อจบเดือน</span>
                        ) : (
                          <Button size="sm" disabled={!tablesReady} onClick={() => setIssuing(m)} iconLeft={<FileText size={14} />}>
                            ออกใบแจ้งหนี้
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-surface-subtle/40">
                        <td colSpan={6} className="px-6 pb-4 pt-1">
                          <BookingLines month={m} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {months.length === 0 && (
          <div className="p-6">
            <EmptyState icon={FileText} title="ยังไม่มีบริษัทในระบบ" />
          </div>
        )}
      </Card>

      <InvoiceList invoices={invoices} />

      {issuing && <IssueModal month={issuing} period={period} onClose={() => setIssuing(null)} />}
    </>
  );
}

function ChecksCard({ checks }: { checks: BillingCheck[] }) {
  const icon = { error: CircleAlert, warn: AlertTriangle, info: Info } as const;
  const tone = {
    error: "border-red-200 bg-red-50 text-red-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-line bg-surface-subtle text-ink-2",
  } as const;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>ตรวจสอบก่อนเรียกเก็บ</CardTitle>
          <CardSubtitle>ระบบเทียบยอดในใบแจ้งหนี้กับการจองล่าสุด ราคาห้อง ข้อมูลบริษัท และกำหนดชำระ ทุกครั้งที่เปิดหน้านี้</CardSubtitle>
        </div>
      </CardHeader>
      {checks.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <ShieldCheck size={16} /> ไม่พบสิ่งที่ต้องแก้
        </div>
      ) : (
        <ul className="space-y-2">
          {checks.map((c, i) => {
            const Icon = icon[c.level];
            return (
              <li key={i} className={cn("flex gap-3 rounded-input border px-4 py-3 text-sm", tone[c.level])}>
                <Icon size={16} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.invoiceId ? (
                      <Link href={`/admin/orgs/billing/${c.invoiceId}`} className="hover:underline">
                        {c.title}
                      </Link>
                    ) : (
                      c.title
                    )}
                  </p>
                  <p className="mt-0.5 opacity-80">{c.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function BookingLines({ month }: { month: OrgMonth }) {
  if (month.lines.length === 0) return <p className="text-sm text-ink-3 py-2">ไม่มีการจองในเดือนนี้</p>;
  return (
    <div className="overflow-x-auto rounded-input border border-line bg-white">
      <table className="w-full text-xs">
        <thead className="text-ink-3">
          <tr>
            <th className="text-left font-medium px-3 py-2">วันเวลา</th>
            <th className="text-left font-medium px-3 py-2">ห้อง</th>
            <th className="text-left font-medium px-3 py-2">ผู้จอง</th>
            <th className="text-left font-medium px-3 py-2">สถานะ</th>
            <th className="text-right font-medium px-3 py-2">ชม.</th>
            <th className="text-right font-medium px-3 py-2">ฟรี</th>
            <th className="text-right font-medium px-3 py-2">คิดเงิน</th>
            <th className="text-right font-medium px-3 py-2">ราคา/ชม.</th>
            <th className="text-right font-medium px-3 py-2">ยอด</th>
          </tr>
        </thead>
        <tbody>
          {month.lines.map((l) => (
            <tr key={l.id} className={cn("border-t border-line", l.chargedHours > 0 && "bg-amber-50/50")}>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                {dayLabel(l.startsAt)} {timeLabel(l.startsAt)}–{timeLabel(l.endsAt)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{l.roomName}</td>
              <td className="px-3 py-2">
                {l.memberName}
                <span className="ml-1.5 font-mono text-ink-3">{l.reference}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{STATUS_TH[l.status] ?? l.status}</td>
              <td className="px-3 py-2 text-right tabular-nums">{l.hours}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-3">{l.freeHours || "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{l.chargedHours || "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-3">{baht(l.rate)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{l.amount ? baht(l.amount) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceList({ invoices }: { invoices: OrgInvoice[] }) {
  const [showVoid, setShowVoid] = useState(false);
  const rows = invoices.filter((i) => showVoid || i.status !== "void");
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-4 flex items-end justify-between gap-4">
        <div>
          <CardTitle>ใบแจ้งหนี้ทั้งหมด</CardTitle>
          <CardSubtitle>ทุกเดือน ล่าสุดอยู่บน กดเพื่อพิมพ์ ส่งอีเมล หรือบันทึกรับเงิน</CardSubtitle>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} />
          แสดงใบที่ยกเลิก
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="px-6 pb-6">
          <EmptyState icon={FileText} title="ยังไม่มีใบแจ้งหนี้" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-ink-3 text-xs">
              <tr>
                <th className="text-left font-medium px-6 py-2.5">เลขที่</th>
                <th className="text-left font-medium px-3 py-2.5">บริษัท</th>
                <th className="text-left font-medium px-3 py-2.5">เดือน</th>
                <th className="text-right font-medium px-3 py-2.5">ยอดชำระ</th>
                <th className="text-right font-medium px-3 py-2.5">รับแล้ว</th>
                <th className="text-left font-medium px-3 py-2.5">ครบกำหนด</th>
                <th className="text-left font-medium px-6 py-2.5">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={cn("border-t border-line hover:bg-surface-subtle/60", i.status === "void" && "text-ink-3")}>
                  <td className="px-6 py-3">
                    <Link href={`/admin/orgs/billing/${i.id}`} className="font-mono text-xs hover:underline">
                      {i.invoiceNo}
                    </Link>
                  </td>
                  <td className="px-3 py-3">{i.orgName}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{periodLabel(i.period)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{baht(i.netPayable)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{i.paidAmount ? baht(i.paidAmount) : "-"}</td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums">{i.dueDate ?? "-"}</td>
                  <td className="px-6 py-3">
                    <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function IssueModal({
  month,
  period,
  replacesId,
  onClose,
}: {
  month: OrgMonth;
  period: string;
  replacesId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bill, setBill] = useState(month.billTo);
  const [dueDays, setDueDays] = useState(15);
  const [withholding, setWithholding] = useState(true);
  const [notes, setNotes] = useState("");
  const charged = month.lines.filter((l) => l.chargedHours > 0);

  function submit() {
    setError(null);
    start(async () => {
      const res = await issueOrgInvoice({
        orgId: month.orgId,
        period,
        billTo: bill,
        dueDays,
        withholding,
        notes: notes || undefined,
        expectedAmount: month.amount,
        replacesId,
      });
      if (!res.ok) return setError(res.error);
      router.push(`/admin/orgs/billing/${res.id}`);
    });
  }

  const field = (k: keyof typeof bill, label: string, placeholder = "") => (
    <div>
      <Label htmlFor={`bill-${k}`}>{label}</Label>
      <Input id={`bill-${k}`} value={bill[k]} placeholder={placeholder} onChange={(e) => setBill({ ...bill, [k]: e.target.value })} />
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      headerTone="default"
      title={replacesId ? "ออกใบแจ้งหนี้ใหม่แทนใบที่ยกเลิก" : "ออกใบแจ้งหนี้"}
      subtitle={`${month.orgName} · ${periodLabel(period)}`}
      footer={
        <div className="flex items-center gap-3 w-full">
          <p className="flex-1 text-xs text-red-600">{error}</p>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={pending || !bill.name.trim()} iconLeft={pending ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}>
            ออกใบแจ้งหนี้ {baht(month.amount)} บาท
          </Button>
        </div>
      }
    >
      <ModalBody>
        <div className="rounded-input border border-line bg-surface-subtle px-4 py-3 text-sm">
          <p>
            โควตา {month.unlimited ? "ไม่จำกัด" : hrs(month.quotaHours)} · ใช้จริง {hrs(month.usedHours)} ·{" "}
            <b className="text-red-600">เกิน {hrs(month.overHours)}</b>
          </p>
          <p className="mt-1 text-ink-2">
            คิดเงิน {charged.length} รายการ รวม <b className="text-ink-1">{baht(month.amount)} บาท</b> (ราคาห้องตามที่ตั้งไว้ VAT ตามการตั้งค่าภาษี)
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {field("name", "ออกในนาม")}
          {field("taxId", "เลขผู้เสียภาษี", "13 หลัก")}
          {field("branch", "สาขา", "สำนักงานใหญ่")}
          {field("email", "อีเมลสำหรับส่งใบแจ้งหนี้")}
        </div>
        <div>
          <Label htmlFor="bill-address">ที่อยู่</Label>
          <Textarea id="bill-address" rows={2} value={bill.address} onChange={(e) => setBill({ ...bill, address: e.target.value })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="due-days">ครบกำหนดชำระ (วันหลังสิ้นเดือน)</Label>
            <Input id="due-days" type="number" min={0} max={120} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value) || 0)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2 sm:pt-7">
            <input type="checkbox" checked={withholding} onChange={(e) => setWithholding(e.target.checked)} />
            บริษัทหักภาษี ณ ที่จ่าย
          </label>
        </div>
        <div>
          <Label htmlFor="bill-notes">หมายเหตุบนใบแจ้งหนี้</Label>
          <Textarea id="bill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="เช่น ช่องทางโอนเงิน" />
        </div>
        <p className="text-xs text-ink-3">
          ข้อมูลบริษัทจะถูกจำไว้ใช้เดือนถัดไป ใบที่ออกแล้วแก้ไม่ได้ ถ้าผิดให้ยกเลิกแล้วออกใหม่ ทุกขั้นถูกบันทึกในประวัติของใบ
        </p>
      </ModalBody>
    </Modal>
  );
}
