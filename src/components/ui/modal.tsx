"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type Size = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

const sizeClass: Record<Size, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-xl",
  xl: "max-w-2xl",
  "2xl": "max-w-3xl",
  "3xl": "max-w-4xl",
};

/**
 * Modal — universal popup shell.
 * - Caps height at 90vh so it never overflows the viewport.
 * - Header / footer stay pinned; only the body scrolls.
 * - ESC closes; backdrop click closes (override with closeOnBackdrop=false).
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: Size;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  hideClose?: boolean;
  headerTone?: "default" | "primary";
  className?: string;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = "xl",
  footer,
  closeOnBackdrop = true,
  hideClose = false,
  headerTone = "primary",
  className,
  children,
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-1/40 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full bg-white rounded-card shadow-card-hover flex flex-col overflow-hidden",
          "max-h-[calc(100dvh-2rem)]",
          sizeClass[size],
          className,
        )}
      >
        {(title || subtitle) && (
          <div
            className={cn(
              "shrink-0 px-5 py-4 border-b border-line-soft flex items-start justify-between gap-3",
              headerTone === "primary" &&
                "bg-gradient-to-br from-primary-50 to-white",
            )}
          >
            <div className="min-w-0">
              {title && (
                <p className="font-bold tracking-tight text-base truncate">
                  {title}
                </p>
              )}
              {subtitle && (
                <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 w-8 h-8 grid place-items-center rounded-pill text-ink-3 hover:bg-surface-subtle hover:text-ink-1 transition"
                aria-label="ปิด"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="shrink-0 px-5 py-3 border-t border-line-soft bg-surface-subtle/40 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ModalBody — convenience wrapper to add consistent padding when children
 * aren't already padded.
 */
export function ModalBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("p-5 space-y-4", className)}>{children}</div>;
}
