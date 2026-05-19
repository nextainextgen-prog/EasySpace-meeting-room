"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import type { PromotionDiscountType, PromotionStatus } from "@/lib/types";

const DISCOUNT_TYPES: PromotionDiscountType[] = [
  "percentage",
  "fixed",
  "package_upgrade",
  "free_addon",
  "bogo",
  "voucher",
];

const promotionInput = z.object({
  name: z.string().trim().min(1, "ตั้งชื่อโปรโมชั่น"),
  description: z.string().trim().optional().nullable(),
  code: z.string().trim().optional().nullable(),
  discount_type: z.enum([
    "percentage",
    "fixed",
    "package_upgrade",
    "free_addon",
    "bogo",
    "voucher",
  ]),
  discount_value: z.coerce.number().min(0).default(0),
  max_discount: z.coerce.number().min(0).optional().nullable(),
  min_order: z.coerce.number().min(0).optional().nullable(),
  applicable_room_ids: z.array(z.string().uuid()).default([]),
  applicable_segments: z.array(z.string()).default([]),
  applicable_tags: z.array(z.string()).default([]),
  time_constraint: z.record(z.unknown()).default({}),
  starts_at: z.string().min(1, "ระบุวันที่เริ่ม"),
  ends_at: z.string().optional().nullable(),
  total_quota: z.coerce.number().int().min(0).optional().nullable(),
  per_customer_quota: z.coerce.number().int().min(0).optional().nullable(),
  status: z
    .enum(["draft", "scheduled", "active", "paused", "expired"])
    .default("draft"),
  stackable: z.boolean().default(false),
  cover_url: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export type PromotionInput = z.infer<typeof promotionInput>;

function clean<T extends Record<string, unknown>>(obj: T) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function createPromotion(input: PromotionInput) {
  const parsed = promotionInput.parse(input);
  if (!DISCOUNT_TYPES.includes(parsed.discount_type)) {
    throw new Error("ประเภทส่วนลดไม่ถูกต้อง");
  }

  const profile = await getCurrentProfile();
  const supabase = createSupabaseAdminClient();

  const code = parsed.code?.toUpperCase() ?? null;
  if (code) {
    const { data: dup } = await supabase
      .from("promotions")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (dup) throw new Error(`โค้ด ${code} ถูกใช้งานแล้ว`);
  }

  const payload = clean({
    ...parsed,
    code,
    created_by: profile?.id ?? null,
  });

  const { data, error } = await supabase
    .from("promotions")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/admin/promotions");
  revalidatePath("/admin/bookings");
  return (data as { id: string }).id;
}

export async function updatePromotion(id: string, input: Partial<PromotionInput>) {
  const supabase = createSupabaseAdminClient();
  const payload = clean({
    ...input,
    code: input.code ? input.code.toUpperCase() : undefined,
    updated_at: new Date().toISOString(),
  });
  const { error } = await supabase
    .from("promotions")
    .update(payload as never)
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/promotions");
  revalidatePath("/admin/bookings");
}

export async function setPromotionStatus(id: string, status: PromotionStatus) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("promotions")
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/promotions");
  revalidatePath("/admin/bookings");
}

export async function duplicatePromotion(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data: original } = await supabase
    .from("promotions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!original) throw new Error("ไม่พบโปรโมชั่น");
  const o = original as Record<string, unknown>;

  const baseName = String(o.name ?? "Promotion");
  const insert = {
    ...o,
    name: `${baseName} · Copy`,
    code: null,
    uses_count: 0,
    status: "draft",
  };
  delete (insert as Record<string, unknown>).id;
  delete (insert as Record<string, unknown>).created_at;
  delete (insert as Record<string, unknown>).updated_at;

  const { data, error } = await supabase
    .from("promotions")
    .insert(insert as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/admin/promotions");
  return (data as { id: string }).id;
}

export async function deletePromotion(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/promotions");
  revalidatePath("/admin/bookings");
}

export async function generateUniqueCode(prefix = "PROMO") {
  const supabase = createSupabaseAdminClient();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code =
      `${prefix}-` +
      Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data } = await supabase
      .from("promotions")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

const broadcastInput = z.object({
  promotionId: z.string().uuid(),
  channel: z.enum(["line", "email"]),
  segment: z.string().default("all"),
});

export async function bulkSendPromotion(
  input: z.infer<typeof broadcastInput>,
) {
  // Stub — wires through the existing notifications system when ready.
  const { promotionId, channel, segment } = broadcastInput.parse(input);
  const supabase = createSupabaseAdminClient();
  await supabase.from("customer_activities").insert({
    customer_id: null,
    activity_type: "campaign_sent",
    payload: {
      promotion_id: promotionId,
      channel,
      segment,
      summary: `ส่งโปรโมชั่นทาง ${channel.toUpperCase()} ให้กลุ่ม ${segment}`,
    },
    actor_type: "system",
    source: "promotions",
  } as never);
  revalidatePath("/admin/promotions");
  return { queued: true, channel, segment };
}
