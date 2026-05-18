import { Plus, DoorOpen, ChevronLeft, Pencil, Copy, Trash2 } from "lucide-react";
import Link from "next/link";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { listRoomsWithPackages } from "@/lib/data";
import { formatBaht } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RoomsSettingsPage() {
  const rooms = await listRoomsWithPackages();

  return (
    <>
      <AdminTopbar title="ห้องประชุม" subtitle="ตั้งค่าห้อง + แพ็กเกจ" />

      <div className="p-6 lg:p-8 max-w-[1200px] w-full mx-auto space-y-5">
        <div>
          <Link
            href="/admin/settings"
            className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-primary-600 mb-2"
          >
            <ChevronLeft size={12} />
            กลับสู่ตั้งค่าระบบ
          </Link>
          <PageHeader
            title="ประเภทห้องประชุม"
            description={`${rooms.length} ห้องในระบบ · ดึงจาก Supabase real-time`}
            actions={
              <Button iconLeft={<Plus size={16} />}>เพิ่มห้องใหม่</Button>
            }
          />
        </div>

        {rooms.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="ยังไม่มีห้องในระบบ"
            description="เพิ่มห้องประชุมแรกเพื่อเริ่มรับการจอง"
            action={<Button iconLeft={<Plus size={16} />}>เพิ่มห้องใหม่</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {rooms.map((room) => (
              <Card key={room.id}>
                <div
                  className="h-2 rounded-full mb-4"
                  style={{ background: room.color }}
                />
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <IconTile icon={DoorOpen} tone="primary" />
                    <div>
                      <CardTitle>{room.name}</CardTitle>
                      <CardSubtitle>
                        {room.capacity_min}–{room.capacity_max} ท่าน ·{" "}
                        {formatBaht(room.hourly_rate)}/ชม.
                      </CardSubtitle>
                    </div>
                  </div>
                  <Badge
                    tone={
                      room.status === "active"
                        ? "success"
                        : room.status === "maintenance"
                          ? "warning"
                          : "muted"
                    }
                  >
                    {room.status === "active"
                      ? "Active"
                      : room.status === "maintenance"
                        ? "Maintenance"
                        : "Inactive"}
                  </Badge>
                </CardHeader>

                <div className="space-y-3 text-sm">
                  {room.amenities.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                        สิ่งอำนวยความสะดวก
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {room.amenities.map((a) => (
                          <Badge key={a} tone="muted" className="!text-[10px]">
                            {a}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {room.perks.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                        สิทธิ์ฟรีเพิ่ม
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {room.perks.map((p) => (
                          <Badge key={p} tone="info" className="!text-[10px]">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {room.packages.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-2">
                        แพ็กเกจ
                      </p>
                      <ul className="space-y-1.5">
                        {room.packages.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center justify-between text-xs p-2 rounded-input bg-surface-subtle"
                          >
                            <span>{p.name}</span>
                            <span className="font-semibold tabular-nums">
                              {formatBaht(p.price)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-5 border-t border-line-soft flex justify-end gap-1.5">
                  <button className="w-9 h-9 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center transition">
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>
                  <button className="w-9 h-9 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center transition">
                    <Copy size={14} strokeWidth={1.75} />
                  </button>
                  <button className="w-9 h-9 rounded-pill text-ink-3 hover:bg-red-50 hover:text-red-600 grid place-items-center transition">
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
