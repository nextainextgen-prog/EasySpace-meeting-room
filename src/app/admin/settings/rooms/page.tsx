import { AdminTopbar } from "@/components/admin/topbar";
import { listRoomsWithPackages } from "@/lib/data";
import { SettingsShell } from "../_shell";
import { RoomsManager } from "./rooms-manager";

export const dynamic = "force-dynamic";

export default async function RoomsSettingsPage() {
  const rooms = await listRoomsWithPackages();

  return (
    <>
      <AdminTopbar title="ห้องประชุม" subtitle="ตั้งค่าห้อง + แพ็กเกจ" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="ห้องประชุม"
          description={`${rooms.length} ห้องในระบบ · เพิ่ม / แก้ / copy / ปิดใช้งาน + จัดการแพ็กเกจต่อห้อง`}
        >
          <RoomsManager rooms={rooms} />
        </SettingsShell>
      </div>
    </>
  );
}
