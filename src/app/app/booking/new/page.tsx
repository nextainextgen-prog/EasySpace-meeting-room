import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { listRooms } from "@/lib/data/rooms";
import { getCurrentMember } from "@/lib/data/members";
import { getOrgById, getOrgUsage } from "@/lib/data/organizations";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { MemberBookingShell } from "./booking-shell";

export const dynamic = "force-dynamic";

async function listBookingsForWindow(start: Date, end: Date) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select(
      `id, room_id, starts_at, ends_at, source, org_id, member_id,
       booking_status, internal_title, is_public,
       customer:customers(display_name),
       member:members(full_name),
       org:organizations(name)`,
    )
    .gte("starts_at", start.toISOString())
    .lte("starts_at", end.toISOString())
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
    booking_status: string;
    internal_title: string | null;
    is_public: boolean;
    customer: { display_name: string } | null;
    member: { full_name: string } | null;
    org: { name: string } | null;
  }>;
}

interface PageProps {
  searchParams: Promise<{ date?: string; slot?: string; roomId?: string }>;
}

export default async function NewBookingPage({ searchParams }: PageProps) {
  const ctx = await getCurrentMember();
  if (!ctx) {
    redirect("/app");
  }
  const params = await searchParams;

  const initialDate = params.date ?? new Date().toISOString().slice(0, 10);

  // Pre-fetch ~60 days around the selected date so client-side date changes
  // don't need a server round-trip for the live calendar.
  const focus = new Date(`${initialDate}T00:00:00`);
  const windowStart = new Date(focus);
  windowStart.setDate(focus.getDate() - 7);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(focus);
  windowEnd.setDate(focus.getDate() + 60);
  windowEnd.setHours(23, 59, 59, 999);

  const [rooms, org, usage, bookings] = await Promise.all([
    listRooms(),
    getOrgById(ctx.primaryOrgId),
    getOrgUsage(ctx.primaryOrgId),
    listBookingsForWindow(windowStart, windowEnd),
  ]);

  if (rooms.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-5">
        <Link
          href="/app/calendar"
          className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-primary-600"
        >
          <ChevronLeft size={12} />
          กลับสู่ปฏิทิน
        </Link>
        <EmptyState
          icon={Building2}
          title="ยังไม่มีห้องในระบบ"
          description="ติดต่อแอดมินตึกให้เพิ่มห้องประชุมก่อน"
        />
      </div>
    );
  }

  const initialSlot = params.slot ?? "10:00";
  const initialRoomId = params.roomId ?? rooms[0]?.id ?? "";

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4">
      <Link
        href="/app/calendar"
        className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-primary-600"
      >
        <ChevronLeft size={12} />
        กลับสู่ปฏิทิน
      </Link>

      <MemberBookingShell
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          capacity_min: r.capacity_min,
          capacity_max: r.capacity_max,
          thumbnail_url: r.thumbnail_url,
          gallery_urls: r.gallery_urls,
          amenities: r.amenities,
          hourly_rate: r.hourly_rate,
        }))}
        bookings={bookings}
        memberId={ctx.member.id}
        orgId={ctx.primaryOrgId}
        defaultDate={initialDate}
        defaultSlot={initialSlot}
        defaultRoomId={initialRoomId}
        org={org}
        usage={usage}
      />
    </div>
  );
}
