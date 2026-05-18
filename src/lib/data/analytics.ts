import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export interface RfmSegment {
  name: string;
  code: string;
  color: string;
  x: number; // 0–100 recency axis
  y: number; // 0–100 monetary axis
  count: number;
}

const SEGMENT_DEFS: Array<Omit<RfmSegment, "count">> = [
  { name: "Champions", code: "555", color: "bg-primary-600", x: 85, y: 90 },
  { name: "Loyal", code: "454", color: "bg-primary-400", x: 70, y: 75 },
  { name: "Potential Loyalist", code: "543", color: "bg-emerald-500", x: 60, y: 50 },
  { name: "New Customers", code: "511", color: "bg-blue-400", x: 85, y: 25 },
  { name: "Need Attention", code: "322", color: "bg-amber-500", x: 40, y: 40 },
  { name: "At Risk", code: "213", color: "bg-red-500", x: 25, y: 60 },
  { name: "Hibernating", code: "232", color: "bg-slate-400", x: 20, y: 30 },
  { name: "Lost", code: "111", color: "bg-slate-300", x: 10, y: 12 },
];

/**
 * Compute RFM segments from the customers table. Rules are intentionally simple
 * — refined logic (per-quintile scoring) lives in Phase 2.
 */
export async function rfmSegments(): Promise<RfmSegment[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("customers")
    .select("rfm_score, churn_risk, total_bookings, total_spent, last_booked_at");
  const customers = (data ?? []) as Array<{
    rfm_score: string | null;
    churn_risk: "low" | "medium" | "high" | null;
    total_bookings: number;
    total_spent: number;
    last_booked_at: string | null;
  }>;

  const now = Date.now();
  function bucketOf(c: (typeof customers)[number]): string {
    const days = c.last_booked_at
      ? (now - new Date(c.last_booked_at).getTime()) / 86_400_000
      : 9_999;
    const r = days < 14 ? 5 : days < 30 ? 4 : days < 60 ? 3 : days < 120 ? 2 : 1;
    const m =
      c.total_spent > 50_000
        ? 5
        : c.total_spent > 20_000
          ? 4
          : c.total_spent > 8_000
            ? 3
            : c.total_spent > 2_000
              ? 2
              : 1;
    const f =
      c.total_bookings > 20
        ? 5
        : c.total_bookings > 10
          ? 4
          : c.total_bookings > 4
            ? 3
            : c.total_bookings > 1
              ? 2
              : 1;
    if (r === 5 && m >= 4) return "555";
    if (r >= 4 && m >= 3 && f >= 3) return "454";
    if (r >= 3 && m >= 3) return "543";
    if (r === 5 && f === 1) return "511";
    if (c.churn_risk === "high" && r <= 2) return "213";
    if (r <= 2 && f <= 2) return "232";
    if (r === 1 && f === 1) return "111";
    return "322";
  }

  const counts = new Map<string, number>();
  for (const c of customers) {
    const code = c.rfm_score && SEGMENT_DEFS.some((s) => s.code === c.rfm_score)
      ? c.rfm_score
      : bucketOf(c);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return SEGMENT_DEFS.map((s) => ({ ...s, count: counts.get(s.code) ?? 0 }));
}

export async function cohortRetention(monthsBack = 5, horizon = 7) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("customers")
    .select("id, first_booked_at");
  const customers = (data ?? []) as Array<{
    id: string;
    first_booked_at: string | null;
  }>;

  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select("customer_id, starts_at")
    .in("booking_status", ["confirmed", "completed", "in_use"]);
  const bookings = (bookingsRaw ?? []) as Array<{
    customer_id: string | null;
    starts_at: string;
  }>;

  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const cohorts: Array<{
    label: string;
    key: string;
    size: number;
    retention: Array<number | null>;
  }> = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const key = monthKey(d);
    const cohortCustomers = customers
      .filter(
        (c) =>
          c.first_booked_at && monthKey(new Date(c.first_booked_at)) === key,
      )
      .map((c) => c.id);
    const retention: Array<number | null> = [];
    for (let m = 0; m < horizon; m++) {
      const monthEnd = new Date(d);
      monthEnd.setMonth(monthEnd.getMonth() + m);
      if (monthEnd > now) {
        retention.push(null);
        continue;
      }
      const targetKey = monthKey(monthEnd);
      const activeCount = cohortCustomers.filter((id) =>
        bookings.some(
          (b) =>
            b.customer_id === id &&
            monthKey(new Date(b.starts_at)) === targetKey,
        ),
      ).length;
      retention.push(
        cohortCustomers.length > 0
          ? Math.round((activeCount / cohortCustomers.length) * 100)
          : 0,
      );
    }
    cohorts.push({
      label: d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }),
      key,
      size: cohortCustomers.length,
      retention,
    });
  }
  return cohorts;
}

export async function customerKpis() {
  const supabase = createSupabaseAdminClient();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const { data: customers } = await supabase
    .from("customers")
    .select(
      "id, churn_risk, total_spent, total_bookings, first_booked_at, last_booked_at, created_at",
    );
  const cs = (customers ?? []) as Array<{
    churn_risk: "low" | "medium" | "high" | null;
    total_spent: number;
    total_bookings: number;
    first_booked_at: string | null;
    last_booked_at: string | null;
    created_at: string;
  }>;

  const monthAgoTs = monthAgo.getTime();
  const mau = cs.filter(
    (c) =>
      c.last_booked_at && new Date(c.last_booked_at).getTime() > monthAgoTs,
  ).length;
  const newCount = cs.filter(
    (c) => new Date(c.created_at).getTime() > monthAgoTs,
  ).length;
  const returning = cs.filter((c) => c.total_bookings > 1).length;
  const returningPct =
    cs.length > 0 ? Math.round((returning / cs.length) * 100) : 0;
  const churn = cs.filter((c) => c.churn_risk === "high").length;
  const churnRate =
    cs.length > 0 ? Math.round((churn / cs.length) * 100) : 0;
  const clv =
    cs.length > 0
      ? Math.round(cs.reduce((s, c) => s + Number(c.total_spent), 0) / cs.length)
      : 0;

  return { mau, newCount, returningPct, churnRate, clv };
}
