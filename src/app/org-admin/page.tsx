import { Calendar, Clock, Users, TrendingUp } from "lucide-react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { getCurrentMember, listMembersByOrg } from "@/lib/data/members";
import { getOrgById, getOrgUsage } from "@/lib/data/organizations";
import { currentPeriod, periodLabel } from "@/lib/billing/overage";
import { getOrgMonth, listInvoices } from "@/lib/server/org-billing";

export const metadata = { title: "Org Admin — EasySpace" };

export default async function OrgAdminHome() {
  const ctx = (await getCurrentMember())!;
  const period = currentPeriod();
  const [org, usage, members, month, invoices] = await Promise.all([
    getOrgById(ctx.primaryOrgId),
    getOrgUsage(ctx.primaryOrgId),
    listMembersByOrg(ctx.primaryOrgId),
    getOrgMonth(ctx.primaryOrgId, period),
    listInvoices({ orgId: ctx.primaryOrgId }),
  ]);
  const charged = month?.lines.filter((l) => l.chargedHours > 0) ?? [];
  const unpaid = (invoices ?? []).filter((i) => i.status !== "void" && i.netPayable - i.paidAmount > 0.009);
  const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tighter text-ink-1">
          ภาพรวมองค์กร
        </h2>
        <p className="text-sm text-ink-3 mt-1">
          {org?.name} · ชั้น {org?.floor ?? "—"}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="สมาชิก"
          value={`${members.length} คน`}
          hint={`${usage.activeMembers} active`}
          icon={Users}
        />
        <KpiCard
          label="ชั่วโมงเดือนนี้"
          value={`${usage.hoursThisMonth} ชม.`}
          hint={`โควต้า ${usage.quotaHoursMonthly} ชม.`}
          icon={Clock}
        />
        <KpiCard
          label="ใช้โควต้า"
          value={`${usage.quotaPct}%`}
          icon={TrendingUp}
        />
        <KpiCard
          label="จองเดือนนี้"
          value={`${usage.bookingsThisMonth} ครั้ง`}
          icon={Calendar}
        />
      </div>

      <Card>
        <CardTitle>การใช้งานเทียบโควต้า</CardTitle>
        <CardSubtitle>
          {usage.hoursThisMonth} / {usage.quotaHoursMonthly} ชั่วโมง ใช้ไปแล้ว
          {usage.quotaPct}%
        </CardSubtitle>
        <div className="mt-4 h-3 rounded-full bg-line overflow-hidden">
          <div
            className={
              usage.quotaPct >= 90
                ? "h-full bg-red-500"
                : usage.quotaPct >= 70
                  ? "h-full bg-amber-500"
                  : "h-full bg-primary-600"
            }
            style={{ width: `${usage.quotaPct}%` }}
          />
        </div>
        {usage.quotaPct >= 90 && (
          <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-input px-3 py-2">
            ใช้โควต้าใกล้เต็ม ชั่วโมงที่เกินคิดตามราคาห้อง และเรียกเก็บกับบริษัทตอนสิ้นเดือน
          </p>
        )}
      </Card>

      {month && !month.unlimited && (
        <Card>
          <CardTitle>ค่าใช้เกินโควตา {periodLabel(period)}</CardTitle>
          <CardSubtitle>
            ชั่วโมงที่เกินโควตาคิดตามราคาห้องต่อชั่วโมง รวมการจองที่ไม่มาใช้ห้อง เรียกเก็บตอนสิ้นเดือน
          </CardSubtitle>
          {charged.length === 0 ? (
            <p className="mt-3 text-sm text-ink-2">ยังไม่เกินโควตา</p>
          ) : (
            <>
              <p className="mt-3 text-sm">
                เกิน <b className="text-red-600">{month.overHours} ชม.</b> · ยอดถึงตอนนี้{" "}
                <b>{baht(month.amount)} บาท</b>
              </p>
              <ul className="mt-3 divide-y divide-line text-sm">
                {charged.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      {new Date(l.startsAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" })} · {l.roomName}
                      <span className="block text-xs text-ink-3">
                        {l.memberName} · {l.chargedHours} ชม. × {baht(l.rate)}
                      </span>
                    </span>
                    <span className="tabular-nums font-medium">{baht(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {unpaid.length > 0 && (
            <p className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-input px-3 py-2">
              มีใบแจ้งหนี้ค้างชำระ{" "}
              {unpaid.map((i) => `${i.invoiceNo} (${periodLabel(i.period)}) ${baht(i.netPayable - i.paidAmount)} บาท`).join(" · ")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
