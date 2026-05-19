import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValues } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT_PROFILE = {
  name: "EasySpace Co., Ltd.",
  legal_name: "บริษัท อีซี่สเปซ จำกัด",
  tax_id: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  logo_url: "",
  timezone: "Asia/Bangkok",
  currency: "THB",
  fiscal_year_start_month: 1,
};

export default async function CompanySettingsPage() {
  const values = await getSettingValues([
    "company.profile",
    "company.name",
    "company.timezone",
    "company.currency",
  ]);

  // Merge legacy single-key entries into the structured profile if not set.
  const profile =
    (values["company.profile"] as Record<string, unknown> | null) ?? {
      ...DEFAULT_PROFILE,
      name: (values["company.name"] as string) ?? DEFAULT_PROFILE.name,
      timezone:
        (values["company.timezone"] as string) ?? DEFAULT_PROFILE.timezone,
      currency:
        (values["company.currency"] as string) ?? DEFAULT_PROFILE.currency,
    };

  return (
    <>
      <AdminTopbar title="ข้อมูลบริษัท" subtitle="Profile · Logo · Timezone · Currency" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="ข้อมูลบริษัท"
          description="ใช้แสดงในเอกสาร / ใบกำกับภาษี / ใบเสร็จ + เป็นค่าตั้งต้นของระบบ"
        >
          <JsonSettingEditor
            settingKey="company.profile"
            category="business"
            defaultValue={DEFAULT_PROFILE}
            initial={profile}
            hint="แก้ฟิลด์ใน JSON แล้วกดบันทึก · timezone / currency มีผลต่อทั้งระบบ"
          />
        </SettingsShell>
      </div>
    </>
  );
}
