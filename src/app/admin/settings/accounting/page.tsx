import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  flowaccount: {
    enabled: false,
    api_key_env: "FLOWACCOUNT_API_KEY",
    auto_sync: false,
  },
  peak: {
    enabled: false,
    api_key_env: "PEAK_API_KEY",
  },
  express: {
    enabled: false,
    export_path: "/exports/express",
  },
  quickbooks: {
    enabled: false,
    realm_id: "",
  },
  default_export_format: "csv",
  bank_apis: {
    scb_easy: { enabled: false },
    kbiz: { enabled: false },
    bbl: { enabled: false },
  },
};

export default async function AccountingPage() {
  const v = await getSettingValue("integrations.accounting");
  return (
    <>
      <AdminTopbar
        title="Accounting Software"
        subtitle="FlowAccount · PEAK · Express · QuickBooks · Bank API"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Accounting & Bank API"
          description="เชื่อมต่อโปรแกรมบัญชี + Bank API · ตอนนี้ใช้ Export CSV ไปก่อน (ดูที่ /admin/finance → Tax)"
        >
          <JsonSettingEditor
            settingKey="integrations.accounting"
            category="integrations"
            defaultValue={DEFAULT}
            initial={v}
          />
        </SettingsShell>
      </div>
    </>
  );
}
