import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  password: {
    min_length: 10,
    require_upper: true,
    require_lower: true,
    require_number: true,
    require_symbol: false,
    rotation_days: 180,
    history_block: 5,
  },
  two_factor: {
    enforce_for_roles: ["super_admin", "admin"],
    grace_days: 7,
  },
  session: {
    timeout_minutes: 60,
    idle_minutes: 30,
    remember_me_days: 30,
  },
  lockout: {
    max_failed_attempts: 5,
    cooldown_minutes: 15,
  },
  ip_whitelist: [],
};

export default async function SecurityPage() {
  const v = await getSettingValue("security.policy");
  return (
    <>
      <AdminTopbar title="ความปลอดภัย" subtitle="Password · 2FA · IP whitelist · session" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="ความปลอดภัย"
          description="กำหนด password policy / 2FA enforcement / session timeout / IP whitelist"
        >
          <JsonSettingEditor
            settingKey="security.policy"
            category="security"
            defaultValue={DEFAULT}
            initial={v}
            hint="enforce_for_roles = บทบาทที่บังคับเปิด 2FA · ip_whitelist เป็น array ของ CIDR"
          />
        </SettingsShell>
      </div>
    </>
  );
}
