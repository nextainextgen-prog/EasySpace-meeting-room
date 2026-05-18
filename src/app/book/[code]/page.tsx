import Link from "next/link";
import {
  Calendar,
  Building2,
  Clock,
  Users,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getInviteByCode } from "@/lib/data/invites";
import { getOrgUsage } from "@/lib/data/organizations";
import { listRooms } from "@/lib/data/rooms";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function InviteLandingPage({ params }: PageProps) {
  const { code } = await params;
  const invite = await getInviteByCode(code);

  // Invalid / expired / disabled invite — show error card
  if (!invite) {
    return (
      <InviteShell>
        <Card>
          <div className="text-center">
            <div className="w-12 h-12 rounded-pill bg-red-50 text-red-600 grid place-items-center mx-auto">
              <AlertCircle size={20} strokeWidth={1.75} />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tighter">
              ลิงก์เชิญไม่ถูกต้อง
            </h1>
            <p className="mt-2 text-sm text-ink-3">
              ลิงก์อาจหมดอายุ ถูกปิดใช้งาน หรือเต็มแล้ว — ติดต่อ Org Admin
              เพื่อขอลิงก์ใหม่
            </p>
            <p className="mt-4 text-[11px] text-ink-3">
              Invite Code: <code className="font-mono">{code}</code>
            </p>
            <Link
              href="/"
              className="block mt-5 text-sm text-primary-600 font-medium"
            >
              กลับสู่หน้าหลัก
            </Link>
          </div>
        </Card>
      </InviteShell>
    );
  }

  const [usage, rooms] = await Promise.all([
    getOrgUsage(invite.organization.id),
    listRooms(),
  ]);

  return (
    <InviteShell brandColor={invite.organization.brand_color ?? undefined}>
      <Card>
        <div className="text-center">
          {invite.organization.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={invite.organization.logo_url}
              alt={invite.organization.name}
              className="w-16 h-16 mx-auto rounded-card-sm object-cover"
            />
          ) : (
            <Badge tone="primary" className="mb-3">
              <Building2 size={11} className="mr-1" />
              {invite.organization.name}
            </Badge>
          )}
          <h1 className="text-2xl font-bold tracking-tighter mt-3">
            ยินดีต้อนรับสู่ EasySpace
          </h1>
          <p className="text-sm text-ink-3 mt-2">
            ระบบจองห้องประชุมสำหรับพนักงาน{" "}
            <b>{invite.organization.name}</b>
            {invite.organization.floor ? ` (ชั้น ${invite.organization.floor})` : ""}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Stat
            icon={Clock}
            label="Quota"
            value={`${usage.quotaHoursMonthly} ชม./เดือน`}
          />
          <Stat
            icon={Users}
            label="สมาชิก"
            value={`${usage.members} คน`}
          />
          <Stat
            icon={Calendar}
            label="ห้อง"
            value={`${rooms.length} ห้อง`}
          />
        </div>

        {invite.organization.email_domains.length > 0 && (
          <div className="mt-5 rounded-input bg-amber-50/60 border border-amber-100 px-3 py-2.5 text-xs text-amber-900">
            <span className="font-semibold">เงื่อนไข Email:</span>{" "}
            ใช้ได้เฉพาะอีเมล{" "}
            {invite.organization.email_domains
              .map((d) => `@${d}`)
              .join(" / ")}
          </div>
        )}

        <div className="mt-6 space-y-2">
          <Link
            href={{
              pathname: `/book/${code}/register`,
            }}
          >
            <Button
              variant="gradient"
              size="lg"
              className="w-full"
              iconRight={<ArrowRight size={16} />}
            >
              เริ่มใช้งาน
            </Button>
          </Link>
          <p className="text-center text-xs text-ink-3">
            มีบัญชีอยู่แล้ว?{" "}
            <Link
              href={`/login?next=/app`}
              className="text-primary-600 font-medium"
            >
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>

        <div className="mt-5 pt-5 border-t border-line-soft text-center">
          <p className="text-[11px] text-ink-3">
            Invite Code: <code className="font-mono">{code}</code>
            {invite.quota_total
              ? ` · เหลืออีก ${invite.quota_total - invite.quota_used} ที่นั่ง`
              : ""}
          </p>
        </div>
      </Card>
    </InviteShell>
  );
}

function InviteShell({
  children,
  brandColor,
}: {
  children: React.ReactNode;
  brandColor?: string;
}) {
  return (
    <div
      className="min-h-screen bg-surface-page flex items-center justify-center p-6"
      style={brandColor ? { background: `${brandColor}10` } : undefined}
    >
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 rounded-card-sm bg-primary-600 text-white grid place-items-center shadow-hero">
            <Calendar size={22} strokeWidth={2} />
          </div>
        </div>
        {children}
        <p className="text-center text-[11px] text-ink-3 mt-6">
          Powered by EasySpace · ระบบจองห้องประชุม
        </p>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 rounded-card-sm surface-subtle">
      <Icon
        size={16}
        className="mx-auto text-primary-600 mb-1.5"
        strokeWidth={1.75}
      />
      <p className="text-[11px] text-ink-3">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
