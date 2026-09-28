import { AdminTopbar } from "@/components/admin/topbar";
import { requireRole } from "@/lib/auth";
import { getPublicRoomConfig } from "@/lib/data/public-rooms";
import { listRequests } from "@/lib/server/quotations";
import { RequestsBoard } from "./requests-board";

export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  await requireRole("staff");
  const [{ focus }, rows, cfg] = await Promise.all([searchParams, listRequests(), getPublicRoomConfig()]);
  return (
    <>
      <AdminTopbar title="คำขอจองออนไลน์" subtitle="ตรวจสอบคำขอ · ออกใบเสนอราคา · ติดตามการยืนยันและชำระเงิน" />
      <div className="p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
        <RequestsBoard rows={rows} focus={focus ?? null} pricing={cfg.pricing} />
      </div>
    </>
  );
}
