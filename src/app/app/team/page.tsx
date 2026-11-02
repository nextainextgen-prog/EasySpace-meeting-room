import { Building2, Users, Clock, Calendar } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentMember, listMembersByOrg } from "@/lib/data/members";
import {
  getOrgById,
  getOrgUsage,
} from "@/lib/data/organizations";
import { listOrgBookingsForDay } from "@/lib/data/member-bookings";
import { formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await getCurrentMember();
  if (!ctx) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={Building2}
          title="ยังไม่ได้เข้าร่วมองค์กร"
          description="ติดต่อ Org Admin เพื่อรับลิงก์เชิญ"
        />
      </div>
    );
  }

  const [org, usage, members, todayBookings] = await Promise.all([
    getOrgById(ctx.primaryOrgId),
    getOrgUsage(ctx.primaryOrgId),
    listMembersByOrg(ctx.primaryOrgId),
    listOrgBookingsForDay(ctx.primaryOrgId, new Date()),
  ]);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
          ทีม / องค์กร
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          {org?.name ?? "องค์กร"}
          {org?.floor ? ` · ชั้น ${org.floor}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="โควต้าเดือนนี้"
          value={
            usage.quotaUnlimited
              ? `${usage.hoursThisMonth} ชม.`
              : `${usage.hoursThisMonth}/${usage.quotaHoursMonthly} ชม.`
          }
          hint={
            usage.quotaUnlimited
              ? "ไม่จำกัดชั่วโมง"
              : `${usage.quotaPct}% ใช้ไปแล้ว`
          }
          icon={Clock}
        />
        <KpiCard
          label="สมาชิกทั้งหมด"
          value={`${members.length} คน`}
          icon={Users}
        />
        <KpiCard
          label="Active เดือนนี้"
          value={`${usage.activeMembers} คน`}
          icon={Users}
        />
        <KpiCard
          label="จองเดือนนี้"
          value={`${usage.bookingsThisMonth} ครั้ง`}
          icon={Calendar}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>วันนี้ในทีม</CardTitle>
            <CardSubtitle>
              {todayBookings.length} รายการในวันนี้
            </CardSubtitle>
          </div>
          <IconTile icon={Calendar} tone="primary" size="sm" />
        </CardHeader>
        {todayBookings.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-6">
            ทีมยังไม่มีจองในวันนี้
          </p>
        ) : (
          <ul className="space-y-2.5">
            {todayBookings.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 p-3 rounded-card-sm surface-subtle"
              >
                <span
                  className="w-1 h-10 rounded-full"
                  style={{ background: b.room?.color ?? "#cbd5e1" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm tracking-tight truncate">
                    {b.is_public
                      ? (b.internal_title ?? "การประชุม")
                      : "เพื่อนในทีม"}
                  </p>
                  <p className="text-xs text-ink-3 tabular-nums">
                    {formatTime(b.starts_at)} – {formatTime(b.ends_at)} ·{" "}
                    {b.room?.name}
                  </p>
                </div>
                {b.is_public && (
                  <Badge tone="muted" className="!text-[10px]">
                    เปิดเผย
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>สมาชิกทั้งหมด</CardTitle>
            <CardSubtitle>{members.length} คน</CardSubtitle>
          </div>
          <IconTile icon={Users} tone="primary" size="sm" />
        </CardHeader>
        {members.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-6">
            ยังไม่มีสมาชิก
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 p-3 rounded-card-sm surface-subtle"
              >
                <span className="w-10 h-10 rounded-pill bg-primary-100 text-primary-700 grid place-items-center font-semibold text-xs">
                  {m.full_name.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm tracking-tight truncate">
                    {m.full_name}
                    {m.id === ctx.member.id && (
                      <Badge tone="primary" className="ml-2 !text-[9px]">
                        คุณ
                      </Badge>
                    )}
                  </p>
                  {m.position && (
                    <p className="text-[11px] text-ink-3 truncate">
                      {m.position}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
