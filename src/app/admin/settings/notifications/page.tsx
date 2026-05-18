"use client";

import { useState } from "react";
import {
  Bell,
  Save,
  Sparkles,
  MessageCircle,
  TestTube,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { telegramRoutes } from "@/lib/mocks";

const topicGroups = [
  { id: "booking", label: "รายการจองห้องประชุม", events: ["booking.created", "booking.updated", "booking.cancelled"] },
  { id: "finance", label: "ยอดเข้าไม่พัก", events: ["payment.paid", "payment.deposit", "payment.free", "payment.refund", "outstanding.alert", "finance.daily_brief"] },
  { id: "status", label: "ติดตามสถานะ", events: ["notification.time_alert", "internal.member_joined", "internal.quota_alert"] },
];

export default function NotificationSettingsPage() {
  const [chatId, setChatId] = useState("-1001234567890");

  return (
    <>
      <AdminTopbar
        title="Telegram & การแจ้งเตือน"
        subtitle="Group เดียว · แตกหัวข้อด้วย topic"
      />

      <div className="p-6 lg:p-8 max-w-[1200px] w-full mx-auto space-y-5">
        <div>
          <Link
            href="/admin/settings"
            className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-primary-600 mb-2"
          >
            <ChevronLeft size={12} />
            กลับสู่ตั้งค่าระบบ
          </Link>
          <PageHeader
            title="Telegram (Single Group + Topics)"
            description="กลุ่ม supergroup เดียว · แตกหัวข้อ (topic) ตามประเภท event · เปิด/ปิดทีละ event"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <IconTile icon={MessageCircle} tone="primary" />
              <div>
                <CardTitle>Group Settings</CardTitle>
                <CardSubtitle>
                  ตั้งค่า Bot Token + Group ID หลัก (ใช้ env)
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
              <Input placeholder="ใส่ Bot Token ของ @BotFather" type="password" />
              <p className="text-[11px] text-ink-3 mt-1.5">
                เก็บใน env: <code className="font-mono">TELEGRAM_BOT_TOKEN</code>
              </p>
            </div>
            <div>
              <Label>Default Chat ID (Supergroup)</Label>
              <Input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
              />
              <p className="text-[11px] text-ink-3 mt-1.5">
                supergroup ที่เปิด Topics (forum) · หา ID ผ่าน @userinfobot
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-input bg-primary-50/60 border border-primary-100 text-xs text-primary-700 flex items-start gap-2">
            <Sparkles size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>
              ระบบใช้ <code className="font-mono">message_thread_id</code>{" "}
              ใน Telegram API เพื่อโพสต์เข้า topic ที่เลือก ไม่ต้องสร้างกลุ่มแยกหลายกลุ่ม
            </span>
          </div>
        </Card>

        {topicGroups.map((g) => (
          <Card key={g.id}>
            <CardHeader>
              <div>
                <CardTitle>{g.label}</CardTitle>
                <CardSubtitle>{g.events.length} event types</CardSubtitle>
              </div>
              <div className="flex items-center gap-2">
                <Label className="!mb-0 text-[11px]">Topic ID</Label>
                <Input
                  className="w-24 h-9 text-sm tabular-nums"
                  placeholder="12"
                  type="number"
                />
              </div>
            </CardHeader>

            <ul className="divide-y divide-line-soft">
              {telegramRoutes
                .filter((r) => g.events.includes(r.key))
                .map((r) => (
                  <li
                    key={r.key}
                    className="flex items-center gap-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm tracking-tight">
                        {r.label}
                      </p>
                      <p className="text-[11px] text-ink-3 font-mono">{r.key}</p>
                    </div>
                    <Badge
                      tone={r.enabled ? "success" : "muted"}
                      className="shrink-0"
                    >
                      {r.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <button
                      role="switch"
                      aria-checked={r.enabled}
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
        ))}

        <Card className="!bg-amber-50/60 !border-amber-100">
          <div className="flex items-start gap-3">
            <IconTile icon={Bell} tone="warning" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 tracking-tight">
                Daily Brief 19:00
              </p>
              <p className="text-xs text-ink-2 mt-1">
                AI สรุปการเงินอัตโนมัติ — ส่งเข้า topic &quot;ยอดเข้าไม่พัก&quot; ทุกวัน · ปรับเวลา/รูปแบบใน
                <Link href="/admin/settings/ai" className="text-primary-600 ml-1">
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
    </>
  );
}
