import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  customer_consent_required: true,
  cookie_consent_required: true,
  data_retention: {
    customer_inactive_archive_days: 730,
    customer_full_purge_days: 1825,
    booking_archive_after_days: 1095,
  },
  rights: {
    allow_export: true,
    allow_delete: true,
    delete_grace_days: 7,
  },
  dpo_contact: {
    name: "",
    email: "dpo@easyspace.co",
    phone: "",
  },
};

export default async function RetentionPage() {
  const v = await getSettingValue("pdpa");
  return (
    <>
      <AdminTopbar title="Data & PDPA" subtitle="Retention · consent · GDPR rights" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="PDPA / GDPR"
          description="กำหนดนโยบายข้อมูลส่วนบุคคล · retention period · consent · rights ของลูกค้า"
        >
          <Card className="!bg-amber-50/60 !border-amber-200 mb-5">
            <p className="text-sm font-semibold text-amber-900 tracking-tight">
              สิทธิ์ของลูกค้า (PDPA)
            </p>
            <p className="text-xs text-amber-800 mt-1">
              ระบบรองรับ Right to Access · Right to Erasure · Right to Portability ·
              Right to Object · ลูกค้าสามารถขอ Export / Delete ผ่านอีเมล DPO
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge tone="success" className="!text-[10px]">
                ✓ Export endpoint
              </Badge>
              <Badge tone="success" className="!text-[10px]">
                ✓ Customer archived_at
              </Badge>
              <Badge tone="warning" className="!text-[10px]">
                Hard-delete: เร็ว ๆ นี้
              </Badge>
            </div>
          </Card>
          <JsonSettingEditor
            settingKey="pdpa"
            category="security"
            defaultValue={DEFAULT}
            initial={v}
          />
        </SettingsShell>
      </div>
    </>
  );
}
