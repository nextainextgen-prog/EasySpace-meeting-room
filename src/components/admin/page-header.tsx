import * as React from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-end gap-4 md:gap-6 mb-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl md:text-[28px] font-bold tracking-tighter text-primary-600">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm text-ink-3">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
