import { AdminSidebar } from "@/components/admin/sidebar";
import { AuditTracker } from "@/components/admin/audit-tracker";
import { SessionKeeper } from "@/components/session-keeper";
import { requireRole } from "@/lib/auth";
import { countOpenOverrides } from "@/lib/server/overrides";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("staff");
  const openOverrides = await countOpenOverrides();

  return (
    <div className="min-h-screen flex bg-surface-page">
      <AuditTracker />
      <SessionKeeper />
      <AdminSidebar
        profile={{
          name: profile.full_name ?? profile.email,
          email: profile.email,
          role: profile.role,
          avatarUrl: profile.avatar_url,
        }}
        badges={{ "/admin/overrides": openOverrides }}
      />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
