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
  brand_color: string | null;
  logo_url: string | null;
  email_domains: string[];
  tags: string[];
  notes: string | null;
  /** plan_tier + contact_name + quota live in settings.org.{id}.meta */
  plan_tier: "free" | "basic" | "pro" | "enterprise";
  contact_name: string | null;
  quota_hours_monthly: number;
  quota_unlimited: boolean;
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
      "id, name, short_name, industry, floor, contact_email, contact_phone, status, contract_start, contract_end, brand_color, logo_url, email_domains, tags, notes",
    )
    .order("name");
  type OrgBase = Omit<
    OrganizationRow,
    | "member_count"
    | "active_today"
    | "quota_used_month"
    | "quota_total_month"
    | "plan_tier"
    | "contact_name"
    | "quota_hours_monthly"
    | "quota_unlimited"
  >;
  const orgs = (orgsRaw ?? []) as unknown as OrgBase[];

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return [];

  const [
    { data: memberRows },
    { data: monthBookings },
    { data: todayBookings },
    { data: metaRows },
  ] = await Promise.all([
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
    supabase
      .from("settings")
      .select("key, value")
      .in(
        "key",
        orgIds.map((id) => `org.${id}.meta`),
      ),
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
  const metaByOrg = new Map<string, OrgMeta>();
  for (const row of (metaRows ?? []) as Array<{ key: string; value: unknown }>) {
    const id = row.key.replace(/^org\./, "").replace(/\.meta$/, "");
    metaByOrg.set(id, normalizeOrgMeta(row.value));
  }

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
    const meta = metaByOrg.get(o.id) ?? defaultOrgMeta();
    return {
      ...o,
      email_domains: o.email_domains ?? [],
      tags: o.tags ?? [],
      member_count: memberSet.size,
      active_today: activeTodaySet.size,
      quota_used_month: Math.round(usedHours * 10) / 10,
      quota_total_month: meta.quota_unlimited
        ? Number.POSITIVE_INFINITY
        : meta.quota_hours_monthly,
      plan_tier: meta.plan_tier,
      contact_name: meta.contact_name,
      quota_hours_monthly: meta.quota_hours_monthly,
      quota_unlimited: meta.quota_unlimited,
    };
  });
}

/** Default values for the JSON stored at settings.org.{id}.meta */
interface OrgMeta {
  plan_tier: "free" | "basic" | "pro" | "enterprise";
  contact_name: string | null;
  quota_hours_monthly: number;
  quota_unlimited: boolean;
}

function defaultOrgMeta(): OrgMeta {
  return {
    plan_tier: "basic",
    contact_name: null,
    quota_hours_monthly: 40,
    quota_unlimited: false,
  };
}

function normalizeOrgMeta(raw: unknown): OrgMeta {
  const base = defaultOrgMeta();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const planTier = (
    ["free", "basic", "pro", "enterprise"] as const
  ).includes(r.plan_tier as never)
    ? (r.plan_tier as OrgMeta["plan_tier"])
    : base.plan_tier;
  const quotaHours =
    typeof r.quota_hours_monthly === "number" && r.quota_hours_monthly >= 0
      ? r.quota_hours_monthly
      : base.quota_hours_monthly;
  return {
    plan_tier: planTier,
    contact_name:
      typeof r.contact_name === "string" ? r.contact_name : base.contact_name,
    quota_hours_monthly: quotaHours,
    quota_unlimited: r.quota_unlimited === true,
  };
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
