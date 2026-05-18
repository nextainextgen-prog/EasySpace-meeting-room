import { Bell, CheckCircle2, AlertCircle, Sparkles, Filter, Settings } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { notifications } from "@/lib/mocks";
import { notificationLevelIcon } from "@/lib/icons";
import { relativeFromNow } from "@/lib/format";

const filters = [
  { key: "all", label: "ทั้งหมด", count: notifications.length },
  { key: "time", label: "เวลา", count: 1 },
  { key: "finance", label: "การเงิน", count: 2 },
  { key: "ai_digest", label: "AI รายงาน", count: 1 },
  { key: "system", label: "ระบบ", count: 0 },
];

const toneByLevel: Record<string, "danger" | "warning" | "info" | "success"> = {
  danger: "danger",
  warning: "warning",
  info: "info",
  success: "success",
};

export default function NotificationsPage() {
  return (
    <>
      <AdminTopbar
        title="การแจ้งเตือน"
        subtitle="In-app feed · ดูแลโดย AI · sync กับปฏิทินอัตโนมัติ"
        actions={
          <Button variant="secondary" iconLeft={<Settings size={16} />}>
            ตั้งค่า
          </Button>
        }
      />

      <div className="p-6 lg:p-8 max-w-[1200px] w-full mx-auto space-y-5">
        <PageHeader
          title="Notifications"
          description="แจ้งเตือนสถานะ + การเงิน + AI insights"
          actions={
            <Button variant="ghost" iconLeft={<CheckCircle2 size={16} />}>
              อ่านทั้งหมด
            </Button>
          }
        />

        <Card className="!p-3">
          <div className="flex flex-wrap gap-1">
            {filters.map((f, i) => (
              <button
                key={f.key}
                className={`px-4 py-2 rounded-pill text-sm font-medium transition ${
                  i === 0
                    ? "bg-primary-600 text-white"
                    : "text-ink-2 hover:bg-surface-subtle"
                }`}
              >
                {f.label}
                <span className="ml-2 text-[11px] opacity-80 tabular-nums">
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <ul className="space-y-3">
          {notifications.map((n) => {
            const Icon = notificationLevelIcon(n.level);
            return (
              <li
                key={n.id}
                className={`flex gap-4 p-5 surface-card transition ${
                  !n.read ? "border-l-4 !border-l-primary-600" : ""
                }`}
              >
                <IconTile icon={Icon} tone={toneByLevel[n.level]} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold tracking-tight text-ink-1">
                        {n.title}
                      </p>
                      <p className="text-sm text-ink-2 mt-0.5">{n.body}</p>
                    </div>
                    <Badge tone={toneByLevel[n.level]}>
                      {n.category}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-ink-3 mt-2">
                    {relativeFromNow(n.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
