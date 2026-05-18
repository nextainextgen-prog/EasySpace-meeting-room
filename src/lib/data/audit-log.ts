import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { Role } from "@/lib/types";

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: Role | null;
  action: string;
  target_type: string;
  target_id: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLogFilter {
  actorId?: string;
  action?: string;
  targetType?: string;
  fromDate?: string; // ISO
  toDate?: string;
  limit?: number;
}

export async function listAuditLog(
  filter: AuditLogFilter = {},
): Promise<AuditLogRow[]> {
  const supabase = createSupabaseAdminClient();
  let q = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 100);

  if (filter.actorId) q = q.eq("actor_id", filter.actorId);
  if (filter.action) q = q.eq("action", filter.action);
  if (filter.targetType) q = q.eq("target_type", filter.targetType);
  if (filter.fromDate) q = q.gte("created_at", filter.fromDate);
  if (filter.toDate) q = q.lte("created_at", filter.toDate);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AuditLogRow[];
}

export async function recordAudit(input: {
  actorId: string | null;
  actorName: string | null;
  actorRole: Role | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  changes?: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("audit_log").insert({
    actor_id: input.actorId,
    actor_name: input.actorName,
    actor_role: input.actorRole,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    changes: input.changes ?? null,
    reason: input.reason ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
  } as never);
}
