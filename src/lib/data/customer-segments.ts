import type { Customer } from "./customers";

/**
 * 11 standard RFM segments — derived from the spec
 * (Spec หน้า "ข้อมูลลูกค้า + วิเคราะห์ลูกค้า".md §13.2).
 *
 * Segmentation is computed lazily from the cached aggregates on `customers`
 * (`last_booked_at`, `total_bookings`, `total_spent`). The full RFM job runs
 * nightly via cron; this fallback keeps the UI accurate between runs.
 */

export type SegmentKey =
  | "all"
  | "champions"
  | "loyal"
  | "potential"
  | "new"
  | "promising"
  | "need_attention"
  | "about_to_sleep"
  | "at_risk"
  | "cant_lose"
  | "hibernating"
  | "lost"
  | "blacklist";

export interface SegmentDef {
  key: SegmentKey;
  label: string;
  short: string;
  description: string;
  tone:
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "muted";
}

export const SEGMENT_DEFS: SegmentDef[] = [
  { key: "all", label: "ทั้งหมด", short: "ALL", description: "ลูกค้าทุกรายในระบบ", tone: "muted" },
  { key: "champions", label: "Champions", short: "555", description: "ลูกค้าดีที่สุด · จองล่าสุด ยอดสูง บ่อย", tone: "primary" },
  { key: "loyal", label: "Loyal", short: "454", description: "ลูกค้าประจำ · จองสม่ำเสมอ", tone: "primary" },
  { key: "potential", label: "Potential Loyalist", short: "543", description: "มีแววดี เริ่มจองถี่ขึ้น", tone: "success" },
  { key: "new", label: "New Customers", short: "511", description: "ลูกค้าใหม่ 30 วันแรก", tone: "info" },
  { key: "promising", label: "Promising", short: "411", description: "จองครั้งแรกใหญ่ ยังไม่กลับมา", tone: "info" },
  { key: "need_attention", label: "Need Attention", short: "322", description: "ลดลงเรื่อยๆ — ควรติดตาม", tone: "warning" },
  { key: "about_to_sleep", label: "About to Sleep", short: "232", description: "กำลังจะหายไป · ส่งโปรกระตุ้น", tone: "warning" },
  { key: "at_risk", label: "At Risk", short: "213", description: "จองเยอะแต่ห่างนาน · ส่งโปรลด", tone: "danger" },
  { key: "cant_lose", label: "Can't Lose", short: "155", description: "ลูกค้าใหญ่ที่หาย · Personal call", tone: "danger" },
  { key: "hibernating", label: "Hibernating", short: "232", description: "นานแล้วไม่กลับ · Last chance", tone: "muted" },
  { key: "lost", label: "Lost", short: "111", description: "สูญเสียแล้ว — Don't waste budget", tone: "muted" },
  { key: "blacklist", label: "Blacklist", short: "🚫", description: "ลูกค้าที่ถูกแบล็คลิสต์", tone: "danger" },
];

export function rfmScores(c: Pick<Customer, "last_booked_at" | "total_bookings" | "total_spent">) {
  const days = c.last_booked_at
    ? (Date.now() - new Date(c.last_booked_at).getTime()) / 86_400_000
    : 9_999;
  const r = days < 14 ? 5 : days < 30 ? 4 : days < 60 ? 3 : days < 120 ? 2 : 1;
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
  const m =
    Number(c.total_spent) > 50_000
      ? 5
      : Number(c.total_spent) > 20_000
        ? 4
        : Number(c.total_spent) > 8_000
          ? 3
          : Number(c.total_spent) > 2_000
            ? 2
            : 1;
  return { r, f, m, code: `${r}${f}${m}` };
}

export function classifySegment(c: Customer): SegmentKey {
  if (c.blacklisted_at) return "blacklist";
  const { r, f, m } = rfmScores(c);

  if (r >= 5 && f >= 4 && m >= 4) return "champions";
  if (r >= 4 && f >= 4 && m >= 3) return "loyal";
  if (r >= 4 && f >= 2 && m >= 3) return "potential";
  if (r === 5 && f === 1) return "new";
  if (r === 4 && f === 1 && m >= 2) return "promising";
  if (r === 3 && f >= 3 && m >= 3) return "need_attention";
  if (r === 2 && m >= 2) return "about_to_sleep";
  if (r <= 2 && f >= 3) return "at_risk";
  if (r === 1 && f >= 4 && m >= 4) return "cant_lose";
  if (r === 1 && f === 1 && m === 1) return "lost";
  return "hibernating";
}

export function filterBySegment<T extends Customer>(
  customers: T[],
  segment: SegmentKey,
): T[] {
  if (segment === "all") return customers.filter((c) => !c.blacklisted_at);
  return customers.filter((c) => classifySegment(c) === segment);
}

export function segmentCounts(customers: Customer[]): Record<SegmentKey, number> {
  const counts: Record<string, number> = { all: 0 };
  for (const c of customers) {
    if (!c.blacklisted_at) counts.all++;
    const key = classifySegment(c);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts as Record<SegmentKey, number>;
}

/**
 * Customer Health Score (0–100, higher = healthier).
 * Spec §18.10 — used by the 360° header and the at-risk panel.
 */
export function computeHealthScore(c: Customer): {
  score: number;
  tone: "success" | "warning" | "danger";
  label: string;
} {
  let score = 50;
  const { r, f, m } = rfmScores(c);
  score += (r - 3) * 8; // up to ±16
  score += (f - 3) * 5; // up to ±10
  score += (m - 3) * 4; // up to ±8
  if (c.no_show_count > 0) score -= Math.min(c.no_show_count * 4, 20);
  if (c.cancellation_count > 2) score -= Math.min(c.cancellation_count * 2, 12);
  if (c.churn_risk === "high") score -= 15;
  if (c.churn_risk === "medium") score -= 6;
  if (c.blacklisted_at) score = Math.min(score, 20);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const tone = score >= 80 ? "success" : score >= 50 ? "warning" : "danger";
  const label = score >= 80 ? "Healthy" : score >= 50 ? "Watch" : "At risk";
  return { score, tone, label };
}
