import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  google: {
    enabled: false,
    client_id_env: "GOOGLE_CALENDAR_CLIENT_ID",
    client_secret_env: "GOOGLE_CALENDAR_CLIENT_SECRET",
    push_to_calendar: true,
    sync_internal_bookings: true,
  },
  outlook: {
    enabled: false,
    tenant_id: "",
    client_id_env: "MS_CLIENT_ID",
    client_secret_env: "MS_CLIENT_SECRET",
  },
  ical: {
    public_url_enabled: false,
    feed_token: "",
  },
};

export default async function CalendarSyncPage() {
  const v = await getSettingValue("integrations.calendar");
  return (
    <>
      <AdminTopbar title="Calendar Sync" subtitle="Google · Outlook · iCal" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Calendar Sync"
          description="ดัน booking ของระบบเข้าปฏิทินภายนอก + รับ external availability"
        >
          <JsonSettingEditor
            settingKey="integrations.calendar"
            category="integrations"
            defaultValue={DEFAULT}
            initial={v}
            hint="ต้องตั้ง OAuth credentials ที่ env ก่อนเปิดใช้งาน · iCal เปิด public read-only feed"
          />
        </SettingsShell>
      </div>
    </>
  );
}
