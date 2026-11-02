"use client";

import { useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, bkkDate, bkkTime, fromBkk, timeToMinutes } from "@/lib/time/bkk";
import type { PortalData } from "@/lib/server/portal-data";
import { dayChip, hhmm } from "./format";

/**
 * Every room on one day, as a timeline you can tap. A free stretch books from
 * where you tap; your own meetings are blue, everyone else's are grey and
 * named only when they are your colleagues'.
 */
export function Availability({
  data,
  now,
  onBook,
}: {
  data: PortalData;
  now: number;
  onBook: (preset: { roomId: string; date: string; start: string; end: string }) => void;
}) {
  const [date, setDate] = useState(data.today);
  const [hover, setHover] = useState<{ roomId: string; start: number } | null>(null);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(data.today, i)), [data.today]);
  const open = Math.floor(timeToMinutes(data.hours.open) / 30) * 30;
  const close = timeToMinutes(data.hours.close);
  const span = close - open;
  const ticks: number[] = [];
  for (let m = Math.ceil(open / 60) * 60; m < close; m += 60) ticks.push(m);
  const pct = (m: number) => `${((m - open) / span) * 100}%`;

  const dayStart = fromBkk(date, "00:00").getTime();
  const minOf = (iso: string) => Math.round((Date.parse(iso) - dayStart) / 60_000);
  const nowMin = date === data.today ? Math.round((now - dayStart) / 60_000) : date < data.today ? 24 * 60 : -1;

  const blocksFor = (roomId: string) =>
    data.blocks
      .filter((b) => b.roomId === roomId && bkkDate(b.startsAt) <= date && bkkDate(new Date(Date.parse(b.endsAt) - 1)) >= date)
      .map((b) => ({ ...b, s: Math.max(open, minOf(b.startsAt)), e: Math.min(close, minOf(b.endsAt)) }))
      .filter((b) => b.e > b.s);

  function free(roomId: string, s: number, e: number) {
    if (e <= nowMin + 10) return false;
    return !blocksFor(roomId).some((b) => b.s < e && b.e > s);
  }

  function pick(roomId: string, start: number) {
    const end = free(roomId, start + 30, start + 60) ? start + 60 : start + 30;
    onBook({ roomId, date, start: hhmm(start), end: hhmm(end) });
  }

  return (
    <section data-tour="availability" aria-labelledby="avail-h" className="rounded-card bg-white shadow-card border border-line-soft">
      <div className="px-5 pt-5 pb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="avail-h" className="text-base font-bold tracking-tight text-ink-1">
            ห้องว่าง
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">แตะช่องว่างเพื่อจองตั้งแต่เวลานั้น</p>
        </div>
        <Legend />
      </div>

      <div className="px-5 flex gap-1 overflow-x-auto pb-3 snap-x scrollbar-none">
        {days.map((d) => {
          const c = dayChip(d, data.today);
          const active = d === date;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              aria-pressed={active}
              className={cn(
                "snap-start shrink-0 md:shrink md:flex-1 min-w-[50px] rounded-input border px-1 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
                active ? "border-primary-600 bg-primary-600 text-white" : "border-line text-ink-1 hover:border-primary-200",
              )}
            >
              <span className={cn("block text-[11px] leading-4", active ? "text-white/80" : "text-ink-3")}>{c.top}</span>
              <span className="block text-sm font-bold tabular-nums leading-5">{c.day}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto scrollbar-thin border-t border-line-soft">
        <div className="min-w-[760px] px-5 pb-5">
          <div className="relative h-7 ml-[148px]">
            {ticks.map((m) => (
              <span
                key={m}
                className="absolute top-2 -translate-x-1/2 text-[11px] text-ink-3 tabular-nums"
                style={{ left: pct(m) }}
              >
                {hhmm(m)}
              </span>
            ))}
          </div>

          <div className="space-y-2">
            {data.rooms.map((r) => {
              const blocks = blocksFor(r.id);
              return (
                <div key={r.id} className="flex items-stretch gap-3">
                  <div className="w-[136px] shrink-0 py-1.5">
                    <p className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-ink-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                      <span className="truncate">{r.name}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-3">
                      <Users size={11} strokeWidth={1.75} />
                      {r.capacityMax ? `${r.capacityMin ?? 1}–${r.capacityMax} คน` : "—"}
                    </p>
                  </div>

                  <div
                    className="relative flex-1 h-14 rounded-input bg-surface-subtle overflow-hidden cursor-pointer"
                    onMouseLeave={() => setHover(null)}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const m = open + Math.floor((((e.clientX - rect.left) / rect.width) * span) / 30) * 30;
                      setHover(free(r.id, m, m + 30) ? { roomId: r.id, start: m } : null);
                    }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const m = open + Math.floor((((e.clientX - rect.left) / rect.width) * span) / 30) * 30;
                      if (free(r.id, m, m + 30)) pick(r.id, m);
                    }}
                  >
                    {ticks.map((m) => (
                      <span key={m} className="absolute inset-y-0 w-px bg-line" style={{ left: pct(m) }} />
                    ))}
                    {nowMin > open && (
                      <span
                        className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(148,163,184,0.18)_6px_8px)]"
                        style={{ width: pct(Math.min(nowMin, close)) }}
                      />
                    )}
                    {blocks.map((b) => (
                      <div
                        key={b.id}
                        title={`${b.label} · ${bkkTime(b.startsAt)}–${bkkTime(b.endsAt)}`}
                        className={cn(
                          "absolute top-1.5 bottom-1.5 rounded-[10px] px-2 flex flex-col justify-center overflow-hidden cursor-default",
                          b.mine ? "bg-primary-600 text-white" : "bg-slate-200 text-ink-2",
                        )}
                        style={{ left: `calc(${pct(b.s)} + 1px)`, width: `calc(${pct(b.e)} - ${pct(b.s)} - 2px)` }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="truncate text-[12px] font-semibold leading-4">{b.label}</span>
                        <span className={cn("truncate text-[11px] tabular-nums leading-4", b.mine ? "text-white/80" : "text-ink-3")}>
                          {bkkTime(b.startsAt)}–{bkkTime(b.endsAt)}
                        </span>
                      </div>
                    ))}
                    {hover?.roomId === r.id && (
                      <div
                        className="absolute top-1.5 bottom-1.5 rounded-[10px] border-2 border-dashed border-primary-400 bg-primary-50/80 text-primary-700 flex items-center justify-center pointer-events-none"
                        style={{ left: pct(hover.start), width: `calc(${pct(Math.min(hover.start + 60, close))} - ${pct(hover.start)})` }}
                      >
                        <span className="text-[12px] font-semibold tabular-nums flex items-center gap-1">
                          <Plus size={12} strokeWidth={2.25} />
                          {hhmm(hover.start)}
                        </span>
                      </div>
                    )}
                    {date === data.today && nowMin > open && nowMin < close && (
                      <span className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: pct(nowMin) }} aria-hidden />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="hidden sm:flex items-center gap-3 text-[11px] text-ink-2">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-[4px] bg-primary-600" /> ของคุณ
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-[4px] bg-slate-200" /> ไม่ว่าง
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-[4px] bg-surface-subtle border border-line" /> ว่าง
      </span>
    </div>
  );
}
