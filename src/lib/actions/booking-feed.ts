"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/actions/audit";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { issueFeedKey, revokeFeedKey } from "@/lib/server/booking-feed";

const PATH = "/admin/settings/booking-feed";

const IssueSchema = z.object({
  label: z.string().trim().min(2).max(80),
  scope: z.union([z.literal("all"), z.string().uuid()]),
  showNames: z.boolean(),
});

/** Issue a read-only key. The key is returned once and never stored in clear. */
export async function issueBookingFeedKey(raw: z.input<typeof IssueSchema>) {
  const me = await requireRole("admin");
  const parsed = IssueSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "ใส่ชื่อรหัสอย่างน้อย 2 ตัวอักษร" };
  const input = parsed.data;
  let scopeName = "ทุกห้องในตึก";
  if (input.scope !== "all") {
    const { data } = await createSupabaseAdminClient().from("organizations").select("name").eq("id", input.scope).maybeSingle();
    if (!data) return { ok: false as const, error: "ไม่พบบริษัท" };
    scopeName = (data as { name: string }).name;
  }
  const { token, key } = await issueFeedKey({ ...input, scopeName, createdBy: me.full_name || me.email });
  await recordAudit({
    action: "booking_feed_key_issued",
    targetType: "booking_feed_key",
    targetId: key.id,
    changes: { label: key.label, scope: scopeName, showNames: key.showNames, prefix: key.prefix },
  });
  revalidatePath(PATH);
  return { ok: true as const, token, id: key.id };
}

export async function revokeBookingFeedKey(id: string) {
  await requireRole("admin");
  const key = await revokeFeedKey(String(id));
  if (!key) return { ok: false as const, error: "ไม่พบรหัส หรือถูกยกเลิกไปแล้ว" };
  await recordAudit({ action: "booking_feed_key_revoked", targetType: "booking_feed_key", targetId: key.id, changes: { label: key.label } });
  revalidatePath(PATH);
  return { ok: true as const };
}
