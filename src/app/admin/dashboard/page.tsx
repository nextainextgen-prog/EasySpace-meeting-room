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
  Clock,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { HeroCard } from "@/components/ui/hero-card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import {
  bookingStatsForDay,
  listBookingsForRange,
  listCustomers,
  listRooms,
} from "@/lib/data";
import { formatBaht, formatTime } from "@/lib/format";
import { paymentStatusIcon } from "@/lib/icons";
import type { PaymentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const [stats, todayBookings, rooms, customers] = await Promise.all([
    bookingStatsForDay(now),
    listBookingsForRange({
      start: dayStart.toISOString(),
      end: dayEnd.toISOString(),
    }),
    listRooms(),
    listCustomers({ limit: 200 }),
  ]);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "อรุณสวัสดิ์" : hour < 17 ? "สวัสดียามบ่าย" : "สวัสดียามเย็น";

  const newCustomersThisWeek = customers.filter((c) => {
    const created = new Date(c.created_at);
    return now.getTime() - created.getTime() < 7 * 24 * 3600 * 1000;
  }).length;

  const churnRiskCount = customers.filter(
    (c) => c.churn_risk === "high",
  ).length;

  const usedSlots = todayBookings.reduce((sum, b) => {
    const hrs =
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
      3_600_000;
    return sum + hrs;
  }, 0);
  const utilisation =
    rooms.length > 0
      ? Math.min(100, Math.round((usedSlots / (rooms.length * 8)) * 100))
      : 0;

  return (
    <>
      <AdminTopbar
        title="Dashboard"
        subtitle="ภาพรวมของ EasySpace · ดึงจาก Supabase real-time"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
        <PageHeader
          title={`${greeting} Admin`}
          description={`${now.toLocaleDateString("th-TH", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })} · ${formatTime(now)} น.`}
          actions={
            <>
              <Link href="/admin/bookings">
                <Button variant="secondary" iconLeft={<CalendarPlus size={16} />}>
                  จองใหม่
                </Button>
              </Link>
              <Button variant="gradient" iconLeft={<Sparkles size={16} />}>
                AI Brief
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            label="จองวันนี้"
            value={`${stats.bookings} รายการ`}
            icon={Calendar}
          />
          <KpiCard
            label="รายได้วันนี้"
            value={formatBaht(stats.revenuePaid)}
            hint={`${formatBaht(stats.revenueTotal)} ยอดรวม`}
            icon={Wallet}
            iconTone="success"
          />
          <KpiCard
            label="Utilization"
            value={`${utilisation}%`}
            icon={Activity}
          />
          <KpiCard
            label="ค้างชำระ"
            value={formatBaht(stats.outstandingAmount)}
            hint={`${stats.outstandingCount} รายการ`}
            icon={AlertCircle}
            iconTone="warning"
          />
          <KpiCard
            label="ลูกค้าใหม่ 7 วัน"
            value={`${newCustomersThisWeek} ราย`}
            icon={UserPlus}
          />
          <KpiCard
            label="Churn HIGH"
            value={`${churnRiskCount} ราย`}
            icon={Brain}
            iconTone={churnRiskCount > 0 ? "danger" : "muted"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <HeroCard
              eyebrow="รายได้คาดวันนี้"
              value={formatBaht(stats.revenueTotal)}
              trailing={
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp size={14} />
                  {stats.bookings} รายการ
                </span>
              }
              cta={{ label: "ดูรายละเอียดการเงิน", href: "/admin/finance" }}
            />

            <Card className="mt-5">
              <CardHeader>
                <div>
                  <CardTitle>Cash Flow วันนี้</CardTitle>
                  <CardSubtitle>รายรับที่บันทึกแล้ว</CardSubtitle>
                </div>
                <IconTile icon={Wallet} tone="primary" size="sm" />
              </CardHeader>
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-ink-3">รายรับเข้าจริง</dt>
                  <dd className="font-semibold text-emerald-600 tabular-nums">
                    +{formatBaht(stats.revenuePaid)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-3">รอเก็บ</dt>
                  <dd className="font-semibold text-amber-600 tabular-nums">
                    {formatBaht(stats.outstandingAmount)}
                  </dd>
                </div>
                <div className="h-px bg-line-soft my-2" />
                <div className="flex items-center justify-between">
                  <dt className="font-medium">รวมยอดวันนี้</dt>
                  <dd className="font-bold text-ink-1 tabular-nums">
                    {formatBaht(stats.revenueTotal)}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-5">
            <Card className="!p-0 overflow-hidden">
              <div className="p-6 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <IconTile icon={Sparkles} tone="primary" />
                    <div>
                      <h3 className="font-bold tracking-tight">AI Daily Brief</h3>
                      <p className="text-xs text-ink-3">
                        Gemini จะ generate จริงตอน 19:00 ผ่าน Vercel cron
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Generate ตอนนี้
                  </Button>
                </div>
              </div>
              <div className="p-6 grid md:grid-cols-3 gap-6">
                <BriefBlock
                  label="Highlights"
                  items={[
                    `รายได้วันนี้ ${formatBaht(stats.revenuePaid)}`,
                    `${stats.bookings} รายการในวันนี้`,
                    `${newCustomersThisWeek} ลูกค้าใหม่สัปดาห์นี้`,
                  ]}
                  tone="emerald"
                />
                <BriefBlock
                  label="Alerts"
                  items={
                    stats.outstandingCount > 0
                      ? [
                          `${stats.outstandingCount} รายการค้างชำระ`,
                          `รวมยอด ${formatBaht(stats.outstandingAmount)}`,
                        ]
                      : ["ไม่มีรายการค้างชำระวันนี้"]
                  }
                  tone="amber"
                />
                <BriefBlock
                  label="Recommendations"
                  items={[
                    "ใช้งาน " + utilisation + "% — พิจารณาเปิด slot เพิ่ม",
                    customers.length === 0
                      ? "ยังไม่มีลูกค้า — เริ่มจองครั้งแรก"
                      : "ส่ง LINE ขอบคุณลูกค้า Champion",
                  ]}
                  tone="indigo"
                />
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
                <Link href="/admin/calendar">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconRight={<ArrowRight size={14} />}
                  >
                    View calendar
                  </Button>
                </Link>
              </CardHeader>
              {todayBookings.length === 0 ? (
                <div className="text-center py-10 text-sm text-ink-3">
                  ยังไม่มีการจองในวันนี้ —{" "}
                  <Link
                    href="/admin/bookings"
                    className="text-primary-600 font-medium"
                  >
                    สร้างการจองใหม่
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {todayBookings.map((b) => {
                    const PayIcon = paymentStatusIcon(
                      b.payment_status as PaymentStatus,
                    );
                    return (
                      <div
                        key={b.id}
                        className="flex items-center gap-4 p-3 rounded-card-sm surface-subtle"
                      >
                        <div
                          className="w-1 h-12 rounded-full"
                          style={{
                            background: b.room?.color ?? "#cbd5e1",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-semibold tracking-tight text-ink-1 truncate">
                              {b.customer?.display_name ??
                                b.internal_title ??
                                "—"}
                            </p>
                            {b.customer?.tags?.includes("VIP") && (
                              <Badge tone="primary">VIP</Badge>
                            )}
                          </div>
                          <p className="text-xs text-ink-3 tabular-nums">
                            {formatTime(b.starts_at)} – {formatTime(b.ends_at)} ·{" "}
                            {b.room?.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm tabular-nums">
                            {formatBaht(Number(b.total_amount))}
                          </p>
                          <span
                            className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                              b.payment_status === "paid"
                                ? "text-emerald-600"
                                : b.payment_status === "deposit"
                                  ? "text-amber-600"
                                  : b.payment_status === "unpaid"
                                    ? "text-red-600"
                                    : "text-ink-3"
                            }`}
                          >
                            <PayIcon size={12} strokeWidth={2} />
                            {b.payment_status === "paid"
                              ? "จ่ายแล้ว"
                              : b.payment_status === "deposit"
                                ? "มัดจำแล้ว"
                                : b.payment_status === "unpaid"
                                  ? "ค้างชำระ"
                                  : "ฟรี"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>

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
              { icon: CalendarPlus, label: "จองใหม่", href: "/admin/bookings" },
              { icon: UserPlus, label: "ลูกค้าใหม่", href: "/admin/customers" },
              { icon: Wallet, label: "ดูการเงิน", href: "/admin/finance" },
              { icon: Calendar, label: "ปฏิทิน", href: "/admin/calendar" },
              { icon: Clock, label: "ตั้งค่าเวลา", href: "/admin/settings" },
              { icon: Plus, label: "ตั้งค่าระบบ", href: "/admin/settings" },
            ].map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className="flex flex-col items-center gap-2 p-4 rounded-card-sm border border-line bg-white hover:border-primary-200 hover:shadow-card-hover transition"
              >
                <IconTile icon={q.icon} tone="primary" size="sm" />
                <span className="text-xs font-medium text-ink-1 tracking-tight">
                  {q.label}
                </span>
              </Link>
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
          <li
            key={i}
            className="flex gap-2.5 text-sm text-ink-2 tracking-tight"
          >
            <span
              className={`mt-1.5 w-1.5 h-1.5 rounded-pill shrink-0 ${dotClass}`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
