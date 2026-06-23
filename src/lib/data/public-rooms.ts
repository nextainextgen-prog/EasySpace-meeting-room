import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

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
};

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
      .select(
        "id, name, size, capacity_min, capacity_max, hourly_rate, color, thumbnail_url, gallery_urls, amenities, perks, floor, status",
      )
      .eq("id", mappedId)
      .maybeSingle();
    if (data) return { room: data as PublicRoom, config: cfg };
  }

  // Fallback: case-insensitive contains match
  const { data } = await supabase
    .from("rooms")
    .select(
      "id, name, size, capacity_min, capacity_max, hourly_rate, color, thumbnail_url, gallery_urls, amenities, perks, floor, status",
    )
    .ilike("name", `%${slug}%`)
    .order("display_order")
    .limit(1)
    .maybeSingle();
  return { room: (data as PublicRoom | null) ?? null, config: cfg };
}

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
}

/** Pull a few days' worth of bookings for the room (anonymous — no
 *  customer name). Returns slots grouped by date. */
export async function listPublicAvailability(roomId: string, days: number) {
  const supabase = createSupabaseAdminClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);

  const { data } = await supabase
    .from("bookings")
    .select("starts_at, ends_at, booking_status")
    .eq("room_id", roomId)
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .gte("starts_at", start.toISOString())
    .lte("starts_at", end.toISOString())
    .order("starts_at");

  return ((data ?? []) as Array<{
    starts_at: string;
    ends_at: string;
    booking_status: string;
  }>).map((b) => ({
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    in_use: b.booking_status === "in_use",
  }));
}

/** Lightweight info for the "other rooms" strip at the bottom */
export async function listOtherPublicRoomStrips(excludeRoomId: string) {
  const cfg = await getPublicRoomConfig();
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("rooms")
    .select("id, name, color, thumbnail_url")
    .eq("status", "active")
    .neq("id", excludeRoomId)
    .order("display_order");
  const rooms = (data ?? []) as Array<{
    id: string;
    name: string;
    color: string;
    thumbnail_url: string | null;
  }>;

  // Reverse-lookup the slug for each room
  const slugForRoom = new Map<string, string>();
  for (const [s, rid] of Object.entries(cfg.slug_map)) {
    if (!slugForRoom.has(rid)) slugForRoom.set(rid, s);
  }

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const results: Array<{
    id: string;
    name: string;
    color: string;
    thumbnail_url: string | null;
    slug: string | null;
    is_busy_now: boolean;
    next_free_at: string | null;
  }> = [];

  for (const r of rooms) {
    const slug =
      slugForRoom.get(r.id) ??
      r.name.toLowerCase().replace(/\s+room$/, "").replace(/\s+/g, "-");
    const { data: bookingsRaw } = await supabase
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("room_id", r.id)
      .in("booking_status", ["pending", "confirmed", "in_use"])
      .gte("starts_at", today.toISOString())
      .lte("starts_at", tomorrow.toISOString())
      .order("starts_at");
    const bookings = ((bookingsRaw ?? []) as Array<{
      starts_at: string;
      ends_at: string;
    }>) ?? [];
    const isBusyNow = bookings.some(
      (b) =>
        new Date(b.starts_at) <= now && new Date(b.ends_at) > now,
    );
    const nextFree = bookings.find(
      (b) => new Date(b.starts_at) > now,
    )?.starts_at ?? null;

    results.push({
      id: r.id,
      name: r.name,
      color: r.color,
      thumbnail_url: r.thumbnail_url,
      slug,
      is_busy_now: isBusyNow,
      next_free_at: nextFree,
    });
  }
  return results;
}
