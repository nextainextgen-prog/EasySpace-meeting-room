import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export interface CustomerBookingRow {
  id: string;
  reference_code: string;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  paid_amount: number;
  booking_status: string;
  payment_status: string;
  room: { id: string; name: string; color: string } | null;
}

export interface CustomerPaymentRow {
  id: string;
  booking_id: string;
  paid_at: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  booking?: { reference_code: string } | null;
}

export interface CustomerActivityRow {
  id: string;
  customer_id: string;
  activity_type: string;
  payload: Record<string, unknown>;
  actor_type: "admin" | "customer" | "system" | "ai" | null;
  actor_id: string | null;
  source: string | null;
  occurred_at: string;
}

export async function listCustomerBookings(
  customerId: string,
  opts: { limit?: number } = {},
): Promise<CustomerBookingRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, starts_at, ends_at, total_amount, paid_amount, booking_status, payment_status, room:rooms(id, name, color)",
    )
    .eq("customer_id", customerId)
    .order("starts_at", { ascending: false })
    .limit(opts.limit ?? 100);
  return (data ?? []) as unknown as CustomerBookingRow[];
}

export async function listCustomerPayments(
  customerId: string,
): Promise<CustomerPaymentRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, reference_code")
    .eq("customer_id", customerId);
  const ids = ((bookings ?? []) as Array<{ id: string; reference_code: string }>).map(
    (b) => b.id,
  );
  if (ids.length === 0) return [];

  const refMap = new Map(
    ((bookings ?? []) as Array<{ id: string; reference_code: string }>).map(
      (b) => [b.id, b.reference_code] as const,
    ),
  );

  const { data } = await supabase
    .from("booking_payments")
    .select("*")
    .in("booking_id", ids)
    .order("paid_at", { ascending: false });

  return ((data ?? []) as Array<CustomerPaymentRow>).map((p) => ({
    ...p,
    booking: { reference_code: refMap.get(p.booking_id) ?? "" },
  }));
}

export async function listCustomerActivities(
  customerId: string,
  opts: { limit?: number } = {},
): Promise<CustomerActivityRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("customer_activities")
    .select("*")
    .eq("customer_id", customerId)
    .order("occurred_at", { ascending: false })
    .limit(opts.limit ?? 100);
  return (data ?? []) as unknown as CustomerActivityRow[];
}

/**
 * Composite activity feed: real customer_activities rows + synthesized rows
 * from bookings + payments so the timeline is meaningful even before the
 * activity ingestion job runs (Phase 1 fallback).
 */
export async function getCustomerTimeline(customerId: string) {
  const [activities, bookings, payments] = await Promise.all([
    listCustomerActivities(customerId, { limit: 200 }),
    listCustomerBookings(customerId, { limit: 100 }),
    listCustomerPayments(customerId),
  ]);

  type Item = {
    id: string;
    type: string;
    occurred_at: string;
    title: string;
    detail?: string;
    payload?: Record<string, unknown>;
    actor?: string;
  };

  const items: Item[] = [];

  for (const a of activities) {
    items.push({
      id: `act-${a.id}`,
      type: a.activity_type,
      occurred_at: a.occurred_at,
      title: humanizeActivityType(a.activity_type),
      detail:
        (a.payload?.text as string | undefined) ??
        (a.payload?.note as string | undefined) ??
        (a.payload?.summary as string | undefined),
      payload: a.payload,
      actor: a.actor_type === "system" ? "ระบบ" : a.actor_type === "ai" ? "AI" : undefined,
    });
  }

  for (const b of bookings) {
    items.push({
      id: `bk-${b.id}`,
      type:
        b.booking_status === "cancelled"
          ? "booking_cancelled"
          : "booking_created",
      occurred_at: b.starts_at,
      title:
        b.booking_status === "cancelled"
          ? `ยกเลิกการจอง ${b.reference_code}`
          : `จองการประชุม ${b.reference_code}`,
      detail: `${b.room?.name ?? "ห้อง"} · ฿${Number(b.total_amount).toLocaleString("th-TH")}`,
    });
  }

  for (const p of payments) {
    items.push({
      id: `pay-${p.id}`,
      type: "payment_made",
      occurred_at: p.paid_at,
      title: `ชำระเงิน ฿${Number(p.amount).toLocaleString("th-TH")}`,
      detail: `${methodLabel(p.method)}${p.reference ? ` · ${p.reference}` : ""}`,
    });
  }

  items.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  return items;
}

function humanizeActivityType(t: string) {
  const map: Record<string, string> = {
    note_added: "บันทึก",
    tag_added: "เพิ่ม Tag",
    tag_removed: "ลบ Tag",
    tier_upgraded: "เลื่อนชั้น",
    tier_downgraded: "ลดชั้น",
    blacklisted: "แบล็คลิสต์",
    unblacklisted: "ปลดแบล็คลิสต์",
    ai_alert: "AI Alert",
    birthday_sent: "ส่งอวยพรวันเกิด",
    campaign_sent: "ส่งแคมเปญ",
    rfm_recomputed: "คำนวณ RFM ใหม่",
    message_received: "ข้อความเข้า",
    message_sent: "ตอบข้อความ",
    email_sent: "ส่งอีเมล",
    call_inbound: "โทรเข้า",
    call_outbound: "โทรออก",
    file_uploaded: "อัปโหลดไฟล์",
    visit_check_in: "เช็คอินห้อง",
    visit_check_out: "เช็คเอาท์",
    feedback_received: "ได้รับ feedback",
    customer_created: "เริ่มเป็นลูกค้า",
    customer_updated: "แก้ไขข้อมูล",
  };
  return map[t] ?? t;
}

function methodLabel(m: string) {
  return {
    cash: "เงินสด",
    bank_transfer: "โอนเงิน",
    promptpay: "PromptPay",
    qr: "QR",
    credit_card: "บัตรเครดิต",
  }[m] ?? m;
}

export interface CustomerAnalyticsSummary {
  byRoom: Array<{ name: string; color: string; count: number; pct: number }>;
  byDow: number[]; // 0=Sun ... 6=Sat — booking counts
  byHour: number[]; // 0..23 — booking counts
  monthlyRevenue: Array<{ month: string; amount: number }>;
  totalPaid: number;
  outstanding: number;
  avgPayLagDays: number | null;
}

export async function getCustomerAnalytics(customerId: string): Promise<CustomerAnalyticsSummary> {
  const [bookings, payments] = await Promise.all([
    listCustomerBookings(customerId, { limit: 500 }),
    listCustomerPayments(customerId),
  ]);

  const roomMap = new Map<string, { name: string; color: string; count: number }>();
  const byDow = Array(7).fill(0) as number[];
  const byHour = Array(24).fill(0) as number[];
  const monthly = new Map<string, number>();

  for (const b of bookings) {
    if (b.booking_status === "cancelled") continue;
    const key = b.room?.id ?? "—";
    const cur =
      roomMap.get(key) ?? {
        name: b.room?.name ?? "ห้อง",
        color: b.room?.color ?? "#94A3B8",
        count: 0,
      };
    cur.count++;
    roomMap.set(key, cur);

    const d = new Date(b.starts_at);
    byDow[d.getDay()]++;
    byHour[d.getHours()]++;

    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(ym, (monthly.get(ym) ?? 0) + Number(b.total_amount));
  }

  const totalBookings = Array.from(roomMap.values()).reduce((s, r) => s + r.count, 0);
  const byRoom = Array.from(roomMap.values())
    .map((r) => ({
      ...r,
      pct: totalBookings > 0 ? Math.round((r.count / totalBookings) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const monthlyRevenue = Array.from(monthly.entries())
    .sort()
    .map(([month, amount]) => ({ month, amount }));

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalBilled = bookings.reduce((s, b) => s + Number(b.total_amount), 0);
  const outstanding = Math.max(0, totalBilled - totalPaid);

  const lags: number[] = [];
  for (const b of bookings) {
    const firstPay = payments
      .filter((p) => p.booking_id === b.id)
      .sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime())[0];
    if (!firstPay) continue;
    const lag =
      (new Date(firstPay.paid_at).getTime() - new Date(b.starts_at).getTime()) /
      86_400_000;
    lags.push(lag);
  }
  const avgPayLagDays =
    lags.length > 0 ? Math.round((lags.reduce((s, l) => s + l, 0) / lags.length) * 10) / 10 : null;

  return { byRoom, byDow, byHour, monthlyRevenue, totalPaid, outstanding, avgPayLagDays };
}
