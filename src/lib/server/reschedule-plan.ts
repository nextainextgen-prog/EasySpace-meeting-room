import type { ConflictHit } from "@/lib/server/conflicts";
import type { ReschedulePolicy } from "@/lib/policy/member-reschedule";
import {
  bkkDate,
  bkkDateLabel,
  bkkParts,
  bkkTime,
  fromBkk,
  sameWeekWeekday,
  weekdayToServiceDay,
  type Weekday,
} from "@/lib/time/bkk";

/**
 * The pure half of member rescheduling: given the occurrences of a series and
 * a destination, work out where each one lands and whether a guard stops it.
 * No database, no auth, no side effects — which is what makes the date and
 * timezone arithmetic testable on its own.
 *
 * Lives outside the server-action module because a "use server" file may only
 * export async functions.
 */

/** Statuses a booking may hold and still block a room. */
export interface OccurrenceRow {
  id: string;
  reference_code: string;
  room_id: string;
  member_id: string | null;
  org_id: string | null;
  starts_at: string;
  ends_at: string;
  booking_status: string;
  internal_title: string | null;
  metadata: Record<string, unknown> | null;
  is_recurring: boolean;
}

export interface PlanTarget {
  scope: "one" | "following" | "series";
  weekday?: number;
  date?: string;
  startTime: string;
  durationMin: number;
  roomId?: string;
}

export type OccurrenceStatus = "ok" | "warn" | "blocked" | "unchanged";

export interface OccurrencePreview {
  bookingId: string;
  referenceCode: string;
  from: { startsAt: string; endsAt: string; label: string };
  to: { startsAt: string; endsAt: string; label: string };
  status: OccurrenceStatus;
  /** Why it cannot move, or what to watch out for. Already masked. */
  note: string | null;
  conflicts: ConflictHit[];
}

export interface ReschedulePreview {
  ok: true;
  roomName: string;
  seriesSize: number;
  occurrences: OccurrencePreview[];
  summary: { movable: number; blocked: number; warned: number; unchanged: number };
  /** Fingerprint of this plan — `apply` refuses to run against a stale one. */
  previewHash: string;
  policy: ReschedulePolicy;
}

export type RescheduleError =
  | { ok: false; error: "auth_required" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "not_owner" }
  | { ok: false; error: "disabled" }
  | { ok: false; error: "tier_not_allowed" }
  | { ok: false; error: "room_change_not_allowed" }
  | { ok: false; error: "too_many_occurrences"; limit: number; requested: number }
  | { ok: false; error: "rate_limited"; limit: number }
  | { ok: false; error: "nothing_to_move" }
  | { ok: false; error: "validation"; issues: unknown };

export interface PlannedMove {
  row: OccurrenceRow;
  startsAt: string;
  endsAt: string;
  roomId: string;
  /** Set when the move is rejected before we even look at the room. */
  guardNote: string | null;
}

export function planMoves(
  rows: OccurrenceRow[],
  input: PlanTarget,
  policy: ReschedulePolicy,
  room: { service_days: number[] },
  blockedHolidays: Set<string>,
): PlannedMove[] {
  const now = Date.now();
  const noticeMs = policy.min_notice_hours * 3_600_000;
  const horizon = now + policy.max_advance_days * 86_400_000;
  const durationMs = input.durationMin * 60_000;

  return rows.map((row) => {
    const targetRoom = input.roomId ?? row.room_id;
    // scope "one" may name an explicit date; a series move keeps each
    // occurrence inside its own week and only changes which weekday it lands on.
    const targetDate =
      input.scope === "one" && input.date
        ? input.date
        : input.weekday
          ? sameWeekWeekday(row.starts_at, input.weekday as Weekday)
          : bkkDate(row.starts_at);

    const start = fromBkk(targetDate, input.startTime);
    const end = new Date(start.getTime() + durationMs);

    let guardNote: string | null = null;
    if (new Date(row.starts_at).getTime() - now < noticeMs) {
      guardNote =
        policy.min_notice_hours > 0
          ? `ใกล้เวลาประชุมเกินไป (ต้องแจ้งล่วงหน้าอย่างน้อย ${policy.min_notice_hours} ชม.)`
          : "การประชุมนี้เริ่มไปแล้ว";
    } else if (start.getTime() < now) {
      guardNote = "เวลาปลายทางอยู่ในอดีต";
    } else if (start.getTime() > horizon) {
      guardNote = `เกินช่วงที่จองล่วงหน้าได้ (${policy.max_advance_days} วัน)`;
    } else if (
      policy.respect_service_days &&
      room.service_days?.length &&
      !room.service_days.includes(weekdayToServiceDay(bkkParts(start).weekday))
    ) {
      guardNote = "ห้องไม่เปิดให้บริการวันนี้";
    } else if (blockedHolidays.has(targetDate)) {
      guardNote = "ตรงกับวันหยุดที่ปิดให้บริการ";
    }

    return {
      row,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      roomId: targetRoom,
      guardNote,
    };
  });
}

export function slotLabel(startsAt: string, endsAt: string): string {
  const p = bkkParts(startsAt);
  return `${p.weekdayLabel} ${bkkDateLabel(startsAt)} ${p.time}–${bkkTime(endsAt)}`;
}

export function hashPlan(occurrences: OccurrencePreview[]): string {
  const seed = occurrences
    .map((o) => `${o.bookingId}|${o.to.startsAt}|${o.status}`)
    .sort()
    .join(";");
  // Small non-cryptographic digest — this guards against a stale plan, not
  // against an attacker; the apply path re-validates every slot regardless.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

