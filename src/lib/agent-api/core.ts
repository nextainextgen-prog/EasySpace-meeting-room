/**
 * Agent API — shared helpers for the `/api/agent/*` REST surface.
 *
 * This surface exists for the Telegram AI agent (text + voice): it mirrors
 * what the booking screens do, but as plain JSON over HTTP. There is no
 * session here — the caller proves itself with a static bearer token and
 * every query runs through the service-role client.
 */

import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { th } from "date-fns/locale";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export const TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Bangkok";
/** Bangkok never shifts, so a literal offset keeps ISO strings unambiguous. */
export const TZ_OFFSET = "+07:00";

// ─── Auth ──────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Cache-Control": "no-store",
};

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function jsonError(
  error: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { ok: false, error, message, ...(extra ?? {}) },
    { status, headers: CORS_HEADERS },
  );
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Returns an error response when the request is not authorised, or null when
 * it may proceed. Fails closed: with no key configured nothing is served.
 */
export function requireAgentKey(request: Request): NextResponse | null {
  const expected = process.env.AGENT_API_KEY;
  if (!expected) {
    return jsonError(
      "not_configured",
      "ยังไม่ได้ตั้งค่า AGENT_API_KEY บนเซิร์ฟเวอร์",
      503,
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const headerKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (bearer !== expected && headerKey !== expected) {
    return jsonError("unauthorized", "API key ไม่ถูกต้อง", 401);
  }
  return null;
}

// ─── Time helpers ──────────────────────────────────────────────────────────

/** Bookable starts, 30 minutes apart — identical to the booking form grid. */
export const SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let m = 8 * 60 + 30; m <= 22 * 60; m += 30) {
    out.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  }
  return out;
})();

export function slotEnd(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const total = h * 60 + m + 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function toIso(date: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(
    `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00${TZ_OFFSET}`,
  ).toISOString();
}

export function today(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

export function localDate(iso: string): string {
  return formatInTimeZone(iso, TIMEZONE, "yyyy-MM-dd");
}

export function localTime(iso: string): string {
  return formatInTimeZone(iso, TIMEZONE, "HH:mm");
}

/** "วันพฤหัสบดีที่ 20 สิงหาคม 2569" — Buddhist era, matching the UI. */
export function thaiLongDate(dateOrIso: string): string {
  const d = dateOrIso.includes("T")
    ? new Date(dateOrIso)
    : new Date(`${dateOrIso}T00:00:00${TZ_OFFSET}`);
  const weekday = formatInTimeZone(d, TIMEZONE, "EEEE", { locale: th });
  const day = formatInTimeZone(d, TIMEZONE, "d", { locale: th });
  const month = formatInTimeZone(d, TIMEZONE, "MMMM", { locale: th });
  const year = Number(formatInTimeZone(d, TIMEZONE, "yyyy")) + 543;
  const prefixed = weekday.startsWith("วัน") ? weekday : `วัน${weekday}`;
  return `${prefixed}ที่ ${day} ${month} ${year}`;
}

export function hoursBetween(startsAt: string, endsAt: string): number {
  return (
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000
  );
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface WindowInput {
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  startsAt?: string;
  endsAt?: string;
}

/**
 * Accept either the agent-friendly shape (`date` + `startTime` + `endTime`
 * or `durationMinutes`) or raw ISO timestamps, and normalise to ISO.
 */
export function resolveWindow(
  input: WindowInput,
): { ok: true; startsAt: string; endsAt: string } | { ok: false; message: string } {
  if (input.startsAt && input.endsAt) {
    const s = new Date(input.startsAt);
    const e = new Date(input.endsAt);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      return { ok: false, message: "startsAt / endsAt ไม่ใช่เวลาที่อ่านได้" };
    }
    if (e <= s) return { ok: false, message: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม" };
    return { ok: true, startsAt: s.toISOString(), endsAt: e.toISOString() };
  }

  const date = input.date;
  if (!date || !DATE_RE.test(date)) {
    return { ok: false, message: "ต้องระบุ date เป็นรูปแบบ YYYY-MM-DD" };
  }
  const start = input.startTime;
  if (!start || !TIME_RE.test(start)) {
    return { ok: false, message: "ต้องระบุ startTime เป็นรูปแบบ HH:mm" };
  }
  const startsAt = toIso(date, start);

  if (input.endTime) {
    if (!TIME_RE.test(input.endTime)) {
      return { ok: false, message: "endTime ต้องเป็นรูปแบบ HH:mm" };
    }
    const endsAt = toIso(date, input.endTime);
    if (new Date(endsAt) <= new Date(startsAt)) {
      return { ok: false, message: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม" };
    }
    return { ok: true, startsAt, endsAt };
  }

  const minutes = input.durationMinutes ?? 60;
  if (!Number.isFinite(minutes) || minutes < 30 || minutes > 12 * 60) {
    return { ok: false, message: "durationMinutes ต้องอยู่ระหว่าง 30 ถึง 720" };
  }
  const endsAt = new Date(
    new Date(startsAt).getTime() + minutes * 60_000,
  ).toISOString();
  return { ok: true, startsAt, endsAt };
}

// ─── Rooms ─────────────────────────────────────────────────────────────────

export interface AgentRoom {
  id: string;
  name: string;
  size: string;
  capacity_min: number | null;
  capacity_max: number | null;
  hourly_rate: number;
  amenities: string[];
  perks: string[];
  floor: string | null;
  room_number: string | null;
  color: string;
  thumbnail_url: string | null;
  gallery_urls: string[];
  status: string;
  allow_internal: boolean;
  display_order: number;
}

export interface AgentPackage {
  id: string;
  room_id: string;
  name: string;
  hours: number;
  price: number;
}

const ROOM_COLUMNS =
  "id, name, size, capacity_min, capacity_max, hourly_rate, amenities, perks, floor, room_number, color, thumbnail_url, gallery_urls, status, allow_internal, display_order";

export async function listAgentRooms(opts: {
  includeInactive?: boolean;
} = {}): Promise<AgentRoom[]> {
  const admin = createSupabaseAdminClient();
  let query = admin.from("rooms").select(ROOM_COLUMNS).order("display_order");
  if (!opts.includeInactive) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as AgentRoom[]).map(normaliseRoom);
}

function normaliseRoom(room: AgentRoom): AgentRoom {
  return {
    ...room,
    hourly_rate: Number(room.hourly_rate),
    amenities: room.amenities ?? [],
    perks: room.perks ?? [],
    gallery_urls: room.gallery_urls ?? [],
  };
}

export async function listAgentPackages(): Promise<AgentPackage[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("room_packages")
    .select("id, room_id, name, hours, price")
    .eq("is_active", true)
    .order("hours");
  return ((data ?? []) as unknown as AgentPackage[]).map((p) => ({
    ...p,
    hours: Number(p.hours),
    price: Number(p.price),
  }));
}

/**
 * Rooms can be addressed by uuid, by exact name, or by a fragment the caller
 * heard over voice ("ไพร์ม", "prime"). Returns null when nothing matches.
 */
export async function resolveRoom(ref: string): Promise<AgentRoom | null> {
  const value = ref.trim();
  if (!value) return null;
  const admin = createSupabaseAdminClient();

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    const { data } = await admin
      .from("rooms")
      .select(ROOM_COLUMNS)
      .eq("id", value)
      .maybeSingle();
    return data ? normaliseRoom(data as unknown as AgentRoom) : null;
  }

  const { data: exact } = await admin
    .from("rooms")
    .select(ROOM_COLUMNS)
    .ilike("name", value)
    .limit(1)
    .maybeSingle();
  if (exact) return normaliseRoom(exact as unknown as AgentRoom);

  const { data: fuzzy } = await admin
    .from("rooms")
    .select(ROOM_COLUMNS)
    .ilike("name", `%${value}%`)
    .order("display_order")
    .limit(1)
    .maybeSingle();
  return fuzzy ? normaliseRoom(fuzzy as unknown as AgentRoom) : null;
}

// ─── Pricing ───────────────────────────────────────────────────────────────

export interface Quote {
  hours: number;
  hourlyRate: number;
  hourlyTotal: number;
  packageId: string | null;
  packageName: string | null;
  baseAmount: number;
  savingsVsHourly: number;
}

/** Same rule as the admin booking form: the largest package that fits. */
export function quoteBooking(
  room: AgentRoom,
  packages: AgentPackage[],
  startsAt: string,
  endsAt: string,
): Quote {
  const hours = hoursBetween(startsAt, endsAt);
  const hourlyRate = Number(room.hourly_rate);
  const hourlyTotal = Math.round(hours * hourlyRate);
  const matching = packages
    .filter((p) => p.room_id === room.id && p.hours <= hours)
    .sort((a, b) => b.hours - a.hours)[0];
  const baseAmount = matching ? matching.price : hourlyTotal;
  return {
    hours,
    hourlyRate,
    hourlyTotal,
    packageId: matching?.id ?? null,
    packageName: matching?.name ?? null,
    baseAmount,
    savingsVsHourly: matching ? Math.max(0, hourlyTotal - matching.price) : 0,
  };
}

// ─── Availability ──────────────────────────────────────────────────────────

export interface BusyBlock {
  bookingId: string;
  reference: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  startTime: string;
  endTime: string;
  status: string;
  kind: "internal" | "external";
  title: string;
}

export interface SlotCell {
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
  label: string;
}

export interface RoomAvailability {
  room: AgentRoom;
  slots: SlotCell[];
  busy: BusyBlock[];
  freeRanges: Array<{ start: string; end: string; hours: number }>;
  fullyFree: boolean;
  text: string;
}

const ACTIVE_STATUSES = ["pending", "confirmed", "in_use"];

/** Every blocking booking that touches the given day, for the given rooms. */
export async function listBusyBlocks(
  date: string,
  roomIds?: string[],
): Promise<BusyBlock[]> {
  const admin = createSupabaseAdminClient();
  const dayStart = new Date(`${date}T00:00:00${TZ_OFFSET}`).toISOString();
  const dayEnd = new Date(`${date}T23:59:59${TZ_OFFSET}`).toISOString();

  let query = admin
    .from("bookings")
    .select(
      `id, reference_code, room_id, starts_at, ends_at, booking_status, source,
       internal_title, is_public, customer:customers(display_name),
       member:members(full_name), org:organizations(name)`,
    )
    .in("booking_status", ACTIVE_STATUSES)
    .lt("starts_at", dayEnd)
    .gt("ends_at", dayStart)
    .order("starts_at");
  if (roomIds && roomIds.length > 0) query = query.in("room_id", roomIds);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    source: "internal" | "external";
    internal_title: string | null;
    is_public: boolean;
    customer: { display_name: string } | null;
    member: { full_name: string } | null;
    org: { name: string } | null;
  }>).map((b) => ({
    bookingId: b.id,
    reference: b.reference_code,
    roomId: b.room_id,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    startTime: localTime(b.starts_at),
    endTime: localTime(b.ends_at),
    status: b.booking_status,
    kind: b.source,
    title:
      b.internal_title ??
      b.customer?.display_name ??
      b.org?.name ??
      b.member?.full_name ??
      "ถูกจองแล้ว",
  }));
}

export function buildSlotGrid(
  date: string,
  busy: BusyBlock[],
): { slots: SlotCell[]; freeRanges: Array<{ start: string; end: string; hours: number }> } {
  const slots: SlotCell[] = SLOTS.map((start) => {
    const end = slotEnd(start);
    const startsAt = toIso(date, start);
    const endsAt = toIso(date, end);
    const clash = busy.find(
      (b) =>
        new Date(b.startsAt).getTime() < new Date(endsAt).getTime() &&
        new Date(b.endsAt).getTime() > new Date(startsAt).getTime(),
    );
    return {
      start,
      end,
      startsAt,
      endsAt,
      available: !clash,
      label: clash ? `ไม่ว่าง · ${clash.title}` : "ว่าง",
    };
  });

  const freeRanges: Array<{ start: string; end: string; hours: number }> = [];
  let runStart: string | null = null;
  slots.forEach((slot, i) => {
    if (slot.available && runStart === null) runStart = slot.start;
    const isLast = i === slots.length - 1;
    if ((!slot.available || isLast) && runStart !== null) {
      const end = slot.available && isLast ? slot.end : slots[i - 1]?.end ?? slot.start;
      const [sh, sm] = runStart.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
      if (hours > 0) freeRanges.push({ start: runStart, end, hours });
      runStart = null;
    }
  });

  return { slots, freeRanges };
}

export async function getAvailability(opts: {
  date: string;
  roomRef?: string;
  attendees?: number;
}): Promise<{ rooms: RoomAvailability[]; unknownRoom: boolean }> {
  let rooms: AgentRoom[];
  if (opts.roomRef) {
    const room = await resolveRoom(opts.roomRef);
    if (!room) return { rooms: [], unknownRoom: true };
    rooms = [room];
  } else {
    rooms = await listAgentRooms();
    if (opts.attendees) {
      const fits = rooms.filter(
        (r) => !r.capacity_max || r.capacity_max >= opts.attendees!,
      );
      if (fits.length > 0) rooms = fits;
    }
  }

  const busy = await listBusyBlocks(
    opts.date,
    rooms.map((r) => r.id),
  );

  return {
    unknownRoom: false,
    rooms: rooms.map((room) => {
      const roomBusy = busy.filter((b) => b.roomId === room.id);
      const { slots, freeRanges } = buildSlotGrid(opts.date, roomBusy);
      return {
        room,
        slots,
        busy: roomBusy,
        freeRanges,
        fullyFree: roomBusy.length === 0,
        text: renderAvailabilityText(room, opts.date, roomBusy, freeRanges),
      };
    }),
  };
}

// ─── Telegram-ready text ───────────────────────────────────────────────────

export function renderRoomText(room: AgentRoom, packages: AgentPackage[] = []): string {
  const capacity =
    room.capacity_min && room.capacity_max
      ? `${room.capacity_min}–${room.capacity_max} ท่าน`
      : room.capacity_max
        ? `สูงสุด ${room.capacity_max} ท่าน`
        : "ไม่ระบุจำนวน";
  const lines = [
    `<b>${room.name}</b>`,
    `รองรับ ${capacity} · ${room.hourly_rate.toLocaleString("th-TH")} บาท/ชม.`,
  ];
  if (room.floor || room.room_number) {
    lines.push(
      `ที่ตั้ง: ${[room.floor, room.room_number].filter(Boolean).join(" · ")}`,
    );
  }
  if (room.amenities.length > 0) {
    lines.push(`สิ่งอำนวยความสะดวก: ${room.amenities.join(" · ")}`);
  }
  const roomPackages = packages.filter((p) => p.room_id === room.id);
  if (roomPackages.length > 0) {
    lines.push("แพ็กเกจ:");
    for (const p of roomPackages) {
      lines.push(`  ${p.name} — ${p.hours} ชม. ${p.price.toLocaleString("th-TH")} บาท`);
    }
  }
  return lines.join("\n");
}

export function renderAvailabilityText(
  room: AgentRoom,
  date: string,
  busy: BusyBlock[],
  freeRanges: Array<{ start: string; end: string; hours: number }>,
): string {
  const lines = [`<b>${room.name}</b> · ${thaiLongDate(date)}`, ""];
  if (busy.length === 0) {
    lines.push("ว่างทั้งวัน 08:30–22:30");
  } else {
    lines.push("<b>ช่วงที่ว่าง</b>");
    if (freeRanges.length === 0) {
      lines.push("  เต็มทั้งวัน");
    } else {
      for (const r of freeRanges) {
        lines.push(`  ${r.start}–${r.end} (${r.hours} ชม.)`);
      }
    }
    lines.push("", "<b>ช่วงที่ถูกจองแล้ว</b>");
    for (const b of busy) {
      const tag = b.status === "pending" ? " · ติดจอง" : "";
      lines.push(`  ${b.startTime}–${b.endTime} — ${b.title}${tag}`);
    }
  }
  return lines.join("\n");
}

export function renderBookingText(booking: {
  reference: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  title?: string | null;
  attendees?: number | null;
  bookedBy?: string | null;
  totalAmount?: number | null;
  status: string;
}): string {
  const lines = [
    "<b>ยืนยันการจองเรียบร้อย</b>",
    "",
    `รหัส: <code>${booking.reference}</code>`,
    `ห้อง: ${booking.roomName}`,
    `วันที่: ${thaiLongDate(booking.startsAt)}`,
    `เวลา: ${localTime(booking.startsAt)}–${localTime(booking.endsAt)} น. (${hoursBetween(booking.startsAt, booking.endsAt)} ชม.)`,
  ];
  if (booking.title) lines.push(`หัวข้อ: ${booking.title}`);
  if (booking.attendees) lines.push(`ผู้เข้าร่วม: ${booking.attendees} ท่าน`);
  if (booking.bookedBy) lines.push(`ผู้จอง: ${booking.bookedBy}`);
  if (booking.totalAmount && booking.totalAmount > 0) {
    lines.push(`ยอดรวม: ${booking.totalAmount.toLocaleString("th-TH")} บาท`);
  }
  lines.push(
    `สถานะ: ${booking.status === "pending" ? "ติดจอง (รอยืนยัน)" : "ยืนยันแล้ว"}`,
  );
  return lines.join("\n");
}
