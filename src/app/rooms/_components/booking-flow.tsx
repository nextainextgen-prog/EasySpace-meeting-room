"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Clock,
  Info,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, bkkParts, fromBkk, timeToMinutes } from "@/lib/time/bkk";
import {
  PUBLIC_SLOT_MINUTES,
  dateChip,
  durationLabel,
  formatBahtPlain,
  maxRunFrom,
  minutesToTime,
  publicRoomStatus,
  publicStartTimes,
  quotePublic,
  slotState,
  thaiDateLong,
  thaiDateShort,
  type PublicBusyBlock,
  type PublicChannel,
  type PublicPackage,
} from "@/lib/public-booking/shared";
import { refreshPublicBusy } from "@/lib/actions/public-booking";
import { amenityIcon } from "./chrome";
import { DetailsSheet } from "./details-sheet";
import { SuccessView, type BookingSuccess } from "./success-view";

export interface FlowRoom {
  id: string;
  name: string;
  slug: string;
  capacity_min: number | null;
  capacity_max: number | null;
  hourly_rate: number;
  color: string;
  thumbnail_url: string | null;
  gallery_urls: string[];
  amenities: string[];
  perks: string[];
  floor: string | null;
}

export interface FlowConfig {
  booking_enabled: boolean;
  booking_days_ahead: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  line_url: string;
  line_id: string;
  phone: string;
  confirm_message: string;
  show_capacity: boolean;
  show_hourly_rate: boolean;
}

export interface OtherRoomCard {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  color: string;
  capacity_min: number | null;
  capacity_max: number | null;
  hourly_rate: number;
  busy: PublicBusyBlock[];
}

export function BookingFlow({
  room,
  packages,
  busy: initialBusy,
  config,
  otherRooms,
  channel,
  serverNow,
}: {
  room: FlowRoom;
  packages: PublicPackage[];
  busy: PublicBusyBlock[];
  config: FlowConfig;
  otherRooms: OtherRoomCard[];
  channel: PublicChannel;
  serverNow: string;
}) {
  const [now, setNow] = useState(() => new Date(serverNow));
  const [busy, setBusy] = useState(initialBusy);
  const today = bkkParts(now).date;

  const minDur = config.min_duration_minutes;
  const maxDur = config.max_duration_minutes;

  const days = useMemo(
    () => Array.from({ length: config.booking_days_ahead + 1 }, (_, i) => addDays(today, i)),
    [today, config.booking_days_ahead],
  );

  // A day is bookable when at least one start fits the minimum length.
  const dayOpen = useMemo(() => {
    const starts = publicStartTimes();
    const map = new Map<string, boolean>();
    for (const d of days) {
      map.set(d, starts.some((t) => maxRunFrom(d, t, busy, now) >= minDur));
    }
    return map;
  }, [days, busy, now, minDur]);

  const [date, setDate] = useState(() => days.find((d) => dayOpen.get(d)) ?? today);
  const [start, setStart] = useState<string | null>(null);
  const [duration, setDuration] = useState(Math.max(minDur, 60));
  const [hint, setHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [success, setSuccess] = useState<BookingSuccess | null>(null);

  // ── Live data ──
  const refresh = useCallback(async () => {
    try {
      setBusy(await refreshPublicBusy(room.id));
    } catch {
      // offline / stale deployment — keep what we have
    }
    setNow(new Date());
  }, [room.id]);

  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 30_000);
    const poll = setInterval(refresh, 60_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // A selection that became unavailable (poll, clock) is dropped, not
  // silently shortened into something the customer did not pick.
  const maxRun = start ? maxRunFrom(date, start, busy, now) : 0;
  useEffect(() => {
    if (start && maxRun < Math.min(duration, minDur)) {
      setStart(null);
      setNotice("ช่วงเวลาที่เลือกไว้ไม่ว่างแล้ว กรุณาเลือกใหม่");
    } else if (start && duration > maxRun) {
      setDuration(Math.max(minDur, Math.floor(maxRun / PUBLIC_SLOT_MINUTES) * PUBLIC_SLOT_MINUTES));
    }
  }, [start, maxRun, duration, minDur]);

  const selection = start
    ? {
        start,
        end: minutesToTime(timeToMinutes(start) + duration),
        startsAt: fromBkk(date, start).toISOString(),
        endsAt: new Date(fromBkk(date, start).getTime() + duration * 60_000).toISOString(),
      }
    : null;
  const quote = quotePublic(room.hourly_rate, packages, duration);

  function pickDate(d: string) {
    setDate(d);
    setStart(null);
    setHint(null);
    setNotice(null);
  }

  function pickTime(t: string) {
    setNotice(null);
    const tMin = timeToMinutes(t);
    if (start) {
      const sMin = timeToMinutes(start);
      if (tMin === sMin) {
        setStart(null);
        setHint(null);
        return;
      }
      // Tapping later inside the free run stretches the booking to that slot.
      if (tMin > sMin && tMin + PUBLIC_SLOT_MINUTES - sMin <= Math.min(maxRun, maxDur)) {
        setDuration(Math.max(minDur, tMin + PUBLIC_SLOT_MINUTES - sMin));
        setHint(null);
        return;
      }
    }
    const run = maxRunFrom(date, t, busy, now);
    if (run < minDur) {
      setHint(`เริ่ม ${t} ได้ไม่ถึง ${durationLabel(minDur)} — เลือกเวลาเริ่มที่เร็วกว่านี้`);
      return;
    }
    setStart(t);
    setDuration(Math.min(Math.max(minDur, 60), run, maxDur));
    setHint(null);
  }

  function stepDuration(delta: number) {
    const next = duration + delta;
    if (next < minDur || next > Math.min(maxRun, maxDur)) return;
    setDuration(next);
  }

  const status = useMemo(() => roomStatusNow(busy, now), [busy, now]);

  if (success) {
    return (
      <SuccessView
        success={success}
        room={room}
        config={config}
        channel={channel}
        onDone={() => {
          setSuccess(null);
          setStart(null);
          void refresh();
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-4 sm:px-6 lg:pb-8 lg:pt-8">
        {/* Breadcrumb */}
        <nav className="mb-4 hidden items-center gap-1.5 text-[12px] text-ink-3 lg:flex">
          <Link href={`/rooms?src=${channel}`} className="hover:text-ink-1">
            ห้องประชุมทั้งหมด
          </Link>
          <ChevronRight size={12} strokeWidth={1.75} />
          <span className="text-ink-2">{room.name}</span>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-8">
          {/* ── Left: room ── */}
          <div className="min-w-0 space-y-6">
            <RoomHero room={room} config={config} status={status} />
            <div className="lg:hidden">
              {config.booking_enabled ? (
                <PickerCard
                  {...{ days, dayOpen, date, pickDate, start, pickTime, busy, now, selection, duration, stepDuration, maxRun, maxDur, minDur, hint, notice, today }}
                />
              ) : (
                <ContactCard config={config} />
              )}
            </div>
            <RoomDetails room={room} packages={packages} config={config} />
            {otherRooms.length > 0 && (
              <OtherRooms rooms={otherRooms} channel={channel} now={now} />
            )}
          </div>

          {/* ── Right: sticky booking panel (desktop) ── */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-4">
              {config.booking_enabled ? (
                <>
                  <PickerCard
                    {...{ days, dayOpen, date, pickDate, start, pickTime, busy, now, selection, duration, stepDuration, maxRun, maxDur, minDur, hint, notice, today }}
                  />
                  <SummaryCard
                    room={room}
                    date={date}
                    selection={selection}
                    duration={duration}
                    quote={quote}
                    onContinue={() => setSheetOpen(true)}
                  />
                </>
              ) : (
                <ContactCard config={config} />
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ── Mobile sticky CTA ── */}
      {config.booking_enabled && (
        <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
          <div className="border-t border-slate-900/[0.07] bg-white/90 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl">
            <div className="mx-auto flex max-w-xl items-center gap-3">
              <div className="min-w-0 flex-1">
                {selection ? (
                  <>
                    <p className="truncate text-[12px] font-medium text-ink-2 tabular-nums">
                      {thaiDateShort(date)} · {selection.start}–{selection.end} น.
                    </p>
                    <p className="text-[19px] font-bold leading-tight tracking-tighter tabular-nums">
                      ฿{formatBahtPlain(quote.total)}
                      <span className="ml-1.5 text-[12px] font-medium tracking-tight text-ink-3">
                        {durationLabel(duration)}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] text-ink-3">ยังไม่ได้เลือกเวลา</p>
                    <p className="text-[15px] font-semibold tracking-tight">เลือกช่วงเวลาที่ต้องการ</p>
                  </>
                )}
              </div>
              <button
                type="button"
                disabled={!selection}
                onClick={() => setSheetOpen(true)}
                className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-pill bg-primary-600 px-6 text-[15px] font-semibold tracking-tight text-white shadow-[0_8px_20px_-6px_rgba(45,78,245,0.55)] transition active:scale-[0.98] disabled:bg-slate-200 disabled:text-ink-3 disabled:shadow-none"
              >
                จองห้องนี้
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      )}

      {sheetOpen && selection && (
        <DetailsSheet
          room={room}
          date={date}
          selection={selection}
          duration={duration}
          quote={quote}
          channel={channel}
          onClose={() => setSheetOpen(false)}
          onSlotTaken={async (message) => {
            setSheetOpen(false);
            setStart(null);
            setNotice(message);
            await refresh();
          }}
          onSuccess={(s) => {
            setSheetOpen(false);
            setSuccess(s);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </>
  );
}

type RoomStatus = ReturnType<typeof publicRoomStatus>;
const roomStatusNow = publicRoomStatus;

/* ───────────────────────── Hero ───────────────────────── */

function RoomHero({
  room,
  config,
  status,
}: {
  room: FlowRoom;
  config: FlowConfig;
  status: RoomStatus;
}) {
  const images = [room.thumbnail_url, ...room.gallery_urls].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const capacity =
    room.capacity_min && room.capacity_max
      ? `${room.capacity_min}–${room.capacity_max} ท่าน`
      : room.capacity_max
        ? `สูงสุด ${room.capacity_max} ท่าน`
        : null;

  // Room photos often carry their own captions, so nothing is laid over the
  // lower part of the image — the title lives in the panel underneath.
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-900/[0.07] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(15,23,42,0.22)]">
      <div
        className="relative aspect-[16/10] w-full overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${room.color}, ${room.color}B3)` }}
      >
        {images.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[idx]}
            alt={room.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/50">
            <Building2 size={56} strokeWidth={1.25} />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/35 to-transparent" />

        <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-pill border border-white/40 bg-white/90 px-3 py-1.5 text-[12px] font-semibold tracking-tight shadow-sm backdrop-blur-md",
              status.tone === "free" && "text-emerald-700",
              status.tone === "busy" && "text-amber-700",
              status.tone === "closed" && "text-ink-2",
            )}
          >
            <span className="relative flex h-2 w-2">
              {status.tone === "free" && (
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-50" />
              )}
              <span
                className={cn(
                  "relative h-2 w-2 rounded-full",
                  status.tone === "free" && "bg-emerald-500",
                  status.tone === "busy" && "bg-amber-500",
                  status.tone === "closed" && "bg-slate-400",
                )}
              />
            </span>
            {status.label}
            <span className="font-medium text-ink-3">· {status.sub}</span>
          </span>
        </div>

        {images.length > 1 && (
          <div className="absolute right-4 top-4 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`รูปที่ ${i + 1}`}
                onClick={() => setIdx(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === idx ? "w-5 bg-white" : "w-1.5 bg-white/60",
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <p className="text-[12px] font-semibold tracking-tight text-primary-600">
          ห้องประชุม{room.floor ? ` · ชั้น ${room.floor}` : ""}
        </p>
        <h1 className="mt-1 text-[28px] font-bold leading-[1.08] tracking-tightest sm:text-[34px]">
          {room.name}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.show_capacity && capacity && <HeroChip icon={Users}>{capacity}</HeroChip>}
          {config.show_hourly_rate && room.hourly_rate > 0 && (
            <HeroChip icon={Wallet}>฿{formatBahtPlain(room.hourly_rate)} / ชม.</HeroChip>
          )}
          <HeroChip icon={Clock}>เปิด 08:30 – 22:00</HeroChip>
        </div>
      </div>
    </section>
  );
}

function HeroChip({
  icon: Icon,
  children,
}: {
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-slate-50 px-3 py-1.5 text-[12.5px] font-medium tracking-tight text-ink-2 ring-1 ring-slate-900/[0.06] tabular-nums">
      <Icon size={14} strokeWidth={1.75} className="text-ink-3" />
      {children}
    </span>
  );
}

/* ───────────────────────── Picker ───────────────────────── */

interface PickerProps {
  days: string[];
  dayOpen: Map<string, boolean>;
  date: string;
  today: string;
  pickDate: (d: string) => void;
  start: string | null;
  pickTime: (t: string) => void;
  busy: PublicBusyBlock[];
  now: Date;
  selection: { start: string; end: string } | null;
  duration: number;
  stepDuration: (delta: number) => void;
  maxRun: number;
  maxDur: number;
  minDur: number;
  hint: string | null;
  notice: string | null;
}

function PickerCard(p: PickerProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-date="${p.date}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [p.date]);

  const chip = dateChip(p.date);
  const starts = publicStartTimes();
  const cells = starts.map((t) => ({ t, state: slotState(p.date, t, p.busy, p.now) }));
  const visible = cells.filter((c) => c.state !== "past");
  const freeMinutes = visible.filter((c) => c.state === "free").length * PUBLIC_SLOT_MINUTES;

  const groups = [
    { label: "ช่วงเช้า", cells: visible.filter((c) => timeToMinutes(c.t) < 12 * 60) },
    {
      label: "ช่วงบ่าย",
      cells: visible.filter((c) => timeToMinutes(c.t) >= 12 * 60 && timeToMinutes(c.t) < 17 * 60),
    },
    { label: "ช่วงเย็น", cells: visible.filter((c) => timeToMinutes(c.t) >= 17 * 60) },
  ].filter((g) => g.cells.length > 0);

  const sMin = p.start ? timeToMinutes(p.start) : -1;
  const eMin = p.start ? sMin + p.duration : -1;

  return (
    <section className="rounded-card-lg border border-slate-900/[0.07] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold tracking-tight text-primary-600">
            ขั้นตอนที่ 1
          </p>
          <h2 className="mt-0.5 text-[19px] font-bold tracking-tighter">เลือกวันและเวลา</h2>
        </div>
        <p className="pb-0.5 text-[12px] font-medium text-ink-3 tabular-nums">
          {chip.monthLong} {chip.yearBE}
        </p>
      </div>

      {/* Dates */}
      <div
        ref={stripRef}
        className="-mx-4 mt-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-5 sm:px-5"
      >
        {p.days.map((d) => {
          const c = dateChip(d);
          const active = d === p.date;
          const open = p.dayOpen.get(d);
          return (
            <button
              key={d}
              type="button"
              data-date={d}
              onClick={() => p.pickDate(d)}
              className={cn(
                "flex h-[76px] w-[58px] shrink-0 snap-start flex-col items-center justify-center rounded-[18px] border transition",
                active
                  ? "border-ink-1 bg-ink-1 text-white shadow-[0_8px_18px_-8px_rgba(15,23,42,0.6)]"
                  : "border-slate-900/[0.08] bg-white text-ink-1 hover:border-slate-900/20",
                !open && !active && "bg-slate-50 text-ink-3",
              )}
            >
              <span className={cn("text-[11px] font-medium", active ? "text-white/70" : "text-ink-3")}>
                {d === p.today ? "วันนี้" : c.weekdayShort}
              </span>
              <span className="text-[20px] font-bold leading-tight tracking-tighter tabular-nums">
                {c.day}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium",
                  active ? "text-white/70" : open ? "text-emerald-600" : "text-ink-3",
                )}
              >
                {open ? c.monthShort : "เต็ม"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Times */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-[13px] font-semibold tracking-tight">{thaiDateLong(p.date)}</p>
        {visible.length > 0 && (
          <p className="text-[12px] font-medium text-emerald-700 tabular-nums">
            ว่าง {durationLabel(freeMinutes)}
          </p>
        )}
      </div>

      {p.notice && (
        <div className="mt-3 flex items-start gap-2 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
          <Info size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          {p.notice}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mt-3 rounded-[16px] border border-dashed border-slate-900/10 bg-slate-50 px-4 py-6 text-center">
          <p className="text-[14px] font-semibold tracking-tight">หมดเวลาให้บริการของวันนี้แล้ว</p>
          <p className="mt-1 text-[12px] text-ink-3">เลือกวันถัดไปเพื่อจองล่วงหน้า</p>
          {p.days[1] && (
            <button
              type="button"
              onClick={() => p.pickDate(p.days[1])}
              className="mt-3 inline-flex h-9 items-center gap-1 rounded-pill bg-ink-1 px-4 text-[13px] font-semibold text-white"
            >
              ดูพรุ่งนี้ <ChevronRight size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-[12px] font-semibold tracking-tight text-ink-3">
                {g.label}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {g.cells.map(({ t, state }) => {
                  const m = timeToMinutes(t);
                  const inRange = p.start && m >= sMin && m < eMin;
                  const isEdge = inRange && (m === sMin || m + PUBLIC_SLOT_MINUTES === eMin);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={state === "busy"}
                      onClick={() => p.pickTime(t)}
                      aria-pressed={Boolean(inRange)}
                      className={cn(
                        "h-11 rounded-[12px] border text-[13.5px] font-semibold tracking-tight tabular-nums transition",
                        state === "busy" &&
                          "cursor-not-allowed border-transparent bg-[repeating-linear-gradient(135deg,#F1F5F9_0_5px,#E8EDF3_5px_10px)] text-ink-3/80 line-through decoration-ink-3/50",
                        state === "free" && !inRange &&
                          "border-slate-900/[0.08] bg-white text-ink-1 hover:border-primary-600/40 hover:bg-primary-50/40",
                        inRange && !isEdge && "border-primary-100 bg-primary-50 text-primary-700",
                        isEdge && "border-primary-600 bg-primary-600 text-white shadow-[0_6px_14px_-6px_rgba(45,78,245,0.7)]",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {p.hint && (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-amber-700">
          <Info size={14} strokeWidth={1.75} /> {p.hint}
        </p>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-3">
        <Legend className="border border-slate-900/15 bg-white" label="ว่าง" />
        <Legend className="bg-primary-600" label="ที่เลือก" />
        <Legend className="bg-[repeating-linear-gradient(135deg,#E2E8F0_0_3px,#CBD5E1_3px_6px)]" label="ไม่ว่าง" />
      </div>

      {/* Duration */}
      {p.selection && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-ink-3">ช่วงเวลาที่เลือก</p>
            <p className="whitespace-nowrap text-[15px] font-bold tracking-tight tabular-nums">
              {p.selection.start}–{p.selection.end} น.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-pill border border-slate-900/[0.08] bg-white p-1">
            <StepButton
              label="ลดเวลา"
              disabled={p.duration - PUBLIC_SLOT_MINUTES < p.minDur}
              onClick={() => p.stepDuration(-PUBLIC_SLOT_MINUTES)}
            >
              <Minus size={16} strokeWidth={2} />
            </StepButton>
            <span className="min-w-[72px] text-center text-[13px] font-semibold tabular-nums">
              {durationLabel(p.duration)}
            </span>
            <StepButton
              label="เพิ่มเวลา"
              disabled={p.duration + PUBLIC_SLOT_MINUTES > Math.min(p.maxRun, p.maxDur)}
              onClick={() => p.stepDuration(PUBLIC_SLOT_MINUTES)}
            >
              <Plus size={16} strokeWidth={2} />
            </StepButton>
          </div>
        </div>
      )}
    </section>
  );
}

function StepButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-full text-ink-1 transition hover:bg-slate-100 disabled:text-ink-3/50 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-[4px]", className)} />
      {label}
    </span>
  );
}

/* ───────────────────────── Summary (desktop) ───────────────────────── */

function SummaryCard({
  room,
  date,
  selection,
  duration,
  quote,
  onContinue,
}: {
  room: FlowRoom;
  date: string;
  selection: { start: string; end: string } | null;
  duration: number;
  quote: ReturnType<typeof quotePublic>;
  onContinue: () => void;
}) {
  return (
    <section className="rounded-card-lg border border-slate-900/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)]">
      {selection ? (
        <>
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            <CalendarDays size={16} strokeWidth={1.75} className="text-ink-3" />
            <span className="tabular-nums">
              {thaiDateShort(date)} · {selection.start}–{selection.end} น.
            </span>
          </div>
          <PriceLines room={room} duration={duration} quote={quote} />
        </>
      ) : (
        <p className="text-[13px] text-ink-3">เลือกวันและเวลาเพื่อดูราคา</p>
      )}
      <button
        type="button"
        disabled={!selection}
        onClick={onContinue}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-pill bg-primary-600 text-[15px] font-semibold tracking-tight text-white shadow-[0_10px_24px_-10px_rgba(45,78,245,0.7)] transition hover:bg-primary-700 active:scale-[0.99] disabled:bg-slate-200 disabled:text-ink-3 disabled:shadow-none"
      >
        จองห้องนี้ <ChevronRight size={16} strokeWidth={2} />
      </button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-3">
        <ShieldCheck size={14} strokeWidth={1.75} /> ยังไม่ต้องชำระเงิน · ทีมงานยืนยันก่อนทุกครั้ง
      </p>
    </section>
  );
}

export function PriceLines({
  room,
  duration,
  quote,
}: {
  room: { hourly_rate: number };
  duration: number;
  quote: ReturnType<typeof quotePublic>;
}) {
  return (
    <div className="mt-3 space-y-2 text-[13.5px]">
      <div className="flex justify-between text-ink-2 tabular-nums">
        <span>
          ฿{formatBahtPlain(room.hourly_rate)} × {durationLabel(duration)}
        </span>
        <span className={cn(quote.packageName && "text-ink-3 line-through")}>
          ฿{formatBahtPlain(quote.hourlyTotal)}
        </span>
      </div>
      {quote.packageName && (
        <div className="flex justify-between text-emerald-700 tabular-nums">
          <span>แพ็กเกจ {quote.packageName}</span>
          <span>ประหยัด ฿{formatBahtPlain(quote.saving)}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t border-dashed border-slate-900/10 pt-2.5">
        <span className="font-semibold tracking-tight">ราคารวม</span>
        <span className="text-[22px] font-bold tracking-tighter tabular-nums">
          ฿{formatBahtPlain(quote.total)}
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────── Details ───────────────────────── */

function RoomDetails({
  room,
  packages,
  config,
}: {
  room: FlowRoom;
  packages: PublicPackage[];
  config: FlowConfig;
}) {
  const visiblePackages = packages.filter(
    (p) => p.price < Math.round(p.hours * room.hourly_rate),
  );
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {room.amenities.length > 0 && (
        <div className="rounded-card-lg border border-slate-900/[0.07] bg-white p-5 sm:col-span-2">
          <h3 className="text-[15px] font-bold tracking-tight">สิ่งอำนวยความสะดวก</h3>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {room.amenities.map((a) => {
              const Icon = amenityIcon(a);
              return (
                <div key={a} className="flex items-center gap-2.5 text-[13px] text-ink-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-slate-50 text-ink-1">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <span className="leading-snug">{a}</span>
                </div>
              );
            })}
          </div>
          {room.perks.length > 0 && (
            <div className="mt-4 border-t border-slate-900/[0.06] pt-4">
              <p className="text-[12px] font-semibold tracking-tight text-ink-3">
                รวมในราคา
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {room.perks.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-700"
                  >
                    <CircleCheck size={13} strokeWidth={2} /> {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {config.show_hourly_rate && visiblePackages.length > 0 && (
        <div className="rounded-card-lg border border-slate-900/[0.07] bg-white p-5 sm:col-span-2">
          <h3 className="text-[15px] font-bold tracking-tight">แพ็กเกจคุ้มกว่า</h3>
          <p className="mt-0.5 text-[12px] text-ink-3">ระบบเลือกราคาที่ถูกที่สุดให้อัตโนมัติ</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {visiblePackages.map((p) => (
              <div key={p.id} className="rounded-[16px] border border-slate-900/[0.07] bg-slate-50/60 px-3.5 py-3">
                <p className="text-[12px] font-medium text-ink-2">{p.name}</p>
                <p className="mt-0.5 text-[17px] font-bold tracking-tighter tabular-nums">
                  ฿{formatBahtPlain(p.price)}
                </p>
                <p className="text-[11px] text-ink-3 tabular-nums">{p.hours} ชม.</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-card-lg border border-slate-900/[0.07] bg-white p-5 sm:col-span-2">
        <h3 className="text-[15px] font-bold tracking-tight">ขั้นตอนการจอง</h3>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["เลือกเวลาและกรอกข้อมูล", "ห้องจะถูกกันไว้ให้คุณทันทีหลังกดยืนยัน"],
            ["ทีมงานโทรยืนยัน", "แจ้งรายละเอียดและช่องทางชำระเงิน"],
            ["เข้าใช้ห้องได้เลย", "มาถึงก่อนเวลาเล็กน้อยเพื่อเตรียมตัว"],
          ].map(([title, sub], i) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-1 text-[12px] font-bold text-white">
                {i + 1}
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold tracking-tight">{title}</span>
                <span className="block text-[12px] leading-relaxed text-ink-3">{sub}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ContactCard({ config }: { config: FlowConfig }) {
  return (
    <section className="rounded-card-lg border border-slate-900/[0.07] bg-white p-5">
      <h2 className="text-[17px] font-bold tracking-tight">ติดต่อจองห้อง</h2>
      <p className="mt-1 text-[13px] text-ink-2">
        ขณะนี้ปิดรับจองออนไลน์ชั่วคราว ติดต่อทีมงานเพื่อจองได้ทันที
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={config.line_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center gap-1.5 rounded-pill bg-[#06C755] text-[14px] font-semibold text-white"
        >
          <MessageCircle size={16} strokeWidth={2} /> LINE
        </a>
        <a
          href={`tel:${config.phone.replace(/[^0-9+]/g, "")}`}
          className="inline-flex h-12 items-center justify-center gap-1.5 rounded-pill bg-ink-1 text-[14px] font-semibold text-white"
        >
          <Phone size={16} strokeWidth={2} /> โทร
        </a>
      </div>
    </section>
  );
}

/* ───────────────────────── Other rooms ───────────────────────── */

function OtherRooms({
  rooms,
  channel,
  now,
}: {
  rooms: OtherRoomCard[];
  channel: string;
  now: Date;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h3 className="text-[17px] font-bold tracking-tighter">ห้องอื่นที่น่าสนใจ</h3>
        <Link
          href={`/rooms?src=${channel}`}
          className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-primary-600"
        >
          ดูทั้งหมด <ChevronRight size={14} strokeWidth={2} />
        </Link>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
        {rooms.map((r) => {
          const st = roomStatusNow(r.busy, now);
          return (
            <Link
              key={r.id}
              href={`/rooms/${r.slug}?src=${channel}`}
              className="group w-[260px] shrink-0 snap-start overflow-hidden rounded-card-lg border border-slate-900/[0.07] bg-white transition hover:shadow-card-hover sm:w-auto"
            >
              <div
                className="relative aspect-[16/10] overflow-hidden"
                style={{ background: r.color }}
              >
                {r.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnail_url}
                    alt={r.name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                )}
                <span
                  className={cn(
                    "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-white/90 px-2.5 py-1 text-[11px] font-semibold backdrop-blur",
                    st.tone === "free" ? "text-emerald-700" : st.tone === "busy" ? "text-amber-700" : "text-ink-2",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      st.tone === "free" ? "bg-emerald-500" : st.tone === "busy" ? "bg-amber-500" : "bg-slate-400",
                    )}
                  />
                  {st.label}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold tracking-tight">{r.name}</p>
                  <p className="text-[12px] text-ink-3 tabular-nums">
                    {r.capacity_max ? `${r.capacity_min ?? 1}–${r.capacity_max} ท่าน · ` : ""}฿
                    {formatBahtPlain(r.hourly_rate)}/ชม.
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50 text-ink-1 transition group-hover:bg-primary-600 group-hover:text-white">
                  <ArrowUpRight size={16} strokeWidth={1.75} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
