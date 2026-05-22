"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";

const ICONS = {
  call: Phone,
  email: Mail,
  line: MessageCircle,
} as const;

type IconKind = keyof typeof ICONS;

export function ActionIcon({
  href,
  tip,
  kind,
  external,
}: {
  href?: string;
  tip: string;
  kind: IconKind;
  external?: boolean;
}) {
  const Icon = ICONS[kind];
  if (!href) {
    return (
      <span
        title={`${tip} (no data)`}
        className="w-7 h-7 rounded-pill text-ink-3 opacity-40 grid place-items-center"
      >
        <Icon size={13} strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <a
      title={tip}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      onClick={(e) => e.stopPropagation()}
      className="w-7 h-7 rounded-pill text-ink-3 hover:bg-primary-50 hover:text-primary-600 grid place-items-center transition"
    >
      <Icon size={13} strokeWidth={1.75} />
    </a>
  );
}
