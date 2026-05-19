import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  provider: "gemini",
  model: "gemini-2.0-flash-exp",
  api_key_env: "GOOGLE_AI_API_KEY",
  daily_brief: {
    enabled: true,
    schedule_cron: "0 19 * * *",
    timezone: "Asia/Bangkok",
    deliver_to: ["telegram", "in_app"],
  },
  weekly_summary: {
    enabled: true,
    schedule_cron: "0 9 * * 1",
  },
  anomaly_detection: {
    revenue_drop_pct: 30,
    revenue_spike_pct: 100,
    outlier_zscore: 2.5,
  },
  fuzzy_customer_threshold: {
    auto_attach: 0.85,
    confirm_window: [0.7, 0.85],
  },
  rfm: {
    schedule_cron: "30 3 * * *",
    recency_buckets: [7, 30, 60, 90],
    churn_threshold_days: 90,
  },
};

export default async function AiSettingsPage() {
  const v = await getSettingValue("ai.config");
  return (
    <>
      <AdminTopbar
        title="AI Settings"
        subtitle="Gemini · daily brief · anomaly · fuzzy match"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="AI Settings"
          description="ตั้งค่าโมเดล + schedule + threshold ของ AI features ทั้งหมด"
        >
          <JsonSettingEditor
            settingKey="ai.config"
            category="ai"
            defaultValue={DEFAULT}
            initial={v}
            hint="API key เก็บใน env (ไม่อยู่ใน DB) · schedule_cron ตั้งใน vercel.json"
          />
        </SettingsShell>
      </div>
    </>
  );
}
