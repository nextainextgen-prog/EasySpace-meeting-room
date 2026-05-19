"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Star, Settings as SettingsIcon, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { SETTINGS_GROUPS, ALL_SETTINGS, type SettingItem } from "./_nav";

const PIN_KEY = "easyspace.settings.pins.v1";

export function SettingsShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [pins, setPins] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (raw) setPins(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function togglePin(href: string) {
    setPins((prev) => {
      const next = prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href];
      try {
        localStorage.setItem(PIN_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return ALL_SETTINGS.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.desc.toLowerCase().includes(q) ||
        i.href.toLowerCase().includes(q),
    );
  }, [search]);

  const pinned: SettingItem[] = pins
    .map((h) => ALL_SETTINGS.find((i) => i.href === h))
    .filter(Boolean) as SettingItem[];

  const currentGroup = SETTINGS_GROUPS.find((g) =>
    g.items.some((i) => i.href === pathname),
  );
  const currentItem = ALL_SETTINGS.find((i) => i.href === pathname);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto scrollbar-thin pr-1">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
          />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา settings (⌘K)"
            className="!h-9 !pl-9 !text-sm"
          />
        </div>

        {filtered !== null ? (
          <SidebarSection title={`ผลค้นหา (${filtered.length})`}>
            {filtered.map((i) => (
              <SidebarLink
                key={i.href}
                item={i}
                active={pathname === i.href}
                pinned={pins.includes(i.href)}
                onTogglePin={() => togglePin(i.href)}
              />
            ))}
          </SidebarSection>
        ) : (
          <>
            {pinned.length > 0 && (
              <SidebarSection title="ปักหมุด">
                {pinned.map((i) => (
                  <SidebarLink
                    key={i.href}
                    item={i}
                    active={pathname === i.href}
                    pinned={true}
                    onTogglePin={() => togglePin(i.href)}
                  />
                ))}
              </SidebarSection>
            )}

            {SETTINGS_GROUPS.map((g) => (
              <SidebarSection key={g.label} title={g.label}>
                {g.items.map((i) => (
                  <SidebarLink
                    key={i.href}
                    item={i}
                    active={pathname === i.href}
                    pinned={pins.includes(i.href)}
                    onTogglePin={() => togglePin(i.href)}
                  />
                ))}
              </SidebarSection>
            ))}
          </>
        )}
      </aside>

      <main className="space-y-5 min-w-0">
        <nav className="flex items-center gap-1 text-[11px] text-ink-3">
          <Link
            href="/admin/settings"
            className="hover:text-ink-1 inline-flex items-center gap-1"
          >
            <SettingsIcon size={11} />
            ตั้งค่าระบบ
          </Link>
          {currentGroup && (
            <>
              <ChevronRight size={11} />
              <span>{currentGroup.label}</span>
            </>
          )}
          {currentItem && (
            <>
              <ChevronRight size={11} />
              <span className="text-ink-1 font-medium">{currentItem.title}</span>
            </>
          )}
        </nav>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm text-ink-3 mt-1">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>

        {children}
      </main>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-1.5 px-1">
        {title}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  pinned,
  onTogglePin,
}: {
  item: SettingItem;
  active: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const Icon = item.icon;
  return (
    <li className="relative group">
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-input text-sm transition pr-7",
          active
            ? "bg-primary-50 text-primary-700 font-medium"
            : "text-ink-2 hover:bg-surface-subtle hover:text-ink-1",
        )}
      >
        <Icon size={13} className="shrink-0" />
        <span className="truncate">{item.title}</span>
      </Link>
      <button
        type="button"
        onClick={onTogglePin}
        title={pinned ? "ยกเลิกปักหมุด" : "ปักหมุด"}
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-pill grid place-items-center transition",
          pinned
            ? "text-amber-500 opacity-100"
            : "text-ink-3 opacity-0 group-hover:opacity-100 hover:text-amber-500",
        )}
      >
        <Star size={11} fill={pinned ? "currentColor" : "none"} />
      </button>
    </li>
  );
}
