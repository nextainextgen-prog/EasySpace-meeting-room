import { AdminTopbar } from "@/components/admin/topbar";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { publicBaseUrl } from "@/lib/data/public-rooms";
import { listFeedKeys } from "@/lib/server/booking-feed";
import { SettingsShell } from "../_shell";
import { FeedKeys } from "./feed-keys";

export const dynamic = "force-dynamic";

export default async function BookingFeedPage() {
  await requireRole("admin");
  const [keys, { data: orgs }] = await Promise.all([
    listFeedKeys(),
    createSupabaseAdminClient().from("organizations").select("id, name").order("name"),
  ]);
  return (
    <>
      <AdminTopbar title="รหัสอ่านข้อมูลการจอง" subtitle="บอท · Google Calendar · อ่านอย่างเดียว" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="รหัสอ่านข้อมูลการจอง"
          description="ออกรหัสให้ผู้ดูแลหรือบอทของเขาดึงรายการจองไปใช้เอง เช่น ใส่ใน Google Calendar รหัสนี้อ่านได้อย่างเดียว จองหรือแก้อะไรไม่ได้ จำกัดเฉพาะบริษัทเดียวได้ และยกเลิกได้ทุกเมื่อ"
        >
          <FeedKeys
            base={publicBaseUrl()}
            orgs={(orgs ?? []) as Array<{ id: string; name: string }>}
            keys={keys.map(({ hash: _hash, ...k }) => k)}
          />
        </SettingsShell>
      </div>
    </>
  );
}
