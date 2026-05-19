import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

const DEFAULT_POLICY = {
  min_advance_hours: 0,
  max_advance_days: 90,
  deposit_pct: 30,
  payment_due_days: 3,
  max_session_hours: 8,
  max_concurrent_bookings: 5,
  cancellation: {
    free_before_hours: 24,
    partial_refund: [
      { hours_before: 6, refund_pct: 50 },
      { hours_before: 0, refund_pct: 0 },
    ],
  },
  no_show_grace_minutes: 15,
  max_discount_pct_per_role: {
    staff: 10,
    admin: 30,
    super_admin: 100,
  },
};

export default async function PolicySettingsPage() {
  const value = await getSettingValue("booking.policy");
  return (
    <>
      <AdminTopbar
        title="นโยบายการจอง"
        subtitle="ล่วงหน้า · มัดจำ · ยกเลิก · no-show · discount limit"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="นโยบายการจอง"
          description="กฎหลักของระบบ — มัดจำ % / refund tier / no-show grace / discount cap ต่อบทบาท"
        >
          <JsonSettingEditor
            settingKey="booking.policy"
            category="business"
            defaultValue={DEFAULT_POLICY}
            initial={value}
            hint="กฎเหล่านี้ใช้ตอนสร้าง booking + ตอนคำนวณ refund + ตอนตรวจสิทธิ์ลดราคา"
          />
        </SettingsShell>
      </div>
    </>
  );
}
