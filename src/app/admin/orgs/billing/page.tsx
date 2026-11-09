import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, Building2, Wallet, AlertTriangle } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { requireRole } from "@/lib/auth";
import { currentPeriod, periodLabel, shiftPeriod } from "@/lib/billing/overage";
import { listInvoices, listOrgMonths, runBillingChecks } from "@/lib/server/org-billing";
import { BillingBoard } from "./billing-board";

export const dynamic = "force-dynamic";

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default async function OrgBillingPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireRole("accountant");
  const sp = await searchParams;
  const now = currentPeriod();
  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) && sp.period <= now ? sp.period : now;

  const [months, invoices] = await Promise.all([listOrgMonths(period), listInvoices()]);
  const tablesReady = invoices !== null;
  const all = invoices ?? [];
  const checks = await runBillingChecks(period, months, all);

  const over = months.filter((m) => m.amount > 0);
  const totalAmount = over.reduce((s, m) => s + m.amount, 0);
  const totalHours = over.reduce((s, m) => s + m.overHours, 0);
  const outstanding = all
    .filter((i) => i.status !== "void")
    .reduce((s, i) => s + Math.max(0, i.netPayable - i.paidAmount), 0);
  const outstandingCount = all.filter((i) => i.status !== "void" && i.netPayable - i.paidAmount > 0.009).length;

  return (
    <>
      <AdminTopbar title="ค่าใช้เกินโควตา" subtitle="ชั่วโมงที่บริษัทใช้เกินโควตา · ใบแจ้งหนี้ · การรับเงิน" />
      <div className="p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-5">
        <PageHeader
          title="ค่าใช้เกินโควตา"
          description="ชั่วโมงที่เกินโควตาของบริษัท คิดตามราคาห้องต่อชั่วโมง รวมการจองที่ไม่มาใช้ห้อง แล้วเรียกเก็บตอนสิ้นเดือน"
          actions={
            <div className="inline-flex items-center gap-1 rounded-pill bg-white border border-line p-1">
              <Link
                href={`?period=${shiftPeriod(period, -1)}`}
                aria-label="เดือนก่อน"
                className="h-9 w-9 inline-flex items-center justify-center rounded-pill text-ink-2 hover:bg-surface-subtle"
              >
                <ChevronLeft size={16} />
              </Link>
              <span className="px-3 text-sm font-semibold tabular-nums min-w-[140px] text-center">
                {periodLabel(period)}
                {period === now && <span className="ml-1.5 text-xs font-normal text-ink-3">(เดือนนี้)</span>}
              </span>
              {period < now ? (
                <Link
                  href={`?period=${shiftPeriod(period, 1)}`}
                  aria-label="เดือนถัดไป"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-pill text-ink-2 hover:bg-surface-subtle"
                >
                  <ChevronRight size={16} />
                </Link>
              ) : (
                <span className="h-9 w-9 inline-flex items-center justify-center text-ink-3/40">
                  <ChevronRight size={16} />
                </span>
              )}
            </div>
          }
        />

        {!tablesReady && (
          <div className="rounded-card border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            ยังออกใบแจ้งหนี้ไม่ได้ ต้องสร้างตารางใบแจ้งหนี้ในฐานข้อมูลก่อน
            (supabase/migrations/00000000000017_org_overage_billing.sql) ตัวเลขด้านล่างคำนวณจากการจองได้ตามปกติ
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label={period === now ? "ยอดเกินโควตา (ถึงตอนนี้)" : "ยอดเกินโควตา"}
            value={`${baht(totalAmount)} บาท`}
            icon={Wallet}
            iconTone={totalAmount > 0 ? "warning" : "muted"}
            hint={periodLabel(period)}
          />
          <KpiCard label="ชั่วโมงที่เกินรวม" value={`${baht(totalHours)} ชม.`} icon={Clock} iconTone="primary" />
          <KpiCard
            label="บริษัทที่ใช้เกิน"
            value={`${over.length} / ${months.length}`}
            icon={Building2}
            iconTone={over.length ? "warning" : "success"}
          />
          <KpiCard
            label="ค้างชำระทุกเดือน"
            value={`${baht(outstanding)} บาท`}
            icon={AlertTriangle}
            iconTone={outstanding > 0 ? "danger" : "success"}
            hint={`${outstandingCount} ใบ`}
          />
        </div>

        <BillingBoard
          period={period}
          ended={period < now}
          tablesReady={tablesReady}
          months={months}
          invoices={all}
          checks={checks}
        />
      </div>
    </>
  );
}
