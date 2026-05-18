import * as React from "react";
import { cn } from "@/lib/cn";

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-end justify-between gap-4 mb-5", className)}
    >
      <div>
        {eyebrow && (
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-semibold mb-1">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-bold tracking-tighter text-ink-1">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-ink-3 mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
