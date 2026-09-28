/**
 * Public self-service booking — the engine behind `/rooms/*`.
 *
 * Priority model (agreed with the operator):
 *
 *   external customer  >  internal org (Thunder etc.)
 *
 * An internal meeting is flexible, a paying customer is not. So when a
 * customer picks a slot an internal booking already holds, the customer
 * still gets it; the internal booking gives way:
 *
 *   1. moved to another free room at the same time (if enabled and possible)
 *   2. otherwise released (cancelled with a `displaced_by` marker)
 *
 * and the team (Telegram + admin bell) and the affected member (their bell)
 * are told. If the customer later cancels or never confirms, released
 * internal bookings are put back automatically while the room is still free.
 *
 * Other external customers' bookings are never overridden — those are what
 * the public sees as "ไม่ว่าง", without names.
 *
 * Deliberately not a "use server" module: only `lib/actions/public-booking`
 * exposes entry points to the browser.
 */

import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { upsertCustomerForBooking } from "@/lib/data/customers";
import { generateBookingCode } from "@/lib/data/bookings";
import {
  getPublicRoomConfig,
  listPublicPackages,
  publicBaseUrl,
  type PublicRoomConfig,
} from "@/lib/data/public-rooms";
import { dispatchEvent, createInAppNotification } from "@/lib/server/notifications";
import {
  publicBookingTemplate,
  queueOverrideTemplate,
  queueRestoredTemplate,
  bookingCancelledTemplate,
  holdExpiredTemplate,
  type DisplacedSummary,
} from "@/lib/templates/telegram";
import { computeHoldExpiry, DEFAULT_HOLD_EXPIRY_DAYS } from "@/lib/booking-hold";
import { getPaymentSetup, outstandingOnline } from "@/lib/server/payment-slips";
import { amountDueNow } from "@/lib/public-booking/payment";
import {
  linkLineToBooking,
  sendBookingLine,
  type PublicLineLink,
} from "@/lib/server/booking-line";
import { fromBkk, bkkDateLabel, bkkTime } from "@/lib/time/bkk";
import {
  CHANNEL_LABEL,
  checkPublicWindow,
  formatPhone,
  quotePublic,
  type PublicChannel,
} from "@/lib/public-booking/shared";

const ACTIVE = ["pending", "confirmed", "in_use"];

/** Per-IP submissions allowed per hour, and live bookings per phone. */
const MAX_PER_IP_PER_HOUR = 6;
const MAX_ACTIVE_PER_PHONE = 3;

// ─── Types ────────────────────────────────────────────────────────────────

export interface DisplacedRecord {
  id: string;
  reference: string;
  action: "relocated" | "released";
  fromRoomId: string;
  toRoomId: string | null;
  toRoomName: string | null;
  originalStatus: string;
  memberId: string | null;
  memberName: string | null;
  memberPhone?: string | null;
  attendees?: number | null;
  profileId: string | null;
  orgName: string | null;
  title: string | null;
  startsAt: string;
  endsAt: string;
  restoredAt?: string | null;
}

export interface PublicMeta {
  channel: PublicChannel;
  token: string;
  ip: string | null;
  phone: string;
  company: string | null;
  displaced: DisplacedRecord[];
  /** Online payment terms fixed at booking time. */
  payment?: { mode: "deposit" | "full"; percent: number; due: number };
  line?: PublicLineLink;
}

interface OverlapRow {
  id: string;
  reference_code: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  source: "internal" | "external";
  booking_status: string;
  attendees_count: number | null;
  internal_title: string | null;
  member_id: string | null;
  metadata: Record<string, unknown> | null;
  member: { full_name: string; profile_id: string | null; phone?: string | null } | null;
  org: { name: string; short_name: string | null } | null;
}

const OVERLAP_SELECT = `id, reference_code, room_id, starts_at, ends_at, source, booking_status,
  attendees_count, internal_title, member_id, metadata,
  member:members(full_name, profile_id, phone), org:organizations(name, short_name)`;

async function findOverlaps(
  roomId: string,
  startsAt: string,
  endsAt: string,
  excludeIds: string[] = [],
): Promise<OverlapRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select(OVERLAP_SELECT)
    .eq("room_id", roomId)
    .in("booking_status", ACTIVE)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);
  if (error) throw error;
  const exclude = new Set(excludeIds);
  return ((data ?? []) as unknown as OverlapRow[]).filter((r) => !exclude.has(r.id));
}

function whoOf(row: { member: OverlapRow["member"]; org: OverlapRow["org"] }): string {
  const org = row.org?.short_name ?? row.org?.name ?? null;
  const person = row.member?.full_name ?? null;
  return [org, person].filter(Boolean).join(" · ") || "ผู้ใช้ภายใน";
}

// ─── Displacement ─────────────────────────────────────────────────────────

/** A room that is active, open to internal use, big enough, and free. */
async function findRelocationRoom(row: OverlapRow): Promise<{ id: string; name: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("rooms")
    .select("id, name, capacity_max, allow_internal, status, display_order")
    .eq("status", "active")
    .neq("id", row.room_id)
    .order("display_order");
  const rooms = ((data ?? []) as Array<{
    id: string;
    name: string;
    capacity_max: number | null;
    allow_internal: boolean;
  }>).filter(
    (r) =>
      r.allow_internal !== false &&
      (!row.attendees_count || !r.capacity_max || r.capacity_max >= row.attendees_count),
  );
  // Smallest room that fits first — don't burn the big room on a 1:1.
  rooms.sort((a, b) => (a.capacity_max ?? 999) - (b.capacity_max ?? 999));

  for (const room of rooms) {
    const clash = await findOverlaps(room.id, row.starts_at, row.ends_at, [row.id]);
    if (clash.length === 0) return { id: room.id, name: room.name };
  }
  return null;
}

async function displaceInternal(
  rows: OverlapRow[],
  ctx: { reference: string; roomName: string; autoRelocate: boolean },
): Promise<DisplacedRecord[]> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const out: DisplacedRecord[] = [];

  for (const row of rows) {
    const base = {
      id: row.id,
      reference: row.reference_code,
      fromRoomId: row.room_id,
      originalStatus: row.booking_status,
      memberId: row.member_id,
      memberName: row.member?.full_name ?? null,
      memberPhone: row.member?.phone ?? null,
      attendees: row.attendees_count,
      profileId: row.member?.profile_id ?? null,
      orgName: row.org?.short_name ?? row.org?.name ?? null,
      title: row.internal_title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    };
    const marker = {
      reference: ctx.reference,
      at: now,
      from_room_id: row.room_id,
      from_starts_at: row.starts_at,
      from_ends_at: row.ends_at,
      original_status: row.booking_status,
    };

    const target = ctx.autoRelocate ? await findRelocationRoom(row) : null;
    if (target) {
      const { data: moved } = await admin
        .from("bookings")
        .update({
          room_id: target.id,
          metadata: {
            ...(row.metadata ?? {}),
            displaced_by: { ...marker, action: "relocated", to_room_id: target.id },
          },
        } as never)
        .eq("id", row.id)
        .eq("room_id", row.room_id)
        .in("booking_status", ACTIVE)
        .select("id")
        .maybeSingle();
      if (moved) {
        await admin.from("booking_audit_log").insert({
          booking_id: row.id,
          action: "relocated_by_customer",
          actor_name: "ระบบ (จองออนไลน์)",
          changes: { from_room_id: row.room_id, to_room_id: target.id, by: ctx.reference },
          reason: `ลูกค้าภายนอกจอง ${ctx.roomName} ช่วงเวลานี้ (${ctx.reference})`,
        } as never);
        out.push({ ...base, action: "relocated", toRoomId: target.id, toRoomName: target.name });
        continue;
      }
      // Lost a race for that room — fall through and release instead.
    }

    const { data: released } = await admin
      .from("bookings")
      .update({
        booking_status: "cancelled",
        cancelled_at: now,
        cancelled_reason: `ทับคิวโดยลูกค้าภายนอก (${ctx.reference}) — ไม่มีห้องว่างเวลาเดิม`,
        metadata: {
          ...(row.metadata ?? {}),
          displaced_by: { ...marker, action: "released" },
        },
      } as never)
      .eq("id", row.id)
      .in("booking_status", ACTIVE)
      .select("id")
      .maybeSingle();
    if (released) {
      await admin.from("booking_audit_log").insert({
        booking_id: row.id,
        action: "released_for_customer",
        actor_name: "ระบบ (จองออนไลน์)",
        changes: { by: ctx.reference },
        reason: `ลูกค้าภายนอกขอทับคิว (${ctx.reference})`,
      } as never);
      out.push({ ...base, action: "released", toRoomId: null, toRoomName: null });
    }
  }
  return out;
}

/**
 * Put released internal bookings back after the customer booking that pushed
 * them out goes away. Relocated ones stay where they are — they still have a
 * room, and moving them again would surprise people twice.
 */
export async function restoreDisplacedFor(bookingId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, reference_code, metadata, room:rooms(name)")
    .eq("id", bookingId)
    .maybeSingle();
  const booking = data as unknown as {
    id: string;
    reference_code: string;
    metadata: { public?: PublicMeta } | null;
    room: { name: string } | null;
  } | null;
  const meta = booking?.metadata?.public;
  if (!booking || !meta?.displaced?.length) return 0;

  const restored: DisplacedRecord[] = [];
  for (const d of meta.displaced) {
    if (d.action !== "released" || d.restoredAt) continue;
    const { data: rowData } = await admin
      .from("bookings")
      .select("id, room_id, starts_at, ends_at, booking_status, metadata")
      .eq("id", d.id)
      .maybeSingle();
    const row = rowData as unknown as {
      id: string;
      room_id: string;
      starts_at: string;
      ends_at: string;
      booking_status: string;
      metadata: Record<string, unknown> & {
        displaced_by?: { reference?: string };
      } | null;
    } | null;
    if (!row || row.booking_status !== "cancelled") continue;
    if (row.metadata?.displaced_by?.reference !== booking.reference_code) continue;
    if (new Date(row.ends_at).getTime() <= Date.now()) continue;
    const clash = await findOverlaps(row.room_id, row.starts_at, row.ends_at, [row.id]);
    if (clash.length > 0) continue;

    const status = ACTIVE.includes(d.originalStatus) ? d.originalStatus : "confirmed";
    const { error } = await admin
      .from("bookings")
      .update({
        booking_status: status,
        cancelled_at: null,
        cancelled_reason: null,
        metadata: {
          ...(row.metadata ?? {}),
          displaced_by: {
            ...(row.metadata?.displaced_by ?? {}),
            restored_at: new Date().toISOString(),
          },
        },
      } as never)
      .eq("id", row.id)
      .eq("booking_status", "cancelled");
    if (error) continue;
    await admin.from("booking_audit_log").insert({
      booking_id: row.id,
      action: "restored_after_customer",
      actor_name: "ระบบ (จองออนไลน์)",
      reason: `การจองลูกค้า ${booking.reference_code} ถูกยกเลิก — คืนคิว`,
    } as never);
    restored.push(d);
    d.restoredAt = new Date().toISOString();
  }

  if (restored.length === 0) return 0;

  await admin
    .from("bookings")
    .update({ metadata: { ...(booking.metadata ?? {}), public: meta } } as never)
    .eq("id", booking.id);

  const roomName = booking.room?.name ?? "-";
  void dispatchEvent(
    "booking.override",
    queueRestoredTemplate({
      customerReference: booking.reference_code,
      roomName,
      restored: restored.map((r) => ({
        reference: r.reference,
        who: [r.orgName, r.memberName].filter(Boolean).join(" · ") || "ผู้ใช้ภายใน",
        startsAt: r.startsAt,
        endsAt: r.endsAt,
      })),
    }),
  );
  await Promise.all(
    restored
      .filter((r) => r.profileId)
      .map((r) =>
        createInAppNotification({
          level: "success",
          category: "system",
          title: "ได้คิวห้องประชุมคืนแล้ว",
          body: `${roomName} · ${bkkDateLabel(r.startsAt)} ${bkkTime(r.startsAt)}–${bkkTime(r.endsAt)} น. กลับมาเป็นของคุณ เพราะลูกค้าภายนอกยกเลิกการจอง`,
          link: `/app/booking/${r.id}`,
          relatedId: r.id,
          recipientId: r.profileId!,
        }),
      ),
  );
  return restored.length;
}

// ─── Lapsed online holds ──────────────────────────────────────────────────

/**
 * Release unpaid online bookings whose payment window has closed. The hold
 * cron only runs nightly, and an online hold lasts minutes, so anything that
 * reads or books a room sweeps it first.
 */
export async function expireLapsedHolds(roomId?: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("bookings")
    .select("id, reference_code, starts_at, ends_at, room:rooms(name), customer:customers(display_name)")
    .eq("booking_status", "pending")
    .not("metadata->public", "is", null)
    .lte("hold_expires_at", new Date().toISOString());
  if (roomId) q = q.eq("room_id", roomId);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    room: { name: string } | null;
    customer: { display_name: string } | null;
  }>;
  let n = 0;
  for (const r of rows) {
    const { data: done } = await admin
      .from("bookings")
      .update({
        booking_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_reason: "ไม่ได้ชำระเงินภายในเวลาที่กำหนด — ปล่อยห้องคืนอัตโนมัติ",
        hold_expires_at: null,
      } as never)
      .eq("id", r.id)
      .eq("booking_status", "pending")
      .select("id")
      .maybeSingle();
    if (!done) continue;
    n++;
    await admin.from("booking_audit_log").insert({
      booking_id: r.id,
      action: "hold_expired",
      actor_name: "ระบบ (จองออนไลน์)",
      reason: "ไม่ได้ชำระเงินภายในเวลาที่กำหนด",
    } as never);
    await restoreDisplacedFor(r.id);
    void sendBookingLine(r.id, "cancelled");
    void dispatchEvent(
      "booking.hold_expired",
      holdExpiredTemplate({
        reference: r.reference_code,
        customerName: r.customer?.display_name ?? "-",
        roomName: r.room?.name ?? "-",
        startsAt: r.starts_at,
        endsAt: r.ends_at,
      }),
    );
  }
  return n;
}

// ─── Create ───────────────────────────────────────────────────────────────

export interface PublicBookingInput {
  roomId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  name: string;
  phone: string; // normalised digits
  email?: string | null;
  company?: string | null;
  attendees?: number | null;
  note?: string | null;
  channel: PublicChannel;
  ip: string | null;
  /** LIFF access token when the customer booked from inside LINE. */
  lineAccessToken?: string | null;
}

export type PublicBookingResult =
  | {
      ok: true;
      bookingId: string;
      reference: string;
      token: string;
      startsAt: string;
      endsAt: string;
      totalAmount: number;
      packageName: string | null;
      holdExpiresAt: string;
      /** Amount to transfer now; 0 when online payment is off. */
      amountDue: number;
      paymentMode: "deposit" | "full" | null;
      lineLinked: boolean;
    }
  | {
      ok: false;
      error:
        | "closed"
        | "room_unavailable"
        | "invalid_window"
        | "slot_taken"
        | "over_capacity"
        | "rate_limited"
        | "too_many_active"
        | "failed";
      message: string;
    };

async function resolveHoldDays(): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", "booking.policy")
    .maybeSingle();
  const raw = (data as { value?: { hold_expiry_days?: number } } | null)?.value
    ?.hold_expiry_days;
  return typeof raw === "number" && raw > 0 && raw <= 90 ? raw : DEFAULT_HOLD_EXPIRY_DAYS;
}

async function reserveReference(): Promise<string> {
  const admin = createSupabaseAdminClient();
  let ref = await generateBookingCode();
  // The generator counts rows, so two submissions in the same instant would
  // collide. Step forward until the code is actually free.
  for (let i = 0; i < 20; i++) {
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("reference_code", ref);
    if (!count) return ref;
    const n = Number(ref.replace(/\D/g, "")) + 1;
    ref = `BK${String(n).padStart(5, "0")}`;
  }
  return `BK${Date.now().toString().slice(-8)}`;
}

const WINDOW_MESSAGES: Record<string, string> = {
  bad_format: "รูปแบบวันหรือเวลาไม่ถูกต้อง",
  outside_hours: "เวลาที่เลือกอยู่นอกเวลาให้บริการ 08:30–22:00",
  in_past: "เวลาที่เลือกผ่านไปแล้ว กรุณาเลือกเวลาใหม่",
  too_far: "ยังไม่เปิดให้จองล่วงหน้าไกลขนาดนั้น",
  too_short: "ระยะเวลาสั้นกว่าขั้นต่ำที่กำหนด",
  too_long: "ระยะเวลายาวเกินที่จองออนไลน์ได้ กรุณาติดต่อทีมงาน",
};

export async function createPublicBooking(
  input: PublicBookingInput,
  cfgOverride?: PublicRoomConfig,
): Promise<PublicBookingResult> {
  const cfg = cfgOverride ?? (await getPublicRoomConfig());
  if (!cfg.enabled || !cfg.booking_enabled) {
    return { ok: false, error: "closed", message: "ปิดรับจองออนไลน์ชั่วคราว กรุณาติดต่อทีมงาน" };
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();

  // ── Room ──
  const { data: roomData } = await admin
    .from("rooms")
    .select("id, name, status, hourly_rate, capacity_max")
    .eq("id", input.roomId)
    .maybeSingle();
  const room = roomData as {
    id: string;
    name: string;
    status: string;
    hourly_rate: number;
    capacity_max: number | null;
  } | null;
  if (!room || room.status !== "active") {
    return { ok: false, error: "room_unavailable", message: "ห้องนี้ไม่เปิดให้จองในขณะนี้" };
  }

  // ── Window ──
  const check = checkPublicWindow({
    date: input.date,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    now,
    daysAhead: cfg.booking_days_ahead,
    minMinutes: cfg.min_duration_minutes,
    maxMinutes: cfg.max_duration_minutes,
  });
  if (!check.ok) {
    return {
      ok: false,
      error: "invalid_window",
      message: WINDOW_MESSAGES[check.reason ?? "bad_format"],
    };
  }
  const startsAt = fromBkk(input.date, input.startTime).toISOString();
  const endsAt = new Date(
    new Date(startsAt).getTime() + input.durationMinutes * 60_000,
  ).toISOString();

  if (input.attendees && room.capacity_max && input.attendees > room.capacity_max) {
    return {
      ok: false,
      error: "over_capacity",
      message: `ห้องนี้รองรับสูงสุด ${room.capacity_max} ท่าน`,
    };
  }

  // ── Abuse guards ──
  if (input.ip) {
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("metadata->public->>ip", input.ip)
      .gte("created_at", new Date(now.getTime() - 3_600_000).toISOString());
    if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) {
      return {
        ok: false,
        error: "rate_limited",
        message: "มีการจองจากอุปกรณ์นี้บ่อยเกินไป กรุณาลองใหม่ภายหลังหรือติดต่อทีมงาน",
      };
    }
  }
  {
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("metadata->public->>phone", input.phone)
      .eq("booking_status", "pending")
      .gt("ends_at", now.toISOString());
    if ((count ?? 0) >= MAX_ACTIVE_PER_PHONE) {
      return {
        ok: false,
        error: "too_many_active",
        message: `เบอร์นี้มีการจองที่รอยืนยันอยู่ ${count} รายการแล้ว กรุณารอทีมงานติดต่อกลับ`,
      };
    }
  }

  // ── Conflicts ──
  // Unpaid online holds past their deadline are free already; release them
  // now rather than waiting for the nightly sweep.
  await expireLapsedHolds(room.id);
  const overlaps = await findOverlaps(room.id, startsAt, endsAt);
  const externalHit = overlaps.some((o) => o.source === "external");
  const internalHits = overlaps.filter((o) => o.source === "internal");
  const protectUntil = now.getTime() + Math.max(0, cfg.override_protect_minutes ?? 0) * 60_000;
  const protectedHit =
    (cfg.override_protect_minutes ?? 0) > 0 &&
    internalHits.some((o) => new Date(o.starts_at).getTime() < protectUntil);
  if (externalHit || protectedHit || (internalHits.length > 0 && !cfg.allow_override_internal)) {
    return {
      ok: false,
      error: "slot_taken",
      message: "ช่วงเวลานี้เพิ่งมีผู้จองไปแล้ว กรุณาเลือกเวลาอื่น",
    };
  }

  const reference = await reserveReference();

  // ── Make room: internal bookings give way ──
  const displaced = internalHits.length
    ? await displaceInternal(internalHits, {
        reference,
        roomName: room.name,
        autoRelocate: cfg.auto_relocate_internal,
      })
    : [];

  // ── Customer ──
  const customerId = await upsertCustomerForBooking({
    name: input.name,
    phone: input.phone,
    email: input.email || undefined,
    type: input.company ? "company" : "individual",
    source: input.channel === "line" ? "line" : "walk_in",
  });
  if (input.company) {
    await admin
      .from("customers")
      .update({ company_name: input.company } as never)
      .eq("id", customerId)
      .is("company_name", null);
  }

  // ── Price ──
  const packages = (await listPublicPackages([room.id])).get(room.id) ?? [];
  const quote = quotePublic(Number(room.hourly_rate), packages, input.durationMinutes);
  const payment = await getPaymentSetup(cfg);
  const amountDue = payment.ready ? amountDueNow(quote.total, payment.mode, payment.depositPercent) : 0;
  // With online payment the room is held only long enough to pay for it;
  // otherwise the team has the usual ติดจอง grace period to confirm by phone.
  const holdExpiresAt =
    amountDue > 0
      ? new Date(
          Math.min(now.getTime() + payment.holdMinutes * 60_000, new Date(startsAt).getTime()),
        ).toISOString()
      : computeHoldExpiry(startsAt, await resolveHoldDays());
  const token = randomBytes(18).toString("base64url");

  const meta: PublicMeta = {
    channel: input.channel,
    token,
    ip: input.ip,
    phone: input.phone,
    company: input.company ?? null,
    displaced,
    ...(amountDue > 0
      ? { payment: { mode: payment.mode, percent: payment.depositPercent, due: amountDue } }
      : {}),
  };

  const noteParts = [
    input.note?.trim() || null,
    input.company ? `บริษัท: ${input.company}` : null,
  ].filter(Boolean);

  const { data: inserted, error: insertErr } = await admin
    .from("bookings")
    .insert({
      reference_code: reference,
      source: "external",
      customer_id: customerId,
      room_id: room.id,
      starts_at: startsAt,
      ends_at: endsAt,
      attendees_count: input.attendees ?? null,
      package_id: quote.packageId,
      base_amount: quote.total,
      addons_amount: 0,
      discount_amount: 0,
      total_amount: quote.total,
      deposit_amount: 0,
      paid_amount: 0,
      payment_status: "unpaid",
      booking_status: "pending",
      hold_expires_at: holdExpiresAt,
      source_channel: input.channel === "line" ? "line" : "walk_in",
      source_detail: `จองออนไลน์ · ${CHANNEL_LABEL[input.channel]}`,
      notes: noteParts.length ? noteParts.join("\n") : null,
      metadata: { public: meta },
    } as never)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // Most likely the exclusion constraint: someone else won the slot between
    // our check and our insert. Give the internal bookings back.
    await rollbackDisplaced(displaced, reference);
    const taken = insertErr?.code === "23P01" || insertErr?.code === "23505";
    return taken
      ? { ok: false, error: "slot_taken", message: "ช่วงเวลานี้เพิ่งมีผู้จองไปแล้ว กรุณาเลือกเวลาอื่น" }
      : { ok: false, error: "failed", message: "บันทึกการจองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
  const bookingId = (inserted as { id: string }).id;

  // Without the DB constraint two customers can both pass the check. The one
  // whose row landed first keeps the slot.
  const after = await findOverlaps(room.id, startsAt, endsAt, [bookingId]);
  if (after.some((o) => o.source === "external")) {
    await admin
      .from("bookings")
      .update({
        booking_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_reason: "ชนกับการจองออนไลน์ที่เข้ามาพร้อมกัน",
        hold_expires_at: null,
      } as never)
      .eq("id", bookingId);
    await rollbackDisplaced(displaced, reference);
    return { ok: false, error: "slot_taken", message: "ช่วงเวลานี้เพิ่งมีผู้จองไปแล้ว กรุณาเลือกเวลาอื่น" };
  }

  await admin.from("booking_audit_log").insert({
    booking_id: bookingId,
    action: "public_created",
    actor_name: `ลูกค้า (${CHANNEL_LABEL[input.channel]})`,
    changes: {
      channel: input.channel,
      attendees: input.attendees ?? null,
      quote,
      displaced: displaced.map((d) => ({ id: d.id, action: d.action, to: d.toRoomId })),
    },
    ip_address: input.ip,
  } as never);

  try {
    await admin.rpc("touch_customer_aggregates" as never, { p_customer_id: customerId } as never);
  } catch {
    // optional RPC
  }

  await notifyPublicBooking({
    bookingId,
    reference,
    input,
    roomName: room.name,
    startsAt,
    endsAt,
    totalAmount: quote.total,
    packageName: quote.packageName,
    holdExpiresAt,
    displaced,
    amountDue,
  });

  // Booked from inside LINE: tie the booking to them and send the card.
  let lineLinked = false;
  if (input.lineAccessToken) {
    const linked = await linkLineToBooking(bookingId, input.lineAccessToken, cfg.liff_id);
    lineLinked = linked.ok;
  }

  return {
    ok: true,
    bookingId,
    reference,
    token,
    startsAt,
    endsAt,
    totalAmount: quote.total,
    packageName: quote.packageName,
    holdExpiresAt,
    amountDue,
    paymentMode: amountDue > 0 ? payment.mode : null,
    lineLinked,
  };
}

/** Undo displacement when the customer booking never made it in. */
async function rollbackDisplaced(displaced: DisplacedRecord[], reference: string) {
  if (displaced.length === 0) return;
  const admin = createSupabaseAdminClient();
  for (const d of displaced) {
    const { data } = await admin
      .from("bookings")
      .select("metadata")
      .eq("id", d.id)
      .maybeSingle();
    const metadata = { ...((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) };
    delete metadata.displaced_by;
    if (d.action === "relocated") {
      await admin
        .from("bookings")
        .update({ room_id: d.fromRoomId, metadata } as never)
        .eq("id", d.id)
        .eq("room_id", d.toRoomId!);
    } else {
      await admin
        .from("bookings")
        .update({
          booking_status: d.originalStatus,
          cancelled_at: null,
          cancelled_reason: null,
          metadata,
        } as never)
        .eq("id", d.id)
        .eq("booking_status", "cancelled");
    }
    await admin.from("booking_audit_log").insert({
      booking_id: d.id,
      action: "displacement_rolled_back",
      actor_name: "ระบบ (จองออนไลน์)",
      reason: `การจองลูกค้า ${reference} ไม่สำเร็จ — คืนสถานะเดิม`,
    } as never);
  }
}

async function notifyPublicBooking(opts: {
  bookingId: string;
  reference: string;
  input: PublicBookingInput;
  roomName: string;
  startsAt: string;
  endsAt: string;
  totalAmount: number;
  packageName: string | null;
  holdExpiresAt: string;
  displaced: DisplacedRecord[];
  amountDue: number;
}) {
  const { input, displaced } = opts;
  const phone = formatPhone(input.phone);
  const when = `${bkkDateLabel(opts.startsAt)} ${bkkTime(opts.startsAt)}–${bkkTime(opts.endsAt)} น.`;

  // Order matters in the Telegram topic: the booking first, then the override
  // detail that refers back to it.
  await dispatchEvent(
    "booking.public",
    publicBookingTemplate({
      reference: opts.reference,
      customerName: input.name,
      customerPhone: phone,
      customerEmail: input.email,
      company: input.company,
      attendees: input.attendees,
      roomName: opts.roomName,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      channelLabel: CHANNEL_LABEL[input.channel],
      totalAmount: opts.totalAmount,
      packageName: opts.packageName,
      expiresAt: opts.holdExpiresAt,
      note: input.note,
      displacedCount: displaced.length,
      amountDue: opts.amountDue,
    }),
  );

  const jobs: Array<Promise<unknown>> = [
    createInAppNotification({
      level: displaced.length ? "warning" : "info",
      category: "system",
      title: `จองออนไลน์ใหม่ ${opts.reference} — รอยืนยัน`,
      body: `${input.name} (${phone}) · ${opts.roomName} · ${when}${
        displaced.length ? ` · ทับคิวภายใน ${displaced.length} รายการ` : ""
      }`,
      link: "/admin/calendar",
      relatedId: opts.bookingId,
    }),
  ];

  if (displaced.length > 0) {
    const summaries: DisplacedSummary[] = displaced.map((d) => ({
      reference: d.reference,
      who: [d.orgName, d.memberName].filter(Boolean).join(" · ") || "ผู้ใช้ภายใน",
      title: d.title,
      action: d.action,
      toRoomName: d.toRoomName,
      phone: d.memberPhone ?? null,
      attendees: d.attendees ?? null,
    }));
    const adminUrl = `${publicBaseUrl()}/admin/overrides?focus=${displaced[0].id}`;
    const paymentNote =
      opts.amountDue > 0
        ? `ลูกค้ายังไม่ชำระ — ต้องชำระภายใน ${bkkDateLabel(opts.holdExpiresAt)} ${bkkTime(opts.holdExpiresAt)} น. ถ้าไม่ชำระระบบคืนคิวภายในให้อัตโนมัติ (ยังไม่ต้องรีบย้าย)`
        : `รอทีมงานยืนยันกับลูกค้า (กันห้องถึง ${bkkDateLabel(opts.holdExpiresAt)} ${bkkTime(opts.holdExpiresAt)} น.)`;
    jobs.push(
      dispatchEvent(
        "booking.override",
        queueOverrideTemplate({
          reference: opts.reference,
          customerName: input.company ? `${input.company} (${input.name})` : input.name,
          customerPhone: phone,
          roomName: opts.roomName,
          startsAt: opts.startsAt,
          endsAt: opts.endsAt,
          displaced: summaries,
          paymentNote,
          adminUrl,
        }),
      ),
    );
    const released = displaced.filter((d) => d.action === "released").length;
    jobs.push(
      createInAppNotification({
        level: released ? "danger" : "warning",
        category: "system",
        title: `ลูกค้าภายนอกขอทับคิว ${opts.roomName}`,
        body: summaries
          .map((s) =>
            s.action === "relocated"
              ? `${s.reference} ${s.who} → ย้ายไป ${s.toRoomName}`
              : `${s.reference} ${s.who} → ปล่อยคิว ต้องหาเวลาใหม่`,
          )
          .join(" · "),
        link: `/admin/overrides?focus=${displaced[0].id}`,
        relatedId: opts.bookingId,
      }),
    );

    for (const d of displaced) {
      if (!d.profileId) continue;
      const slot = `${bkkDateLabel(d.startsAt)} ${bkkTime(d.startsAt)}–${bkkTime(d.endsAt)} น.`;
      jobs.push(
        createInAppNotification({
          level: d.action === "relocated" ? "warning" : "danger",
          category: "system",
          title:
            d.action === "relocated"
              ? `ย้ายห้องประชุมของคุณไป ${d.toRoomName}`
              : "คิวห้องประชุมของคุณถูกขอใช้โดยลูกค้า",
          body:
            d.action === "relocated"
              ? `${d.title ? `"${d.title}" ` : ""}${slot} — ลูกค้าภายนอกจอง ${opts.roomName} ช่วงนี้ ระบบย้ายไป ${d.toRoomName} เวลาเดิมให้แล้ว`
              : `${d.title ? `"${d.title}" ` : ""}${opts.roomName} ${slot} — ลูกค้าภายนอกจองช่วงนี้และไม่มีห้องว่างเวลาเดิม กรุณาเลือกเวลาใหม่ (ถ้าลูกค้ายกเลิก ระบบจะคืนคิวให้อัตโนมัติ)`,
          link: `/app/booking/${d.id}`,
          relatedId: d.id,
          recipientId: d.profileId,
        }),
      );
    }
  }

  await Promise.allSettled(jobs);
}

// ─── Read / cancel by the customer ────────────────────────────────────────

export interface PublicBookingView {
  reference: string;
  status: string;
  paymentStatus: string;
  roomName: string;
  roomSlug: string | null;
  roomThumbnail: string | null;
  roomColor: string;
  startsAt: string;
  endsAt: string;
  attendees: number | null;
  totalAmount: number;
  customerName: string;
  holdExpiresAt: string | null;
  cancelledReason: string | null;
  canCancel: boolean;
  paidAmount: number;
  /** Still to transfer online right now (0 = nothing due / payment off). */
  dueNow: number;
  paymentMode: "deposit" | "full" | null;
  company: string | null;
  lineLinked: boolean;
}

async function loadByToken(reference: string, token: string) {
  if (!reference || !token || token.length < 16) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(
      `id, reference_code, booking_status, payment_status, starts_at, ends_at,
       attendees_count, total_amount, paid_amount, hold_expires_at, cancelled_reason, metadata,
       room:rooms(id, name, thumbnail_url, color), customer:customers(display_name)`,
    )
    .eq("reference_code", reference)
    .maybeSingle();
  const row = data as unknown as {
    id: string;
    reference_code: string;
    booking_status: string;
    payment_status: string;
    starts_at: string;
    ends_at: string;
    attendees_count: number | null;
    total_amount: number;
    paid_amount: number;
    hold_expires_at: string | null;
    cancelled_reason: string | null;
    metadata: { public?: PublicMeta } | null;
    room: { id: string; name: string; thumbnail_url: string | null; color: string } | null;
    customer: { display_name: string } | null;
  } | null;
  if (!row?.metadata?.public?.token) return null;
  // Constant-time-ish compare is overkill for a 144-bit random token, but
  // never reveal whether the reference exists.
  if (row.metadata.public.token !== token) return null;
  return row;
}

export async function getPublicBookingView(
  reference: string,
  token: string,
): Promise<PublicBookingView | null> {
  let row = await loadByToken(reference, token);
  if (!row) return null;
  // Opening the page after the payment window closed shows the truth.
  if (
    row.booking_status === "pending" &&
    row.hold_expires_at &&
    new Date(row.hold_expires_at).getTime() <= Date.now() &&
    (await expireLapsedHolds(undefined)) > 0
  ) {
    row = (await loadByToken(reference, token)) ?? row;
  }
  const cfg = await getPublicRoomConfig();
  let slug: string | null = null;
  for (const [s, id] of Object.entries(cfg.slug_map)) {
    if (id === row.room?.id) {
      slug = s;
      break;
    }
  }
  return {
    reference: row.reference_code,
    status: row.booking_status,
    paymentStatus: row.payment_status,
    roomName: row.room?.name ?? "-",
    roomSlug: slug,
    roomThumbnail: row.room?.thumbnail_url ?? null,
    roomColor: row.room?.color ?? "#2D4EF5",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    attendees: row.attendees_count,
    totalAmount: Number(row.total_amount),
    customerName: row.customer?.display_name ?? "",
    holdExpiresAt: row.hold_expires_at,
    cancelledReason: row.cancelled_reason,
    // Only an unconfirmed booking can be dropped online — once money or a
    // confirmation is involved, the team handles it.
    canCancel:
      row.booking_status === "pending" &&
      new Date(row.starts_at).getTime() > Date.now(),
    paidAmount: Number(row.paid_amount),
    dueNow:
      ["pending", "confirmed"].includes(row.booking_status) && new Date(row.ends_at).getTime() > Date.now()
        ? outstandingOnline(row)
        : 0,
    paymentMode: row.metadata?.public?.payment?.mode ?? null,
    company: row.metadata?.public?.company ?? null,
    lineLinked: Boolean(row.metadata?.public?.line?.userId),
  };
}

/** Booking id for a (reference, token) pair — for LINE linking and slips. */
export async function bookingIdByToken(reference: string, token: string): Promise<string | null> {
  return (await loadByToken(reference, token))?.id ?? null;
}

export async function cancelPublicBookingByToken(
  reference: string,
  token: string,
): Promise<{ ok: boolean; message?: string }> {
  const row = await loadByToken(reference, token);
  if (!row) return { ok: false, message: "ไม่พบการจอง" };
  if (row.booking_status !== "pending" || new Date(row.starts_at).getTime() <= Date.now()) {
    return { ok: false, message: "การจองนี้ยกเลิกออนไลน์ไม่ได้ กรุณาติดต่อทีมงาน" };
  }
  const admin = createSupabaseAdminClient();
  const { data: updated } = await admin
    .from("bookings")
    .update({
      booking_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: "ลูกค้ายกเลิกเองผ่านหน้าจองออนไลน์",
      hold_expires_at: null,
    } as never)
    .eq("id", row.id)
    .eq("booking_status", "pending")
    .select("id")
    .maybeSingle();
  if (!updated) return { ok: false, message: "ยกเลิกไม่สำเร็จ กรุณาลองใหม่" };

  await admin.from("booking_audit_log").insert({
    booking_id: row.id,
    action: "cancelled",
    actor_name: "ลูกค้า (ออนไลน์)",
    reason: "ลูกค้ายกเลิกเองผ่านหน้าจองออนไลน์",
  } as never);

  void dispatchEvent(
    "booking.cancelled",
    bookingCancelledTemplate({
      reference: row.reference_code,
      customerName: row.customer?.display_name ?? "-",
      roomName: row.room?.name ?? "-",
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reason: "ลูกค้ายกเลิกเองผ่านหน้าจองออนไลน์",
      actor: "ลูกค้า",
    }),
  );
  await restoreDisplacedFor(row.id);
  void sendBookingLine(row.id, "cancelled");
  return { ok: true };
}
