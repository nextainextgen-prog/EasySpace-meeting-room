"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import type { Role } from "@/lib/types";

async function readReq() {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    const h = await headers();
    ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    ua = h.get("user-agent") ?? null;
  } catch {
    // outside request scope
  }
  return { ip, ua };
}

/**
 * Record an audit log entry. Pulls actor info from current session, IP/UA
 * from request headers when called from a Server Action. Safe to call even
 * without an authenticated session (records "system" actor).
 */
export async function recordAudit(input: {
  action: string;
  targetType: string;
  targetId?: string;
  changes?: Record<string, unknown> | null;
  reason?: string;
}) {
  try {
    const supabase = createSupabaseAdminClient();
    const me = await getCurrentProfile();
    const { ip, ua } = await readReq();
    await supabase.from("audit_log").insert({
      actor_id: me?.id ?? null,
      actor_name: me?.full_name ?? me?.email ?? "system",
      actor_role: (me?.role as Role | undefined) ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      changes: input.changes ?? null,
      reason: input.reason ?? null,
      ip_address: ip,
      user_agent: ua,
    } as never);
    revalidatePath("/admin/audit-log");
  } catch {
    // never fail the parent action because of audit failure
  }
}

/** Lightweight page-view logger. Called once per admin pathname on mount
 *  by the AuditTracker client component. Throttled per-session at the
 *  client to avoid flooding the table. */
export async function recordAdminPageView(path: string) {
  if (!path?.startsWith("/admin")) return;
  try {
    const supabase = createSupabaseAdminClient();
    const me = await getCurrentProfile();
    if (!me) return;
    const { ip, ua } = await readReq();
    await supabase.from("audit_log").insert({
      actor_id: me.id,
      actor_name: me.full_name ?? me.email,
      actor_role: me.role,
      action: "page_view",
      target_type: "page",
      target_id: null,
      changes: { path } as never,
      reason: null,
      ip_address: ip,
      user_agent: ua,
    } as never);
  } catch {
    // ignore
  }
}

/** Session-start marker — recorded once per browser session by the tracker. */
export async function recordAdminSessionStart() {
  try {
    const supabase = createSupabaseAdminClient();
    const me = await getCurrentProfile();
    if (!me) return;
    const { ip, ua } = await readReq();
    // Update profile.last_login_at + last_login_ip when we see a fresh session
    await supabase
      .from("profiles")
      .update({
        last_login_at: new Date().toISOString(),
        last_login_ip: ip,
      } as never)
      .eq("id", me.id);
    await supabase.from("audit_log").insert({
      actor_id: me.id,
      actor_name: me.full_name ?? me.email,
      actor_role: me.role,
      action: "login_success",
      target_type: "session",
      target_id: me.id,
      ip_address: ip,
      user_agent: ua,
    } as never);
  } catch {
    // ignore
  }
}
