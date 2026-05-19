import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { classifySegment } from "./customer-segments";
import type { Customer } from "./customers";

export interface DashboardAlert {
  id: string;
  level: "urgent" | "today" | "week";
  category: "finance" | "booking" | "customer" | "promotion" | "system";
  title: string;
  detail?: string;
  href?: string;
  count?: number;
}

export interface ActivityFeedItem {
  id: string;
  occurred_at: string;
  type:
    | "booking_created"
    | "booking_cancelled"
    | "payment_received"
    | "customer_created"
    | "expense_recorded"
    | "promotion_used";
  title: string;
  detail?: string;
  href?: string;
}

export interface AdminTaskRow {
  id: string;
  title: string;
  detail: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  related_url: string | null;
  is_done: boolean;
  created_at: string;
}

export interface RoomUtilizationRow {
  roomId: string;
  name: string;
  color: string;
  bookedHours: number;
  availableHours: number;
  pct: number;
  revenue: number;
}

export interface TrendPoint {
  month: string;
  bookings: number;
  revenue: number;
  newCustomers: number;
}

export interface PromotionMini {
  id: string;
  name: string;
  status: string;
  usesCount: number;
  totalQuota: number | null;
  endsAt: string | null;
}

export interface CustomerPulse {
  newThisWeek: number;
  championsCount: number;
  atRiskCount: number;
  hibernatingCount: number;
  topNewCustomers: Array<{ id: string; name: string; createdAt: string }>;
}

export interface InternalUsersPulse {
  adminsActive7d: number;
  membersCount: number;
  pendingInvites: number;
  newSignupsThisWeek: number;
}

export interface DashboardDeep {
  kpis: {
    todayBookings: number;
    todayRevenue: number;
    todayRevenueExpected: number;
    utilization: number;
    outstandingCount: number;
    outstandingAmount: number;
    newCustomers7d: number;
    churnHighCount: number;
    activePromos: number;
    monthRevenue: number;
    pendingPayments: number;
  };
  alerts: DashboardAlert[];
  feed: ActivityFeedItem[];
  roomUtilization: RoomUtilizationRow[];
  trends: TrendPoint[];
  topPromotions: PromotionMini[];
  customerPulse: CustomerPulse;
  internalUsers: InternalUsersPulse;
  refreshedAt: string;
}

export async function getDashboardDeep(opts: {
  ownerId?: string | null;
} = {}): Promise<DashboardDeep> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const nowMs = now.getTime();
  const dayMs = 86_400_000;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(nowMs - 7 * dayMs);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearAgo = new Date(now);
  yearAgo.setMonth(yearAgo.getMonth() - 11);
  yearAgo.setDate(1);

  const [
    customersRes,
    bookingsRes,
    roomsRes,
    paymentsRes,
    promosRes,
    profilesRes,
    expensesRes,
    invitesRes,
    activitiesRes,
  ] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase
      .from("bookings")
      .select(
        "id, customer_id, room_id, starts_at, ends_at, total_amount, paid_amount, payment_status, booking_status, reference_code, promotion_id, created_at",
      )
      .gte("starts_at", yearAgo.toISOString()),
    supabase.from("rooms").select("id, name, color, hourly_rate, status, service_days"),
    supabase
      .from("booking_payments")
      .select("amount, paid_at, booking_id, method")
      .gte("paid_at", weekStart.toISOString())
      .order("paid_at", { ascending: false })
      .limit(50),
    supabase
      .from("promotions")
      .select(
        "id, name, status, uses_count, total_quota, ends_at, total_saving:promotion_usages(saving)",
      ),
    supabase.from("profiles").select("id, role, is_active, last_login_at, created_at"),
    supabase
      .from("expenses")
      .select("id, amount, description, occurred_on, created_at")
      .gte("occurred_on", weekStart.toISOString().slice(0, 10))
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("org_invites")
      .select("id, accepted_at")
      .is("accepted_at", null),
    supabase
      .from("customer_activities")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(30),
  ]);

  const customers = (customersRes.data ?? []) as unknown as Customer[];
  type BookingRow = {
    id: string;
    customer_id: string | null;
    room_id: string;
    starts_at: string;
    ends_at: string;
    total_amount: number | string;
    paid_amount: number | string;
    payment_status: string;
    booking_status: string;
    reference_code: string;
    promotion_id: string | null;
    created_at: string;
  };
  const bookings = (bookingsRes.data ?? []) as unknown as BookingRow[];
  const rooms = (roomsRes.data ?? []) as unknown as Array<{
    id: string;
    name: string;
    color: string;
    hourly_rate: number;
    status: string;
    service_days: number[] | null;
  }>;
  const payments = (paymentsRes.data ?? []) as unknown as Array<{
    amount: number | string;
    paid_at: string;
    booking_id: string;
    method: string;
  }>;
  const promos = (promosRes.data ?? []) as unknown as Array<{
    id: string;
    name: string;
    status: string;
    uses_count: number;
    total_quota: number | null;
    ends_at: string | null;
  }>;
  const profiles = (profilesRes.data ?? []) as unknown as Array<{
    id: string;
    role: string;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
  }>;
  const expenses = (expensesRes.data ?? []) as unknown as Array<{
    id: string;
    amount: number | string;
    description: string | null;
    occurred_on: string;
    created_at: string;
  }>;
  const pendingInvites = (invitesRes.data ?? []).length;
  const activities = (activitiesRes.data ?? []) as unknown as Array<{
    id: string;
    activity_type: string;
    customer_id: string | null;
    occurred_at: string;
    payload: Record<string, unknown> | null;
  }>;

  // ===== KPIs =====
  const todayBookings = bookings.filter((b) => {
    const t = new Date(b.starts_at).getTime();
    return t >= dayStart.getTime() && t <= dayEnd.getTime();
  });
  const todayRevenue = todayBookings.reduce(
    (s, b) => s + Number(b.paid_amount ?? 0),
    0,
  );
  const todayRevenueExpected = todayBookings.reduce(
    (s, b) => s + Number(b.total_amount ?? 0),
    0,
  );
  const outstanding = bookings.filter(
    (b) =>
      b.payment_status !== "paid" &&
      b.payment_status !== "free" &&
      b.booking_status !== "cancelled" &&
      new Date(b.starts_at).getTime() <= nowMs,
  );
  const outstandingAmount = outstanding.reduce(
    (s, b) =>
      s + Math.max(0, Number(b.total_amount) - Number(b.paid_amount ?? 0)),
    0,
  );

  const newCustomers7d = customers.filter(
    (c) => new Date(c.created_at).getTime() > nowMs - 7 * dayMs,
  ).length;
  const churnHighCount = customers.filter((c) => c.churn_risk === "high").length;
  const activePromos = promos.filter((p) => p.status === "active").length;

  // Utilization today — booked-hours / (rooms × 8h)
  const usedHoursToday = todayBookings.reduce((s, b) => {
    if (b.booking_status === "cancelled") return s;
    return (
      s +
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
        3_600_000
    );
  }, 0);
  const activeRooms = rooms.filter((r) => r.status === "active");
  const utilization =
    activeRooms.length > 0
      ? Math.min(
          100,
          Math.round((usedHoursToday / (activeRooms.length * 8)) * 100),
        )
      : 0;

  const monthBookings = bookings.filter(
    (b) =>
      new Date(b.starts_at).getTime() >= monthStart.getTime() &&
      b.booking_status !== "cancelled",
  );
  const monthRevenue = monthBookings.reduce(
    (s, b) => s + Number(b.paid_amount ?? 0),
    0,
  );

  const pendingPayments = bookings.filter(
    (b) =>
      b.payment_status === "unpaid" || b.payment_status === "deposit",
  ).length;

  // ===== Alerts =====
  const alerts: DashboardAlert[] = [];
  if (outstandingAmount > 0) {
    alerts.push({
      id: "outstanding",
      level: outstanding.length >= 5 ? "urgent" : "today",
      category: "finance",
      title: `${outstanding.length} รายการค้างชำระ`,
      detail: `รวม ฿${outstandingAmount.toLocaleString("th-TH")} — รีบติดตาม`,
      href: "/admin/finance",
      count: outstanding.length,
    });
  }
  const expiringPromos = promos.filter((p) => {
    if (!p.ends_at) return false;
    const d = new Date(p.ends_at).getTime();
    return d > nowMs && d - nowMs < 7 * dayMs && p.status === "active";
  });
  if (expiringPromos.length > 0) {
    alerts.push({
      id: "expiring-promos",
      level: "week",
      category: "promotion",
      title: `${expiringPromos.length} โปรกำลังจะหมดอายุ`,
      detail: expiringPromos
        .slice(0, 2)
        .map((p) => p.name)
        .join(", "),
      href: "/admin/promotions",
      count: expiringPromos.length,
    });
  }
  if (churnHighCount > 0) {
    alerts.push({
      id: "churn",
      level: churnHighCount >= 5 ? "urgent" : "week",
      category: "customer",
      title: `${churnHighCount} ลูกค้าเสี่ยงเสีย`,
      detail: "เปิดดู Customer Analytics เพื่อดำเนินการ",
      href: "/admin/customers/analytics",
      count: churnHighCount,
    });
  }
  const noShowToday = todayBookings.filter(
    (b) => b.booking_status === "no_show",
  );
  if (noShowToday.length > 0) {
    alerts.push({
      id: "no-show",
      level: "today",
      category: "booking",
      title: `${noShowToday.length} no-show วันนี้`,
      href: "/admin/calendar",
      count: noShowToday.length,
    });
  }
  const todayUpcoming = todayBookings.filter(
    (b) =>
      new Date(b.starts_at).getTime() > nowMs &&
      new Date(b.starts_at).getTime() - nowMs < 60 * 60_000 &&
      b.booking_status !== "cancelled",
  );
  if (todayUpcoming.length > 0) {
    alerts.push({
      id: "next-1h",
      level: "today",
      category: "booking",
      title: `${todayUpcoming.length} จองภายใน 1 ชม.`,
      detail: "เตรียมห้อง / coffee break",
      href: "/admin/calendar",
      count: todayUpcoming.length,
    });
  }
  if (pendingInvites > 0) {
    alerts.push({
      id: "pending-invites",
      level: "week",
      category: "system",
      title: `${pendingInvites} คำเชิญรอผู้ใช้ยอมรับ`,
      href: "/admin/users",
      count: pendingInvites,
    });
  }
  const inactiveRooms = rooms.filter((r) => r.status !== "active");
  if (inactiveRooms.length > 0) {
    alerts.push({
      id: "inactive-rooms",
      level: "week",
      category: "system",
      title: `${inactiveRooms.length} ห้องอยู่ในสถานะ ${inactiveRooms[0].status}`,
      href: "/admin/settings/rooms",
      count: inactiveRooms.length,
    });
  }

  // ===== Activity Feed =====
  const feed: ActivityFeedItem[] = [];
  for (const a of activities.slice(0, 20)) {
    const text =
      (a.payload?.text as string | undefined) ??
      (a.payload?.summary as string | undefined) ??
      (a.payload?.note as string | undefined);
    feed.push({
      id: `act-${a.id}`,
      occurred_at: a.occurred_at,
      type:
        a.activity_type === "customer_created"
          ? "customer_created"
          : a.activity_type === "campaign_sent"
            ? "promotion_used"
            : "booking_created",
      title: humanizeActivity(a.activity_type),
      detail: text,
    });
  }
  for (const b of bookings
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)) {
    feed.push({
      id: `bk-${b.id}`,
      occurred_at: b.created_at,
      type:
        b.booking_status === "cancelled"
          ? "booking_cancelled"
          : "booking_created",
      title:
        b.booking_status === "cancelled"
          ? `ยกเลิก ${b.reference_code}`
          : `จองใหม่ ${b.reference_code}`,
      detail: `฿${Number(b.total_amount).toLocaleString("th-TH")}`,
      href: "/admin/calendar",
    });
  }
  for (const p of payments.slice(0, 10)) {
    feed.push({
      id: `pay-${p.booking_id}-${p.paid_at}`,
      occurred_at: p.paid_at,
      type: "payment_received",
      title: `รับชำระ ฿${Number(p.amount).toLocaleString("th-TH")}`,
      detail: paymentMethod(p.method),
      href: "/admin/finance",
    });
  }
  for (const e of expenses.slice(0, 5)) {
    feed.push({
      id: `exp-${e.id}`,
      occurred_at: e.created_at,
      type: "expense_recorded",
      title: `บันทึกรายจ่าย ฿${Number(e.amount).toLocaleString("th-TH")}`,
      detail: e.description ?? undefined,
      href: "/admin/finance",
    });
  }
  feed.sort(
    (a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  // ===== Room utilization (last 30 days) =====
  const thirtyDaysAgo = new Date(nowMs - 30 * dayMs);
  const roomUtilization: RoomUtilizationRow[] = rooms.map((r) => {
    const myBookings = bookings.filter(
      (b) =>
        b.room_id === r.id &&
        b.booking_status !== "cancelled" &&
        new Date(b.starts_at).getTime() >= thirtyDaysAgo.getTime(),
    );
    const bookedHours = myBookings.reduce(
      (s, b) =>
        s +
        (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
          3_600_000,
      0,
    );
    const serviceDaysCount =
      r.service_days && r.service_days.length > 0
        ? r.service_days.length
        : 7;
    const availableHours = Math.round(
      (30 / 7) * serviceDaysCount * 10, // ~10 service hours/day
    );
    const revenue = myBookings.reduce(
      (s, b) => s + Number(b.total_amount ?? 0),
      0,
    );
    return {
      roomId: r.id,
      name: r.name,
      color: r.color,
      bookedHours: Math.round(bookedHours),
      availableHours,
      pct:
        availableHours > 0
          ? Math.min(100, Math.round((bookedHours / availableHours) * 100))
          : 0,
      revenue,
    };
  });

  // ===== 12-month trends =====
  const trends: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(
      monthDate.getMonth() + 1,
    ).padStart(2, "0")}`;
    const monthBookings = bookings.filter(
      (b) =>
        new Date(b.starts_at).getTime() >= monthDate.getTime() &&
        new Date(b.starts_at).getTime() < monthEnd.getTime() &&
        b.booking_status !== "cancelled",
    );
    const revenue = monthBookings.reduce(
      (s, b) => s + Number(b.total_amount ?? 0),
      0,
    );
    const newCustomers = customers.filter(
      (c) =>
        new Date(c.created_at).getTime() >= monthDate.getTime() &&
        new Date(c.created_at).getTime() < monthEnd.getTime(),
    ).length;
    trends.push({
      month: monthKey,
      bookings: monthBookings.length,
      revenue,
      newCustomers,
    });
  }

  // ===== Top promotions =====
  const topPromotions: PromotionMini[] = promos
    .filter((p) => p.status === "active" || p.uses_count > 0)
    .sort((a, b) => b.uses_count - a.uses_count)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      usesCount: p.uses_count,
      totalQuota: p.total_quota,
      endsAt: p.ends_at,
    }));

  // ===== Customer pulse =====
  const championsCount = customers.filter(
    (c) => classifySegment(c) === "champions",
  ).length;
  const hibernatingCount = customers.filter(
    (c) => classifySegment(c) === "hibernating",
  ).length;
  const atRiskCount = customers.filter(
    (c) =>
      classifySegment(c) === "at_risk" || classifySegment(c) === "cant_lose",
  ).length;
  const topNewCustomers = customers
    .filter((c) => new Date(c.created_at).getTime() > nowMs - 7 * dayMs)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.display_name,
      createdAt: c.created_at,
    }));
  const customerPulse: CustomerPulse = {
    newThisWeek: newCustomers7d,
    championsCount,
    atRiskCount,
    hibernatingCount,
    topNewCustomers,
  };

  // ===== Internal users pulse =====
  const adminsActive7d = profiles.filter(
    (p) =>
      p.last_login_at &&
      new Date(p.last_login_at).getTime() > nowMs - 7 * dayMs,
  ).length;
  const newSignupsThisWeek = profiles.filter(
    (p) => new Date(p.created_at).getTime() > nowMs - 7 * dayMs,
  ).length;

  const internalUsers: InternalUsersPulse = {
    adminsActive7d,
    membersCount: profiles.length,
    pendingInvites,
    newSignupsThisWeek,
  };

  return {
    kpis: {
      todayBookings: todayBookings.length,
      todayRevenue,
      todayRevenueExpected,
      utilization,
      outstandingCount: outstanding.length,
      outstandingAmount,
      newCustomers7d,
      churnHighCount,
      activePromos,
      monthRevenue,
      pendingPayments,
    },
    alerts,
    feed: feed.slice(0, 20),
    roomUtilization,
    trends,
    topPromotions,
    customerPulse,
    internalUsers,
    refreshedAt: new Date().toISOString(),
  };
}

export async function listAdminTasks(ownerId: string): Promise<AdminTaskRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("admin_tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .order("is_done", { ascending: true })
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(20);
  // If the table doesn't exist yet (migration pending), return empty rather
  // than crashing the dashboard.
  if (error) return [];
  return (data ?? []) as unknown as AdminTaskRow[];
}

function humanizeActivity(type: string) {
  const map: Record<string, string> = {
    customer_created: "ลูกค้าใหม่",
    booking_created: "การจองใหม่",
    payment_received: "รับชำระเงิน",
    note_added: "เพิ่มบันทึก",
    campaign_sent: "ส่ง campaign",
    tag_added: "เพิ่ม Tag",
    tier_upgraded: "เลื่อนชั้น",
    blacklisted: "แบล็คลิสต์",
    ai_alert: "AI Alert",
  };
  return map[type] ?? type;
}

function paymentMethod(m: string) {
  return (
    {
      cash: "เงินสด",
      bank_transfer: "โอนธนาคาร",
      promptpay: "PromptPay",
      qr: "QR",
      credit_card: "บัตรเครดิต",
    }[m] ?? m
  );
}
