import { Plus } from "lucide-react";
import Link from "next/link";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  listRooms,
  listBookingsForRange,
  type BookingWithRelations,
} from "@/lib/data";
import { CalendarBoard } from "./calendar-board";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  // Load a year window so all 6 views (year heatmap included) have data.
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

  const [rooms, bookings] = await Promise.all([
    listRooms(),
    listBookingsForRange({
      start: yearStart.toISOString(),
      end: yearEnd.toISOString(),
    }),
  ]);

  return (
    <>
      <AdminTopbar
        title="ปฏิทินการจอง"
        subtitle="ภาพรวมการจองทั้งหมด · drag/drop · keyboard shortcuts"
        actions={
          <Link href="/admin/bookings">
            <Button iconLeft={<Plus size={16} strokeWidth={2} />} size="sm">
              จองใหม่
            </Button>
          </Link>
        }
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5 print:p-0">
        <PageHeader
          title="ปฏิทินการจอง"
          description="ดู / แก้ไข / จัดการการจองทั้งหมด · กด ? เพื่อดูคีย์ลัด"
        />

        <CalendarBoard
          rooms={rooms}
          bookings={bookings as BookingWithRelations[]}
        />
      </div>
    </>
  );
}
