"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import type { Role } from "@/lib/types";

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
      // headers() may throw outside request scope (cron, background job)
    }
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
