"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Ticket } from "lucide-react";
import { bkkDate, bkkTime } from "@/lib/time/bkk";
import { thaiDateShort } from "@/lib/public-booking/shared";

/**
 * Bookings made on this device, so a returning customer can find theirs
 * without an account. Purely a convenience: the source of truth is the
 * server, reached through each booking's private link.
 */

const KEY = "easyspace.public.bookings.v1";

export interface SavedBooking {
  reference: string;
  token: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
}

export function readSavedBookings(): SavedBooking[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedBooking[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveBooking(b: SavedBooking) {
  try {
    const list = readSavedBookings().filter((x) => x.reference !== b.reference);
    list.unshift(b);
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    // storage blocked (private mode / LINE webview settings) — not critical
  }
}

export function forgetBooking(reference: string) {
  try {
    const list = readSavedBookings().filter((x) => x.reference !== reference);
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — fine
  }
}

export function MyBookingsStrip({ channel }: { channel: string }) {
  const [items, setItems] = useState<SavedBooking[]>([]);

  useEffect(() => {
    const now = Date.now();
    setItems(readSavedBookings().filter((b) => new Date(b.endsAt).getTime() > now));
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <p className="mb-2.5 text-[12px] font-semibold tracking-tight text-ink-3">
        การจองของคุณ
      </p>
      <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
        {items.map((b) => (
          <Link
            key={b.reference}
            href={`/rooms/booking/${b.reference}?t=${b.token}&src=${channel}`}
            className="group flex min-w-[240px] snap-start items-center gap-3 rounded-card-sm border border-slate-900/[0.07] bg-white px-3.5 py-3 shadow-card transition hover:border-primary-600/30"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-primary-50 text-primary-600">
              <Ticket size={18} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold tracking-tight">
                {b.roomName}
              </span>
              <span className="block text-[12px] tabular-nums text-ink-2">
                {thaiDateShort(bkkDate(b.startsAt))} · {bkkTime(b.startsAt)}–{bkkTime(b.endsAt)}
              </span>
            </span>
            <ArrowUpRight
              size={16}
              strokeWidth={1.75}
              className="shrink-0 text-ink-3 transition group-hover:text-primary-600"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
