import { AdminSidebar } from "@/components/admin/sidebar";
import { AuditTracker } from "@/components/admin/audit-tracker";
import { SessionKeeper } from "@/components/session-keeper";
import { requireRole } from "@/lib/auth";
import { countOpenOverrides } from "@/lib/server/overrides";
import { countOpenRequests } from "@/lib/server/quotations";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("staff");
  const [openOverrides, openRequests] = await Promise.all([countOpenOverrides(), countOpenRequests()]);

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
        badges={{ "/admin/overrides": openOverrides, "/admin/requests": openRequests }}
      />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
