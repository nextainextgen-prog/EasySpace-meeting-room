"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/cn";
import { navIcons } from "@/lib/icons";

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof navIcons;
  indent?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "ภาพรวม",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/admin/calendar", label: "ปฏิทินการจอง", icon: "calendar" },
      { href: "/admin/bookings", label: "ลงข้อมูลการจอง", icon: "bookings" },
    ],
  },
  {
    label: "ลูกค้า",
    items: [
      { href: "/admin/customers", label: "ข้อมูลลูกค้า", icon: "customers" },
      {
        href: "/admin/customers/analytics",
        label: "วิเคราะห์ลูกค้า",
        icon: "analytics",
        indent: true,
      },
    ],
  },
  {
    label: "การเงิน",
    items: [
      { href: "/admin/finance", label: "การเงิน", icon: "finance" },
      { href: "/admin/promotions", label: "โปรโมชั่น", icon: "promotions" },
    ],
  },
  {
    label: "ระบบ",
    items: [
      {
        href: "/admin/notifications",
        label: "การแจ้งเตือน",
        icon: "notifications",
      },
      { href: "/admin/users", label: "ผู้ใช้งาน", icon: "users" },
      { href: "/admin/settings", label: "ตั้งค่าระบบ", icon: "settings" },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-white border-r border-line h-screen sticky top-0">
      <Link
        href="/"
        className="h-16 px-5 flex items-center gap-2.5 border-b border-line"
      >
        <span className="w-9 h-9 rounded-card-sm bg-primary-600 text-white grid place-items-center shadow-card">
          <Calendar size={18} strokeWidth={2} />
        </span>
        <span className="font-bold tracking-tight text-ink-1 text-[15px]">
          EasySpace
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6 scrollbar-thin">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = navIcons[item.icon];
                const isActive =
                  item.href === "/admin/customers"
                    ? pathname === "/admin/customers" ||
                      (pathname?.startsWith("/admin/customers/") &&
                        !pathname?.startsWith("/admin/customers/analytics"))
                    : pathname === item.href ||
                      pathname?.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-input text-sm transition-all duration-200",
                      item.indent && "ml-3",
                      isActive
                        ? "bg-primary-50 text-primary-700 font-medium"
                        : "text-ink-2 hover:bg-surface-subtle hover:text-ink-1",
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-primary-600" />
                    )}
                    <Icon size={18} strokeWidth={1.75} />
                    <span className="tracking-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-line">
        <div className="rounded-input bg-surface-subtle p-3 text-xs text-ink-3">
          <p className="font-medium text-ink-2 mb-1 tracking-tight">
            EasySpace v0.1 · Phase 1
          </p>
          <p>ข้อมูลเป็น mock จนกว่าจะเชื่อม Supabase</p>
        </div>
      </div>
    </aside>
  );
}
