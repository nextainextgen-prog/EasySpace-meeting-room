import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { classifySegment, type SegmentKey } from "./customer-segments";
import type { Customer } from "./customers";
import type { LeadSource } from "@/lib/types";

/**
 * Heavy analytics aggregations for /admin/customers/analytics.
 * All functions are server-side and cached per request.
 */

const SEGMENT_QUADRANT: Record<
  SegmentKey,
  { x: number; y: number; color: string; label: string }
> = {
  champions: { x: 88, y: 92, color: "bg-primary-600", label: "Champions" },
  loyal: { x: 72, y: 78, color: "bg-primary-500", label: "Loyal" },
  potential: { x: 62, y: 58, color: "bg-emerald-500", label: "Potential" },
  new: { x: 90, y: 28, color: "bg-blue-400", label: "New" },
  promising: { x: 78, y: 22, color: "bg-sky-400", label: "Promising" },
  need_attention: { x: 45, y: 45, color: "bg-amber-500", label: "Need Attention" },
  about_to_sleep: { x: 32, y: 30, color: "bg-orange-400", label: "About to Sleep" },
  at_risk: { x: 22, y: 65, color: "bg-red-500", label: "At Risk" },
  cant_lose: { x: 10, y: 88, color: "bg-rose-600", label: "Can't Lose" },
  hibernating: { x: 20, y: 18, color: "bg-slate-400", label: "Hibernating" },
  lost: { x: 8, y: 10, color: "bg-slate-300", label: "Lost" },
  all: { x: 50, y: 50, color: "bg-slate-200", label: "All" },
  blacklist: { x: 5, y: 5, color: "bg-zinc-800", label: "Blacklist" },
};

export interface RfmQuadrantPoint {
  key: SegmentKey;
  name: string;
  count: number;
  x: number;
  y: number;
  color: string;
}

export interface RetentionCurvePoint {
  day: number;
  label: string;
  pct: number;
  active: number;
  cohort: number;
}

export interface SankeyFlow {
  fromActive: number;
  fromDormant: number;
  becameActive: number;
  becameDormant: number;
  stayedActive: number;
  stayedDormant: number;
  newlyAcquired: number;
  totalLastMonth: number;
  totalThisMonth: number;
}

export interface ChurnRiskRow {
  id: string;
  name: string;
  daysSinceLast: number;
  totalSpent: number;
  totalBookings: number;
  churnScore: number;
  action: string;
}

export interface SourcePerformanceRow {
  source: LeadSource | "unknown";
  label: string;
  customers: number;
  bookings: number;
  revenue: number;
  clv: number;
  churnPct: number;
  roi: number;
}

export interface HeatmapCell {
  dow: number;
  hour: number;
  count: number;
}

export interface SegmentRoomRow {
  segment: SegmentKey;
  segmentLabel: string;
  topRoom: string;
  topRoomColor: string;
  topRoomCount: number;
  totalBookings: number;
}

export interface AnomalyAlert {
  level: "info" | "warning" | "danger";
  title: string;
  detail: string;
}

export interface NextBestActionRow {
  id: string;
  name: string;
  segment: SegmentKey;
  segmentLabel: string;
  action: string;
  channel: "call" | "line" | "email" | "campaign";
  urgency: "high" | "med" | "low";
}

export interface ClvPredictionRow {
  segment: SegmentKey;
  label: string;
  customers: number;
  avgClv: number;
  predicted12m: number;
  retentionAssumption: number;
}

export interface DeepAnalytics {
  kpis: {
    mau: number;
    newCount: number;
    returningPct: number;
    churnRate: number;
    clv: number;
    mauDelta: number;
    newDelta: number;
    churnDelta: number;
  };
  rfm: RfmQuadrantPoint[];
  retentionCurve: RetentionCurvePoint[];
  sankey: SankeyFlow;
  churnRisk: ChurnRiskRow[];
  heatmap: HeatmapCell[];
  segmentRooms: SegmentRoomRow[];
  sources: SourcePerformanceRow[];
  anomalies: AnomalyAlert[];
  clvPredict: ClvPredictionRow[];
  nextBestActions: NextBestActionRow[];
  highlights: { type: "highlight" | "alert" | "recommend"; text: string }[];
}

interface BookingLite {
  customer_id: string | null;
  starts_at: string;
  total_amount: number | string;
  booking_status: string;
  room_id: string | null;
}

interface RoomLite {
  id: string;
  name: string;
  color: string;
}

const ACTIVE_STATUSES = new Set([
  "confirmed",
  "completed",
  "in_use",
  "pending",
]);

const SOURCE_LABELS: Record<LeadSource | "unknown", string> = {
  line: "LINE",
  walk_in: "Walk-in",
  referral_bni: "BNI",
  facebook: "Facebook",
  google: "Google",
  email: "Email",
  other: "อื่นๆ",
  unknown: "ไม่ระบุ",
};

const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "ทั้งหมด",
  champions: "Champions",
  loyal: "Loyal",
  potential: "Potential Loyalist",
  new: "New",
  promising: "Promising",
  need_attention: "Need Attention",
  about_to_sleep: "About to Sleep",
  at_risk: "At Risk",
  cant_lose: "Can't Lose",
  hibernating: "Hibernating",
  lost: "Lost",
  blacklist: "Blacklist",
};

const SEGMENT_ACTION: Record<SegmentKey, string> = {
  champions: "ส่งของขวัญ + personal call",
  loyal: "เสนอแพ็กเกจ recurring",
  potential: "ส่งโปร 10–15% ดึงให้กลับมา",
  new: "Welcome call + ของขวัญต้อนรับ",
  promising: "Follow-up ทันที ส่งโปรครั้งที่ 2",
  need_attention: "ส่ง email/LINE — สำรวจความพึงพอใจ",
  about_to_sleep: "โปร flash sale ก่อนเงียบ",
  at_risk: "Personal call โดยทีม Sales",
  cant_lose: "พบหน้า + เสนอข้อเสนอพิเศษ",
  hibernating: "Last chance email + 30% off",
  lost: "ไม่ลงทุนเพิ่ม — ใช้ retargeting",
  blacklist: "ไม่ทำการตลาด",
  all: "—",
};

export async function getDeepAnalytics(): Promise<DeepAnalytics> {
  const supabase = createSupabaseAdminClient();

  const [{ data: customersRaw }, { data: bookingsRaw }, { data: roomsRaw }] =
    await Promise.all([
      supabase.from("customers").select("*"),
      supabase
        .from("bookings")
        .select("customer_id, starts_at, total_amount, booking_status, room_id"),
      supabase.from("rooms").select("id, name, color"),
    ]);

  const customers = (customersRaw ?? []) as unknown as Customer[];
  const bookings = (bookingsRaw ?? []) as unknown as BookingLite[];
  const rooms = (roomsRaw ?? []) as unknown as RoomLite[];

  const roomMap = new Map(rooms.map((r) => [r.id, r] as const));
  const now = Date.now();
  const dayMs = 86_400_000;
  const thirtyDaysAgo = now - 30 * dayMs;
  const sixtyDaysAgo = now - 60 * dayMs;
  const ninetyDaysAgo = now - 90 * dayMs;

  // ===== KPIs =====
  const mauNow = customers.filter(
    (c) => c.last_booked_at && new Date(c.last_booked_at).getTime() > thirtyDaysAgo,
  ).length;
  const mauPrev = customers.filter(
    (c) =>
      c.last_booked_at &&
      new Date(c.last_booked_at).getTime() > sixtyDaysAgo &&
      new Date(c.last_booked_at).getTime() <= thirtyDaysAgo,
  ).length;
  const newCount = customers.filter(
    (c) => new Date(c.created_at).getTime() > thirtyDaysAgo,
  ).length;
  const newPrev = customers.filter(
    (c) =>
      new Date(c.created_at).getTime() > sixtyDaysAgo &&
      new Date(c.created_at).getTime() <= thirtyDaysAgo,
  ).length;
  const returning = customers.filter((c) => c.total_bookings > 1).length;
  const returningPct =
    customers.length > 0
      ? Math.round((returning / customers.length) * 100)
      : 0;
  const churn = customers.filter((c) => c.churn_risk === "high").length;
  const churnRate =
    customers.length > 0
      ? Math.round((churn / customers.length) * 100)
      : 0;
  const clv =
    customers.length > 0
      ? Math.round(
          customers.reduce((s, c) => s + Number(c.total_spent), 0) /
            customers.length,
        )
      : 0;
  const mauDelta = mauPrev > 0 ? Math.round(((mauNow - mauPrev) / mauPrev) * 100) : 0;
  const newDelta = newPrev > 0 ? Math.round(((newCount - newPrev) / newPrev) * 100) : 0;

  // Approx churn delta via 90-day dormancy
  const dormantNow = customers.filter(
    (c) =>
      !c.last_booked_at ||
      new Date(c.last_booked_at).getTime() < ninetyDaysAgo,
  ).length;
  const churnDelta = customers.length > 0
    ? Math.round(((dormantNow - churn) / Math.max(1, customers.length)) * 10)
    : 0;

  // ===== RFM 11-segment quadrant =====
  const segmentCount = new Map<SegmentKey, number>();
  for (const c of customers) {
    const seg = classifySegment(c);
    segmentCount.set(seg, (segmentCount.get(seg) ?? 0) + 1);
  }
  const rfmKeys: SegmentKey[] = [
    "champions",
    "loyal",
    "potential",
    "new",
    "promising",
    "need_attention",
    "about_to_sleep",
    "at_risk",
    "cant_lose",
    "hibernating",
    "lost",
  ];
  const rfm: RfmQuadrantPoint[] = rfmKeys.map((k) => ({
    key: k,
    name: SEGMENT_LABELS[k],
    count: segmentCount.get(k) ?? 0,
    x: SEGMENT_QUADRANT[k].x,
    y: SEGMENT_QUADRANT[k].y,
    color: SEGMENT_QUADRANT[k].color,
  }));

  // ===== Retention Curve =====
  // Cohort = customers whose first_booked_at is in the last 365 days.
  // For each Day-N, % who had ≥1 booking within day [N-7, N+7] of first booking.
  const cohortMembers = customers
    .filter(
      (c) =>
        c.first_booked_at &&
        new Date(c.first_booked_at).getTime() > now - 365 * dayMs,
    )
    .map((c) => ({
      id: c.id,
      first: new Date(c.first_booked_at as string).getTime(),
    }));
  const bookingsByCustomer = new Map<string, number[]>();
  for (const b of bookings) {
    if (!b.customer_id) continue;
    if (!ACTIVE_STATUSES.has(b.booking_status)) continue;
    const list = bookingsByCustomer.get(b.customer_id) ?? [];
    list.push(new Date(b.starts_at).getTime());
    bookingsByCustomer.set(b.customer_id, list);
  }
  const dayMarkers = [0, 7, 30, 60, 90, 180, 365];
  const retentionCurve: RetentionCurvePoint[] = dayMarkers.map((d) => {
    if (d === 0) {
      return {
        day: 0,
        label: "Day 0",
        pct: 100,
        active: cohortMembers.length,
        cohort: cohortMembers.length,
      };
    }
    const eligible = cohortMembers.filter((m) => now - m.first >= d * dayMs);
    let active = 0;
    for (const m of eligible) {
      const arr = bookingsByCustomer.get(m.id) ?? [];
      const target = m.first + d * dayMs;
      const window = 7 * dayMs;
      if (arr.some((t) => Math.abs(t - target) <= window || (t > m.first && t <= target))) {
        active++;
      }
    }
    return {
      day: d,
      label: `Day ${d}`,
      pct: eligible.length > 0 ? Math.round((active / eligible.length) * 100) : 0,
      active,
      cohort: eligible.length,
    };
  });

  // ===== Sankey: Active vs Dormant (this month vs last month) =====
  const monthAgoStart = now - 30 * dayMs;
  const twoMonthsAgoStart = now - 60 * dayMs;
  const wasActiveLastMonth = (c: Customer) =>
    !!c.last_booked_at &&
    new Date(c.last_booked_at).getTime() > twoMonthsAgoStart;
  const isActiveThisMonth = (c: Customer) =>
    !!c.last_booked_at && new Date(c.last_booked_at).getTime() > monthAgoStart;
  let stayedActive = 0;
  let becameDormant = 0;
  let becameActive = 0;
  let stayedDormant = 0;
  let newlyAcquired = 0;
  for (const c of customers) {
    const isNew = new Date(c.created_at).getTime() > monthAgoStart;
    const lastActive = wasActiveLastMonth(c);
    const nowActive = isActiveThisMonth(c);
    if (isNew && nowActive) {
      newlyAcquired++;
      continue;
    }
    if (lastActive && nowActive) stayedActive++;
    else if (lastActive && !nowActive) becameDormant++;
    else if (!lastActive && nowActive) becameActive++;
    else stayedDormant++;
  }
  const sankey: SankeyFlow = {
    fromActive: stayedActive + becameDormant,
    fromDormant: becameActive + stayedDormant,
    becameActive,
    becameDormant,
    stayedActive,
    stayedDormant,
    newlyAcquired,
    totalLastMonth: stayedActive + becameDormant,
    totalThisMonth: stayedActive + becameActive + newlyAcquired,
  };

  // ===== Churn Risk Top 10 =====
  const churnRisk: ChurnRiskRow[] = customers
    .filter((c) => !c.blacklisted_at && c.total_bookings > 0)
    .map((c) => {
      const days = c.last_booked_at
        ? Math.floor((now - new Date(c.last_booked_at).getTime()) / dayMs)
        : 999;
      const recencyScore = Math.min(60, days / 2);
      const frequencyPenalty = Math.max(0, 10 - c.total_bookings);
      const churnFlag = c.churn_risk === "high" ? 25 : c.churn_risk === "medium" ? 12 : 0;
      const valueWeight = Math.min(15, Number(c.total_spent) / 5_000);
      const score = Math.min(
        100,
        Math.round(recencyScore + frequencyPenalty + churnFlag + valueWeight),
      );
      const seg = classifySegment(c);
      return {
        id: c.id,
        name: c.display_name,
        daysSinceLast: days,
        totalSpent: Number(c.total_spent),
        totalBookings: c.total_bookings,
        churnScore: score,
        action: SEGMENT_ACTION[seg] ?? "Follow up",
      };
    })
    .sort((a, b) => b.churnScore - a.churnScore)
    .slice(0, 10);

  // ===== Behavior Heatmap =====
  const heatGrid = Array.from({ length: 7 }, () => Array(24).fill(0)) as number[][];
  for (const b of bookings) {
    if (b.booking_status === "cancelled" || b.booking_status === "no_show") continue;
    const d = new Date(b.starts_at);
    heatGrid[d.getDay()][d.getHours()]++;
  }
  const heatmap: HeatmapCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 7; hour <= 21; hour++) {
      heatmap.push({ dow, hour, count: heatGrid[dow][hour] });
    }
  }

  // ===== Popular rooms per segment =====
  const segmentRooms: SegmentRoomRow[] = [];
  const customersBySegment = new Map<SegmentKey, Customer[]>();
  for (const c of customers) {
    const seg = classifySegment(c);
    const arr = customersBySegment.get(seg) ?? [];
    arr.push(c);
    customersBySegment.set(seg, arr);
  }
  for (const segKey of rfmKeys) {
    const segCustomers = customersBySegment.get(segKey) ?? [];
    if (segCustomers.length === 0) continue;
    const segCustomerIds = new Set(segCustomers.map((c) => c.id));
    const roomCount = new Map<string, number>();
    let totalBookings = 0;
    for (const b of bookings) {
      if (!b.customer_id || !segCustomerIds.has(b.customer_id)) continue;
      if (b.booking_status === "cancelled") continue;
      if (!b.room_id) continue;
      roomCount.set(b.room_id, (roomCount.get(b.room_id) ?? 0) + 1);
      totalBookings++;
    }
    let topRoomId: string | null = null;
    let topCount = 0;
    for (const [rid, cnt] of roomCount) {
      if (cnt > topCount) {
        topCount = cnt;
        topRoomId = rid;
      }
    }
    const r = topRoomId ? roomMap.get(topRoomId) : null;
    segmentRooms.push({
      segment: segKey,
      segmentLabel: SEGMENT_LABELS[segKey],
      topRoom: r?.name ?? "—",
      topRoomColor: r?.color ?? "#94A3B8",
      topRoomCount: topCount,
      totalBookings,
    });
  }

  // ===== Source Performance =====
  const sourceAgg = new Map<
    LeadSource | "unknown",
    { customers: number; revenue: number; churn: number; ids: Set<string> }
  >();
  for (const c of customers) {
    const k = (c.source ?? "unknown") as LeadSource | "unknown";
    const cur =
      sourceAgg.get(k) ?? {
        customers: 0,
        revenue: 0,
        churn: 0,
        ids: new Set<string>(),
      };
    cur.customers++;
    cur.revenue += Number(c.total_spent);
    if (c.churn_risk === "high") cur.churn++;
    cur.ids.add(c.id);
    sourceAgg.set(k, cur);
  }
  const bookingCountBySource = new Map<LeadSource | "unknown", number>();
  for (const b of bookings) {
    if (!b.customer_id || b.booking_status === "cancelled") continue;
    const c = customers.find((x) => x.id === b.customer_id);
    const k = (c?.source ?? "unknown") as LeadSource | "unknown";
    bookingCountBySource.set(k, (bookingCountBySource.get(k) ?? 0) + 1);
  }
  const sources: SourcePerformanceRow[] = Array.from(sourceAgg.entries())
    .map(([k, v]) => {
      const acqCost = ACQ_COST[k] ?? 200;
      const totalAcq = acqCost * v.customers;
      const roi = totalAcq > 0 ? Math.round(((v.revenue - totalAcq) / totalAcq) * 100) : 0;
      return {
        source: k,
        label: SOURCE_LABELS[k],
        customers: v.customers,
        bookings: bookingCountBySource.get(k) ?? 0,
        revenue: v.revenue,
        clv: v.customers > 0 ? Math.round(v.revenue / v.customers) : 0,
        churnPct:
          v.customers > 0 ? Math.round((v.churn / v.customers) * 100) : 0,
        roi,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // ===== Anomaly Detection (booking volume z-score on last 28 days) =====
  const dayCount = new Map<string, number>();
  for (const b of bookings) {
    if (b.booking_status === "cancelled") continue;
    const t = new Date(b.starts_at).getTime();
    if (t < now - 28 * dayMs || t > now) continue;
    const key = new Date(b.starts_at).toISOString().slice(0, 10);
    dayCount.set(key, (dayCount.get(key) ?? 0) + 1);
  }
  const dailyVolumes = Array.from(dayCount.values());
  const mean =
    dailyVolumes.length > 0
      ? dailyVolumes.reduce((s, v) => s + v, 0) / dailyVolumes.length
      : 0;
  const sd =
    dailyVolumes.length > 1
      ? Math.sqrt(
          dailyVolumes.reduce((s, v) => s + (v - mean) ** 2, 0) /
            (dailyVolumes.length - 1),
        )
      : 0;
  const anomalies: AnomalyAlert[] = [];
  const sorted = Array.from(dayCount.entries()).sort(([a], [b]) =>
    a < b ? 1 : -1,
  );
  for (const [day, count] of sorted.slice(0, 7)) {
    if (sd === 0) continue;
    const z = (count - mean) / sd;
    if (Math.abs(z) >= 1.8) {
      anomalies.push({
        level: z > 0 ? "info" : "warning",
        title: z > 0 ? `จองพุ่งวัน ${day}` : `จองตกวัน ${day}`,
        detail: `${count} จอง (เฉลี่ย ${Math.round(mean)}) · z=${z.toFixed(1)}σ`,
      });
    }
  }
  if (newCount > 0 && newPrev > 0 && newCount / Math.max(1, newPrev) < 0.6) {
    anomalies.push({
      level: "warning",
      title: "ลูกค้าใหม่ลดลง",
      detail: `30 วันล่าสุด ${newCount} ราย vs เดือนก่อน ${newPrev} ราย (-${Math.round(
        100 - (newCount / newPrev) * 100,
      )}%)`,
    });
  }
  if (churnRate >= 15) {
    anomalies.push({
      level: "danger",
      title: "Churn rate สูงกว่าเกณฑ์",
      detail: `${churnRate}% — มากกว่า benchmark 12%`,
    });
  }
  if (anomalies.length === 0) {
    anomalies.push({
      level: "info",
      title: "ไม่มีความผิดปกติ",
      detail: "ปริมาณจองและอัตราลูกค้าใหม่อยู่ในเกณฑ์ปกติ",
    });
  }

  // ===== CLV Prediction =====
  const clvPredict: ClvPredictionRow[] = rfmKeys
    .map((k) => {
      const list = customersBySegment.get(k) ?? [];
      if (list.length === 0) return null;
      const avg =
        list.reduce((s, c) => s + Number(c.total_spent), 0) / list.length;
      const retention = SEGMENT_RETENTION[k];
      const predicted = Math.round(avg * (1 + retention));
      return {
        segment: k,
        label: SEGMENT_LABELS[k],
        customers: list.length,
        avgClv: Math.round(avg),
        predicted12m: predicted,
        retentionAssumption: Math.round(retention * 100),
      };
    })
    .filter((x): x is ClvPredictionRow => x !== null)
    .sort((a, b) => b.predicted12m - a.predicted12m);

  // ===== Next Best Action =====
  const nextBestActions: NextBestActionRow[] = customers
    .filter((c) => !c.blacklisted_at)
    .map((c) => {
      const seg = classifySegment(c);
      const days = c.last_booked_at
        ? Math.floor((now - new Date(c.last_booked_at).getTime()) / dayMs)
        : 999;
      let urgency: "high" | "med" | "low" = "low";
      let channel: "call" | "line" | "email" | "campaign" = "line";
      if (seg === "champions" || seg === "cant_lose" || seg === "at_risk") {
        urgency = "high";
        channel = "call";
      } else if (seg === "loyal" || seg === "potential" || seg === "need_attention") {
        urgency = "med";
        channel = "line";
      } else if (seg === "about_to_sleep" || seg === "hibernating") {
        urgency = "med";
        channel = "campaign";
      } else {
        channel = c.email ? "email" : "line";
      }
      return {
        id: c.id,
        name: c.display_name,
        segment: seg,
        segmentLabel: SEGMENT_LABELS[seg],
        action: SEGMENT_ACTION[seg],
        channel,
        urgency,
        _score: (urgency === "high" ? 3 : urgency === "med" ? 2 : 1) * 1000 +
          (days > 60 ? 100 : 0) +
          Number(c.total_spent) / 1000,
      } as NextBestActionRow & { _score: number };
    })
    .sort((a, b) => (b as NextBestActionRow & { _score: number })._score -
      (a as NextBestActionRow & { _score: number })._score)
    .slice(0, 12)
    .map(({ id, name, segment, segmentLabel, action, channel, urgency }) => ({
      id,
      name,
      segment,
      segmentLabel,
      action,
      channel,
      urgency,
    }));

  // ===== AI Daily Brief — Highlights / Alerts / Recommendations =====
  const highlights: { type: "highlight" | "alert" | "recommend"; text: string }[] = [];
  const championsCount = segmentCount.get("champions") ?? 0;
  const atRiskCount = (segmentCount.get("at_risk") ?? 0) + (segmentCount.get("cant_lose") ?? 0);
  const aboutToSleep = segmentCount.get("about_to_sleep") ?? 0;
  const lostCount = segmentCount.get("lost") ?? 0;
  const topSource = sources[0];

  if (championsCount > 0) {
    highlights.push({
      type: "highlight",
      text: `Champions ${championsCount} ราย — กลุ่มที่ทำกำไรสูงสุด คงไว้ด้วย personal call ทุกเดือน`,
    });
  }
  if (mauDelta > 0) {
    highlights.push({
      type: "highlight",
      text: `MAU โต ${mauDelta}% จากเดือนก่อน (${mauNow} vs ${mauPrev} ราย)`,
    });
  }
  if (topSource) {
    highlights.push({
      type: "highlight",
      text: `Source ${topSource.label} ทำรายได้สูงสุด ${formatM(topSource.revenue)} · CLV เฉลี่ย ${formatM(topSource.clv)}`,
    });
  }

  if (atRiskCount > 0) {
    highlights.push({
      type: "alert",
      text: `At Risk / Can't Lose ${atRiskCount} ราย — มีลูกค้าใหญ่ที่กำลังจะหาย โทรหาภายในสัปดาห์นี้`,
    });
  }
  if (aboutToSleep >= 3) {
    highlights.push({
      type: "alert",
      text: `About to Sleep ${aboutToSleep} ราย — ส่ง flash sale 15% ภายใน 7 วัน`,
    });
  }
  if (churnRate >= 12) {
    highlights.push({
      type: "alert",
      text: `Churn rate ${churnRate}% สูงกว่าเกณฑ์ 12% — ทบทวน onboarding/follow-up`,
    });
  }

  highlights.push({
    type: "recommend",
    text: `จัด campaign กลุ่ม Potential Loyalist (${
      segmentCount.get("potential") ?? 0
    } ราย) — ลด 10% ดึงให้กลายเป็น Loyal`,
  });
  if (lostCount > 5) {
    highlights.push({
      type: "recommend",
      text: `Lost ${lostCount} ราย — งดงบ marketing ตรง ใช้ retargeting ผ่าน Facebook/Google เท่านั้น`,
    });
  }
  if (sources.length > 1) {
    const bestRoi = [...sources].sort((a, b) => b.roi - a.roi)[0];
    if (bestRoi) {
      highlights.push({
        type: "recommend",
        text: `เพิ่มงบ ${bestRoi.label} (ROI ${bestRoi.roi}%) — channel ที่คุ้มที่สุดในเดือนนี้`,
      });
    }
  }

  return {
    kpis: {
      mau: mauNow,
      newCount,
      returningPct,
      churnRate,
      clv,
      mauDelta,
      newDelta,
      churnDelta,
    },
    rfm,
    retentionCurve,
    sankey,
    churnRisk,
    heatmap,
    segmentRooms,
    sources,
    anomalies,
    clvPredict,
    nextBestActions,
    highlights,
  };
}

const ACQ_COST: Record<LeadSource | "unknown", number> = {
  line: 80,
  walk_in: 0,
  referral_bni: 250,
  facebook: 350,
  google: 420,
  email: 60,
  other: 120,
  unknown: 100,
};

const SEGMENT_RETENTION: Record<SegmentKey, number> = {
  champions: 0.92,
  loyal: 0.78,
  potential: 0.55,
  new: 0.4,
  promising: 0.35,
  need_attention: 0.3,
  about_to_sleep: 0.18,
  at_risk: 0.22,
  cant_lose: 0.4,
  hibernating: 0.08,
  lost: 0.03,
  blacklist: 0,
  all: 0.5,
};

function formatM(n: number) {
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `฿${(n / 1_000).toFixed(0)}K`;
  return `฿${Math.round(n).toLocaleString("th-TH")}`;
}
