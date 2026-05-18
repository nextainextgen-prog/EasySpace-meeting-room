import * as React from "react";
import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "muted";

const toneClasses: Record<Tone, string> = {
  primary: "bg-primary-50 text-primary-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
  info: "bg-blue-50 text-blue-600",
  muted: "bg-surface-subtle text-ink-2",
};

export function IconTile({
  icon: Icon,
  tone = "primary",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizing =
    size === "sm"
      ? "w-8 h-8 rounded-input"
      : size === "lg"
        ? "w-12 h-12 rounded-card-sm"
        : "w-10 h-10 rounded-input";
  const iconSize = size === "sm" ? 16 : size === "lg" ? 22 : 18;

  return (
    <span
      className={cn(
        "grid place-items-center shrink-0",
        sizing,
        toneClasses[tone],
        className,
      )}
    >
      <Icon size={iconSize} strokeWidth={1.75} />
    </span>
  );
}
