import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  welcome_new_customer: {
    enabled: true,
    send_after_minutes: 5,
    channels: ["email"],
  },
  birthday_greeting: {
    enabled: true,
    send_at: "09:00",
    channels: ["email", "line"],
    coupon_pct: 10,
  },
  inactive_customer_reactivation: {
    enabled: true,
    inactive_days: 90,
    coupon_pct: 15,
  },
  outstanding_followup: {
    enabled: true,
    days: [3, 7, 14, 30],
    channels: ["telegram", "email", "line"],
  },
  post_booking_review: {
    enabled: false,
    send_after_hours: 24,
  },
};

export default async function WorkflowsPage() {
  const v = await getSettingValue("automation.workflows");
  return (
    <>
      <AdminTopbar
        title="Workflow Automation"
        subtitle="Birthday · Outstanding · Reactivation · Welcome"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Workflow Automation"
          description="ระบบ trigger อัตโนมัติเมื่อมีเหตุการณ์เฉพาะ — เลือกช่องทาง + ตั้งเวลาส่ง"
        >
          <JsonSettingEditor
            settingKey="automation.workflows"
            category="automation"
            defaultValue={DEFAULT}
            initial={v}
          />
        </SettingsShell>
      </div>
    </>
  );
}
