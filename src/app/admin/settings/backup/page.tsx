import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT = {
  auto_backup: {
    enabled: true,
    interval_hours: 6,
    keep_last: 30,
    notify_telegram_on_failure: true,
  },
  destination: {
    provider: "supabase",
    bucket: "backups",
  },
  point_in_time_recovery: {
    enabled: true,
    retention_days: 7,
  },
  scheduled_export: {
    enabled: false,
    cron: "0 2 * * *",
    format: "sql",
    deliver_to_email: "",
  },
};

export default async function BackupPage() {
  const v = await getSettingValue("backup.config");
  return (
    <>
      <AdminTopbar title="Backup & Restore" subtitle="Auto backup · PITR · scheduled export" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Backup & Restore"
          description="Supabase รัน automatic backup เป็น default — ตั้งค่าเพิ่มเติมที่นี่"
        >
          <Card className="!bg-emerald-50/60 !border-emerald-200 mb-5">
            <p className="text-sm font-semibold text-emerald-900 tracking-tight">
              Supabase Auto Backup
            </p>
            <p className="text-xs text-emerald-800 mt-1">
              Supabase backup database ทุกวันโดย default · Pro plan รองรับ
              Point-in-Time Recovery 7 วันหลัง · กดดู / restore ที่ Supabase
              Dashboard → Database → Backups
            </p>
            <Badge tone="success" className="!text-[10px] mt-2">
              ✓ Active
            </Badge>
          </Card>
          <JsonSettingEditor
            settingKey="backup.config"
            category="system"
            defaultValue={DEFAULT}
            initial={v}
            hint="scheduled_export ใช้สำหรับ export เป็น .sql/.csv ส่งอีเมลตามรอบ"
          />
        </SettingsShell>
      </div>
    </>
  );
}
