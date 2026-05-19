import Link from "next/link";
import {
  Calendar,
  Building2,
  Clock,
  Users,
  ArrowRight,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <BrandCard>
          <div className="text-center px-1">
            <div className="w-14 h-14 rounded-pill bg-red-50 text-red-600 grid place-items-center mx-auto">
              <AlertCircle size={22} strokeWidth={1.75} />
            </div>
            <h1 className="mt-5 text-xl font-bold tracking-tighter">
              ลิงก์เชิญไม่ถูกต้อง
            </h1>
            <p className="mt-2 text-sm text-ink-3 leading-relaxed">
              ลิงก์อาจหมดอายุ ถูกปิดใช้งาน หรือเต็มแล้ว — ติดต่อ Org Admin
              เพื่อขอลิงก์ใหม่
            </p>
            <p className="mt-5 text-[11px] text-ink-3">
              Invite Code: <code className="font-mono">{code}</code>
            </p>
            <Link
              href="/"
              className="block mt-5 text-sm text-primary-600 font-medium hover:underline"
            >
              กลับสู่หน้าหลัก
            </Link>
          </div>
        </BrandCard>
      </InviteShell>
    );
  }

  const [usage, rooms] = await Promise.all([
    getOrgUsage(invite.organization.id),
    listRooms(),
  ]);

  const brand = invite.organization.brand_color ?? "#3b5bdb";

  return (
    <InviteShell brandColor={brand}>
      <BrandCard accentColor={brand}>
        {/* ── Org identity ───────────────────────────────── */}
        <div className="flex flex-col items-center text-center">
          {invite.organization.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={invite.organization.logo_url}
              alt={invite.organization.name}
              className="w-16 h-16 rounded-card object-cover ring-4 ring-white shadow-card"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-card grid place-items-center text-white shadow-card ring-4 ring-white"
              style={{ background: brand }}
            >
              <Building2 size={26} strokeWidth={1.75} />
            </div>
          )}
          <span className="mt-3 text-[11px] uppercase tracking-[0.18em] text-ink-3 font-semibold">
            {invite.organization.name}
          </span>
          <h1 className="mt-2 text-[26px] sm:text-[28px] font-bold tracking-tighter leading-tight">
            ยินดีต้อนรับสู่{" "}
            <span className="text-primary-600">EasySpace</span>
          </h1>
          <p className="mt-2 text-sm text-ink-3 leading-relaxed max-w-xs">
            ระบบจองห้องประชุมสำหรับพนักงาน{" "}
            <span className="font-semibold text-ink-2">
              {invite.organization.name}
            </span>
            {invite.organization.floor &&
              ` · ชั้น ${invite.organization.floor}`}
          </p>
        </div>

        {/* ── Stats ───────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-3 gap-2.5">
          <Stat
            icon={Clock}
            label="Quota"
            value={`${usage.quotaHoursMonthly}`}
            unit="ชม./เดือน"
          />
          <Stat
            icon={Users}
            label="สมาชิก"
            value={`${usage.members}`}
            unit="คน"
          />
          <Stat
            icon={Calendar}
            label="ห้อง"
            value={`${rooms.length}`}
            unit="ห้อง"
          />
        </div>

        {invite.organization.email_domains.length > 0 && (
          <div className="mt-5 rounded-input bg-amber-50/60 border border-amber-100 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2">
            <Sparkles size={13} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">เงื่อนไข Email:</span>{" "}
              ใช้ได้เฉพาะ{" "}
              {invite.organization.email_domains
                .map((d) => `@${d}`)
                .join(" / ")}
            </span>
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────── */}
        <div className="mt-6 space-y-2.5">
          <Link
            href={`/member-login?invite=${encodeURIComponent(code)}`}
            className="block"
          >
            <Button
              variant="gradient"
              size="lg"
              className="w-full !h-12"
              iconRight={<ArrowRight size={16} />}
            >
              เข้าสู่ระบบด้วย Google
            </Button>
          </Link>
          <p className="text-center text-xs text-ink-3">
            ยังไม่ได้สมัคร?{" "}
            <Link
              href={`/book/${code}/register`}
              className="text-primary-600 font-semibold hover:underline"
            >
              ลงทะเบียนใหม่
            </Link>
          </p>
        </div>

        {/* ── Footer ───────────────────────────────────── */}
        <div className="mt-6 pt-5 border-t border-line-soft text-center">
          <p className="text-[11px] text-ink-3">
            Invite Code:{" "}
            <code className="font-mono font-semibold text-ink-2">{code}</code>
            {invite.quota_total
              ? ` · เหลืออีก ${invite.quota_total - invite.quota_used} ที่นั่ง`
              : ""}
          </p>
        </div>
      </BrandCard>
    </InviteShell>
  );
}

/* ───────── Shared shell ───────── */
function InviteShell({
  children,
  brandColor,
}: {
  children: React.ReactNode;
  brandColor?: string;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-5 sm:p-6"
      style={{
        background: brandColor
          ? `radial-gradient(120% 80% at 50% 0%, ${brandColor}14 0%, transparent 55%), linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)`
          : "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
      }}
    >
      <div className="w-full max-w-md">
        {children}
        <p className="text-center text-[11px] text-ink-3 mt-6">
          Powered by{" "}
          <span className="font-semibold text-ink-2">EasySpace</span> ·
          ระบบจองห้องประชุม
        </p>
      </div>
    </div>
  );
}

/* ───────── Brand card with subtle accent ───────── */
function BrandCard({
  children,
  accentColor,
}: {
  children: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <div className="relative">
      {/* Soft glow underneath */}
      <div
        className="absolute -inset-1 rounded-[32px] opacity-30 blur-xl"
        style={{
          background: accentColor
            ? `linear-gradient(135deg, ${accentColor}40, transparent 60%)`
            : "transparent",
        }}
      />
      <div className="relative rounded-[24px] bg-white shadow-pop border border-line-soft overflow-hidden">
        {/* Top accent bar */}
        <div
          className="h-1"
          style={{
            background: accentColor
              ? `linear-gradient(90deg, ${accentColor}, ${accentColor}66)`
              : "linear-gradient(90deg, #3b5bdb, #6e8bff)",
          }}
        />
        <div className="px-7 py-8 sm:px-9 sm:py-10">{children}</div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="p-3 rounded-input bg-surface-subtle/70 border border-line-soft">
      <Icon
        size={14}
        className="mx-auto text-primary-600 mb-1.5"
        strokeWidth={1.75}
      />
      <p className="text-[10px] uppercase tracking-wider text-ink-3 text-center font-medium">
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums text-center mt-0.5">
        {value}
      </p>
      <p className="text-[10px] text-ink-3 text-center">{unit}</p>
    </div>
  );
}
