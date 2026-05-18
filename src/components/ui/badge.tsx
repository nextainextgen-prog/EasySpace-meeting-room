import * as React from "react";
import { cn } from "@/lib/cn";

type Tone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted"
  | "primary";

const toneClasses: Record<Tone, string> = {
  success: "pill-success",
  warning: "pill-warning",
  danger: "pill-danger",
  info: "pill-info",
  muted: "pill-muted",
  primary: "bg-primary-50 text-primary-700",
};

export function Badge({
  tone = "muted",
  className,
  children,
  ...rest
}: { tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-medium",
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
