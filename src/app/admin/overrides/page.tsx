import { AdminTopbar } from "@/components/admin/topbar";
import { requireRole } from "@/lib/auth";
import { listOverrides } from "@/lib/server/overrides";
import { OverridesBoard } from "./overrides-board";

export const dynamic = "force-dynamic";

export default async function OverridesPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  await requireRole("staff");
  const [{ focus }, cases] = await Promise.all([searchParams, listOverrides()]);
  return (
    <>
      <AdminTopbar
        title="คิวทับซ้อน"
        subtitle="ลูกค้าภายนอกจองทับคิวภายใน · ตรวจสอบและจัดการได้ทันที"
      />
      <div className="p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
        <OverridesBoard cases={cases} focus={focus ?? null} />
      </div>
    </>
  );
}
