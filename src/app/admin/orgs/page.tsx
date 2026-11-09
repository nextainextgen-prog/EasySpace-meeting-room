import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth";
import { listOrganizations } from "@/lib/data";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { OrgsBoard } from "./orgs-board";

export const dynamic = "force-dynamic";

export default async function OrgsPage() {
  await requireRole("admin");
  const orgs = await listOrganizations();

  // Fetch the full org rows (logo, brand color, email_domains, tags)
  const supabase = createSupabaseAdminClient();
  const { data: fullOrgs } = await supabase
    .from("organizations")
    .select("id, brand_color, logo_url, email_domains, tags")
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

  return (
    <>
      <AdminTopbar
        title="องค์กรในตึก"
        subtitle="บริษัทผู้เช่า · โควตาชั่วโมง · ลิงก์เชิญ"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="องค์กรในตึกทั้งหมด"
          description="โควตาชั่วโมงต่อเดือน · โดเมนอีเมล · Invite link · Broadcast · Bulk import CSV"
        />

        <OrgsBoard orgs={orgRows} />
      </div>
    </>
  );
}
