import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export interface Organization {
  id: string;
  parent_org_id: string | null;
  name: string;
  short_name: string | null;
  brand_color: string | null;
  logo_url: string | null;
  industry: string | null;
  floor: string | null;
  email_domains: string[];
  contact_phone: string | null;
  contact_email: string | null;
  contract_start: string | null;
  contract_end: string | null;
  status: "active" | "pending" | "suspended" | "expired" | "archived";
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export async function getOrgById(id: string): Promise<Organization | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as unknown as Organization | null;
}

export interface OrgUsage {
  members: number;
  activeMembers: number;
  bookingsThisMonth: number;
  hoursThisMonth: number;
  /** Configured monthly quota in hours; ignored when `quotaUnlimited` is true. */
  quotaHoursMonthly: number;
  quotaPct: number;
  quotaUnlimited: boolean;
}

export async function getOrgUsage(orgId: string): Promise<OrgUsage> {
  const admin = createSupabaseAdminClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ data: members }, { data: bookings }, { data: metaRow }] =
    await Promise.all([
      admin
        .from("member_organizations")
        .select("member_id, is_active, member:members(id, is_active)")
        .eq("org_id", orgId),
      admin
        .from("bookings")
        .select("starts_at, ends_at")
        .eq("org_id", orgId)
        .gte("starts_at", monthStart.toISOString()),
      admin
        .from("settings")
        .select("value")
        .eq("key", `org.${orgId}.meta`)
        .maybeSingle(),
    ]);

  const memberRows = (members ?? []) as Array<{
    is_active: boolean;
    member: { is_active: boolean } | null;
  }>;
  const bookingRows = (bookings ?? []) as Array<{
    starts_at: string;
    ends_at: string;
  }>;

  const hours = bookingRows.reduce((sum, b) => {
    return (
      sum +
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
        3_600_000
    );
  }, 0);

  const meta = ((metaRow as { value?: unknown } | null)?.value ?? {}) as Record<
    string,
    unknown
  >;
  const quotaUnlimited = meta.quota_unlimited === true;
  const quotaHoursMonthly =
    typeof meta.quota_hours_monthly === "number" && meta.quota_hours_monthly >= 0
      ? meta.quota_hours_monthly
      : 40;

  return {
    members: memberRows.length,
    activeMembers: memberRows.filter((r) => r.is_active && r.member?.is_active)
      .length,
    bookingsThisMonth: bookingRows.length,
    hoursThisMonth: Math.round(hours * 10) / 10,
    quotaHoursMonthly,
    quotaUnlimited,
    quotaPct:
      quotaUnlimited
        ? 0
        : quotaHoursMonthly > 0
          ? Math.min(100, Math.round((hours / quotaHoursMonthly) * 100))
          : 0,
  };
}
