import Link from "next/link";
import { Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const metadata = {
  title: "เข้าสู่ระบบ — EasySpace",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left — Hero (gradient) */}
      <div className="hidden lg:flex relative overflow-hidden bg-primary-gradient text-white p-12 flex-col justify-between">
        <div className="absolute -top-20 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-card-sm bg-white/15 grid place-items-center">
              <Calendar size={20} strokeWidth={2} />
            </div>
            <span className="text-xl font-bold tracking-tight">EasySpace</span>
          </div>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-bold tracking-tighter mb-3">
            ระบบจัดการห้องประชุม
            <br />
            อัจฉริยะสำหรับตึกของคุณ
          </h1>
          <p className="text-white/80 max-w-md">
            จัดการ booking · ดูแลลูกค้า · ดูภาพรวมการเงิน · ส่งแจ้งเตือนผ่าน
            Telegram และให้ AI ทำงานหนักแทนคุณ
          </p>
          <div className="mt-10 flex gap-6 text-sm">
            <div>
              <p className="text-2xl font-bold tabular-nums">152</p>
              <p className="text-white/70">ลูกค้า</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">3,420</p>
              <p className="text-white/70">การจอง</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">99.97%</p>
              <p className="text-white/70">Uptime</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-card-sm bg-primary-600 text-white grid place-items-center">
              <Calendar size={20} strokeWidth={2} />
            </div>
            <span className="font-bold tracking-tight text-lg">EasySpace</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tighter">เข้าสู่ระบบ</h2>
          <p className="text-sm text-ink-3 mt-1">
            สำหรับแอดมินและพนักงานในตึก
          </p>

          <form className="mt-8 space-y-4">
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              type="button"
            >
              <span className="inline-flex items-center gap-3">
                <GoogleIcon />
                <span>เข้าสู่ระบบด้วย Google</span>
              </span>
            </Button>

            <div className="flex items-center gap-3">
              <span className="flex-1 h-px bg-line" />
              <span className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">
                หรือ
              </span>
              <span className="flex-1 h-px bg-line" />
            </div>

            <div>
              <Label>Email</Label>
              <Input type="email" placeholder="you@easyspace.co.th" />
            </div>
            <div>
              <Label>รหัสผ่าน</Label>
              <Input type="password" placeholder="••••••••••" />
            </div>

            <Button variant="gradient" size="lg" className="w-full" type="submit">
              เข้าสู่ระบบ
              <ArrowRight size={16} className="ml-1.5" />
            </Button>

            <p className="text-center text-xs text-ink-3 pt-4">
              ยังไม่มีบัญชี? ใช้ลิงก์เชิญที่ได้รับจากแอดมินตึก
            </p>
            <p className="text-center text-xs">
              <Link href="/" className="text-primary-600">
                กลับสู่หน้าหลัก
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
