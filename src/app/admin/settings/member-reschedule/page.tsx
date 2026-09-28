import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { JsonSettingEditor } from "../_json-editor";
import { getSettingValue } from "@/lib/actions/settings";
import {
  DEFAULT_RESCHEDULE_POLICY,
  RESCHEDULE_SETTING_KEY,
} from "@/lib/policy/member-reschedule";

export const dynamic = "force-dynamic";

export default async function MemberReschedulePage() {
  const value = await getSettingValue(RESCHEDULE_SETTING_KEY);
  return (
    <>
      <AdminTopbar
        title="ผู้ใช้ภายในเลื่อนเวลาเอง"
        subtitle="สิทธิ์ · แจ้งล่วงหน้า · buffer · เพดานต่อคำขอ"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="ผู้ใช้ภายในเลื่อนเวลาเอง"
          description="ควบคุมว่า member ย้ายวัน/เวลาการจองซ้ำของตัวเองได้แค่ไหน — ไม่ว่าตั้งค่าอย่างไร ระบบจะไม่ยอมให้ย้ายไปทับการจองของลูกค้าเด็ดขาด"
        >
          <JsonSettingEditor
            settingKey={RESCHEDULE_SETTING_KEY}
            category="business"
            defaultValue={DEFAULT_RESCHEDULE_POLICY}
            initial={value}
            hint="allowed_tiers = manager/member/guest · min_notice_hours = ห้ามย้ายถ้าใกล้เวลาประชุมเกินนี้ · respect_room_buffer = off | external_only | all · allow_room_change = ให้ย้ายข้ามห้องได้หรือไม่ · max_reschedules_per_series_per_month = 0 คือไม่จำกัด"
          />
        </SettingsShell>
      </div>
    </>
  );
}
