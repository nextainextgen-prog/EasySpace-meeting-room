import Link from "next/link";
import { AlertCircle, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
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
        <Card>
          <div className="text-center">
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
              className="block mt-5 text-sm text-primary-600 font-medium"
            >
              กลับสู่หน้าหลัก
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <div className="text-center">
          <Badge tone="primary" className="mb-3">
            <Building2 size={11} className="mr-1" />
            {invite.organization.name}
          </Badge>
          <h1 className="text-2xl font-bold tracking-tighter">
            สมัครใช้งาน EasySpace
          </h1>
          <p className="text-sm text-ink-3 mt-2">
            กรอกข้อมูลเล็กน้อยเพื่อเข้าใช้งาน
          </p>
        </div>

        {invite.organization.email_domains.length > 0 && (
          <div className="mt-5 rounded-input bg-amber-50/60 border border-amber-100 px-3 py-2.5 text-xs text-amber-900">
            <span className="font-semibold">เงื่อนไข:</span> ใช้อีเมล{" "}
            {invite.organization.email_domains
              .map((d) => `@${d}`)
              .join(" / ")}{" "}
            เท่านั้น
          </div>
        )}

        <div className="mt-6">
          <RegisterForm
            inviteCode={code}
            allowedDomains={invite.organization.email_domains}
          />
        </div>

        <p className="text-center text-xs text-ink-3 mt-5">
          มีบัญชีอยู่แล้ว?{" "}
          <Link
            href={`/login?next=/app`}
            className="text-primary-600 font-medium"
          >
            เข้าสู่ระบบ
          </Link>
        </p>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-page flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 rounded-card-sm bg-primary-600 text-white grid place-items-center shadow-hero">
            <Calendar size={22} strokeWidth={2} />
          </div>
        </div>
        {children}
        <p className="text-center text-[11px] text-ink-3 mt-6">
          Powered by EasySpace
        </p>
      </div>
    </div>
  );
}
