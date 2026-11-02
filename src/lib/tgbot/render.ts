/**
 * Pictures the booking bot sends: the week (or one day) laid out per room like
 * the calendar on the web, and the summary card after a booking.
 *
 * Drawn as SVG and rasterised with resvg, which shapes text with HarfBuzz —
 * Thai vowels and tone marks stack correctly, which satori (next/og) does not
 * do. Fonts ship in src/assets/fonts (IBM Plex Sans Thai, OFL).
 */

import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { bkkDate, bkkTime, fromBkk, timeToMinutes } from "@/lib/time/bkk";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const FONTS = ["Regular", "Medium", "SemiBold", "Bold"].map((w) =>
  path.join(FONT_DIR, `IBMPlexSansThai-${w}.ttf`),
);
const FAMILY = "IBM Plex Sans Thai";

const C = {
  page: "#F5F7FA",
  card: "#FFFFFF",
  ink1: "#0F172A",
  ink2: "#475569",
  ink3: "#94A3B8",
  line: "#E8ECF2",
  lineSoft: "#F1F4F8",
  primary: "#2D4EF5",
  primarySoft: "#EEF2FF",
  busy: "#CBD5E1",
  busyInk: "#334155",
  now: "#EF4444",
  highlight: "#F97316",
  past: "#F8FAFC",
};

function png(svg: string, width: number): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: FAMILY },
    background: C.page,
  });
  return r.render().asPng();
}

/**
 * resvg advances SARA AM (ำ) as if it were a mark, so the next letter lands on
 * top of it. Spelling it out as NIKHAHIT + SARA AA (with any tone mark kept
 * between them, as Thai orders it) renders identically and spaces correctly.
 */
function thaiSafe(s: string) {
  return s.replace(/([\u0E48-\u0E4B]?)\u0E33/g, "\u0E4D$1\u0E32");
}

function esc(s: string) {
  return thaiSafe(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Thai combining marks take no width of their own. */
const MARKS = /[ัิ-ฺ็-๎]/;

function fit(text: string, maxPx: number, fontPx: number): string {
  const per = fontPx * 0.56;
  let w = 0;
  let out = "";
  for (const ch of text) {
    const cw = MARKS.test(ch) ? 0 : /[A-Z0-9]/.test(ch) ? per * 1.1 : per;
    if (w + cw > maxPx - per) return out.trimEnd() + "…";
    w += cw;
    out += ch;
  }
  return out;
}

function t(
  x: number,
  y: number,
  text: string,
  o: { size?: number; weight?: number; fill?: string; anchor?: "start" | "middle" | "end" } = {},
) {
  return `<text x="${x}" y="${y}" font-family="${FAMILY}" font-size="${o.size ?? 20}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? C.ink1}" text-anchor="${o.anchor ?? "start"}">${esc(text)}</text>`;
}

// ─── Schedule ──────────────────────────────────────────────────────────────

export interface ScheduleDay {
  date: string;
  label: string;
  sub: string;
}

export interface ScheduleRoom {
  id: string;
  name: string;
  color: string;
  short: string;
  capacity?: string;
  photo?: { data: Buffer; type: string } | null;
}

export interface ScheduleBlock {
  roomId: string;
  startsAt: string;
  endsAt: string;
  mine: boolean;
  label: string;
  /** The booking a notice is about: drawn in orange so it stands out. */
  highlight?: boolean;
}

export function renderSchedule(input: {
  title: string;
  subtitle: string;
  days: ScheduleDay[];
  rooms: ScheduleRoom[];
  blocks: ScheduleBlock[];
  open: string;
  close: string;
  now?: Date;
  /** Legend text for highlighted blocks. */
  highlightLegend?: string;
}): Buffer {
  const W = 1280;
  const single = input.days.length === 1;
  const pad = 32;
  const gutter = 64;
  const n = input.rooms.length;
  // Week: a row of room cards (photo, number, name) explains the numbered
  // columns under every day. Day: each column is a room, headed by its photo.
  const cardsTop = 128;
  const cardH = 112;
  const headH = single ? 128 : cardsTop + cardH + 24;
  const dayHeadH = single ? 176 : 92;
  const startMin = Math.floor(timeToMinutes(input.open) / 60) * 60;
  const endMin = Math.ceil(timeToMinutes(input.close) / 60) * 60;
  const hours = (endMin - startMin) / 60;
  const hourH = single ? 58 : 50;
  const gridTop = headH + dayHeadH;
  const gridH = hours * hourH;
  const H = gridTop + gridH + 64;
  const gridW = W - pad * 2 - gutter;
  const dayW = gridW / input.days.length;
  const laneGap = single ? 10 : 3;
  const laneW = (dayW - (single ? 16 : 10) - laneGap * (n - 1)) / n;
  const now = input.now ?? new Date();
  const today = bkkDate(now);
  const y = (min: number) => gridTop + ((min - startMin) / 60) * hourH;

  const parts: string[] = [];
  const defs: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${C.page}"/>`);
  parts.push(`<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="28" fill="${C.card}"/>`);
  parts.push(t(pad + 16, 70, input.title, { size: 34, weight: 700, fill: C.primary }));
  parts.push(t(pad + 16, 106, input.subtitle, { size: 21, fill: C.ink2 }));

  // Fill legend, top right.
  let lx = W - pad - 16;
  for (const it of [
    { label: "ไม่ว่าง", color: C.busy },
    { label: "ของคุณ", color: C.primary },
    ...(input.blocks.some((b) => b.highlight) ? [{ label: input.highlightLegend ?? "จองใหม่", color: C.highlight }] : []),
  ]) {
    lx -= it.label.length * 13 + 40;
    parts.push(`<rect x="${lx}" y="52" width="20" height="20" rx="6" fill="${it.color}"/>`);
    parts.push(t(lx + 28, 68, it.label, { size: 18, fill: C.ink2 }));
  }

  const badge = (cx: number, cy: number, r: number, color: string, num: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>` +
    t(cx, cy + r * 0.42, String(num), { size: Math.round(r * 1.15), weight: 700, fill: "#FFFFFF", anchor: "middle" });

  const photo = (id: string, x: number, yy: number, w: number, h: number, r: ScheduleRoom, radius: number) => {
    defs.push(`<clipPath id="${id}"><rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="${radius}"/></clipPath>`);
    if (r.photo) {
      return `<image x="${x}" y="${yy}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" href="data:${r.photo.type};base64,${r.photo.data.toString("base64")}"/>`;
    }
    return `<rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="${radius}" fill="${r.color}" opacity="0.16"/>` +
      t(x + w / 2, yy + h / 2 + 14, r.name.slice(0, 1), { size: 40, weight: 700, fill: r.color, anchor: "middle" });
  };

  if (!single) {
    const gap = 16;
    const cardW = (W - pad * 2 - 32 - gap * (n - 1)) / n;
    input.rooms.forEach((r, i) => {
      const x = pad + 16 + i * (cardW + gap);
      parts.push(`<rect x="${x}" y="${cardsTop}" width="${cardW}" height="${cardH}" rx="18" fill="${C.page}"/>`);
      const pw = Math.min(124, cardW * 0.34);
      parts.push(photo(`rc${i}`, x + 8, cardsTop + 8, pw, cardH - 16, r, 12));
      const tx = x + 8 + pw + 16;
      const tw = cardW - pw - 40;
      parts.push(badge(tx + 15, cardsTop + 34, 15, r.color, i + 1));
      parts.push(t(tx + 40, cardsTop + 42, fit(r.name, tw - 20, 20), { size: 20, weight: 700 }));
      if (r.capacity) parts.push(t(tx, cardsTop + 74, r.capacity, { size: 17, fill: C.ink2 }));
      parts.push(t(tx, cardsTop + 98, fit(`ช่องที่ ${i + 1} ของทุกวัน`, tw, 15), { size: 15, fill: C.ink3 }));
    });
  }

  // Hour lines and labels.
  for (let i = 0; i <= hours; i++) {
    const yy = gridTop + i * hourH;
    parts.push(`<line x1="${pad + gutter}" y1="${yy}" x2="${W - pad}" y2="${yy}" stroke="${C.lineSoft}" stroke-width="1.5"/>`);
    if (i < hours) {
      const label = `${String((startMin / 60 + i) % 24).padStart(2, "0")}:00`;
      parts.push(t(pad + gutter - 12, yy + 18, label, { size: 16, fill: C.ink3, anchor: "end" }));
    }
  }

  input.days.forEach((d, di) => {
    const x0 = pad + gutter + di * dayW;
    const isToday = d.date === today;
    const isPast = d.date < today;
    // One day: the subtitle already names it, and the columns are rooms.
    if (!single) {
      if (isToday) {
        parts.push(`<rect x="${x0 + 3}" y="${headH - 4}" width="${dayW - 6}" height="${dayHeadH + gridH + 8}" rx="16" fill="${C.primarySoft}" opacity="0.55"/>`);
      }
      parts.push(t(x0 + dayW / 2, headH + 28, d.label, {
        size: 21,
        weight: 700,
        fill: isToday ? C.primary : isPast ? C.ink3 : C.ink1,
        anchor: "middle",
      }));
      parts.push(t(x0 + dayW / 2, headH + 50, d.sub, {
        size: 16,
        fill: isToday ? C.primary : C.ink3,
        anchor: "middle",
      }));
    }
    if (di > 0) {
      parts.push(`<line x1="${x0}" y1="${headH}" x2="${x0}" y2="${gridTop + gridH}" stroke="${C.line}" stroke-width="1.5"/>`);
    }

    input.rooms.forEach((r, ri) => {
      const lx0 = x0 + (single ? 8 : 5) + ri * (laneW + laneGap);
      // Lane head: the room's number (week) or its photo and name (day).
      parts.push(`<rect x="${lx0}" y="${gridTop - (single ? 12 : 8)}" width="${laneW}" height="${single ? 6 : 5}" rx="3" fill="${r.color}"/>`);
      if (single) {
        parts.push(photo(`dc${ri}`, lx0, headH + 4, laneW, 112, r, 14));
        parts.push(badge(lx0 + 22, headH + 140, 13, r.color, ri + 1));
        parts.push(t(lx0 + 44, headH + 147, fit(r.name, laneW - 50, 19), { size: 19, weight: 700 }));
        if (r.capacity) parts.push(t(lx0 + laneW, headH + 147, r.capacity, { size: 16, fill: C.ink3, anchor: "end" }));
      } else {
        parts.push(badge(lx0 + laneW / 2, gridTop - 24, 10, r.color, ri + 1));
      }
      const blocks = input.blocks.filter(
        (b) => b.roomId === r.id && bkkDate(b.startsAt) <= d.date && bkkDate(new Date(Date.parse(b.endsAt) - 1)) >= d.date,
      );
      for (const b of blocks) {
        const sMin = bkkDate(b.startsAt) < d.date ? startMin : timeToMinutes(bkkTime(b.startsAt));
        const eMin = bkkDate(new Date(Date.parse(b.endsAt) - 1)) > d.date ? endMin : timeToMinutes(bkkTime(b.endsAt)) || 24 * 60;
        const top = y(Math.max(sMin, startMin));
        const bottom = y(Math.min(eMin, endMin));
        if (bottom - top < 2) continue;
        const fill = b.highlight ? C.highlight : b.mine ? C.primary : C.busy;
        parts.push(`<rect x="${lx0}" y="${top + 1.5}" width="${laneW}" height="${bottom - top - 3}" rx="${single ? 10 : 6}" fill="${fill}"/>`);
        if (single && bottom - top >= 24) {
          const ink = b.mine || b.highlight ? "#FFFFFF" : C.busyInk;
          const span = `${bkkTime(b.startsAt)}–${bkkTime(b.endsAt)}`;
          if (bottom - top >= 56) {
            parts.push(t(lx0 + 14, top + 26, fit(b.label, laneW - 20, 18), { size: 18, weight: 600, fill: ink }));
            parts.push(t(lx0 + 14, top + 50, span, { size: 16, fill: ink }));
          } else {
            // A half-hour block: name and time on one line.
            const y0 = top + (bottom - top) / 2 + 6;
            parts.push(t(lx0 + 14, y0, fit(b.label, laneW - 130, 16), { size: 16, weight: 600, fill: ink }));
            parts.push(t(lx0 + laneW - 12, y0, span, { size: 15, fill: ink, anchor: "end" }));
          }
        }
      }
    });

    // Time already gone today, and whole past days, fade out.
    if (isPast) {
      parts.push(`<rect x="${x0 + 2}" y="${gridTop}" width="${dayW - 4}" height="${gridH}" fill="#FFFFFF" opacity="0.6"/>`);
    } else if (isToday) {
      const nowMin = timeToMinutes(bkkTime(now));
      if (nowMin > startMin) {
        const ny = y(Math.min(nowMin, endMin));
        parts.push(`<rect x="${x0 + 2}" y="${gridTop}" width="${dayW - 4}" height="${ny - gridTop}" fill="#FFFFFF" opacity="0.55"/>`);
        if (nowMin < endMin) {
          parts.push(`<line x1="${x0 + 2}" y1="${ny}" x2="${x0 + dayW - 2}" y2="${ny}" stroke="${C.now}" stroke-width="2.5"/>`);
          parts.push(`<circle cx="${x0 + 6}" cy="${ny}" r="5" fill="${C.now}"/>`);
        }
      }
    }
  });

  parts.push(t(pad + 16, H - 34, `เวลาเปิดจอง ${input.open}–${input.close} น.  ·  ช่องว่างสีขาวคือเวลาที่ยังจองได้`, { size: 17, fill: C.ink3 }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
  return png(svg, W);
}

// ─── Summary card ──────────────────────────────────────────────────────────

export interface SummaryInput {
  heading: string;
  title: string;
  roomName: string;
  roomColor: string;
  roomPhoto: Buffer | null;
  roomPhotoType: string | null;
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  reference: string;
  bookedBy: string;
  lines: Array<{ label: string; value: string }>;
  footnote?: string;
}

export function renderSummary(s: SummaryInput): Buffer {
  const W = 1080;
  const H = 640;
  const photoW = 380;
  const parts: string[] = [];
  parts.push(`<defs><clipPath id="ph"><rect x="40" y="40" width="${photoW}" height="${H - 80}" rx="24"/></clipPath></defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="${C.page}"/>`);
  parts.push(`<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="32" fill="${C.card}"/>`);

  if (s.roomPhoto && s.roomPhotoType) {
    const b64 = s.roomPhoto.toString("base64");
    parts.push(`<image x="40" y="40" width="${photoW}" height="${H - 80}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)" href="data:${s.roomPhotoType};base64,${b64}"/>`);
  } else {
    parts.push(`<rect x="40" y="40" width="${photoW}" height="${H - 80}" rx="24" fill="${s.roomColor}" opacity="0.18"/>`);
    parts.push(t(40 + photoW / 2, H / 2 + 20, s.roomName.slice(0, 1), { size: 120, weight: 700, fill: s.roomColor, anchor: "middle" }));
  }
  // Room name over the photo, on a solid plate so it reads on any image.
  const plateW = Math.min(photoW - 40, s.roomName.length * 16 + 80);
  parts.push(`<rect x="60" y="${H - 116}" width="${plateW}" height="52" rx="26" fill="#FFFFFF"/>`);
  parts.push(`<circle cx="86" cy="${H - 90}" r="8" fill="${s.roomColor}"/>`);
  parts.push(t(102, H - 82, fit(s.roomName, plateW - 60, 22), { size: 22, weight: 700 }));

  const x = 40 + photoW + 48;
  const right = W - 56;
  parts.push(`<circle cx="${x + 18}" cy="86" r="18" fill="${C.primary}"/>`);
  parts.push(`<path d="M ${x + 9} 86 l 6 6 l 12 -13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  parts.push(t(x + 48, 95, s.heading, { size: 26, weight: 700, fill: C.primary }));
  parts.push(t(right, 95, s.reference, { size: 20, weight: 500, fill: C.ink3, anchor: "end" }));

  parts.push(t(x, 162, fit(s.title, right - x, 38), { size: 38, weight: 700 }));
  parts.push(t(x, 214, s.dateLabel, { size: 24, weight: 500, fill: C.ink2 }));
  parts.push(t(x, 276, s.timeLabel, { size: 52, weight: 700 }));
  parts.push(t(x, 314, s.durationLabel, { size: 22, fill: C.ink2 }));

  let yy = 372;
  parts.push(`<line x1="${x}" y1="${yy - 22}" x2="${right}" y2="${yy - 22}" stroke="${C.line}" stroke-width="2"/>`);
  for (const l of s.lines.slice(0, 4)) {
    parts.push(t(x, yy + 10, l.label, { size: 20, fill: C.ink3 }));
    parts.push(t(right, yy + 10, fit(l.value, right - x - 190, 21), { size: 21, weight: 600, anchor: "end" }));
    yy += 46;
  }
  parts.push(t(x, H - 62, fit(s.bookedBy, right - x, 18), { size: 18, fill: C.ink3 }));
  if (s.footnote) parts.push(t(x, H - 36, fit(s.footnote, right - x, 17), { size: 17, fill: C.ink3 }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
  return png(svg, W);
}

const photoCache = new Map<string, { at: number; value: { data: Buffer; type: string } | null }>();

/** Fetch a room photo for embedding (cached 30 min); anything unusable is null. */
export async function fetchPhoto(url: string | null): Promise<{ data: Buffer; type: string } | null> {
  if (!url) return null;
  const hit = photoCache.get(url);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value;
  const value = await fetchPhotoUncached(url);
  photoCache.set(url, { at: Date.now(), value });
  return value;
}

async function fetchPhotoUncached(url: string): Promise<{ data: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > 6_000_000) return null;
    return { data, type };
  } catch {
    return null;
  }
}

export function shortRoomName(name: string): string {
  const word = name.replace(/\s*ROOM$/i, "").trim();
  return word.length <= 7 ? word : word.slice(0, 6);
}

export function dayHeader(date: string): { label: string; sub: string } {
  const d = fromBkk(date, "12:00");
  const wd = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][new Date(d.getTime() + 7 * 3600_000).getUTCDay()];
  const day = Number(date.slice(8, 10));
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return { label: `${wd} ${day}`, sub: months[Number(date.slice(5, 7)) - 1] };
}
