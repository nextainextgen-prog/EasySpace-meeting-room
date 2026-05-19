import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { listAdmins, listOrganizations, listAuditLog } from "@/lib/data";
import { getAdminMetadata } from "@/lib/actions/admin-users";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { UsersBoard } from "./users-board";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [admins, orgs, audit] = await Promise.all([
    listAdmins(),
    listOrganizations(),
    listAuditLog(200),
  ]);
  const adminMeta = await getAdminMetadata(admins.map((a) => a.id));

  // Fetch the full org rows (logo, brand color, email_domains, tags)
  const supabase = createSupabaseAdminClient();
  const { data: fullOrgs } = await supabase
    .from("organizations")
    .select(
      "id, brand_color, logo_url, email_domains, tags",
    )
    .in(
      "id",
      orgs.map((o) => o.id),
    );
  const fullOrgMap = new Map(
    ((fullOrgs ?? []) as Array<{
      id: string;
      brand_color: string | null;
      logo_url: string | null;
      email_domains: string[];
      tags: string[];
    }>).map((o) => [o.id, o]),
  );

  const orgRows = orgs.map((o) => {
    const extra = fullOrgMap.get(o.id);
    return {
      ...o,
      brand_color: extra?.brand_color ?? null,
      logo_url: extra?.logo_url ?? null,
      email_domains: extra?.email_domains ?? [],
      tags: extra?.tags ?? [],
    };
  });

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
        subtitle="แอดมินระบบ · องค์กรในตึก · Audit Log"
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
          orgs={orgRows}
          audit={(auditFull ?? audit) as unknown as Parameters<
            typeof UsersBoard
          >[0]["audit"]}
        />
      </div>
    </>
  );
}
