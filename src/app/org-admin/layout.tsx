import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  Users,
  Activity,
  Mail,
  ArrowLeft,
} from "lucide-react";
import { getCurrentMember } from "@/lib/data/members";
import { getOrgById } from "@/lib/data/organizations";

export const dynamic = "force-dynamic";

export default async function OrgAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentMember();
  if (!ctx) {
    redirect("/login?error=forbidden");
  }
  if (ctx.tier !== "manager") {
    redirect("/app?error=org_manager_only");
  }
  const org = await getOrgById(ctx.primaryOrgId);

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-card-sm bg-primary-600 text-white grid place-items-center">
            <Building2 size={18} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-ink-3 uppercase tracking-wider">
              Org Admin · {org?.name ?? "องค์กร"}
            </p>
            <h1 className="text-lg font-bold tracking-tight text-ink-1">
              พื้นที่ผู้จัดการองค์กร
            </h1>
          </div>
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-primary-600 px-3 py-2 rounded-pill border border-line"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            กลับ Portal
          </Link>
        </div>

        <nav className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 -mb-px">
          <TabLink href="/org-admin" exact icon={<Activity size={15} />}>
            ภาพรวม
          </TabLink>
          <TabLink href="/org-admin/members" icon={<Users size={15} />}>
            สมาชิก
          </TabLink>
          <TabLink href="/org-admin/invites" icon={<Mail size={15} />}>
            ลิงก์เชิญ
          </TabLink>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}

function TabLink({
  href,
  exact: _exact,
  icon,
  children,
}: {
  href: string;
  exact?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  // server-rendered version: no usePathname; rely on visual hover.
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium tracking-tight text-ink-2 hover:text-primary-600 border-b-2 border-transparent hover:border-primary-300 transition-colors"
    >
      {icon}
      {children}
    </Link>
  );
}
