// Test double for @/lib/data/members that keeps the real "act as member"
// behaviour (AsyncLocalStorage) but drops React's cache(), which only exists
// inside a React render. There is no browser session in a script.
import { AsyncLocalStorage } from "node:async_hooks";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

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
export interface MemberContext {
  member: Member;
  primaryOrgId: string;
  tier: "manager" | "member" | "guest";
  joinedAt: string;
}
const acting = new AsyncLocalStorage<MemberContext>();
export function runAsMember<T>(ctx: MemberContext, fn: () => Promise<T>): Promise<T> {
  return acting.run(ctx, fn);
}
export async function getCurrentMember(): Promise<MemberContext | null> {
  return acting.getStore() ?? null;
}
export async function listMembersByOrg() { return []; }
export async function getMemberById(id: string) {
  const { data } = await createSupabaseAdminClient().from("members").select("*").eq("id", id).maybeSingle();
  return (data as Member | null) ?? null;
}
