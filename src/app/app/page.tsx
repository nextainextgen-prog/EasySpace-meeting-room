import {
  Calendar,
  CalendarPlus,
  Clock,
  Users,
  Sparkles,
  Building2,
  Bell,
  User,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { KpiCard } from "@/components/ui/kpi-card";
import { HeroCard } from "@/components/ui/hero-card";

const upcoming = [
  {
    id: "b1",
    title: "Sprint Planning",
    when: "พรุ่งนี้ 10:00 – 12:00",
    room: "MASTER ROOM",
    attendees: 5,
    status: "confirmed",
  },
  {
    id: "b2",
    title: "Team Workshop",
    when: "ศุกร์ 14:00 – 16:00",
    room: "MEETING ROOM",
    attendees: 12,
    status: "pending",
  },
  {
    id: "b3",
    title: "1-on-1 with Manager",
    when: "จันทร์หน้า 09:00 – 10:00",
    room: "PRIME ROOM",
    attendees: 2,
    status: "confirmed",
  },
];

export default function MemberDashboard() {
  return (
    <div className="min-h-screen bg-surface-page">
      <header className="bg-white border-b border-line sticky top-0 z-20">
        <div className="max-w-6xl mx-auto h-16 px-6 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <Badge tone="primary" className="!text-[11px]">
              <Building2 size={12} className="mr-1" />
              บริษัท ABC จำกัด
            </Badge>
            <span className="font-bold tracking-tight">EasySpace</span>
          </div>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="text-ink-3">Quota:</span>
            <span className="font-semibold tabular-nums">12/40 ชม.</span>
            <div className="w-28 h-1.5 rounded-pill bg-surface-subtle overflow-hidden">
              <div
                className="h-full bg-primary-600"
                style={{ width: "30%" }}
              />
            </div>
          </div>
          <button className="w-10 h-10 rounded-pill bg-surface-subtle text-ink-2 hover:bg-line grid place-items-center transition">
            <Bell size={16} strokeWidth={1.75} />
          </button>
          <button className="w-10 h-10 rounded-pill bg-primary-600 text-white grid place-items-center font-semibold text-xs">
            <User size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tighter">
            สวัสดี คุณสมชาย
          </h1>
          <p className="text-ink-3">วันนี้คุณมีประชุม 2 รายการ</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Quota เดือนนี้" value="12/40 ชม." icon={Clock} />
          <KpiCard label="จองล่าสุด" value="พรุ่งนี้" icon={Calendar} />
          <KpiCard label="Streak" value="5 สัปดาห์" icon={Sparkles} />
          <KpiCard label="ทีม" value="28 คน" icon={Users} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <HeroCard
              eyebrow="Quick Book"
              value="3 คลิก"
              trailing="เลือก slot · ใส่หัวข้อ · ยืนยัน"
              cta={{ label: "จองห้องเลย", href: "/app/calendar" }}
            />
          </div>
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Upcoming Bookings</CardTitle>
                <CardSubtitle>{upcoming.length} รายการถัดไป</CardSubtitle>
              </div>
              <Button variant="ghost" size="sm" iconRight={<ChevronRight size={14} />}>
                ดูทั้งหมด
              </Button>
            </CardHeader>
            <ul className="space-y-3">
              {upcoming.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-4 p-3 rounded-card-sm surface-subtle"
                >
                  <span
                    className={`w-1 h-12 rounded-full ${
                      b.status === "confirmed"
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold tracking-tight">{b.title}</p>
                    <p className="text-xs text-ink-3 tabular-nums">
                      {b.when} · {b.room} · {b.attendees} attendees
                    </p>
                  </div>
                  <Badge
                    tone={b.status === "confirmed" ? "success" : "warning"}
                  >
                    {b.status === "confirmed" ? "ยืนยันแล้ว" : "Pending"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="!bg-primary-50/40 !border-primary-100">
          <div className="flex items-start gap-3">
            <IconTile icon={Sparkles} tone="primary" />
            <div className="flex-1">
              <p className="font-semibold tracking-tight text-primary-800">
                AI Suggestion
              </p>
              <p className="text-sm text-ink-2 mt-1">
                ทีมคุณมักประชุมวันพุธ 10:00 — ต้องการให้ตั้ง recurring booking ทุกพุธไหม?
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary">
                  Set up
                </Button>
                <Button size="sm" variant="ghost">
                  ปิด
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
