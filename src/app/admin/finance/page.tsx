import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  Download,
  Receipt,
  Sparkles,
  PiggyBank,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { HeroCard } from "@/components/ui/hero-card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import {
  todayFinanceTotals,
  monthFinanceTotals,
  listOutstanding,
  cashflowMonthly,
} from "@/lib/data";
import { formatBaht, formatCompactBaht, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [today, month, outstanding, trend] = await Promise.all([
    todayFinanceTotals(),
    monthFinanceTotals(),
    listOutstanding(8),
    cashflowMonthly(12),
  ]);

  const max = Math.max(1, ...trend.map((m) => m.income));
  const outstandingTotal = outstanding.reduce(
    (s, o) => s + o.outstanding_amount,
    0,
  );
  const monthTargetTHB = 200_000;
  const targetPct = Math.round((month.income / monthTargetTHB) * 100);

  return (
    <>
      <AdminTopbar
        title="การเงิน"
        subtitle="รายรับ · รายจ่าย · ค้างชำระ · ภาษี · กระทบยอด"
        actions={
          <Button variant="secondary" iconLeft={<Download size={16} />}>
            Export
          </Button>
        }
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ภาพรวมการเงิน"
          description="ข้อมูลจาก Supabase real-time · sync กับ booking"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <HeroCard
              eyebrow="รายรับวันนี้"
              value={formatBaht(today.income)}
              trailing={
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp size={14} />
                  ค่าใช้จ่ายวันนี้ {formatBaht(today.expense)} · กำไรสุทธิ{" "}
                  {formatBaht(today.net)}
                </span>
              }
              cta={{ label: "ดูรายการ Income", href: "#" }}
            />
          </div>
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard
              label="รายรับเดือนนี้"
              value={formatCompactBaht(month.income)}
              hint={`${targetPct}% ของเป้า ${formatCompactBaht(monthTargetTHB)}`}
              icon={Wallet}
              iconTone="success"
            />
            <KpiCard
              label="กำไรสุทธิเดือนนี้"
              value={formatCompactBaht(month.net)}
              icon={PiggyBank}
            />
            <KpiCard
              label="ค้างชำระ"
              value={formatBaht(outstandingTotal)}
              hint={`${outstanding.length} ราย`}
              icon={AlertCircle}
              iconTone="danger"
            />
            <KpiCard
              label="รายจ่ายเดือนนี้"
              value={formatCompactBaht(month.expense)}
              icon={TrendingDown}
              iconTone="warning"
            />
            <KpiCard
              label="กำไร %"
              value={`${today.margin}%`}
              hint="วันนี้"
              icon={Sparkles}
            />
            <KpiCard
              label="ใบเสร็จเดือนนี้"
              value={`${month.receiptCount} ใบ`}
              icon={Receipt}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cash Flow — 12 เดือนล่าสุด</CardTitle>
              <CardSubtitle>รายรับ vs รายจ่าย</CardSubtitle>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-primary-600" />
                Income
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-line" />
                Expense
              </span>
            </div>
          </CardHeader>
          <div className="grid grid-cols-12 gap-3 h-48 items-end">
            {trend.map((m) => (
              <div key={m.key} className="flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-0.5 h-40">
                  <div
                    className="flex-1 rounded-t bg-gradient-to-t from-primary-700 to-primary-400"
                    style={{ height: `${(m.income / max) * 100}%` }}
                    title={`Income ${formatBaht(m.income)}`}
                  />
                  <div
                    className="flex-1 rounded-t bg-line"
                    style={{ height: `${(m.expense / max) * 100}%` }}
                    title={`Expense ${formatBaht(m.expense)}`}
                  />
                </div>
                <span className="text-[10px] text-ink-3">{m.month}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Outstanding (ค้างชำระ)</CardTitle>
                <CardSubtitle>
                  {outstanding.length} รายการ · {formatBaht(outstandingTotal)}
                </CardSubtitle>
              </div>
              <IconTile icon={AlertCircle} tone="warning" size="sm" />
            </CardHeader>
            {outstanding.length === 0 ? (
              <p className="text-sm text-ink-3 text-center py-8 tracking-tight">
                ไม่มีรายการค้างชำระ
              </p>
            ) : (
              <ul className="space-y-3">
                {outstanding.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center gap-3 p-3 rounded-card-sm border border-line-soft"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm tracking-tight truncate">
                        {o.customer_name}
                      </p>
                      <p className="text-xs text-ink-3">
                        {o.reference_code} · กำหนด {formatDate(o.due_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums">
                        {formatBaht(o.outstanding_amount)}
                      </p>
                      <Badge
                        tone={o.days_overdue > 0 ? "danger" : "warning"}
                        className="mt-1"
                      >
                        {o.days_overdue > 0
                          ? `เกิน ${o.days_overdue} วัน`
                          : "ภายในกำหนด"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Today by Payment Method</CardTitle>
                <CardSubtitle>
                  {formatBaht(today.income)} · {today.byMethod.length} ช่องทาง
                </CardSubtitle>
              </div>
            </CardHeader>
            {today.byMethod.length === 0 ? (
              <p className="text-sm text-ink-3 text-center py-8 tracking-tight">
                วันนี้ยังไม่มียอดเข้า
              </p>
            ) : (
              <ul className="space-y-3">
                {today.byMethod.map((m) => {
                  const pct = (m.amount / today.income) * 100;
                  return (
                    <li key={m.method}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-ink-2">{m.method}</span>
                        <span className="font-semibold tabular-nums">
                          {formatBaht(m.amount)}
                        </span>
                      </div>
                      <div className="h-2 rounded-pill bg-surface-subtle overflow-hidden">
                        <div
                          className="h-full bg-primary-gradient"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
