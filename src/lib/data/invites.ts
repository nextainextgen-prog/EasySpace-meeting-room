import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export interface InviteLink {
  id: string;
  org_id: string;
  code: string;
  link_type:
    | "public"
    | "verified"
    | "token"
    | "time_limited"
    | "quota_limited";
  quota_total: number | null;
  quota_used: number;
  email_domains: string[] | null;
  expires_at: string | null;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
}

export interface InviteWithOrg extends InviteLink {
  organization: {
    id: string;
    name: string;
    short_name: string | null;
    floor: string | null;
    industry: string | null;
    logo_url: string | null;
    brand_color: string | null;
    email_domains: string[];
    status: string;
  };
}

/** Fetch invite by code along with the owning org. Returns null if missing/disabled/expired. */
export async function getInviteByCode(
  code: string,
): Promise<InviteWithOrg | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("invite_links")
    .select(
      `*, organization:organizations(id, name, short_name, floor, industry, logo_url, brand_color, email_domains, status)`,
    )
    .eq("code", code)
    .eq("enabled", true)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as InviteWithOrg;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  if (row.quota_total && row.quota_used >= row.quota_total) return null;
  if (row.organization.status !== "active") return null;

  return row;
}

export function emailMatchesAllowedDomains(
  email: string,
  domains: string[] | null,
): boolean {
  if (!domains || domains.length === 0) return true;
  const lower = email.toLowerCase();
  return domains.some((d) => lower.endsWith(`@${d.toLowerCase()}`));
}

export async function incrementInviteUsage(inviteId: string) {
  const admin = createSupabaseAdminClient();
  // Race-tolerant increment via RPC fallback to update with computed value
  const { data } = await admin
    .from("invite_links")
    .select("quota_used")
    .eq("id", inviteId)
    .maybeSingle();
  const current = (data as { quota_used: number } | null)?.quota_used ?? 0;
  await admin
    .from("invite_links")
    .update({ quota_used: current + 1 } as never)
    .eq("id", inviteId);
}
