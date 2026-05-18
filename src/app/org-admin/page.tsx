import { Calendar, Clock, Users, TrendingUp } from "lucide-react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { getCurrentMember, listMembersByOrg } from "@/lib/data/members";
import { getOrgById, getOrgUsage } from "@/lib/data/organizations";

export const metadata = { title: "Org Admin — EasySpace" };

export default async function OrgAdminHome() {
  const ctx = (await getCurrentMember())!;
  const [org, usage, members] = await Promise.all([
    getOrgById(ctx.primaryOrgId),
    getOrgUsage(ctx.primaryOrgId),
    listMembersByOrg(ctx.primaryOrgId),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tighter text-ink-1">
          ภาพรวมองค์กร
        </h2>
        <p className="text-sm text-ink-3 mt-1">
          {org?.name} · ชั้น {org?.floor ?? "—"}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="สมาชิก"
          value={`${members.length} คน`}
          hint={`${usage.activeMembers} active`}
          icon={Users}
        />
        <KpiCard
          label="ชั่วโมงเดือนนี้"
          value={`${usage.hoursThisMonth} ชม.`}
          hint={`โควต้า ${usage.quotaHoursMonthly} ชม.`}
          icon={Clock}
        />
        <KpiCard
          label="ใช้โควต้า"
          value={`${usage.quotaPct}%`}
          icon={TrendingUp}
        />
        <KpiCard
          label="จองเดือนนี้"
          value={`${usage.bookingsThisMonth} ครั้ง`}
          icon={Calendar}
        />
      </div>

      <Card>
        <CardTitle>การใช้งานเทียบโควต้า</CardTitle>
        <CardSubtitle>
          {usage.hoursThisMonth} / {usage.quotaHoursMonthly} ชั่วโมง ใช้ไปแล้ว
          {usage.quotaPct}%
        </CardSubtitle>
        <div className="mt-4 h-3 rounded-full bg-line overflow-hidden">
          <div
            className={
              usage.quotaPct >= 90
                ? "h-full bg-red-500"
                : usage.quotaPct >= 70
                  ? "h-full bg-amber-500"
                  : "h-full bg-primary-600"
            }
            style={{ width: `${usage.quotaPct}%` }}
          />
        </div>
        {usage.quotaPct >= 90 && (
          <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-input px-3 py-2">
            ใช้โควต้าใกล้เต็ม — ติดต่อแอดมินตึกถ้าต้องการเพิ่ม
          </p>
        )}
      </Card>
    </div>
  );
}
