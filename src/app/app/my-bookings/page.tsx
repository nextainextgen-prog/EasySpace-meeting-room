import Link from "next/link";
import { CalendarOff, CalendarPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentMember } from "@/lib/data/members";
import { listMyBookings } from "@/lib/data/member-bookings";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ filter?: "upcoming" | "past" | "cancelled" }>;
}

const tabs: Array<{ key: "upcoming" | "past" | "cancelled"; label: string }> = [
  { key: "upcoming", label: "กำลังจะมา" },
  { key: "past", label: "ผ่านมาแล้ว" },
  { key: "cancelled", label: "ยกเลิกแล้ว" },
];

export default async function MyBookingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filter = params.filter ?? "upcoming";

  const ctx = await getCurrentMember();
  if (!ctx) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={CalendarOff}
          title="ยังไม่ได้เข้าร่วมองค์กร"
          description="ติดต่อ Org Admin เพื่อรับลิงก์เชิญ"
        />
      </div>
    );
  }

  const bookings = await listMyBookings({
    memberId: ctx.member.id,
    filter,
  });

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
            การจองของฉัน
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            ดู / จัดการการจองทั้งหมดของคุณ
          </p>
        </div>
        <Link href="/app/booking/new">
          <Button variant="gradient" iconLeft={<CalendarPlus size={16} />}>
            จองใหม่
          </Button>
        </Link>
      </div>

      <Card className="!p-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={{
                pathname: "/app/my-bookings",
                query: { filter: t.key },
              }}
              className={`flex-1 text-center px-4 py-2.5 rounded-pill text-sm font-medium transition ${
                filter === t.key
                  ? "bg-primary-600 text-white"
                  : "text-ink-2 hover:bg-surface-subtle"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </Card>

      {bookings.length === 0 ? (
        <EmptyState
          icon={filter === "cancelled" ? CalendarOff : CalendarPlus}
          title={
            filter === "upcoming"
              ? "ยังไม่มีการจองที่กำลังจะมา"
              : filter === "past"
                ? "ยังไม่มีประวัติการจอง"
                : "ไม่มีรายการที่ยกเลิก"
          }
          description={
            filter === "upcoming"
              ? "จองห้องประชุมแรกของคุณกันเลย"
              : undefined
          }
          action={
            filter === "upcoming" ? (
              <Link href="/app/booking/new">
                <Button variant="gradient">จองห้องเลย</Button>
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const today = new Date();
            const start = new Date(b.starts_at);
            const isToday = start.toDateString() === today.toDateString();
            return (
              <li key={b.id}>
                <Link
                  href={`/app/booking/${b.id}`}
                  className="surface-card !p-4 flex items-center gap-4 hover:shadow-card-hover transition"
                >
                  <span
                    className="w-1 h-14 rounded-full"
                    style={{ background: b.room?.color ?? "#cbd5e1" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold tracking-tight text-ink-1 truncate">
                      {b.internal_title ?? "การประชุม"}
                    </p>
                    <p className="text-xs text-ink-3 tabular-nums mt-0.5">
                      {isToday ? "วันนี้" : formatDate(b.starts_at)} ·{" "}
                      {formatTime(b.starts_at)} – {formatTime(b.ends_at)} ·{" "}
                      {b.room?.name ?? "—"}
                    </p>
                    <p className="text-[11px] text-ink-3 font-mono mt-1">
                      {b.reference_code}
                    </p>
                  </div>
                  <Badge
                    tone={
                      filter === "cancelled"
                        ? "danger"
                        : isToday
                          ? "primary"
                          : filter === "past"
                            ? "muted"
                            : "success"
                    }
                  >
                    {filter === "cancelled"
                      ? "ยกเลิก"
                      : isToday
                        ? "วันนี้"
                        : filter === "past"
                          ? "เสร็จสิ้น"
                          : "ยืนยันแล้ว"}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
