"use client";

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Search,
  Calendar as CalendarIcon,
  CalendarOff,
  Printer,
  X,
  Lock,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  Mail,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatBaht, formatTime } from "@/lib/format";
import type { Room } from "@/lib/data/rooms";
import type { BookingWithRelations } from "@/lib/data/bookings";
import {
  moveBooking,
  bulkCancelBookings,
  bulkSendInvoices,
  bulkNotifyTelegram,
  suggestAlternativeSlots,
} from "@/lib/actions/calendar";
import { BookingModal } from "./booking-modal";

type ViewMode = "day" | "week" | "month" | "year" | "timeline" | "list";

type FilterState = {
  search: string;
  roomIds: string[];
  paymentStatuses: string[];
  bookingStatuses: string[];
  sources: string[];
};

type Preset = { id: string; name: string; filters: FilterState };

const SLOT_HEIGHT = 36; // px
// Must cover the full bookable window used by the booking forms (07:00–22:00).
// If the calendar starts later than the earliest bookable time, any booking in
// that gap silently vanishes from the day view — which hides real conflicts.
const SERVICE_START_MIN = 7 * 60;
const SERVICE_END_MIN = 22 * 60;
const SLOTS: string[] = [];
for (let m = SERVICE_START_MIN; m <= SERVICE_END_MIN; m += 30) {
  SLOTS.push(
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
  );
}

const PRESET_KEY = "easyspace.cal-presets.v1";
const FILTER_KEY = "easyspace.cal-filter.v1";

const paymentStatusOpts = [
  { id: "paid", label: "จ่ายแล้ว" },
  { id: "deposit", label: "มัดจำ" },
  { id: "unpaid", label: "ค้างจ่าย" },
  { id: "free", label: "ฟรี" },
];
const bookingStatusOpts = [
  { id: "confirmed", label: "ยืนยันแล้ว" },
  { id: "pending", label: "รอ" },
  { id: "in_use", label: "กำลังใช้" },
  { id: "completed", label: "เสร็จสิ้น" },
  { id: "cancelled", label: "ยกเลิก" },
  { id: "no_show", label: "ไม่มา" },
];
const sourceOpts = [
  { id: "line", label: "LINE" },
  { id: "walk_in", label: "Walk-in" },
  { id: "referral_bni", label: "BNI" },
  { id: "facebook", label: "Facebook" },
  { id: "google", label: "Google" },
  { id: "email", label: "Email" },
  { id: "other", label: "อื่นๆ" },
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const mondayOffset = (day + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtThaiDate(d: Date) {
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function minutesOf(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getHours() * 60 + d.getMinutes();
}
function bookingDisplayName(b: BookingWithRelations): string {
  if (b.customer?.display_name) return b.customer.display_name;
  if (b.member?.full_name) {
    const org = b.org?.short_name ?? b.org?.name;
    return org ? `${b.member.full_name} · ${org}` : b.member.full_name;
  }
  return b.internal_title ?? "—";
}

function memberRoleLine(b: BookingWithRelations): string | null {
  const bits = [b.member?.position, b.department].filter(Boolean) as string[];
  return bits.length > 0 ? bits.join(" · ") : null;
}

function paymentColor(status: string) {
  switch (status) {
    case "paid":
      return "border-l-emerald-500 bg-emerald-50/70";
    case "deposit":
      return "border-l-amber-500 bg-amber-50/70";
    case "unpaid":
      return "border-l-red-500 bg-red-50/70";
    case "free":
      return "border-l-slate-400 bg-slate-50/70";
    default:
      return "border-l-primary-500 bg-primary-50/40";
  }
}

interface Props {
  rooms: Room[];
  bookings: BookingWithRelations[];
}

export function CalendarBoard({ rooms, bookings: initialBookings }: Props) {
  const [bookings, setBookings] =
    useState<BookingWithRelations[]>(initialBookings);
  const [current, setCurrent] = useState<Date>(new Date());
  const [view, setView] = useState<ViewMode>("day");
  const [filter, setFilter] = useState<FilterState>({
    search: "",
    roomIds: [],
    paymentStatuses: [],
    bookingStatuses: ["confirmed", "pending", "in_use", "completed"],
    sources: [],
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showFilters, setShowFilters] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    bookingId: string;
  } | null>(null);
  const [bulkActionOpen, setBulkActionOpen] = useState<
    null | "cancel" | "telegram" | "invoice"
  >(null);
  const [conflictOverlay, setConflictOverlay] = useState<
    | {
        bookingId: string;
        roomId: string;
        durationMin: number;
        suggestions: Awaited<ReturnType<typeof suggestAlternativeSlots>>;
      }
    | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  // Restore filter + presets on mount
  useEffect(() => {
    try {
      const fp = localStorage.getItem(FILTER_KEY);
      if (fp) setFilter((f) => ({ ...f, ...JSON.parse(fp) }));
      const pp = localStorage.getItem(PRESET_KEY);
      if (pp) setPresets(JSON.parse(pp));
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    } catch {
      // ignore
    }
  }, [filter]);

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  // ----- Filtering -----
  const filtered = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (filter.roomIds.length && !filter.roomIds.includes(b.room_id))
        return false;
      if (
        filter.paymentStatuses.length &&
        !filter.paymentStatuses.includes(b.payment_status)
      )
        return false;
      if (
        filter.bookingStatuses.length &&
        !filter.bookingStatuses.includes(b.booking_status)
      )
        return false;
      if (
        filter.sources.length &&
        b.source_channel &&
        !filter.sources.includes(b.source_channel)
      )
        return false;
      if (q) {
        const hay = `${b.reference_code} ${b.customer?.display_name ?? ""} ${b.customer?.phone ?? ""} ${b.internal_title ?? ""} ${b.member?.full_name ?? ""} ${b.member?.email ?? ""} ${b.org?.name ?? ""} ${b.org?.short_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, filter]);

  // ----- Keyboard shortcuts -----
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (inField) {
        if (e.key === "Escape") {
          target.blur();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          const el = document.getElementById(
            "cal-search-input",
          ) as HTMLInputElement | null;
          el?.focus();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "t") setCurrent(new Date());
      else if (k === "d") setView("day");
      else if (k === "w") setView("week");
      else if (k === "m") setView("month");
      else if (k === "y") setView("year");
      else if (k === "l") setView("list");
      else if (k === "n") {
        window.location.href = "/admin/bookings";
      } else if (k === "f") setShowFilters((s) => !s);
      else if (k === "p") {
        e.preventDefault();
        window.print();
      } else if (e.key === "ArrowLeft") nav(-1);
      else if (e.key === "ArrowRight") nav(1);
      else if (e.key === "Escape") {
        setOpenId(null);
        setContextMenu(null);
        setConflictOverlay(null);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function nav(dir: -1 | 1) {
    setCurrent((c) => {
      const x = new Date(c);
      if (view === "day") x.setDate(x.getDate() + dir);
      else if (view === "week") x.setDate(x.getDate() + dir * 7);
      else if (view === "month") x.setMonth(x.getMonth() + dir);
      else if (view === "year") x.setFullYear(x.getFullYear() + dir);
      else x.setDate(x.getDate() + dir);
      return x;
    });
  }

  function applyPreset(p: Preset) {
    setFilter(p.filters);
    notify(`ใช้ตัวกรอง: ${p.name}`);
  }
  function savePreset(name: string) {
    const p: Preset = { id: crypto.randomUUID(), name, filters: filter };
    const next = [...presets, p];
    setPresets(next);
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  function deletePreset(id: string) {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  // ----- DnD: move booking time/room -----
  const dragRef = useRef<{
    bookingId: string;
    durationMin: number;
    origStart: Date;
    origRoomId: string;
  } | null>(null);

  function onEventDragStart(b: BookingWithRelations, e: React.DragEvent) {
    dragRef.current = {
      bookingId: b.id,
      durationMin:
        (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
        60_000,
      origStart: new Date(b.starts_at),
      origRoomId: b.room_id,
    };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", b.id);
  }

  async function onSlotDrop(
    e: React.DragEvent,
    roomId: string,
    dropDate: Date,
    minuteOfDay: number,
  ) {
    e.preventDefault();
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    const starts = new Date(dropDate);
    starts.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
    const ends = new Date(starts.getTime() + drag.durationMin * 60_000);

    // Optimistic
    setBookings((prev) =>
      prev.map((b) =>
        b.id === drag.bookingId
          ? {
              ...b,
              room_id: roomId,
              starts_at: starts.toISOString(),
              ends_at: ends.toISOString(),
            }
          : b,
      ),
    );

    const result = await moveBooking({
      bookingId: drag.bookingId,
      roomId,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
    });
    if (!result.ok) {
      // Rollback
      setBookings((prev) =>
        prev.map((b) =>
          b.id === drag.bookingId
            ? {
                ...b,
                room_id: drag.origRoomId,
                starts_at: drag.origStart.toISOString(),
                ends_at: new Date(
                  drag.origStart.getTime() + drag.durationMin * 60_000,
                ).toISOString(),
              }
            : b,
        ),
      );
      if (result.error === "time_conflict") {
        const sug = await suggestAlternativeSlots({
          roomId,
          durationMinutes: drag.durationMin,
          date: dateKey(starts),
          maxResults: 5,
        });
        setConflictOverlay({
          bookingId: drag.bookingId,
          roomId,
          durationMin: drag.durationMin,
          suggestions: sug,
        });
      } else {
        notify(`ย้ายไม่สำเร็จ: ${result.error}`);
      }
    } else {
      notify("ย้ายเวลาเรียบร้อย");
    }
  }

  async function onResizeEnd(
    bookingId: string,
    newDurationMin: number,
  ) {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) return;
    const starts = new Date(b.starts_at);
    const ends = new Date(starts.getTime() + newDurationMin * 60_000);
    const orig = { startsAt: b.starts_at, endsAt: b.ends_at };

    setBookings((prev) =>
      prev.map((x) =>
        x.id === bookingId ? { ...x, ends_at: ends.toISOString() } : x,
      ),
    );
    const result = await moveBooking({
      bookingId,
      roomId: b.room_id,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
    });
    if (!result.ok) {
      setBookings((prev) =>
        prev.map((x) =>
          x.id === bookingId
            ? { ...x, starts_at: orig.startsAt, ends_at: orig.endsAt }
            : x,
        ),
      );
      notify(
        result.error === "time_conflict"
          ? "เวลาทับซ้อน — ลองอีกครั้ง"
          : `ปรับเวลาไม่สำเร็จ: ${result.error}`,
      );
    } else {
      notify("ปรับขนาดเวลาเรียบร้อย");
    }
  }

  async function applyConflictSuggestion(s: {
    startsAt: string;
    endsAt: string;
  }) {
    if (!conflictOverlay) return;
    const r = await moveBooking({
      bookingId: conflictOverlay.bookingId,
      roomId: conflictOverlay.roomId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    });
    if (r.ok) {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === conflictOverlay.bookingId
            ? {
                ...b,
                room_id: conflictOverlay.roomId,
                starts_at: s.startsAt,
                ends_at: s.endsAt,
              }
            : b,
        ),
      );
      setConflictOverlay(null);
      notify("ใช้เวลาที่ AI แนะนำแล้ว");
    } else {
      notify(`ใช้คำแนะนำไม่สำเร็จ: ${r.error}`);
    }
  }

  // ----- Bulk actions -----
  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function runBulkCancel(reason: string) {
    const r = await bulkCancelBookings({
      ids: [...selectedIds],
      reason,
    });
    if (r.ok) {
      setBookings((prev) =>
        prev.map((b) =>
          selectedIds.has(b.id)
            ? { ...b, booking_status: "cancelled" }
            : b,
        ),
      );
      clearSelection();
      setBulkActionOpen(null);
      notify(`ยกเลิก ${r.count} รายการเรียบร้อย`);
    } else {
      notify(`ยกเลิกไม่สำเร็จ: ${r.error}`);
    }
  }

  async function runBulkTelegram(message: string) {
    const r = await bulkNotifyTelegram({ ids: [...selectedIds], message });
    if (r.ok) {
      clearSelection();
      setBulkActionOpen(null);
      notify(`ส่ง Telegram ${r.count} รายการเรียบร้อย`);
    } else {
      notify(`ส่งไม่สำเร็จ: ${r.error}`);
    }
  }

  async function runBulkInvoice() {
    const r = await bulkSendInvoices({ ids: [...selectedIds] });
    if (r.ok) {
      clearSelection();
      setBulkActionOpen(null);
      notify(`ส่งใบแจ้งหนี้ ${r.count} รายการเรียบร้อย`);
    } else {
      notify(`ส่งไม่สำเร็จ: ${r.error}`);
    }
  }

  // ----- Stats for sidebar -----
  const todayBookings = filtered.filter((b) =>
    isSameDay(new Date(b.starts_at), current),
  );
  const revenueToday = todayBookings.reduce(
    (sum, b) => sum + Number(b.paid_amount ?? 0),
    0,
  );
  const outstandingCount = todayBookings.filter(
    (b) => b.payment_status !== "paid" && b.payment_status !== "free",
  ).length;
  const usedHrs = todayBookings.reduce((sum, b) => {
    const hrs =
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
      3_600_000;
    return sum + hrs;
  }, 0);
  const utilisationPct =
    rooms.length > 0
      ? Math.min(100, Math.round((usedHrs / (rooms.length * 13.5)) * 100))
      : 0;

  return (
    <>
      {/* Toolbar */}
      <Card className="!p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrent(new Date())}
              title="วันนี้ (T)"
            >
              วันนี้
            </Button>
            <button
              onClick={() => nav(-1)}
              className="w-9 h-9 rounded-pill border border-line bg-white grid place-items-center hover:bg-surface-subtle"
              title="ย้อน (←)"
            >
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => nav(1)}
              className="w-9 h-9 rounded-pill border border-line bg-white grid place-items-center hover:bg-surface-subtle"
              title="ถัดไป (→)"
            >
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
            <div className="ml-2 inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
              <CalendarIcon
                size={16}
                className="text-primary-600"
                strokeWidth={1.75}
              />
              {view === "year"
                ? current.getFullYear() + ""
                : view === "month"
                  ? current.toLocaleDateString("th-TH", {
                      month: "long",
                      year: "numeric",
                    })
                  : view === "week"
                    ? `${startOfWeek(current).toLocaleDateString("th-TH", { day: "numeric", month: "short" })} – ${addDays(startOfWeek(current), 6).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`
                    : fmtThaiDate(current)}
            </div>
          </div>

          <div className="flex items-center gap-1 ml-2 p-1 rounded-pill bg-surface-subtle">
            {(
              [
                ["day", "วัน", "D"],
                ["week", "สัปดาห์", "W"],
                ["month", "เดือน", "M"],
                ["year", "ปี", "Y"],
                ["timeline", "Timeline", ""],
                ["list", "List", "L"],
              ] as Array<[ViewMode, string, string]>
            ).map(([id, label, key]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                title={key ? `คีย์ลัด: ${key}` : undefined}
                className={cn(
                  "px-4 py-1.5 rounded-pill text-xs font-medium transition",
                  view === id
                    ? "bg-white text-primary-600 shadow-card"
                    : "text-ink-2 hover:text-ink-1",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <div className="w-64">
            <Input
              id="cal-search-input"
              value={filter.search}
              onChange={(e) =>
                setFilter((f) => ({ ...f, search: e.target.value }))
              }
              placeholder="ค้นหา... (⌘K)"
              iconLeft={<Search size={14} strokeWidth={1.75} />}
              className="h-9"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Filter size={14} strokeWidth={1.75} />}
            onClick={() => setShowFilters((s) => !s)}
          >
            {showFilters ? "ซ่อนตัวกรอง" : "ตัวกรอง"} (F)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Printer size={14} strokeWidth={1.75} />}
            onClick={() => window.print()}
          >
            พิมพ์
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Download size={14} strokeWidth={1.75} />}
            onClick={() => exportCSV(filtered, rooms)}
          >
            Export
          </Button>
        </div>
      </Card>

      <div
        className={cn(
          "grid grid-cols-1 gap-5 print:block",
          showFilters ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-1",
        )}
      >
        {showFilters && (
          <CalendarSidebar
            current={current}
            setCurrent={setCurrent}
            view={view}
            filter={filter}
            setFilter={setFilter}
            rooms={rooms}
            stats={{
              count: todayBookings.length,
              revenue: revenueToday,
              utilisation: utilisationPct,
              outstanding: outstandingCount,
            }}
            presets={presets}
            onApplyPreset={applyPreset}
            onSavePreset={savePreset}
            onDeletePreset={deletePreset}
            bookings={bookings}
          />
        )}

        {rooms.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="ยังไม่มีห้องในระบบ"
            description="กรุณาเพิ่มห้องที่ /admin/settings/rooms ก่อน"
          />
        ) : (
          <div className="space-y-4">
            {view === "day" && (
              <DayView
                date={current}
                rooms={rooms}
                bookings={filtered}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onOpen={setOpenId}
                onContextMenu={(id, x, y) =>
                  setContextMenu({ bookingId: id, x, y })
                }
                onEventDragStart={onEventDragStart}
                onSlotDrop={onSlotDrop}
                onResizeEnd={onResizeEnd}
              />
            )}

            {view === "week" && (
              <WeekView
                weekStart={startOfWeek(current)}
                bookings={filtered}
                rooms={rooms}
                onOpen={setOpenId}
                onPickDay={(d) => {
                  setCurrent(d);
                  setView("day");
                }}
              />
            )}

            {view === "month" && (
              <MonthView
                month={current}
                bookings={filtered}
                onPickDay={(d) => {
                  setCurrent(d);
                  setView("day");
                }}
              />
            )}

            {view === "year" && (
              <YearView
                year={current.getFullYear()}
                bookings={filtered}
                onPickDay={(d) => {
                  setCurrent(d);
                  setView("day");
                }}
              />
            )}

            {view === "timeline" && (
              <TimelineView
                date={current}
                bookings={filtered}
                rooms={rooms}
                onOpen={setOpenId}
              />
            )}

            {view === "list" && (
              <ListView
                bookings={filtered}
                rooms={rooms}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onOpen={setOpenId}
              />
            )}
          </div>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            setOpenId(contextMenu.bookingId);
            setContextMenu(null);
          }}
          onPay={() => {
            setOpenId(contextMenu.bookingId);
            setContextMenu(null);
          }}
          onCancel={async () => {
            const r = await bulkCancelBookings({
              ids: [contextMenu.bookingId],
              reason: "ยกเลิกจาก context menu",
            });
            if (r.ok) {
              setBookings((prev) =>
                prev.map((b) =>
                  b.id === contextMenu.bookingId
                    ? { ...b, booking_status: "cancelled" }
                    : b,
                ),
              );
              notify("ยกเลิกเรียบร้อย");
            }
            setContextMenu(null);
          }}
        />
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={clearSelection}
          onCancel={() => setBulkActionOpen("cancel")}
          onTelegram={() => setBulkActionOpen("telegram")}
          onInvoice={() => setBulkActionOpen("invoice")}
        />
      )}

      {bulkActionOpen === "cancel" && (
        <BulkPromptModal
          title="ยกเลิกการจอง"
          subtitle={`${selectedIds.size} รายการ`}
          inputLabel="เหตุผลการยกเลิก"
          confirmLabel="ยกเลิก"
          tone="danger"
          onClose={() => setBulkActionOpen(null)}
          onConfirm={runBulkCancel}
        />
      )}
      {bulkActionOpen === "telegram" && (
        <BulkPromptModal
          title="ส่งแจ้งเตือนทาง Telegram"
          subtitle={`${selectedIds.size} รายการ`}
          inputLabel="ข้อความ"
          confirmLabel="ส่ง Telegram"
          onClose={() => setBulkActionOpen(null)}
          onConfirm={runBulkTelegram}
        />
      )}
      {bulkActionOpen === "invoice" && (
        <BulkConfirmModal
          title="ส่งใบแจ้งหนี้"
          subtitle={`${selectedIds.size} รายการ — ระบบจะส่งสรุปยอดค้างไป Telegram`}
          confirmLabel="ส่งเลย"
          onClose={() => setBulkActionOpen(null)}
          onConfirm={runBulkInvoice}
        />
      )}

      {/* Conflict overlay */}
      {conflictOverlay && (
        <ConflictModal
          suggestions={conflictOverlay.suggestions}
          onClose={() => setConflictOverlay(null)}
          onPick={applyConflictSuggestion}
        />
      )}

      {/* Edit modal */}
      {openId && (
        <BookingModal
          bookingId={openId}
          onClose={() => setOpenId(null)}
          onSaved={(updated) => {
            setBookings((prev) =>
              prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)),
            );
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-pill bg-ink-1 text-white text-xs shadow-pop">
          {toast}
        </div>
      )}
    </>
  );
}

/* ───────── Sidebar ───────── */
function CalendarSidebar({
  current,
  setCurrent,
  view,
  filter,
  setFilter,
  rooms,
  stats,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  bookings,
}: {
  current: Date;
  setCurrent: (d: Date) => void;
  view: ViewMode;
  filter: FilterState;
  setFilter: (
    update: FilterState | ((f: FilterState) => FilterState),
  ) => void;
  rooms: Room[];
  stats: {
    count: number;
    revenue: number;
    utilisation: number;
    outstanding: number;
  };
  presets: Preset[];
  onApplyPreset: (p: Preset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  bookings: BookingWithRelations[];
}) {
  void view;
  void presets;
  void onApplyPreset;
  void onSavePreset;
  void onDeletePreset;

  function toggle<K extends keyof FilterState>(
    key: K,
    value: string,
  ) {
    setFilter((f) => {
      const arr = (f[key] as string[]) ?? [];
      const next = arr.includes(value)
        ? arr.filter((x) => x !== value)
        : [...arr, value];
      return { ...f, [key]: next };
    });
  }

  return (
    <aside className="space-y-5 print:hidden">
      <Card className="!p-4">
        <MiniCalendar
          current={current}
          onPick={setCurrent}
          bookings={bookings}
        />
      </Card>

      <Card className="!p-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
          สถิติ
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between">
            <span className="text-ink-2">จอง</span>
            <span className="font-semibold tabular-nums">
              {stats.count} รายการ
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-ink-2">รายได้</span>
            <span className="font-semibold tabular-nums">
              {formatBaht(stats.revenue)}
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-ink-2">Utilization</span>
            <span className="font-semibold tabular-nums">
              {stats.utilisation}%
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-ink-2">ค้างชำระ</span>
            <span className="font-semibold tabular-nums text-red-600">
              {stats.outstanding} รายการ
            </span>
          </li>
        </ul>
      </Card>

      <Card className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
            ห้อง
          </p>
          {filter.roomIds.length > 0 && (
            <button
              onClick={() => setFilter((f) => ({ ...f, roomIds: [] }))}
              className="text-[10px] text-ink-3 hover:text-ink-1"
            >
              ล้าง
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rooms.map((r) => {
            const active =
              filter.roomIds.length === 0 || filter.roomIds.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggle("roomIds", r.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-1 rounded-pill border text-[11px] transition",
                  filter.roomIds.includes(r.id)
                    ? "bg-primary-50 border-primary-300 text-primary-700"
                    : active
                      ? "bg-white border-line text-ink-2 hover:border-primary-200"
                      : "bg-white border-line text-ink-3 opacity-60",
                )}
              >
                <span
                  className="w-2 h-2 rounded-pill"
                  style={{ background: r.color }}
                />
                {r.name}
              </button>
            );
          })}
        </div>
      </Card>

      <FilterChipGroup
        title="สถานะชำระเงิน"
        options={paymentStatusOpts}
        selected={filter.paymentStatuses}
        onToggle={(v) => toggle("paymentStatuses", v)}
        onClear={() =>
          setFilter((f) => ({ ...f, paymentStatuses: [] }))
        }
      />
      <FilterChipGroup
        title="สถานะการจอง"
        options={bookingStatusOpts}
        selected={filter.bookingStatuses}
        onToggle={(v) => toggle("bookingStatuses", v)}
        onClear={() =>
          setFilter((f) => ({ ...f, bookingStatuses: [] }))
        }
      />
      <FilterChipGroup
        title="ที่มาลูกค้า"
        options={sourceOpts}
        selected={filter.sources}
        onToggle={(v) => toggle("sources", v)}
        onClear={() => setFilter((f) => ({ ...f, sources: [] }))}
      />

    </aside>
  );
}

function FilterChipGroup({
  title,
  options,
  selected,
  onToggle,
  onClear,
}: {
  title: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          {title}
        </p>
        {selected.length > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-ink-3 hover:text-ink-1"
          >
            ล้าง
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onToggle(o.id)}
            className={cn(
              "px-2 py-1 rounded-pill border text-[11px] transition",
              selected.includes(o.id)
                ? "bg-primary-50 border-primary-300 text-primary-700"
                : "bg-white border-line text-ink-2 hover:border-primary-200",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ───────── Mini calendar ───────── */
function MiniCalendar({
  current,
  onPick,
  bookings,
}: {
  current: Date;
  onPick: (d: Date) => void;
  bookings: BookingWithRelations[];
}) {
  const [cursor, setCursor] = useState(
    new Date(current.getFullYear(), current.getMonth(), 1),
  );
  useEffect(() => {
    setCursor(new Date(current.getFullYear(), current.getMonth(), 1));
  }, [current]);

  const monthName = cursor.toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });

  const firstDay = cursor.getDay(); // 0=Sun
  const mondayOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const cells: Array<{ d: Date | null }> = [];
  for (let i = 0; i < mondayOffset; i++) cells.push({ d: null });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ d: new Date(cursor.getFullYear(), cursor.getMonth(), d) });
  while (cells.length % 7 !== 0) cells.push({ d: null });

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings) {
      const k = dateKey(new Date(b.starts_at));
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [bookings]);

  const today = new Date();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
          }
          className="w-6 h-6 rounded-pill hover:bg-surface-subtle grid place-items-center"
        >
          <ChevronLeft size={14} />
        </button>
        <p className="text-xs font-semibold tracking-tight">{monthName}</p>
        <button
          onClick={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
          }
          className="w-6 h-6 rounded-pill hover:bg-surface-subtle grid place-items-center"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[9px] text-ink-3 mb-1">
        {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c, i) => {
          if (!c.d) return <span key={i} />;
          const isToday = isSameDay(c.d, today);
          const isCurrent = isSameDay(c.d, current);
          const dayBookings = bookingsByDate.get(dateKey(c.d)) ?? 0;
          return (
            <button
              key={i}
              onClick={() => onPick(c.d!)}
              className={cn(
                "h-7 rounded-input text-[11px] tabular-nums grid place-items-center relative transition",
                isCurrent
                  ? "bg-primary-600 text-white font-semibold"
                  : isToday
                    ? "bg-primary-50 text-primary-700 font-semibold"
                    : "hover:bg-surface-subtle text-ink-2",
              )}
            >
              {c.d.getDate()}
              {dayBookings > 0 && !isCurrent && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Day view (multi-room column) ───────── */
function DayView({
  date,
  rooms,
  bookings,
  selectedIds,
  onToggleSelect,
  onOpen,
  onContextMenu,
  onEventDragStart,
  onSlotDrop,
  onResizeEnd,
}: {
  date: Date;
  rooms: Room[];
  bookings: BookingWithRelations[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onEventDragStart: (b: BookingWithRelations, e: React.DragEvent) => void;
  onSlotDrop: (
    e: React.DragEvent,
    roomId: string,
    dropDate: Date,
    minuteOfDay: number,
  ) => void;
  onResizeEnd: (bookingId: string, durationMin: number) => void;
}) {
  const todayBookings = bookings.filter((b) =>
    isSameDay(new Date(b.starts_at), date),
  );

  // Now indicator
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const showNowIndicator = isSameDay(now, date);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowOffsetPx =
    nowMin >= SERVICE_START_MIN && nowMin <= SERVICE_END_MIN
      ? ((nowMin - SERVICE_START_MIN) / 30) * SLOT_HEIGHT
      : -1;

  return (
    <Card className="!p-0 overflow-hidden">
      <div
        className="grid border-b border-line bg-surface-subtle"
        style={{
          gridTemplateColumns: `80px repeat(${rooms.length}, minmax(0,1fr))`,
        }}
      >
        <div className="px-3 py-3 text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
          เวลา
        </div>
        {rooms.map((r) => (
          <div key={r.id} className="px-4 py-3 border-l border-line">
            <p className="text-sm font-bold tracking-tight flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-pill"
                style={{ background: r.color }}
              />
              {r.name}
            </p>
            <p className="text-[11px] text-ink-3">
              {r.capacity_min}–{r.capacity_max} ท่าน ·{" "}
              {formatBaht(r.hourly_rate)}/ชม.
            </p>
          </div>
        ))}
      </div>

      <div className="relative max-h-[calc(100vh-220px)] min-h-[640px] overflow-y-auto scrollbar-thin">
        {showNowIndicator && nowOffsetPx >= 0 && (
          <div
            className="absolute left-0 right-0 z-20 pointer-events-none"
            style={{ top: nowOffsetPx }}
          >
            <div className="relative h-0">
              <div className="absolute left-0 right-0 border-t-2 border-red-500" />
              <div className="absolute left-0 -translate-y-1/2 px-1.5 py-0.5 bg-red-500 text-white text-[9px] rounded-pill tabular-nums font-semibold">
                {String(now.getHours()).padStart(2, "0")}:
                {String(now.getMinutes()).padStart(2, "0")}
              </div>
            </div>
          </div>
        )}

        {SLOTS.map((slot) => {
          const [h, m] = slot.split(":").map(Number);
          const slotMin = h * 60 + m;
          const isLunch = h === 12;
          const half = m === 30;
          return (
            <div
              key={slot}
              className={cn(
                "grid border-b border-line-soft",
                isLunch && "bg-surface-subtle/60",
              )}
              style={{
                gridTemplateColumns: `80px repeat(${rooms.length}, minmax(0,1fr))`,
                height: SLOT_HEIGHT,
              }}
            >
              <div className="px-3 py-2 text-[11px] tabular-nums text-ink-3 font-medium">
                {!half && slot}
              </div>
              {rooms.map((room) => {
                const event = todayBookings.find((b) => {
                  if (b.room_id !== room.id) return false;
                  const start = new Date(b.starts_at);
                  const sMin = start.getHours() * 60 + start.getMinutes();
                  // Safety net: a booking that starts before the visible window
                  // (legacy/imported data outside 07:00–22:00) is anchored to
                  // the first slot so it stays visible instead of vanishing and
                  // causing a silent double-book.
                  if (slotMin === SERVICE_START_MIN && sMin < SERVICE_START_MIN)
                    return true;
                  return start.getHours() === h && start.getMinutes() === m;
                });
                return (
                  <div
                    key={`${slot}-${room.id}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => onSlotDrop(e, room.id, date, slotMin)}
                    className="border-l border-line-soft min-h-[36px] relative hover:bg-primary-50/30 transition"
                  >
                    {event && (
                      <EventCard
                        event={event}
                        selected={selectedIds.has(event.id)}
                        onToggleSelect={() => onToggleSelect(event.id)}
                        onOpen={() => onOpen(event.id)}
                        onContextMenu={(x, y) =>
                          onContextMenu(event.id, x, y)
                        }
                        onDragStart={(e) => onEventDragStart(event, e)}
                        onResizeEnd={(d) => onResizeEnd(event.id, d)}
                      />
                    )}
                    {isLunch && !event && (
                      <div className="absolute inset-1 rounded-input border border-dashed border-line text-[10px] text-ink-3 grid place-items-center">
                        พัก
                      </div>
                    )}
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

/* ───────── Event card with resize handle ───────── */
function EventCard({
  event,
  selected,
  onToggleSelect,
  onOpen,
  onContextMenu,
  onDragStart,
  onResizeEnd,
}: {
  event: BookingWithRelations;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onResizeEnd: (durationMin: number) => void;
}) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  // Clamp the start to the visible window so a booking anchored to the first
  // slot (one that began before SERVICE_START_MIN) doesn't render oversized.
  const windowStart = new Date(start);
  windowStart.setHours(Math.floor(SERVICE_START_MIN / 60), SERVICE_START_MIN % 60, 0, 0);
  const effectiveStart = start < windowStart ? windowStart : start;
  const slotCount =
    (end.getTime() - effectiveStart.getTime()) / (30 * 60 * 1000);
  const baseHeight = slotCount * SLOT_HEIGHT - 4;

  const [resizing, setResizing] = useState(false);
  const [extraPx, setExtraPx] = useState(0);
  const startYRef = useRef<number>(0);

  function onResizeMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    startYRef.current = e.clientY;

    function onMove(ev: MouseEvent) {
      setExtraPx(ev.clientY - startYRef.current);
    }
    function onUp(ev: MouseEvent) {
      setResizing(false);
      const deltaPx = ev.clientY - startYRef.current;
      setExtraPx(0);
      const deltaSlots = Math.round(deltaPx / SLOT_HEIGHT);
      const newSlots = Math.max(1, slotCount + deltaSlots);
      const newDur = newSlots * 30;
      const origDur = slotCount * 30;
      if (newDur !== origDur) onResizeEnd(newDur);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const height = baseHeight + (resizing ? extraPx : 0);
  const lockMeta = (event.metadata as { lock?: { by_name: string } } | undefined)
    ?.lock;
  const cancelled = event.booking_status === "cancelled";

  return (
    <div
      draggable={!cancelled}
      onDragStart={onDragStart}
      onClick={(e) => {
        if (e.shiftKey) onToggleSelect();
        else onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      className={cn(
        "absolute inset-x-1 top-1 rounded-card-sm border-l-2 px-2 py-1 shadow-card hover:shadow-card-hover transition cursor-pointer group overflow-hidden",
        paymentColor(event.payment_status),
        selected && "!ring-2 ring-primary-600 ring-offset-1",
        cancelled && "opacity-50 line-through",
      )}
      style={{ height, zIndex: resizing ? 30 : undefined }}
      title={[
        event.customer?.display_name ??
          event.member?.full_name ??
          event.internal_title ??
          "—",
        event.org?.name,
        memberRoleLine(event),
        `${formatTime(event.starts_at)} – ${formatTime(event.ends_at)}`,
        event.reference_code,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      {/* Adaptive layout — short blocks (<70px) collapse to name + time only.
       *  Taller blocks add org/role/title/ref lines progressively. */}
      <div className="flex items-start gap-1 leading-tight">
        <p className="text-[11px] font-bold text-ink-1 tracking-tight truncate flex-1">
          {event.customer?.display_name ??
            event.member?.full_name ??
            event.internal_title ??
            "—"}
        </p>
        {selected && (
          <span className="w-3.5 h-3.5 rounded-sm bg-primary-600 text-white grid place-items-center text-[9px] shrink-0">
            ✓
          </span>
        )}
        {lockMeta && (
          <Lock
            size={10}
            className="text-amber-600 shrink-0"
            aria-label={`Locked by ${lockMeta.by_name}`}
          />
        )}
      </div>
      {height >= 50 && event.org && (
        <p className="text-[10px] text-primary-700 tracking-tight truncate font-medium leading-tight">
          {event.org.short_name ?? event.org.name}
        </p>
      )}
      {height >= 70 && memberRoleLine(event) && (
        <p className="text-[10px] text-ink-2 tracking-tight truncate leading-tight">
          {memberRoleLine(event)}
        </p>
      )}
      {height >= 90 &&
        event.member &&
        !event.customer?.display_name &&
        event.internal_title && (
          <p className="text-[10px] text-ink-3 tracking-tight truncate italic leading-tight">
            {event.internal_title}
          </p>
        )}
      <p className="text-[10px] text-ink-3 tabular-nums leading-tight">
        {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
      </p>
      {height >= 60 && (
        <p className="text-[10px] text-ink-3 tabular-nums leading-tight truncate">
          <code className="font-mono">{event.reference_code}</code>
          {event.source === "internal" && (
            <span className="ml-1.5 inline-flex items-center px-1 rounded-sm bg-primary-100 text-primary-700 text-[9px] font-semibold">
              สมาชิก
            </span>
          )}
        </p>
      )}
      {height >= 100 && event.customer?.tags?.includes("VIP") && (
        <Badge tone="primary" className="!text-[9px] !px-1.5 mt-1">
          VIP
        </Badge>
      )}

      {/* Resize handle */}
      {!cancelled && (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute left-2 right-2 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-primary-500/40 rounded-b-card-sm"
          title="ลากเพื่อปรับเวลา"
        />
      )}
    </div>
  );
}

/* ───────── Week view ───────── */
function WeekView({
  weekStart,
  bookings,
  rooms,
  onOpen,
  onPickDay,
}: {
  weekStart: Date;
  bookings: BookingWithRelations[];
  rooms: Room[];
  onOpen: (id: string) => void;
  onPickDay: (d: Date) => void;
}) {
  void rooms;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dayBookings = bookings.filter((b) =>
            isSameDay(new Date(b.starts_at), d),
          );
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="border-l border-line-soft first:border-l-0 min-h-[460px]"
            >
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className={cn(
                  "w-full px-3 py-2 border-b border-line text-left bg-surface-subtle/40 hover:bg-primary-50/40",
                  isToday && "bg-primary-50",
                )}
              >
                <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  {d.toLocaleDateString("th-TH", { weekday: "short" })}
                </p>
                <p
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    isToday && "text-primary-700",
                  )}
                >
                  {d.getDate()}
                </p>
              </button>
              <div className="p-1.5 space-y-1">
                {dayBookings.slice(0, 8).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onOpen(b.id)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-input border-l-2 text-[11px]",
                      paymentColor(b.payment_status),
                    )}
                  >
                    <p className="font-semibold truncate">
                      {bookingDisplayName(b)}
                    </p>
                    <p className="text-ink-3 tabular-nums">
                      {formatTime(b.starts_at)}
                    </p>
                  </button>
                ))}
                {dayBookings.length > 8 && (
                  <p className="text-[10px] text-ink-3 text-center">
                    +{dayBookings.length - 8} อื่นๆ
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ───────── Month view ───────── */
function MonthView({
  month,
  bookings,
  onPickDay,
}: {
  month: Date;
  bookings: BookingWithRelations[];
  onPickDay: (d: Date) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const firstDay = first.getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const cells: Array<Date | null> = [];
  for (let i = 0; i < mondayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();

  const byDate = useMemo(() => {
    const map = new Map<string, BookingWithRelations[]>();
    for (const b of bookings) {
      const k = dateKey(new Date(b.starts_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(b);
    }
    return map;
  }, [bookings]);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="grid grid-cols-7 bg-surface-subtle border-b border-line">
        {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold border-l border-line first:border-l-0"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d)
            return (
              <div
                key={i}
                className="min-h-[110px] border-l border-b border-line-soft first:border-l-0 bg-surface-subtle/40"
              />
            );
          const k = dateKey(d);
          const list = byDate.get(k) ?? [];
          const revenue = list.reduce(
            (s, b) => s + Number(b.paid_amount ?? 0),
            0,
          );
          const isToday = isSameDay(d, today);
          return (
            <button
              key={i}
              onClick={() => onPickDay(d)}
              className={cn(
                "min-h-[110px] border-l border-b border-line-soft first:border-l-0 p-2 text-left hover:bg-primary-50/20 transition",
                isToday && "bg-primary-50/30",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    isToday && "text-primary-700",
                  )}
                >
                  {d.getDate()}
                </span>
                {list.length > 0 && (
                  <span className="text-[9px] text-ink-3 tabular-nums">
                    {list.length}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] truncate border-l-2",
                      paymentColor(b.payment_status),
                    )}
                  >
                    {formatTime(b.starts_at)} · {bookingDisplayName(b)}
                  </div>
                ))}
                {list.length > 3 && (
                  <p className="text-[9px] text-ink-3">
                    +{list.length - 3} อื่นๆ
                  </p>
                )}
              </div>
              {revenue > 0 && (
                <p className="mt-1 text-[9px] text-emerald-700 tabular-nums">
                  {formatBaht(revenue)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ───────── Year heatmap view ───────── */
function YearView({
  year,
  bookings,
  onPickDay,
}: {
  year: number;
  bookings: BookingWithRelations[];
  onPickDay: (d: Date) => void;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings) {
      const k = dateKey(new Date(b.starts_at));
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [bookings]);
  const maxCount = useMemo(() => {
    let m = 1;
    byDate.forEach((v) => {
      if (v > m) m = v;
    });
    return m;
  }, [byDate]);

  function color(count: number) {
    if (count === 0) return "bg-surface-subtle/60";
    const ratio = count / maxCount;
    if (ratio < 0.25) return "bg-primary-100";
    if (ratio < 0.5) return "bg-primary-300";
    if (ratio < 0.75) return "bg-primary-500";
    return "bg-primary-700";
  }

  return (
    <Card>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, mi) => {
          const monthDate = new Date(year, mi, 1);
          const monthName = monthDate.toLocaleDateString("th-TH", {
            month: "short",
          });
          const daysInMonth = new Date(year, mi + 1, 0).getDate();
          const firstDay = monthDate.getDay();
          const mondayOffset = (firstDay + 6) % 7;
          const cells: Array<Date | null> = [];
          for (let i = 0; i < mondayOffset; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++)
            cells.push(new Date(year, mi, d));
          while (cells.length % 7 !== 0) cells.push(null);

          return (
            <div key={mi}>
              <p className="text-xs font-semibold text-ink-2 mb-1.5 tracking-tight">
                {monthName}
              </p>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  if (!d) return <span key={i} />;
                  const count = byDate.get(dateKey(d)) ?? 0;
                  return (
                    <button
                      key={i}
                      onClick={() => onPickDay(d)}
                      title={`${dateKey(d)} · ${count} จอง`}
                      className={cn(
                        "h-5 rounded-sm hover:ring-2 ring-primary-300",
                        color(count),
                      )}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-ink-3">
        น้อย
        <span className="w-3 h-3 rounded-sm bg-surface-subtle border border-line" />
        <span className="w-3 h-3 rounded-sm bg-primary-100" />
        <span className="w-3 h-3 rounded-sm bg-primary-300" />
        <span className="w-3 h-3 rounded-sm bg-primary-500" />
        <span className="w-3 h-3 rounded-sm bg-primary-700" />
        มาก
      </div>
    </Card>
  );
}

/* ───────── Timeline view (gantt-like, rooms = rows) ───────── */
function TimelineView({
  date,
  bookings,
  rooms,
  onOpen,
}: {
  date: Date;
  bookings: BookingWithRelations[];
  rooms: Room[];
  onOpen: (id: string) => void;
}) {
  const dayBookings = bookings.filter((b) =>
    isSameDay(new Date(b.starts_at), date),
  );
  const totalMin = SERVICE_END_MIN - SERVICE_START_MIN;

  return (
    <Card className="!p-0 overflow-hidden">
      <div
        className="grid border-b border-line bg-surface-subtle text-[11px] text-ink-3"
        style={{ gridTemplateColumns: "120px 1fr" }}
      >
        <div className="px-3 py-2 uppercase tracking-[0.08em] font-semibold">
          ห้อง
        </div>
        <div className="relative px-2 py-2">
          <div className="flex justify-between tabular-nums">
            {Array.from({ length: 14 }, (_, i) => {
              const min = SERVICE_START_MIN + i * 60;
              return (
                <span key={i}>{`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`}</span>
              );
            })}
          </div>
        </div>
      </div>

      {rooms.map((r) => {
        const rowBookings = dayBookings.filter((b) => b.room_id === r.id);
        return (
          <div
            key={r.id}
            className="grid border-b border-line-soft"
            style={{ gridTemplateColumns: "120px 1fr" }}
          >
            <div className="px-3 py-3 text-xs font-semibold tracking-tight bg-surface-subtle/40 border-r border-line-soft flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-pill"
                style={{ background: r.color }}
              />
              {r.name}
            </div>
            <div className="relative h-12">
              {rowBookings.map((b) => {
                const sMin = minutesOf(b.starts_at) - SERVICE_START_MIN;
                const eMin = minutesOf(b.ends_at) - SERVICE_START_MIN;
                const left = `${(sMin / totalMin) * 100}%`;
                const width = `${((eMin - sMin) / totalMin) * 100}%`;
                const style: CSSProperties = { left, width };
                return (
                  <button
                    key={b.id}
                    onClick={() => onOpen(b.id)}
                    style={style}
                    className={cn(
                      "absolute top-1.5 bottom-1.5 rounded-input border-l-2 px-2 text-left overflow-hidden",
                      paymentColor(b.payment_status),
                    )}
                  >
                    <p className="text-[10px] font-semibold truncate">
                      {bookingDisplayName(b)}
                    </p>
                    <p className="text-[9px] text-ink-3 tabular-nums">
                      {formatTime(b.starts_at)}–{formatTime(b.ends_at)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

/* ───────── List view ───────── */
function ListView({
  bookings,
  rooms,
  selectedIds,
  onToggleSelect,
  onOpen,
}: {
  bookings: BookingWithRelations[];
  rooms: Room[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const sorted = [...bookings].sort(
    (a, b) =>
      new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
  );
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-subtle text-[11px] uppercase tracking-[0.08em] text-ink-3">
              <th className="px-3 py-2 text-left w-10">
                <span className="sr-only">เลือก</span>
              </th>
              <th className="px-3 py-2 text-left">รหัส</th>
              <th className="px-3 py-2 text-left">ลูกค้า</th>
              <th className="px-3 py-2 text-left">ห้อง</th>
              <th className="px-3 py-2 text-left">เวลา</th>
              <th className="px-3 py-2 text-right">ยอด</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const room = roomMap.get(b.room_id);
              return (
                <tr
                  key={b.id}
                  className="border-t border-line-soft hover:bg-primary-50/20"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(b.id)}
                      onChange={() => onToggleSelect(b.id)}
                      className="w-4 h-4 accent-primary-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onOpen(b.id)}
                      className="font-mono text-xs font-semibold text-primary-700 hover:underline"
                    >
                      {b.reference_code}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {bookingDisplayName(b)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {room?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums">
                    {new Date(b.starts_at).toLocaleString("th-TH", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums text-right">
                    {formatBaht(Number(b.total_amount))}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        b.payment_status === "paid"
                          ? "success"
                          : b.payment_status === "deposit"
                            ? "warning"
                            : b.payment_status === "free"
                              ? "muted"
                              : "danger"
                      }
                      className="!text-[10px]"
                    >
                      {b.payment_status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-xs text-ink-3">
                  ไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ───────── Context menu ───────── */
function ContextMenu({
  x,
  y,
  onClose,
  onEdit,
  onPay,
  onCancel,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
  onPay: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 w-48 surface-card !p-0 overflow-hidden shadow-pop"
    >
      <button
        onClick={onEdit}
        className="block w-full text-left px-3 py-2 text-sm hover:bg-primary-50/50"
      >
        แก้ไขการจอง
      </button>
      <button
        onClick={onPay}
        className="block w-full text-left px-3 py-2 text-sm hover:bg-primary-50/50"
      >
        บันทึกการชำระเงิน
      </button>
      <div className="h-px bg-line-soft" />
      <button
        onClick={onCancel}
        className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        ยกเลิกการจอง
      </button>
    </div>
  );
}

/* ───────── Bulk action bar ───────── */
function BulkActionBar({
  count,
  onClear,
  onCancel,
  onTelegram,
  onInvoice,
}: {
  count: number;
  onClear: () => void;
  onCancel: () => void;
  onTelegram: () => void;
  onInvoice: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 surface-card !p-0 shadow-pop print:hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Badge tone="primary" className="!text-xs">
          {count} เลือก
        </Badge>
        <button
          onClick={onInvoice}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-pill border border-line text-xs hover:bg-surface-subtle"
        >
          <Mail size={12} /> ส่งใบแจ้งหนี้
        </button>
        <button
          onClick={onTelegram}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-pill border border-line text-xs hover:bg-surface-subtle"
        >
          <Send size={12} /> Telegram
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-pill bg-red-50 text-red-700 text-xs"
        >
          <Trash2 size={12} /> ยกเลิก
        </button>
        <button
          onClick={onClear}
          className="text-ink-3 hover:text-ink-1 ml-1"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function BulkPromptModal({
  title,
  subtitle,
  inputLabel,
  confirmLabel,
  tone,
  onClose,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  inputLabel: string;
  confirmLabel: string;
  tone?: "danger";
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md surface-card max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-bold tracking-tight">{title}</p>
            <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>
        <label className="block text-xs font-medium text-ink-2 mb-1.5">
          {inputLabel}
        </label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-input border border-line text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={() => value.trim() && onConfirm(value.trim())}
            disabled={!value.trim()}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BulkConfirmModal({
  title,
  subtitle,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md surface-card max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-bold tracking-tight">{title}</p>
            <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Conflict modal w/ AI suggestions ───────── */
function ConflictModal({
  suggestions,
  onClose,
  onPick,
}: {
  suggestions: Array<{
    startsAt: string;
    endsAt: string;
    startLabel: string;
    endLabel: string;
  }>;
  onClose: () => void;
  onPick: (s: { startsAt: string; endsAt: string }) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md surface-card !p-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
        <div className="shrink-0 p-5 bg-gradient-to-br from-amber-50 to-white border-b border-line-soft flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0">
            <AlertTriangle size={16} />
          </span>
          <div className="flex-1">
            <p className="font-bold tracking-tight">
              เวลาที่เลือกทับซ้อนกับการจองอื่น
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              AI แนะนำช่วงเวลาว่างถัดไปที่ใกล้เคียงที่สุด
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {suggestions.length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-4">
              ไม่มีช่วงเวลาว่างในวันนี้
            </p>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onPick(s)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-input border border-line hover:border-primary-400 hover:bg-primary-50/30 text-left transition"
              >
                <Sparkles size={14} className="text-primary-600 shrink-0" />
                <p className="text-sm font-semibold tracking-tight tabular-nums flex-1">
                  {s.startLabel} – {s.endLabel}
                </p>
                <ChevronDown size={14} className="text-ink-3 -rotate-90" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── CSV export ───────── */
function exportCSV(bookings: BookingWithRelations[], rooms: Room[]) {
  const roomMap = new Map(rooms.map((r) => [r.id, r.name]));
  const header = [
    "รหัส",
    "ลูกค้า/สมาชิก",
    "องค์กร",
    "เบอร์",
    "ห้อง",
    "เริ่ม",
    "สิ้นสุด",
    "ยอดรวม",
    "ชำระแล้ว",
    "สถานะชำระ",
    "สถานะจอง",
  ];
  const lines = [header.join(",")];
  for (const b of bookings) {
    lines.push(
      [
        b.reference_code,
        `"${b.customer?.display_name ?? b.member?.full_name ?? ""}"`,
        `"${b.org?.name ?? ""}"`,
        b.customer?.phone ?? b.member?.phone ?? "",
        `"${roomMap.get(b.room_id) ?? ""}"`,
        new Date(b.starts_at).toLocaleString("th-TH"),
        new Date(b.ends_at).toLocaleString("th-TH"),
        b.total_amount,
        b.paid_amount,
        b.payment_status,
        b.booking_status,
      ].join(","),
    );
  }
  const blob = new Blob(["﻿" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bookings-${dateKey(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
