/**
 * Sample pictures of what the Telegram bot sends, drawn by the bot's own
 * renderer with made-up meetings — for the manual, so it shows nobody's real
 * schedule.
 *
 *   npx tsx --tsconfig tsconfig.e2e-bot.json scripts/manual/bot-sample-images.ts <outDir>
 */

import fs from "node:fs";
import path from "node:path";
import { renderSchedule, renderSummary, dayHeader } from "@/lib/tgbot/render";
import { addDays, bkkDate, fromBkk } from "@/lib/time/bkk";

const out = process.argv[2] ?? "docs/manual/images";
fs.mkdirSync(out, { recursive: true });

const rooms = [
  { id: "p", name: "PRIME ROOM", color: "#2D4EF5", short: "PRIME" },
  { id: "m", name: "MASTER ROOM", color: "#10B981", short: "MASTER" },
  { id: "e", name: "MEETING ROOM", color: "#F59E0B", short: "MEETING" },
];
const today = bkkDate(new Date());
const at = (d: number, t: string) => fromBkk(addDays(today, d), t).toISOString();
const blocks = [
  { roomId: "p", startsAt: at(0, "09:00"), endsAt: at(0, "10:30"), mine: false, label: "นภัส ศรีสุข" },
  { roomId: "m", startsAt: at(0, "10:00"), endsAt: at(0, "11:30"), mine: true, label: "ประชุมทีมขาย" },
  { roomId: "e", startsAt: at(0, "13:00"), endsAt: at(0, "16:00"), mine: false, label: "ไม่ว่าง" },
  { roomId: "p", startsAt: at(0, "14:00"), endsAt: at(0, "15:00"), mine: false, label: "ธนพล วงศ์ดี" },
  { roomId: "m", startsAt: at(1, "09:30"), endsAt: at(1, "11:00"), mine: false, label: "" },
  { roomId: "e", startsAt: at(1, "13:00"), endsAt: at(1, "17:00"), mine: false, label: "" },
  { roomId: "m", startsAt: at(2, "10:00"), endsAt: at(2, "11:30"), mine: true, label: "" },
  { roomId: "p", startsAt: at(3, "14:00"), endsAt: at(3, "16:00"), mine: false, label: "" },
  { roomId: "e", startsAt: at(4, "09:00"), endsAt: at(4, "12:00"), mine: false, label: "" },
  { roomId: "m", startsAt: at(4, "15:00"), endsAt: at(4, "16:30"), mine: true, label: "" },
  { roomId: "p", startsAt: at(5, "10:00"), endsAt: at(5, "12:00"), mine: false, label: "" },
];
const noon = fromBkk(today, "10:40");

const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
fs.writeFileSync(
  path.join(out, "bot-week.png"),
  renderSchedule({
    title: "ตารางห้องประชุม 7 วันนี้",
    subtitle: `${dayHeader(days[0]).label} ${dayHeader(days[0]).sub} – ${dayHeader(days[6]).label} ${dayHeader(days[6]).sub} · ทุกห้อง`,
    days: days.map((d) => ({ date: d, ...dayHeader(d) })),
    rooms,
    blocks,
    open: "08:30",
    close: "22:00",
    now: noon,
  }),
);

const h = dayHeader(today);
fs.writeFileSync(
  path.join(out, "bot-day.png"),
  renderSchedule({
    title: "ห้องว่างวันนี้",
    subtitle: `วันนี้ · ${h.label} ${h.sub}`,
    days: [{ date: today, label: h.label, sub: h.sub }],
    rooms,
    blocks,
    open: "08:30",
    close: "22:00",
    now: noon,
  }),
);

fs.writeFileSync(
  path.join(out, "bot-summary.png"),
  renderSummary({
    heading: "จองสำเร็จ",
    title: "ประชุมทีมขาย",
    roomName: "MASTER ROOM",
    roomColor: "#10B981",
    roomPhoto: null,
    roomPhotoType: null,
    dateLabel: "พรุ่งนี้ · อังคาร 3 พ.ย.",
    timeLabel: "14:00–15:30",
    durationLabel: "ใช้ห้อง 1 ชม. 30 นาที",
    reference: "BK00735",
    bookedBy: "สมชาย ใจดี · บริษัทตัวอย่าง จำกัด",
    lines: [
      { label: "โควตาบริษัทเหลือเดือนนี้", value: "5 ชม." },
      { label: "คุณจองเดือนนี้", value: "8 ชม." },
      { label: "ห้องว่างต่อได้ถึง", value: "17:00 น." },
      { label: "จองซ้ำ", value: "ทุกสัปดาห์ 4 ครั้ง" },
    ],
    footnote: "หนูจะเตือนก่อนเริ่ม 1 ชั่วโมง",
  }),
);
console.log(`wrote bot-week.png, bot-day.png, bot-summary.png to ${out}`);
