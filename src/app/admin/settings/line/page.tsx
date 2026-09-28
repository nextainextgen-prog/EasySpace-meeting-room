import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";
import { getPublicRoomConfig, publicBaseUrl } from "@/lib/data/public-rooms";
import { getIntegrationStatus } from "@/lib/actions/online-payment";
import { LineMessagingCard } from "./line-messaging-card";

export const dynamic = "force-dynamic";

const DEFAULT = {
  channel_id: "",
  channel_secret_env: "LINE_CHANNEL_SECRET",
  channel_access_token_env: "LINE_CHANNEL_ACCESS_TOKEN",
  webhook_url: "/api/line/webhook",
  auto_reply: {
    enabled: false,
    greeting: "สวัสดีครับ EasySpace 🙏",
    keywords: {
      "ราคา": "ดูราคาห้องได้ที่ https://easyspace.co/rooms",
      "จอง": "จองห้องได้ที่ https://easyspace.co/book",
    },
  },
  rich_menu: {
    enabled: false,
    image_url: "",
  },
};

export default async function LineSettingsPage() {
  const [v, cfg, integrations] = await Promise.all([
    getSettingValue("line.oa"),
    getPublicRoomConfig(),
    getIntegrationStatus(),
  ]);
  return (
    <>
      <AdminTopbar title="LINE OA" subtitle="Webhook · auto-reply · rich menu" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="LINE OA"
          description="เชื่อม Official Account · Webhook + auto-reply keywords · rich menu"
        >
          <div className="space-y-5">
          <LineMessagingCard
            liffId={cfg.liff_id}
            token={integrations?.line ?? { masked: null, source: "none" }}
            baseUrl={publicBaseUrl()}
          />
          <JsonSettingEditor
            settingKey="line.oa"
            category="notifications"
            defaultValue={DEFAULT}
            initial={v}
            hint="ตั้ง webhook URL ใน LINE Developer Console: /api/line/webhook"
          />
          </div>
        </SettingsShell>
      </div>
    </>
  );
}
