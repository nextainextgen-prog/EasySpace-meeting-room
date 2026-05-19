import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export interface Member {
  id: string;
  profile_id: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  position: string | null;
  birth_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberOrgLink {
  member_id: string;
  org_id: string;
  department_id: string | null;
  tier: "manager" | "member" | "guest";
  joined_at: string;
  is_active: boolean;
}

export interface MemberContext {
  member: Member;
  primaryOrgId: string;
  tier: "manager" | "member" | "guest";
  joinedAt: string;
}

/**
 * Look up the member record for the current logged-in user.
 * Returns null if the user is signed in but has not yet been linked to a member.
 *
 * Memoized per-request — /app pages + /org-admin layout call this from
 * multiple places per nav; cache() dedupes the lookup.
 */
export const getCurrentMember = cache(
  async (): Promise<MemberContext | null> => {
    const user = await getCurrentUser();
    if (!user || !user.email) return null;

  const admin = createSupabaseAdminClient();
  // Match by profile_id first; fall back to email (some flows create the
  // member row before auth bootstrap fires).
  const { data: byProfile } = await admin
    .from("members")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  let member = (byProfile ?? null) as Member | null;

  if (!member) {
    const { data: byEmail } = await admin
      .from("members")
      .select("*")
      .eq("email", user.email)
      .maybeSingle();
    member = (byEmail ?? null) as Member | null;

    // If found by email but profile_id missing, link them.
    if (member && !member.profile_id) {
      await admin
        .from("members")
        .update({ profile_id: user.id } as never)
        .eq("id", member.id);
      member.profile_id = user.id;
    }
  }

  if (!member) return null;

  const { data: link } = await admin
    .from("member_organizations")
    .select("*")
    .eq("member_id", member.id)
    .eq("is_active", true)
    .order("joined_at")
    .limit(1)
    .maybeSingle();

  if (!link) return null;

  const row = link as unknown as MemberOrgLink;
  return {
    member,
    primaryOrgId: row.org_id,
    tier: row.tier,
    joinedAt: row.joined_at,
  };
});

export async function listMembersByOrg(orgId: string): Promise<Member[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("member_organizations")
    .select("member:members(*)")
    .eq("org_id", orgId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? [])
    .map((r) => (r as unknown as { member: Member }).member)
    .filter(Boolean);
}

export async function getMemberById(id: string): Promise<Member | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as unknown as Member | null;
}
