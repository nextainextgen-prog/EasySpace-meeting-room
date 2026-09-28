"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  X,
  AlertTriangle,
  Minus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import {
  previewMemberReschedule,
  applyMemberReschedule,
  type RescheduleInput,
} from "@/lib/actions/member-reschedule";
import type {
  OccurrencePreview,
  ReschedulePreview,
} from "@/lib/server/reschedule-plan";
import { THAI_WEEKDAY_LABEL, type Weekday } from "@/lib/time/bkk";

type Scope = "one" | "following" | "series";

const TIME_OPTIONS = (() => {
  const out: string[] = [];
  for (let m = 8 * 60; m <= 21 * 60 + 30; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

const DURATIONS = [30, 60, 90, 120, 180, 240];

const ERROR_TEXT: Record<string, string> = {
  auth_required: "กรุณาเข้าสู่ระบบใหม่",
  not_found: "ไม่พบการจองนี้",
  not_owner: "ย้ายได้เฉพาะการจองของตัวเอง",
  disabled: "ผู้ดูแลปิดการเลื่อนเวลาด้วยตัวเองไว้",
  tier_not_allowed: "สิทธิ์ของคุณยังเลื่อนเวลาเองไม่ได้ — ติดต่อผู้ดูแล",
  room_change_not_allowed: "เปลี่ยนห้องเองไม่ได้ — ย้ายได้เฉพาะวันและเวลา",
  nothing_to_move: "ไม่มีครั้งที่ยังย้ายได้",
  validation: "ข้อมูลไม่ถูกต้อง",
  write_failed: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
};

function statusIcon(status: OccurrencePreview["status"]) {
  if (status === "ok") return <Check size={13} className="text-emerald-600" />;
  if (status === "warn") return <AlertTriangle size={13} className="text-amber-600" />;
  if (status === "unchanged") return <Minus size={13} className="text-ink-3" />;
  return <X size={13} className="text-red-600" />;
}

export function ReschedulePanel({
  bookingId,
  currentWeekday,
  currentTime,
  currentDurationMin,
  roomName,
  isSeries,
  followingCount,
  futureCount,
}: {
  bookingId: string;
  currentWeekday: Weekday;
  currentTime: string;
  currentDurationMin: number;
  roomName: string;
  isSeries: boolean;
  followingCount: number;
  futureCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>(isSeries ? "following" : "one");
  const [weekday, setWeekday] = useState<Weekday>(currentWeekday);
  const [startTime, setStartTime] = useState(currentTime);
  const [durationMin, setDurationMin] = useState(
    DURATIONS.includes(currentDurationMin) ? currentDurationMin : 60,
  );
  const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const input = useMemo<RescheduleInput>(
    () => ({
      bookingId,
      scope,
      weekday,
      startTime,
      durationMin,
      mode: "skip_conflicts",
    }),
    [bookingId, scope, weekday, startTime, durationMin],
  );

  // Any edit invalidates the plan the member is looking at — never let a stale
  // preview stay on screen next to changed inputs.
  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPreview(null);
      setMessage(null);
      setter(v);
    };
  }

  function runPreview() {
    setMessage(null);
    startTransition(async () => {
      const res = await previewMemberReschedule(input);
      if (!("ok" in res) || res.ok !== true) {
        const err = res as { error: string; limit?: number; requested?: number };
        setPreview(null);
        setMessage(
          err.error === "too_many_occurrences"
            ? `ครั้งเดียวย้ายได้สูงสุด ${err.limit} ครั้ง (เลือกมา ${err.requested})`
            : err.error === "rate_limited"
              ? `ซีรีส์นี้ถูกเลื่อนครบ ${err.limit} ครั้งในเดือนนี้แล้ว`
              : (ERROR_TEXT[err.error] ?? err.error),
        );
        return;
      }
      setPreview(res);
    });
  }

  function runApply() {
    if (!preview) return;
    setMessage(null);
    startTransition(async () => {
      const res = await applyMemberReschedule({
        ...input,
        previewHash: preview.previewHash,
      });
      if (!("ok" in res) || res.ok !== true) {
        const err = res as { error: string; preview?: ReschedulePreview };
        if (err.error === "plan_changed" && err.preview) {
          setPreview(err.preview);
          setMessage("มีการจองเข้ามาใหม่ระหว่างที่คุณดูอยู่ — ตรวจผลด้านล่างอีกครั้งก่อนยืนยัน");
          return;
        }
        setMessage(ERROR_TEXT[err.error] ?? err.error);
        return;
      }
      setDone(
        res.skipped > 0
          ? `ย้ายแล้ว ${res.moved} ครั้ง · ข้าม ${res.skipped} ครั้งที่ชน`
          : `ย้ายแล้ว ${res.moved} ครั้ง`,
      );
      setPreview(null);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="w-full rounded-card-sm border border-emerald-200 bg-emerald-50/60 px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm text-emerald-800 tracking-tight">{done}</p>
        <Button variant="ghost" size="sm" onClick={() => setDone(null)}>
          ปิด
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        iconLeft={<CalendarClock size={14} />}
        onClick={() => setOpen(true)}
      >
        เลื่อนวัน/เวลา
      </Button>
    );
  }

  const summary = preview?.summary;

  return (
    <div className="w-full rounded-card-sm border border-line bg-surface-subtle/60 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-1 tracking-tight">
            เลื่อนวัน/เวลา
          </p>
          <p className="text-xs text-ink-3 mt-0.5">
            ห้อง {roomName} — ย้ายได้เฉพาะช่วงที่ยังว่างจริงเท่านั้น
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setMessage(null);
          }}
        >
          ปิด
        </Button>
      </div>

      {isSeries && (
        <div>
          <Label>ขอบเขต</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {(
              [
                { key: "one", label: "เฉพาะครั้งนี้", hint: "1 ครั้ง" },
                {
                  key: "following",
                  label: "ครั้งนี้และต่อ ๆ ไป",
                  hint: `${followingCount} ครั้ง`,
                },
                {
                  key: "series",
                  label: "ทั้งซีรีส์",
                  hint: `${futureCount} ครั้งที่ยังไม่ถึง`,
                },
              ] as Array<{ key: Scope; label: string; hint: string }>
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => edit<Scope>(setScope)(opt.key)}
                className={`text-left px-3 py-2.5 rounded-input border transition ${
                  scope === opt.key
                    ? "border-primary-600 bg-primary-50 text-primary-700"
                    : "border-line bg-white text-ink-2 hover:bg-surface-subtle"
                }`}
              >
                <span className="block text-sm font-medium tracking-tight">
                  {opt.label}
                </span>
                <span className="block text-[11px] text-ink-3 mt-0.5">
                  {opt.hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>ย้ายไปวัน</Label>
          <Select
            value={String(weekday)}
            onChange={(e) => edit<Weekday>(setWeekday)(Number(e.target.value) as Weekday)}
          >
            {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((w) => (
              <option key={w} value={w}>
                {THAI_WEEKDAY_LABEL[w]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>เวลาเริ่ม</Label>
          <Select
            value={startTime}
            onChange={(e) => edit<string>(setStartTime)(e.target.value)}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t} น.
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>ระยะเวลา</Label>
          <Select
            value={String(durationMin)}
            onChange={(e) => edit<number>(setDurationMin)(Number(e.target.value))}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} นาที` : `${d / 60} ชม.`}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {scope !== "one" && (
        <p className="text-[11px] text-ink-3 leading-relaxed">
          แต่ละครั้งจะย้ายไปวัน{THAI_WEEKDAY_LABEL[weekday]}ของสัปดาห์เดิม —
          ครั้งที่ผ่านไปแล้วจะไม่ถูกแตะต้อง
        </p>
      )}

      {message && (
        <div className="flex items-start gap-2 rounded-input bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {preview && summary && (
        <div className="rounded-input border border-line bg-white overflow-hidden">
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5 border-b border-line-soft text-xs">
            <span className="text-emerald-700 font-medium tabular-nums">
              ย้ายได้ {summary.movable}
            </span>
            {summary.blocked > 0 && (
              <span className="text-red-600 font-medium tabular-nums">
                ชน {summary.blocked}
              </span>
            )}
            {summary.warned > 0 && (
              <span className="text-amber-700 tabular-nums">
                ติดกันพอดี {summary.warned}
              </span>
            )}
            {summary.unchanged > 0 && (
              <span className="text-ink-3 tabular-nums">
                เวลาเดิม {summary.unchanged}
              </span>
            )}
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-line-soft">
            {preview.occurrences.map((o) => (
              <li key={o.bookingId} className="flex items-start gap-2.5 px-3 py-2">
                <span className="mt-0.5 shrink-0">{statusIcon(o.status)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-1 tracking-tight">
                    <span className="text-ink-3">{o.from.label}</span>
                    <span className="mx-1.5 text-ink-3">→</span>
                    <span
                      className={
                        o.status === "blocked" ? "text-ink-3 line-through" : "font-medium"
                      }
                    >
                      {o.to.label}
                    </span>
                  </p>
                  {o.note && (
                    <p
                      className={`text-[11px] mt-0.5 ${
                        o.status === "blocked" ? "text-red-600" : "text-ink-3"
                      }`}
                    >
                      {o.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        {preview && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            iconLeft={<RefreshCw size={13} />}
            onClick={runPreview}
          >
            ตรวจใหม่
          </Button>
        )}
        {!preview ? (
          <Button variant="primary" size="sm" disabled={pending} onClick={runPreview}>
            {pending ? "กำลังตรวจ..." : "ตรวจสอบเวลาว่าง"}
          </Button>
        ) : (
          <Button
            variant="gradient"
            size="sm"
            disabled={pending || summary!.movable === 0}
            onClick={runApply}
          >
            {pending
              ? "กำลังย้าย..."
              : summary!.movable === 0
                ? "ไม่มีครั้งที่ย้ายได้"
                : `ยืนยันย้าย ${summary!.movable} ครั้ง`}
          </Button>
        )}
      </div>
    </div>
  );
}
