import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  default_language: "th",
  fallback_language: "en",
  timezone: "Asia/Bangkok",
  date_format: "d MMM yyyy",
  time_format: "HH:mm",
  currency: "THB",
  currency_symbol: "฿",
  number_format: "th-TH",
  buddhist_year: true,
  week_start: 1,
};

export default async function LocalePage() {
  const v = await getSettingValue("locale");
  return (
    <>
      <AdminTopbar title="ภาษา & ภูมิภาค" subtitle="ไทย/EN · timezone · format" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="ภาษา & ภูมิภาค"
          description="ภาษา / timezone / date-time format · ใช้กับทั้ง UI และเอกสาร"
        >
          <JsonSettingEditor
            settingKey="locale"
            category="locale"
            defaultValue={DEFAULT}
            initial={v}
            hint="buddhist_year=true จะแสดงปี พ.ศ. (BE) · week_start: 1=จันทร์, 0=อาทิตย์"
          />
        </SettingsShell>
      </div>
    </>
  );
}
