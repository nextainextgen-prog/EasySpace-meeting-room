import { resolveBank } from "@/lib/banks";
import { cn } from "@/lib/cn";

/**
 * Round bank logo. Unknown banks get a quiet monogram instead of a broken
 * image, so free-text rows never look wrong. Server- and client-safe.
 */
export function BankLogo({
  bank,
  size = 36,
  className,
}: {
  bank: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const b = resolveBank(bank);
  if (b) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={b.logo}
        alt={b.nameLong}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = (bank ?? "").trim().slice(0, 2).toUpperCase() || "–";
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-slate-100 font-semibold text-ink-2",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.32) }}
    >
      {initials}
    </span>
  );
}

/** Display name for any bank spelling, falling back to what was stored. */
export function bankDisplayName(bank: string | null | undefined): string {
  return resolveBank(bank)?.nameLong ?? bank ?? "";
}
