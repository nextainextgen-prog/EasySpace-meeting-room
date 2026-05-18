import * as React from "react";
import { cn } from "@/lib/cn";
import { ArrowRight } from "lucide-react";

export interface HeroCardProps {
  eyebrow: string;
  value: React.ReactNode;
  trailing?: React.ReactNode;
  cta?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}

export function HeroCard({
  eyebrow,
  value,
  trailing,
  cta,
  className,
}: HeroCardProps) {
  return (
    <div
      className={cn(
        "surface-hero p-7 md:p-8 relative overflow-hidden",
        className,
      )}
    >
      {/* Decorative blobs */}
      <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-8 w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />

      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.1em] text-white/70 font-medium mb-2">
          {eyebrow}
        </p>
        <div className="text-3xl md:text-5xl font-bold tracking-tighter tabular-nums leading-none">
          {value}
        </div>
        {trailing && (
          <div className="mt-3 text-sm text-white/80">{trailing}</div>
        )}
        {cta && (
          <div className="mt-6">
            <a
              href={cta.href}
              onClick={cta.onClick}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill px-4 py-2",
                "bg-white/15 text-white text-sm font-medium",
                "hover:bg-white/25 transition-all duration-200 backdrop-blur",
              )}
            >
              {cta.label}
              <ArrowRight size={14} strokeWidth={2} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
