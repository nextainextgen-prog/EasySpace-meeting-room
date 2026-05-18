import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { BookingWithRelations } from "./bookings";

interface ListMyOpts {
  memberId: string;
  filter?: "upcoming" | "past" | "cancelled";
}

export async function listMyBookings({
  memberId,
  filter = "upcoming",
}: ListMyOpts): Promise<BookingWithRelations[]> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  let q = admin
    .from("bookings")
    .select(
      `*, customer:customers(id, display_name, phone, email, tags),
       room:rooms(id, name, color, capacity_max)`,
    )
    .eq("member_id", memberId);

  if (filter === "upcoming") {
    q = q
      .neq("booking_status", "cancelled")
      .gte("ends_at", now)
      .order("starts_at");
  } else if (filter === "past") {
    q = q
      .neq("booking_status", "cancelled")
      .lt("ends_at", now)
      .order("starts_at", { ascending: false });
  } else {
    q = q.eq("booking_status", "cancelled").order("cancelled_at", {
      ascending: false,
    });
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as BookingWithRelations[];
}

export async function listOrgBookingsForDay(orgId: string, date: Date) {
  const admin = createSupabaseAdminClient();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const { data, error } = await admin
    .from("bookings")
    .select(
      `*, customer:customers(id, display_name, phone, email, tags),
       room:rooms(id, name, color, capacity_max),
       member:members(id, full_name)`,
    )
    .eq("org_id", orgId)
    .gte("starts_at", dayStart.toISOString())
    .lte("starts_at", dayEnd.toISOString())
    .order("starts_at");
  if (error) throw error;
  return (data ?? []) as unknown as BookingWithRelations[];
}

/** All bookings on a day (any source) — used for member calendar conflict UI. */
export async function listBookingsForDay(date: Date) {
  const admin = createSupabaseAdminClient();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const { data, error } = await admin
    .from("bookings")
    .select(
      `id, room_id, starts_at, ends_at, source, org_id, member_id,
       payment_status, booking_status, internal_title, is_public,
       customer:customers(display_name),
       member:members(full_name),
       org:organizations(name)`,
    )
    .gte("starts_at", dayStart.toISOString())
    .lte("starts_at", dayEnd.toISOString())
    .neq("booking_status", "cancelled")
    .order("starts_at");
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    source: "external" | "internal";
    org_id: string | null;
    member_id: string | null;
    payment_status: string;
    booking_status: string;
    internal_title: string | null;
    is_public: boolean;
    customer: { display_name: string } | null;
    member: { full_name: string } | null;
    org: { name: string } | null;
  }>;
}
