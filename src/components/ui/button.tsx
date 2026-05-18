import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "gradient" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-card",
  gradient:
    "bg-primary-gradient text-white hover:opacity-95 active:opacity-90 shadow-hero",
  secondary:
    "bg-white text-ink-1 border border-line hover:bg-surface-subtle",
  ghost: "text-ink-2 hover:bg-surface-subtle",
  danger: "bg-red-50 text-red-700 hover:bg-red-100",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-9 px-4 text-sm gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      iconLeft,
      iconRight,
      children,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-pill",
        "transition-all duration-200 ease-out",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
        "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  ),
);
Button.displayName = "Button";
