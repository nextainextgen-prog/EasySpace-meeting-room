"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  Phone,
  MessageCircle,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ImageOff,
  ChevronDown,
  Sparkles,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/cn";

const SERVICE_START_MIN = 8 * 60 + 30; // 08:30
const SERVICE_END_MIN = 22 * 60; // 22:00
const SLOT_MIN = 30;

interface RoomLite {
  id: string;
  name: string;
  capacity_min: number | null;
  capacity_max: number | null;
  hourly_rate: number;
  color: string;
  thumbnail_url: string | null;
  amenities: string[];
  perks: string[];
  floor: string | null;
}

interface BookingLite {
  starts_at: string;
  ends_at: string;
  in_use: boolean;
}

interface OtherRoom {
  id: string;
  name: string;
  color: string;
  thumbnail_url: string | null;
  slug: string | null;
  is_busy_now: boolean;
  next_free_at: string | null;
}

interface Config {
  line_url: string;
  line_id: string;
  phone: string;
  show_days: 1 | 2 | 3 | 7;
  headline: string;
  show_capacity: boolean;
  show_hourly_rate: boolean;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesOf(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function RoomAvailability({
  room,
  bookings,
  otherRooms,
  config,
}: {
  room: RoomLite;
  bookings: BookingLite[];
  otherRooms: OtherRoom[];
  config: Config;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = useMemo(() => {
    return Array.from({ length: config.show_days }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.show_days]);

  const [activeDayKey, setActiveDayKey] = useState(dateKey(today));
  const [now, setNow] = useState(new Date());

  // Tick now-indicator
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Soft auto-refresh every 30s using router refresh (re-runs server query)
  // We piggyback on the now-tick for refresh — Next route segment auto-revalidates.
  useEffect(() => {
    const handle = setInterval(() => {
      // Use a soft fetch refresh — keep current scroll position
      void fetch(location.href, {
        cache: "no-store",
        headers: { "x-public-refresh": "1" },
      }).catch(() => {});
    }, 60_000);
    return () => clearInterval(handle);
  }, []);

  // Current room status
  const isOpenNow =
    now.getHours() * 60 + now.getMinutes() >= SERVICE_START_MIN &&
    now.getHours() * 60 + now.getMinutes() <= SERVICE_END_MIN;

  const currentBooking = useMemo(() => {
    return bookings.find(
      (b) => new Date(b.starts_at) <= now && new Date(b.ends_at) > now,
    );
  }, [bookings, now]);

  const nextBooking = useMemo(() => {
    return bookings
      .filter((b) => new Date(b.starts_at) > now)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() -
          new Date(b.starts_at).getTime(),
      )[0];
  }, [bookings, now]);

  return (
    <div className="max-w-md mx-auto pb-32">
      {/* ── Hero ─────────────────── */}
      <Hero
        room={room}
        isOpenNow={isOpenNow}
        currentBooking={currentBooking}
        nextBooking={nextBooking}
        now={now}
        config={config}
      />

      {/* ── Day tabs ─────────────── */}
      {days.length > 1 && (
        <div className="px-5 pt-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
            {days.map((d) => {
              const key = dateKey(d);
              const active = activeDayKey === key;
              const isToday = sameDay(d, today);
              return (
                <button
                  key={key}
                  onClick={() => setActiveDayKey(key)}
                  className={cn(
                    "shrink-0 px-4 py-2 rounded-pill text-xs font-medium transition tabular-nums",
                    active
                      ? "bg-ink-1 text-white shadow-card"
                      : "bg-white border border-line-soft text-ink-2",
                  )}
                >
                  {isToday
                    ? "วันนี้"
                    : d.toLocaleDateString("th-TH", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Timeline ─────────────── */}
      <div className="px-5 pt-4">
        <TimelineForDay
          dayKey={activeDayKey}
          bookings={bookings}
          now={now}
          roomColor={room.color}
        />
      </div>

      {/* ── Room info ────────────── */}
      <RoomInfoCard room={room} />

      {/* ── Other rooms strip ────── */}
      {otherRooms.length > 0 && (
        <div className="px-5 pt-5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2 px-1">
            ห้องอื่น
          </p>
          <div className="grid grid-cols-1 gap-2">
            {otherRooms.map((o) => (
              <OtherRoomRow key={o.id} room={o} now={now} />
            ))}
          </div>
        </div>
      )}

      {/* ── Footer note ─────────── */}
      <div className="px-5 pt-8 pb-4 text-center">
        <p className="text-[11px] text-ink-3">
          ข้อมูล real-time · sync จากระบบหลังบ้านทุก 30 วินาที
        </p>
        <p className="text-[10px] text-ink-3 mt-1">
          เวลาให้บริการ 08:30–22:00
        </p>
      </div>

      {/* ── Fixed CTA bottom ───── */}
      <BottomCta config={config} room={room} />
    </div>
  );
}

/* ───────── Hero ───────── */
function Hero({
  room,
  isOpenNow,
  currentBooking,
  nextBooking,
  now,
  config,
}: {
  room: RoomLite;
  isOpenNow: boolean;
  currentBooking: BookingLite | undefined;
  nextBooking: BookingLite | undefined;
  now: Date;
  config: Config;
}) {
  const status: {
    label: string;
    sub: string;
    tone: "free" | "busy" | "closed";
  } = useMemo(() => {
    if (!isOpenNow)
      return {
        label: "นอกเวลาให้บริการ",
        sub: "เปิด 08:30 – 22:00",
        tone: "closed",
      };
    if (currentBooking)
      return {
        label: "กำลังใช้งาน",
        sub: `ใช้ถึง ${fmtTime(new Date(currentBooking.ends_at))}`,
        tone: "busy",
      };
    if (nextBooking) {
      const minsToNext = Math.round(
        (new Date(nextBooking.starts_at).getTime() - now.getTime()) /
          60_000,
      );
      return {
        label: "ห้องว่างอยู่",
        sub: `ใช้ได้อีก ${minsToNext} นาที (ถึง ${fmtTime(new Date(nextBooking.starts_at))})`,
        tone: "free",
      };
    }
    return {
      label: "ห้องว่างอยู่",
      sub: "ว่างทั้งวัน — ติดต่อจองได้เลย",
      tone: "free",
    };
  }, [isOpenNow, currentBooking, nextBooking, now]);

  return (
    <div className="relative">
      {/* Image / gradient */}
      <div
        className="relative w-full h-56 sm:h-64 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${room.color}, ${room.color}99)`,
        }}
      >
        {room.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={room.thumbnail_url}
            alt={room.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/60">
            <Building2 size={56} strokeWidth={1.25} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/60" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="text-[11px] uppercase tracking-[0.16em] opacity-80 mb-1">
            EasySpace · เช็กห้องว่าง
          </p>
          <h1 className="text-3xl font-bold tracking-tight leading-tight">
            {room.name}
          </h1>
          <p className="text-xs opacity-80 mt-1 tabular-nums">
            {[
              room.floor && `ชั้น ${room.floor}`,
              config.show_capacity &&
                room.capacity_min &&
                room.capacity_max &&
                `${room.capacity_min}–${room.capacity_max} ท่าน`,
              config.show_hourly_rate &&
                `${room.hourly_rate.toLocaleString()} บาท/ชม.`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {/* Floating status card */}
      <div className="px-5 -mt-7 relative z-10">
        <div
          className={cn(
            "rounded-card border bg-white shadow-card p-4 backdrop-blur-md",
            status.tone === "free" && "border-emerald-100",
            status.tone === "busy" && "border-amber-100",
            status.tone === "closed" && "border-line-soft",
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "relative inline-flex w-3 h-3 rounded-full shrink-0",
                status.tone === "free" && "bg-emerald-500",
                status.tone === "busy" && "bg-amber-500",
                status.tone === "closed" && "bg-slate-400",
              )}
            >
              {status.tone === "free" && (
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "font-bold tracking-tight text-base leading-tight",
                  status.tone === "free" && "text-emerald-700",
                  status.tone === "busy" && "text-amber-700",
                  status.tone === "closed" && "text-ink-2",
                )}
              >
                {status.label}
              </p>
              <p className="text-xs text-ink-3 mt-0.5">{status.sub}</p>
            </div>
            <Clock
              size={20}
              className="text-ink-3 shrink-0"
              strokeWidth={1.5}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Timeline (cinema-seat style) ───────── */
function TimelineForDay({
  dayKey,
  bookings,
  now,
  roomColor,
}: {
  dayKey: string;
  bookings: BookingLite[];
  now: Date;
  roomColor: string;
}) {
  const day = new Date(`${dayKey}T00:00:00+07:00`);
  const isToday = sameDay(day, now);

  const slots = useMemo(() => {
    const out: Array<{
      time: string;
      label: string;
      minutes: number;
      status: "past" | "current" | "free" | "booked" | "in-use";
      bookingEnd?: string;
    }> = [];
    const todaysBookings = bookings.filter((b) =>
      sameDay(new Date(b.starts_at), day),
    );
    for (let m = SERVICE_START_MIN; m < SERVICE_END_MIN; m += SLOT_MIN) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      const time = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      const label = mm === 0 ? time : "";
      const slotStartMin = m;
      const slotEndMin = m + SLOT_MIN;

      const matching = todaysBookings.find((b) => {
        const bs = minutesOf(b.starts_at);
        const be = minutesOf(b.ends_at);
        return slotStartMin < be && slotEndMin > bs;
      });

      let status: "past" | "current" | "free" | "booked" | "in-use" = "free";
      if (matching) {
        status = matching.in_use ? "in-use" : "booked";
      }
      if (isToday) {
        const nowMin = now.getHours() * 60 + now.getMinutes();
        if (nowMin >= slotStartMin && nowMin < slotEndMin && status !== "booked")
          status = matching?.in_use ? "in-use" : "current";
        else if (nowMin >= slotEndMin && status === "free") status = "past";
      }
      out.push({
        time,
        label,
        minutes: slotStartMin,
        status,
        bookingEnd: matching
          ? new Date(matching.ends_at).toISOString()
          : undefined,
      });
    }
    return out;
  }, [bookings, dayKey, day, isToday, now]);

  // Free hours count for today
  const freeHours =
    slots.filter((s) => s.status === "free" || s.status === "current").length *
    0.5;

  // Compress consecutive same-status slots into single rows for cleaner UX
  type Block = {
    startMin: number;
    endMin: number;
    status: "past" | "current" | "free" | "booked" | "in-use";
  };
  const blocks: Block[] = useMemo(() => {
    const result: Block[] = [];
    for (const s of slots) {
      const last = result[result.length - 1];
      if (last && last.status === s.status) {
        last.endMin = s.minutes + SLOT_MIN;
      } else {
        result.push({
          startMin: s.minutes,
          endMin: s.minutes + SLOT_MIN,
          status: s.status,
        });
      }
    }
    return result;
  }, [slots]);

  // Auto-scroll to current time
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isToday) return;
    setTimeout(() => {
      const el = ref.current?.querySelector("[data-now=true]");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }, [isToday]);

  return (
    <div ref={ref}>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-sm font-semibold tracking-tight">
          {isToday
            ? "ตารางวันนี้"
            : day.toLocaleDateString("th-TH", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
        </p>
        <span className="text-[11px] text-emerald-700 tabular-nums font-medium">
          ว่าง {freeHours} ชม.
        </span>
      </div>

      <div className="rounded-card border border-line-soft bg-white overflow-hidden">
        {blocks.map((b, i) => {
          const sh = Math.floor(b.startMin / 60);
          const sm = b.startMin % 60;
          const eh = Math.floor(b.endMin / 60);
          const em = b.endMin % 60;
          const startLabel = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
          const endLabel = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
          const dur = (b.endMin - b.startMin) / 60;

          const isCurrent = b.status === "current" || b.status === "in-use";
          return (
            <div
              key={i}
              data-now={isCurrent && isToday ? true : undefined}
              className={cn(
                "flex items-stretch gap-3 px-3 py-2.5 border-b border-line-soft last:border-0 transition",
                b.status === "past" && "opacity-50",
                isCurrent && "bg-amber-50/40",
              )}
            >
              <div className="w-14 shrink-0 text-right">
                <p className="text-xs font-semibold tabular-nums leading-tight">
                  {startLabel}
                </p>
                <p className="text-[10px] text-ink-3 tabular-nums">
                  {endLabel}
                </p>
              </div>
              <div
                className={cn(
                  "w-1 rounded-full shrink-0 my-0.5",
                  b.status === "free" && "bg-emerald-400",
                  b.status === "current" && "bg-amber-500",
                  b.status === "in-use" && "bg-amber-500",
                  b.status === "booked" && "bg-rose-400",
                  b.status === "past" && "bg-slate-300",
                )}
              />
              <div className="flex-1 min-w-0 self-center">
                <p
                  className={cn(
                    "text-sm font-medium tracking-tight",
                    b.status === "free" && "text-emerald-800",
                    b.status === "current" && "text-amber-900",
                    b.status === "in-use" && "text-amber-900",
                    b.status === "booked" && "text-rose-800",
                    b.status === "past" && "text-ink-3",
                  )}
                >
                  {b.status === "free" && "ว่าง"}
                  {b.status === "current" && "ว่างตอนนี้"}
                  {b.status === "in-use" && "กำลังใช้งาน"}
                  {b.status === "booked" && "ถูกจองแล้ว"}
                  {b.status === "past" && "ผ่านไปแล้ว"}
                </p>
                <p className="text-[10px] text-ink-3 tabular-nums">
                  {dur >= 1
                    ? `${dur} ชม.`
                    : `${dur * 60} นาที`}
                </p>
              </div>
              {b.status === "free" && (
                <CheckCircle2
                  size={16}
                  className="text-emerald-500 self-center shrink-0"
                  strokeWidth={2}
                />
              )}
              {b.status === "current" && (
                <span
                  className="self-center text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-pill"
                  style={{ outline: `2px solid ${roomColor}22` }}
                >
                  ตอนนี้
                </span>
              )}
              {b.status === "in-use" && (
                <span className="self-center text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-pill">
                  ใช้งาน
                </span>
              )}
              {b.status === "booked" && (
                <AlertCircle
                  size={15}
                  className="text-rose-500 self-center shrink-0"
                  strokeWidth={1.75}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 px-1 text-[10px] text-ink-3 flex-wrap">
        <Legend color="bg-emerald-400" label="ว่าง" />
        <Legend color="bg-amber-500" label="กำลังใช้" />
        <Legend color="bg-rose-400" label="ถูกจอง" />
        <Legend color="bg-slate-300" label="ผ่านไปแล้ว" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("w-2 h-2 rounded-pill", color)} />
      {label}
    </span>
  );
}

/* ───────── Room info accordion ───────── */
function RoomInfoCard({ room }: { room: RoomLite }) {
  const [open, setOpen] = useState(false);
  if (room.amenities.length === 0 && room.perks.length === 0) return null;
  return (
    <div className="px-5 pt-4">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-card border border-line-soft bg-white"
      >
        <Sparkles size={14} className="text-primary-600 shrink-0" />
        <span className="text-sm font-medium tracking-tight flex-1 text-left">
          สิ่งอำนวยความสะดวก & สิทธิ์ฟรี
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "text-ink-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="mt-2 rounded-card border border-line-soft bg-white p-4 space-y-3">
          {room.amenities.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-1.5">
                สิ่งอำนวยความสะดวก
              </p>
              <div className="flex flex-wrap gap-1.5">
                {room.amenities.map((a) => (
                  <span
                    key={a}
                    className="px-2 py-1 rounded-pill bg-surface-subtle/80 border border-line-soft text-[11px] text-ink-2"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {room.perks.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-1.5">
                สิทธิ์ฟรีเพิ่ม
              </p>
              <div className="flex flex-wrap gap-1.5">
                {room.perks.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700"
                  >
                    <CheckCircle2 size={10} /> {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────── Other rooms strip ───────── */
function OtherRoomRow({
  room,
  now,
}: {
  room: OtherRoom;
  now: Date;
}) {
  const sub = room.is_busy_now
    ? room.next_free_at
      ? `ว่างหลัง ${fmtTime(new Date(room.next_free_at))}`
      : "กำลังใช้งานอยู่"
    : room.next_free_at
      ? `ว่างจนถึง ${fmtTime(new Date(room.next_free_at))}`
      : "ว่างทั้งวัน";
  void now;

  return (
    <Link
      href={room.slug ? `/rooms/${room.slug}` : "#"}
      className="flex items-center gap-3 px-3 py-2.5 rounded-card border border-line-soft bg-white hover:bg-surface-subtle/50 transition"
    >
      <div
        className="w-11 h-11 rounded-input overflow-hidden shrink-0 grid place-items-center text-white"
        style={{
          background: room.color,
        }}
      >
        {room.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={room.thumbnail_url}
            alt={room.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageOff size={14} className="opacity-60" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold tracking-tight text-sm truncate">
          {room.name}
        </p>
        <p className="text-[11px] text-ink-3 tabular-nums truncate">
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-pill mr-1.5 align-middle",
              room.is_busy_now ? "bg-amber-500" : "bg-emerald-500",
            )}
          />
          {sub}
        </p>
      </div>
      <ArrowRight size={14} className="text-ink-3 shrink-0" />
    </Link>
  );
}

/* ───────── Sticky bottom CTA ───────── */
function BottomCta({
  config,
  room,
}: {
  config: Config;
  room: RoomLite;
}) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-20 pointer-events-none">
      <div className="max-w-md mx-auto px-4 pb-5 pointer-events-auto">
        <div className="rounded-card-lg border border-line-soft bg-white/95 shadow-pop backdrop-blur-md p-3">
          <p className="text-[11px] text-ink-3 px-1 mb-2">
            {config.headline}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={config.line_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 h-11 rounded-pill bg-[#06C755] text-white text-sm font-semibold tracking-tight shadow-card active:scale-[0.98] transition"
            >
              <MessageCircle size={15} strokeWidth={2.25} />
              LINE
            </a>
            <a
              href={`tel:${config.phone.replace(/[^0-9+]/g, "")}`}
              className="flex items-center justify-center gap-1.5 h-11 rounded-pill bg-ink-1 text-white text-sm font-semibold tracking-tight shadow-card active:scale-[0.98] transition"
            >
              <Phone size={14} strokeWidth={2.25} />
              โทร
            </a>
          </div>
          <div className="flex items-center justify-center gap-1 mt-1.5">
            <Users size={9} className="text-ink-3" />
            <p className="text-[10px] text-ink-3 truncate">
              {room.name} · {config.line_id} · {config.phone}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
