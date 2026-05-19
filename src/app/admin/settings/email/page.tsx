import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  provider: "resend",
  domain: "easyspace.co",
  sender_name: "EasySpace",
  sender_email: "no-reply@easyspace.co",
  monthly_quota: 10000,
  reply_to: "support@easyspace.co",
  api_key_env: "RESEND_API_KEY",
};

export default async function EmailPage() {
  const v = await getSettingValue("email.resend");
  return (
    <>
      <AdminTopbar title="Email (Resend)" subtitle="Domain · sender · quota" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Email (Resend)"
          description="ใช้ส่ง confirmation / reminder / invoice · API key เก็บใน env RESEND_API_KEY"
        >
          <JsonSettingEditor
            settingKey="email.resend"
            category="notifications"
            defaultValue={DEFAULT}
            initial={v}
            hint="ตั้งค่า DKIM/SPF/DMARC ที่ Resend dashboard ก่อนเปิดให้ส่งจริง"
          />
        </SettingsShell>
      </div>
    </>
  );
}
