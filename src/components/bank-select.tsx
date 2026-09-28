"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Check, MagnifyingGlass } from "@phosphor-icons/react";
import { ACCOUNT_BANKS, resolveBank } from "@/lib/banks";
import { BankLogo } from "./bank-logo";
import { cn } from "@/lib/cn";

/**
 * Bank dropdown with logos. Emits the bank's full Thai name, which is what
 * `bank_accounts.bank_name` stores and every receipt prints.
 */
export function BankSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (bankNameLong: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const selected = resolveBank(value);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n
      ? ACCOUNT_BANKS.filter((b) =>
          [b.name, b.nameLong, b.nameEN, b.code, ...b.aliases].some((s) => s.toLowerCase().includes(n)),
        )
      : ACCOUNT_BANKS;
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(i: number) {
    const b = list[i];
    if (!b) return;
    onChange(b.nameLong);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={root} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2.5 rounded-input border border-line bg-white px-3 text-left text-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-600/20"
      >
        {selected ? (
          <>
            <BankLogo bank={selected.code} size={26} />
            <span className="flex-1 truncate font-medium text-ink-1">{selected.nameLong}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-ink-3">{value || "เลือกธนาคาร"}</span>
        )}
        <CaretDown size={16} weight="light" className="text-ink-3" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-input border border-line bg-white shadow-pop">
          <label className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
            <MagnifyingGlass size={16} weight="light" className="text-ink-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(list.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  pick(active);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="ค้นหาธนาคาร"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
            />
          </label>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {list.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">ไม่พบธนาคาร</li>}
            {list.map((b, i) => (
              <li
                key={b.code}
                role="option"
                aria-selected={selected?.code === b.code}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(i);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm",
                  i === active && "bg-surface-subtle",
                )}
              >
                <BankLogo bank={b.code} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-1">{b.nameLong}</span>
                  <span className="block text-[11px] text-ink-3">
                    {b.nameEN} · {b.code}
                  </span>
                </span>
                {selected?.code === b.code && <Check size={16} weight="bold" className="text-ink-1" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
