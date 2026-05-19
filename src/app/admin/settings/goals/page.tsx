import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT_GOALS = {
  revenue_target_month: 200_000,
  bookings_target_month: 80,
  utilization_target_pct: 65,
  net_margin_target_pct: 40,
  outstanding_max_thb: 50_000,
  alert_when_below_target_pct: 70,
};

export default async function GoalsSettingsPage() {
  const value = await getSettingValue("finance.goals");
  return (
    <>
      <AdminTopbar title="เป้าหมาย / KPI" subtitle="เป้ารายเดือน · margin · utilization" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="เป้าหมาย & KPI"
          description="ใช้แสดงในหน้า Dashboard และเป็น threshold ของ AI insight ห้องว่าง / revenue drop"
        >
          <JsonSettingEditor
            settingKey="finance.goals"
            category="finance"
            defaultValue={DEFAULT_GOALS}
            initial={value}
            hint="alert_when_below_target_pct = % ของเป้าที่ AI จะแจ้งเตือนหากยอดต่ำกว่า"
          />
        </SettingsShell>
      </div>
    </>
  );
}
