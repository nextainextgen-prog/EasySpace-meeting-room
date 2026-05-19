import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  default_quota_hours_per_month: 20,
  domain_whitelist: [],
  auto_approve_org: true,
  branded_invite_default: false,
  member_self_register: true,
};

export default async function OrgDefaultsPage() {
  const v = await getSettingValue("org.defaults");
  return (
    <>
      <AdminTopbar title="องค์กรในตึก" subtitle="Quota default · domain whitelist" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="องค์กรในตึก (Defaults)"
          description="ค่าตั้งต้นเวลามีองค์กรใหม่เข้าใช้ระบบ — quota / domain / auto-approve"
        >
          <JsonSettingEditor
            settingKey="org.defaults"
            category="business"
            defaultValue={DEFAULT}
            initial={v}
          />
        </SettingsShell>
      </div>
    </>
  );
}
