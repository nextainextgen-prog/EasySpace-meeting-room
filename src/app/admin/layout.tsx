import { AdminSidebar } from "@/components/admin/sidebar";
import { requireRole } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("staff");

  return (
    <div className="min-h-screen flex bg-surface-page">
      <AdminSidebar
        profile={{
          name: profile.full_name ?? profile.email,
          email: profile.email,
          role: profile.role,
          avatarUrl: profile.avatar_url,
        }}
      />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
