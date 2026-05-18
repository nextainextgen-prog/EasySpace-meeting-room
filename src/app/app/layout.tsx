import { requireAuth } from "@/lib/auth";
import { AppShell } from "./_components/shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAuth();
  return (
    <AppShell
      profile={{
        name: profile.full_name ?? profile.email,
        email: profile.email,
        avatarUrl: profile.avatar_url,
      }}
    >
      {children}
    </AppShell>
  );
}
