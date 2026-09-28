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
        subtitle="/rooms/* · จองออนไลน์ · ลิงก์ LINE · QR download"
      />
      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
        <SettingsShell
          title="QR หน้าห้อง"
          description="หน้า /rooms สำหรับลูกค้าภายนอก — สแกน QR หน้าห้องหรือกดริชเมนู LINE เพื่อเช็กเวลาว่างและจองได้ทันที · ตั้งค่าการจอง, slug, ลิงก์ LINE แล้วดาวน์โหลด QR"
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
