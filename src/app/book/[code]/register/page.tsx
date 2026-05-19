import Link from "next/link";
import { AlertCircle, Calendar, Building2, ShieldCheck } from "lucide-react";
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
        <div className="surface-card !p-8 text-center">
          <div className="w-12 h-12 rounded-pill bg-red-50 text-red-600 grid place-items-center mx-auto">
            <AlertCircle size={20} strokeWidth={1.75} />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tighter">
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
      </Shell>
    );
  }

  return (
    <Shell brandColor={invite.organization.brand_color ?? undefined}>
      <div className="surface-card !p-8 sm:!p-10">
        {/* Org badge */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {invite.organization.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={invite.organization.logo_url}
              alt={invite.organization.name}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <span
              className="w-7 h-7 rounded-full grid place-items-center text-white text-[10px] font-bold"
              style={{
                background: invite.organization.brand_color ?? "#3b5bdb",
              }}
            >
              <Building2 size={12} />
            </span>
          )}
          <span className="text-[11px] uppercase tracking-[0.16em] text-ink-3 font-semibold">
            {invite.organization.name}
          </span>
        </div>

        <h1 className="text-2xl sm:text-[28px] font-bold tracking-tighter text-center">
          ลงทะเบียนใช้งาน
        </h1>
        <p className="mt-2 text-sm text-ink-3 text-center leading-relaxed">
          กรอกข้อมูลสั้น ๆ — ใช้ Google เพื่อยืนยันตัวตน
          <br />
          ครั้งต่อไปเข้าระบบได้ด้วยคลิกเดียว
        </p>

        {invite.organization.email_domains.length > 0 && (
          <div className="mt-5 rounded-input bg-amber-50/60 border border-amber-100 px-3 py-2.5 text-xs text-amber-900 flex items-start gap-2">
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
              className="text-primary-600 font-medium hover:underline"
            >
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </div>
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
      className="min-h-screen bg-gradient-to-b from-white via-surface-subtle/40 to-white flex items-center justify-center px-4 py-10"
      style={
        brandColor ? { background: `${brandColor}06` } : undefined
      }
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2.5 mb-8">
          <div className="w-12 h-12 rounded-card bg-primary-600 text-white grid place-items-center shadow-hero">
            <Calendar size={22} strokeWidth={2} />
          </div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-semibold">
            EasySpace · Sign-up
          </p>
        </div>
        {children}
        <p className="text-center text-[11px] text-ink-3 mt-6">
          Powered by EasySpace · ระบบจองห้องประชุม
        </p>
      </div>
    </div>
  );
}
