import { requireAuth } from "@/lib/auth";
import { getCurrentMember } from "@/lib/data/members";
import { getOrgById } from "@/lib/data/organizations";
import { SessionKeeper } from "@/components/session-keeper";
import { AppShell } from "./_components/shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAuth({ loginPath: "/member-login" });
  const member = await getCurrentMember();
  const org = member ? await getOrgById(member.primaryOrgId) : null;
  return (
    <AppShell
      profile={{
        name: member?.member.full_name ?? profile.full_name ?? profile.email,
        email: profile.email,
        avatarUrl: profile.avatar_url,
        orgName: org?.name ?? null,
        isManager: member?.tier === "manager",
      }}
    >
      <SessionKeeper />
      {children}
    </AppShell>
  );
}
