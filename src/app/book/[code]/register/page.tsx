import Link from "next/link";
import { AlertCircle, Building2, ShieldCheck } from "lucide-react";
import { getInviteByCode } from "@/lib/data/invites";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function RegisterPage({ params }: PageProps) {
  const { code } = await params;
  const invite = await getInviteByCode(code);

  if (!invite) {
    return (
      <Shell>
        <BrandCard>
          <div className="text-center">
            <div className="w-14 h-14 rounded-pill bg-red-50 text-red-600 grid place-items-center mx-auto">
              <AlertCircle size={22} strokeWidth={1.75} />
            </div>
            <h1 className="mt-5 text-xl font-bold tracking-tighter">
              ลิงก์เชิญไม่ถูกต้อง
            </h1>
            <p className="mt-2 text-sm text-ink-3">
              ลิงก์อาจหมดอายุ ถูกปิดใช้งาน หรือเต็มแล้ว
            </p>
            <Link
              href="/"
              className="block mt-5 text-sm text-primary-600 font-medium hover:underline"
            >
              กลับสู่หน้าหลัก
            </Link>
          </div>
        </BrandCard>
      </Shell>
    );
  }

  const brand = invite.organization.brand_color ?? "#3b5bdb";

  return (
    <Shell brandColor={brand}>
      <BrandCard accentColor={brand}>
        {/* Org identity */}
        <div className="flex flex-col items-center text-center mb-5">
          {invite.organization.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={invite.organization.logo_url}
              alt={invite.organization.name}
              className="w-12 h-12 rounded-card object-cover ring-4 ring-white shadow-card"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-card grid place-items-center text-white shadow-card ring-4 ring-white"
              style={{ background: brand }}
            >
              <Building2 size={20} strokeWidth={1.75} />
            </div>
          )}
          <span className="mt-3 text-[11px] uppercase tracking-[0.18em] text-ink-3 font-semibold">
            {invite.organization.name}
          </span>
        </div>

        <h1 className="text-[26px] sm:text-[28px] font-bold tracking-tighter text-center leading-tight">
          ลงทะเบียนใช้งาน
        </h1>
        <p className="mt-2 text-sm text-ink-3 text-center leading-relaxed">
          กรอกข้อมูลสั้น ๆ — ใช้ Google เพื่อยืนยันตัวตน
          <br />
          ครั้งต่อไปเข้าระบบได้ด้วยคลิกเดียว
        </p>

        {invite.organization.email_domains.length > 0 && (
          <div className="mt-5 rounded-input bg-amber-50/60 border border-amber-100 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">ต้องใช้อีเมล:</span>{" "}
              {invite.organization.email_domains
                .map((d) => `@${d}`)
                .join(" / ")}{" "}
              เท่านั้น
            </span>
          </div>
        )}

        <div className="mt-6">
          <RegisterForm
            inviteCode={code}
            allowedDomains={invite.organization.email_domains}
          />
        </div>

        <div className="mt-6 pt-5 border-t border-line-soft">
          <p className="text-center text-xs text-ink-3">
            มีบัญชีอยู่แล้ว?{" "}
            <Link
              href={`/member-login?invite=${encodeURIComponent(code)}`}
              className="text-primary-600 font-semibold hover:underline"
            >
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </BrandCard>
    </Shell>
  );
}

function Shell({
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

function BrandCard({
  children,
  accentColor,
}: {
  children: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <div className="relative">
      <div
        className="absolute -inset-1 rounded-[32px] opacity-30 blur-xl"
        style={{
          background: accentColor
            ? `linear-gradient(135deg, ${accentColor}40, transparent 60%)`
            : "transparent",
        }}
      />
      <div className="relative rounded-[24px] bg-white shadow-pop border border-line-soft overflow-hidden">
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
