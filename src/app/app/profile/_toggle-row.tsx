"use client";

import { useState } from "react";

export function ToggleRow({
  label,
  description,
  defaultOn = false,
  disabled = false,
}: {
  label: string;
  description: string;
  defaultOn?: boolean;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  const active = on && !disabled;

  return (
    <li className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium tracking-tight">{label}</p>
        <p className="text-[11px] text-ink-3 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && setOn((v) => !v)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors ${
          disabled
            ? "bg-line cursor-not-allowed"
            : active
              ? "bg-primary-600"
              : "bg-line"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-pill bg-white shadow transition-transform ${
            active ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </li>
  );
}
