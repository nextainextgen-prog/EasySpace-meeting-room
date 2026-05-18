import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { PromotionDiscountType, PromotionStatus } from "@/lib/types";

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  discount_type: PromotionDiscountType;
  discount_value: number;
  max_discount: number | null;
  min_order: number | null;
  applicable_room_ids: string[];
  applicable_segments: string[];
  applicable_tags: string[];
  starts_at: string;
  ends_at: string | null;
  total_quota: number | null;
  per_customer_quota: number | null;
  uses_count: number;
  status: PromotionStatus;
  stackable: boolean;
  cover_url: string | null;
  tags: string[];
  created_at: string;
}

export interface PromotionWithMetrics extends Promotion {
  total_saving: number;
  total_revenue: number;
  roi: number;
}

export async function listPromotions(): Promise<PromotionWithMetrics[]> {
  const supabase = createSupabaseAdminClient();
  const [{ data: promosRaw }, { data: usagesRaw }] = await Promise.all([
    supabase
      .from("promotions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("promotion_usages")
      .select(
        "promotion_id, saving, booking:bookings(total_amount)",
      ),
  ]);

  const promos = (promosRaw ?? []) as unknown as Promotion[];
  const usages = (usagesRaw ?? []) as unknown as Array<{
    promotion_id: string;
    saving: number;
    booking: { total_amount: number } | null;
  }>;

  return promos.map((p) => {
    const myUsages = usages.filter((u) => u.promotion_id === p.id);
    const total_saving = myUsages.reduce(
      (sum, u) => sum + Number(u.saving),
      0,
    );
    const total_revenue = myUsages.reduce(
      (sum, u) => sum + Number(u.booking?.total_amount ?? 0),
      0,
    );
    const roi =
      total_saving > 0 ? Number((total_revenue / total_saving).toFixed(2)) : 0;
    return { ...p, total_saving, total_revenue, roi };
  });
}

export async function promotionsSummary() {
  const promos = await listPromotions();
  const active = promos.filter((p) => p.status === "active").length;
  const scheduled = promos.filter((p) => p.status === "scheduled").length;
  const totalSaving = promos.reduce((sum, p) => sum + p.total_saving, 0);
  const totalRevenue = promos.reduce((sum, p) => sum + p.total_revenue, 0);
  return { active, scheduled, totalSaving, totalRevenue };
}
