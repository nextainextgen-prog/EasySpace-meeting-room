import { AdminTopbar } from "@/components/admin/topbar";
import { listAddons, listRooms } from "@/lib/data";
import { SettingsShell } from "../_shell";
import { AddonsManager } from "./addons-manager";

export const dynamic = "force-dynamic";

export default async function AddonsSettingsPage() {
  const [addons, rooms] = await Promise.all([listAddons(), listRooms()]);

  return (
    <>
      <AdminTopbar title="บริการเสริม" subtitle="Add-ons + ผูกห้องที่ใช้ได้" />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="บริการเสริม (Add-ons)"
          description={`${addons.length} รายการ · ราคา · หน่วยคิด · ห้องที่ใช้ได้`}
        >
          <AddonsManager addons={addons} rooms={rooms} />
        </SettingsShell>
      </div>
    </>
  );
}
