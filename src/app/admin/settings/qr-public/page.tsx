import { AdminTopbar } from "@/components/admin/topbar";
import { SettingsShell } from "../_shell";
import { QrPublicManager } from "./qr-public-manager";
import { listRooms } from "@/lib/data";
import {
  DEFAULT_PUBLIC_ROOM_CONFIG,
  getPublicRoomConfig,
} from "@/lib/data/public-rooms";

export const dynamic = "force-dynamic";

export default async function QrPublicPage() {
  const [rooms, config] = await Promise.all([
    listRooms(),
    getPublicRoomConfig(),
  ]);

  return (
    <>
      <AdminTopbar
        title="QR หน้าห้อง (Public)"
        subtitle="/rooms/* · ลิงก์ LINE · QR download"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="QR หน้าห้อง"
          description="ตั้งค่าหน้า /rooms/[slug] ที่ลูกค้าสแกน QR หน้าห้องเพื่อเช็กเวลาว่าง — กำหนด slug, ลิงก์ LINE, จำนวนวันที่แสดง, แล้วดาวน์โหลด QR ไปติดหน้าห้อง"
        >
          <QrPublicManager
            rooms={rooms.map((r) => ({
              id: r.id,
              name: r.name,
              color: r.color,
            }))}
            config={config}
            defaults={DEFAULT_PUBLIC_ROOM_CONFIG}
          />
        </SettingsShell>
      </div>
    </>
  );
}
