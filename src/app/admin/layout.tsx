import { AdminSidebar } from "@/components/admin/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-surface-page">
      <AdminSidebar />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
