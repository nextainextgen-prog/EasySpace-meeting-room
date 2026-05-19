import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { HolidaysManager } from "./holidays-manager";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export const dynamic = "force-dynamic";

interface HolidayRow {
  id: string;
  occurred_on: string;
  name: string;
  is_annual: boolean;
  policy: "block" | "premium" | "vip_only";
  premium_pct: number | null;
  notes: string | null;
}

export default async function HolidaysSettingsPage() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("holidays")
    .select("*")
    .order("occurred_on");
  const holidays = (data ?? []) as unknown as HolidayRow[];

  return (
    <>
      <AdminTopbar title="วันหยุด" subtitle="นักขัตฤกษ์ + ปิดพิเศษ + นโยบาย" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="วันหยุด"
          description={`${holidays.length} รายการ · ตั้งนโยบาย block / premium / vip_only ต่อวัน`}
        >
          <HolidaysManager holidays={holidays} />
        </SettingsShell>
      </div>
    </>
  );
}
