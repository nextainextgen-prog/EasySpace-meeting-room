import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarOff } from "lucide-react";
import { listRooms } from "@/lib/data/rooms";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentMember } from "@/lib/data/members";
import { MemberCalendarBoard } from "./member-calendar-board";

export const dynamic = "force-dynamic";

async function listBookingsForYear(year: number) {
  const admin = createSupabaseAdminClient();
  const start = new Date(year, 0, 1).toISOString();
  const end = new Date(year, 11, 31, 23, 59, 59).toISOString();
  const { data, error } = await admin
    .from("bookings")
    .select(
      `id, room_id, starts_at, ends_at, source, org_id, member_id,
       booking_status, internal_title, is_public,
       customer:customers(display_name),
       member:members(full_name),
       org:organizations(name)`,
    )
    .gte("starts_at", start)
    .lte("starts_at", end)
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

export default async function MemberCalendarPage() {
  const year = new Date().getFullYear();
  const [ctx, rooms, bookings] = await Promise.all([
    getCurrentMember(),
    listRooms(),
    listBookingsForYear(year),
  ]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
            ปฏิทินจองห้อง
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            ดูภาพรวมการจองทั้งหมด · แตะ slot ว่างเพื่อจองห้องใหม่
          </p>
        </div>
        <Link href="/app/booking/new">
          <Button variant="gradient" iconLeft={<CalendarPlus size={16} />}>
            จองห้องใหม่
          </Button>
        </Link>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="ยังไม่มีห้องในระบบ"
          description="ติดต่อแอดมินตึกให้เพิ่มห้องประชุม"
        />
      ) : (
        <MemberCalendarBoard
          rooms={rooms.map((r) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            capacity_min: r.capacity_min,
            capacity_max: r.capacity_max,
          }))}
          bookings={bookings}
          memberId={ctx?.member.id ?? null}
          orgId={ctx?.primaryOrgId ?? null}
        />
      )}
    </div>
  );
}
