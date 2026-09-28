"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentProfile, hasRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getPublicRoomConfig, type PublicRoomConfig } from "@/lib/data/public-rooms";
import { easySlipMe, EASYSLIP_MESSAGES } from "@/lib/integrations/easyslip";
import { lineBotInfo } from "@/lib/integrations/line-messaging";
import { maskSecret, getSecret, secretSource, setSecret } from "@/lib/server/secrets";
import { reviewSlip, slipSignedUrl } from "@/lib/server/payment-slips";
import { promptPayPayload } from "@/lib/public-booking/payment";
import { recordAudit } from "./audit";

async function admin() {
  const me = await getCurrentProfile();
  if (!me || !hasRole(me, "admin")) return null;
  return me;
}

// ─── Status for the settings screens ─────────────────────────────────────

export async function getIntegrationStatus() {
  const me = await admin();
  if (!me) return null;
  const [easyslipKey, lineToken, easySource, lineSource] = await Promise.all([
    getSecret("easyslip"),
    getSecret("lineToken"),
    secretSource("easyslip"),
    secretSource("lineToken"),
  ]);
  return {
    easyslip: { masked: maskSecret(easyslipKey), source: easySource },
    line: { masked: maskSecret(lineToken), source: lineSource },
  };
}

export async function testEasySlip() {
  if (!(await admin())) return { ok: false as const, message: "ไม่มีสิทธิ์" };
  const r = await easySlipMe();
  return r.ok
    ? { ok: true as const, data: r.data }
    : { ok: false as const, message: EASYSLIP_MESSAGES[r.message] ?? r.message };
}

export async function testLineMessaging() {
  if (!(await admin())) return { ok: false as const, message: "ไม่มีสิทธิ์" };
  const r = await lineBotInfo();
  return r.ok
    ? { ok: true as const, displayName: r.displayName, basicId: r.basicId }
    : { ok: false as const, message: r.message === "not_configured" ? "ยังไม่ได้ใส่ Channel access token" : r.message };
}

// ─── Secrets ──────────────────────────────────────────────────────────────

export async function saveSecret(name: "easyslip" | "lineToken", value: string) {
  const me = await admin();
  if (!me) return { ok: false as const, error: "ต้องเป็นแอดมินขึ้นไป" };
  const v = String(value ?? "").trim();
  // Refuse a key that doesn't work rather than silently breaking checkout.
  if (v && name === "easyslip") {
    const probe = await easySlipMe(v);
    if (!probe.ok) return { ok: false as const, error: EASYSLIP_MESSAGES[probe.message] ?? "API key ใช้ไม่ได้" };
  }
  if (v && name === "lineToken") {
    const probe = await lineBotInfo(v);
    if (!probe.ok) return { ok: false as const, error: "Channel access token ใช้ไม่ได้" };
  }
  const r = await setSecret(name, v, me.id);
  if (!r.ok) return r;
  await recordAudit({
    action: "settings_updated",
    targetType: "setting",
    changes: { secret: name, cleared: !v },
  });
  revalidatePath("/admin/settings/payment");
  revalidatePath("/admin/settings/line");
  return { ok: true as const, masked: maskSecret(v) };
}

// ─── Public booking config (payment + LINE parts) ────────────────────────

const ConfigPatch = z
  .object({
    payment_enabled: z.boolean(),
    payment_mode: z.enum(["deposit", "full"]),
    deposit_percent: z.number().int().min(1).max(100),
    payment_hold_minutes: z.number().int().min(10).max(7 * 24 * 60),
    liff_id: z.string().trim().max(64).regex(/^$|^\d+-[A-Za-z0-9]+$/, "LIFF ID ต้องมีรูปแบบ 1234567890-AbCdEfGh"),
  })
  .partial();

export async function updatePublicConfig(patch: z.infer<typeof ConfigPatch>) {
  const me = await admin();
  if (!me) return { ok: false as const, error: "ต้องเป็นแอดมินขึ้นไป" };
  const parsed = ConfigPatch.safeParse(patch);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const current = await getPublicRoomConfig();
  const next: PublicRoomConfig = { ...current, ...parsed.data };
  const sb = createSupabaseAdminClient();
  const { error } = await sb.from("settings").upsert(
    {
      key: "public.rooms.config",
      value: next as never,
      category: "public",
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "key" },
  );
  if (error) return { ok: false as const, error: error.message };
  await recordAudit({ action: "settings_updated", targetType: "setting", changes: { key: "public.rooms.config", patch: parsed.data } });
  revalidatePath("/admin/settings/payment");
  revalidatePath("/admin/settings/line");
  revalidatePath("/rooms", "layout");
  return { ok: true as const };
}

export async function savePromptPayId(id: string) {
  const me = await admin();
  if (!me) return { ok: false as const, error: "ต้องเป็นแอดมินขึ้นไป" };
  const digits = String(id ?? "").replace(/\D/g, "");
  if (digits && !promptPayPayload(digits)) {
    return { ok: false as const, error: "ใช้เบอร์มือถือ 10 หลัก หรือเลขประจำตัว/ผู้เสียภาษี 13 หลัก" };
  }
  const sb = createSupabaseAdminClient();
  const { data } = await sb.from("settings").select("value").eq("key", "finance.payment_methods").maybeSingle();
  const value = { ...(((data as { value?: Record<string, unknown> } | null)?.value) ?? {}), promptpay_id: digits };
  const { error } = await sb.from("settings").upsert(
    { key: "finance.payment_methods", value: value as never, category: "finance", updated_by: me.id, updated_at: new Date().toISOString() } as never,
    { onConflict: "key" },
  );
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/settings/payment");
  return { ok: true as const };
}

// ─── Slip review ─────────────────────────────────────────────────────────

export async function getSlipImage(imagePath: string) {
  const me = await getCurrentProfile();
  if (!me || !hasRole(me, "staff")) return null;
  if (!/^[0-9a-f-]{36}\/\d+\.[a-z]{2,5}$/.test(imagePath)) return null;
  return slipSignedUrl(imagePath);
}

export async function reviewSlipAction(slipId: string, decision: "approve" | "reject", note: string) {
  const me = await getCurrentProfile();
  if (!me || !hasRole(me, "accountant")) return { ok: false as const, message: "ต้องเป็นฝ่ายบัญชีหรือแอดมิน" };
  const r = await reviewSlip({
    slipId,
    decision,
    note: String(note ?? "").slice(0, 500),
    actorId: me.id,
    actorName: me.full_name ?? me.email,
  });
  if (r.ok) {
    await recordAudit({
      action: decision === "approve" ? "slip_approved" : "slip_rejected",
      targetType: "payment_slip",
      targetId: slipId,
      reason: note || undefined,
    });
    revalidatePath("/admin/finance/slips");
    revalidatePath("/admin/calendar");
  }
  return r;
}
