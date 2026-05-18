import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export interface Room {
  id: string;
  name: string;
  size: "small" | "large" | "vip";
  capacity_min: number | null;
  capacity_max: number | null;
  hourly_rate: number;
  buffer_minutes: number;
  amenities: string[];
  perks: string[];
  floor: string | null;
  room_number: string | null;
  color: string;
  thumbnail_url: string | null;
  gallery_urls: string[];
  status: "active" | "maintenance" | "inactive";
  allow_internal: boolean;
  service_days: number[];
  display_order: number;
}

export interface RoomPackage {
  id: string;
  room_id: string;
  name: string;
  hours: number;
  price: number;
  max_hours: number | null;
  notes: string | null;
  is_active: boolean;
}

export async function listRooms(): Promise<Room[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return (data ?? []) as unknown as Room[];
}

export async function listRoomPackages(): Promise<RoomPackage[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("room_packages")
    .select("*")
    .eq("is_active", true)
    .order("hours");
  if (error) throw error;
  return (data ?? []) as unknown as RoomPackage[];
}

export async function listRoomsWithPackages() {
  const [rooms, packages] = await Promise.all([
    listRooms(),
    listRoomPackages(),
  ]);
  return rooms.map((room) => ({
    ...room,
    packages: packages.filter((p) => p.room_id === room.id),
  }));
}
