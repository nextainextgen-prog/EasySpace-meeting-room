import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  Download,
  ArrowRight,
  Receipt,
  Sparkles,
  PiggyBank,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { HeroCard } from "@/components/ui/hero-card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { todayTotals, outstanding, revenueTrend } from "@/lib/mocks";
import { formatBaht, formatCompactBaht, formatDate } from "@/lib/format";

export default function FinancePage() {
  const max = Math.max(...revenueTrend.map((m) => m.income));

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
          description="AI Daily Brief · sync กับ booking real-time"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <HeroCard
              eyebrow="รายรับวันนี้"
              value={formatBaht(todayTotals.income)}
              trailing={
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp size={14} />
                  +18% เทียบเมื่อวาน · 8 รายการ
                </span>
              }
              cta={{ label: "ดูรายการ Income", href: "#" }}
            />
          </div>
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard
              label="รายรับเดือนนี้"
              value={formatCompactBaht(58400)}
              hint="29% ของเป้า ฿200K"
              icon={Wallet}
              iconTone="success"
            />
            <KpiCard
              label="กำไรสุทธิ"
              value={formatCompactBaht(48200)}
              delta={{ value: 14 }}
              icon={PiggyBank}
            />
            <KpiCard
              label="ค้างชำระ"
              value={formatBaht(8500)}
              hint="3 ราย — 1 เกินกำหนด"
              icon={AlertCircle}
              iconTone="danger"
            />
            <KpiCard
              label="รายจ่ายเดือนนี้"
              value={formatCompactBaht(8200)}
              delta={{ value: 22 }}
              icon={TrendingDown}
              iconTone="warning"
            />
            <KpiCard
              label="Forecast เดือนนี้"
              value={formatCompactBaht(185000)}
              hint="confidence 78%"
              icon={Sparkles}
            />
            <KpiCard
              label="ใบเสร็จที่ออกแล้ว"
              value="148 ใบ"
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
            {revenueTrend.map((m) => (
              <div key={m.month} className="flex flex-col items-center gap-1">
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
                <CardSubtitle>{outstanding.length} รายการ · {formatBaht(8500)}</CardSubtitle>
              </div>
              <IconTile icon={AlertCircle} tone="warning" size="sm" />
            </CardHeader>
            <ul className="space-y-3">
              {outstanding.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-3 p-3 rounded-card-sm border border-line-soft"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm tracking-tight truncate">
                      {o.customer}
                    </p>
                    <p className="text-xs text-ink-3">
                      {o.bookingCode} · กำหนด {formatDate(o.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">
                      {formatBaht(o.amount)}
                    </p>
                    <Badge
                      tone={o.daysOverdue > 0 ? "danger" : "warning"}
                      className="mt-1"
                    >
                      {o.daysOverdue > 0
                        ? `เกิน ${o.daysOverdue} วัน`
                        : "ภายในกำหนด"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Today by Payment Method</CardTitle>
                <CardSubtitle>{formatBaht(todayTotals.income)} · 8 รายการ</CardSubtitle>
              </div>
            </CardHeader>
            <ul className="space-y-3">
              {todayTotals.byMethod.map((m) => {
                const pct = (m.amount / todayTotals.income) * 100;
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
          </Card>
        </div>
      </div>
    </>
  );
}
