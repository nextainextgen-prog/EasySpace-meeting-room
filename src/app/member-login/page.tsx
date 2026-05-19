import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles, Users } from "lucide-react";
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
    <div
      className="min-h-screen flex items-center justify-center p-5 sm:p-6"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, rgba(59,91,219,0.08) 0%, transparent 55%), linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="relative">
          {/* Soft glow */}
          <div className="absolute -inset-1 rounded-[32px] opacity-40 blur-xl bg-gradient-to-br from-primary-500/30 via-transparent to-transparent" />

          {/* Card */}
          <div className="relative rounded-[24px] bg-white shadow-pop border border-line-soft overflow-hidden">
            {/* Top accent bar */}
            <div className="h-1 bg-gradient-to-r from-primary-600 via-primary-500 to-primary-300" />

            <div className="px-7 py-8 sm:px-9 sm:py-10">
              {/* Brand wordmark — no icon */}
              <div className="flex items-center justify-center mb-1.5">
                <span className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-semibold">
                  EasySpace · Member Portal
                </span>
              </div>

              {/* Heading */}
              <h1 className="mt-3 text-[28px] sm:text-[30px] font-bold tracking-tighter text-center leading-tight">
                เข้าสู่ระบบสมาชิก
              </h1>
              <p className="mt-2.5 text-sm text-ink-3 text-center leading-relaxed">
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
                    className="text-primary-600 font-semibold hover:underline"
                  >
                    ลงทะเบียนใหม่
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-ink-3 mt-6">
          Powered by{" "}
          <span className="font-semibold text-ink-2">EasySpace</span> ·
          ระบบจองห้องประชุม
        </p>
      </div>
    </div>
  );
}
