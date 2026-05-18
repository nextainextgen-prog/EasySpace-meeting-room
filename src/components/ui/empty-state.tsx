import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconTile } from "./icon-tile";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-card p-10 flex flex-col items-center text-center",
        className,
      )}
    >
      <IconTile icon={icon} size="lg" tone="muted" />
      <h3 className="mt-4 text-base font-semibold tracking-tight text-ink-1">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 text-sm text-ink-3 max-w-md">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
