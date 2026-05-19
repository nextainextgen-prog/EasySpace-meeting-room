import { FileText } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const TELEGRAM_TEMPLATES = [
  {
    fn: "bookingCreatedTemplate",
    label: "การจองใหม่",
    event: "booking.created",
  },
  {
    fn: "paymentRecordedTemplate",
    label: "บันทึกการชำระเงิน",
    event: "payment.paid / deposit",
  },
  {
    fn: "bookingCancelledTemplate",
    label: "ยกเลิกการจอง",
    event: "booking.cancelled",
  },
  {
    fn: "bookingStartingSoonTemplate",
    label: "ใกล้เริ่ม",
    event: "notification.time_alert (A1/A2)",
  },
  {
    fn: "bookingEndingSoonTemplate",
    label: "ใกล้จบ",
    event: "notification.time_alert (A3/A4)",
  },
  { fn: "bookingNoShowTemplate", label: "No-show", event: "internal.no_show" },
  {
    fn: "outstandingAlertTemplate",
    label: "ค้างชำระ",
    event: "outstanding.alert",
  },
  {
    fn: "paymentDueSoonTemplate",
    label: "ใกล้กำหนดชำระ",
    event: "outstanding.alert (B1)",
  },
  {
    fn: "dailyDigestTemplate",
    label: "Daily Brief",
    event: "finance.daily_brief",
  },
  {
    fn: "memberJoinedTemplate",
    label: "สมาชิกใหม่",
    event: "internal.member_joined",
  },
  {
    fn: "quotaAlertTemplate",
    label: "Quota ใกล้เต็ม",
    event: "internal.quota_alert",
  },
];

const EMAIL_TEMPLATES = [
  { id: "booking_confirmation", label: "ยืนยันการจอง", lang: "th + en" },
  { id: "payment_receipt", label: "ใบเสร็จ", lang: "th + en" },
  { id: "payment_reminder", label: "เตือนชำระเงิน", lang: "th" },
  { id: "invoice", label: "ใบแจ้งหนี้", lang: "th + en" },
  { id: "welcome", label: "ต้อนรับลูกค้าใหม่", lang: "th" },
];

const LINE_TEMPLATES = [
  { id: "booking_confirmation", label: "Flex: ยืนยันการจอง" },
  { id: "payment_received", label: "Flex: ได้รับชำระแล้ว" },
  { id: "outstanding", label: "Flex: ค้างชำระ" },
];

export default function TemplatesPage() {
  return (
    <>
      <AdminTopbar
        title="Template Library"
        subtitle="Telegram · Email · LINE"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="Template Library"
          description="ที่เก็บทุก message template — แก้เนื้อความที่ src/lib/templates/"
        >
          <div className="space-y-4">
            <Card>
              <p className="font-semibold tracking-tight mb-3">
                Telegram ({TELEGRAM_TEMPLATES.length})
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {TELEGRAM_TEMPLATES.map((t) => (
                  <li
                    key={t.fn}
                    className="flex items-center gap-2 p-2 rounded-input bg-surface-subtle/40 border border-line-soft"
                  >
                    <FileText size={12} className="text-ink-3" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium tracking-tight truncate">
                        {t.label}
                      </p>
                      <code className="text-[10px] text-ink-3 font-mono">
                        {t.fn}() · {t.event}
                      </code>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ink-3 mt-3">
                แก้ template ที่{" "}
                <code className="font-mono">src/lib/templates/telegram.ts</code>
              </p>
            </Card>

            <Card>
              <p className="font-semibold tracking-tight mb-3">
                Email ({EMAIL_TEMPLATES.length})
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {EMAIL_TEMPLATES.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 p-2 rounded-input bg-surface-subtle/40 border border-line-soft"
                  >
                    <FileText size={12} className="text-ink-3" />
                    <span className="flex-1 text-sm">{t.label}</span>
                    <Badge tone="muted" className="!text-[10px]">
                      {t.lang}
                    </Badge>
                  </li>
                ))}
              </ul>
              <Badge tone="warning" className="!text-[10px] mt-3">
                เร็ว ๆ นี้ — ตอนนี้ใช้ Resend default + raw HTML
              </Badge>
            </Card>

            <Card>
              <p className="font-semibold tracking-tight mb-3">
                LINE Flex ({LINE_TEMPLATES.length})
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {LINE_TEMPLATES.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 p-2 rounded-input bg-surface-subtle/40 border border-line-soft"
                  >
                    <FileText size={12} className="text-ink-3" />
                    <span className="flex-1 text-sm">{t.label}</span>
                  </li>
                ))}
              </ul>
              <Badge tone="warning" className="!text-[10px] mt-3">
                เร็ว ๆ นี้
              </Badge>
            </Card>
          </div>
        </SettingsShell>
      </div>
    </>
  );
}
