"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Search,
  Settings,
  User,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = {
  viewer: "ผู้ดู",
  marketing: "การตลาด",
  accountant: "บัญชี",
  staff: "พนักงาน",
  admin: "แอดมิน",
  super_admin: "Super Admin",
  owner: "เจ้าของระบบ",
};

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  marketing: 1,
  accountant: 2,
  staff: 3,
  admin: 4,
  super_admin: 5,
  owner: 6,
};

interface TopbarProfile {
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
}

export function TopbarRight({
  profile,
  actions,
}: {
  profile: TopbarProfile | null;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/admin/customers?q=${encodeURIComponent(term)}`);
  }

  const canSeeSettings =
    profile && ROLE_RANK[profile.role] >= ROLE_RANK.admin;
  const initials = profile
    ? profile.name
        .split(/\s+/)
        .map((s) => s[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <>
      <form onSubmit={onSearch} className="hidden md:block w-72">
        <Input
          placeholder="ค้นหาลูกค้า ชื่อ / เบอร์ / Email..."
          iconLeft={<Search size={16} strokeWidth={1.75} />}
          className="h-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>

      <div className="flex items-center gap-2">
        {actions}

        <Link
          href="/admin/notifications"
          className="relative w-10 h-10 rounded-pill bg-surface-subtle text-ink-2 hover:bg-line grid place-items-center transition"
          aria-label="การแจ้งเตือน"
        >
          <Bell size={18} strokeWidth={1.75} />
          <span className="absolute top-2 right-2 dot dot-danger" />
        </Link>

        {canSeeSettings && (
          <Link
            href="/admin/settings"
            className="w-10 h-10 rounded-pill bg-surface-subtle text-ink-2 hover:bg-line grid place-items-center transition"
            aria-label="ตั้งค่า"
          >
            <Settings size={18} strokeWidth={1.75} />
          </Link>
        )}

        <div className="relative pl-2 ml-1 border-l border-line" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-pill hover:bg-surface-subtle pr-2 py-1 -my-1 transition"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="w-9 h-9 rounded-pill bg-primary-600 text-white grid place-items-center font-semibold text-sm overflow-hidden">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />
              ) : profile ? (
                initials
              ) : (
                <User size={16} strokeWidth={2} />
              )}
            </span>
            <span className="hidden lg:block text-left">
              <span className="block text-xs font-semibold text-ink-1 tracking-tight max-w-[140px] truncate">
                {profile?.name ?? "Guest"}
              </span>
              {profile && (
                <Badge tone="primary" className="text-[10px] py-0.5">
                  {ROLE_LABEL[profile.role]}
                </Badge>
              )}
            </span>
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              className={cn(
                "hidden lg:block text-ink-3 transition-transform",
                menuOpen && "rotate-180",
              )}
            />
          </button>

          {menuOpen && profile && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-card bg-white border border-line shadow-card overflow-hidden z-30"
            >
              <div className="px-4 py-3 border-b border-line-soft">
                <p className="text-sm font-semibold tracking-tight text-ink-1 truncate">
                  {profile.name}
                </p>
                <p className="text-[11px] text-ink-3 truncate">
                  {profile.email}
                </p>
                <Badge tone="primary" className="!text-[10px] mt-1.5">
                  {ROLE_LABEL[profile.role]}
                </Badge>
              </div>
              <Link
                href="/admin/account"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-subtle hover:text-ink-1 transition"
              >
                <User size={15} strokeWidth={1.75} />
                บัญชีของฉัน
              </Link>
              {canSeeSettings && (
                <Link
                  href="/admin/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-subtle hover:text-ink-1 transition"
                >
                  <Settings size={15} strokeWidth={1.75} />
                  ตั้งค่าระบบ
                </Link>
              )}
              <form action="/api/auth/logout" method="post" className="border-t border-line-soft">
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition text-left"
                >
                  <LogOut size={15} strokeWidth={1.75} />
                  ออกจากระบบ
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
