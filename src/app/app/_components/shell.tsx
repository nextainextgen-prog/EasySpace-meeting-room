"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Home,
  CalendarPlus,
  Bell,
  User,
  LogOut,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface ShellProfile {
  name: string;
  email: string;
  avatarUrl: string | null;
}

const tabs = [
  { href: "/app", label: "หน้าหลัก", icon: Home },
  { href: "/app/calendar", label: "จองห้อง", icon: CalendarPlus },
  { href: "/app/my-bookings", label: "การจองของฉัน", icon: Calendar },
  { href: "/app/notifications", label: "แจ้งเตือน", icon: Bell },
  { href: "/app/profile", label: "โปรไฟล์", icon: User },
];

export function AppShell({
  profile,
  children,
}: {
  profile: ShellProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-surface-page pb-20 md:pb-0">
      <header className="bg-white border-b border-line sticky top-0 z-30">
        <div className="h-16 px-4 md:px-6 lg:px-8 flex items-center gap-4">
          <Link href="/app" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-card-sm bg-primary-600 text-white grid place-items-center shadow-card">
              <Building2 size={18} strokeWidth={2} />
            </span>
            <span className="font-bold tracking-tight text-ink-1 text-[15px]">
              EasySpace
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 ml-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active =
                pathname === tab.href ||
                (tab.href !== "/app" && pathname?.startsWith(tab.href));
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "px-3 py-2 rounded-input text-sm tracking-tight transition flex items-center gap-2",
                    active
                      ? "bg-primary-50 text-primary-700 font-medium"
                      : "text-ink-2 hover:bg-surface-subtle hover:text-ink-1",
                  )}
                >
                  <Icon size={15} strokeWidth={1.75} />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2.5 px-2.5 py-1.5 rounded-pill bg-surface-subtle">
              <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 grid place-items-center font-semibold text-xs overflow-hidden">
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
              <span className="text-xs text-ink-2 tracking-tight max-w-[140px] truncate">
                {profile.name}
              </span>
            </div>
            <form action="/api/auth/logout?next=member" method="post">
              <button
                type="submit"
                className="w-10 h-10 rounded-pill bg-surface-subtle text-ink-2 hover:bg-line grid place-items-center transition"
                aria-label="ออกจากระบบ"
              >
                <LogOut size={16} strokeWidth={1.75} />
              </button>
            </form>
          </div>
        </div>
      </header>

      {children}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-line z-40">
        <div className="grid grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active =
              pathname === tab.href ||
              (tab.href !== "/app" && pathname?.startsWith(tab.href));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "h-16 flex flex-col items-center justify-center gap-1 transition",
                  active ? "text-primary-700" : "text-ink-3",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2 : 1.75} />
                <span className="text-[10px] tracking-tight">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
