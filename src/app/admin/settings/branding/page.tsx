import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  brand_name: "EasySpace",
  tagline: "Meeting rooms · made simple",
  logo: {
    light_url: "",
    dark_url: "",
    favicon_url: "",
  },
  colors: {
    primary_50: "#eef2ff",
    primary_500: "#3b5bdb",
    primary_600: "#2d4ef5",
    primary_700: "#1e3ae8",
  },
  font: {
    primary: "Plus Jakarta Sans",
    thai: "IBM Plex Sans Thai",
  },
  receipt_footer: "ขอบคุณที่ใช้บริการ EasySpace 🙏",
};

export default async function BrandingPage() {
  const v = await getSettingValue("branding");
  return (
    <>
      <AdminTopbar title="Branding & UX" subtitle="Logo · สี · ฟอนต์" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Branding & UX"
          description="แก้ logo / สี / ฟอนต์ — มีผลกับเอกสาร, อีเมล, และหน้า public bookings"
        >
          <JsonSettingEditor
            settingKey="branding"
            category="branding"
            defaultValue={DEFAULT}
            initial={v}
            hint="ใช้ HEX color เท่านั้น · ฟอนต์ใช้ตามที่มีใน next/font (ดูใน layout.tsx)"
          />
        </SettingsShell>
      </div>
    </>
  );
}
