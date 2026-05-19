import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import {
  listPromotions,
  promotionsSummary,
  listRooms,
  getPromotionsDeep,
} from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { PromotionsShell } from "./promotions-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "โปรโมชั่น — EasySpace" };

export default async function PromotionsPage() {
  const [promos, summary, rooms, profile] = await Promise.all([
    listPromotions(),
    promotionsSummary(),
    listRooms(),
    getCurrentProfile(),
  ]);
  const deep = await getPromotionsDeep(promos);

  const wizardRooms = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
  }));

  return (
    <>
      <AdminTopbar
        title="โปรโมชั่น"
        subtitle="สร้างโปร · Rules Builder · Auto-apply · ROI tracking · Abuse detection"
      />

      <PageHeader
        title="Promotions"
        description="ขับเคลื่อนยอดด้วยส่วนลด · เห็น ROI และ funnel ของทุกแคมเปญ · AI ช่วยแนะนำ"
        className="px-6 lg:px-8 pt-6 max-w-[1600px] w-full mx-auto"
      />

      <PromotionsShell
        initialPromos={promos}
        rooms={wizardRooms}
        summary={summary}
        deep={deep}
        currentUserId={profile?.id ?? null}
      />
    </>
  );
}
