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

/** Fetch invite by code along with the owning org. Returns null if missing/disabled/expired.
 *
 * Two lookup paths:
 *  1. Explicit `invite_links` row whose `code` matches — used when admin
 *     created a quota/time-limited link.
 *  2. Fallback: an active org whose `short_name` (or first 8 chars of id)
 *     matches — this is what the "Invite" button on /admin/users generates
 *     by default, so a freshly-created org has a working public link even
 *     if no invite_links row was inserted. The synthesized invite has an
 *     empty `id` so `incrementInviteUsage` becomes a no-op for it.
 */
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

  if (data) {
    const row = data as unknown as InviteWithOrg;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    if (row.quota_total && row.quota_used >= row.quota_total) return null;
    if (row.organization.status !== "active") return null;
    return row;
  }

  const { data: orgs } = await admin
    .from("organizations")
    .select(
      "id, name, short_name, floor, industry, logo_url, brand_color, email_domains, status",
    )
    .eq("status", "active");

  const list =
    (orgs as Array<{
      id: string;
      name: string;
      short_name: string | null;
      floor: string | null;
      industry: string | null;
      logo_url: string | null;
      brand_color: string | null;
      email_domains: string[] | null;
      status: string;
    }> | null) ?? [];

  const wanted = code.toLowerCase();
  const org = list.find(
    (o) =>
      (o.short_name && o.short_name.toLowerCase() === wanted) ||
      o.id.slice(0, 8).toLowerCase() === wanted,
  );
  if (!org) return null;

  return {
    id: "",
    org_id: org.id,
    code,
    link_type: "public",
    quota_total: null,
    quota_used: 0,
    email_domains: org.email_domains ?? null,
    expires_at: null,
    enabled: true,
    created_by: null,
    created_at: new Date(0).toISOString(),
    organization: {
      id: org.id,
      name: org.name,
      short_name: org.short_name,
      floor: org.floor,
      industry: org.industry,
      logo_url: org.logo_url,
      brand_color: org.brand_color,
      email_domains: org.email_domains ?? [],
      status: org.status,
    },
  };
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
  // Empty id = synthesized invite (org short_name fallback). No row to bump.
  if (!inviteId) return;
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
