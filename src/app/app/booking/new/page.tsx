import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listRooms } from "@/lib/data/rooms";
import { getCurrentMember } from "@/lib/data/members";
import { getOrgById, getOrgUsage } from "@/lib/data/organizations";
import { MemberBookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ date?: string; slot?: string; roomId?: string }>;
}

export default async function NewBookingPage({ searchParams }: PageProps) {
  const ctx = await getCurrentMember();
  if (!ctx) {
    redirect("/app");
  }
  const params = await searchParams;
  const [rooms, org, usage] = await Promise.all([
    listRooms(),
    getOrgById(ctx.primaryOrgId),
    getOrgUsage(ctx.primaryOrgId),
  ]);

  const initialDate = params.date ?? new Date().toISOString().slice(0, 10);
  const initialSlot = params.slot ?? "10:00";
  const initialRoomId = params.roomId ?? rooms[0]?.id ?? "";

  if (rooms.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
        <Link
          href="/app/calendar"
          className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-primary-600"
        >
          <ChevronLeft size={12} />
          กลับสู่ปฏิทิน
        </Link>
        <EmptyState
          icon={Building2}
          title="ยังไม่มีห้องในระบบ"
          description="ติดต่อแอดมินตึกให้เพิ่มห้องประชุมก่อน"
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <div>
        <Link
          href="/app/calendar"
          className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-primary-600 mb-2"
        >
          <ChevronLeft size={12} />
          กลับสู่ปฏิทิน
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
              จองห้องประชุม
            </h1>
            <p className="text-sm text-ink-3 mt-1">
              ใช้โควต้าขององค์กร · ฟรีสำหรับสมาชิก
            </p>
          </div>
          <Badge tone="primary" className="!text-[11px]">
            <Building2 size={11} className="mr-1" />
            {org?.short_name ?? org?.name ?? "องค์กร"}
          </Badge>
        </div>
      </div>

      <Card className="!p-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-[11px] text-ink-3 uppercase tracking-[0.06em]">
            Quota องค์กร
          </p>
          <p className="text-base font-bold tabular-nums">
            {usage.hoursThisMonth}/{usage.quotaHoursMonthly} ชม.
          </p>
        </div>
        <div>
          <p className="text-[11px] text-ink-3 uppercase tracking-[0.06em]">
            ใช้ไป
          </p>
          <p className="text-base font-bold tabular-nums">{usage.quotaPct}%</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-3 uppercase tracking-[0.06em]">
            สมาชิก Active
          </p>
          <p className="text-base font-bold tabular-nums">
            {usage.activeMembers}/{usage.members}
          </p>
        </div>
      </Card>

      <MemberBookingForm
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          capacity_min: r.capacity_min,
          capacity_max: r.capacity_max,
        }))}
        memberId={ctx.member.id}
        orgId={ctx.primaryOrgId}
        defaultDate={initialDate}
        defaultSlot={initialSlot}
        defaultRoomId={initialRoomId}
      />
    </div>
  );
}
