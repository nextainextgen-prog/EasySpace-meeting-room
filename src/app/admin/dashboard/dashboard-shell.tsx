"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  Calendar,
  CalendarPlus,
  CheckSquare,
  CircleDollarSign,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Gift,
  Layout,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatBaht, formatCompactBaht, formatTime } from "@/lib/format";
import {
  createAdminTask,
  toggleAdminTask,
  deleteAdminTask,
} from "@/lib/actions/admin-tasks";
import type {
  DashboardDeep,
  AdminTaskRow,
} from "@/lib/data/dashboard-deep";
import type { Role } from "@/lib/types";

type WidgetId =
  | "kpis"
  | "quick_actions"
  | "alerts"
  | "ai_brief"
  | "schedule"
  | "cashflow"
  | "feed"
  | "tasks"
  | "customer_pulse"
  | "room_utilization"
  | "trends"
  | "promotions"
  | "internal_users";

interface WidgetMeta {
  id: WidgetId;
  label: string;
  roles: Role[];
  defaultOn: boolean;
}

const ALL_WIDGETS: WidgetMeta[] = [
  {
    id: "kpis",
    label: "KPI Cards",
    roles: [
      "owner",
      "super_admin",
      "admin",
      "staff",
      "accountant",
      "marketing",
      "viewer",
    ],
    defaultOn: true,
  },
  {
    id: "quick_actions",
    label: "Quick Actions",
    roles: ["owner", "super_admin", "admin", "staff", "accountant", "marketing"],
    defaultOn: true,
  },
  {
    id: "alerts",
    label: "Alerts & Action Items",
    roles: ["owner", "super_admin", "admin", "staff", "accountant", "marketing"],
    defaultOn: true,
  },
  {
    id: "ai_brief",
    label: "AI Daily Brief",
    roles: ["owner", "super_admin", "admin", "marketing"],
    defaultOn: true,
  },
  {
    id: "schedule",
    label: "Today's Schedule",
    roles: ["owner", "super_admin", "admin", "staff", "viewer"],
    defaultOn: true,
  },
  {
    id: "cashflow",
    label: "Cash Flow",
    roles: ["owner", "super_admin", "admin", "accountant"],
    defaultOn: true,
  },
  {
    id: "feed",
    label: "Recent Activity",
    roles: ["owner", "super_admin", "admin", "staff", "accountant", "marketing"],
    defaultOn: true,
  },
  {
    id: "tasks",
    label: "Pending Tasks",
    roles: ["owner", "super_admin", "admin", "staff", "accountant", "marketing"],
    defaultOn: true,
  },
  {
    id: "customer_pulse",
    label: "Customer Pulse",
    roles: ["owner", "super_admin", "admin", "marketing"],
    defaultOn: true,
  },
  {
    id: "room_utilization",
    label: "Room Utilization",
    roles: ["owner", "super_admin", "admin"],
    defaultOn: true,
  },
  {
    id: "trends",
    label: "Performance Trends",
    roles: ["owner", "super_admin", "admin", "accountant"],
    defaultOn: true,
  },
  {
    id: "promotions",
    label: "Promotions",
    roles: ["owner", "super_admin", "admin", "marketing"],
    defaultOn: true,
  },
  {
    id: "internal_users",
    label: "Internal Users",
    roles: ["owner", "super_admin"],
    defaultOn: true,
  },
];

const STORE_KEY = "easyspace.dash-prefs.v1";

interface Props {
  deep: DashboardDeep;
  tasks: AdminTaskRow[];
  todayBookings: Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    payment_status: string;
    customer_name: string | null;
    room_name: string | null;
    room_color: string | null;
    total_amount: number;
  }>;
  role: Role;
  refreshIntervalMs?: number;
}

export function DashboardShell({
  deep,
  tasks,
  todayBookings,
  role,
  refreshIntervalMs = 60_000,
}: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState<Record<WidgetId, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const w of ALL_WIDGETS) {
      if (!w.roles.includes(role)) init[w.id] = false;
      else init[w.id] = w.defaultOn;
    }
    return init as Record<WidgetId, boolean>;
  });
  const [refreshAt, setRefreshAt] = useState(deep.refreshedAt);
  const [customizing, setCustomizing] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  // Load saved prefs
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<WidgetId, boolean>>;
      setVisible((prev) => ({ ...prev, ...parsed }));
    } catch {
      /* ignore */
    }
  }, []);

  function persist(next: Record<WidgetId, boolean>) {
    setVisible(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Periodic refresh — server fetches latest data and rebuilds RSC tree
  useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
      setRefreshAt(new Date().toISOString());
    }, refreshIntervalMs);
    return () => clearInterval(t);
  }, [router, refreshIntervalMs]);

  // Refresh when tab regains focus
  useEffect(() => {
    function onFocus() {
      router.refresh();
      setRefreshAt(new Date().toISOString());
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  const eligibleWidgets = useMemo(
    () => ALL_WIDGETS.filter((w) => w.roles.includes(role)),
    [role],
  );

  function show(id: WidgetId) {
    return eligibleWidgets.some((w) => w.id === id) && visible[id];
  }

  function manualRefresh() {
    router.refresh();
    setRefreshAt(new Date().toISOString());
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<RefreshCw size={14} strokeWidth={1.75} />}
          onClick={manualRefresh}
        >
          รีเฟรช
        </Button>
        <span className="text-[11px] text-ink-3 tabular-nums">
          {formatRelTime(refreshAt)}
        </span>
        <span className="text-[11px] pill-info">
          {roleLabel(role)}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Layout size={14} strokeWidth={1.75} />}
            onClick={() => setCustomizing((v) => !v)}
          >
            {customizing ? "ปิด" : "ปรับแต่ง widget"}
          </Button>
        </div>
      </div>

      {customizing && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <IconTile icon={Layout} tone="primary" size="sm" />
            <p className="font-semibold tracking-tight">
              เลือก widget ที่ต้องการแสดง
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {eligibleWidgets.map((w) => {
              const on = visible[w.id];
              return (
                <button
                  key={w.id}
                  onClick={() =>
                    persist({ ...visible, [w.id]: !on } as Record<
                      WidgetId,
                      boolean
                    >)
                  }
                  className={cn(
                    "px-3 h-9 rounded-pill text-xs font-medium border transition flex items-center gap-1.5",
                    on
                      ? "border-primary-600 bg-primary-50 text-primary-700"
                      : "border-line text-ink-3 hover:bg-surface-subtle",
                  )}
                >
                  {on ? (
                    <Eye size={12} strokeWidth={1.75} />
                  ) : (
                    <EyeOff size={12} strokeWidth={1.75} />
                  )}
                  {w.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-3 mt-3">
            บันทึกใน browser ของคุณ · เปลี่ยน device ต้องตั้งใหม่
          </p>
        </Card>
      )}

      {show("quick_actions") && <QuickActions role={role} />}

      {show("kpis") && <KpisRow kpis={deep.kpis} />}

      {show("alerts") && <AlertsPanel alerts={deep.alerts} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {show("ai_brief") && <AiBriefCard deep={deep} />}
          {show("schedule") && (
            <TodaySchedule bookings={todayBookings} />
          )}
          {show("trends") && <TrendsCard trends={deep.trends} />}
          {show("room_utilization") && (
            <RoomUtilizationCard rows={deep.roomUtilization} />
          )}
        </div>

        <div className="space-y-5">
          {show("cashflow") && <CashflowCard kpis={deep.kpis} />}
          {show("tasks") && (
            <TasksCard
              tasks={tasks}
              onAdd={() => setTaskOpen(true)}
              onRefresh={manualRefresh}
            />
          )}
          {show("feed") && <ActivityFeedCard feed={deep.feed} />}
          {show("customer_pulse") && (
            <CustomerPulseCard pulse={deep.customerPulse} />
          )}
          {show("promotions") && (
            <PromotionsMiniCard promos={deep.topPromotions} />
          )}
          {show("internal_users") && (
            <InternalUsersCard pulse={deep.internalUsers} />
          )}
        </div>
      </div>

      {taskOpen && (
        <NewTaskModal
          onClose={() => setTaskOpen(false)}
          onSaved={() => {
            setTaskOpen(false);
            manualRefresh();
          }}
        />
      )}
    </>
  );
}

/* ───────── Sub-components ───────── */

function QuickActions({ role }: { role: Role }) {
  type Action = { href: string; label: string; icon: LucideIcon; roles?: Role[] };
  const all: Action[] = [
    { href: "/admin/bookings", label: "จองใหม่", icon: CalendarPlus },
    { href: "/admin/customers?new=1", label: "ลูกค้าใหม่", icon: UserPlus },
    {
      href: "/admin/finance?action=expense",
      label: "บันทึกรายจ่าย",
      icon: CircleDollarSign,
      roles: ["owner", "super_admin", "admin", "accountant"],
    },
    {
      href: "/admin/promotions",
      label: "สร้างโปรโมชั่น",
      icon: Gift,
      roles: ["owner", "super_admin", "admin", "marketing"],
    },
    {
      href: "/admin/customers/analytics",
      label: "วิเคราะห์ลูกค้า",
      icon: Brain,
      roles: ["owner", "super_admin", "admin", "marketing"],
    },
    {
      href: "/admin/calendar",
      label: "ปฏิทินการจอง",
      icon: Calendar,
    },
  ];
  const items = all.filter((a) => !a.roles || a.roles.includes(role));
  return (
    <Card className="!p-3">
      <div className="flex flex-wrap items-center gap-2">
        {items.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.label}
              href={a.href}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-pill bg-white border border-line text-xs font-medium text-ink-1 hover:border-primary-300 hover:bg-primary-50/40 transition"
            >
              <Icon size={13} strokeWidth={1.75} />
              {a.label}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function KpisRow({ kpis }: { kpis: DashboardDeep["kpis"] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      <Link href="/admin/calendar">
        <KpiCard
          label="จองวันนี้"
          value={`${kpis.todayBookings} รายการ`}
          icon={Calendar}
        />
      </Link>
      <Link href="/admin/finance">
        <KpiCard
          label="รายได้วันนี้"
          value={formatBaht(kpis.todayRevenue)}
          hint={`คาด ${formatBaht(kpis.todayRevenueExpected)}`}
          icon={Wallet}
          iconTone="success"
        />
      </Link>
      <Link href="/admin/calendar">
        <KpiCard
          label="Utilization"
          value={`${kpis.utilization}%`}
          icon={Activity}
        />
      </Link>
      <Link href="/admin/finance">
        <KpiCard
          label="ค้างชำระ"
          value={formatBaht(kpis.outstandingAmount)}
          hint={`${kpis.outstandingCount} รายการ`}
          icon={AlertTriangle}
          iconTone="warning"
        />
      </Link>
      <Link href="/admin/customers">
        <KpiCard
          label="ลูกค้าใหม่ 7 วัน"
          value={`${kpis.newCustomers7d} ราย`}
          icon={UserPlus}
        />
      </Link>
      <Link href="/admin/customers/analytics">
        <KpiCard
          label="Churn HIGH"
          value={`${kpis.churnHighCount} ราย`}
          icon={Brain}
          iconTone={kpis.churnHighCount > 0 ? "danger" : "muted"}
        />
      </Link>
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: DashboardDeep["alerts"] }) {
  const urgent = alerts.filter((a) => a.level === "urgent");
  const today = alerts.filter((a) => a.level === "today");
  const week = alerts.filter((a) => a.level === "week");

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Alerts & Action Items</CardTitle>
            <CardSubtitle>ทุกอย่างเรียบร้อย ไม่มีงานเร่งด่วน</CardSubtitle>
          </div>
          <IconTile icon={Sparkles} tone="success" size="sm" />
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Alerts & Action Items</CardTitle>
          <CardSubtitle>
            {urgent.length} เร่งด่วน · {today.length} วันนี้ · {week.length} สัปดาห์นี้
          </CardSubtitle>
        </div>
        <IconTile icon={AlertTriangle} tone="warning" size="sm" />
      </CardHeader>
      <div className="grid md:grid-cols-3 gap-3">
        <AlertColumn title="Urgent" tone="danger" items={urgent} />
        <AlertColumn title="Today" tone="warning" items={today} />
        <AlertColumn title="This week" tone="info" items={week} />
      </div>
    </Card>
  );
}

function AlertColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "danger" | "warning" | "info";
  items: DashboardDeep["alerts"];
}) {
  const head =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-blue-700";
  return (
    <div className="rounded-card-sm border border-line p-3">
      <p className={`text-[11px] uppercase tracking-[0.08em] font-bold mb-2 ${head}`}>
        {title} · {items.length}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-ink-3">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                href={a.href ?? "#"}
                className="block px-2.5 py-2 rounded-card-sm bg-surface-subtle/50 hover:bg-primary-50/40 border border-transparent hover:border-primary-100 transition"
              >
                <p className="text-xs font-semibold text-ink-1 tracking-tight">
                  {a.title}
                </p>
                {a.detail && (
                  <p className="text-[10px] text-ink-3 mt-0.5 truncate">
                    {a.detail}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AiBriefCard({ deep }: { deep: DashboardDeep }) {
  const { kpis, customerPulse } = deep;
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <IconTile icon={Sparkles} tone="primary" />
          <div>
            <h3 className="font-bold tracking-tight">AI Daily Brief</h3>
            <p className="text-xs text-ink-3">
              Gemini จะ generate ตอน 19:00 ผ่าน Vercel cron · ตอนนี้ผสมจาก KPIs
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 grid md:grid-cols-3 gap-4">
        <BriefBlock
          tone="emerald"
          label="Highlights"
          items={[
            `รายได้วันนี้ ${formatBaht(kpis.todayRevenue)}`,
            `${kpis.todayBookings} จอง · Utilization ${kpis.utilization}%`,
            `Champions ${customerPulse.championsCount} ราย`,
          ]}
        />
        <BriefBlock
          tone="amber"
          label="Alerts"
          items={[
            kpis.outstandingCount > 0
              ? `ค้างชำระ ${kpis.outstandingCount} รายการ · ฿${kpis.outstandingAmount.toLocaleString("th-TH")}`
              : "ไม่มีรายการค้างชำระ",
            kpis.churnHighCount > 0
              ? `Churn HIGH ${kpis.churnHighCount} ราย`
              : "Churn อยู่ในเกณฑ์ปกติ",
            customerPulse.atRiskCount > 0
              ? `At-Risk ${customerPulse.atRiskCount} ราย`
              : "ไม่มี at-risk",
          ]}
        />
        <BriefBlock
          tone="indigo"
          label="Recommendations"
          items={[
            kpis.utilization < 40
              ? "ห้องว่างเยอะ — ส่งโปร flash sale"
              : kpis.utilization > 80
                ? "ห้องเต็ม — พิจารณาเปิด slot เพิ่ม"
                : "Utilization สมดุล",
            customerPulse.newThisWeek > 0
              ? `ส่ง welcome email ให้ลูกค้าใหม่ ${customerPulse.newThisWeek} ราย`
              : "เริ่ม campaign ใหม่ใน /admin/promotions",
          ]}
        />
      </div>
    </Card>
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
  const headerColor =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-indigo-700";
  return (
    <div>
      <p
        className={`text-[10px] uppercase tracking-[0.08em] font-bold ${headerColor} mb-2`}
      >
        {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-ink-2 leading-relaxed">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TodaySchedule({
  bookings,
}: {
  bookings: Props["todayBookings"];
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Today&apos;s Schedule</CardTitle>
          <CardSubtitle>{bookings.length} รายการในวันนี้</CardSubtitle>
        </div>
        <Link href="/admin/calendar">
          <Button
            variant="ghost"
            size="sm"
            iconRight={<ArrowRight size={14} strokeWidth={1.75} />}
          >
            View calendar
          </Button>
        </Link>
      </CardHeader>
      {bookings.length === 0 ? (
        <div className="text-center py-10 text-sm text-ink-3">
          ยังไม่มีการจอง —{" "}
          <Link
            href="/admin/bookings"
            className="text-primary-600 font-medium"
          >
            สร้างการจองใหม่
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => (
            <Link
              key={b.id}
              href="/admin/calendar"
              className="flex items-center gap-3 p-2.5 rounded-card-sm hover:bg-surface-subtle/60 transition"
            >
              <span
                className="w-1 h-10 rounded-full"
                style={{ background: b.room_color ?? "#cbd5e1" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {b.customer_name ?? "—"}
                </p>
                <p className="text-[11px] text-ink-3 tabular-nums">
                  {formatTime(b.starts_at)} – {formatTime(b.ends_at)} ·{" "}
                  {b.room_name}
                </p>
              </div>
              <Badge
                tone={
                  b.payment_status === "paid"
                    ? "success"
                    : b.payment_status === "deposit"
                      ? "warning"
                      : "danger"
                }
              >
                {b.payment_status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function CashflowCard({ kpis }: { kpis: DashboardDeep["kpis"] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cash Flow วันนี้</CardTitle>
          <CardSubtitle>รายรับที่บันทึกแล้ว</CardSubtitle>
        </div>
        <IconTile icon={Wallet} tone="primary" size="sm" />
      </CardHeader>
      <dl className="space-y-2.5 text-sm">
        <Row label="รายรับเข้าจริง">
          <span className="font-semibold text-emerald-600 tabular-nums">
            +{formatBaht(kpis.todayRevenue)}
          </span>
        </Row>
        <Row label="รอเก็บ">
          <span className="font-semibold text-amber-600 tabular-nums">
            {formatBaht(kpis.outstandingAmount)}
          </span>
        </Row>
        <Row label="เดือนนี้">
          <span className="font-semibold tabular-nums">
            {formatBaht(kpis.monthRevenue)}
          </span>
        </Row>
        <div className="h-px bg-line-soft my-2" />
        <Row label="คาดวันนี้">
          <span className="font-bold tabular-nums">
            {formatBaht(kpis.todayRevenueExpected)}
          </span>
        </Row>
      </dl>
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ActivityFeedCard({ feed }: { feed: DashboardDeep["feed"] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardSubtitle>{feed.length} events ล่าสุด</CardSubtitle>
        </div>
        <IconTile icon={Activity} tone="info" size="sm" />
      </CardHeader>
      {feed.length === 0 ? (
        <p className="text-xs text-ink-3">ยังไม่มีกิจกรรม</p>
      ) : (
        <ol className="relative pl-5 space-y-2.5 before:absolute before:left-1.5 before:top-1.5 before:bottom-1.5 before:w-px before:bg-line">
          {feed.slice(0, 12).map((item) => (
            <li key={item.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[14px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                  item.type === "booking_cancelled"
                    ? "bg-red-500"
                    : item.type === "payment_received"
                      ? "bg-emerald-500"
                      : item.type === "customer_created"
                        ? "bg-blue-500"
                        : item.type === "expense_recorded"
                          ? "bg-amber-500"
                          : "bg-primary-500",
                )}
              />
              {item.href ? (
                <Link
                  href={item.href}
                  className="block hover:bg-surface-subtle/60 rounded -ml-2 px-2 py-1 transition"
                >
                  <FeedRow item={item} />
                </Link>
              ) : (
                <div className="px-2 py-1">
                  <FeedRow item={item} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function FeedRow({ item }: { item: DashboardDeep["feed"][number] }) {
  return (
    <>
      <p className="text-xs font-medium text-ink-1 tracking-tight">
        {item.title}
      </p>
      {item.detail && (
        <p className="text-[11px] text-ink-3 truncate">{item.detail}</p>
      )}
      <p className="text-[10px] text-ink-3 tabular-nums mt-0.5">
        {formatRelTime(item.occurred_at)}
      </p>
    </>
  );
}

function TasksCard({
  tasks,
  onAdd,
  onRefresh,
}: {
  tasks: AdminTaskRow[];
  onAdd: () => void;
  onRefresh: () => void;
}) {
  const [, startTransition] = useTransition();

  function toggle(id: string, next: boolean) {
    startTransition(async () => {
      await toggleAdminTask(id, next);
      onRefresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      await deleteAdminTask(id);
      onRefresh();
    });
  }

  const pending = tasks.filter((t) => !t.is_done);
  const done = tasks.filter((t) => t.is_done).slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Pending Tasks</CardTitle>
          <CardSubtitle>
            {pending.length} ค้างอยู่ · {done.length} เสร็จแล้ว
          </CardSubtitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<Plus size={14} strokeWidth={1.75} />}
          onClick={onAdd}
        >
          เพิ่ม
        </Button>
      </CardHeader>
      {pending.length === 0 && done.length === 0 ? (
        <p className="text-xs text-ink-3">
          ยังไม่มี task · กด <strong>+ เพิ่ม</strong> เพื่อบันทึก follow-up
        </p>
      ) : (
        <ul className="space-y-1.5">
          {pending.map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-2 p-2 rounded-card-sm bg-surface-subtle/40 group"
            >
              <button
                onClick={() => toggle(t.id, true)}
                className="mt-0.5 w-4 h-4 rounded border border-line bg-white hover:border-primary-500"
                aria-label="mark done"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-ink-1 tracking-tight">
                  {t.title}
                </p>
                {t.detail && (
                  <p className="text-[10px] text-ink-3 truncate">
                    {t.detail}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-pill font-semibold",
                      t.priority === "urgent"
                        ? "pill-danger"
                        : t.priority === "high"
                          ? "pill-warning"
                          : t.priority === "low"
                            ? "pill-muted"
                            : "pill-info",
                    )}
                  >
                    {t.priority}
                  </span>
                  {t.due_date && (
                    <span className="text-[10px] text-ink-3 tabular-nums">
                      <Clock
                        size={9}
                        strokeWidth={1.75}
                        className="inline mr-0.5"
                      />
                      {t.due_date}
                    </span>
                  )}
                  {t.related_url && (
                    <Link
                      href={t.related_url}
                      className="text-[10px] text-primary-600"
                    >
                      เปิด
                    </Link>
                  )}
                </div>
              </div>
              <button
                onClick={() => remove(t.id)}
                className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-red-600 transition"
                aria-label="delete"
              >
                <X size={12} strokeWidth={1.75} />
              </button>
            </li>
          ))}
          {done.length > 0 && (
            <>
              <li className="pt-2 text-[10px] uppercase tracking-[0.06em] text-ink-3 font-semibold">
                Done
              </li>
              {done.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 p-2 opacity-60"
                >
                  <button
                    onClick={() => toggle(t.id, false)}
                    className="mt-0.5 w-4 h-4 rounded border border-line bg-emerald-100 grid place-items-center"
                    aria-label="undo"
                  >
                    <CheckSquare
                      size={10}
                      strokeWidth={2.25}
                      className="text-emerald-700"
                    />
                  </button>
                  <p className="text-xs line-through text-ink-3 flex-1 truncate">
                    {t.title}
                  </p>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </Card>
  );
}

function CustomerPulseCard({
  pulse,
}: {
  pulse: DashboardDeep["customerPulse"];
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Customer Pulse</CardTitle>
          <CardSubtitle>คะแนนสุขภาพฐานลูกค้า</CardSubtitle>
        </div>
        <IconTile icon={Users} tone="success" size="sm" />
      </CardHeader>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <PulseStat
          label="ใหม่ 7d"
          value={pulse.newThisWeek}
          tone="info"
        />
        <PulseStat
          label="Champions"
          value={pulse.championsCount}
          tone="success"
        />
        <PulseStat
          label="At Risk"
          value={pulse.atRiskCount}
          tone={pulse.atRiskCount > 0 ? "danger" : "muted"}
        />
      </div>
      {pulse.topNewCustomers.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-[0.06em] text-ink-3 mb-1.5">
            New customers
          </p>
          <ul className="space-y-1">
            {pulse.topNewCustomers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/customers/${c.id}`}
                  className="flex items-center justify-between text-xs hover:text-primary-600"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-[10px] text-ink-3 tabular-nums">
                    {formatRelTime(c.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function PulseStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "info" | "success" | "danger" | "muted";
}) {
  const cls =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "bg-red-50 text-red-700"
        : tone === "info"
          ? "bg-blue-50 text-blue-700"
          : "bg-surface-subtle text-ink-3";
  return (
    <div className={cn("rounded-card-sm p-2.5", cls)}>
      <p className="text-[10px] uppercase tracking-[0.06em] font-bold">
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function RoomUtilizationCard({
  rows,
}: {
  rows: DashboardDeep["roomUtilization"];
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Room Utilization · 30 วัน</CardTitle>
          <CardSubtitle>
            % เวลาที่ห้องถูกใช้เทียบกับชั่วโมงให้บริการ
          </CardSubtitle>
        </div>
        <IconTile icon={Flame} tone="warning" size="sm" />
      </CardHeader>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-3">ยังไม่มีข้อมูลห้อง</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.roomId} className="flex items-center gap-3">
              <span
                className="w-2 h-8 rounded-pill"
                style={{ background: r.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{r.name}</span>
                  <span className="tabular-nums text-ink-3">
                    {r.bookedHours}h / {r.availableHours}h ·{" "}
                    <span className="font-bold text-ink-1">{r.pct}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-pill bg-surface-subtle overflow-hidden">
                  <div
                    className={cn(
                      "h-full",
                      r.pct > 75
                        ? "bg-emerald-500"
                        : r.pct > 40
                          ? "bg-primary-500"
                          : "bg-amber-500",
                    )}
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
              </div>
              <span className="text-[11px] tabular-nums text-ink-2 font-semibold">
                {formatCompactBaht(r.revenue)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TrendsCard({ trends }: { trends: DashboardDeep["trends"] }) {
  const maxRevenue = Math.max(1, ...trends.map((t) => t.revenue));
  const maxBookings = Math.max(1, ...trends.map((t) => t.bookings));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Performance Trends · 12 เดือน</CardTitle>
          <CardSubtitle>รายได้ · จอง · ลูกค้าใหม่</CardSubtitle>
        </div>
        <IconTile icon={TrendingUp} tone="success" size="sm" />
      </CardHeader>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-2 h-40 min-w-[480px]">
          {trends.map((t) => {
            const hRev = (t.revenue / maxRevenue) * 100;
            const hBook = (t.bookings / maxBookings) * 100;
            return (
              <div
                key={t.month}
                className="flex-1 flex flex-col items-center gap-1"
                title={`${t.month}: ฿${t.revenue.toLocaleString()} · ${t.bookings} จอง · ${t.newCustomers} ใหม่`}
              >
                <div className="w-full flex items-end gap-0.5 h-32">
                  <div
                    className="flex-1 bg-primary-500 rounded-t"
                    style={{ height: `${hRev}%` }}
                  />
                  <div
                    className="flex-1 bg-emerald-400 rounded-t"
                    style={{ height: `${hBook}%` }}
                  />
                </div>
                <span className="text-[9px] text-ink-3 tabular-nums">
                  {t.month.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2 bg-primary-500 rounded-pill" /> Revenue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2 bg-emerald-400 rounded-pill" /> Bookings
        </span>
      </div>
    </Card>
  );
}

function PromotionsMiniCard({
  promos,
}: {
  promos: DashboardDeep["topPromotions"];
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Promotions</CardTitle>
          <CardSubtitle>Top 5 ที่ใช้บ่อยสุด</CardSubtitle>
        </div>
        <Link href="/admin/promotions">
          <Button variant="ghost" size="sm" iconRight={<ArrowRight size={12} />}>
            ดูทั้งหมด
          </Button>
        </Link>
      </CardHeader>
      {promos.length === 0 ? (
        <p className="text-xs text-ink-3">ยังไม่มีโปรโมชั่นที่ใช้งาน</p>
      ) : (
        <ul className="space-y-1.5">
          {promos.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 p-2 rounded-card-sm bg-surface-subtle/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{p.name}</p>
                <p className="text-[10px] text-ink-3">
                  ใช้แล้ว {p.usesCount}
                  {p.totalQuota ? ` / ${p.totalQuota}` : ""}
                </p>
              </div>
              <Badge
                tone={
                  p.status === "active"
                    ? "success"
                    : p.status === "scheduled"
                      ? "info"
                      : "muted"
                }
              >
                {p.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InternalUsersCard({
  pulse,
}: {
  pulse: DashboardDeep["internalUsers"];
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Internal Users</CardTitle>
          <CardSubtitle>กิจกรรมทีมและสมาชิกองค์กร</CardSubtitle>
        </div>
        <IconTile icon={Users} tone="primary" size="sm" />
      </CardHeader>
      <dl className="space-y-2 text-sm">
        <Row label="Active 7d">
          <span className="font-bold tabular-nums">
            {pulse.adminsActive7d}
          </span>
        </Row>
        <Row label="Total members">
          <span className="font-semibold tabular-nums">
            {pulse.membersCount}
          </span>
        </Row>
        <Row label="Pending invites">
          <span
            className={cn(
              "font-semibold tabular-nums",
              pulse.pendingInvites > 0 && "text-amber-600",
            )}
          >
            {pulse.pendingInvites}
          </span>
        </Row>
        <Row label="New signups 7d">
          <span className="font-semibold tabular-nums">
            {pulse.newSignupsThisWeek}
          </span>
        </Row>
      </dl>
    </Card>
  );
}

function NewTaskModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "urgent"
  >("medium");
  const [dueDate, setDueDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        const r = await createAdminTask({
          title: title.trim(),
          detail: detail.trim() || null,
          priority,
          due_date: dueDate || null,
          related_url: null,
        });
        if (r.ok) onSaved();
        else
          setErr(
            r.error === "table_missing"
              ? "ตาราง admin_tasks ยังไม่ถูกสร้าง — รัน migration ก่อน"
              : "บันทึกไม่สำเร็จ",
          );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
        <div className="shrink-0 p-5 bg-gradient-to-br from-primary-50 to-white border-b border-line-soft flex items-start justify-between">
          <div>
            <p className="font-bold tracking-tight">เพิ่ม Task</p>
            <p className="text-xs text-ink-3 mt-0.5">
              งานที่ต้องติดตาม · เห็นเฉพาะคุณ
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div>
            <Label>หัวข้อ *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="โทรหาคุณ A เรื่องสัญญา"
            />
          </div>
          <div>
            <Label>รายละเอียด</Label>
            <Textarea
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as typeof priority)
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </Select>
            </div>
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          {err && (
            <p className="text-xs text-red-600 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> {err}
            </p>
          )}
        </div>
        <div className="shrink-0 px-5 py-4 bg-surface-subtle border-t border-line-soft flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </Button>
          <Button size="sm" disabled={pending || !title.trim()} onClick={save}>
            {pending ? "บันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function roleLabel(r: Role) {
  return (
    {
      owner: "เจ้าของระบบ",
      super_admin: "Super Admin",
      admin: "Admin",
      staff: "Staff",
      accountant: "Accountant",
      marketing: "Marketing",
      viewer: "Viewer",
    }[r] ?? r
  );
}

function formatRelTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "เมื่อกี้";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} นาทีที่แล้ว`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ชม.ที่แล้ว`;
  return `${Math.floor(diff / 86_400_000)} วันที่แล้ว`;
}
