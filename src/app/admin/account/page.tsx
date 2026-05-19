import { ShieldCheck, Smartphone, KeyRound, Activity, User } from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { ChangePasswordCard } from "./change-password-card";
import { TwoFactorCard } from "./two-factor-card";
import { ProfileCard } from "./profile-card";
import { SessionsCard } from "./sessions-card";
import { LoginActivityCard } from "./login-activity-card";
import { BackupCodesCard } from "./backup-codes-card";
import {
  listMyLoginActivity,
  getBackupCodesStatus,
} from "@/lib/actions/account";

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

export default async function AccountPage() {
  const profile = await requireAuth();
  const [activity, backupStatus] = await Promise.all([
    listMyLoginActivity(20),
    getBackupCodesStatus(),
  ]);

  return (
    <>
      <AdminTopbar
        title="บัญชีของฉัน"
        subtitle="Profile · password · 2FA · sessions · login activity"
      />
      <div className="px-6 lg:px-10 py-6 lg:py-8 max-w-3xl space-y-5">
        <PageHeader
          title="บัญชีของฉัน"
          description="จัดการข้อมูลส่วนตัว ความปลอดภัย และเซสชันการเข้าระบบ"
        />

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="inline-flex items-center gap-2">
                <User size={16} className="text-primary-600" />
                Profile
              </CardTitle>
              <Badge tone="primary">{ROLE_LABEL[profile.role]}</Badge>
              {profile.two_factor_enabled && (
                <Badge tone="success">
                  <ShieldCheck size={11} strokeWidth={2} /> 2FA on
                </Badge>
              )}
            </div>
          </div>
          <ProfileCard
            initial={{
              email: profile.email,
              full_name: profile.full_name,
              phone: profile.phone,
              avatar_url: profile.avatar_url,
            }}
          />
        </Card>

        <Card>
          <CardTitle className="inline-flex items-center gap-2">
            <KeyRound size={16} className="text-primary-600" />
            เปลี่ยนรหัสผ่าน
          </CardTitle>
          <CardSubtitle>
            อย่างน้อย 8 ตัวอักษร · ผสมตัวเลข ตัวพิมพ์ใหญ่/เล็ก ·
            ดูระดับความปลอดภัยจากแถบสี
          </CardSubtitle>
          <ChangePasswordCard />
        </Card>

        <Card>
          <CardTitle className="inline-flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary-600" />
            การยืนยัน 2 ขั้นตอน (2FA)
          </CardTitle>
          <CardSubtitle>
            เพิ่มความปลอดภัยด้วย Authenticator app
          </CardSubtitle>
          <TwoFactorCard enabled={profile.two_factor_enabled} />
        </Card>

        <Card>
          <CardTitle className="inline-flex items-center gap-2">
            <KeyRound size={16} className="text-primary-600" />
            Backup Codes
          </CardTitle>
          <CardSubtitle>
            ใช้แทน 2FA เวลาเข้าถึงเครื่อง authenticator ไม่ได้ · 10 โค้ด ใช้ได้ครั้งเดียว
          </CardSubtitle>
          <BackupCodesCard status={backupStatus} />
        </Card>

        <Card>
          <CardTitle className="inline-flex items-center gap-2">
            <Smartphone size={16} className="text-primary-600" />
            อุปกรณ์ & เซสชัน
          </CardTitle>
          <CardSubtitle>
            ออกจากระบบทุกอุปกรณ์อื่นได้ทันทีหากสงสัยว่ามีคนเข้าใช้งาน
          </CardSubtitle>
          <SessionsCard />
        </Card>

        <Card>
          <CardTitle className="inline-flex items-center gap-2">
            <Activity size={16} className="text-primary-600" />
            Login Activity
          </CardTitle>
          <CardSubtitle>
            กิจกรรมล่าสุดของบัญชีนี้ · ดึงจาก audit_log
          </CardSubtitle>
          <LoginActivityCard rows={activity} />
        </Card>
      </div>
    </>
  );
}
