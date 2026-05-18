import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentMember } from "@/lib/data/members";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { relativeFromNow } from "@/lib/format";
import { requireAuth } from "@/lib/auth";
import { notificationLevelIcon } from "@/lib/icons";
import type { NotificationLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

interface NotificationRow {
  id: string;
  level: NotificationLevel;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export default async function MemberNotificationsPage() {
  const profile = await requireAuth();
  const ctx = await getCurrentMember();

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("notifications")
    .select(
      "id, level, category, title, body, link, read_at, created_at",
    )
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as NotificationRow[];

  const toneByLevel: Record<NotificationLevel, "info" | "success" | "warning" | "danger"> = {
    info: "info",
    success: "success",
    warning: "warning",
    danger: "danger",
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
          การแจ้งเตือน
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          {ctx
            ? "แจ้งเตือน reminder · ผลตอบรับ invite · quota alert"
            : "เข้าร่วมองค์กรเพื่อรับแจ้งเตือน"}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="ไม่มีการแจ้งเตือน"
          description="เมื่อมีการประชุมใกล้เริ่ม / ทีมตอบรับ invite จะแสดงที่นี่"
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((n) => {
            const Icon = notificationLevelIcon(n.level);
            return (
              <li
                key={n.id}
                className={`flex gap-4 p-4 surface-card transition ${
                  !n.read_at ? "border-l-4 !border-l-primary-600" : ""
                }`}
              >
                <IconTile icon={Icon} tone={toneByLevel[n.level]} size="sm" />
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
                    <Badge tone={toneByLevel[n.level]}>{n.category}</Badge>
                  </div>
                  <p className="text-[11px] text-ink-3 mt-1.5">
                    {relativeFromNow(n.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
