import {
  Calendar,
  Wallet,
  AlertCircle,
  Activity,
  UserPlus,
  Brain,
  Sparkles,
  ArrowRight,
  Plus,
  CalendarPlus,
  Receipt,
  Coffee,
  Tag,
  Clock,
  TrendingUp,
  CircleDot,
  Loader2,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { HeroCard } from "@/components/ui/hero-card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import {
  dashboardKpis,
  dailyBrief,
  bookings,
  recentActivity,
  pendingTasks,
  rooms,
  todayTotals,
} from "@/lib/mocks";
import { formatBaht, formatTime } from "@/lib/format";
import { paymentStatusIcon } from "@/lib/icons";
import type { PaymentStatus } from "@/lib/types";

export default function DashboardPage() {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "อรุณสวัสดิ์" : hour < 17 ? "สวัสดียามบ่าย" : "สวัสดียามเย็น";

  const todayBookings = bookings.filter((b) => {
    const d = new Date(b.startsAt);
    const t = now;
    return (
      d.getDate() === t.getDate() &&
      d.getMonth() === t.getMonth() &&
      d.getFullYear() === t.getFullYear()
    );
  });

  return (
    <>
      <AdminTopbar
        title="Dashboard"
        subtitle="ภาพรวมของ EasySpace · อัปเดต real-time"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
        <PageHeader
          title={`${greeting} Admin A`}
          description={`พฤหัสบดี · 18 พฤษภาคม 2026 · ${formatTime(now)} น.`}
          actions={
            <>
              <Button variant="secondary" iconLeft={<CalendarPlus size={16} />}>
                จองใหม่
              </Button>
              <Button variant="gradient" iconLeft={<Sparkles size={16} />}>
                AI Brief
              </Button>
            </>
          }
        />

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="จองวันนี้"
            value={`${dashboardKpis.bookingsToday.value} รายการ`}
            delta={{ value: dashboardKpis.bookingsToday.delta }}
            icon={Calendar}
          />
          <KpiCard
            label="รายได้วันนี้"
            value={formatBaht(dashboardKpis.revenueToday.value)}
            delta={{ value: dashboardKpis.revenueToday.delta }}
            icon={Wallet}
            iconTone="success"
          />
          <KpiCard
            label="Utilization"
            value={`${dashboardKpis.utilization.value}%`}
            delta={{ value: dashboardKpis.utilization.delta }}
            icon={Activity}
          />
          <KpiCard
            label="ค้างชำระ"
            value={formatBaht(dashboardKpis.outstanding.value)}
            hint={`${dashboardKpis.outstanding.count} รายการ`}
            icon={AlertCircle}
            iconTone="warning"
          />
          <KpiCard
            label="ลูกค้าใหม่"
            value={`${dashboardKpis.newCustomers.value} ราย`}
            hint="7 วันล่าสุด"
            icon={UserPlus}
          />
          <KpiCard
            label="Churn Risk (HIGH)"
            value={`${dashboardKpis.churnRisk.value} ราย`}
            icon={Brain}
            iconTone="danger"
          />
        </div>

        {/* Hero + Today Schedule */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <HeroCard
              eyebrow="รายได้คาดวันนี้"
              value={formatBaht(9200)}
              trailing={
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp size={14} />
                  เกินเป้า 15% · เป้า ฿8,000
                </span>
              }
              cta={{ label: "ดูรายละเอียดการเงิน", href: "/admin/finance" }}
            />

            <Card className="mt-5">
              <CardHeader>
                <div>
                  <CardTitle>Cash Flow วันนี้</CardTitle>
                  <CardSubtitle>รายรับ vs รายจ่าย</CardSubtitle>
                </div>
                <IconTile icon={Wallet} tone="primary" size="sm" />
              </CardHeader>
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-ink-3">รายรับ</dt>
                  <dd className="font-semibold text-emerald-600 tabular-nums">
                    {formatBaht(todayTotals.income, { sign: true })}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-3">รายจ่าย</dt>
                  <dd className="font-semibold text-red-600 tabular-nums">
                    -{formatBaht(todayTotals.expense)}
                  </dd>
                </div>
                <div className="h-px bg-line-soft my-2" />
                <div className="flex items-center justify-between">
                  <dt className="font-medium">กำไรสุทธิ</dt>
                  <dd className="font-bold text-ink-1 tabular-nums">
                    {formatBaht(todayTotals.net)} · {todayTotals.margin}%
                  </dd>
                </div>
                <div className="pt-3 mt-3 border-t border-line-soft space-y-1.5 text-xs text-ink-2">
                  {todayTotals.byMethod.map((m) => (
                    <div
                      key={m.method}
                      className="flex items-center justify-between"
                    >
                      <span>{m.method}</span>
                      <span className="tabular-nums font-medium">
                        {formatBaht(m.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </dl>
            </Card>
          </div>

          {/* AI Daily Brief + Today's Schedule */}
          <div className="lg:col-span-2 space-y-5">
            <Card className="!p-0 overflow-hidden">
              <div className="p-6 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <IconTile icon={Sparkles} tone="primary" />
                    <div>
                      <h3 className="font-bold tracking-tight">
                        AI Daily Brief
                      </h3>
                      <p className="text-xs text-ink-3">
                        Generated 09:00 · Auto-refresh 13:00, 17:00
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="p-6 grid md:grid-cols-3 gap-6">
                <BriefBlock
                  label="Highlights"
                  items={dailyBrief.highlights}
                  tone="emerald"
                />
                <BriefBlock
                  label="Alerts"
                  items={dailyBrief.alerts}
                  tone="amber"
                />
                <BriefBlock
                  label="Recommendations"
                  items={dailyBrief.recommendations}
                  tone="indigo"
                />
              </div>
              <div className="px-6 py-4 bg-surface-subtle border-t border-line-soft text-xs text-ink-2 flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <CircleDot size={14} className="text-emerald-500" />
                  Forecast เดือนนี้: {formatBaht(dailyBrief.forecast.monthly.value)}
                  ({dailyBrief.forecast.monthly.deltaPct}% เกินเป้า)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CircleDot size={14} className="text-primary-500" />
                  พรุ่งนี้คาด: {formatBaht(dailyBrief.forecast.tomorrow.value)}
                </span>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Today&apos;s Schedule</CardTitle>
                  <CardSubtitle>
                    {todayBookings.length} รายการในวันนี้
                  </CardSubtitle>
                </div>
                <Button variant="ghost" size="sm" iconRight={<ArrowRight size={14} />}>
                  View calendar
                </Button>
              </CardHeader>
              <div className="space-y-3">
                {todayBookings.map((b) => {
                  const room = rooms.find((r) => r.id === b.roomId);
                  const PayIcon = paymentStatusIcon(b.paymentStatus as PaymentStatus);
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-4 p-3 rounded-card-sm surface-subtle"
                    >
                      <div
                        className="w-1 h-12 rounded-full"
                        style={{ background: room?.color ?? "#cbd5e1" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold tracking-tight text-ink-1 truncate">
                            {b.customerName}
                          </p>
                          {b.flags?.includes("vip") && (
                            <Badge tone="primary">VIP</Badge>
                          )}
                          {b.flags?.includes("overdue") && (
                            <Badge tone="danger">ค้างชำระ</Badge>
                          )}
                          {b.flags?.includes("new") && (
                            <Badge tone="info">ใหม่</Badge>
                          )}
                        </div>
                        <p className="text-xs text-ink-3 tabular-nums">
                          {formatTime(b.startsAt)} – {formatTime(b.endsAt)} ·{" "}
                          {room?.name} · {b.attendees} คน
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm tabular-nums">
                          {formatBaht(b.total)}
                        </p>
                        <span
                          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                            b.paymentStatus === "paid"
                              ? "text-emerald-600"
                              : b.paymentStatus === "deposit"
                                ? "text-amber-600"
                                : b.paymentStatus === "unpaid"
                                  ? "text-red-600"
                                  : "text-ink-3"
                          }`}
                        >
                          <PayIcon size={12} strokeWidth={2} />
                          {b.paymentStatus === "paid"
                            ? "จ่ายแล้ว"
                            : b.paymentStatus === "deposit"
                              ? "มัดจำแล้ว"
                              : b.paymentStatus === "unpaid"
                                ? "ค้างชำระ"
                                : "ฟรี"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        {/* Activity + Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardSubtitle>เหตุการณ์ล่าสุดในระบบ</CardSubtitle>
              </div>
              <IconTile icon={Activity} tone="primary" size="sm" />
            </CardHeader>
            <ul className="space-y-3.5">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-pill bg-primary-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-1 tracking-tight">{a.text}</p>
                    <p className="text-[11px] text-ink-3 mt-0.5">{a.timeAgo}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Pending Tasks</CardTitle>
                <CardSubtitle>
                  {pendingTasks.length} อย่างที่ต้องทำ
                </CardSubtitle>
              </div>
              <IconTile icon={Clock} tone="warning" size="sm" />
            </CardHeader>
            <ul className="space-y-2.5">
              {pendingTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 p-2.5 rounded-input hover:bg-surface-subtle transition"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-line accent-primary-600"
                  />
                  <span className="flex-1 text-sm text-ink-1 tracking-tight">
                    {t.title}
                  </span>
                  <Badge
                    tone={t.level === "urgent" ? "danger" : "warning"}
                  >
                    {t.level === "urgent" ? "ด่วน" : "วันนี้"}
                  </Badge>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size="sm"
              className="w-full mt-4"
              iconLeft={<Plus size={14} />}
            >
              เพิ่ม Task
            </Button>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Quick Actions</CardTitle>
              <CardSubtitle>การทำงานที่ใช้บ่อย</CardSubtitle>
            </div>
            <IconTile icon={Sparkles} tone="primary" size="sm" />
          </CardHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: CalendarPlus, label: "จองใหม่" },
              { icon: UserPlus, label: "ลูกค้าใหม่" },
              { icon: Receipt, label: "บันทึกรายจ่าย" },
              { icon: Tag, label: "สร้างโปร" },
              { icon: Coffee, label: "Add-on ใหม่" },
              { icon: Loader2, label: "รายงานเดือน" },
            ].map((q) => (
              <button
                key={q.label}
                className="flex flex-col items-center gap-2 p-4 rounded-card-sm border border-line bg-white hover:border-primary-200 hover:shadow-card-hover transition"
              >
                <IconTile icon={q.icon} tone="primary" size="sm" />
                <span className="text-xs font-medium text-ink-1 tracking-tight">
                  {q.label}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function BriefBlock({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "emerald" | "amber" | "indigo";
}) {
  const dotClass =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-indigo-500";
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
        {label}
      </p>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-ink-2 tracking-tight">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-pill shrink-0 ${dotClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
