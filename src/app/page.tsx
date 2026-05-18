import Link from "next/link";
import {
  Calendar,
  CalendarPlus,
  Users,
  Settings,
  LayoutDashboard,
  Bell,
  Wallet,
  Tag,
  UserCog,
  ArrowRight,
  Building2,
} from "lucide-react";

const pages = [
  {
    href: "/admin/dashboard",
    title: "Dashboard",
    desc: "ภาพรวม KPI · AI Daily Brief · Today's Schedule",
    icon: LayoutDashboard,
    badge: "หน้าหลัก",
  },
  {
    href: "/admin/calendar",
    title: "ปฏิทินการจอง",
    desc: "ดูภาพรวมทั้งหมด · drag & drop · payment manager",
    icon: Calendar,
  },
  {
    href: "/admin/bookings",
    title: "ลงข้อมูลการจอง",
    desc: "Form 40% + ปฏิทิน 60% พร้อม AI ช่วยตัดสินใจ",
    icon: CalendarPlus,
  },
  {
    href: "/admin/customers",
    title: "ข้อมูลลูกค้า",
    desc: "CRM 360° · Activity timeline · Tag system",
    icon: Users,
  },
  {
    href: "/admin/finance",
    title: "การเงิน",
    desc: "รายรับ รายจ่าย ค้างชำระ ภาษี",
    icon: Wallet,
  },
  {
    href: "/admin/promotions",
    title: "โปรโมชั่น",
    desc: "สร้างโปร · Coupon · Auto-apply",
    icon: Tag,
  },
  {
    href: "/admin/notifications",
    title: "การแจ้งเตือน",
    desc: "Telegram (topics) · Email · in-app feed",
    icon: Bell,
  },
  {
    href: "/admin/users",
    title: "ผู้ใช้งาน",
    desc: "Admin users · องค์กรในตึก · Invite link",
    icon: UserCog,
  },
  {
    href: "/admin/settings",
    title: "ตั้งค่าระบบ",
    desc: "ห้อง · ราคา · เวลา · Telegram · ภาษี · นโยบาย",
    icon: Settings,
  },
];

const memberLinks = [
  {
    href: "/app",
    title: "Internal Booking Portal",
    desc: "ฝั่งผู้ใช้ในตึก — จองด้วยตนเอง · ดู my bookings · Team",
    icon: Building2,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-6xl">
        <header className="text-center mb-14">
          <div className="inline-flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-card-sm bg-primary-600 text-white grid place-items-center shadow-hero">
              <Calendar className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <span className="text-3xl font-bold tracking-tight text-primary-600">
              EasySpace
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tighter text-ink-1 mb-2">
            ระบบจัดการและจองห้องประชุม
          </h1>
          <p className="text-ink-3">
            เลือกหน้าที่ต้องการเข้าใช้งาน · Phase 1 MVP build
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3 mb-4">
            หลังบ้าน Admin
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {pages.map((p) => {
              const Icon = p.icon;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  className="group surface-card p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-input bg-primary-50 text-primary-600 grid place-items-center">
                      <Icon className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    {p.badge && (
                      <span className="pill-info text-[11px] font-medium px-2.5 py-1 rounded-pill">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold tracking-tight text-ink-1 mb-1">
                    {p.title}
                  </h3>
                  <p className="text-sm text-ink-3 mb-3">{p.desc}</p>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-primary-600 opacity-0 group-hover:opacity-100 transition">
                    เข้าสู่หน้านี้
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3 mb-4">
            ฝั่งผู้ใช้ในตึก
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {memberLinks.map((p) => {
              const Icon = p.icon;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  className="group surface-card p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-input bg-primary-50 text-primary-600 grid place-items-center mb-4">
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="font-semibold tracking-tight text-ink-1 mb-1">
                    {p.title}
                  </h3>
                  <p className="text-sm text-ink-3">{p.desc}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="mt-16 text-center text-xs text-ink-3">
          EasySpace · Phase 1 build · ใช้ข้อมูล mock จนกว่าจะเชื่อม Supabase
        </footer>
      </div>
    </div>
  );
}
