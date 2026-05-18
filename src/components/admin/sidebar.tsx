"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { navIcons } from "@/lib/icons";
import type { Role } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof navIcons;
  indent?: boolean;
  minRole?: Role;
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
        minRole: "marketing",
      },
    ],
  },
  {
    label: "การเงิน",
    items: [
      {
        href: "/admin/finance",
        label: "การเงิน",
        icon: "finance",
        minRole: "accountant",
      },
      {
        href: "/admin/promotions",
        label: "โปรโมชั่น",
        icon: "promotions",
        minRole: "marketing",
      },
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
      {
        href: "/admin/users",
        label: "ผู้ใช้งาน",
        icon: "users",
        minRole: "admin",
      },
      {
        href: "/admin/audit-log",
        label: "บันทึกการใช้งาน",
        icon: "audit",
        minRole: "admin",
      },
      {
        href: "/admin/settings",
        label: "ตั้งค่าระบบ",
        icon: "settings",
        minRole: "admin",
      },
      {
        href: "/admin/account",
        label: "บัญชีของฉัน",
        icon: "account",
      },
    ],
  },
];

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  marketing: 1,
  accountant: 2,
  staff: 3,
  admin: 4,
  super_admin: 5,
  owner: 6,
};

const ROLE_LABEL: Record<Role, string> = {
  viewer: "ผู้ดู",
  marketing: "การตลาด",
  accountant: "บัญชี",
  staff: "พนักงาน",
  admin: "แอดมิน",
  super_admin: "Super Admin",
  owner: "เจ้าของระบบ",
};

interface SidebarProfile {
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
}

export function AdminSidebar({ profile }: { profile: SidebarProfile }) {
  const pathname = usePathname();
  const userRank = ROLE_RANK[profile.role];

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
        {sections.map((section) => {
          const items = section.items.filter(
            (item) =>
              !item.minRole || ROLE_RANK[item.minRole] <= userRank,
          );
          if (items.length === 0) return null;
          return (
            <div key={section.label}>
              <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
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
          );
        })}
      </nav>

      <div className="p-3 border-t border-line space-y-2">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 grid place-items-center font-semibold text-sm tracking-tight overflow-hidden">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              profile.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-1 truncate tracking-tight">
              {profile.name}
            </p>
            <p className="text-[11px] text-ink-3 truncate">
              {ROLE_LABEL[profile.role]}
            </p>
          </div>
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-input text-[13px] text-ink-2 hover:bg-surface-subtle hover:text-red-700 transition"
          >
            <LogOut size={15} strokeWidth={1.75} />
            <span className="tracking-tight">ออกจากระบบ</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
