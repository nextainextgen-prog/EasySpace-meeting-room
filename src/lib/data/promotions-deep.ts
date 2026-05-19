import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { PromotionWithMetrics } from "./promotions";

export interface PromotionFunnelRow {
  promotionId: string;
  name: string;
  reachable: number;
  views: number;
  redemptions: number;
  revenue: number;
  saving: number;
  conversionPct: number;
  aov: number;
}

export interface AbuseSignal {
  customerId: string | null;
  customerName: string | null;
  promotionId: string;
  promotionName: string;
  reason: string;
  severity: "low" | "medium" | "high";
  count: number;
}

export interface AutoPromoRow {
  trigger: "birthday" | "welcome" | "hibernating" | "anniversary";
  label: string;
  description: string;
  matches: number;
  defaultDiscount: string;
  enabled: boolean;
}

export interface AbTestRow {
  id: string;
  promotionId: string;
  variantA: string;
  variantB: string;
  redemptionsA: number;
  redemptionsB: number;
  revenueA: number;
  revenueB: number;
  winner: "A" | "B" | "tie";
  status: "running" | "paused" | "concluded";
}

export interface ConflictWarning {
  promotionId: string;
  message: string;
}

export interface AiSuggestion {
  title: string;
  rationale: string;
  promotionType: "percentage" | "fixed" | "package_upgrade" | "free_addon" | "bogo";
  suggestedDiscount: number;
  estimatedReach: number;
  estimatedRevenue: number;
}

export interface PromotionDeep {
  funnel: PromotionFunnelRow[];
  abuse: AbuseSignal[];
  autoPromos: AutoPromoRow[];
  abTests: AbTestRow[];
  conflicts: ConflictWarning[];
  suggestions: AiSuggestion[];
  topPerformer: PromotionFunnelRow | null;
  totalRedemptions: number;
  averageAov: number;
}

export async function getPromotionsDeep(
  promos: PromotionWithMetrics[],
): Promise<PromotionDeep> {
  const supabase = createSupabaseAdminClient();

  const [{ data: usagesRaw }, { data: customersRaw }, { data: bookingsRaw }] =
    await Promise.all([
      supabase
        .from("promotion_usages")
        .select(
          "promotion_id, booking_id, customer_id, saving, used_at, booking:bookings(total_amount, starts_at)",
        ),
      supabase
        .from("customers")
        .select(
          "id, display_name, birthday, first_booked_at, last_booked_at, tags",
        ),
      supabase
        .from("bookings")
        .select("id, customer_id, starts_at, total_amount, promotion_id"),
    ]);

  type UsageRow = {
    promotion_id: string;
    booking_id: string;
    customer_id: string | null;
    saving: number | string;
    used_at: string;
    booking: { total_amount: number | string; starts_at: string } | null;
  };
  const usages = (usagesRaw ?? []) as unknown as UsageRow[];

  const customers = (customersRaw ?? []) as unknown as Array<{
    id: string;
    display_name: string;
    birthday: string | null;
    first_booked_at: string | null;
    last_booked_at: string | null;
    tags: string[] | null;
  }>;

  const customerMap = new Map(customers.map((c) => [c.id, c] as const));
  const now = Date.now();
  const dayMs = 86_400_000;

  // ====== Funnel ======
  const funnel: PromotionFunnelRow[] = promos.map((p) => {
    const myUsages = usages.filter((u) => u.promotion_id === p.id);
    const redemptions = myUsages.length;
    const reachable = estimateReachable(p, customers.length);
    const views = Math.max(redemptions, Math.round(reachable * 0.4));
    const aov =
      redemptions > 0
        ? Math.round(p.total_revenue / redemptions)
        : 0;
    const conversionPct =
      views > 0 ? Math.round((redemptions / views) * 100) : 0;
    return {
      promotionId: p.id,
      name: p.name,
      reachable,
      views,
      redemptions,
      revenue: p.total_revenue,
      saving: p.total_saving,
      conversionPct,
      aov,
    };
  });

  const totalRedemptions = funnel.reduce((s, r) => s + r.redemptions, 0);
  const totalRevenue = funnel.reduce((s, r) => s + r.revenue, 0);
  const averageAov =
    totalRedemptions > 0 ? Math.round(totalRevenue / totalRedemptions) : 0;
  const topPerformer =
    funnel.length > 0
      ? [...funnel].sort((a, b) => b.revenue - a.revenue)[0]
      : null;

  // ====== Abuse Detection ======
  const usageCountByCustomer = new Map<string, Map<string, number>>();
  for (const u of usages) {
    if (!u.customer_id) continue;
    const inner =
      usageCountByCustomer.get(u.customer_id) ?? new Map<string, number>();
    inner.set(u.promotion_id, (inner.get(u.promotion_id) ?? 0) + 1);
    usageCountByCustomer.set(u.customer_id, inner);
  }
  const abuse: AbuseSignal[] = [];
  for (const [customerId, byPromo] of usageCountByCustomer) {
    const customer = customerMap.get(customerId);
    for (const [promoId, count] of byPromo) {
      const promo = promos.find((p) => p.id === promoId);
      if (!promo) continue;
      const cap = promo.per_customer_quota ?? 1;
      if (count > cap) {
        abuse.push({
          customerId,
          customerName: customer?.display_name ?? null,
          promotionId: promoId,
          promotionName: promo.name,
          reason: `ใช้ ${count} ครั้ง (limit ${cap})`,
          severity: count - cap >= 3 ? "high" : count - cap >= 1 ? "medium" : "low",
          count,
        });
      }
    }
  }
  // Detect: same code many same-day uses across customers
  const sameDayMap = new Map<string, number>();
  for (const u of usages) {
    const key = `${u.promotion_id}:${u.used_at.slice(0, 10)}`;
    sameDayMap.set(key, (sameDayMap.get(key) ?? 0) + 1);
  }
  for (const [key, count] of sameDayMap) {
    if (count < 10) continue;
    const [promoId] = key.split(":");
    const promo = promos.find((p) => p.id === promoId);
    if (!promo) continue;
    abuse.push({
      customerId: null,
      customerName: null,
      promotionId: promoId,
      promotionName: promo.name,
      reason: `ใช้ ${count} ครั้งในวันเดียว — ตรวจสอบ multi-account abuse`,
      severity: "high",
      count,
    });
  }

  // ====== Auto Promotions ======
  const monthDay = (d: Date) =>
    `${d.getMonth() + 1}-${d.getDate()}`;
  const today = new Date();
  const todayKey = monthDay(today);
  const next7 = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    next7.add(monthDay(d));
  }
  const birthdayCount = customers.filter((c) => {
    if (!c.birthday) return false;
    const b = new Date(c.birthday);
    return next7.has(monthDay(b));
  }).length;

  const welcomeCount = customers.filter(
    (c) =>
      c.first_booked_at &&
      now - new Date(c.first_booked_at).getTime() < 14 * dayMs,
  ).length;

  const hibernatingCount = customers.filter(
    (c) =>
      !c.last_booked_at ||
      now - new Date(c.last_booked_at).getTime() > 90 * dayMs,
  ).length;

  const anniversaryCount = customers.filter((c) => {
    if (!c.first_booked_at) return false;
    const d = new Date(c.first_booked_at);
    const lastYear = today.getFullYear() - d.getFullYear();
    return lastYear >= 1 && monthDay(d) === todayKey;
  }).length;

  const autoPromos: AutoPromoRow[] = [
    {
      trigger: "birthday",
      label: "Birthday treat",
      description: "ส่งคูปองวันเกิด 20% ลดอัตโนมัติ (มีผลถึงสิ้นเดือนเกิด)",
      matches: birthdayCount,
      defaultDiscount: "20%",
      enabled: birthdayCount > 0,
    },
    {
      trigger: "welcome",
      label: "Welcome series",
      description: "ลูกค้าใหม่ 14 วันแรก — ฟรี Add-on หรือ 10% off ครั้งที่ 2",
      matches: welcomeCount,
      defaultDiscount: "10% / ฟรี Add-on",
      enabled: welcomeCount > 0,
    },
    {
      trigger: "hibernating",
      label: "Winback",
      description: "ลูกค้าที่หายไป >90 วัน — ฉีดโปร 25% off",
      matches: hibernatingCount,
      defaultDiscount: "25%",
      enabled: hibernatingCount > 0,
    },
    {
      trigger: "anniversary",
      label: "Anniversary",
      description: "ครบรอบจองครั้งแรก — ของขวัญ + voucher",
      matches: anniversaryCount,
      defaultDiscount: "Voucher",
      enabled: anniversaryCount > 0,
    },
  ];

  // ====== A/B Tests (synthesized from same-base-name promos) ======
  const abTests: AbTestRow[] = [];
  const byBase = new Map<string, PromotionWithMetrics[]>();
  for (const p of promos) {
    const base = p.name.replace(/\s+(A|B|Variant\s*[AB])$/i, "").trim();
    const arr = byBase.get(base) ?? [];
    arr.push(p);
    byBase.set(base, arr);
  }
  for (const [base, group] of byBase) {
    if (group.length < 2) continue;
    const [a, b] = group;
    const winner =
      a.total_revenue === b.total_revenue
        ? "tie"
        : a.total_revenue > b.total_revenue
          ? "A"
          : "B";
    abTests.push({
      id: `${a.id}-${b.id}`,
      promotionId: a.id,
      variantA: a.name,
      variantB: b.name,
      redemptionsA: a.uses_count,
      redemptionsB: b.uses_count,
      revenueA: a.total_revenue,
      revenueB: b.total_revenue,
      winner,
      status:
        a.status === "active" || b.status === "active"
          ? "running"
          : "concluded",
    });
    void base;
  }

  // ====== Forecast Conflict ======
  const conflicts: ConflictWarning[] = [];
  const activeNow = promos.filter(
    (p) => p.status === "active" || p.status === "scheduled",
  );
  for (let i = 0; i < activeNow.length; i++) {
    for (let j = i + 1; j < activeNow.length; j++) {
      const a = activeNow[i];
      const b = activeNow[j];
      if (a.stackable && b.stackable) continue;
      const overlapRooms = a.applicable_room_ids.some((r) =>
        b.applicable_room_ids.includes(r),
      );
      const overlapTime =
        new Date(a.starts_at).getTime() <
          new Date(b.ends_at ?? b.starts_at).getTime() &&
        new Date(b.starts_at).getTime() <
          new Date(a.ends_at ?? a.starts_at).getTime();
      if (
        (overlapRooms ||
          a.applicable_room_ids.length === 0 ||
          b.applicable_room_ids.length === 0) &&
        overlapTime
      ) {
        conflicts.push({
          promotionId: a.id,
          message: `ทับซ้อนกับ "${b.name}" — ห้อง/เวลาเดียวกัน · ไม่ stackable`,
        });
      }
    }
  }

  // ====== AI Suggestions (heuristic) ======
  const bookings = (bookingsRaw ?? []) as unknown as Array<{
    customer_id: string | null;
    starts_at: string;
    total_amount: number | string;
    promotion_id: string | null;
  }>;
  const recentBookings = bookings.filter(
    (b) => now - new Date(b.starts_at).getTime() < 30 * dayMs,
  );
  const recentRevenue = recentBookings.reduce(
    (s, b) => s + Number(b.total_amount ?? 0),
    0,
  );
  const promoUsage = recentBookings.filter((b) => b.promotion_id).length;

  const suggestions: AiSuggestion[] = [];
  if (hibernatingCount > 0) {
    suggestions.push({
      title: "Winback กลุ่ม Hibernating",
      rationale: `มีลูกค้า ${hibernatingCount} รายห่างนาน >90 วัน · ฉีดโปรกระตุ้นใน 7 วัน`,
      promotionType: "percentage",
      suggestedDiscount: 25,
      estimatedReach: hibernatingCount,
      estimatedRevenue: Math.round(hibernatingCount * 0.18 * 4500),
    });
  }
  if (promoUsage / Math.max(1, recentBookings.length) < 0.1) {
    suggestions.push({
      title: "เพิ่ม Free Add-on weekday",
      rationale: "อัตราการใช้โปรต่ำกว่า 10% — เสนอแถม Add-on จะเพิ่ม AOV",
      promotionType: "free_addon",
      suggestedDiscount: 0,
      estimatedReach: Math.round(recentBookings.length * 0.3),
      estimatedRevenue: Math.round(recentRevenue * 0.05),
    });
  }
  if (birthdayCount > 0) {
    suggestions.push({
      title: "Birthday auto-coupon",
      rationale: `${birthdayCount} คนเกิดใน 7 วันนี้ — เปิด auto-promo สร้าง engagement`,
      promotionType: "percentage",
      suggestedDiscount: 20,
      estimatedReach: birthdayCount,
      estimatedRevenue: birthdayCount * 850,
    });
  }
  if (welcomeCount > 0) {
    suggestions.push({
      title: "Welcome BOGO",
      rationale: `${welcomeCount} ลูกค้าใหม่ 14 วันแรก — BOGO ดึงเป็น loyal`,
      promotionType: "bogo",
      suggestedDiscount: 50,
      estimatedReach: welcomeCount,
      estimatedRevenue: Math.round(welcomeCount * 0.3 * 2200),
    });
  }

  return {
    funnel,
    abuse,
    autoPromos,
    abTests,
    conflicts,
    suggestions,
    topPerformer,
    totalRedemptions,
    averageAov,
  };
}

function estimateReachable(
  p: PromotionWithMetrics,
  totalCustomers: number,
): number {
  if (p.applicable_segments.length > 0 || p.applicable_tags.length > 0) {
    return Math.round(totalCustomers * 0.35);
  }
  return totalCustomers;
}
