import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { listAdmins, listAuditLog } from "@/lib/data";
import { getAdminMetadata } from "@/lib/actions/admin-users";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { UsersBoard } from "./users-board";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [admins, audit] = await Promise.all([
    listAdmins(),
    listAuditLog(200),
  ]);
  const adminMeta = await getAdminMetadata(admins.map((a) => a.id));

  // Pull all audit columns (ua + ip)
  const supabaseClient = createSupabaseAdminClient();
  const { data: auditFull } = await supabaseClient
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <AdminTopbar
        title="ผู้ใช้งาน"
        subtitle="แอดมินระบบ · Audit Log"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ผู้ใช้งานทั้งหมด"
          description="Role granular · 2FA enforce · IP whitelist · Audit log + Filter + Export"
        />

        <UsersBoard
          admins={admins.map((a) => ({
            id: a.id,
            email: a.email,
            full_name: a.full_name,
            phone: a.phone,
            avatar_url: a.avatar_url,
            role: a.role,
            is_active: a.is_active,
            two_factor_enabled: a.two_factor_enabled,
            last_login_at: a.last_login_at,
            last_login_ip: a.last_login_ip,
          }))}
          adminMeta={adminMeta}
          audit={(auditFull ?? audit) as unknown as Parameters<
            typeof UsersBoard
          >[0]["audit"]}
        />
      </div>
    </>
  );
}
