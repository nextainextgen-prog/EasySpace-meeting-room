import Link from "next/link";
import {
  Building2,
  DoorOpen,
  Coffee,
  Clock,
  CalendarOff,
  Receipt,
  CreditCard,
  Tag,
  Users,
  UserCog,
  ShieldCheck,
  Bell,
  Mail,
  MessageSquare,
  FileText,
  Sparkles,
  Workflow,
  Palette,
  Globe,
  Calendar,
  Database,
  Archive,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";

interface SettingItem {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface Group {
  label: string;
  items: SettingItem[];
}

const groups: Group[] = [
  {
    label: "ธุรกิจหลัก",
    items: [
      { href: "/admin/settings/company", icon: Building2, title: "ข้อมูลบริษัท", desc: "ชื่อ ที่อยู่ Logo Timezone" },
      { href: "/admin/settings/rooms", icon: DoorOpen, title: "ห้องประชุม", desc: "PRIME · MASTER · MEETING + แพ็กเกจ" },
      { href: "/admin/settings/addons", icon: Coffee, title: "บริการเสริม", desc: "ไมโครโฟน · กาแฟ · Flipchart" },
      { href: "/admin/settings/hours", icon: Clock, title: "เวลาทำการ", desc: "รอบเช้า/บ่าย/พิเศษ · slot interval" },
      { href: "/admin/settings/holidays", icon: CalendarOff, title: "วันหยุด", desc: "นักขัตฤกษ์ · ปิดพิเศษ · นโยบาย" },
      { href: "/admin/settings/policy", icon: Receipt, title: "นโยบายการจอง", desc: "มัดจำ · ยกเลิก · no-show" },
    ],
  },
  {
    label: "การเงิน",
    items: [
      { href: "/admin/settings/tax", icon: Receipt, title: "ภาษี", desc: "VAT · e-Tax Invoice · หัก ณ ที่จ่าย" },
      { href: "/admin/settings/payment", icon: CreditCard, title: "การชำระเงิน", desc: "บัญชี · PromptPay · Gateway" },
      { href: "/admin/settings/expense-categories", icon: Tag, title: "หมวดรายจ่าย", desc: "AI tag + recurring" },
      { href: "/admin/settings/goals", icon: Activity, title: "เป้าหมาย/KPI", desc: "เป้ารายเดือน · margin" },
    ],
  },
  {
    label: "ผู้ใช้",
    items: [
      { href: "/admin/settings/admin-users", icon: UserCog, title: "แอดมินระบบ", desc: "บัญชี admin + 2FA" },
      { href: "/admin/settings/roles", icon: Users, title: "Roles & Permissions", desc: "6 บทบาท · custom" },
      { href: "/admin/settings/security", icon: ShieldCheck, title: "ความปลอดภัย", desc: "Password · 2FA · IP whitelist" },
      { href: "/admin/settings/org-defaults", icon: Building2, title: "องค์กรในตึก", desc: "Quota default · domain whitelist" },
    ],
  },
  {
    label: "การแจ้งเตือน",
    items: [
      { href: "/admin/settings/notifications", icon: Bell, title: "Telegram & Routing", desc: "Group ID + topics ต่อ event" },
      { href: "/admin/settings/email", icon: Mail, title: "Email (Resend)", desc: "Domain · sender · quota" },
      { href: "/admin/settings/line", icon: MessageSquare, title: "LINE OA", desc: "Webhook · auto-reply · rich menu" },
      { href: "/admin/settings/templates", icon: FileText, title: "Template Library", desc: "Email + LINE templates" },
    ],
  },
  {
    label: "AI & Automation",
    items: [
      { href: "/admin/settings/ai", icon: Sparkles, title: "AI Settings", desc: "Gemini · daily brief · anomaly" },
      { href: "/admin/settings/workflows", icon: Workflow, title: "Workflow", desc: "Birthday · Outstanding · Welcome" },
      { href: "/admin/settings/cron", icon: Clock, title: "Cron Jobs", desc: "Brief 19:00 · RFM 03:30" },
    ],
  },
  {
    label: "Branding & UX",
    items: [
      { href: "/admin/settings/branding", icon: Palette, title: "Logo & Brand", desc: "Logo · สี · ฟอนต์" },
      { href: "/admin/settings/locale", icon: Globe, title: "ภาษา & ภูมิภาค", desc: "ไทย/EN · timezone · format" },
    ],
  },
  {
    label: "Integration",
    items: [
      { href: "/admin/settings/calendar-sync", icon: Calendar, title: "Calendar Sync", desc: "Google · Outlook · iCal" },
      { href: "/admin/settings/accounting", icon: Database, title: "Accounting Software", desc: "FlowAccount · PEAK · Export" },
      { href: "/admin/settings/webhooks", icon: Activity, title: "Webhooks", desc: "Slack · Zapier · Custom" },
    ],
  },
  {
    label: "ระบบ & ความปลอดภัย",
    items: [
      { href: "/admin/settings/audit", icon: Activity, title: "Audit Log", desc: "เก็บทุก action ของแอดมิน" },
      { href: "/admin/settings/retention", icon: ShieldCheck, title: "Data & PDPA", desc: "Retention · consent · GDPR" },
      { href: "/admin/settings/backup", icon: Archive, title: "Backup", desc: "Auto backup ทุก 6 ชม." },
    ],
  },
];

export default function SettingsPage() {
  return (
    <>
      <AdminTopbar
        title="ตั้งค่าระบบ"
        subtitle="ทุกอย่างที่แอดมินปรับได้ — ไม่ hardcode"
      />

      <div className="p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-8">
        <PageHeader
          title="ตั้งค่าระบบ"
          description="ห้อง · ราคา · เวลา · Telegram · ภาษี · ผู้ใช้ · AI · Branding"
        />

        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
              {g.label}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className="group surface-card !p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="flex items-start gap-3">
                    <IconTile icon={it.icon} tone="primary" />
                    <div className="min-w-0">
                      <p className="font-semibold tracking-tight text-ink-1">
                        {it.title}
                      </p>
                      <p className="text-xs text-ink-3 mt-1">{it.desc}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
