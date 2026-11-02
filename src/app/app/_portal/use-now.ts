"use client";

import { useEffect, useState } from "react";

/**
 * Current time that ticks. Starts from the server's clock so the first render
 * matches what the server drew (no hydration mismatch), then follows the
 * browser's clock offset by the same difference.
 */
export function useNow(serverNow: string, everyMs = 1000): number {
  const [offset] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    tick();
    const id = setInterval(tick, everyMs);
    return () => clearInterval(id);
  }, [offset, everyMs]);
  return now;
}

export function durationText(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} นาที`;
  if (m === 0) return `${h} ชม.`;
  return `${h} ชม. ${m} นาที`;
}

export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function hoursText(h: number): string {
  return durationText(h * 3_600_000);
}
