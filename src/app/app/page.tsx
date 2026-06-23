import {
  Calendar,
  Clock,
  Users,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { KpiCard } from "@/components/ui/kpi-card";
import { HeroCard } from "@/components/ui/hero-card";
import { requireAuth } from "@/lib/auth";
import { getCurrentMember, listMembersByOrg } from "@/lib/data/members";
import { getOrgUsage } from "@/lib/data/organizations";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export const dynamic = "force-dynamic";
import { format } from "date-fns";
import { th } from "date-fns/locale";

interface UpcomingBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  attendees_count: number | null;
  booking_status: string;
  internal_title: string | null;
  member_id: string | null;
  created_by: string | null;
  room: { name: string } | null;
}

export default async function MemberDashboard() {
  const profile = await requireAuth();
  const ctx = await getCurrentMember();
  const supabase = createSupabaseAdminClient();

  // bookings.member_id points at members.id (NOT auth.profile.id), so look
  // up the member row before filtering.
  const memberId = ctx?.member.id ?? null;
  const orgId = ctx?.primaryOrgId ?? null;

  // A booking "belongs to me" if any of these match. Both checks let us
  // surface bookings that admin staff created on behalf of this member,
  // and bookings that this member created before their members.id was wired.
  const isMine = (b: { member_id: string | null; created_by: string | null }) =>
    (memberId && b.member_id === memberId) || b.created_by === profile.id;

  const now = new Date().toISOString();
  // Pull a wider org-scoped window so the JS-side `isMine` filter has
  // candidates to work with even if member_id was never populated.
  const { data: upcomingRaw } = orgId
    ? await supabase
        .from("bookings")
        .select(
          "id, starts_at, ends_at, attendees_count, booking_status, internal_title, member_id, created_by, room:rooms(name)",
        )
        // "Upcoming" = anything not yet ended. Using starts_at would hide
        // bookings that already began today, which was the original bug.
        .gte("ends_at", now)
        .neq("booking_status", "cancelled")
        .eq("org_id", orgId)
        .order("starts_at")
        .limit(50)
    : { data: [] };
  const upcoming = ((upcomingRaw ?? []) as unknown as UpcomingBooking[])
    .filter(isMine)
    .slice(0, 5);

  // "This week" — bookings starting in the current ISO week, capped at 50.
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const { data: weekRaw } = orgId
    ? await supabase
        .from("bookings")
        .select("id, member_id, created_by")
        .eq("org_id", orgId)
        .neq("booking_status", "cancelled")
        .gte("starts_at", weekStart.toISOString())
        .lt("starts_at", weekEnd.toISOString())
    : { data: [] };
  const weekCount = (
    (weekRaw ?? []) as Array<{ member_id: string | null; created_by: string | null }>
  ).filter(isMine).length;

  // member quota lookup — admin-set limits live in settings.org.<id>.meta
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: monthRaw } = orgId
    ? await supabase
        .from("bookings")
        .select("starts_at, ends_at, member_id, created_by")
        .eq("org_id", orgId)
        .neq("booking_status", "cancelled")
        .gte("starts_at", monthStart.toISOString())
    : { data: [] };
  const monthBookings = (
    (monthRaw ?? []) as Array<{
      starts_at: string;
      ends_at: string;
      member_id: string | null;
      created_by: string | null;
    }>
  ).filter(isMine);
  const hoursUsed = monthBookings.reduce((sum, b) => {
    const diffHrs =
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
      3_600_000;
    return sum + diffHrs;
  }, 0);
  const orgUsage = orgId ? await getOrgUsage(orgId) : null;
  const quotaTotal = orgUsage?.quotaHoursMonthly ?? 40;
  const quotaUnlimited = orgUsage?.quotaUnlimited ?? false;

  // Team size — count active members in the same org
  const teamSize = orgId ? (await listMembersByOrg(orgId)).length : 0;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tighter">
          สวัสดี {profile.full_name?.split(" ")[0] ?? profile.email}
        </h1>
        <p className="text-ink-3 tracking-tight">
          {upcoming.length === 0
            ? "ยังไม่มีการจองในเร็วๆ นี้"
            : `คุณมีการจอง ${upcoming.length} รายการที่กำลังจะมาถึง`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="โควต้าเดือนนี้"
          value={
            quotaUnlimited
              ? `${(orgUsage?.hoursThisMonth ?? 0).toFixed(1)} ชม.`
              : `${(orgUsage?.hoursThisMonth ?? 0).toFixed(1)}/${quotaTotal} ชม.`
          }
          hint={
            quotaUnlimited
              ? `ไม่จำกัด · ทีมใช้รวม (คุณ ${hoursUsed.toFixed(1)} ชม.)`
              : `ทีมใช้รวม · คุณ ${hoursUsed.toFixed(1)} ชม.`
          }
          icon={Clock}
        />
        <KpiCard
          label="จองล่าสุด"
          value={
            upcoming[0]
              ? format(new Date(upcoming[0].starts_at), "d MMM HH:mm", {
                  locale: th,
                })
              : "—"
          }
          icon={Calendar}
        />
        <KpiCard
          label="สัปดาห์นี้"
          value={`${weekCount} รายการ`}
          icon={Sparkles}
        />
        <KpiCard
          label="ทีม"
          value={teamSize > 0 ? `${teamSize} คน` : "—"}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <HeroCard
            eyebrow="Quick Book"
            value="3 คลิก"
            trailing="เลือก slot · ใส่หัวข้อ · ยืนยัน"
            cta={{ label: "จองห้องเลย", href: "/app/calendar" }}
          />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Upcoming Bookings</CardTitle>
              <CardSubtitle>
                {upcoming.length} รายการถัดไป
              </CardSubtitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconRight={<ChevronRight size={14} />}
            >
              <a href="/app/my-bookings">ดูทั้งหมด</a>
            </Button>
          </CardHeader>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-8 tracking-tight">
              ยังไม่มีการจอง — ลองจองรอบแรกของคุณดูเลย
            </p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-4 p-3 rounded-card-sm bg-surface-subtle"
                >
                  <span
                    className={`w-1 h-12 rounded-full ${
                      b.booking_status === "confirmed"
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold tracking-tight truncate">
                      {b.internal_title ?? "Booking"}
                    </p>
                    <p className="text-xs text-ink-3 tabular-nums">
                      {format(new Date(b.starts_at), "EEE d MMM HH:mm", {
                        locale: th,
                      })}
                      {" – "}
                      {format(new Date(b.ends_at), "HH:mm")} ·{" "}
                      {b.room?.name ?? "—"}
                      {b.attendees_count ? ` · ${b.attendees_count} คน` : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      b.booking_status === "confirmed" ? "success" : "warning"
                    }
                  >
                    {b.booking_status === "confirmed"
                      ? "ยืนยันแล้ว"
                      : "รออนุมัติ"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="!bg-primary-50/40 !border-primary-100">
        <div className="flex items-start gap-3">
          <IconTile icon={Sparkles} tone="primary" />
          <div className="flex-1">
            <p className="font-semibold tracking-tight text-primary-800">
              AI Suggestion
            </p>
            <p className="text-sm text-ink-2 mt-1 tracking-tight">
              เทรนด์ของทีมคุณ: ประชุมส่วนใหญ่ตกวันพุธ 10:00 — สนใจตั้ง recurring
              booking ทุกพุธหรือไม่?
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary">
                ตั้งค่า
              </Button>
              <Button size="sm" variant="ghost">
                ปิด
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
