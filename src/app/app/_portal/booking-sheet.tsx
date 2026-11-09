"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, Repeat, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { addDays, bkkDate, bkkTime, bkkWeekday, fromBkk, servesOn, timeToMinutes } from "@/lib/time/bkk";
import { portalBook, portalMove } from "@/lib/actions/portal";
import { previewCharge } from "@/lib/billing/overage";
import type { OwnBooking, PortalRoom } from "@/lib/server/member-ops";
import type { PortalData } from "@/lib/server/portal-data";
import { dayChip, hhmm } from "./format";
import { hoursText } from "./use-now";

export type SheetMode =
  | { kind: "new"; roomId?: string; date?: string; start?: string; end?: string; title?: string }
  | { kind: "move"; booking: OwnBooking };

export function BookingSheet({
  data,
  mode,
  onClose,
  onDone,
}: {
  data: PortalData;
  mode: SheetMode | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const open = mode !== null;
  const moving = mode?.kind === "move" ? mode.booking : null;
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(data.today);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState("");
  const [weeks, setWeeks] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset whenever the sheet opens for something new.
  useEffect(() => {
    if (!mode) return;
    setError(null);
    if (mode.kind === "move") {
      const b = mode.booking;
      setRoomId(b.roomId);
      setDate(bkkDate(b.startsAt));
      setStart(bkkTime(b.startsAt));
      setEnd(bkkTime(b.endsAt));
      setTitle(b.title);
      setWeeks(1);
    } else {
      setRoomId(mode.roomId ?? data.rooms[0]?.id ?? "");
      setDate(mode.date ?? data.today);
      setStart(mode.start ?? "");
      setEnd(mode.end ?? "");
      setTitle(mode.title ?? "");
      setAttendees("");
      setWeeks(1);
    }
  }, [mode, data.rooms, data.today]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(data.today, i)), [data.today]);
  const room = data.rooms.find((r) => r.id === roomId);
  const open0 = timeToMinutes(data.hours.open);
  const close0 = timeToMinutes(data.hours.close);
  const now = Date.parse(data.serverNow);

  const busy = useMemo(
    () => data.blocks.filter((b) => b.roomId === roomId && b.id !== moving?.id),
    [data.blocks, roomId, moving?.id],
  );
  const isBusy = (m0: number, m1: number) => {
    const s = fromBkk(date, hhmm(m0)).getTime();
    const e = fromBkk(date, hhmm(m1)).getTime();
    return busy.some((b) => Date.parse(b.startsAt) < e && Date.parse(b.endsAt) > s);
  };
  const roomClosed = (r: PortalRoom) => !servesOn(r.serviceDays, bkkWeekday(fromBkk(date, "12:00")));

  const starts: Array<{ t: string; disabled: boolean }> = [];
  for (let m = open0; m + 30 <= close0; m += 30) {
    const past = fromBkk(date, hhmm(m + 30)).getTime() <= now + 10 * 60_000;
    starts.push({ t: hhmm(m), disabled: past || isBusy(m, m + 30) });
  }
  const ends: string[] = [];
  if (start) {
    const s0 = timeToMinutes(start);
    for (let m = s0 + 30; m <= close0 && m - s0 <= 8 * 60; m += 30) {
      if (isBusy(m - 30, m)) break;
      ends.push(hhmm(m));
    }
  }

  // Keep start/end valid as room or day changes.
  useEffect(() => {
    if (!open) return;
    if (start && starts.find((x) => x.t === start)?.disabled) {
      setStart("");
      setEnd("");
    } else if (start && end && !ends.includes(end)) {
      setEnd(ends[Math.min(1, ends.length - 1)] ?? "");
    } else if (start && !end && ends.length) {
      setEnd(ends[Math.min(1, ends.length - 1)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, date, start]);

  const hours = start && end ? (timeToMinutes(end) - timeToMinutes(start)) / 60 : 0;
  const total = hours * weeks;
  const remaining = data.usage.remainingHours;
  const overQuota = remaining !== null && total > remaining;
  // Price only for a new booking this month — another month has its own quota.
  const charge =
    overQuota && !moving && room && date.slice(0, 7) === data.today.slice(0, 7)
      ? previewCharge(remaining, total, room.hourlyRate)
      : null;
  const ready = !!(room && start && end && (moving || title.trim()));

  function submit() {
    if (!ready || !room) return;
    setError(null);
    startTransition(async () => {
      try {
        if (moving) {
          const res = await portalMove(moving.id, { date, start, end, roomId: room.id });
          if (!res.ok) return setError(res.message);
          onDone(res.message);
        } else {
          const res = await portalBook({
            roomId: room.id,
            date,
            start,
            end,
            title: title.trim(),
            attendees: attendees ? Number(attendees) : undefined,
            repeatWeeks: weeks,
          });
          if (!res.ok) return setError(res.message);
          const extra =
            res.created > 1 ? ` ทั้งหมด ${res.created} ครั้ง${res.skipped ? ` (ข้าม ${res.skipped} ครั้งที่ไม่ว่าง)` : ""}` : "";
          onDone(`จอง ${res.roomName} ${dayChip(date, data.today).label} ${start}–${end} แล้ว${extra}`);
        }
      } catch {
        setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      headerTone="default"
      title={moving ? "เลื่อนการจอง" : "จองห้องประชุม"}
      subtitle={moving ? `${moving.title} · ${moving.reference}` : "เลือกห้อง วัน และเวลา"}
      footer={
        <div className="flex items-center gap-3 w-full">
          <p className={cn("text-xs flex-1 min-w-0", overQuota ? "text-red-600" : "text-ink-2")}>
            {hours > 0 &&
              (remaining === null
                ? `ใช้ห้อง ${hoursText(total)}`
                : overQuota
                  ? `เกินโควตาบริษัท ${hoursText(total - remaining)}${
                      charge?.amount
                        ? ` · ค่าห้อง ${charge.amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท เรียกเก็บกับบริษัทตอนสิ้นเดือน`
                        : ""
                    }`
                  : `หลังจองโควตาบริษัทเหลือ ${hoursText(remaining - total)}`)}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-pill text-sm font-medium text-ink-2 hover:bg-surface-subtle"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!ready || pending}
            className="h-10 px-5 rounded-pill bg-primary-600 text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2} />}
            {moving ? "ยืนยันเลื่อน" : "ยืนยันจอง"}
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-6">
        <Field label="ห้อง">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {data.rooms.map((r) => {
              const closed = roomClosed(r);
              const active = r.id === roomId;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={closed}
                  onClick={() => setRoomId(r.id)}
                  className={cn(
                    "text-left rounded-card-sm border overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
                    active ? "border-primary-600 bg-primary-50 ring-2 ring-primary-600" : "border-line hover:border-primary-200",
                    closed && "opacity-40",
                  )}
                >
                  <RoomPhoto room={r} className="h-28" />
                  <span className="block px-3.5 pt-2.5 pb-3">
                  <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                    {r.name}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-ink-2">
                    <Users size={12} strokeWidth={1.75} />
                    {closed ? "ปิดวันนี้" : r.capacityMax ? `${r.capacityMin ?? 1}–${r.capacityMax} คน` : "—"}
                  </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="วันที่">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x scrollbar-thin">
            {days.map((d) => {
              const c = dayChip(d, data.today);
              const active = d === date;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDate(d)}
                  className={cn(
                    "snap-start shrink-0 w-[60px] rounded-input border py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
                    active ? "border-primary-600 bg-primary-600 text-white" : "border-line text-ink-1 hover:border-primary-200",
                  )}
                >
                  <span className={cn("block text-[11px]", active ? "text-white/80" : "text-ink-3")}>{c.top}</span>
                  <span className="block text-base font-bold tabular-nums leading-tight">{c.day}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="เวลาเริ่ม">
          <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
            {starts.map((s) => (
              <button
                key={s.t}
                type="button"
                disabled={s.disabled}
                onClick={() => {
                  setStart(s.t);
                  setEnd("");
                }}
                className={cn(
                  "h-9 rounded-input text-sm tabular-nums border transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
                  s.t === start
                    ? "bg-primary-600 border-primary-600 text-white font-semibold"
                    : s.disabled
                      ? "border-transparent bg-surface-subtle text-ink-3/60 line-through"
                      : "border-line text-ink-1 hover:border-primary-300",
                )}
              >
                {s.t}
              </button>
            ))}
          </div>
        </Field>

        {start && (
          <Field label="เวลาจบ">
            <div className="flex flex-wrap gap-1.5">
              {ends.map((e) => {
                const mins = timeToMinutes(e) - timeToMinutes(start);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEnd(e)}
                    className={cn(
                      "h-9 px-3 rounded-input text-sm border tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
                      e === end ? "bg-primary-600 border-primary-600 text-white font-semibold" : "border-line text-ink-1 hover:border-primary-300",
                    )}
                  >
                    {e}
                    <span className={cn("ml-1.5 text-xs", e === end ? "text-white/80" : "text-ink-3")}>
                      {hoursText(mins / 60)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {!moving && (
          <>
            <Field label="ชื่อการจอง">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="เช่น ประชุมทีมขาย"
                className="h-11 w-full px-4 rounded-input border border-line text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="จำนวนคน (ไม่บังคับ)">
                <input
                  value={attendees}
                  onChange={(e) => setAttendees(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  inputMode="numeric"
                  placeholder={room?.capacityMax ? `ไม่เกิน ${room.capacityMax}` : ""}
                  className="h-11 w-full px-4 rounded-input border border-line text-sm tabular-nums focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50"
                />
              </Field>
              <Field label="จองซ้ำทุกสัปดาห์">
                <div className="relative">
                  <Repeat size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                  <select
                    value={weeks}
                    onChange={(e) => setWeeks(Number(e.target.value))}
                    className="h-11 w-full pl-9 pr-3 rounded-input border border-line bg-white text-sm focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50"
                  >
                    <option value={1}>ครั้งเดียว</option>
                    <option value={4}>4 สัปดาห์</option>
                    <option value={8}>8 สัปดาห์</option>
                    <option value={12}>12 สัปดาห์</option>
                  </select>
                </div>
              </Field>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 border-t border-red-100 pt-3">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Room thumbnail, or a tinted block with the room's initial when it has none. */
export function RoomPhoto({ room, className }: { room: PortalRoom; className?: string }) {
  if (!room.thumbnailUrl) {
    return (
      <span
        className={cn("block w-full grid place-items-center text-2xl font-bold", className)}
        style={{ background: `${room.color}1f`, color: room.color }}
        aria-hidden
      >
        {room.name.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={room.thumbnailUrl} alt="" loading="lazy" className={cn("block w-full object-cover bg-surface-subtle", className)} />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-2 mb-2">{label}</p>
      {children}
    </div>
  );
}
