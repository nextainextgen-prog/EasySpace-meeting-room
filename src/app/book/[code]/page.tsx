import { Calendar, Building2, Clock, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function InviteLandingPage({ params }: PageProps) {
  const { code } = await params;

  return (
    <div className="min-h-screen bg-surface-page flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 rounded-card-sm bg-primary-600 text-white grid place-items-center shadow-hero">
            <Calendar size={22} strokeWidth={2} />
          </div>
        </div>

        <Card>
          <div className="text-center">
            <Badge tone="primary" className="mb-3">
              <Building2 size={11} className="mr-1" />
              บริษัท ABC จำกัด
            </Badge>
            <h1 className="text-2xl font-bold tracking-tighter">
              ยินดีต้อนรับสู่ EasySpace
            </h1>
            <p className="text-sm text-ink-3 mt-2">
              ระบบจองห้องประชุมสำหรับพนักงาน บริษัท ABC จำกัด
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-card-sm surface-subtle">
              <Clock size={16} className="mx-auto text-primary-600 mb-1.5" strokeWidth={1.75} />
              <p className="text-[11px] text-ink-3">Quota</p>
              <p className="text-sm font-bold tabular-nums">40 ชม./เดือน</p>
            </div>
            <div className="p-3 rounded-card-sm surface-subtle">
              <Users size={16} className="mx-auto text-primary-600 mb-1.5" strokeWidth={1.75} />
              <p className="text-[11px] text-ink-3">สมาชิก</p>
              <p className="text-sm font-bold tabular-nums">28 คน</p>
            </div>
            <div className="p-3 rounded-card-sm surface-subtle">
              <Calendar size={16} className="mx-auto text-primary-600 mb-1.5" strokeWidth={1.75} />
              <p className="text-[11px] text-ink-3">ห้อง</p>
              <p className="text-sm font-bold tabular-nums">3 ห้อง</p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <Button
              variant="gradient"
              size="lg"
              className="w-full"
              iconRight={<ArrowRight size={16} />}
            >
              เริ่มใช้งาน
            </Button>
            <p className="text-center text-xs text-ink-3">
              มีบัญชีอยู่แล้ว?{" "}
              <a href="/login" className="text-primary-600 font-medium">
                เข้าสู่ระบบ
              </a>
            </p>
          </div>

          <div className="mt-5 pt-5 border-t border-line-soft text-center">
            <p className="text-[11px] text-ink-3">
              Invite Code: <code className="font-mono">{code}</code>
            </p>
          </div>
        </Card>

        <p className="text-center text-[11px] text-ink-3 mt-6">
          Powered by EasySpace · ระบบจองห้องประชุม
        </p>
      </div>
    </div>
  );
}
