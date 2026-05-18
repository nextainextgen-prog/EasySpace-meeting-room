"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle, Save } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { createMemberBooking } from "@/lib/actions/members";

interface RoomLite {
  id: string;
  name: string;
  color: string;
  capacity_min: number | null;
  capacity_max: number | null;
}

interface Props {
  rooms: RoomLite[];
  memberId: string;
  orgId: string;
  defaultDate: string;
  defaultSlot: string;
  defaultRoomId: string;
}

const morningSlots = [
  "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
];
const afternoonSlots = [
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00",
];
const eveningSlots = [
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30",
];

export function MemberBookingForm({
  rooms,
  memberId,
  orgId,
  defaultDate,
  defaultSlot,
  defaultRoomId,
}: Props) {
  const router = useRouter();
  const allSlots = [...morningSlots, ...afternoonSlots, ...eveningSlots];

  const [roomId, setRoomId] = useState(defaultRoomId);
  const [date, setDate] = useState(defaultDate);
  const [selectedSlots, setSelectedSlots] = useState<string[]>(
    allSlots.includes(defaultSlot) ? [defaultSlot] : [],
  );
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [attendees, setAttendees] = useState(4);
  const [isPublic, setIsPublic] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "success"; reference: string; bookingId: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  const summary = useMemo(() => {
    const hours = selectedSlots.length * 0.5;
    if (selectedSlots.length === 0) return { hours: 0, range: "—" };
    const sorted = [...selectedSlots].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const [lh, lm] = last.split(":").map(Number);
    const endMin = lh * 60 + lm + 30;
    const endStr = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    return { hours, range: `${first} – ${endStr}` };
  }, [selectedSlots]);

  function toggleSlot(slot: string) {
    setSelectedSlots((prev) => {
      if (prev.includes(slot)) return prev.filter((s) => s !== slot);
      if (prev.length === 0) return [slot];
      const indices = prev.map((s) => allSlots.indexOf(s));
      const newIdx = allSlots.indexOf(slot);
      const min = Math.min(...indices, newIdx);
      const max = Math.max(...indices, newIdx);
      return allSlots.slice(min, max + 1);
    });
  }

  function rangeISO() {
    if (selectedSlots.length === 0) return { start: "", end: "" };
    const sorted = [...selectedSlots].sort();
    const [sh, sm] = sorted[0].split(":").map(Number);
    const [lh, lm] = sorted[sorted.length - 1].split(":").map(Number);
    const startDate = new Date(`${date}T00:00:00+07:00`);
    startDate.setHours(sh, sm, 0, 0);
    const endDate = new Date(`${date}T00:00:00+07:00`);
    endDate.setHours(lh, lm + 30, 0, 0);
    return { start: startDate.toISOString(), end: endDate.toISOString() };
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

    const { start, end } = rangeISO();
    startTransition(async () => {
      const res = await createMemberBooking(
        {
          roomId,
          startsAt: start,
          endsAt: end,
          attendees,
          title: title.trim(),
          agenda: agenda || undefined,
          isPublic,
          notes: notes || undefined,
        },
        { memberId, orgId },
      );
      if (!res.ok) {
        setFeedback({
          kind: "error",
          message:
            res.error === "time_conflict"
              ? "เวลานี้มีคนใช้ห้องแล้ว ลองเวลาอื่น"
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
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>เลือกห้อง</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRoomId(r.id)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-input border text-left transition",
                roomId === r.id
                  ? "border-primary-600 bg-primary-50/40 ring-4 ring-primary-50"
                  : "border-line bg-white hover:border-primary-200",
              )}
            >
              <span
                className="w-1 h-9 rounded-full"
                style={{ background: r.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm tracking-tight">{r.name}</p>
                <p className="text-xs text-ink-3">
                  {r.capacity_min}–{r.capacity_max} ท่าน
                </p>
              </div>
              {roomId === r.id && (
                <Check size={16} className="text-primary-600" />
              )}
            </button>
          ))}
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
                onChange={(e) => setDate(e.target.value)}
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
            <SlotGroup
              title="รอบเช้า"
              slots={morningSlots}
              selected={selectedSlots}
              onToggle={toggleSlot}
            />
            <SlotGroup
              title="รอบบ่าย"
              slots={afternoonSlots}
              selected={selectedSlots}
              onToggle={toggleSlot}
            />
            <SlotGroup
              title="รอบพิเศษ (17:00–22:00)"
              slots={eveningSlots}
              selected={selectedSlots}
              onToggle={toggleSlot}
            />
          </div>

          {summary.hours > 0 && (
            <div className="text-xs text-ink-2 bg-primary-50/60 border border-primary-100 rounded-input px-4 py-2.5">
              เลือก <b>{summary.range}</b> · {summary.hours} ชม.
            </div>
          )}
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
                · ส่ง Telegram แล้ว ·{" "}
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

      <div className="sticky bottom-20 md:bottom-4 flex gap-2">
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
    </form>
  );
}

function SlotGroup({
  title,
  slots,
  selected,
  onToggle,
}: {
  title: string;
  slots: string[];
  selected: string[];
  onToggle: (slot: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-[11px] text-ink-3 uppercase tracking-[0.06em] mb-2">
        {title}
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {slots.map((slot) => {
          const active = selected.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onToggle(slot)}
              className={cn(
                "h-9 rounded-input text-xs font-medium tabular-nums transition border",
                active
                  ? "bg-primary-600 text-white border-primary-600 shadow-card"
                  : "bg-white border-line text-ink-2 hover:border-primary-300",
              )}
            >
              {slot}
            </button>
          );
        })}
      </div>
    </div>
  );
}
