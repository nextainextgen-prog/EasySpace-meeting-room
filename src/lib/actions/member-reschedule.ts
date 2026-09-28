"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentMember } from "@/lib/data/members";
import { getSettingValue } from "@/lib/actions/settings";
import {
  DEFAULT_RESCHEDULE_POLICY,
  RESCHEDULE_SETTING_KEY,
  type ReschedulePolicy,
} from "@/lib/policy/member-reschedule";
import { dispatchEvent, createInAppNotification } from "@/lib/server/notifications";
import { bookingUpdatedTemplate } from "@/lib/templates/telegram";
import {
  findConflicts,
  isBlocked,
  primaryBlocker,
  type SlotRequest,
} from "@/lib/server/conflicts";
import {
  hashPlan,
  planMoves,
  slotLabel,
  type OccurrencePreview,
  type OccurrenceRow,
  type OccurrenceStatus,
  type PlannedMove,
  type ReschedulePreview,
  type RescheduleError,
} from "@/lib/server/reschedule-plan";
import {
  bkkDate,
  bkkDateLabel,
  bkkParts,
  bkkTime,
  fromBkk,
  sameWeekWeekday,
  weekdayToServiceDay,
  THAI_WEEKDAY_LABEL,
  type Weekday,
} from "@/lib/time/bkk";

/**
 * Member self-service rescheduling.
 *
 * The rule that shapes everything here: an internal booking may only move into
 * air that is already empty. There is no path — no flag, no tier, no override —
 * by which a member's free internal booking displaces a paying customer. When
 * an occurrence cannot move it simply stays where it is and is reported back.
 */

// ─── Policy ────────────────────────────────────────────────────────────────

async function loadPolicy(): Promise<ReschedulePolicy> {
  const stored = await getSettingValue<Partial<ReschedulePolicy>>(
    RESCHEDULE_SETTING_KEY,
  );
  return { ...DEFAULT_RESCHEDULE_POLICY, ...(stored ?? {}) };
}

// ─── Input ─────────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const RescheduleSchema = z.object({
  bookingId: z.string().uuid(),
  /**
   * one       — this occurrence only
   * following — this occurrence and every later one in the series
   * series    — every occurrence in the series that has not started yet
   */
  scope: z.enum(["one", "following", "series"]),
  /** Target weekday (1=Mon…7=Sun) within each occurrence's own week. */
  weekday: z.number().int().min(1).max(7).optional(),
  /** Explicit target date — only meaningful for scope "one". */
  date: z.string().regex(DATE_RE).optional(),
  startTime: z.string().regex(TIME_RE),
  durationMin: z.number().int().min(30).max(24 * 60),
  roomId: z.string().uuid().optional(),
  mode: z.enum(["skip_conflicts", "all_or_nothing"]).default("skip_conflicts"),
});

export type RescheduleInput = z.infer<typeof RescheduleSchema>;

// ─── Series resolution ─────────────────────────────────────────────────────

const OCCURRENCE_COLUMNS =
  "id, reference_code, room_id, member_id, org_id, starts_at, ends_at, booking_status, internal_title, metadata, is_recurring";

/**
 * The reference code that identifies the series a booking belongs to.
 * Siblings carry `metadata.recurrence_of`; the first occurrence is its own key.
 */
function seriesKeyOf(row: OccurrenceRow): string {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const parent = meta.recurrence_of;
  return typeof parent === "string" && parent ? parent : row.reference_code;
}

async function loadSeries(
  anchor: OccurrenceRow,
): Promise<OccurrenceRow[]> {
  const admin = createSupabaseAdminClient();
  const key = seriesKeyOf(anchor);

  const [primaryRes, siblingRes] = await Promise.all([
    admin.from("bookings").select(OCCURRENCE_COLUMNS).eq("reference_code", key).maybeSingle(),
    admin
      .from("bookings")
      .select(OCCURRENCE_COLUMNS)
      .eq("metadata->>recurrence_of", key),
  ]);

  const rows = new Map<string, OccurrenceRow>();
  const push = (r: unknown) => {
    const row = r as OccurrenceRow | null;
    if (row?.id) rows.set(row.id, row);
  };
  push(primaryRes.data);
  for (const r of (siblingRes.data ?? []) as unknown as OccurrenceRow[]) push(r);
  push(anchor);

  return [...rows.values()]
    .filter((r) => r.booking_status !== "cancelled" && r.booking_status !== "no_show")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Dates closed by the holiday calendar, resolved for the span we care about. */
async function loadBlockedHolidays(dates: string[]): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("holidays")
    .select("occurred_on, is_annual, policy")
    .eq("policy", "block");
  const blocked = new Set<string>();
  const wanted = new Set(dates);
  for (const h of (data ?? []) as Array<{
    occurred_on: string;
    is_annual: boolean;
  }>) {
    if (wanted.has(h.occurred_on)) blocked.add(h.occurred_on);
    if (!h.is_annual) continue;
    const md = h.occurred_on.slice(5);
    for (const d of wanted) if (d.slice(5) === md) blocked.add(d);
  }
  return blocked;
}

// ─── Shared build step ─────────────────────────────────────────────────────

interface BuiltPlan {
  preview: ReschedulePreview;
  moves: PlannedMove[];
  anchor: OccurrenceRow;
  seriesRows: OccurrenceRow[];
  primaryRef: string;
}

async function buildPlan(
  raw: RescheduleInput,
): Promise<BuiltPlan | RescheduleError> {
  const parsed = RescheduleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "validation", issues: parsed.error.flatten() };
  }
  const input = parsed.data;

  const ctx = await getCurrentMember();
  if (!ctx) return { ok: false, error: "auth_required" };

  const policy = await loadPolicy();
  if (!policy.enabled) return { ok: false, error: "disabled" };
  if (!policy.allowed_tiers.includes(ctx.tier)) {
    return { ok: false, error: "tier_not_allowed" };
  }

  const admin = createSupabaseAdminClient();
  const { data: anchorRaw } = await admin
    .from("bookings")
    .select(OCCURRENCE_COLUMNS)
    .eq("id", input.bookingId)
    .maybeSingle();
  const anchor = anchorRaw as unknown as OccurrenceRow | null;
  if (!anchor) return { ok: false, error: "not_found" };
  if (anchor.member_id !== ctx.member.id) return { ok: false, error: "not_owner" };
  if (input.roomId && input.roomId !== anchor.room_id && !policy.allow_room_change) {
    return { ok: false, error: "room_change_not_allowed" };
  }

  const seriesRows = await loadSeries(anchor);
  const primaryRef = seriesKeyOf(anchor);
  const now = Date.now();

  // Past occurrences are history — they are never rewritten, whatever the
  // scope. This mirrors how the BoostSMS series was handled by hand.
  let targeted: OccurrenceRow[];
  if (input.scope === "one") {
    targeted = [anchor];
  } else if (input.scope === "following") {
    targeted = seriesRows.filter(
      (r) => new Date(r.starts_at).getTime() >= new Date(anchor.starts_at).getTime(),
    );
  } else {
    targeted = seriesRows.filter((r) => new Date(r.starts_at).getTime() > now);
    if (!targeted.some((r) => r.id === anchor.id) && new Date(anchor.starts_at).getTime() > now) {
      targeted.push(anchor);
    }
  }
  targeted = targeted
    .filter((r) => new Date(r.ends_at).getTime() > now || r.id === anchor.id)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  if (targeted.length === 0) return { ok: false, error: "nothing_to_move" };
  if (targeted.length > policy.max_occurrences_per_request) {
    return {
      ok: false,
      error: "too_many_occurrences",
      limit: policy.max_occurrences_per_request,
      requested: targeted.length,
    };
  }

  // Rate limit: how often this series has already been moved this month.
  if (policy.max_reschedules_per_series_per_month > 0 && input.scope !== "one") {
    const monthAgo = new Date(now - 30 * 86_400_000).toISOString();
    const { count } = await admin
      .from("booking_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "series_rescheduled")
      .in("booking_id", seriesRows.map((r) => r.id))
      .gte("created_at", monthAgo);
    if ((count ?? 0) >= policy.max_reschedules_per_series_per_month) {
      return {
        ok: false,
        error: "rate_limited",
        limit: policy.max_reschedules_per_series_per_month,
      };
    }
  }

  const roomId = input.roomId ?? anchor.room_id;
  const { data: roomRaw } = await admin
    .from("rooms")
    .select("id, name, buffer_minutes, service_days")
    .eq("id", roomId)
    .maybeSingle();
  const room = (roomRaw ?? {
    name: "—",
    buffer_minutes: 0,
    service_days: [],
  }) as { name: string; buffer_minutes: number; service_days: number[] };

  const provisional = planMoves(targeted, input, policy, room, new Set());
  const blockedHolidays = await loadBlockedHolidays(
    provisional.map((m) => bkkDate(m.startsAt)),
  );
  const moves = planMoves(targeted, input, policy, room, blockedHolidays);

  // Everything moving together is excluded from the scan — a series must not
  // report itself as its own obstacle.
  const movingIds = moves.map((m) => m.row.id);
  const slots: SlotRequest[] = moves
    .filter((m) => !m.guardNote)
    .map((m) => ({
      key: m.row.id,
      roomId: m.roomId,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
    }));

  const conflictMap = await findConflicts({
    slots,
    excludeBookingIds: movingIds,
    bufferMinutes: room.buffer_minutes,
    bufferScope: policy.respect_room_buffer,
    viewer: { kind: "member", memberId: ctx.member.id, orgId: ctx.primaryOrgId },
  });

  // Two occurrences of the same series can be planned onto the same slot —
  // e.g. shifting a Monday series onto Sunday of the same week when another
  // occurrence already sits there. The room scan cannot see that, so check it.
  const claimed = new Map<string, string>();
  const selfCollision = new Set<string>();
  for (const m of moves) {
    if (m.guardNote) continue;
    const key = `${m.roomId}|${m.startsAt}`;
    const holder = claimed.get(key);
    if (holder) selfCollision.add(m.row.id);
    else claimed.set(key, m.row.id);
  }

  const occurrences: OccurrencePreview[] = moves.map((m) => {
    const hits = conflictMap.get(m.row.id) ?? [];
    const unchanged =
      m.roomId === m.row.room_id &&
      new Date(m.startsAt).getTime() === new Date(m.row.starts_at).getTime() &&
      new Date(m.endsAt).getTime() === new Date(m.row.ends_at).getTime();

    let status: OccurrenceStatus;
    let note: string | null = null;

    if (unchanged) {
      status = "unchanged";
      note = "อยู่ที่เวลานี้อยู่แล้ว";
    } else if (m.guardNote) {
      status = "blocked";
      note = m.guardNote;
    } else if (selfCollision.has(m.row.id)) {
      status = "blocked";
      note = "ซ้อนกับอีกครั้งหนึ่งในซีรีส์เดียวกัน";
    } else if (isBlocked(hits)) {
      status = "blocked";
      note = `ชนกับ ${primaryBlocker(hits)?.label ?? "การจองอื่น"}`;
    } else if (hits.length > 0) {
      status = "warn";
      const touch = hits[0];
      note = `ย้ายได้ แต่ติดกับ ${touch.label} (เว้น ${touch.gapMinutes} นาที)`;
    } else {
      status = "ok";
    }

    return {
      bookingId: m.row.id,
      referenceCode: m.row.reference_code,
      from: {
        startsAt: m.row.starts_at,
        endsAt: m.row.ends_at,
        label: slotLabel(m.row.starts_at, m.row.ends_at),
      },
      to: {
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        label: slotLabel(m.startsAt, m.endsAt),
      },
      status,
      note,
      conflicts: hits,
    };
  });

  const summary = {
    movable: occurrences.filter((o) => o.status === "ok" || o.status === "warn").length,
    blocked: occurrences.filter((o) => o.status === "blocked").length,
    warned: occurrences.filter((o) => o.status === "warn").length,
    unchanged: occurrences.filter((o) => o.status === "unchanged").length,
  };

  return {
    preview: {
      ok: true,
      roomName: room.name,
      seriesSize: seriesRows.length,
      occurrences,
      summary,
      previewHash: hashPlan(occurrences),
      policy,
    },
    moves,
    anchor,
    seriesRows,
    primaryRef,
  };
}

// ─── Public: preview ───────────────────────────────────────────────────────

export async function previewMemberReschedule(
  raw: RescheduleInput,
): Promise<ReschedulePreview | RescheduleError> {
  const built = await buildPlan(raw);
  if ("error" in built) return built;
  return built.preview;
}

/** How many future occurrences a booking's series has, for the UI's scope picker. */
export async function getSeriesSummary(bookingId: string): Promise<{
  isSeries: boolean;
  futureCount: number;
  followingCount: number;
} | null> {
  const ctx = await getCurrentMember();
  if (!ctx) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(OCCURRENCE_COLUMNS)
    .eq("id", bookingId)
    .maybeSingle();
  const anchor = data as unknown as OccurrenceRow | null;
  if (!anchor || anchor.member_id !== ctx.member.id) return null;

  const rows = await loadSeries(anchor);
  const now = Date.now();
  const future = rows.filter((r) => new Date(r.starts_at).getTime() > now);
  const following = rows.filter(
    (r) => new Date(r.starts_at).getTime() >= new Date(anchor.starts_at).getTime(),
  );
  return {
    isSeries: rows.length > 1,
    futureCount: future.length,
    followingCount: following.length,
  };
}

// ─── Public: apply ─────────────────────────────────────────────────────────

export interface RescheduleResult {
  ok: true;
  moved: number;
  skipped: number;
  occurrences: OccurrencePreview[];
}

export type ApplyResponse =
  | RescheduleResult
  | RescheduleError
  | { ok: false; error: "plan_changed"; preview: ReschedulePreview }
  | { ok: false; error: "blocked_all_or_nothing"; preview: ReschedulePreview }
  | { ok: false; error: "write_failed"; message: string; preview: ReschedulePreview };

export async function applyMemberReschedule(
  raw: RescheduleInput & { previewHash: string },
): Promise<ApplyResponse> {
  // Always re-plan from scratch: the preview the member saw may be seconds or
  // minutes old, and a customer booking could have landed in between.
  const built = await buildPlan(raw);
  if ("error" in built) return built;
  const { preview, moves, anchor, primaryRef } = built;

  if (preview.previewHash !== raw.previewHash) {
    return { ok: false, error: "plan_changed", preview };
  }
  if (raw.mode === "all_or_nothing" && preview.summary.blocked > 0) {
    return { ok: false, error: "blocked_all_or_nothing", preview };
  }

  const byId = new Map(preview.occurrences.map((o) => [o.bookingId, o]));
  const applicable = moves.filter((m) => {
    const s = byId.get(m.row.id)?.status;
    return s === "ok" || s === "warn";
  });
  if (applicable.length === 0) {
    return { ok: true, moved: 0, skipped: preview.occurrences.length, occurrences: preview.occurrences };
  }

  // Order matters when a room-level exclusion constraint is in play: moving
  // earlier means the earliest row must vacate first, moving later means the
  // latest must. Otherwise a row transiently overlaps its own sibling.
  const movingEarlier =
    new Date(applicable[0].startsAt).getTime() <
    new Date(applicable[0].row.starts_at).getTime();
  const ordered = [...applicable].sort((a, b) =>
    movingEarlier
      ? a.row.starts_at.localeCompare(b.row.starts_at)
      : b.row.starts_at.localeCompare(a.row.starts_at),
  );

  const admin = createSupabaseAdminClient();
  const ctx = await getCurrentMember();
  let moved = 0;
  let writeError: string | null = null;

  for (const m of ordered) {
    const meta = { ...((m.row.metadata ?? {}) as Record<string, unknown>) };
    // Merge, never replace — metadata carries the recurrence definition and
    // the sibling link, and blowing those away orphans the whole series.
    meta.alerts_sent = [];
    if (meta.recurrence && typeof meta.recurrence === "object") {
      const [hh, mm] = raw.startTime.split(":").map(Number);
      meta.recurrence = {
        ...(meta.recurrence as Record<string, unknown>),
        startHour: hh,
        startMinute: mm,
        durationMin: raw.durationMin,
      };
    }

    const { error } = await admin
      .from("bookings")
      .update({
        room_id: m.roomId,
        starts_at: m.startsAt,
        ends_at: m.endsAt,
        metadata: meta,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", m.row.id);

    if (error) {
      writeError = error.message;
      break;
    }

    await admin.from("booking_audit_log").insert({
      booking_id: m.row.id,
      action: "rescheduled",
      actor_name: ctx?.member.full_name ?? null,
      reason: `เลื่อนเวลาโดยผู้ใช้ภายใน — ${slotLabel(m.startsAt, m.endsAt)}`,
      changes: {
        source: "member_portal",
        scope: raw.scope,
        from: { room_id: m.row.room_id, starts_at: m.row.starts_at, ends_at: m.row.ends_at },
        to: { room_id: m.roomId, starts_at: m.startsAt, ends_at: m.endsAt },
      },
    } as never);

    await admin
      .from("notifications")
      .update({ resolved_at: new Date().toISOString() } as never)
      .eq("related_id", m.row.id)
      .is("resolved_at", null);

    moved += 1;
  }

  if (writeError) {
    return { ok: false, error: "write_failed", message: writeError, preview };
  }

  const skipped = preview.occurrences.length - moved;

  // One summary entry on the anchor plus one Telegram message — a 44-week
  // series must not produce 44 notifications.
  if (raw.scope !== "one") {
    await admin.from("booking_audit_log").insert({
      booking_id: anchor.id,
      action: "series_rescheduled",
      actor_name: ctx?.member.full_name ?? null,
      reason: `ย้ายซีรีส์ ${moved}/${preview.occurrences.length} ครั้ง`,
      changes: {
        source: "member_portal",
        scope: raw.scope,
        series_ref: primaryRef,
        target: {
          weekday: raw.weekday ? THAI_WEEKDAY_LABEL[raw.weekday as Weekday] : null,
          start_time: raw.startTime,
          duration_min: raw.durationMin,
        },
        moved,
        skipped,
      },
    } as never);
  }

  const first = applicable[0];
  const title = anchor.internal_title ?? "การประชุม";
  void dispatchEvent(
    "booking.updated",
    bookingUpdatedTemplate({
      reference: anchor.reference_code,
      customerName: ctx?.member.full_name ?? "ผู้ใช้ภายใน",
      roomName: preview.roomName,
      previousStartsAt: first.row.starts_at,
      previousEndsAt: first.row.ends_at,
      newStartsAt: first.startsAt,
      newEndsAt: first.endsAt,
      changedFields: [
        `${title} — ผู้ใช้ภายในเลื่อนเอง ${moved} ครั้ง${skipped ? ` (ข้าม ${skipped})` : ""}`,
        `${raw.weekday ? `ทุกวัน${THAI_WEEKDAY_LABEL[raw.weekday as Weekday]} ` : ""}${raw.startTime} น.`,
      ],
      actor: ctx?.member.full_name ?? undefined,
    }),
  );

  void createInAppNotification({
    event: "booking.updated",
    level: "info",
    category: "system",
    title: `${ctx?.member.full_name ?? "ผู้ใช้ภายใน"} เลื่อนการจองเอง`,
    body: `${title} · ${preview.roomName} · ย้าย ${moved} ครั้ง${skipped ? ` · ข้าม ${skipped}` : ""}`,
    relatedId: anchor.id,
  });

  revalidatePath("/app/my-bookings");
  revalidatePath(`/app/booking/${anchor.id}`);
  revalidatePath("/app/calendar");
  revalidatePath("/app");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/notifications");

  return { ok: true, moved, skipped, occurrences: preview.occurrences };
}
