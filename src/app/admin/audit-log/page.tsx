import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { requireRole } from "@/lib/auth";
import { AuditLogBoard } from "./audit-log-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "บันทึกการใช้งาน — EasySpace" };

export default async function AuditLogPage() {
  await requireRole("admin");
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <>
      <AdminTopbar
        title="บันทึกการใช้งาน"
        subtitle="ทุกการเปลี่ยนแปลงสำคัญในระบบ · filter + export"
      />
      <div className="px-6 lg:px-10 py-6 lg:py-8">
        <PageHeader
          title="บันทึกการใช้งาน"
          description={`แสดง ${(data ?? []).length.toLocaleString("th-TH")} รายการล่าสุด · ค้นหา / กรองตามผู้ทำ / action / วันที่ + Export CSV`}
        />
        <AuditLogBoard rows={(data ?? []) as unknown as Parameters<typeof AuditLogBoard>[0]["rows"]} />
      </div>
    </>
  );
}
