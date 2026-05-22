import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, Sparkles } from "lucide-react";
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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#2D4EF5] flex items-center justify-center px-4 py-10">
      <BackdropBlobs />

      <main className="relative w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-6 text-white">
          <div className="w-10 h-10 rounded-card-sm bg-white/15 ring-1 ring-white/25 grid place-items-center backdrop-blur-sm">
            <Calendar size={20} strokeWidth={2} />
          </div>
          <span className="text-lg font-bold tracking-tight">EasySpace</span>
        </div>

        <div className="rounded-[28px] bg-white px-8 py-10 sm:px-10 sm:py-11 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]">
          <h1 className="text-3xl font-bold tracking-tighter text-primary-600">
            เข้าสู่ระบบสมาชิก
          </h1>
          <p className="mt-2 text-sm text-ink-3 tracking-tight">
            สำหรับพนักงานในองค์กร — เข้าด้วยบัญชี Google ที่ลงทะเบียนไว้
          </p>

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

          <p className="mt-8 text-center text-sm tracking-tight">
            <span className="text-ink-3">ยังไม่ได้สมัคร? </span>
            <Link
              href={invite ? `/book/${invite}/register` : "/book/es/register"}
              className="text-primary-600 font-medium hover:underline"
            >
              ลงทะเบียนใหม่
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-white/70">
          EasySpace · ระบบจองห้องประชุม · v1.0
        </p>
      </main>
    </div>
  );
}

function BackdropBlobs() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_10%,#6E8BFF_0%,transparent_55%),radial-gradient(110%_70%_at_85%_15%,#3B5BDB_0%,transparent_55%),radial-gradient(120%_90%_at_70%_100%,#1E3AE8_0%,transparent_55%),linear-gradient(135deg,#2D4EF5_0%,#4F6FFC_100%)]" />
      <div className="absolute -top-20 -left-16 w-80 h-80 rounded-full bg-white/20 blur-3xl" />
      <div className="absolute top-1/3 -right-20 w-96 h-96 rounded-full bg-[#A5B4FC]/40 blur-3xl" />
      <div className="absolute -bottom-24 left-1/4 w-[28rem] h-[28rem] rounded-full bg-[#1E3AE8]/40 blur-3xl" />
    </>
  );
}
