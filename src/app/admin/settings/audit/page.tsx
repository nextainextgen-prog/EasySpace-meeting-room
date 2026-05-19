import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSettingValue } from "@/lib/actions/settings";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_RETENTION = {
  booking_audit_retention_days: 365,
  global_audit_retention_days: 365,
  notification_retention_days: 90,
  expense_retention_days: 1825,
  customer_activity_retention_days: 730,
  archive_to_blob: false,
};

export default async function AuditPage() {
  const supabase = createSupabaseAdminClient();
  const [retention, recentRes] = await Promise.all([
    getSettingValue("audit.retention"),
    supabase
      .from("audit_log")
      .select(
        "id, created_at, actor_name, action, target_type, target_id, reason",
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const recent = (recentRes.data ?? []) as Array<{
    id: string;
    created_at: string;
    actor_name: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    reason: string | null;
  }>;

  return (
    <>
      <AdminTopbar title="Audit Log" subtitle="ทุก action ของแอดมิน + retention" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Audit Log"
          description="ระบบเก็บ audit ทุก action · ดูตารางได้ที่ /admin/audit-log"
          actions={
            <Link href="/admin/audit-log">
              <Button variant="primary" size="sm" iconRight={<ArrowUpRight size={13} />}>
                เปิดหน้า Audit Log
              </Button>
            </Link>
          }
        >
          <div className="space-y-5">
            <JsonSettingEditor
              settingKey="audit.retention"
              category="security"
              defaultValue={DEFAULT_RETENTION}
              initial={retention}
              hint="ระบบจะลบรายการที่เก่ากว่า retention (ยังไม่มี job ลบอัตโนมัติ — เพิ่มทีหลังได้)"
            />

            <Card>
              <p className="font-semibold tracking-tight mb-3">
                Audit ล่าสุด ({recent.length})
              </p>
              {recent.length === 0 ? (
                <p className="text-sm text-ink-3 text-center py-6">
                  ยังไม่มีรายการ audit
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {recent.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-input bg-surface-subtle/40 text-xs"
                    >
                      <span className="text-ink-3 tabular-nums w-32 shrink-0">
                        {new Date(a.created_at).toLocaleString("th-TH", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <Badge tone="muted" className="!text-[10px]">
                        {a.action}
                      </Badge>
                      <span className="text-ink-3 truncate flex-1">
                        {a.target_type} · {a.actor_name ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </SettingsShell>
      </div>
    </>
  );
}
