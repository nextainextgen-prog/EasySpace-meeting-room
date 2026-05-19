"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";

type ViewMode = "day" | "week" | "month" | "year";

interface RoomLite {
  id: string;
  name: string;
  color: string;
  capacity_min: number | null;
  capacity_max: number | null;
}

interface BookingLite {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  source: "external" | "internal";
  org_id: string | null;
  member_id: string | null;
  booking_status: string;
  internal_title: string | null;
  is_public: boolean;
  customer: { display_name: string } | null;
  member: { full_name: string } | null;
  org: { name: string } | null;
}

interface Props {
  rooms: RoomLite[];
  bookings: BookingLite[];
  memberId: string | null;
  orgId: string | null;
}

const SLOT_MIN_START = 8 * 60 + 30;
const SLOT_MIN_END = 22 * 60;
const SLOT_HEIGHT = 36;
const SLOTS: string[] = [];
for (let m = SLOT_MIN_START; m <= SLOT_MIN_END; m += 30) {
  SLOTS.push(
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
  );
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - ((dow + 6) % 7));
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MemberCalendarBoard({
  rooms,
  bookings,
  memberId,
  orgId,
}: Props) {
  const [view, setView] = useState<ViewMode>("day");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));

  const dayBookings = useMemo(() => {
    const start = startOfDay(cursor).getTime();
    const end = addDays(startOfDay(cursor), 1).getTime();
    return bookings.filter((b) => {
      const t = new Date(b.starts_at).getTime();
      return t >= start && t < end;
    });
  }, [bookings, cursor]);

  function navigate(delta: number) {
    if (view === "day") setCursor(addDays(cursor, delta));
    else if (view === "week") setCursor(addDays(cursor, delta * 7));
    else if (view === "month")
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    else setCursor(new Date(cursor.getFullYear() + delta, 0, 1));
  }

  const headerLabel = useMemo(() => {
    if (view === "day") {
      return cursor.toLocaleDateString("th-TH", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    if (view === "week") {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      return `${ws.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} – ${we.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    if (view === "month") {
      return cursor.toLocaleDateString("th-TH", {
        month: "long",
        year: "numeric",
      });
    }
    return String(cursor.getFullYear() + 543);
  }, [view, cursor]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card className="!p-3">
          <Link
            href={{
              pathname: "/app/booking/new",
              query: { date: fmtDate(cursor) },
            }}
          >
            <Button
              variant="gradient"
              className="w-full"
              iconLeft={<CalendarPlus size={16} />}
            >
              จองห้องใหม่
            </Button>
          </Link>
        </Card>

        <MiniMonth value={cursor} onChange={setCursor} bookings={bookings} />

        <Card className="!p-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2.5">
            ห้องประชุม
          </p>
          <div className="space-y-1.5">
            {rooms.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span
                  className="w-3 h-3 rounded shrink-0"
                  style={{ background: r.color }}
                />
                <span className="font-medium text-ink-1 truncate">
                  {r.name}
                </span>
                <span className="text-ink-3 ml-auto tabular-nums">
                  {r.capacity_min}–{r.capacity_max}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="!p-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2.5">
            สถานะ
          </p>
          <div className="space-y-1.5 text-xs text-ink-2">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-500" /> ของคุณ
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-primary-500" /> เพื่อนในองค์กร
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-slate-400" /> ลูกค้าภายนอก
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-white border border-line" />
              ว่าง
            </span>
          </div>
        </Card>
      </aside>

      <section className="space-y-3 min-w-0">
        <Card className="!p-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-input bg-surface-subtle p-0.5">
              {(["day", "week", "month", "year"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "h-8 px-3 rounded-input text-xs font-semibold tracking-tight transition",
                    view === v
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-ink-2 hover:text-ink-1",
                  )}
                >
                  {v === "day"
                    ? "วัน"
                    : v === "week"
                      ? "สัปดาห์"
                      : v === "month"
                        ? "เดือน"
                        : "ปี"}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-8 h-8 rounded-pill bg-surface-subtle text-ink-2 grid place-items-center hover:bg-line transition"
                aria-label="ก่อนหน้า"
              >
                <ChevronLeft size={14} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setCursor(startOfDay(new Date()))}
                className="h-8 px-3 rounded-pill text-xs font-semibold text-ink-2 hover:bg-surface-subtle"
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                className="w-8 h-8 rounded-pill bg-surface-subtle text-ink-2 grid place-items-center hover:bg-line transition"
                aria-label="ถัดไป"
              >
                <ChevronRight size={14} strokeWidth={1.75} />
              </button>
            </div>

            <div className="hidden md:block text-sm font-semibold text-ink-1 ml-3 tabular-nums">
              {headerLabel}
            </div>
          </div>
        </Card>

        <div className="md:hidden text-center text-sm font-semibold text-ink-1 tabular-nums">
          {headerLabel}
        </div>

        {view === "day" && (
          <DayView
            rooms={rooms}
            bookings={dayBookings}
            date={cursor}
            memberId={memberId}
            orgId={orgId}
          />
        )}
        {view === "week" && (
          <WeekView
            rooms={rooms}
            bookings={bookings}
            cursor={cursor}
            memberId={memberId}
            orgId={orgId}
            onPickDay={(d) => {
              setCursor(d);
              setView("day");
            }}
          />
        )}
        {view === "month" && (
          <MonthView
            bookings={bookings}
            cursor={cursor}
            onPickDay={(d) => {
              setCursor(d);
              setView("day");
            }}
          />
        )}
        {view === "year" && (
          <YearView
            bookings={bookings}
            cursor={cursor}
            onPickMonth={(d) => {
              setCursor(d);
              setView("month");
            }}
          />
        )}
      </section>
    </div>
  );
}

function MiniMonth({
  value,
  onChange,
  bookings,
}: {
  value: Date;
  onChange: (d: Date) => void;
  bookings: BookingLite[];
}) {
  const [month, setMonth] = useState(() => startOfMonth(value));
  const ws = startOfWeek(startOfMonth(month));
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(ws, i));

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings) {
      const k = fmtDate(new Date(b.starts_at));
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [bookings]);

  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          className="w-7 h-7 rounded-pill hover:bg-surface-subtle text-ink-2 grid place-items-center"
        >
          <ChevronLeft size={14} />
        </button>
        <p className="text-sm font-semibold text-ink-1 tracking-tight">
          {month.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          className="w-7 h-7 rounded-pill hover:bg-surface-subtle text-ink-2 grid place-items-center"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-1">
        {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => (
          <span key={d} className="text-center">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const selected = isSameDay(d, value);
          const today = isSameDay(d, new Date());
          const count = counts.get(fmtDate(d)) ?? 0;
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onChange(d)}
              className={cn(
                "h-8 rounded text-xs font-medium tabular-nums relative",
                inMonth ? "text-ink-1" : "text-ink-3 opacity-50",
                selected
                  ? "bg-primary-600 text-white"
                  : today
                    ? "ring-1 ring-primary-300"
                    : "hover:bg-surface-subtle",
              )}
            >
              {d.getDate()}
              {count > 0 && !selected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-500" />
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function DayView({
  rooms,
  bookings,
  date,
  memberId,
  orgId,
}: {
  rooms: RoomLite[];
  bookings: BookingLite[];
  date: Date;
  memberId: string | null;
  orgId: string | null;
}) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div
        className="grid border-b border-line bg-surface-subtle sticky top-0 z-10"
        style={{
          gridTemplateColumns: `72px repeat(${rooms.length}, minmax(0,1fr))`,
        }}
      >
        <div className="px-2 py-2 text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          เวลา
        </div>
        {rooms.map((r) => (
          <div
            key={r.id}
            className="px-3 py-2 border-l border-line flex items-center gap-2"
          >
            <span
              className="w-1 h-7 rounded-full shrink-0"
              style={{ background: r.color }}
            />
            <div className="min-w-0">
              <p className="text-xs md:text-sm font-bold tracking-tight truncate">
                {r.name}
              </p>
              <p className="text-[10px] text-ink-3">
                {r.capacity_min}–{r.capacity_max} ท่าน
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
        {SLOTS.map((slot) => {
          const [h, m] = slot.split(":").map(Number);
          const half = m === 30;
          return (
            <div
              key={slot}
              className="grid border-b border-line-soft"
              style={{
                gridTemplateColumns: `72px repeat(${rooms.length}, minmax(0,1fr))`,
                height: SLOT_HEIGHT,
              }}
            >
              <div className="px-2 py-2 text-[10px] tabular-nums text-ink-3 font-medium">
                {!half && slot}
              </div>
              {rooms.map((room) => {
                const event = bookings.find(
                  (b) =>
                    b.room_id === room.id &&
                    new Date(b.starts_at).getHours() === h &&
                    new Date(b.starts_at).getMinutes() === m,
                );
                return (
                  <SlotCell
                    key={`${slot}-${room.id}`}
                    event={event}
                    memberId={memberId}
                    orgId={orgId}
                    roomId={room.id}
                    date={fmtDate(date)}
                    slot={slot}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SlotCell({
  event,
  memberId,
  orgId,
  roomId,
  date,
  slot,
}: {
  event: BookingLite | undefined;
  memberId: string | null;
  orgId: string | null;
  roomId: string;
  date: string;
  slot: string;
}) {
  if (event) {
    return (
      <div className="border-l border-line-soft relative">
        <EventCard event={event} memberId={memberId} orgId={orgId} />
      </div>
    );
  }
  return (
    <Link
      href={{
        pathname: "/app/booking/new",
        query: { date, slot, roomId },
      }}
      className="border-l border-line-soft block hover:bg-primary-50/40 transition"
    />
  );
}

function EventCard({
  event,
  memberId,
  orgId,
}: {
  event: BookingLite;
  memberId: string | null;
  orgId: string | null;
}) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const slotCount = (end.getTime() - start.getTime()) / (30 * 60 * 1000);
  const height = slotCount * SLOT_HEIGHT - 4;

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
        ? event.internal_title ??
          event.member?.full_name ??
          "เพื่อนในองค์กร"
        : "เพื่อนในองค์กร"
      : event.source === "external"
        ? "EasySpace"
        : event.org?.name ?? "อื่น";

  const inner = (
    <div
      className={cn(
        "absolute inset-x-1 top-1 rounded-card-sm border-l-2 px-2.5 py-1.5 shadow-card transition",
        tone,
      )}
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

function WeekView({
  rooms,
  bookings,
  cursor,
  memberId,
  orgId,
  onPickDay,
}: {
  rooms: RoomLite[];
  bookings: BookingLite[];
  cursor: Date;
  memberId: string | null;
  orgId: string | null;
  onPickDay: (d: Date) => void;
}) {
  const ws = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  return (
    <Card className="!p-0 overflow-hidden">
      <div
        className="grid border-b border-line bg-surface-subtle sticky top-0 z-10"
        style={{ gridTemplateColumns: `64px repeat(7, minmax(0,1fr))` }}
      >
        <div className="px-2 py-2 text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          เวลา
        </div>
        {days.map((d) => {
          const today = isSameDay(d, new Date());
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPickDay(d)}
              className={cn(
                "px-2 py-2 border-l border-line text-left hover:bg-primary-50/30 transition",
                today && "bg-primary-50/40",
              )}
            >
              <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
                {d.toLocaleDateString("th-TH", { weekday: "short" })}
              </p>
              <p
                className={cn(
                  "text-base font-bold tabular-nums",
                  today && "text-primary-600",
                )}
              >
                {d.getDate()}
              </p>
            </button>
          );
        })}
      </div>

      <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
        {SLOTS.map((slot) => {
          const [h, m] = slot.split(":").map(Number);
          const half = m === 30;
          const isLunch = h === 12;
          return (
            <div
              key={slot}
              className={cn(
                "grid border-b border-line-soft",
                isLunch && "bg-surface-subtle/60",
              )}
              style={{
                gridTemplateColumns: `64px repeat(7, minmax(0,1fr))`,
                height: SLOT_HEIGHT,
              }}
            >
              <div className="px-2 py-2 text-[10px] tabular-nums text-ink-3 font-medium">
                {!half && slot}
              </div>
              {days.map((d) => {
                const events = bookings.filter((b) => {
                  const s = new Date(b.starts_at);
                  return (
                    isSameDay(s, d) &&
                    s.getHours() === h &&
                    s.getMinutes() === m
                  );
                });
                return (
                  <div
                    key={d.toISOString()}
                    className="border-l border-line-soft relative px-1"
                  >
                    {events.map((e) => {
                      const room = roomById.get(e.room_id);
                      const isMine =
                        memberId !== null && e.member_id === memberId;
                      const isSameOrg =
                        !isMine &&
                        e.source === "internal" &&
                        orgId !== null &&
                        e.org_id === orgId;
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            "absolute inset-x-1 top-1 rounded text-[10px] px-1.5 py-0.5 truncate",
                            isMine
                              ? "bg-emerald-100 text-emerald-800"
                              : isSameOrg
                                ? "bg-primary-100 text-primary-800"
                                : "bg-slate-100 text-slate-700",
                          )}
                          style={{
                            borderLeft: `3px solid ${room?.color ?? "#94a3b8"}`,
                          }}
                          title={`${room?.name ?? ""} · ${formatTime(e.starts_at)}–${formatTime(e.ends_at)}`}
                        >
                          {room?.name?.split(" ")[0] ?? "·"}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MonthView({
  bookings,
  cursor,
  onPickDay,
}: {
  bookings: BookingLite[];
  cursor: Date;
  onPickDay: (d: Date) => void;
}) {
  const ws = startOfWeek(startOfMonth(cursor));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(ws, i));
  const byDay = useMemo(() => {
    const map = new Map<string, BookingLite[]>();
    for (const b of bookings) {
      const k = fmtDate(new Date(b.starts_at));
      const arr = map.get(k) ?? [];
      arr.push(b);
      map.set(k, arr);
    }
    return map;
  }, [bookings]);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="grid grid-cols-7 bg-surface-subtle border-b border-line">
        {["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"].map(
          (d) => (
            <div
              key={d}
              className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold border-l border-line first:border-l-0"
            >
              {d}
            </div>
          ),
        )}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const today = isSameDay(d, new Date());
          const list = byDay.get(fmtDate(d)) ?? [];
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPickDay(d)}
              className={cn(
                "min-h-[110px] border-b border-l border-line-soft text-left p-2 transition hover:bg-primary-50/30",
                !inMonth && "bg-surface-subtle/40 text-ink-3",
              )}
            >
              <p
                className={cn(
                  "text-xs font-bold tabular-nums",
                  today && "text-primary-600",
                )}
              >
                {d.getDate()}
              </p>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className="text-[10px] truncate text-ink-2"
                    title={b.internal_title ?? ""}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle bg-primary-500" />
                    {formatTime(b.starts_at)}{" "}
                    {b.internal_title ?? b.customer?.display_name ?? "—"}
                  </div>
                ))}
                {list.length > 3 && (
                  <p className="text-[10px] text-ink-3 font-medium">
                    + อีก {list.length - 3} รายการ
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function YearView({
  bookings,
  cursor,
  onPickMonth,
}: {
  bookings: BookingLite[];
  cursor: Date;
  onPickMonth: (d: Date) => void;
}) {
  const year = cursor.getFullYear();
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings) {
      const k = fmtDate(new Date(b.starts_at));
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [bookings]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 12 }, (_, i) => i).map((m) => {
        const monthStart = new Date(year, m, 1);
        const ws = startOfWeek(monthStart);
        const cells = Array.from({ length: 42 }, (_, i) => addDays(ws, i));
        const max = 6;
        return (
          <Card key={m} className="!p-3">
            <button
              type="button"
              onClick={() => onPickMonth(monthStart)}
              className="text-left w-full hover:text-primary-600 transition"
            >
              <p className="text-xs font-bold tracking-tight mb-2">
                {monthStart.toLocaleDateString("th-TH", { month: "long" })}
              </p>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d) => {
                  const inMonth = d.getMonth() === m;
                  const count = byDay.get(fmtDate(d)) ?? 0;
                  const intensity = Math.min(1, count / max);
                  return (
                    <span
                      key={d.toISOString()}
                      className="aspect-square rounded-[3px]"
                      style={{
                        background: !inMonth
                          ? "transparent"
                          : count === 0
                            ? "#F1F5F9"
                            : `rgba(59, 91, 219, ${0.25 + intensity * 0.65})`,
                      }}
                    />
                  );
                })}
              </div>
            </button>
          </Card>
        );
      })}
    </div>
  );
}
