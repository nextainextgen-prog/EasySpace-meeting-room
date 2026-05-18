import { Mail, ShieldCheck, User } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { ChangePasswordCard } from "./change-password-card";
import { TwoFactorCard } from "./two-factor-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "บัญชีของฉัน — EasySpace" };

const ROLE_LABEL: Record<Role, string> = {
  owner: "เจ้าของระบบ",
  super_admin: "Super Admin",
  admin: "แอดมิน",
  staff: "พนักงาน",
  accountant: "บัญชี",
  marketing: "การตลาด",
  viewer: "ผู้ดู",
};

function formatThaiDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function AccountPage() {
  const profile = await requireAuth();

  return (
    <>
      <AdminTopbar
        title="บัญชีของฉัน"
        subtitle="ดูข้อมูลส่วนตัว เปลี่ยนรหัสผ่าน และเปิด/ปิดการยืนยัน 2 ขั้นตอน"
      />
      <div className="px-6 lg:px-10 py-6 lg:py-8 max-w-3xl">
        <PageHeader
          title="บัญชีของฉัน"
          description="ดูข้อมูลส่วนตัว เปลี่ยนรหัสผ่าน และเปิด/ปิดการยืนยัน 2 ขั้นตอน"
        />

        <Card className="mb-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-card-sm bg-primary-100 text-primary-700 grid place-items-center font-bold text-xl overflow-hidden">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name ?? profile.email}
                  className="w-full h-full object-cover"
                />
              ) : (
                (profile.full_name ?? profile.email).slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight text-ink-1">
                  {profile.full_name ?? "ยังไม่ระบุชื่อ"}
                </h2>
                <Badge tone="primary">{ROLE_LABEL[profile.role]}</Badge>
                {profile.two_factor_enabled && (
                  <Badge tone="success">
                    <ShieldCheck size={11} strokeWidth={2} /> 2FA
                  </Badge>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <InfoLine
                  icon={<Mail size={14} strokeWidth={1.75} />}
                  label="อีเมล"
                  value={profile.email}
                />
                <InfoLine
                  icon={<User size={14} strokeWidth={1.75} />}
                  label="โทรศัพท์"
                  value={profile.phone ?? "—"}
                />
              </div>
              {profile.last_login_at && (
                <p className="text-[11px] text-ink-3 mt-3">
                  เข้าใช้งานล่าสุด: {formatThaiDateTime(profile.last_login_at)}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="mb-5">
          <CardTitle>เปลี่ยนรหัสผ่าน</CardTitle>
          <CardSubtitle>
            ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร — ผสมตัวเลขและตัวอักษร
          </CardSubtitle>
          <ChangePasswordCard />
        </Card>

        <Card>
          <CardTitle>การยืนยัน 2 ขั้นตอน (2FA)</CardTitle>
          <CardSubtitle>
            เพิ่มความปลอดภัยด้วย Authenticator app (Google Authenticator,
            1Password, Authy)
          </CardSubtitle>
          <TwoFactorCard enabled={profile.two_factor_enabled} />
        </Card>
      </div>
    </>
  );
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-input bg-surface-subtle border border-line-soft">
      <span className="text-ink-3">{icon}</span>
      <span className="text-[11px] text-ink-3 uppercase tracking-wider mr-1">
        {label}
      </span>
      <span className="text-ink-1 font-medium tracking-tight truncate">
        {value}
      </span>
    </div>
  );
}
