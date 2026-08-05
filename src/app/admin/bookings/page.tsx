import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { listRoomsWithPackages, listAddons } from "@/lib/data";
import {
  listActivePromotionsForBooking,
  getHoldForConversion,
} from "@/lib/actions/bookings";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ hold?: string }>;
}) {
  const { hold: holdId } = await searchParams;
  const [rooms, addons, promotions, hold] = await Promise.all([
    listRoomsWithPackages(),
    listAddons(),
    listActivePromotionsForBooking(),
    holdId ? getHoldForConversion(holdId) : Promise.resolve(null),
  ]);

  const converting = Boolean(hold);

  return (
    <>
      <AdminTopbar
        title={converting ? "ยืนยันติดจอง" : "ลงข้อมูลการจอง"}
        subtitle={
          converting
            ? "เติมแพ็กเกจ + ยอดเงิน เพื่อเปลี่ยนติดจองเป็นการจองจริง"
            : "ฟอร์ม + ปฏิทิน real-time · AI ช่วยตัดสินใจ"
        }
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title={converting ? "ยืนยันติดจอง" : "ลงข้อมูลการจองใหม่"}
          description={
            converting
              ? "กดบันทึก → ติดจองเดิมจะกลายเป็นการจองที่ยืนยันแล้ว โดยใช้รหัสการจองเดิม"
              : "กดบันทึก → ส่งเข้า Supabase + Telegram topic 'จองห้องประชุมเเล้ว' ทันที"
          }
        />

        {holdId && !hold && (
          <div className="rounded-card border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-sm font-semibold text-amber-800 tracking-tight">
              ไม่พบติดจองนี้
            </p>
            <p className="text-xs text-amber-700 mt-1">
              อาจถูกยืนยัน ยกเลิก หรือหมดอายุไปแล้ว —
              ฟอร์มด้านล่างจะสร้างการจองใหม่แทน
            </p>
          </div>
        )}

        <BookingForm
          rooms={rooms}
          addons={addons}
          promotions={promotions}
          hold={hold}
        />
      </div>
    </>
  );
}
