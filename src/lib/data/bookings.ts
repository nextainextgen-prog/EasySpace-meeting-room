import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type {
  BookingSource,
  BookingStatus,
  PaymentStatus,
} from "@/lib/types";

export interface Booking {
  id: string;
  reference_code: string;
  source: BookingSource;
  customer_id: string | null;
  member_id: string | null;
  org_id: string | null;
  room_id: string;
  starts_at: string;
  ends_at: string;
  attendees_count: number | null;
  package_id: string | null;
  base_amount: number;
  addons_amount: number;
  discount_amount: number;
  discount_note: string | null;
  promotion_id: string | null;
  total_amount: number;
  deposit_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  booking_status: BookingStatus;
  free_reason: string | null;
  is_recurring: boolean;
  source_channel: string | null;
  source_detail: string | null;
  internal_title: string | null;
  internal_agenda: string | null;
  is_public: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingWithRelations extends Booking {
  customer?: {
    id: string;
    display_name: string;
    phone: string | null;
    email: string | null;
    tags: string[];
  } | null;
  room?: {
    id: string;
    name: string;
    color: string;
    capacity_max: number | null;
  };
}

export async function listBookingsForRange(opts: {
  start: string;
  end: string;
}): Promise<BookingWithRelations[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      customer:customers(id, display_name, phone, email, tags),
      room:rooms(id, name, color, capacity_max)
    `,
    )
    .gte("starts_at", opts.start)
    .lte("starts_at", opts.end)
    .order("starts_at");
  if (error) throw error;
  return (data ?? []) as unknown as BookingWithRelations[];
}

export async function getBookingById(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      customer:customers(*),
      room:rooms(*),
      payments:booking_payments(*),
      audit:booking_audit_log(*)
    `,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function bookingStatsForDay(date: Date) {
  const supabase = createSupabaseAdminClient();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("bookings")
    .select("payment_status, total_amount, paid_amount, starts_at")
    .gte("starts_at", dayStart.toISOString())
    .lte("starts_at", dayEnd.toISOString());
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    payment_status: PaymentStatus;
    total_amount: number;
    paid_amount: number;
  }>;

  return {
    bookings: rows.length,
    revenuePaid: rows.reduce((sum, r) => sum + Number(r.paid_amount), 0),
    revenueTotal: rows.reduce((sum, r) => sum + Number(r.total_amount), 0),
    outstandingCount: rows.filter((r) => r.payment_status !== "paid" && r.payment_status !== "free").length,
    outstandingAmount: rows.reduce(
      (sum, r) =>
        r.payment_status !== "paid" && r.payment_status !== "free"
          ? sum + Number(r.total_amount) - Number(r.paid_amount)
          : sum,
      0,
    ),
  };
}

export async function generateBookingCode() {
  const supabase = createSupabaseAdminClient();
  const { count } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true });
  const n = (count ?? 0) + 1;
  return `BK${String(n).padStart(5, "0")}`;
}
