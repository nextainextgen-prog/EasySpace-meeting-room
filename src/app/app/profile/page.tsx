import Link from "next/link";
import {
  Calendar,
  Mail,
  Phone,
  Building2,
  LogOut,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { requireAuth } from "@/lib/auth";
import { getCurrentMember } from "@/lib/data/members";
import { getOrgById } from "@/lib/data/organizations";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await requireAuth();
  const ctx = await getCurrentMember();
  const org = ctx ? await getOrgById(ctx.primaryOrgId) : null;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
          โปรไฟล์
        </h1>
        <p className="text-sm text-ink-3 mt-1">ข้อมูลส่วนตัว · การแจ้งเตือน · Calendar sync</p>
      </div>

      <Card>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-pill bg-primary-600 text-white grid place-items-center font-bold text-xl uppercase">
            {(ctx?.member.full_name ?? profile.email).slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold tracking-tight truncate">
              {ctx?.member.full_name ?? profile.email}
            </h2>
            {ctx?.member.position && (
              <p className="text-sm text-ink-3 truncate">
                {ctx.member.position}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {org && (
                <Badge tone="primary">
                  <Building2 size={11} className="mr-1" />
                  {org.short_name ?? org.name}
                </Badge>
              )}
              {ctx?.tier && (
                <Badge tone="muted" className="capitalize">
                  Tier: {ctx.tier}
                </Badge>
              )}
              {profile.two_factor_enabled && (
                <Badge tone="success">
                  <ShieldCheck size={11} className="mr-1" />
                  2FA enabled
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>ข้อมูลติดต่อ</CardTitle>
            <CardSubtitle>ใช้สำหรับ invite + email reminder</CardSubtitle>
          </div>
        </CardHeader>
        <ul className="space-y-3 text-sm">
          <Row icon={Mail} label="Email" value={profile.email} />
          <Row
            icon={Phone}
            label="เบอร์โทร"
            value={ctx?.member.phone ?? "—"}
          />
          {ctx && (
            <Row
              icon={Calendar}
              label="สมาชิกตั้งแต่"
              value={formatDate(ctx.joinedAt)}
            />
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconTile icon={Bell} tone="primary" size="sm" />
            <div>
              <CardTitle>การแจ้งเตือน</CardTitle>
              <CardSubtitle>ตั้งค่าช่องทาง + reminder defaults</CardSubtitle>
            </div>
          </div>
        </CardHeader>
        <ul className="space-y-3 text-sm">
          <ToggleRow
            label="Email reminder"
            description="24 ชม. ก่อน · 15 นาที ก่อนการประชุม"
            on
          />
          <ToggleRow
            label="In-app notification"
            description="แจ้งเตือนผ่านระบบ"
            on
          />
          <ToggleRow
            label="LINE notification"
            description="Phase 2 — รอเชื่อม LINE OA"
            disabled
          />
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconTile icon={Calendar} tone="primary" size="sm" />
            <div>
              <CardTitle>Calendar Sync</CardTitle>
              <CardSubtitle>
                Google Calendar · Outlook · download iCal
              </CardSubtitle>
            </div>
          </div>
        </CardHeader>
        <div className="space-y-3 text-sm">
          <ToggleRow
            label="Google Calendar"
            description="รอ Google OAuth credentials"
            disabled
          />
          <ToggleRow label="Outlook" description="Phase 2" disabled />
          <div className="rounded-input bg-surface-subtle px-4 py-3 text-xs text-ink-3">
            หลังจาก admin ตึกเพิ่ม Google OAuth credentials ใน Vercel env แล้ว ระบบจะเปิด Calendar sync ให้ใช้งานอัตโนมัติ
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ออกจากระบบ</CardTitle>
        </CardHeader>
        <form action="/api/auth/logout" method="post">
          <Button
            type="submit"
            variant="secondary"
            iconLeft={<LogOut size={16} />}
          >
            ออกจากระบบ
          </Button>
        </form>
        <p className="mt-3 text-[11px] text-ink-3">
          <Link href="/" className="text-primary-600">
            กลับสู่หน้าหลัก
          </Link>
        </p>
      </Card>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <Icon size={16} className="text-primary-600" strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium">
          {label}
        </p>
        <p className="text-sm text-ink-1 font-medium truncate">{value}</p>
      </div>
    </li>
  );
}

function ToggleRow({
  label,
  description,
  on,
  disabled,
}: {
  label: string;
  description: string;
  on?: boolean;
  disabled?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium tracking-tight">{label}</p>
        <p className="text-[11px] text-ink-3 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        className={`relative w-11 h-6 rounded-pill transition ${
          disabled
            ? "bg-line cursor-not-allowed"
            : on
              ? "bg-primary-600"
              : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-pill bg-white shadow transition-transform ${
            on && !disabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </li>
  );
}
