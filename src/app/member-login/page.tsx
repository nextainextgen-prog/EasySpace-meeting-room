import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, ShieldCheck, Sparkles, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { MemberLoginForm } from "./member-login-form";

export const metadata = {
  title: "เข้าสู่ระบบสมาชิก — EasySpace",
};

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "เข้าสู่ระบบด้วย Google ไม่สำเร็จ — ลองอีกครั้ง",
  not_registered:
    "อีเมล Google ของคุณยังไม่ถูกลงทะเบียน — แตะ ‘ลงทะเบียนใหม่’ ด้านล่าง หรือติดต่อแอดมิน",
  signed_out: "ออกจากระบบเรียบร้อย",
};

interface PageProps {
  searchParams: Promise<{
    error?: string;
    registered?: string;
    invite?: string;
  }>;
}

export default async function MemberLoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user && !params.error) {
    const admin = createSupabaseAdminClient();
    const { data: member } = await admin
      .from("members")
      .select("id")
      .or(`profile_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();
    if (member) redirect("/app");
  }

  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;
  const justRegistered = params.registered === "1";
  const invite = params.invite ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-surface-subtle/40 to-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand mark */}
        <div className="flex flex-col items-center gap-2.5 mb-8">
          <div className="w-12 h-12 rounded-card bg-primary-600 text-white grid place-items-center shadow-hero">
            <Calendar size={22} strokeWidth={2} />
          </div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-semibold">
            EasySpace · Member
          </p>
        </div>

        {/* Card */}
        <div className="surface-card !p-8 sm:!p-10">
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tighter text-ink-1">
            เข้าสู่ระบบสมาชิก
          </h1>
          <p className="mt-2 text-sm text-ink-3 leading-relaxed">
            สำหรับพนักงานในองค์กรที่ลงทะเบียนแล้ว
            <br />
            ใช้บัญชี Google เดียวกับที่สมัครได้ทันที
          </p>

          {/* Status messages */}
          {justRegistered && (
            <div className="mt-5 rounded-input bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3.5 py-2.5 flex items-start gap-2">
              <Sparkles size={14} className="mt-0.5 shrink-0" />
              <span>
                ลงทะเบียนสำเร็จ — เข้าระบบด้วย Google ที่อีเมลตอนสมัครได้เลย
              </span>
            </div>
          )}
          {errorMessage && (
            <div className="mt-5 rounded-input bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
              {errorMessage}
            </div>
          )}

          <MemberLoginForm />

          {/* Trust micro-row */}
          <div className="mt-6 flex items-center justify-center gap-4 text-[10px] text-ink-3 uppercase tracking-wider">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={11} />
              OAuth 2.0
            </span>
            <span className="w-1 h-1 rounded-full bg-line" />
            <span className="inline-flex items-center gap-1">
              <Users size={11} />
              Member Only
            </span>
          </div>

          <div className="mt-6 pt-5 border-t border-line-soft">
            <p className="text-center text-xs text-ink-3">
              ยังไม่ได้สมัคร?{" "}
              <Link
                href={
                  invite ? `/book/${invite}/register` : "/contact-admin"
                }
                className="text-primary-600 font-medium hover:underline"
              >
                ลงทะเบียนใหม่
              </Link>
            </p>
          </div>
        </div>

        {/* Footer admin link (kept tiny on purpose) */}
        <p className="mt-6 text-center text-[11px] text-ink-3">
          เป็นแอดมิน?{" "}
          <Link
            href="/login"
            className="text-ink-2 hover:text-primary-600 font-medium hover:underline"
          >
            เข้าสู่ระบบหลังบ้าน
          </Link>
        </p>
      </div>
    </div>
  );
}
