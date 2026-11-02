"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, LogOut, Send, Users } from "lucide-react";

interface ShellProfile {
  name: string;
  email: string;
  avatarUrl: string | null;
  orgName?: string | null;
  isManager?: boolean;
}

/**
 * The member portal is one page now, so the shell is only a header: brand,
 * company, and a small account menu. No tabs, no bottom bar.
 */
export function AppShell({ profile, children }: { profile: ShellProfile; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="bg-white/90 backdrop-blur border-b border-line sticky top-0 z-30">
        <div className="mx-auto max-w-[1240px] h-16 px-4 md:px-6 flex items-center gap-3">
          <Link href="/app" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-card-sm bg-primary-600 text-white grid place-items-center">
              <Building2 size={18} strokeWidth={2} />
            </span>
            <span className="font-bold tracking-tight text-ink-1 text-[15px]">EasySpace</span>
          </Link>
          {profile.orgName && (
            <span className="hidden sm:inline text-sm text-ink-3 truncate">· {profile.orgName}</span>
          )}
          <div className="flex-1" />
          <div className="relative" ref={menuRef} data-tour="account">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-pill hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100"
            >
              <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 grid place-items-center font-semibold text-xs overflow-hidden">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  profile.name.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="hidden md:block text-sm text-ink-1 tracking-tight max-w-[160px] truncate">{profile.name}</span>
              <ChevronDown size={14} className="text-ink-3" />
            </button>
            {open && (
              <div role="menu" className="absolute right-0 mt-2 w-64 rounded-card-sm bg-white border border-line shadow-pop p-1.5">
                <div className="px-3 py-2.5 border-b border-line-soft mb-1">
                  <p className="text-sm font-semibold text-ink-1 truncate">{profile.name}</p>
                  <p className="text-xs text-ink-3 truncate">{profile.email}</p>
                </div>
                <a
                  role="menuitem"
                  href="https://t.me/EasySpaceBookingBot"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-input text-sm text-ink-1 hover:bg-surface-subtle"
                >
                  <Send size={15} strokeWidth={1.75} className="text-ink-2" />
                  จองผ่าน Telegram
                </a>
                {profile.isManager && (
                  <Link role="menuitem" href="/org-admin" className="flex items-center gap-2.5 px-3 py-2 rounded-input text-sm text-ink-1 hover:bg-surface-subtle">
                    <Users size={15} strokeWidth={1.75} className="text-ink-2" />
                    จัดการสมาชิกบริษัท
                  </Link>
                )}
                <form action="/api/auth/logout?next=member" method="post">
                  <button
                    role="menuitem"
                    type="submit"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-input text-sm text-red-700 hover:bg-red-50"
                  >
                    <LogOut size={15} strokeWidth={1.75} />
                    ออกจากระบบ
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
