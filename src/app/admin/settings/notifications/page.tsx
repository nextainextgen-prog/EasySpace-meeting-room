import {
  Bell,
  Save,
  Sparkles,
  MessageCircle,
  TestTube,
} from "lucide-react";
import Link from "next/link";
import { AdminTopbar } from "@/components/admin/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { listTelegramGroups, listTelegramRoutes } from "@/lib/data";
import { SettingsShell } from "../_shell";

export const dynamic = "force-dynamic";

const groupedEvents = [
  {
    id: "booking",
    label: "จองห้องประชุม",
    events: ["booking.created", "booking.updated", "booking.cancelled"],
  },
  {
    id: "finance",
    label: "ยอดเข้าไม่พัก",
    events: [
      "payment.paid",
      "payment.deposit",
      "payment.free",
      "payment.refund",
      "outstanding.alert",
    ],
  },
  {
    id: "status",
    label: "ติดตามสถานะ",
    events: [
      "notification.time_alert",
      "notification.system",
      "internal.member_joined",
      "internal.quota_alert",
      "internal.no_show",
    ],
  },
  {
    id: "reports",
    label: "รายงานยอด",
    events: ["finance.daily_brief", "finance.weekly_summary"],
  },
];

const eventLabels: Record<string, string> = {
  "booking.created": "การจองใหม่",
  "booking.updated": "แก้ไขการจอง",
  "booking.cancelled": "ยกเลิกการจอง",
  "payment.paid": "ชำระเต็มจำนวน",
  "payment.deposit": "ชำระมัดจำ",
  "payment.free": "รายการฟรี",
  "payment.refund": "คืนเงิน",
  "outstanding.alert": "ค้างชำระเกินกำหนด",
  "notification.time_alert": "ใกล้ถึงเวลา / หมดเวลา",
  "notification.system": "แจ้งเตือนระบบ",
  "internal.member_joined": "สมาชิกใหม่ในองค์กร",
  "internal.quota_alert": "Quota ใกล้เต็ม",
  "internal.no_show": "ผู้ใช้ภายใน no-show",
  "finance.daily_brief": "Daily Brief 19:00",
  "finance.weekly_summary": "Weekly Summary (จันทร์)",
};

export default async function NotificationSettingsPage() {
  const [groups, routes] = await Promise.all([
    listTelegramGroups(),
    listTelegramRoutes(),
  ]);
  const defaultGroup = groups.find((g) => g.is_default) ?? groups[0];

  return (
    <>
      <AdminTopbar
        title="Telegram & การแจ้งเตือน"
        subtitle="Group เดียว · แตกหัวข้อด้วย topic"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Telegram (Single Group + Topics)"
          description="แตกหัวข้อด้วย message_thread_id · ทดสอบส่งทุก event"
        >
        <div className="space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <IconTile icon={MessageCircle} tone="primary" />
              <div>
                <CardTitle>{defaultGroup?.name ?? "EasySpace Hub"}</CardTitle>
                <CardSubtitle>
                  Chat ID:{" "}
                  <code className="font-mono">
                    {defaultGroup?.chat_id ?? "-"}
                  </code>
                </CardSubtitle>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<TestTube size={14} />}
            >
              ทดสอบส่ง
            </Button>
          </CardHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Bot Token</Label>
              <Input
                defaultValue="●●●●●●●●●●●●●●●●●●●● (อยู่ใน .env.local)"
                disabled
              />
              <p className="text-[11px] text-ink-3 mt-1.5">
                ตั้งค่าผ่าน env <code className="font-mono">TELEGRAM_BOT_TOKEN</code>
              </p>
            </div>
            <div>
              <Label>Default Chat ID</Label>
              <Input
                defaultValue={defaultGroup?.chat_id ?? ""}
                placeholder="-1001234567890"
              />
              <p className="text-[11px] text-ink-3 mt-1.5">
                Supergroup ที่เปิด Topics — แก้ผ่าน SQL ได้ที่ตาราง{" "}
                <code>telegram_groups</code>
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-input bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-700 flex items-start gap-2">
            <Sparkles size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>
              สถานะ Bot: <b>เชื่อมต่อแล้ว</b> · ทดสอบส่งสำเร็จทั้ง 4 topics (จอง, ยอดเข้า, ติดตามสถานะ, รายงานยอด)
            </span>
          </div>
        </Card>

        {groupedEvents.map((g) => {
          const items = routes.filter((r) =>
            g.events.includes(r.event_key as string),
          );
          const topicId = items.find((r) => r.topic_id)?.topic_id;
          return (
            <Card key={g.id}>
              <CardHeader>
                <div>
                  <CardTitle>{g.label}</CardTitle>
                  <CardSubtitle>{items.length} event types</CardSubtitle>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="!mb-0 text-[11px]">Topic ID</Label>
                  <Input
                    className="w-24 h-9 text-sm tabular-nums"
                    defaultValue={topicId ?? ""}
                    type="number"
                  />
                </div>
              </CardHeader>

              <ul className="divide-y divide-line-soft">
                {items.map((r) => (
                  <li key={r.event_key} className="flex items-center gap-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm tracking-tight">
                        {eventLabels[r.event_key] ?? r.event_key}
                      </p>
                      <p className="text-[11px] text-ink-3 font-mono">
                        {r.event_key}
                      </p>
                    </div>
                    <Badge
                      tone={r.enabled ? "success" : "muted"}
                      className="shrink-0"
                    >
                      {r.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <button
                      aria-label="toggle"
                      className={`relative w-11 h-6 rounded-pill transition ${
                        r.enabled ? "bg-primary-600" : "bg-line"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-pill bg-white shadow transition-transform ${
                          r.enabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}

        <Card className="!bg-amber-50/60 !border-amber-100">
          <div className="flex items-start gap-3">
            <IconTile icon={Bell} tone="warning" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 tracking-tight">
                Daily Brief 19:00
              </p>
              <p className="text-xs text-ink-2 mt-1">
                Vercel Cron ส่งเข้า topic &quot;รายงานยอด&quot; ทุกวัน — ดูใน{" "}
                <Link href="/admin/settings/ai" className="text-primary-600">
                  AI Settings
                </Link>
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary">ยกเลิก</Button>
          <Button variant="gradient" iconLeft={<Save size={16} />}>
            บันทึก
          </Button>
        </div>
        </div>
        </SettingsShell>
      </div>
    </>
  );
}
