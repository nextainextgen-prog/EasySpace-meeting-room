import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";
import { LoginForm } from "./login-form";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export const metadata = {
  title: "เข้าสู่ระบบ — EasySpace",
};

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองอีกครั้ง",
  invalid_credentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  disabled: "บัญชีถูกปิดใช้งาน ติดต่อแอดมิน",
  forbidden: "คุณไม่มีสิทธิ์เข้าหน้านี้",
  signed_out: "ออกจากระบบแล้ว",
  session_expired: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
};

const NOTICE_MESSAGES: Record<string, string> = {
  reset_sent: "ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว",
  password_updated: "เปลี่ยนรหัสผ่านสำเร็จ เข้าสู่ระบบอีกครั้ง",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user) {
    // If we arrived here with ?error=..., it means a protected layout actively
    // bounced us out (e.g. role check failed). Auto-redirecting back to /admin
    // would just re-trigger the same bounce → infinite loop. Sign out instead
    // so the form is usable and the user can try a different account.
    if (params.error) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } else {
      redirect(params.next ?? "/admin/dashboard");
    }
  }
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;
  const noticeMessage = params.notice ? NOTICE_MESSAGES[params.notice] : null;

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
          <h1 className="text-4xl font-bold tracking-tighter text-primary-600">
            เข้าสู่ระบบหลังบ้าน
          </h1>
          <p className="mt-2 text-sm text-ink-3">
            สำหรับแอดมิน / เจ้าหน้าที่ตึก — เข้าด้วย Email + รหัสผ่าน
          </p>

          {errorMessage && (
            <div className="mt-5 rounded-input bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
              {errorMessage}
            </div>
          )}
          {!errorMessage && noticeMessage && (
            <div className="mt-5 rounded-input bg-primary-50 border border-primary-100 text-primary-700 text-sm px-3.5 py-2.5">
              {noticeMessage}
            </div>
          )}

          <LoginForm next={params.next} />
        </div>

        <p className="mt-6 text-center text-xs text-white/70">
          EasySpace · ระบบจัดการห้องประชุม · v1.0
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
