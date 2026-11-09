/**
 * Everything an internal member can do to rooms, independent of where they do
 * it from. The web portal (/app) and the Telegram bot both call these, so a
 * rule changes in one place and both channels follow.
 *
 * Writes reuse the existing actions underneath — createMemberBooking for the
 * insert + Telegram group + Google Calendar + e-mail, the reschedule engine for
 * moves (which is the only path that guarantees a member can never displace a
 * paying customer). What this layer adds is the validation those actions leave
 * to their old screens: opening hours, the 30-minute grid, past times, the
 * booking horizon, and a clash check that names what is in the way.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { createMemberBooking, cancelMemberBooking } from "@/lib/actions/members";
import {
  applyMemberReschedule,
  previewMemberReschedule,
} from "@/lib/actions/member-reschedule";
import { runAsMember, type Member, type MemberContext } from "@/lib/data/members";
import { getOrgUsage } from "@/lib/data/organizations";
import { shiftPeriod } from "@/lib/billing/overage";
import {
  addDays,
  bkkDate,
  bkkDateLabel,
  bkkParts,
  bkkTime,
  fromBkk,
  servesOn,
  timeToMinutes,
  THAI_WEEKDAY_LABEL,
  type Weekday,
} from "@/lib/time/bkk";

const ACTIVE = ["pending", "confirmed", "in_use"] as const;
const STEP_MIN = 30;

// ─── Who ───────────────────────────────────────────────────────────────────

export interface MemberCtx {
  memberId: string;
  orgId: string;
  orgName: string;
  fullName: string;
  email: string;
  position: string | null;
  tier: "manager" | "member" | "guest";
  joinedAt: string;
  member: Member;
}

export async function loadMemberCtx(memberId: string): Promise<MemberCtx | null> {
  const admin = createSupabaseAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("*")
    .eq("id", memberId)
    .eq("is_active", true)
    .maybeSingle();
  if (!member) return null;
  return withOrg(member as unknown as Member);
}

export async function findMemberByEmail(email: string): Promise<MemberCtx | null> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("members")
    .select("*")
    .ilike("email", clean)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return withOrg(data as unknown as Member);
}

async function withOrg(member: Member): Promise<MemberCtx | null> {
  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("member_organizations")
    .select("org_id, tier, joined_at, organization:organizations(name, status)")
    .eq("member_id", member.id)
    .eq("is_active", true)
    .order("joined_at")
    .limit(1)
    .maybeSingle();
  const row = link as unknown as {
    org_id: string;
    tier: MemberCtx["tier"];
    joined_at: string;
    organization: { name: string; status: string } | null;
  } | null;
  if (!row) return null;
  return {
    memberId: member.id,
    orgId: row.org_id,
    orgName: row.organization?.name ?? "องค์กรภายใน",
    fullName: member.full_name,
    email: member.email,
    position: member.position,
    tier: row.tier,
    joinedAt: row.joined_at,
    member,
  };
}

export async function ctxFromMemberContext(c: MemberContext): Promise<MemberCtx | null> {
  return withOrg(c.member);
}

function asMemberContext(ctx: MemberCtx): MemberContext {
  return {
    member: ctx.member,
    primaryOrgId: ctx.orgId,
    tier: ctx.tier,
    joinedAt: ctx.joinedAt,
  };
}

// ─── Rules ─────────────────────────────────────────────────────────────────

export interface OpenHours {
  open: string;
  close: string;
}

export async function getOpenHours(): Promise<OpenHours> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", "business.hours")
    .maybeSingle();
  const v = ((data as { value?: Record<string, { start?: string; end?: string; enabled?: boolean }> } | null)
    ?.value ?? {}) as Record<string, { start?: string; end?: string; enabled?: boolean }>;
  const open = v.morning?.start ?? "08:30";
  const close =
    v.evening && v.evening.enabled !== false
      ? v.evening.end ?? "22:00"
      : v.afternoon?.end ?? "16:30";
  return { open, close };
}

async function getBookingPolicy(): Promise<{ maxAdvanceDays: number; maxSessionHours: number }> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", "booking.policy")
    .maybeSingle();
  const v = ((data as { value?: Record<string, unknown> } | null)?.value ?? {}) as Record<string, unknown>;
  const num = (x: unknown, d: number) => (typeof x === "number" && x > 0 ? x : d);
  return {
    maxAdvanceDays: num(v.max_advance_days, 90),
    maxSessionHours: num(v.max_session_hours, 8),
  };
}

// ─── Rooms and blocks ──────────────────────────────────────────────────────

export interface PortalRoom {
  id: string;
  name: string;
  color: string;
  capacityMin: number | null;
  capacityMax: number | null;
  thumbnailUrl: string | null;
  amenities: string[];
  serviceDays: number[];
  bufferMinutes: number;
  /** Baht per hour — what hours past the company's quota cost. */
  hourlyRate: number;
}

export async function listMemberRooms(): Promise<PortalRoom[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("rooms")
    .select("id, name, color, capacity_min, capacity_max, thumbnail_url, amenities, service_days, buffer_minutes, status, allow_internal, hourly_rate")
    .eq("status", "active")
    .order("display_order");
  return ((data ?? []) as Array<{
    id: string;
    name: string;
    color: string;
    capacity_min: number | null;
    capacity_max: number | null;
    thumbnail_url: string | null;
    amenities: string[] | null;
    service_days: number[] | null;
    buffer_minutes: number | null;
    allow_internal: boolean;
    hourly_rate: number | null;
  }>)
    .filter((r) => r.allow_internal !== false)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      capacityMin: r.capacity_min,
      capacityMax: r.capacity_max,
      thumbnailUrl: r.thumbnail_url,
      amenities: r.amenities ?? [],
      serviceDays: r.service_days ?? [0, 1, 2, 3, 4, 5, 6],
      bufferMinutes: r.buffer_minutes ?? 0,
      hourlyRate: Number(r.hourly_rate ?? 0),
    }));
}

export interface Block {
  id: string;
  reference: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  kind: "internal" | "external";
  memberId: string | null;
  orgId: string | null;
  title: string | null;
  isPublic: boolean;
  memberName: string | null;
}

/** Every booking that holds a room between two Bangkok dates (inclusive). */
export async function listBlocks(fromDate: string, toDate: string): Promise<Block[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(
      `id, reference_code, room_id, starts_at, ends_at, booking_status, source,
       member_id, org_id, internal_title, is_public, member:members(full_name)`,
    )
    .in("booking_status", ACTIVE as unknown as string[])
    .lt("starts_at", fromBkk(addDays(toDate, 1), "00:00").toISOString())
    .gt("ends_at", fromBkk(fromDate, "00:00").toISOString())
    .order("starts_at");
  return ((data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    source: "internal" | "external";
    member_id: string | null;
    org_id: string | null;
    internal_title: string | null;
    is_public: boolean;
    member: { full_name: string } | null;
  }>).map((b) => ({
    id: b.id,
    reference: b.reference_code,
    roomId: b.room_id,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    status: b.booking_status,
    kind: b.source === "external" ? "external" : "internal",
    memberId: b.member_id,
    orgId: b.org_id,
    title: b.internal_title,
    isPublic: b.is_public,
    memberName: b.member?.full_name ?? null,
  }));
}

/**
 * What a member is allowed to read about someone else's booking: their own in
 * full, a colleague's name (and topic when they made it public), and nothing
 * at all about other companies or paying customers.
 */
export function describeBlockFor(ctx: MemberCtx, b: Block): { mine: boolean; label: string } {
  if (b.memberId === ctx.memberId) return { mine: true, label: b.title ?? "การจองของคุณ" };
  if (b.kind === "internal" && b.orgId === ctx.orgId) {
    const who = b.memberName ?? "เพื่อนร่วมงาน";
    return { mine: false, label: b.isPublic && b.title ? `${who} · ${b.title}` : who };
  }
  return { mine: false, label: "ไม่ว่าง" };
}

// ─── Usage ─────────────────────────────────────────────────────────────────

export interface MemberUsage {
  monthLabel: string;
  myHours: number;
  myCount: number;
  orgHours: number;
  quotaHours: number;
  unlimited: boolean;
  /** null when the company has no ceiling. */
  remainingHours: number | null;
}

const THAI_MONTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export async function usageFor(ctx: MemberCtx): Promise<MemberUsage> {
  const today = bkkDate(new Date());
  const monthStart = fromBkk(`${today.slice(0, 8)}01`, "00:00");
  const admin = createSupabaseAdminClient();
  const [{ data }, org] = await Promise.all([
    admin
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("member_id", ctx.memberId)
      .neq("booking_status", "cancelled")
      .gte("starts_at", monthStart.toISOString())
      .lt("starts_at", fromBkk(`${shiftPeriod(today.slice(0, 7), 1)}-01`, "00:00").toISOString()),
    getOrgUsage(ctx.orgId),
  ]);
  const rows = (data ?? []) as Array<{ starts_at: string; ends_at: string }>;
  const myHours = round1(
    rows.reduce((s, r) => s + (Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 3_600_000, 0),
  );
  const monthIdx = Number(today.slice(5, 7)) - 1;
  return {
    monthLabel: `${THAI_MONTH[monthIdx]} ${Number(today.slice(0, 4)) + 543}`,
    myHours,
    myCount: rows.length,
    orgHours: org.hoursThisMonth,
    quotaHours: org.quotaHoursMonthly,
    unlimited: org.quotaUnlimited,
    remainingHours: org.quotaUnlimited
      ? null
      : round1(Math.max(0, org.quotaHoursMonthly - org.hoursThisMonth)),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function formatHours(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (whole === 0) return `${mins} นาที`;
  return mins ? `${whole} ชม. ${mins} นาที` : `${whole} ชม.`;
}

// ─── Validation ────────────────────────────────────────────────────────────

export interface WindowInput {
  roomId: string;
  date: string;
  start: string;
  end: string;
  excludeBookingId?: string;
}

export type WindowCheck =
  | { ok: true; startsAt: string; endsAt: string; room: PortalRoom; hours: number }
  | { ok: false; code: string; message: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function checkWindow(ctx: MemberCtx, w: WindowInput): Promise<WindowCheck> {
  if (!DATE_RE.test(w.date)) return { ok: false, code: "bad_date", message: "วันที่ไม่ถูกต้อง" };
  if (!TIME_RE.test(w.start) || !TIME_RE.test(w.end)) {
    return { ok: false, code: "bad_time", message: "เวลาไม่ถูกต้อง" };
  }
  const [rooms, hours, policy] = await Promise.all([
    listMemberRooms(),
    getOpenHours(),
    getBookingPolicy(),
  ]);
  const room = rooms.find((r) => r.id === w.roomId);
  if (!room) return { ok: false, code: "room", message: "ห้องนี้ไม่เปิดให้จองภายใน" };

  const s = timeToMinutes(w.start);
  const e = timeToMinutes(w.end);
  if (e <= s) return { ok: false, code: "order", message: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม" };
  if (s % STEP_MIN || e % STEP_MIN) {
    return { ok: false, code: "grid", message: "เลือกเวลาได้ทุก 30 นาที" };
  }
  if (s < timeToMinutes(hours.open) || e > timeToMinutes(hours.close)) {
    return {
      ok: false,
      code: "hours",
      message: `จองได้ช่วง ${hours.open}–${hours.close} น.`,
    };
  }
  if ((e - s) / 60 > policy.maxSessionHours) {
    return {
      ok: false,
      code: "too_long",
      message: `จองได้ครั้งละไม่เกิน ${policy.maxSessionHours} ชั่วโมง`,
    };
  }

  const startsAt = fromBkk(w.date, w.start);
  const endsAt = fromBkk(w.date, w.end);
  const now = Date.now();
  // The slot that is running right now still counts — "ใช้ห้องตอนนี้" picks
  // 14:00 at 14:10 — as long as most of the meeting is still ahead.
  if (startsAt.getTime() < now - STEP_MIN * 60_000 || endsAt.getTime() <= now + 10 * 60_000) {
    return { ok: false, code: "past", message: "เวลานี้ผ่านไปแล้ว" };
  }
  if (startsAt.getTime() > now + policy.maxAdvanceDays * 86_400_000) {
    return {
      ok: false,
      code: "too_far",
      message: `จองล่วงหน้าได้ไม่เกิน ${policy.maxAdvanceDays} วัน`,
    };
  }
  const weekday = bkkParts(startsAt).weekday as Weekday;
  if (!servesOn(room.serviceDays, weekday)) {
    return {
      ok: false,
      code: "closed",
      message: `${room.name} ไม่เปิดวัน${THAI_WEEKDAY_LABEL[weekday]}`,
    };
  }

  const admin = createSupabaseAdminClient();
  let q = admin
    .from("bookings")
    .select("id, source, member_id, org_id, starts_at, ends_at, member:members(full_name)")
    .eq("room_id", room.id)
    .in("booking_status", ACTIVE as unknown as string[])
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1);
  if (w.excludeBookingId) q = q.neq("id", w.excludeBookingId);
  const { data: clash } = await q;
  const hit = (clash ?? [])[0] as unknown as {
    source: string;
    member_id: string | null;
    org_id: string | null;
    starts_at: string;
    ends_at: string;
    member: { full_name: string } | null;
  } | undefined;
  if (hit) {
    const span = `${bkkTime(hit.starts_at)}–${bkkTime(hit.ends_at)}`;
    const who =
      hit.member_id === ctx.memberId
        ? "การจองของคุณเอง"
        : hit.source === "internal" && hit.org_id === ctx.orgId
          ? hit.member?.full_name ?? "เพื่อนร่วมงาน"
          : "การจองอื่น";
    return {
      ok: false,
      code: "conflict",
      message: `${room.name} ไม่ว่างช่วง ${span} (${who})`,
    };
  }

  return {
    ok: true,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    room,
    hours: (e - s) / 60,
  };
}

// ─── Writes ────────────────────────────────────────────────────────────────

export interface BookInput {
  roomId: string;
  date: string;
  start: string;
  end: string;
  title: string;
  attendees?: number;
  /** Weekly repeats including this one: 1 = just this once. */
  repeatWeeks?: number;
  channel: "portal" | "telegram";
}

export type BookResult =
  | {
      ok: true;
      bookingId: string;
      reference: string;
      roomName: string;
      startsAt: string;
      endsAt: string;
      hours: number;
      created: number;
      skipped: number;
    }
  | { ok: false; code: string; message: string };

export async function bookForMember(ctx: MemberCtx, input: BookInput): Promise<BookResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, code: "title", message: "ตั้งชื่อการจองก่อนนะ" };
  const check = await checkWindow(ctx, input);
  if (!check.ok) return check;
  if (input.attendees && check.room.capacityMax && input.attendees > check.room.capacityMax) {
    return {
      ok: false,
      code: "capacity",
      message: `${check.room.name} รับได้สูงสุด ${check.room.capacityMax} คน`,
    };
  }

  const weeks = Math.max(1, Math.min(26, Math.floor(input.repeatWeeks ?? 1)));
  const startParts = bkkParts(check.startsAt);
  const res = await createMemberBooking(
    {
      roomId: check.room.id,
      startsAt: check.startsAt,
      endsAt: check.endsAt,
      attendees: input.attendees,
      title: title.slice(0, 120),
      isPublic: true,
      notes: input.channel === "telegram" ? "จองผ่าน Telegram" : undefined,
      attendeeEmails: [],
      recurrence:
        weeks > 1
          ? {
              rule: "weekly",
              count: weeks,
              startHour: startParts.hour,
              startMinute: startParts.minute,
              durationMin: Math.round(check.hours * 60),
            }
          : undefined,
    },
    { memberId: ctx.memberId, orgId: ctx.orgId },
  );
  if (!res.ok) {
    return {
      ok: false,
      code: res.error,
      message: res.error === "time_conflict" ? "มีคนจองช่วงนี้ไปก่อนแล้ว" : "บันทึกการจองไม่สำเร็จ",
    };
  }
  return {
    ok: true,
    bookingId: res.bookingId,
    reference: res.reference,
    roomName: check.room.name,
    startsAt: check.startsAt,
    endsAt: check.endsAt,
    hours: check.hours,
    created: res.recurrenceCreated,
    skipped: res.recurrenceSkipped,
  };
}

export interface OwnBooking {
  id: string;
  reference: string;
  roomId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  title: string;
  status: string;
  isRecurring: boolean;
  cancelledReason: string | null;
}

async function loadOwn(ctx: MemberCtx, bookingId: string): Promise<OwnBooking | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(
      "id, reference_code, room_id, starts_at, ends_at, internal_title, booking_status, member_id, is_recurring, cancelled_reason, room:rooms(name)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  const b = data as unknown as {
    id: string;
    reference_code: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    internal_title: string | null;
    booking_status: string;
    member_id: string | null;
    is_recurring: boolean;
    cancelled_reason: string | null;
    room: { name: string } | null;
  } | null;
  if (!b || b.member_id !== ctx.memberId) return null;
  return {
    id: b.id,
    reference: b.reference_code,
    roomId: b.room_id,
    roomName: b.room?.name ?? "-",
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    title: b.internal_title ?? "ประชุม",
    status: b.booking_status,
    isRecurring: b.is_recurring,
    cancelledReason: b.cancelled_reason,
  };
}

export async function getOwnBooking(ctx: MemberCtx, bookingId: string) {
  return loadOwn(ctx, bookingId);
}

export async function findOwnByReference(ctx: MemberCtx, reference: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id")
    .ilike("reference_code", reference.trim())
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  const id = (data as { id: string } | null)?.id;
  return id ? loadOwn(ctx, id) : null;
}

export async function listOwnBookings(
  ctx: MemberCtx,
  opts: { fromDate: string; toDate: string; includeCancelled?: boolean },
): Promise<OwnBooking[]> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("bookings")
    .select(
      "id, reference_code, room_id, starts_at, ends_at, internal_title, booking_status, is_recurring, cancelled_reason, room:rooms(name)",
    )
    .eq("member_id", ctx.memberId)
    .gte("starts_at", fromBkk(opts.fromDate, "00:00").toISOString())
    .lt("starts_at", fromBkk(addDays(opts.toDate, 1), "00:00").toISOString())
    .order("starts_at");
  if (!opts.includeCancelled) q = q.not("booking_status", "in", "(cancelled,no_show)");
  const { data } = await q;
  return ((data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    internal_title: string | null;
    booking_status: string;
    is_recurring: boolean;
    cancelled_reason: string | null;
    room: { name: string } | null;
  }>).map((b) => ({
    id: b.id,
    reference: b.reference_code,
    roomId: b.room_id,
    roomName: b.room?.name ?? "-",
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    title: b.internal_title ?? "ประชุม",
    status: b.booking_status,
    isRecurring: b.is_recurring,
    cancelledReason: b.cancelled_reason,
  }));
}

export type OpResult = { ok: true; message: string } | { ok: false; message: string };

export async function cancelForMember(
  ctx: MemberCtx,
  bookingId: string,
  reason: string,
): Promise<OpResult> {
  const own = await loadOwn(ctx, bookingId);
  if (!own) return { ok: false, message: "ไม่พบการจองนี้ในชื่อของคุณ" };
  if (own.status === "cancelled") return { ok: false, message: "การจองนี้ถูกยกเลิกไปแล้ว" };
  if (Date.parse(own.endsAt) <= Date.now()) return { ok: false, message: "การประชุมนี้จบไปแล้ว" };
  const res = await cancelMemberBooking({
    bookingId,
    memberId: ctx.memberId,
    reason: reason.trim() || "ยกเลิกโดยผู้จอง",
  });
  if (!res.ok) return { ok: false, message: "ยกเลิกไม่สำเร็จ" };
  revalidatePath("/app");
  return { ok: true, message: `ยกเลิก ${own.roomName} ${slotLabel(own.startsAt, own.endsAt)} แล้ว` };
}

const RESCHEDULE_ERRORS: Record<string, string> = {
  disabled: "ผู้ดูแลปิดการเลื่อนเวลาเองไว้",
  tier_not_allowed: "สิทธิ์ของคุณยังเลื่อนเวลาเองไม่ได้",
  room_change_not_allowed: "ผู้ดูแลไม่อนุญาตให้ย้ายห้องเอง",
  rate_limited: "เลื่อนการจองนี้ครบจำนวนครั้งของเดือนแล้ว",
  not_owner: "เลื่อนได้เฉพาะการจองของคุณเอง",
  not_found: "ไม่พบการจองนี้",
  nothing_to_move: "การจองนี้เริ่มไปแล้ว เลื่อนไม่ได้",
};

/** Move one occurrence through the reschedule engine, as the member. */
export async function moveForMember(
  ctx: MemberCtx,
  bookingId: string,
  to: { date: string; start: string; end: string; roomId?: string },
): Promise<OpResult> {
  const own = await loadOwn(ctx, bookingId);
  if (!own) return { ok: false, message: "ไม่พบการจองนี้ในชื่อของคุณ" };
  const roomId = to.roomId ?? own.roomId;
  const check = await checkWindow(ctx, { roomId, date: to.date, start: to.start, end: to.end, excludeBookingId: bookingId });
  if (!check.ok) return check;

  return runAsMember(asMemberContext(ctx), async () => {
    const input = {
      bookingId,
      scope: "one" as const,
      date: to.date,
      startTime: to.start,
      durationMin: Math.round(check.hours * 60),
      roomId: roomId !== own.roomId ? roomId : undefined,
      mode: "all_or_nothing" as const,
    };
    const preview = await previewMemberReschedule(input);
    if (!preview.ok) {
      return { ok: false, message: RESCHEDULE_ERRORS[preview.error] ?? "เลื่อนไม่สำเร็จ" };
    }
    const occ = preview.occurrences[0];
    if (!occ || occ.status === "blocked") {
      return { ok: false, message: occ?.note ?? "ช่วงเวลานี้ย้ายไปไม่ได้" };
    }
    if (occ.status === "unchanged") return { ok: true, message: "อยู่เวลานี้อยู่แล้ว" };
    const applied = await applyMemberReschedule({ ...input, previewHash: preview.previewHash });
    if (!applied.ok) {
      const code = applied.error;
      return {
        ok: false,
        message:
          code === "plan_changed" || code === "blocked_all_or_nothing"
            ? "มีคนจองแทรกเข้ามาพอดี ลองเลือกเวลาใหม่อีกครั้ง"
            : RESCHEDULE_ERRORS[code] ?? "เลื่อนไม่สำเร็จ",
      };
    }
    revalidatePath("/app");
    return {
      ok: true,
      message: `ย้ายไป ${check.room.name} ${slotLabel(check.startsAt, check.endsAt)} แล้ว`,
    };
  });
}

/** Push the end of a booking later, only into air that is already free. */
export async function extendForMember(
  ctx: MemberCtx,
  bookingId: string,
  minutes: number,
): Promise<OpResult> {
  const own = await loadOwn(ctx, bookingId);
  if (!own || !(ACTIVE as readonly string[]).includes(own.status)) {
    return { ok: false, message: "ไม่พบการจองที่ยังใช้งานอยู่" };
  }
  const date = bkkDate(own.startsAt);
  const newEnd = new Date(Date.parse(own.endsAt) + minutes * 60_000);
  if (bkkDate(newEnd) !== date) return { ok: false, message: "ต่อเวลาข้ามวันไม่ได้" };
  const check = await checkWindow(ctx, {
    roomId: own.roomId,
    date,
    start: bkkTime(own.startsAt),
    end: bkkTime(newEnd),
    excludeBookingId: own.id,
  });
  // A meeting that already started fails the "past" rule on its own start;
  // what matters for an extension is only the stretch being added.
  if (!check.ok && check.code !== "past") return check;
  if (!check.ok) {
    const tail = await checkWindow(ctx, {
      roomId: own.roomId,
      date,
      start: bkkTime(own.endsAt),
      end: bkkTime(newEnd),
      excludeBookingId: own.id,
    });
    if (!tail.ok) return tail;
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("bookings")
    .update({ ends_at: newEnd.toISOString(), updated_at: new Date().toISOString() } as never)
    .eq("id", own.id);
  if (error) return { ok: false, message: "ต่อเวลาไม่สำเร็จ" };
  await admin.from("booking_audit_log").insert({
    booking_id: own.id,
    action: "updated",
    changes: { source: "member_extend", from: own.endsAt, to: newEnd.toISOString() },
  } as never);
  revalidatePath("/app");
  revalidatePath("/admin/calendar");
  return { ok: true, message: `ต่อเวลาถึง ${bkkTime(newEnd)} น. แล้ว` };
}

/** Finish a running meeting now, which hands the rest of the slot back. */
export async function endNowForMember(ctx: MemberCtx, bookingId: string): Promise<OpResult> {
  const own = await loadOwn(ctx, bookingId);
  if (!own) return { ok: false, message: "ไม่พบการจองนี้ในชื่อของคุณ" };
  const now = Date.now();
  if (Date.parse(own.startsAt) > now || Date.parse(own.endsAt) <= now) {
    return { ok: false, message: "จบก่อนเวลาได้เฉพาะการประชุมที่กำลังใช้ห้องอยู่" };
  }
  const end = new Date(Math.ceil(now / 60_000) * 60_000);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("bookings")
    .update({ ends_at: end.toISOString(), booking_status: "completed", updated_at: new Date().toISOString() } as never)
    .eq("id", own.id);
  if (error) return { ok: false, message: "บันทึกไม่สำเร็จ" };
  await admin.from("booking_audit_log").insert({
    booking_id: own.id,
    action: "updated",
    changes: { source: "member_end_early", from: own.endsAt, to: end.toISOString() },
  } as never);
  revalidatePath("/app");
  revalidatePath("/admin/calendar");
  return { ok: true, message: `คืนห้อง ${own.roomName} ตั้งแต่ ${bkkTime(end)} น. แล้ว` };
}

export async function renameForMember(
  ctx: MemberCtx,
  bookingId: string,
  title: string,
): Promise<OpResult> {
  const own = await loadOwn(ctx, bookingId);
  const clean = title.trim().slice(0, 120);
  if (!own) return { ok: false, message: "ไม่พบการจองนี้ในชื่อของคุณ" };
  if (!clean) return { ok: false, message: "ชื่อการจองว่างไม่ได้" };
  const admin = createSupabaseAdminClient();
  await admin.from("bookings").update({ internal_title: clean } as never).eq("id", own.id);
  await admin.from("booking_audit_log").insert({
    booking_id: own.id,
    action: "updated",
    changes: { source: "member_rename", from: own.title, to: clean },
  } as never);
  revalidatePath("/app");
  return { ok: true, message: `เปลี่ยนชื่อเป็น "${clean}" แล้ว` };
}

// ─── Suggestions ───────────────────────────────────────────────────────────

export interface SuggestedSlot {
  date: string;
  start: string;
  end: string;
  label: string;
}

export interface RoomSuggestion {
  roomId: string;
  roomName: string;
  uses: number;
  habit: string;
  slots: SuggestedSlot[];
}

/**
 * "เวลาที่แนะนำ" — read from the member's own last four months: which rooms they
 * use, at what time, for how long. Each habit is projected onto the coming
 * working days and checked against real bookings, so every suggestion is a
 * slot that is free right now. No history yet falls back to a one-hour
 * meeting at 10:00 in the first rooms.
 */
export async function suggestForMember(
  ctx: MemberCtx,
  rooms: PortalRoom[],
  blocks: Block[],
  opts: { hours: OpenHours; days?: number } = { hours: { open: "08:30", close: "22:00" } },
): Promise<RoomSuggestion[]> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const { data } = await admin
    .from("bookings")
    .select("room_id, starts_at, ends_at")
    .eq("member_id", ctx.memberId)
    .not("booking_status", "in", "(cancelled)")
    .gte("starts_at", since)
    .limit(400);
  const history = (data ?? []) as Array<{ room_id: string; starts_at: string; ends_at: string }>;

  const byRoom = new Map<string, { n: number; starts: Map<string, number>; durs: Map<number, number>; weekend: number }>();
  for (const h of history) {
    const e = byRoom.get(h.room_id) ?? { n: 0, starts: new Map(), durs: new Map(), weekend: 0 };
    e.n++;
    const t = bkkTime(h.starts_at);
    e.starts.set(t, (e.starts.get(t) ?? 0) + 1);
    const d = Math.round((Date.parse(h.ends_at) - Date.parse(h.starts_at)) / 60_000);
    e.durs.set(d, (e.durs.get(d) ?? 0) + 1);
    if (bkkParts(h.starts_at).weekday >= 6) e.weekend++;
    byRoom.set(h.room_id, e);
  }
  const mode = <K,>(m: Map<K, number>, fallback: K): K =>
    [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;

  const ranked = rooms
    .map((r) => ({ room: r, stat: byRoom.get(r.id) }))
    .sort((a, b) => (b.stat?.n ?? 0) - (a.stat?.n ?? 0))
    .slice(0, 3);

  const open = timeToMinutes(opts.hours.open);
  const close = timeToMinutes(opts.hours.close);
  const now = Date.now();
  const today = bkkDate(new Date());
  const horizon = opts.days ?? 7;

  return ranked.map(({ room, stat }) => {
    const start = stat ? mode(stat.starts, "10:00") : "10:00";
    const dur = Math.min(Math.max(stat ? mode(stat.durs, 60) : 60, 30), 4 * 60);
    const allowWeekend = (stat?.weekend ?? 0) > 0;
    const roomBlocks = blocks.filter((b) => b.roomId === room.id);
    const slots: SuggestedSlot[] = [];

    for (let i = 0; i <= horizon && slots.length < 3; i++) {
      const date = addDays(today, i);
      const wd = bkkParts(fromBkk(date, "12:00")).weekday;
      if (!allowWeekend && wd >= 6) continue;
      if (!servesOn(room.serviceDays, wd)) continue;
      // Habit time first, then the nearest free start within two hours of it.
      const base = timeToMinutes(start);
      const candidates = [0, 30, -30, 60, -60, 90, -90, 120, -120].map((o) => base + o);
      for (const c of candidates) {
        const s = Math.round(c / STEP_MIN) * STEP_MIN;
        const e = s + dur;
        if (s < open || e > close) continue;
        const sAt = fromBkk(date, hhmm(s)).getTime();
        const eAt = fromBkk(date, hhmm(e)).getTime();
        if (sAt < now + 15 * 60_000) continue;
        const busy = roomBlocks.some((b) => Date.parse(b.startsAt) < eAt && Date.parse(b.endsAt) > sAt);
        if (busy) continue;
        slots.push({
          date,
          start: hhmm(s),
          end: hhmm(e),
          label: `${dayWord(date, today)} ${hhmm(s)}–${hhmm(e)}`,
        });
        break;
      }
    }

    return {
      roomId: room.id,
      roomName: room.name,
      uses: stat?.n ?? 0,
      habit: stat
        ? `ใช้ ${stat.n} ครั้งใน 4 เดือน · ปกติ ${start} นาน ${formatHours(dur / 60)}`
        : "ยังไม่มีประวัติ แนะนำช่วงเช้า 1 ชั่วโมง",
      slots,
    };
  });
}

// ─── Labels ────────────────────────────────────────────────────────────────

export function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function dayWord(date: string, today = bkkDate(new Date())): string {
  if (date === today) return "วันนี้";
  if (date === addDays(today, 1)) return "พรุ่งนี้";
  const wd = bkkParts(fromBkk(date, "12:00")).weekday as Weekday;
  return `${THAI_WEEKDAY_LABEL[wd]} ${bkkDateLabel(fromBkk(date, "12:00")).replace(/ \d{4}$/, "")}`;
}

export function slotLabel(startsAt: string, endsAt: string): string {
  return `${dayWord(bkkDate(startsAt))} ${bkkTime(startsAt)}–${bkkTime(endsAt)}`;
}
