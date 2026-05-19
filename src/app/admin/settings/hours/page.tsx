import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT_HOURS = {
  morning: { start: "08:30", end: "12:00", enabled: true },
  afternoon: { start: "13:00", end: "16:30", enabled: true },
  evening: { start: "17:00", end: "22:00", enabled: true, premium_pct: 50 },
  slot_minutes: 30,
  buffer_between_bookings: 15,
  service_days: [1, 2, 3, 4, 5, 6, 0],
  closed_days: [],
};

export default async function HoursSettingsPage() {
  const value = await getSettingValue("business.hours");
  return (
    <>
      <AdminTopbar title="เวลาทำการ" subtitle="3 รอบ · slot · buffer · วันให้บริการ" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="เวลาทำการ"
          description="รอบเช้า / รอบบ่าย / รอบพิเศษ + slot 30 นาที + buffer ระหว่างจอง"
        >
          <JsonSettingEditor
            settingKey="business.hours"
            category="business"
            defaultValue={DEFAULT_HOURS}
            initial={value}
            hint="แก้เวลาเปิด/ปิดของแต่ละรอบ · premium_pct สำหรับรอบพิเศษ · service_days = [จ=1...อา=0]"
          />
        </SettingsShell>
      </div>
    </>
  );
}
