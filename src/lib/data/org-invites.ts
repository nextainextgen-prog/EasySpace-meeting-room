import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { InviteLink } from "./invites";

/** Invites belonging to a single org (used by /org-admin). */
export async function listInvitesByOrg(orgId: string): Promise<InviteLink[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("invite_links")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as InviteLink[];
}
