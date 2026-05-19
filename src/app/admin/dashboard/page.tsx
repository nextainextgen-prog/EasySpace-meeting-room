import { Sparkles, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  getDashboardDeep,
  listAdminTasks,
  listBookingsForRange,
} from "@/lib/data";
import { requireAuth } from "@/lib/auth";
import { formatTime } from "@/lib/format";
import { DashboardShell } from "./dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireAuth();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const [deep, tasks, todayBookingsRaw] = await Promise.all([
    getDashboardDeep({ ownerId: profile.id }),
    listAdminTasks(profile.id),
    listBookingsForRange({
      start: dayStart.toISOString(),
      end: dayEnd.toISOString(),
    }),
  ]);

  const todayBookings = todayBookingsRaw
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    )
    .slice(0, 6)
    .map((b) => ({
      id: b.id,
      reference_code: b.reference_code,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      booking_status: b.booking_status,
      payment_status: b.payment_status,
      customer_name: b.customer?.display_name ?? null,
      room_name: b.room?.name ?? null,
      room_color: b.room?.color ?? null,
      total_amount: Number(b.total_amount),
    }));

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "อรุณสวัสดิ์" : hour < 17 ? "สวัสดียามบ่าย" : "สวัสดียามเย็น";
  const displayName =
    profile.full_name?.split(" ")[0] ?? profile.email.split("@")[0];

  return (
    <>
      <AdminTopbar
        title="Dashboard"
        subtitle="ภาพรวมของ EasySpace · sync ทุก 1 นาที"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title={`${greeting} ${displayName}`}
          description={`${now.toLocaleDateString("th-TH", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })} · ${formatTime(now)} น.`}
          actions={
            <>
              <Link href="/admin/bookings">
                <Button
                  variant="secondary"
                  iconLeft={<CalendarPlus size={16} strokeWidth={1.75} />}
                >
                  จองใหม่
                </Button>
              </Link>
              <Button
                variant="gradient"
                iconLeft={<Sparkles size={16} strokeWidth={1.75} />}
              >
                AI Brief
              </Button>
            </>
          }
        />

        <DashboardShell
          deep={deep}
          tasks={tasks}
          todayBookings={todayBookings}
          role={profile.role}
        />
      </div>
    </>
  );
}
