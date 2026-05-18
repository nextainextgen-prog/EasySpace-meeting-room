import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Plus,
  Search,
  Calendar as CalendarIcon,
} from "lucide-react";
import { AdminTopbar } from "@/components/admin/topbar";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { rooms, bookings } from "@/lib/mocks";
import { formatTime, formatBaht } from "@/lib/format";

// Slots: 30-min intervals 08:30 – 16:30, plus evening 17:00–22:00
const slots: string[] = [];
for (let m = 8 * 60 + 30; m <= 22 * 60; m += 30) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
}

function colorByStatus(status: string) {
  switch (status) {
    case "paid":
      return "border-l-emerald-500 bg-emerald-50/60";
    case "deposit":
      return "border-l-amber-500 bg-amber-50/60";
    case "unpaid":
      return "border-l-red-500 bg-red-50/60";
    case "free":
      return "border-l-slate-400 bg-slate-50";
    default:
      return "border-l-primary-500 bg-primary-50/40";
  }
}

export default function CalendarPage() {
  const today = new Date();
  const todayBookings = bookings.filter((b) => {
    const d = new Date(b.startsAt);
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  });

  return (
    <>
      <AdminTopbar
        title="ปฏิทินการจอง"
        subtitle="ภาพรวมการจองทั้งหมด · drag & drop · payment manager"
        actions={
          <Button iconLeft={<Plus size={16} strokeWidth={2} />} size="sm">
            จองใหม่
          </Button>
        }
      />

      <div className="p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-5">
        <PageHeader
          title="ปฏิทินการจอง"
          description="ดู / แก้ไข / จัดการการจองทั้งหมดในวันเดียว"
        />

        {/* Toolbar */}
        <Card className="!p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm">
                วันนี้
              </Button>
              <button className="w-9 h-9 rounded-pill border border-line bg-white grid place-items-center hover:bg-surface-subtle">
                <ChevronLeft size={16} strokeWidth={1.75} />
              </button>
              <button className="w-9 h-9 rounded-pill border border-line bg-white grid place-items-center hover:bg-surface-subtle">
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
              <div className="ml-2 inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
                <CalendarIcon size={16} className="text-primary-600" strokeWidth={1.75} />
                18 พฤษภาคม 2026
              </div>
            </div>

            <div className="flex items-center gap-1 ml-2 p-1 rounded-pill bg-surface-subtle">
              {["วัน", "สัปดาห์", "เดือน", "ปี", "Timeline", "List"].map(
                (v, i) => (
                  <button
                    key={v}
                    className={`px-4 py-1.5 rounded-pill text-xs font-medium ${
                      i === 0
                        ? "bg-white text-primary-600 shadow-card"
                        : "text-ink-2 hover:text-ink-1"
                    }`}
                  >
                    {v}
                  </button>
                ),
              )}
            </div>

            <div className="flex-1" />

            <div className="w-64">
              <Input
                placeholder="ค้นหา booking, ลูกค้า..."
                iconLeft={<Search size={14} strokeWidth={1.75} />}
                className="h-9"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Filter size={14} strokeWidth={1.75} />}
            >
              ตัวกรอง
              <Badge tone="primary" className="ml-1.5 -mr-1">3</Badge>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Download size={14} strokeWidth={1.75} />}
            >
              Export
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
          {/* Sidebar */}
          <aside className="space-y-5">
            <Card className="!p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
                สถิติวันนี้
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-ink-2">จอง</span>
                  <span className="font-semibold tabular-nums">8 รายการ</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-ink-2">รายได้</span>
                  <span className="font-semibold tabular-nums">
                    {formatBaht(12400)}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-ink-2">Utilization</span>
                  <span className="font-semibold tabular-nums">67%</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-ink-2">ใช้งานตอนนี้</span>
                  <span className="font-semibold tabular-nums">3 ห้อง</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-ink-2">ค้างชำระ</span>
                  <span className="font-semibold tabular-nums text-red-600">
                    2 รายการ
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-ink-2">ลูกค้าใหม่</span>
                  <span className="font-semibold tabular-nums">1 ราย</span>
                </li>
              </ul>
            </Card>

            <Card className="!p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
                Color Code
              </p>
              <ul className="space-y-2 text-xs">
                <li className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-pill bg-emerald-500" />
                  จ่ายแล้ว
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-pill bg-amber-500" />
                  มัดจำแล้ว
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-pill bg-red-500" />
                  ยังไม่มัดจำ
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-pill bg-slate-400" />
                  ฟรี / Internal
                </li>
              </ul>
            </Card>

            <Card className="!p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-3">
                ห้อง
              </p>
              <ul className="space-y-2 text-sm">
                {rooms.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-pill"
                      style={{ background: r.color }}
                    />
                    <span className="flex-1 text-ink-1 tracking-tight">
                      {r.name}
                    </span>
                    <span className="text-xs text-ink-3 tabular-nums">
                      {todayBookings.filter((b) => b.roomId === r.id).length}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>

          {/* Main Calendar */}
          <Card className="!p-0 overflow-hidden">
            <div className="grid border-b border-line bg-surface-subtle"
                 style={{
                   gridTemplateColumns: `80px repeat(${rooms.length}, minmax(0,1fr))`,
                 }}>
              <div className="px-3 py-3 text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
                เวลา
              </div>
              {rooms.map((r) => (
                <div
                  key={r.id}
                  className="px-4 py-3 border-l border-line"
                >
                  <p className="text-sm font-bold tracking-tight">{r.name}</p>
                  <p className="text-[11px] text-ink-3">
                    {r.capacityMin}–{r.capacityMax} ท่าน · {formatBaht(r.hourlyRate)}/ชม.
                  </p>
                </div>
              ))}
            </div>

            <div className="max-h-[640px] overflow-y-auto scrollbar-thin">
              {slots.map((slot, idx) => {
                const [h, m] = slot.split(":").map(Number);
                const isLunch = h === 12;
                const half = m === 30;
                return (
                  <div
                    key={slot}
                    className={`grid border-b border-line-soft ${
                      isLunch ? "bg-surface-subtle/60" : ""
                    }`}
                    style={{
                      gridTemplateColumns: `80px repeat(${rooms.length}, minmax(0,1fr))`,
                    }}
                  >
                    <div className="px-3 py-2 text-[11px] tabular-nums text-ink-3 font-medium">
                      {!half && slot}
                    </div>
                    {rooms.map((room) => {
                      const slotDateStr = `${slot}`;
                      const event = todayBookings.find((b) => {
                        if (b.roomId !== room.id) return false;
                        const start = new Date(b.startsAt);
                        return (
                          start.getHours() === h && start.getMinutes() === m
                        );
                      });
                      return (
                        <div
                          key={`${slot}-${room.id}`}
                          className="border-l border-line-soft min-h-[36px] relative hover:bg-primary-50/30 cursor-pointer transition"
                        >
                          {event && (
                            <EventCard
                              event={event}
                              slotHeight={36}
                            />
                          )}
                          {isLunch && !event && (
                            <div className="absolute inset-1 rounded-input border border-dashed border-line text-[10px] text-ink-3 grid place-items-center">
                              พัก
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function EventCard({
  event,
  slotHeight,
}: {
  event: (typeof bookings)[number];
  slotHeight: number;
}) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const slots =
    (end.getTime() - start.getTime()) / (30 * 60 * 1000);
  const height = slots * slotHeight - 4;

  return (
    <div
      className={`absolute inset-x-1 top-1 rounded-card-sm border-l-2 px-2.5 py-1.5 shadow-card hover:shadow-card-hover transition cursor-pointer ${colorByStatus(
        event.paymentStatus,
      )}`}
      style={{ height }}
    >
      <p className="text-[11px] font-bold text-ink-1 tracking-tight truncate">
        {event.customerName}
      </p>
      <p className="text-[10px] text-ink-3 tabular-nums">
        {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
      </p>
      {event.flags?.includes("overdue") && (
        <span className="absolute top-1.5 right-1.5 dot dot-danger" />
      )}
      {event.flags?.includes("vip") && (
        <Badge tone="primary" className="!text-[9px] !px-1.5 mt-1">
          VIP
        </Badge>
      )}
    </div>
  );
}
