import {
  CheckCircle2,
  Settings,
  Bell as BellIcon,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { listNotifications, notificationCountsByCategory } from "@/lib/data";
import { notificationLevelIcon } from "@/lib/icons";
import { relativeFromNow } from "@/lib/format";
import { NotificationsFilter } from "./filter";

export const dynamic = "force-dynamic";

const toneByLevel: Record<string, "danger" | "warning" | "info" | "success"> = {
  danger: "danger",
  warning: "warning",
  info: "info",
  success: "success",
};

const CATEGORY_LABEL: Record<string, string> = {
  time: "เวลา",
  finance: "การเงิน",
  ai_digest: "AI รายงาน",
  ai_insight: "AI insight",
  system: "ระบบ",
};

export default async function NotificationsPage() {
  const [items, counts] = await Promise.all([
    listNotifications({ limit: 50 }),
    notificationCountsByCategory(),
  ]);

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

        <NotificationsFilter
          counts={counts}
          labels={CATEGORY_LABEL}
          items={items.map((n) => ({
            id: n.id,
            category: n.category,
            level: n.level,
            title: n.title,
            body: n.body,
            read: n.read_at !== null,
            createdAt: n.created_at,
          }))}
          renderItem={(n) => {
            const Icon = notificationLevelIcon(n.level);
            return (
              <li
                key={n.id}
                className={`flex gap-4 p-5 rounded-card border border-line bg-white transition ${
                  !n.read ? "border-l-4 border-l-primary-600" : ""
                }`}
              >
                <IconTile icon={Icon} tone={toneByLevel[n.level]} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold tracking-tight text-ink-1">
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-sm text-ink-2 mt-0.5">{n.body}</p>
                      )}
                    </div>
                    <Badge tone={toneByLevel[n.level]}>
                      {CATEGORY_LABEL[n.category] ?? n.category}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-ink-3 mt-2">
                    {relativeFromNow(n.createdAt)}
                  </p>
                </div>
              </li>
            );
          }}
          empty={
            <Card>
              <EmptyState
                icon={BellIcon}
                title="ยังไม่มีการแจ้งเตือน"
                description="ตั้งค่า Telegram + Cron จะเริ่มสร้าง notification ในระบบให้คุณอัตโนมัติ"
              />
            </Card>
          }
        />
      </div>
    </>
  );
}
