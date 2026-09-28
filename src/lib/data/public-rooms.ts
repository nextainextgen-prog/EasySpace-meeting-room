import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { addDays, bkkParts, fromBkk } from "@/lib/time/bkk";
import {
  mergeBlocks,
  type PublicBusyBlock,
  type PublicPackage,
} from "@/lib/public-booking/shared";

export interface PublicRoomConfig {
  enabled: boolean;
  line_url: string;
  line_id: string;
  phone: string;
  show_days: 1 | 2 | 3 | 7;
  headline: string;
  show_capacity: boolean;
  show_hourly_rate: boolean;
  slug_map: Record<string, string>; // slug → room_id

  // ─── Online booking (external customers) ───
  /** Let customers book from the QR / LINE page instead of only viewing. */
  booking_enabled: boolean;
  /**
   * External customers may take a slot an internal org already holds. The
   * internal booking is moved to another free room when possible, otherwise
   * released — and both the team and the member are told.
   */
  allow_override_internal: boolean;
  /** Try another free room for the displaced internal meeting first. */
  auto_relocate_internal: boolean;
  /**
   * Internal meetings already running, or starting within this many minutes,
   * cannot be taken — people may already be in the room. 0 = no protection.
   */
  override_protect_minutes: number;
  /** How far ahead the calendar opens. */
  booking_days_ahead: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  /** Shown on the confirmation screen. */
  confirm_message: string;

  // ─── Online payment (slip upload, verified by EasySlip) ───
  /** Ask for a transfer + slip right after booking. */
  payment_enabled: boolean;
  /** Deposit up front, or the whole amount. */
  payment_mode: "deposit" | "full";
  deposit_percent: number;
  /** How long an unpaid online booking holds the room. */
  payment_hold_minutes: number;

  // ─── LINE ───
  /**
   * LIFF app (LINE Login channel, same provider as the OA). Endpoint URL in
   * the LINE console must be `<site>/rooms`. Empty = no LINE messages.
   */
  liff_id: string;
}

export const DEFAULT_PUBLIC_ROOM_CONFIG: PublicRoomConfig = {
  enabled: true,
  line_url: "https://lin.ee/UXh4vjD",
  line_id: "@easyspace",
  phone: "093-388-3555",
  show_days: 3,
  headline: "เช็กห้องว่าง · ติดต่อจองได้ทันที",
  show_capacity: true,
  show_hourly_rate: true,
  slug_map: {},
  booking_enabled: true,
  allow_override_internal: true,
  auto_relocate_internal: true,
  override_protect_minutes: 0,
  booking_days_ahead: 30,
  min_duration_minutes: 60,
  max_duration_minutes: 8 * 60,
  confirm_message:
    "ทีมงานจะติดต่อกลับเพื่อยืนยันการจองและแจ้งช่องทางชำระเงินภายใน 30 นาที (ในเวลาทำการ)",
  payment_enabled: true,
  payment_mode: "deposit",
  deposit_percent: 30,
  payment_hold_minutes: 60,
  liff_id: "",
};

/** Canonical public origin for links that leave the site (LINE, e-mail). */
export function publicBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env;
  return "https://easy-space-meeting-room-yjqk.vercel.app";
}

/**
 * Link to a customer's booking. Through LIFF when configured, so it opens
 * inside LINE already signed in; plain web otherwise.
 */
export function bookingStatusUrl(cfg: Pick<PublicRoomConfig, "liff_id">, reference: string, token: string) {
  const path = `booking/${encodeURIComponent(reference)}?t=${encodeURIComponent(token)}&src=line`;
  return cfg.liff_id
    ? `https://liff.line.me/${cfg.liff_id}/${path}`
    : `${publicBaseUrl()}/rooms/${path}`;
}

export async function getPublicRoomConfig(): Promise<PublicRoomConfig> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "public.rooms.config")
    .maybeSingle();
  const value = (data as { value?: Partial<PublicRoomConfig> } | null)?.value;
  return { ...DEFAULT_PUBLIC_ROOM_CONFIG, ...(value ?? {}) };
}

const ROOM_COLUMNS =
  "id, name, size, capacity_min, capacity_max, hourly_rate, color, thumbnail_url, gallery_urls, amenities, perks, floor, status, display_order";

export interface PublicRoom {
  id: string;
  name: string;
  size: string;
  capacity_min: number | null;
  capacity_max: number | null;
  hourly_rate: number;
  color: string;
  thumbnail_url: string | null;
  gallery_urls: string[];
  amenities: string[];
  perks: string[];
  floor: string | null;
  status: string;
  display_order: number;
}

function normaliseRoom(r: PublicRoom): PublicRoom {
  return {
    ...r,
    hourly_rate: Number(r.hourly_rate),
    gallery_urls: r.gallery_urls ?? [],
    amenities: r.amenities ?? [],
    perks: r.perks ?? [],
  };
}

/** The slug a room is published under — mapping first, name-derived fallback. */
export function slugForRoom(cfg: PublicRoomConfig, room: { id: string; name: string }) {
  for (const [slug, id] of Object.entries(cfg.slug_map)) {
    if (id === room.id) return slug;
  }
  return room.name.toLowerCase().replace(/\s+room$/, "").replace(/\s+/g, "-");
}

/**
 * Resolve a public slug to a room record. Falls back to fuzzy name match
 * when no explicit mapping exists (e.g. slug `meeting` → name "MEETING ROOM").
 */
export async function resolvePublicRoom(slug: string) {
  const cfg = await getPublicRoomConfig();
  const supabase = createSupabaseAdminClient();
  const slugLower = slug.toLowerCase();
  const mappedId = cfg.slug_map[slugLower];

  if (mappedId) {
    const { data } = await supabase
      .from("rooms")
      .select(ROOM_COLUMNS)
      .eq("id", mappedId)
      .maybeSingle();
    if (data) return { room: normaliseRoom(data as unknown as PublicRoom), config: cfg };
  }

  const { data } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .ilike("name", `%${slugLower.replace(/-/g, " ")}%`)
    .order("display_order")
    .limit(1)
    .maybeSingle();
  return {
    room: data ? normaliseRoom(data as unknown as PublicRoom) : null,
    config: cfg,
  };
}

export async function listPublicRooms(): Promise<PublicRoom[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("status", "active")
    .order("display_order");
  return ((data ?? []) as unknown as PublicRoom[]).map(normaliseRoom);
}

export async function listPublicPackages(roomIds: string[]): Promise<
  Map<string, PublicPackage[]>
> {
  const out = new Map<string, PublicPackage[]>();
  if (roomIds.length === 0) return out;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("room_packages")
    .select("id, room_id, name, hours, price")
    .eq("is_active", true)
    .in("room_id", roomIds)
    .order("hours");
  for (const p of (data ?? []) as Array<{
    id: string;
    room_id: string;
    name: string;
    hours: number;
    price: number;
  }>) {
    const list = out.get(p.room_id) ?? [];
    list.push({ id: p.id, name: p.name, hours: Number(p.hours), price: Number(p.price) });
    out.set(p.room_id, list);
  }
  return out;
}

/**
 * What an external customer is allowed to see as "taken".
 *
 * Only other external customers' bookings block the public — an internal
 * org's meeting is flexible and gives way (see `lib/server/public-booking`),
 * so it is invisible here. When the admin switches override off, internal
 * bookings block too, but still show as a nameless block.
 *
 * Blocks are merged so a run of back-to-back bookings can't be counted.
 */
export async function listPublicBusy(opts: {
  roomIds: string[];
  fromDate: string;
  days: number;
  includeInternal: boolean;
  /** Also show internal bookings starting before now + this many minutes. */
  protectMinutes?: number;
}): Promise<Map<string, PublicBusyBlock[]>> {
  const out = new Map<string, PublicBusyBlock[]>();
  for (const id of opts.roomIds) out.set(id, []);
  if (opts.roomIds.length === 0) return out;

  const from = fromBkk(opts.fromDate, "00:00").toISOString();
  const to = fromBkk(addDays(opts.fromDate, opts.days), "00:00").toISOString();

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("bookings")
    .select("room_id, starts_at, ends_at, source, booking_status, hold_expires_at")
    .in("room_id", opts.roomIds)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .lt("starts_at", to)
    .gt("ends_at", from)
    .order("starts_at");
  const protectUntil = Date.now() + Math.max(0, opts.protectMinutes ?? 0) * 60_000;

  const { data } = await query;
  const now = Date.now();
  for (const b of (data ?? []) as Array<{
    room_id: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    hold_expires_at: string | null;
  }>) {
    // A hold past its deadline is already free — the daily cron just hasn't
    // swept it yet. Booking it releases it (see expireLapsedHolds).
    if (b.booking_status === "pending" && b.hold_expires_at && new Date(b.hold_expires_at).getTime() <= now) {
      continue;
    }
    // Internal meetings stay invisible unless override is off, or they are
    // running / about to start inside the protection window.
    if (
      (b as { source?: string }).source === "internal" &&
      !opts.includeInternal &&
      !(opts.protectMinutes && new Date(b.starts_at).getTime() < protectUntil)
    ) {
      continue;
    }
    out.get(b.room_id)?.push({ startsAt: b.starts_at, endsAt: b.ends_at });
  }
  for (const [id, blocks] of out) out.set(id, mergeBlocks(blocks));
  return out;
}

/** Today in Bangkok, `YYYY-MM-DD`. */
export function bkkToday(): string {
  return bkkParts(new Date()).date;
}
