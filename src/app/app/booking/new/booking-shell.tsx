"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  AlertCircle,
  Save,
  Building2,
  Image as ImageIcon,
  X,
  Plus,
  Mail,
  Users,
  Repeat,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { createMemberBooking } from "@/lib/actions/members";

interface RoomLite {
  id: string;
  name: string;
  color: string;
  capacity_min: number | null;
  capacity_max: number | null;
  thumbnail_url: string | null;
  gallery_urls: string[];
  amenities: string[];
  hourly_rate: number;
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
  memberId: string;
  orgId: string;
  defaultDate: string;
  defaultSlot: string;
  defaultRoomId: string;
  org: { name: string; short_name: string | null } | null;
  usage: {
    hoursThisMonth: number;
    quotaHoursMonthly: number;
    quotaPct: number;
    quotaUnlimited: boolean;
    activeMembers: number;
    members: number;
  };
}

const SLOTS: string[] = [];
for (let m = 8 * 60 + 30; m <= 22 * 60; m += 30) {
  SLOTS.push(
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
  );
}
const MORNING = SLOTS.filter((s) => {
  const [h] = s.split(":").map(Number);
  return h < 13;
});
const AFTERNOON = SLOTS.filter((s) => {
  const [h] = s.split(":").map(Number);
  return h >= 13 && h < 17;
});
const EVENING = SLOTS.filter((s) => {
  const [h] = s.split(":").map(Number);
  return h >= 17;
});

const SLOT_HEIGHT = 32;

type RecurrenceRule =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "weekdays"
  | "custom";

const TH_WEEKDAY = [
  "วันอาทิตย์",
  "วันจันทร์",
  "วันอังคาร",
  "วันพุธ",
  "วันพฤหัสบดี",
  "วันศุกร์",
  "วันเสาร์",
];
const TH_MONTH = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/** Compute the ISO date strings for a recurrence series anchored at the
 *  given starting date. `count` caps the series so we never expand to
 *  thousands of rows. */
function expandRecurrence(
  startDateStr: string,
  rule: RecurrenceRule,
  count: number,
): string[] {
  if (rule === "none") return [startDateStr];
  const start = new Date(`${startDateStr}T00:00:00+07:00`);
  const dates: string[] = [];
  const safeCount = Math.min(Math.max(1, count), 52);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (rule === "weekdays") {
    const d = new Date(start);
    while (dates.length < safeCount) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) dates.push(fmt(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  for (let i = 0; i < safeCount; i++) {
    const d = new Date(start);
    if (rule === "daily") d.setDate(d.getDate() + i);
    else if (rule === "weekly") d.setDate(d.getDate() + i * 7);
    else if (rule === "monthly") d.setMonth(d.getMonth() + i);
    else if (rule === "yearly") d.setFullYear(d.getFullYear() + i);
    else if (rule === "custom") d.setDate(d.getDate() + i * 7);
    dates.push(fmt(d));
  }
  return dates;
}

function recurrenceLabels(date: string) {
  const d = new Date(`${date}T00:00:00+07:00`);
  const dow = TH_WEEKDAY[d.getDay()];
  const day = d.getDate();
  const month = TH_MONTH[d.getMonth()];
  return {
    none: "ไม่เกิดซ้ำ",
    daily: "รายวัน",
    weekly: `รายสัปดาห์ ใน ${dow}`,
    monthly: `รายเดือน ใน วันที่ ${day}`,
    yearly: `รายปี ในเดือน ${month} วันที่ ${day}`,
    weekdays: "ทุกวันธรรมดา (จันทร์–ศุกร์)",
    custom: "กำหนดเอง...",
  } as Record<RecurrenceRule, string>;
}

function slotToMinutes(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function endOfSlot(slot: string) {
  const [h, m] = slot.split(":").map(Number);
  const total = h * 60 + m + 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function isoForDateSlot(date: string, slot: string) {
  const [h, m] = slot.split(":").map(Number);
  const d = new Date(`${date}T00:00:00+07:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function MemberBookingShell({
  rooms,
  bookings,
  memberId,
  orgId,
  defaultDate,
  defaultSlot,
  defaultRoomId,
  org,
  usage,
}: Props) {
  const router = useRouter();

  const [roomId, setRoomId] = useState(defaultRoomId);
  const [date, setDate] = useState(defaultDate);
  const [selectedSlots, setSelectedSlots] = useState<string[]>(
    SLOTS.includes(defaultSlot) ? [defaultSlot] : [],
  );
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [attendees, setAttendees] = useState(4);
  const [isPublic, setIsPublic] = useState(true);
  const [notes, setNotes] = useState("");
  const [attendeeEmailInput, setAttendeeEmailInput] = useState("");
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<RecurrenceRule>("none");
  const [recurrenceCount, setRecurrenceCount] = useState(8);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "success"; reference: string; bookingId: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === roomId) ?? null,
    [rooms, roomId],
  );

  // All bookings for the selected room on the selected day.
  const dayRoomBookings = useMemo(() => {
    const d0 = new Date(`${date}T00:00:00+07:00`).getTime();
    const d1 = d0 + 24 * 3600 * 1000;
    return bookings.filter(
      (b) =>
        b.room_id === roomId &&
        new Date(b.starts_at).getTime() >= d0 &&
        new Date(b.starts_at).getTime() < d1,
    );
  }, [bookings, roomId, date]);

  // Slots already taken (cannot pick).
  const takenSlots = useMemo(() => {
    const set = new Set<string>();
    for (const b of dayRoomBookings) {
      const start = new Date(b.starts_at);
      const end = new Date(b.ends_at);
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();
      for (const s of SLOTS) {
        const m = slotToMinutes(s);
        if (m >= startMin && m < endMin) set.add(s);
      }
    }
    return set;
  }, [dayRoomBookings]);

  const summary = useMemo(() => {
    if (selectedSlots.length === 0) return { hours: 0, range: "—" };
    const sorted = [...selectedSlots].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const [lh, lm] = last.split(":").map(Number);
    const endMin = lh * 60 + lm + 30;
    const endStr = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    return {
      hours: selectedSlots.length * 0.5,
      range: `${first} – ${endStr}`,
    };
  }, [selectedSlots]);

  function toggleSlot(slot: string) {
    if (takenSlots.has(slot)) return;
    setSelectedSlots((prev) => {
      if (prev.includes(slot)) return prev.filter((s) => s !== slot);
      if (prev.length === 0) return [slot];
      // Range select; reject if any slot in the contiguous range is taken.
      const indices = prev.map((s) => SLOTS.indexOf(s));
      const newIdx = SLOTS.indexOf(slot);
      const min = Math.min(...indices, newIdx);
      const max = Math.max(...indices, newIdx);
      const range = SLOTS.slice(min, max + 1);
      if (range.some((s) => takenSlots.has(s))) return [slot];
      return range;
    });
  }

  function addAttendeeEmail() {
    const email = attendeeEmailInput.trim();
    if (!email) return;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) {
      setFeedback({ kind: "error", message: "Email ไม่ถูกต้อง" });
      return;
    }
    if (attendeeEmails.includes(email)) return;
    setAttendeeEmails([...attendeeEmails, email]);
    setAttendeeEmailInput("");
    setFeedback(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!title.trim()) {
      setFeedback({ kind: "error", message: "ใส่หัวข้อประชุม" });
      return;
    }
    if (!roomId) {
      setFeedback({ kind: "error", message: "เลือกห้อง" });
      return;
    }
    if (selectedSlots.length === 0) {
      setFeedback({ kind: "error", message: "เลือกช่วงเวลา" });
      return;
    }
    if (selectedSlots.some((s) => takenSlots.has(s))) {
      setFeedback({
        kind: "error",
        message: "ช่วงเวลานี้มีการจองแล้ว",
      });
      return;
    }

    const sorted = [...selectedSlots].sort();
    const start = isoForDateSlot(date, sorted[0]);
    const [lh, lm] = sorted[sorted.length - 1].split(":").map(Number);
    const endDate = new Date(`${date}T00:00:00+07:00`);
    endDate.setHours(lh, lm + 30, 0, 0);

    const startHour = Number(sorted[0].split(":")[0]);
    const startMinute = Number(sorted[0].split(":")[1]);

    startTransition(async () => {
      const res = await createMemberBooking(
        {
          roomId,
          startsAt: start,
          endsAt: endDate.toISOString(),
          attendees,
          title: title.trim(),
          agenda: agenda || undefined,
          isPublic,
          notes: notes || undefined,
          attendeeEmails,
          recurrence:
            recurrence === "none"
              ? undefined
              : {
                  rule: recurrence,
                  count: recurrenceCount,
                  startHour,
                  startMinute,
                  durationMin: selectedSlots.length * 30,
                },
        },
        { memberId, orgId },
      );
      if (!res.ok) {
        setFeedback({
          kind: "error",
          message:
            res.error === "time_conflict"
              ? "เวลานี้มีการจองแล้ว ลองเลือกใหม่"
              : res.error === "validation"
                ? "กรอกข้อมูลให้ครบ"
                : res.error,
        });
        return;
      }
      setFeedback({
        kind: "success",
        reference: res.reference,
        bookingId: res.bookingId,
      });
      // Bounce to My Bookings so the user immediately sees the new entry.
      const extra =
        res.recurrenceCreated && res.recurrenceCreated > 1
          ? `&recurring=${res.recurrenceCreated}${res.recurrenceSkipped ? `&skipped=${res.recurrenceSkipped}` : ""}`
          : "";
      router.push(`/app/my-bookings?created=${res.reference}${extra}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5"
    >
      {/* ───── LEFT: FORM ─────────────────────────────────────────── */}
      <div className="space-y-4 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold tracking-tighter text-primary-600">
            จองห้องประชุม
          </h1>
          <Badge tone="primary" className="!text-[11px]">
            <Building2 size={11} className="mr-1" />
            {org?.short_name ?? org?.name ?? "องค์กร"}
          </Badge>
          <div className="ml-auto text-[11px] text-ink-3">
            {usage.quotaUnlimited ? (
              <>
                ใช้โควต้า{" "}
                <b className="text-ink-1 tabular-nums">
                  {usage.hoursThisMonth} ชม.
                </b>{" "}
                · <span className="text-emerald-700 font-medium">ไม่จำกัด</span>
              </>
            ) : (
              <>
                ใช้โควต้า{" "}
                <b className="text-ink-1 tabular-nums">
                  {usage.hoursThisMonth}/{usage.quotaHoursMonthly} ชม.
                </b>{" "}
                ({usage.quotaPct}%)
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>เลือกห้อง</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rooms.map((r) => {
              const active = roomId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoomId(r.id)}
                  className={cn(
                    "flex gap-3 p-2 rounded-input border text-left transition",
                    active
                      ? "border-primary-600 bg-primary-50/40 ring-4 ring-primary-50"
                      : "border-line bg-white hover:border-primary-200",
                  )}
                >
                  <div
                    className="relative w-20 h-20 rounded-input overflow-hidden shrink-0 bg-surface-subtle grid place-items-center"
                    style={{ borderLeft: `3px solid ${r.color}` }}
                  >
                    {r.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnail_url}
                        alt={r.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon
                        size={20}
                        className="text-ink-3"
                        strokeWidth={1.5}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm tracking-tight truncate">
                      {r.name}
                    </p>
                    <p className="text-[11px] text-ink-3 tabular-nums">
                      {r.capacity_min}–{r.capacity_max} ท่าน
                    </p>
                    <p className="text-[11px] text-ink-3 mt-0.5 line-clamp-1">
                      {r.amenities.slice(0, 3).join(" · ") || "—"}
                    </p>
                  </div>
                  {active && (
                    <Check size={16} className="text-primary-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>วัน & เวลา</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>วันที่</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSelectedSlots([]);
                  }}
                />
              </div>
              <div>
                <Label>จำนวนคน</Label>
                <Input
                  type="number"
                  min={1}
                  value={attendees}
                  onChange={(e) => setAttendees(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label>ช่วงเวลา</Label>
              <p className="text-[11px] text-ink-3 mb-2">
                แต่ละช่อง = 30 นาที (เช่น คลิก{" "}
                <b className="text-ink-2">11:00</b> = จอง{" "}
                <b className="text-ink-2">11:00–11:30</b>) · คลิกหลายช่องเพื่อเลือกเป็นช่วง ·
                สีแดงคือถูกจองแล้ว
              </p>
              <SlotGroup
                title="รอบเช้า"
                slots={MORNING}
                selected={selectedSlots}
                taken={takenSlots}
                onToggle={toggleSlot}
              />
              <SlotGroup
                title="รอบบ่าย"
                slots={AFTERNOON}
                selected={selectedSlots}
                taken={takenSlots}
                onToggle={toggleSlot}
              />
              <SlotGroup
                title="รอบพิเศษ (17:00–22:00)"
                slots={EVENING}
                selected={selectedSlots}
                taken={takenSlots}
                onToggle={toggleSlot}
              />
            </div>

            {summary.hours > 0 && (
              <div className="text-xs text-ink-2 bg-primary-50/60 border border-primary-100 rounded-input px-4 py-2.5">
                เลือก <b>{summary.range}</b> · {summary.hours} ชม.
              </div>
            )}

            {/* ── การจองซ้ำ ── (members only) ─────────────────────────── */}
            <div className="border-t border-line-soft pt-4">
              <Label>
                <span className="inline-flex items-center gap-1.5">
                  <Repeat size={12} /> จองซ้ำ
                </span>
              </Label>
              <Select
                value={recurrence}
                onChange={(e) =>
                  setRecurrence(e.target.value as RecurrenceRule)
                }
              >
                {(
                  [
                    "none",
                    "daily",
                    "weekly",
                    "monthly",
                    "yearly",
                    "weekdays",
                    "custom",
                  ] as RecurrenceRule[]
                ).map((r) => (
                  <option key={r} value={r}>
                    {recurrenceLabels(date)[r]}
                  </option>
                ))}
              </Select>
              {recurrence !== "none" && (
                <div className="mt-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>จำนวนครั้งที่จอง</Label>
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        value={recurrenceCount}
                        onChange={(e) =>
                          setRecurrenceCount(
                            Math.max(1, Math.min(52, Number(e.target.value) || 1)),
                          )
                        }
                      />
                    </div>
                    <div className="text-[11px] text-ink-3 self-end pb-2.5">
                      ระบบจะข้ามวันที่ห้องไม่ว่าง · สูงสุด 52 ครั้ง
                    </div>
                  </div>
                  {summary.hours > 0 && (
                    <p className="text-[11px] text-primary-700 bg-primary-50/60 border border-primary-100 rounded-input px-3 py-2">
                      <b>ดูตัวอย่าง:</b>{" "}
                      {expandRecurrence(date, recurrence, recurrenceCount)
                        .slice(0, 4)
                        .map((d) =>
                          new Date(`${d}T00:00:00+07:00`).toLocaleDateString(
                            "th-TH",
                            { day: "numeric", month: "short" },
                          ),
                        )
                        .join(" · ")}
                      {recurrenceCount > 4 && ` · +${recurrenceCount - 4}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดประชุม</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <Label>หัวข้อประชุม *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น Sprint Planning, Team Workshop"
                required
              />
            </div>

            <div>
              <Label>
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={12} /> Email ผู้เข้าร่วม (ไม่บังคับ)
                </span>
              </Label>
              <p className="text-[11px] text-ink-3 mb-2">
                ผู้เข้าร่วมจะได้รับอีเมลคำเชิญทันทีหลังกดยืนยันการจอง
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={attendeeEmailInput}
                  onChange={(e) => setAttendeeEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAttendeeEmail();
                    }
                  }}
                  placeholder="name@company.com"
                />
                <Button
                  type="button"
                  variant="secondary"
                  iconLeft={<Plus size={14} />}
                  onClick={addAttendeeEmail}
                >
                  เพิ่ม
                </Button>
              </div>
              {attendeeEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {attendeeEmails.map((em) => (
                    <span
                      key={em}
                      className="inline-flex items-center gap-1 text-[11px] rounded-pill bg-primary-50 text-primary-700 pl-2.5 pr-1 py-0.5"
                    >
                      {em}
                      <button
                        type="button"
                        onClick={() =>
                          setAttendeeEmails(
                            attendeeEmails.filter((x) => x !== em),
                          )
                        }
                        className="w-4 h-4 rounded-full hover:bg-primary-100 grid place-items-center"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Agenda (ไม่บังคับ)</Label>
              <Textarea
                rows={3}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="1. Review last sprint..."
              />
            </div>
            <div>
              <Label>หมายเหตุภายใน</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เช่น เตรียม HDMI · ขอ snack"
              />
            </div>
            <label className="flex items-start gap-3 p-3 rounded-input border border-line cursor-pointer hover:border-primary-200">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-primary-600"
              />
              <div>
                <p className="text-sm font-medium tracking-tight">
                  ให้เพื่อนในองค์กรเห็นหัวข้อ
                </p>
                <p className="text-xs text-ink-3 mt-0.5">
                  ถ้าปิด เพื่อนจะเห็นแค่ &quot;เพื่อนในองค์กร&quot; ไม่เห็นหัวข้อ
                </p>
              </div>
            </label>
          </div>
        </Card>

        {feedback && (
          <div
            className={cn(
              "p-4 rounded-card-sm border text-sm flex items-start gap-2",
              feedback.kind === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-red-50 text-red-700 border-red-200",
            )}
          >
            {feedback.kind === "success" ? (
              <>
                <Check size={16} className="mt-0.5 shrink-0" />
                <span>
                  จองสำเร็จ — รหัส{" "}
                  <code className="font-mono font-bold">
                    {feedback.reference}
                  </code>{" "}
                  ·{" "}
                  <a
                    href={`/app/booking/${feedback.bookingId}`}
                    className="underline font-medium"
                  >
                    ดูรายละเอียด
                  </a>
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{feedback.message}</span>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => router.back()}
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            variant="gradient"
            className="flex-1"
            iconLeft={<Save size={16} />}
            disabled={pending}
          >
            {pending ? "กำลังจอง..." : "ยืนยันการจอง"}
          </Button>
        </div>
      </div>

      {/* ───── RIGHT: LIVE CALENDAR ───────────────────────────────── */}
      <div className="min-w-0">
        <Card className="!p-0 overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] flex flex-col">
          <div className="p-4 border-b border-line bg-surface-subtle/50">
            <div className="flex items-start gap-3">
              {selectedRoom?.thumbnail_url ? (
                <div className="relative w-14 h-14 rounded-input overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedRoom.thumbnail_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-14 h-14 rounded-input grid place-items-center text-white shrink-0"
                  style={{
                    background:
                      selectedRoom?.color ?? "var(--color-primary-500, #3b5bdb)",
                  }}
                >
                  <Building2 size={20} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold tracking-tighter text-ink-1">
                  {selectedRoom?.name ?? "—"}
                </p>
                <p className="text-xs text-ink-3 tabular-nums">
                  {selectedRoom &&
                    `${selectedRoom.capacity_min}–${selectedRoom.capacity_max} ท่าน`}
                </p>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  {new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="text-right text-[11px] text-ink-3">
                <p className="flex items-center justify-end gap-1">
                  <Users size={11} /> {attendees}
                </p>
                <p>{summary.hours} ชม.</p>
              </div>
            </div>
          </div>

          <RoomDayTimeline
            slots={SLOTS}
            takenBookings={dayRoomBookings}
            selectedSlots={selectedSlots}
            previewTitle={title || "การประชุมของคุณ"}
            previewAttendees={attendees}
            memberId={memberId}
            orgId={orgId}
          />
        </Card>
      </div>
    </form>
  );
}

function SlotGroup({
  title,
  slots,
  selected,
  taken,
  onToggle,
}: {
  title: string;
  slots: string[];
  selected: string[];
  taken: Set<string>;
  onToggle: (slot: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-[11px] text-ink-3 uppercase tracking-[0.06em] mb-2">
        {title}
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {slots.map((slot) => {
          const isSelected = selected.includes(slot);
          const isTaken = taken.has(slot);
          return (
            <button
              key={slot}
              type="button"
              disabled={isTaken}
              onClick={() => onToggle(slot)}
              className={cn(
                "h-11 rounded-input text-xs font-medium tabular-nums transition border flex flex-col items-center justify-center leading-tight",
                isTaken
                  ? "bg-red-50 border-red-200 text-red-500 line-through cursor-not-allowed"
                  : isSelected
                    ? "bg-primary-600 text-white border-primary-600 shadow-card"
                    : "bg-white border-line text-ink-2 hover:border-primary-300",
              )}
              title={
                isTaken
                  ? "มีการจองแล้ว"
                  : `${slot} – ${endOfSlot(slot)} (30 นาที)`
              }
            >
              <span
                className={cn(
                  "text-[11px] font-semibold leading-none tracking-tight",
                  isTaken && "line-through",
                )}
              >
                {slot}-{endOfSlot(slot)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RoomDayTimeline({
  slots,
  takenBookings,
  selectedSlots,
  previewTitle,
  previewAttendees,
  memberId,
  orgId,
}: {
  slots: string[];
  takenBookings: BookingLite[];
  selectedSlots: string[];
  previewTitle: string;
  previewAttendees: number;
  memberId: string;
  orgId: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin relative">
      {slots.map((slot) => {
        const [h, m] = slot.split(":").map(Number);
        const half = m === 30;
        const eventStart = takenBookings.find((b) => {
          const s = new Date(b.starts_at);
          return s.getHours() === h && s.getMinutes() === m;
        });
        const isPreviewStart =
          selectedSlots.length > 0 &&
          [...selectedSlots].sort()[0] === slot;

        return (
          <div
            key={slot}
            className="grid border-b border-line-soft relative"
            style={{
              gridTemplateColumns: "60px minmax(0,1fr)",
              height: SLOT_HEIGHT,
            }}
          >
            <div className="px-2 py-2 text-[10px] tabular-nums text-ink-3 font-medium border-r border-line-soft">
              {!half && slot}
            </div>
            <div className="relative">
              {eventStart && (
                <EventBlock event={eventStart} memberId={memberId} orgId={orgId} />
              )}
              {isPreviewStart && (
                <PreviewBlock
                  selectedSlots={selectedSlots}
                  title={previewTitle}
                  attendees={previewAttendees}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventBlock({
  event,
  memberId,
  orgId,
}: {
  event: BookingLite;
  memberId: string;
  orgId: string;
}) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const slotCount = (end.getTime() - start.getTime()) / (30 * 60 * 1000);
  const height = slotCount * SLOT_HEIGHT - 4;

  const isMine = event.member_id === memberId;
  const isSameOrg =
    !isMine && event.source === "internal" && event.org_id === orgId;
  const tone = isMine
    ? "border-l-emerald-500 bg-emerald-100/80 text-emerald-900"
    : isSameOrg
      ? "border-l-primary-500 bg-primary-100/70 text-primary-900"
      : event.source === "external"
        ? "border-l-slate-500 bg-slate-100 text-slate-700"
        : "border-l-primary-300 bg-primary-50 text-primary-700";

  const label = isMine
    ? event.internal_title ?? "การประชุมของคุณ"
    : isSameOrg
      ? event.is_public
        ? event.internal_title ?? event.member?.full_name ?? "เพื่อนในองค์กร"
        : "เพื่อนในองค์กร"
      : event.source === "external"
        ? "EasySpace · ลูกค้าภายนอก"
        : event.org?.name ?? "อื่น";

  return (
    <div
      className={cn(
        "absolute inset-x-1 top-1 rounded-card-sm border-l-2 px-2.5 py-1.5",
        tone,
      )}
      style={{ height }}
    >
      <p className="text-[11px] font-bold tracking-tight truncate">{label}</p>
      <p className="text-[10px] opacity-80 tabular-nums">
        {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
      </p>
    </div>
  );
}

function PreviewBlock({
  selectedSlots,
  title,
  attendees,
}: {
  selectedSlots: string[];
  title: string;
  attendees: number;
}) {
  const sorted = [...selectedSlots].sort();
  const first = sorted[0];
  const lastIdx = SLOTS.indexOf(sorted[sorted.length - 1]);
  const firstIdx = SLOTS.indexOf(first);
  const count = lastIdx - firstIdx + 1;
  const [lh, lm] = sorted[sorted.length - 1].split(":").map(Number);
  const endMin = lh * 60 + lm + 30;
  const endStr = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  return (
    <div
      className="absolute inset-x-1 top-1 rounded-card-sm border-2 border-dashed border-primary-500 bg-primary-100/60 px-2.5 py-1.5 text-primary-700 z-10"
      style={{ height: count * SLOT_HEIGHT - 4 }}
    >
      <p className="text-[11px] font-bold tracking-tight truncate">
        {title} · กำลังเลือก
      </p>
      <p className="text-[10px] tabular-nums">
        {first} – {endStr} · {attendees} ท่าน
      </p>
    </div>
  );
}
