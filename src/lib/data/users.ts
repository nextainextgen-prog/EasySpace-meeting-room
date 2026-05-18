import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { Role } from "@/lib/types";

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: Role;
  is_active: boolean;
  two_factor_enabled: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  short_name: string | null;
  industry: string | null;
  floor: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  contract_start: string | null;
  contract_end: string | null;
  member_count: number;
  active_today: number;
  quota_used_month: number;
  quota_total_month: number;
}

export interface AuditRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: Role | null;
  action: string;
  target_type: string;
  target_id: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
}

const ADMIN_ROLES: Role[] = [
  "super_admin",
  "admin",
  "staff",
  "accountant",
  "marketing",
];

export async function listAdmins(): Promise<AdminProfile[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ADMIN_ROLES)
    .order("role")
    .order("last_login_at", { ascending: false, nullsFirst: false });
  return (data ?? []) as unknown as AdminProfile[];
}

export async function listOrganizations(): Promise<OrganizationRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data: orgsRaw } = await supabase
    .from("organizations")
    .select(
      "id, name, short_name, industry, floor, contact_email, contact_phone, status, contract_start, contract_end",
    )
    .order("name");
  const orgs = (orgsRaw ?? []) as unknown as Array<
    Omit<OrganizationRow, "member_count" | "active_today" | "quota_used_month" | "quota_total_month">
  >;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return [];

  const [{ data: memberRows }, { data: monthBookings }, { data: todayBookings }] =
    await Promise.all([
      supabase
        .from("member_organizations")
        .select("org_id, member_id")
        .in("org_id", orgIds)
        .eq("is_active", true),
      supabase
        .from("bookings")
        .select("org_id, starts_at, ends_at")
        .in("org_id", orgIds)
        .gte("starts_at", monthStart.toISOString()),
      supabase
        .from("bookings")
        .select("org_id, member_id")
        .in("org_id", orgIds)
        .gte("starts_at", today.toISOString())
        .lt("starts_at", tomorrow.toISOString()),
    ]);

  const members = (memberRows ?? []) as Array<{ org_id: string; member_id: string }>;
  const monthB = (monthBookings ?? []) as Array<{
    org_id: string;
    starts_at: string;
    ends_at: string;
  }>;
  const todayB = (todayBookings ?? []) as Array<{
    org_id: string;
    member_id: string | null;
  }>;

  return orgs.map((o) => {
    const memberSet = new Set(
      members.filter((m) => m.org_id === o.id).map((m) => m.member_id),
    );
    const activeTodaySet = new Set(
      todayB
        .filter((b) => b.org_id === o.id && b.member_id)
        .map((b) => b.member_id as string),
    );
    const usedHours = monthB
      .filter((b) => b.org_id === o.id)
      .reduce((sum, b) => {
        return (
          sum +
          (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
            3_600_000
        );
      }, 0);
    return {
      ...o,
      member_count: memberSet.size,
      active_today: activeTodaySet.size,
      quota_used_month: Math.round(usedHours * 10) / 10,
      quota_total_month: memberSet.size * 4, // 4 hrs/member default; Phase 2 will read from settings
    };
  });
}

export async function listAuditLog(limit = 50): Promise<AuditRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as AuditRow[];
}
