// Test double for @/lib/data/members — pins the "logged in" member.
export interface MemberContext {
  member: { id: string; full_name: string; email: string; [k: string]: unknown };
  primaryOrgId: string;
  tier: "manager" | "member" | "guest";
  joinedAt: string;
}
export const TEST_MEMBER = {
  id: "0e0d320b-e89d-4071-8ff6-331e12097b6a",
  full_name: "Chanvit Soponsuk",
  email: "chanvit.s@thunder.in.th",
};
let tier: "manager" | "member" | "guest" = "member";
export function __setTier(t: "manager" | "member" | "guest") { tier = t; }
let signedIn = true;
export function __setSignedIn(v: boolean) { signedIn = v; }
export async function getCurrentMember(): Promise<MemberContext | null> {
  if (!signedIn) return null;
  return {
    member: TEST_MEMBER as never,
    primaryOrgId: "591f26fd-4b8f-49a4-b40e-317b6aa03024",
    tier,
    joinedAt: new Date().toISOString(),
  };
}
export async function listMembersByOrg() { return []; }
export async function getMemberById() { return null; }
