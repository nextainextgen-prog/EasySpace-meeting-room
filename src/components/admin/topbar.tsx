"use client";

import { Bell, Search, Settings, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function AdminTopbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-line sticky top-0 z-20">
      <div className="h-16 px-6 lg:px-8 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-base md:text-lg font-bold tracking-tight text-ink-1 truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-ink-3 truncate">{subtitle}</p>
          )}
        </div>

        <div className="hidden md:block w-72">
          <Input
            placeholder="ค้นหา booking, ลูกค้า, ใบเสร็จ..."
            iconLeft={<Search size={16} strokeWidth={1.75} />}
            className="h-10"
          />
        </div>

        <div className="flex items-center gap-2">
          {actions}
          <button className="relative w-10 h-10 rounded-pill bg-surface-subtle text-ink-2 hover:bg-line grid place-items-center transition">
            <Bell size={18} strokeWidth={1.75} />
            <span className="absolute top-2 right-2 dot dot-danger" />
          </button>
          <button className="w-10 h-10 rounded-pill bg-surface-subtle text-ink-2 hover:bg-line grid place-items-center transition">
            <Settings size={18} strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-2 pl-2 ml-1 border-l border-line">
            <div className="w-9 h-9 rounded-pill bg-primary-600 text-white grid place-items-center font-semibold text-sm">
              <User size={16} strokeWidth={2} />
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-semibold text-ink-1 tracking-tight">
                Admin
              </p>
              <Badge tone="primary" className="text-[10px] py-0.5">
                Super Admin
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
