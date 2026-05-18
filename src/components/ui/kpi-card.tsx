import * as React from "react";
import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { IconTile } from "./icon-tile";

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  delta?: { value: number; suffix?: string };
  icon: LucideIcon;
  iconTone?: "primary" | "success" | "warning" | "danger" | "muted";
  hint?: string;
  className?: string;
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  delta,
  icon,
  iconTone = "primary",
  hint,
  className,
  onClick,
}: KpiCardProps) {
  const Trend = delta && delta.value >= 0 ? TrendingUp : TrendingDown;
  const trendClass =
    delta && delta.value >= 0 ? "text-emerald-600" : "text-red-600";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "surface-card p-5 text-left w-full",
        "transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5",
        className,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium">
          {label}
        </span>
        <IconTile icon={icon} tone={iconTone} size="sm" />
      </div>
      <div className="text-2xl md:text-[28px] font-bold tracking-tighter text-ink-1 tabular-nums">
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium",
            trendClass,
          )}
        >
          <Trend size={14} strokeWidth={2} />
          {Math.abs(delta.value).toFixed(0)}%
          {delta.suffix && (
            <span className="text-ink-3 font-normal ml-1">{delta.suffix}</span>
          )}
        </div>
      )}
      {hint && !delta && (
        <p className="mt-2 text-xs text-ink-3">{hint}</p>
      )}
    </button>
  );
}
