import Link from "next/link";
import { Calendar } from "lucide-react";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "ลืมรหัสผ่าน — EasySpace",
};

export default function ForgotPasswordPage() {
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
            ลืมรหัสผ่าน?
          </h1>
          <p className="mt-2 text-sm text-ink-3">
            กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปให้
          </p>

          <ForgotPasswordForm />

          <p className="mt-8 text-center text-sm">
            <Link
              href="/login"
              className="text-primary-600 font-medium hover:underline"
            >
              ← กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </p>
        </div>
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
