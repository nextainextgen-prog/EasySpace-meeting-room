import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { listRoomsWithPackages, listAddons } from "@/lib/data";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const [rooms, addons] = await Promise.all([listRoomsWithPackages(), listAddons()]);

  return (
    <>
      <AdminTopbar
        title="ลงข้อมูลการจอง"
        subtitle="กรอกฟอร์ม + เลือก slot · AI ช่วยตัดสินใจ"
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ลงข้อมูลการจองใหม่"
          description="กดบันทึก → ส่งเข้า Supabase + Telegram topic 'จองห้องประชุมเเล้ว' ทันที"
        />

        <BookingForm rooms={rooms} addons={addons} />
      </div>
    </>
  );
}
