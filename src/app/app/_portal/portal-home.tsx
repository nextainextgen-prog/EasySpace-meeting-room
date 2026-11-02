"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Clock3,
  Loader2,
  MessageCircle,
  Pencil,
  Repeat,
  Send,
  Sparkles,
  Square,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { bkkDate, bkkTime } from "@/lib/time/bkk";
import { portalBook, portalCancel, portalEndNow, portalExtend, portalRename } from "@/lib/actions/portal";
import type { OwnBooking } from "@/lib/server/member-ops";
import type { PortalData } from "@/lib/server/portal-data";
import { Modal } from "@/components/ui/modal";
import { Availability } from "./availability";
import { BookingSheet, type SheetMode } from "./booking-sheet";
import { dayChip } from "./format";
import { clockText, durationText, hoursText, useNow } from "./use-now";

export function PortalHome({ data }: { data: PortalData }) {
  const router = useRouter();
  const now = useNow(data.serverNow);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<OwnBooking | null>(null);
  const [renaming, setRenaming] = useState<OwnBooking | null>(null);

  // Keep the page honest without a reload: refresh every minute while visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  function done(text: string, ok = true) {
    setToast({ text, ok });
    setSheet(null);
    router.refresh();
  }

  const current = data.upcoming.find((b) => Date.parse(b.startsAt) <= now && Date.parse(b.endsAt) > now) ?? null;
  const next = data.upcoming.find((b) => Date.parse(b.startsAt) > now) ?? null;
  const firstName = data.me.name.split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-[1240px] px-4 md:px-6 py-5 md:py-7">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
            สวัสดี คุณ{firstName}
          </h1>
          <p className="text-sm text-ink-2 mt-1">
            {dayChip(data.today, data.today).long.replace("วันนี้ · ", "วัน")} · {data.me.orgName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheet({ kind: "new" })}
          data-tour="book"
          className="h-11 px-5 rounded-pill bg-primary-600 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-card hover:bg-primary-700 active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100"
        >
          <CalendarPlus size={18} strokeWidth={1.75} />
          จองห้อง
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        <div className="lg:col-span-8 space-y-5 min-w-0">
          <NowCard
            current={current}
            next={next}
            now={now}
            today={data.today}
            onBook={() => setSheet({ kind: "new" })}
            onMove={(b) => setSheet({ kind: "move", booking: b })}
            onCancel={setConfirmCancel}
            onResult={(r) => done(r.message, r.ok)}
          />
          <div className="lg:hidden">
            <UsageCard data={data} />
          </div>
          <QuickBook data={data} onAdjust={(p) => setSheet({ kind: "new", ...p })} onResult={(r) => done(r.message, r.ok)} />
          <Availability data={data} now={now} onBook={(p) => setSheet({ kind: "new", ...p })} />
          <BookingsList
            data={data}
            now={now}
            onMove={(b) => setSheet({ kind: "move", booking: b })}
            onCancel={setConfirmCancel}
            onRename={setRenaming}
            onResult={(r) => done(r.message, r.ok)}
          />
        </div>

        <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-24 min-w-0">
          <div className="hidden lg:block">
            <UsageCard data={data} />
          </div>
          <TelegramCard data={data} />
        </aside>
      </div>

      <BookingSheet data={data} mode={sheet} onClose={() => setSheet(null)} onDone={(m) => done(m)} />
      <CancelDialog booking={confirmCancel} onClose={() => setConfirmCancel(null)} onDone={(r) => { setConfirmCancel(null); done(r.message, r.ok); }} />
      <RenameDialog booking={renaming} onClose={() => setRenaming(null)} onDone={(r) => { setRenaming(null); done(r.message, r.ok); }} />

      <div aria-live="polite" className="fixed bottom-5 inset-x-0 flex justify-center px-4 z-[60] pointer-events-none">
        {toast && (
          <div
            className={cn(
              "pointer-events-auto max-w-md w-full sm:w-auto rounded-card-sm px-4 py-3 text-sm shadow-pop flex items-center gap-3",
              toast.ok ? "bg-ink-1 text-white" : "bg-red-600 text-white",
            )}
          >
            <span className="flex-1">{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="ปิด" className="opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type Result = { ok: boolean; message: string };

// ─── Now / next ────────────────────────────────────────────────────────────

function NowCard({
  current,
  next,
  now,
  today,
  onBook,
  onMove,
  onCancel,
  onResult,
}: {
  current: OwnBooking | null;
  next: OwnBooking | null;
  now: number;
  today: string;
  onBook: () => void;
  onMove: (b: OwnBooking) => void;
  onCancel: (b: OwnBooking) => void;
  onResult: (r: Result) => void;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) => start(async () => onResult(await fn()));

  if (current) {
    const total = Date.parse(current.endsAt) - Date.parse(current.startsAt);
    const left = Date.parse(current.endsAt) - now;
    const progress = Math.min(100, Math.max(0, ((total - left) / total) * 100));
    return (
      <section data-tour="now" className="rounded-card-lg bg-primary-600 text-white p-5 md:p-6 shadow-hero">
        <div className="flex items-center gap-2 text-sm text-white/85">
          <span className="w-2 h-2 rounded-full bg-emerald-300" />
          กำลังใช้ห้องอยู่ · {current.roomName}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight truncate">{current.title}</p>
            <p className="text-sm text-white/80 tabular-nums">
              {bkkTime(current.startsAt)}–{bkkTime(current.endsAt)} · {current.reference}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/75">เหลือเวลา</p>
            <p className="text-4xl md:text-5xl font-bold tracking-tighter tabular-nums leading-none">{clockText(left)}</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-white/25 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-white rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[15, 30, 60].map((m) => (
            <button
              key={m}
              type="button"
              disabled={pending}
              onClick={() => run(() => portalExtend(current.id, m))}
              className="h-9 px-4 rounded-pill bg-white/15 hover:bg-white/25 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
            >
              <Timer size={14} strokeWidth={1.75} />
              ต่อ {m === 60 ? "1 ชม." : `${m} นาที`}
            </button>
          ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => portalEndNow(current.id))}
            className="h-9 px-4 rounded-pill bg-white text-primary-700 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Square size={13} strokeWidth={2} />}
            จบประชุม คืนห้อง
          </button>
        </div>
      </section>
    );
  }

  if (next) {
    const until = Date.parse(next.startsAt) - now;
    const d = bkkDate(next.startsAt);
    return (
      <section data-tour="now" className="rounded-card-lg bg-white border border-line-soft shadow-card p-5 md:p-6">
        <p className="text-sm text-ink-2 flex items-center gap-2">
          <CalendarClock size={16} strokeWidth={1.75} className="text-primary-600" />
          ประชุมถัดไป
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight text-ink-1 truncate">{next.title}</p>
            <p className="text-sm text-ink-2 tabular-nums">
              {next.roomName} · {dayChip(d, today).label} {bkkTime(next.startsAt)}–{bkkTime(next.endsAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-3">เริ่มในอีก</p>
            <p className="text-3xl md:text-4xl font-bold tracking-tighter text-primary-600 tabular-nums leading-none">
              {until < 3_600_000 ? clockText(until) : durationText(until)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SoftButton onClick={() => onMove(next)} icon={<Clock3 size={14} strokeWidth={1.75} />}>
            เลื่อนเวลา
          </SoftButton>
          <SoftButton onClick={() => onCancel(next)} icon={<X size={14} strokeWidth={1.75} />}>
            ยกเลิก
          </SoftButton>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-card-lg bg-white border border-line-soft shadow-card p-5 md:p-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-lg font-semibold tracking-tight text-ink-1">ยังไม่มีการจองที่กำลังจะมาถึง</p>
        <p className="text-sm text-ink-2 mt-1">เลือกเวลาที่แนะนำด้านล่าง หรือแตะช่องว่างในตารางเพื่อจองได้เลย</p>
      </div>
      <button
        type="button"
        onClick={onBook}
        className="h-10 px-4 rounded-pill border border-line text-sm font-semibold text-primary-700 inline-flex items-center gap-1.5 hover:bg-primary-50"
      >
        จองห้อง <ArrowRight size={14} />
      </button>
    </section>
  );
}

function SoftButton({ onClick, icon, children, disabled }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 px-3.5 rounded-pill border border-line text-sm font-medium text-ink-1 inline-flex items-center gap-1.5 hover:bg-surface-subtle disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100"
    >
      {icon}
      {children}
    </button>
  );
}

// ─── Usage ─────────────────────────────────────────────────────────────────

function UsageCard({ data }: { data: PortalData }) {
  const u = data.usage;
  const pct = u.unlimited || !u.quotaHours ? 0 : Math.min(100, (u.orgHours / u.quotaHours) * 100);
  return (
    <section data-tour="usage" aria-labelledby="usage-h" className="rounded-card bg-white border border-line-soft shadow-card p-5">
      <h2 id="usage-h" className="text-sm font-semibold text-ink-2">
        การใช้งานเดือน{u.monthLabel}
      </h2>
      {u.unlimited ? (
        <>
          <p className="mt-3 text-3xl font-bold tracking-tighter text-ink-1">ไม่จำกัดชั่วโมง</p>
          <p className="mt-1 text-sm text-ink-2">{data.me.orgName} จองไปแล้ว {hoursText(u.orgHours)}</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-xs text-ink-3">โควตาบริษัทคงเหลือ</p>
          <p className={cn("text-3xl font-bold tracking-tighter tabular-nums", u.remainingHours! <= 1 ? "text-red-600" : "text-ink-1")}>
            {hoursText(u.remainingHours!)}
          </p>
          <div className="mt-3 h-2 rounded-full bg-surface-subtle overflow-hidden">
            <div
              className={cn("h-full rounded-full", pct >= 90 ? "bg-red-500" : "bg-primary-600")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-2 tabular-nums">
            บริษัทใช้ไป {hoursText(u.orgHours)} จาก {hoursText(u.quotaHours)}
          </p>
        </>
      )}
      <dl className="mt-4 pt-4 border-t border-line-soft grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-ink-3">คุณจองเดือนนี้</dt>
          <dd className="text-lg font-bold tracking-tight text-ink-1 tabular-nums">{u.myCount} ครั้ง</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">รวมเวลา</dt>
          <dd className="text-lg font-bold tracking-tight text-ink-1 tabular-nums">{hoursText(u.myHours)}</dd>
        </div>
      </dl>
    </section>
  );
}

// ─── Quick book ────────────────────────────────────────────────────────────

function QuickBook({
  data,
  onAdjust,
  onResult,
}: {
  data: PortalData;
  onAdjust: (p: { roomId: string; date: string; start: string; end: string; title?: string }) => void;
  onResult: (r: Result) => void;
}) {
  const [picked, setPicked] = useState<{ roomId: string; date: string; start: string; end: string; roomName: string } | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = data.suggestions.filter((s) => s.slots.length > 0);
  const recentTitles = useMemo(
    () => [...new Set([...data.upcoming, ...data.past].map((b) => b.title).filter((t) => t && t !== "ประชุม"))].slice(0, 3),
    [data.upcoming, data.past],
  );
  if (list.length === 0) return null;

  function book() {
    if (!picked || !title.trim()) return;
    setError(null);
    start(async () => {
      const res = await portalBook({ ...picked, title: title.trim() });
      if (!res.ok) return setError(res.message);
      setPicked(null);
      setTitle("");
      onResult({ ok: true, message: `จอง ${res.roomName} ${dayChip(picked.date, data.today).label} ${picked.start}–${picked.end} แล้ว` });
    });
  }

  return (
    <section data-tour="quick" aria-labelledby="quick-h" className="rounded-card bg-white border border-line-soft shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="quick-h" className="text-base font-bold tracking-tight text-ink-1 flex items-center gap-2">
            <Sparkles size={16} strokeWidth={1.75} className="text-primary-600" />
            จองด่วน ห้องที่ใช้บ่อย
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">เวลาแนะนำจากการใช้งานของคุณ เช็กแล้วว่ายังว่าง</p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line-soft">
        {list.map((s) => (
          <li key={s.roomId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-semibold tracking-tight text-ink-1">{s.roomName}</p>
              <p className="text-[11px] text-ink-3">{s.habit}</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.slots.map((slot) => {
                const active = picked?.roomId === s.roomId && picked.date === slot.date && picked.start === slot.start;
                return (
                  <button
                    key={`${slot.date}${slot.start}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setError(null);
                      setPicked(active ? null : { roomId: s.roomId, date: slot.date, start: slot.start, end: slot.end, roomName: s.roomName });
                    }}
                    className={cn(
                      "h-9 px-3 rounded-pill border text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
                      active ? "bg-primary-600 border-primary-600 text-white font-semibold" : "border-primary-100 bg-primary-50/60 text-primary-700 hover:border-primary-300",
                    )}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
            {picked?.roomId === s.roomId && (
              <div className="mt-3 rounded-card-sm bg-surface-subtle p-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && book()}
                    maxLength={120}
                    placeholder="ชื่อการจอง เช่น ประชุมทีม"
                    className="h-10 flex-1 px-3.5 rounded-input border border-line bg-white text-sm focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={book}
                      disabled={!title.trim() || pending}
                      className="h-10 px-4 rounded-pill bg-primary-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary-700 disabled:opacity-40"
                    >
                      {pending && <Loader2 size={14} className="animate-spin" />}
                      จองเลย
                    </button>
                    <button
                      type="button"
                      onClick={() => onAdjust({ ...picked, title })}
                      className="h-10 px-3.5 rounded-pill border border-line bg-white text-sm text-ink-2 hover:text-ink-1"
                    >
                      ปรับเวลา
                    </button>
                  </div>
                </div>
                {recentTitles.length > 0 && !title && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {recentTitles.map((t) => (
                      <button key={t} type="button" onClick={() => setTitle(t)} className="text-xs px-2.5 py-1 rounded-pill bg-white border border-line text-ink-2 hover:text-ink-1">
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── My bookings ───────────────────────────────────────────────────────────

function BookingsList({
  data,
  now,
  onMove,
  onCancel,
  onRename,
  onResult,
}: {
  data: PortalData;
  now: number;
  onMove: (b: OwnBooking) => void;
  onCancel: (b: OwnBooking) => void;
  onRename: (b: OwnBooking) => void;
  onResult: (r: Result) => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [pending, start] = useTransition();
  const list = tab === "upcoming" ? data.upcoming : tab === "past" ? data.past : data.cancelled;
  const groups = useMemo(() => {
    const m = new Map<string, OwnBooking[]>();
    for (const b of list) {
      const d = bkkDate(b.startsAt);
      m.set(d, [...(m.get(d) ?? []), b]);
    }
    return [...m.entries()];
  }, [list]);

  const tabs = [
    { id: "upcoming" as const, label: "กำลังจะมา", n: data.upcoming.length },
    { id: "past" as const, label: "ผ่านมาแล้ว", n: data.past.length },
    { id: "cancelled" as const, label: "ยกเลิก", n: data.cancelled.length },
  ];

  return (
    <section data-tour="mine" aria-labelledby="mine-h" className="rounded-card bg-white border border-line-soft shadow-card">
      <div className="px-5 pt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="mine-h" className="text-base font-bold tracking-tight text-ink-1">
          การจองของฉัน
        </h2>
        <div role="tablist" className="flex gap-1 p-1 rounded-pill bg-surface-subtle">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "h-8 px-3 rounded-pill text-xs font-semibold transition-colors",
                tab === t.id ? "bg-white text-ink-1 shadow-card" : "text-ink-2 hover:text-ink-1",
              )}
            >
              {t.label} <span className="tabular-nums text-ink-3">{t.n}</span>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-2">
          {tab === "upcoming" ? "ยังไม่มีการจองที่กำลังจะมาถึง" : tab === "past" ? "ยังไม่มีประวัติใน 30 วันที่ผ่านมา" : "ไม่มีรายการที่ยกเลิกใน 14 วันนี้"}
        </p>
      ) : (
        <div className="px-5 pb-3 pt-2">
          {groups.map(([date, items]) => (
            <div key={date} className="pt-3">
              <p className="text-xs font-semibold text-ink-3 pb-1">{dayChip(date, data.today).long}</p>
              <ul className="divide-y divide-line-soft">
                {items.map((b) => {
                  const live = Date.parse(b.startsAt) <= now && Date.parse(b.endsAt) > now;
                  const future = Date.parse(b.startsAt) > now;
                  return (
                    <li key={b.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="w-[104px] shrink-0">
                        <p className={cn("text-sm font-semibold tabular-nums", tab === "cancelled" ? "text-ink-3 line-through" : "text-ink-1")}>
                          {bkkTime(b.startsAt)}–{bkkTime(b.endsAt)}
                        </p>
                        <p className="text-[11px] text-ink-3">{durationText(Date.parse(b.endsAt) - Date.parse(b.startsAt))}</p>
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <p className="text-sm font-medium text-ink-1 truncate flex items-center gap-1.5">
                          {b.title}
                          {b.isRecurring && <Repeat size={12} strokeWidth={1.75} className="text-ink-3 shrink-0" aria-label="จองซ้ำ" />}
                        </p>
                        <p className="text-xs text-ink-2 truncate">
                          {b.roomName} · <span className="tabular-nums">{b.reference}</span>
                          {live && (
                            <span className="ml-2 inline-flex items-center gap-1 text-emerald-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> กำลังใช้งาน
                            </span>
                          )}
                          {tab === "cancelled" && b.cancelledReason && <span className="text-ink-3"> · {b.cancelledReason}</span>}
                        </p>
                      </div>
                      {tab === "upcoming" && (
                        <div className="flex gap-1.5">
                          {live ? (
                            <>
                              <IconAction onClick={() => start(async () => onResult(await portalExtend(b.id, 30)))} disabled={pending} icon={<Timer size={14} strokeWidth={1.75} />}>
                                ต่อ 30 นาที
                              </IconAction>
                              <IconAction onClick={() => start(async () => onResult(await portalEndNow(b.id)))} disabled={pending} icon={<Square size={12} strokeWidth={2} />}>
                                จบเลย
                              </IconAction>
                            </>
                          ) : future ? (
                            <>
                              <IconAction onClick={() => onMove(b)} icon={<Clock3 size={14} strokeWidth={1.75} />}>เลื่อน</IconAction>
                              <IconAction onClick={() => onRename(b)} icon={<Pencil size={13} strokeWidth={1.75} />}>ชื่อ</IconAction>
                              <IconAction onClick={() => onCancel(b)} icon={<X size={14} strokeWidth={1.75} />} danger>ยกเลิก</IconAction>
                            </>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function IconAction({
  onClick,
  icon,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 px-2.5 rounded-pill text-xs font-medium inline-flex items-center gap-1 border transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
        danger ? "border-red-100 text-red-700 hover:bg-red-50" : "border-line text-ink-2 hover:text-ink-1 hover:bg-surface-subtle",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ─── Telegram ──────────────────────────────────────────────────────────────

function TelegramCard({ data }: { data: PortalData }) {
  const url = `https://t.me/${data.telegram.botUsername}`;
  return (
    <section data-tour="telegram" aria-labelledby="tg-h" className="rounded-card bg-white border border-line-soft shadow-card p-5">
      <h2 id="tg-h" className="text-base font-bold tracking-tight text-ink-1 flex items-center gap-2">
        <MessageCircle size={16} strokeWidth={1.75} className="text-primary-600" />
        จองผ่าน Telegram
      </h2>
      <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">
        คุยกับน้องจองในแชต จอง เลื่อน ยกเลิก และรับแจ้งเตือนก่อนประชุม ก่อนหมดเวลา
      </p>
      {data.telegram.linked ? (
        <p className="mt-3 text-sm text-emerald-700 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          เชื่อมบัญชีแล้ว
        </p>
      ) : (
        <p className="mt-3 text-xs text-ink-2">
          กด Start แล้วพิมพ์อีเมล <span className="font-medium text-ink-1">{data.me.email}</span> เพื่อเชื่อมบัญชี
        </p>
      )}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 h-10 px-4 rounded-pill border border-line text-sm font-semibold text-primary-700 inline-flex items-center gap-2 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100"
      >
        <Send size={14} strokeWidth={1.75} />
        เปิด @{data.telegram.botUsername}
      </a>
    </section>
  );
}

// ─── Dialogs ───────────────────────────────────────────────────────────────

function CancelDialog({ booking, onClose, onDone }: { booking: OwnBooking | null; onClose: () => void; onDone: (r: Result) => void }) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => setReason(""), [booking]);
  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      size="sm"
      headerTone="default"
      title="ยกเลิกการจองนี้?"
      subtitle={booking ? `${booking.title} · ${booking.roomName} ${bkkTime(booking.startsAt)}–${bkkTime(booking.endsAt)}` : undefined}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-pill text-sm text-ink-2 hover:bg-surface-subtle">
            ไม่ยกเลิก
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => booking && start(async () => onDone(await portalCancel(booking.id, reason)))}
            className="h-10 px-4 rounded-pill bg-red-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-red-700 disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            ยืนยันยกเลิก
          </button>
        </div>
      }
    >
      <div className="p-5">
      <label className="block text-xs font-semibold text-ink-2 mb-2" htmlFor="cancel-reason">
        เหตุผล (ไม่บังคับ)
      </label>
      <input
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="เช่น เลื่อนประชุม"
        className="h-11 w-full px-4 rounded-input border border-line text-sm focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50"
      />
      <p className="mt-3 text-xs text-ink-2">ห้องจะว่างให้คนอื่นจองได้ทันที</p>
      </div>
    </Modal>
  );
}

function RenameDialog({ booking, onClose, onDone }: { booking: OwnBooking | null; onClose: () => void; onDone: (r: Result) => void }) {
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => setTitle(booking?.title ?? ""), [booking]);
  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      size="sm"
      headerTone="default"
      title="เปลี่ยนชื่อการจอง"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-pill text-sm text-ink-2 hover:bg-surface-subtle">
            ปิด
          </button>
          <button
            type="button"
            disabled={pending || !title.trim()}
            onClick={() => booking && start(async () => onDone(await portalRename(booking.id, title)))}
            className="h-10 px-4 rounded-pill bg-primary-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary-700 disabled:opacity-40"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            บันทึก
          </button>
        </div>
      }
    >
      <div className="p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="h-11 w-full px-4 rounded-input border border-line text-sm focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50"
        />
      </div>
    </Modal>
  );
}
