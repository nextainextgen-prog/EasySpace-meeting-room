import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  slack: {
    enabled: false,
    webhook_url: "",
    events: ["booking.created", "outstanding.alert"],
  },
  zapier: {
    enabled: false,
    webhook_url: "",
    events: ["booking.created"],
  },
  custom: [
    {
      id: "custom-1",
      name: "Internal CRM",
      url: "",
      events: ["booking.created"],
      headers: {},
      enabled: false,
    },
  ],
};

export default async function WebhooksPage() {
  const v = await getSettingValue("integrations.webhooks");
  return (
    <>
      <AdminTopbar title="Webhooks" subtitle="Slack · Zapier · Custom" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Webhooks"
          description="ส่ง event ออกไปยัง endpoint ภายนอก · รองรับ Slack incoming webhooks + Zapier + custom URL"
        >
          <JsonSettingEditor
            settingKey="integrations.webhooks"
            category="integrations"
            defaultValue={DEFAULT}
            initial={v}
            hint="events = list ของ TelegramEventKey ที่จะส่งไปยัง webhook"
          />
        </SettingsShell>
      </div>
    </>
  );
}
