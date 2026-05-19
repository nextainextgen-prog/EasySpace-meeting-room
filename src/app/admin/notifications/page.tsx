import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { listNotifications, notificationCountsByCategory } from "@/lib/data";
import { getQuietHours, getTriggerToggles } from "@/lib/actions/notifications";
import { NotificationsBoard } from "./notifications-board";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [items, counts, quiet, toggles] = await Promise.all([
    listNotifications({ limit: 100 }),
    notificationCountsByCategory(),
    getQuietHours(),
    getTriggerToggles(),
  ]);

  return (
    <>
      <AdminTopbar
        title="การแจ้งเตือน"
        subtitle="In-app feed · ดูแลโดย AI · sync กับปฏิทินอัตโนมัติ"
      />

      <div className="p-6 lg:p-8 max-w-[1200px] w-full mx-auto space-y-5">
        <PageHeader
          title="Notifications"
          description="แจ้งเตือนสถานะ + การเงิน + AI insights · Quiet hours, trigger config, Telegram routing"
        />

        <NotificationsBoard
          items={items.map((n) => ({
            id: n.id,
            category: n.category,
            level: n.level,
            title: n.title,
            body: n.body,
            link: n.link,
            related_id: n.related_id,
            read: n.read_at !== null,
            resolved: n.resolved_at !== null,
            createdAt: n.created_at,
          }))}
          counts={counts}
          quietHours={quiet}
          triggerToggles={toggles}
        />
      </div>
    </>
  );
}
