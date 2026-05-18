import Link from "next/link";
import {
  CalendarPlus,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listRooms } from "@/lib/data/rooms";
import { listBookingsForDay } from "@/lib/data/member-bookings";
import { getCurrentMember } from "@/lib/data/members";
import { formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const slots: string[] = [];
for (let m = 8 * 60 + 30; m <= 22 * 60; m += 30) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
}

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function MemberCalendarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = params.date ? new Date(params.date) : new Date();
  date.setHours(0, 0, 0, 0);

  const [ctx, rooms, dayBookings] = await Promise.all([
    getCurrentMember(),
    listRooms(),
    listBookingsForDay(date),
  ]);

  const dayStr = date.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
            ปฏิทินจองห้อง
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            แตะ slot ว่างเพื่อจอง · slot สีเทาเข้มคือมีคนใช้แล้ว
          </p>
        </div>
        <Link
          href={{ pathname: "/app/booking/new", query: { date: fmt(date) } }}
        >
          <Button variant="gradient" iconLeft={<CalendarPlus size={16} />}>
            จองห้องใหม่
          </Button>
        </Link>
      </div>

      <Card className="!p-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={{ pathname: "/app/calendar", query: { date: fmt(prevDate) } }}
            className="w-9 h-9 rounded-pill bg-surface-subtle text-ink-2 grid place-items-center hover:bg-line transition"
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </Link>
          <div className="text-center">
            <p className="text-sm font-semibold text-ink-1 tracking-tight">
              {dayStr}
            </p>
            <Link
              href="/app/calendar"
              className="text-[11px] text-primary-600 hover:underline"
            >
              วันนี้
            </Link>
          </div>
          <Link
            href={{ pathname: "/app/calendar", query: { date: fmt(nextDate) } }}
            className="w-9 h-9 rounded-pill bg-surface-subtle text-ink-2 grid place-items-center hover:bg-line transition"
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </Link>
        </div>
      </Card>

      {rooms.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="ยังไม่มีห้องในระบบ"
          description="ติดต่อแอดมินตึกให้เพิ่มห้องประชุม"
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div
            className="grid border-b border-line bg-surface-subtle"
            style={{
              gridTemplateColumns: `72px repeat(${rooms.length}, minmax(0,1fr))`,
            }}
          >
            <div className="px-2 py-3 text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
              เวลา
            </div>
            {rooms.map((r) => (
              <div key={r.id} className="px-3 py-3 border-l border-line">
                <p className="text-xs md:text-sm font-bold tracking-tight">
                  {r.name}
                </p>
                <p className="text-[10px] text-ink-3">
                  {r.capacity_min}–{r.capacity_max} ท่าน
                </p>
              </div>
            ))}
          </div>

          <div className="max-h-[640px] overflow-y-auto scrollbar-thin">
            {slots.map((slot) => {
              const [h, m] = slot.split(":").map(Number);
              const isLunch = h === 12;
              const half = m === 30;
              return (
                <div
                  key={slot}
                  className={`grid border-b border-line-soft ${
                    isLunch ? "bg-surface-subtle/60" : ""
                  }`}
                  style={{
                    gridTemplateColumns: `72px repeat(${rooms.length}, minmax(0,1fr))`,
                  }}
                >
                  <div className="px-2 py-2 text-[10px] tabular-nums text-ink-3 font-medium">
                    {!half && slot}
                  </div>
                  {rooms.map((room) => {
                    const event = dayBookings.find((b) => {
                      if (b.room_id !== room.id) return false;
                      const start = new Date(b.starts_at);
                      return (
                        start.getHours() === h && start.getMinutes() === m
                      );
                    });
                    return (
                      <SlotCell
                        key={`${slot}-${room.id}`}
                        event={event}
                        memberId={ctx?.member.id ?? null}
                        orgId={ctx?.primaryOrgId ?? null}
                        roomId={room.id}
                        date={fmt(date)}
                        slot={slot}
                        isLunch={isLunch}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="!p-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
          Legend
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-white border border-line" />
            ว่าง — แตะเพื่อจอง
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-emerald-500" />
            ของคุณ
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-primary-500" />
            เพื่อนในองค์กร
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-ink-3" />
            EasySpace (ลูกค้าภายนอก)
          </span>
        </div>
      </Card>
    </div>
  );
}

function SlotCell({
  event,
  memberId,
  orgId,
  roomId,
  date,
  slot,
  isLunch,
}: {
  event:
    | Awaited<ReturnType<typeof listBookingsForDay>>[number]
    | undefined;
  memberId: string | null;
  orgId: string | null;
  roomId: string;
  date: string;
  slot: string;
  isLunch: boolean;
}) {
  if (event) {
    return (
      <div className="border-l border-line-soft min-h-[36px] relative">
        <EventCard event={event} memberId={memberId} orgId={orgId} />
      </div>
    );
  }
  if (isLunch) {
    return (
      <div className="border-l border-line-soft min-h-[36px] relative">
        <div className="absolute inset-1 rounded-input border border-dashed border-line text-[10px] text-ink-3 grid place-items-center">
          พัก
        </div>
      </div>
    );
  }
  return (
    <Link
      href={{
        pathname: "/app/booking/new",
        query: { date, slot, roomId },
      }}
      className="border-l border-line-soft min-h-[36px] block hover:bg-primary-50/40 transition cursor-pointer"
    />
  );
}

function EventCard({
  event,
  memberId,
  orgId,
}: {
  event: Awaited<ReturnType<typeof listBookingsForDay>>[number];
  memberId: string | null;
  orgId: string | null;
}) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const slotCount = (end.getTime() - start.getTime()) / (30 * 60 * 1000);
  const height = slotCount * 36 - 4;

  const isMine = memberId !== null && event.member_id === memberId;
  const isSameOrg =
    !isMine &&
    event.source === "internal" &&
    orgId !== null &&
    event.org_id === orgId;

  const tone = isMine
    ? "border-l-emerald-500 bg-emerald-50/70 text-emerald-900"
    : isSameOrg
      ? "border-l-primary-500 bg-primary-50/70 text-primary-900"
      : event.source === "external"
        ? "border-l-slate-500 bg-slate-100 text-slate-700"
        : "border-l-primary-300 bg-primary-50/40 text-primary-700";

  const label = isMine
    ? event.internal_title ?? "การประชุมของคุณ"
    : isSameOrg
      ? event.is_public
        ? event.internal_title ?? event.member?.full_name ?? "เพื่อนในองค์กร"
        : "เพื่อนในองค์กร"
      : event.source === "external"
        ? "EasySpace"
        : event.org?.name ?? "อื่น";

  const inner = (
    <div
      className={`absolute inset-x-1 top-1 rounded-card-sm border-l-2 px-2.5 py-1.5 shadow-card transition ${tone}`}
      style={{ height }}
    >
      <p className="text-[11px] font-bold tracking-tight truncate">{label}</p>
      <p className="text-[10px] opacity-80 tabular-nums">
        {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
      </p>
      {!isMine && !isSameOrg && event.source === "external" && (
        <Lock size={10} className="absolute top-1.5 right-1.5 opacity-50" />
      )}
      {isMine && (
        <Badge tone="success" className="!text-[9px] !px-1.5 mt-1">
          ของฉัน
        </Badge>
      )}
    </div>
  );

  if (isMine) {
    return <Link href={`/app/booking/${event.id}`}>{inner}</Link>;
  }
  return inner;
}
