/**
 * Everything the booking bot shows: pickers, cards, lists, settings.
 * Deterministic — no AI here. Copy is written in the bot's voice (น้องจอง,
 * female, ค่ะ/นะคะ): short lines, one idea per line, buttons over typing.
 */

import { addDays, bkkDate, bkkParts, bkkTime, fromBkk, servesOn, timeToMinutes } from "@/lib/time/bkk";
import { previewCharge } from "@/lib/billing/overage";
import {
  checkWindow,
  dayWord,
  formatHours,
  getOpenHours,
  hhmm,
  listBlocks,
  listMemberRooms,
  listOwnBookings,
  suggestForMember,
  usageFor,
  type Block,
  type MemberCtx,
  type OwnBooking,
  type PortalRoom,
} from "@/lib/server/member-ops";
import { dayHeader, fetchPhoto, renderSchedule, shortRoomName, type ScheduleRoom } from "./render";
import { editButtons, editText, sendPhoto, sendText, type Keyboard } from "./telegram";
import { kvGet, kvSet, kvDel, type ReminderPrefs, type TelegramLink } from "./store";

// ─── Session ───────────────────────────────────────────────────────────────

export interface Draft {
  mode: "new" | "move";
  step: "day" | "room" | "start" | "end" | "title" | "confirm" | "rename" | null;
  date?: string;
  roomId?: string;
  start?: string;
  end?: string;
  title?: string;
  repeatWeeks?: number;
  /** move / rename target */
  bookingId?: string;
  /** room-card messages, so the others lose their button once one is picked */
  roomMsgs?: number[];
  /** an AI-proposed change waiting for the confirm button */
  pending?: PendingOp;
  /** recent titles offered as one-tap buttons on the title step */
  titleChoices?: string[];
  updatedAt?: string;
}

export type PendingOp =
  | { kind: "cancel"; bookingId: string }
  | { kind: "move"; bookingId: string; date: string; start: string; end: string; roomId?: string }
  | { kind: "rename"; bookingId: string; title: string }
  | { kind: "extend"; bookingId: string; minutes: number };

export async function getDraft(tgUserId: string): Promise<Draft | null> {
  const d = await kvGet<Draft>(`tgbot:sess:${tgUserId}`);
  if (!d) return null;
  // A draft nobody touched for two hours is stale.
  if (!d.updatedAt || Date.now() - Date.parse(d.updatedAt) > 2 * 3600_000) return null;
  return d;
}

export async function saveDraft(tgUserId: string, d: Omit<Draft, "updatedAt"> & { updatedAt?: string }) {
  await kvSet(`tgbot:sess:${tgUserId}`, { ...d, updatedAt: new Date().toISOString() });
}

export async function clearDraft(tgUserId: string) {
  await kvDel(`tgbot:sess:${tgUserId}`);
}

// ─── Small helpers ─────────────────────────────────────────────────────────

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function thaiDay(date: string) {
  const today = bkkDate(new Date());
  const word = dayWord(date, today);
  if (word === "วันนี้" || word === "พรุ่งนี้") {
    const h = dayHeader(date);
    return `${word} (${h.label} ${h.sub})`;
  }
  return word;
}


function overlaps(b: { startsAt: string; endsAt: string }, s: number, e: number) {
  return Date.parse(b.startsAt) < e && Date.parse(b.endsAt) > s;
}

/** Free half-hour starts of a room on a day, from now on. */
export function freeStarts(
  date: string,
  room: PortalRoom,
  blocks: Block[],
  open: string,
  close: string,
  ignoreId?: string,
): string[] {
  const out: string[] = [];
  const now = Date.now();
  const wd = bkkParts(fromBkk(date, "12:00")).weekday;
  if (!servesOn(room.serviceDays, wd)) return out;
  for (let m = timeToMinutes(open); m + 30 <= timeToMinutes(close); m += 30) {
    const s = fromBkk(date, hhmm(m)).getTime();
    const e = s + 30 * 60_000;
    if (e <= now + 10 * 60_000) continue;
    if (blocks.some((b) => b.roomId === room.id && b.id !== ignoreId && overlaps(b, s, e))) continue;
    out.push(hhmm(m));
  }
  return out;
}

export function freeRanges(starts: string[]): string[] {
  const ranges: string[] = [];
  let a: string | null = null;
  let prev = -100;
  for (const s of starts) {
    const m = timeToMinutes(s);
    if (a === null) a = s;
    else if (m !== prev + 30) {
      ranges.push(`${a}–${hhmm(prev + 30)}`);
      a = s;
    }
    prev = m;
  }
  if (a !== null) ranges.push(`${a}–${hhmm(prev + 30)}`);
  return ranges;
}

function grid<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows;
}

// ─── Week and day pictures ─────────────────────────────────────────────────

/** Rooms as the picture shows them: photo, number, name, capacity. */
async function scheduleRooms(rooms: PortalRoom[]): Promise<ScheduleRoom[]> {
  const photos = await Promise.all(rooms.map((r) => fetchPhoto(r.thumbnailUrl)));
  return rooms.map((r, i) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    short: shortRoomName(r.name),
    capacity: r.capacityMax ? `${r.capacityMin ?? 1}–${r.capacityMax} คน` : undefined,
    photo: photos[i],
  }));
}

/** Seven days from `start`, every room; the viewer's bookings in blue. */
export async function weekImage(viewer: { memberId: string } | null, start: string, title?: string): Promise<Buffer> {
  const today = bkkDate(new Date());
  const end = addDays(start, 6);
  const [rooms, blocks, hours] = await Promise.all([listMemberRooms(), listBlocks(start, end), getOpenHours()]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return renderSchedule({
    title: title ?? (start === today ? "ตารางห้องประชุม 7 วันนี้" : "ตารางห้องประชุม 7 วันถัดไป"),
    subtitle: `${dayHeader(start).label} ${dayHeader(start).sub} – ${dayHeader(end).label} ${dayHeader(end).sub} · ทุกห้อง`,
    days: days.map((d) => ({ date: d, ...dayHeader(d) })),
    rooms: await scheduleRooms(rooms),
    blocks: blocks.map((b) => ({
      roomId: b.roomId,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      mine: !!viewer && b.memberId === viewer.memberId,
      label: "",
    })),
    open: hours.open,
    close: hours.close,
  });
}

export async function sendWeek(link: TelegramLink, ctx: MemberCtx, fromDate?: string) {
  // A rolling seven days from today: on a Sunday "this week" would be six
  // days of history and one day you can still book.
  const today = bkkDate(new Date());
  const start = fromDate && fromDate > today ? fromDate : today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const image = await weekImage(ctx, start);

  const dayButtons = days.map((d) => ({
    text: d === today ? "วันนี้" : d === addDays(today, 1) ? "พรุ่งนี้" : `${dayHeader(d).label}`,
    data: `d:${d}`,
  }));
  const nav =
    start === today
      ? [{ text: "7 วันถัดไป", data: `wk:${addDays(start, 7)}` }]
      : [{ text: "กลับมาวันนี้", data: `wk:${today}` }, { text: "7 วันถัดไป", data: `wk:${addDays(start, 7)}` }];

  await sendPhoto(
    link.chatId,
    image,
    "เลือกวันที่อยากจองได้เลยค่ะ\nหรือพิมพ์บอกมาก็ได้นะคะ เช่น <i>พรุ่งนี้บ่ายสอง 1 ชม.</i>",
    [...grid(dayButtons, 4), nav],
  );
}

/**
 * One day, every room, as the member is allowed to see it. `highlightId`
 * paints one booking orange — the one a notice is about.
 */
export async function dayImage(opts: {
  date: string;
  viewer: { memberId: string; orgId: string } | null;
  highlightId?: string;
  highlightLabel?: string;
  highlightLegend?: string;
  title?: string;
}): Promise<Buffer> {
  const [rooms, blocks, hours] = await Promise.all([listMemberRooms(), listBlocks(opts.date, opts.date), getOpenHours()]);
  const h = dayHeader(opts.date);
  return renderSchedule({
    title: opts.title ?? `ห้องว่าง${dayWord(opts.date) === "วันนี้" ? "วันนี้" : ""}`,
    subtitle: `${thaiDay(opts.date)} · ${h.label} ${h.sub}`,
    days: [{ date: opts.date, label: h.label, sub: h.sub }],
    rooms: await scheduleRooms(rooms),
    blocks: blocks.map((b) => {
      const mine = !!opts.viewer && b.memberId === opts.viewer.memberId;
      const same = !!opts.viewer && b.kind === "internal" && b.orgId === opts.viewer.orgId;
      const highlight = b.id === opts.highlightId;
      return {
        roomId: b.roomId,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        mine,
        highlight,
        label: highlight
          ? opts.highlightLabel ?? "จองใหม่"
          : mine
            ? b.title ?? "ของคุณ"
            : same
              ? b.memberName ?? "เพื่อนร่วมงาน"
              : "ไม่ว่าง",
      };
    }),
    open: hours.open,
    close: hours.close,
    highlightLegend: opts.highlightLegend,
  });
}

export async function sendDay(link: TelegramLink, ctx: MemberCtx, date: string) {
  const [rooms, blocks, hours] = await Promise.all([listMemberRooms(), listBlocks(date, date), getOpenHours()]);
  const image = await dayImage({ date, viewer: ctx });

  const lines: string[] = [];
  const quick: Keyboard = [];
  for (const r of rooms) {
    const starts = freeStarts(date, r, blocks, hours.open, hours.close);
    const ranges = freeRanges(starts);
    lines.push(`<b>${esc(r.name)}</b>  ${ranges.length ? ranges.slice(0, 3).join(", ") : "เต็มแล้ว"}`);
    if (starts[0]) {
      const s = starts[0];
      const oneHour = starts.includes(hhmm(timeToMinutes(s) + 30)) ? 60 : 30;
      quick.push([{ text: `จอง ${shortRoomName(r.name)} ${s}`, data: `q:${r.id}:${date}:${s}:${hhmm(timeToMinutes(s) + oneHour)}` }]);
    }
  }
  const next = addDays(date, 1);
  const prev = addDays(date, -1);
  const nav = [
    ...(prev >= bkkDate(new Date()) ? [{ text: "วันก่อน", data: `fr:${prev}` }] : []),
    { text: "วันถัดไป", data: `fr:${next}` },
    { text: "ดู 7 วัน", data: `wk:${date}` },
  ];
  await sendPhoto(link.chatId, image, `ช่วงที่ยังว่าง${thaiDay(date) ? ` ${thaiDay(date)}` : ""}\n\n${lines.join("\n")}`, [
    ...quick,
    nav,
  ]);
}

// ─── Booking wizard ────────────────────────────────────────────────────────

export async function sendSuggestions(link: TelegramLink, ctx: MemberCtx) {
  const today = bkkDate(new Date());
  const [rooms, blocks, hours] = await Promise.all([listMemberRooms(), listBlocks(today, addDays(today, 7)), getOpenHours()]);
  const sug = await suggestForMember(ctx, rooms, blocks, { hours, days: 5 });
  const rows: Keyboard = [];
  for (const s of sug) {
    for (const slot of s.slots.slice(0, 2)) {
      rows.push([{ text: `${shortRoomName(s.roomName)} · ${slot.label}`, data: `q:${s.roomId}:${slot.date}:${slot.start}:${slot.end}` }]);
    }
  }
  if (rows.length === 0) return;
  const used = sug.filter((s) => s.uses > 0);
  await sendText(
    link.chatId,
    used.length
      ? "หรือจองห้องที่ใช้บ่อยตามเวลาที่หนูแนะนำก็ได้ค่ะ\nดูจากเวลาที่ใช้ประจำ และเช็กแล้วว่ายังว่าง"
      : "หรือลองช่วงที่ยังว่างพวกนี้ก็ได้ค่ะ",
    { buttons: rows.slice(0, 6) },
  );
}

export async function sendRoomPicker(link: TelegramLink, ctx: MemberCtx, draft: Draft) {
  const date = draft.date!;
  const [rooms, blocks, hours] = await Promise.all([listMemberRooms(), listBlocks(date, date), getOpenHours()]);
  await sendText(
    link.chatId,
    draft.start
      ? `${thaiDay(date)} ${draft.start}${draft.end ? `–${draft.end}` : ""} เลือกห้องได้เลยค่ะ`
      : `${thaiDay(date)} เลือกห้องได้เลยค่ะ`,
  );
  const msgs: number[] = [];
  for (const r of rooms) {
    const starts = freeStarts(date, r, blocks, hours.open, hours.close, draft.bookingId);
    const ranges = freeRanges(starts);
    let fits = starts.length > 0;
    if (draft.start && draft.end) {
      const s = fromBkk(date, draft.start).getTime();
      const e = fromBkk(date, draft.end).getTime();
      fits = !blocks.some((b) => b.roomId === r.id && b.id !== draft.bookingId && overlaps(b, s, e));
    }
    const cap = r.capacityMax ? `${r.capacityMin ?? 1}–${r.capacityMax} คน` : "";
    const amen = r.amenities.slice(0, 3).join(" · ");
    const caption = [
      `<b>${esc(r.name)}</b>`,
      [cap, amen].filter(Boolean).join(" · "),
      ranges.length ? `ว่าง ${ranges.slice(0, 4).join(", ")}` : "วันนี้เต็มแล้วค่ะ",
      draft.start && draft.end ? (fits ? `ช่วง ${draft.start}–${draft.end} ว่างค่ะ` : `ช่วง ${draft.start}–${draft.end} ไม่ว่างค่ะ`) : "",
    ]
      .filter(Boolean)
      .join("\n");
    const buttons: Keyboard = fits ? [[{ text: "เลือกห้องนี้", data: `r:${r.id}` }]] : [];
    const res = r.thumbnailUrl
      ? await sendPhoto(link.chatId, r.thumbnailUrl, caption, buttons)
      : await sendText(link.chatId, caption, { buttons });
    const id = (res.result as { message_id?: number } | undefined)?.message_id;
    if (id) msgs.push(id);
  }
  await saveDraft(link.tgUserId, { ...draft, step: "room", roomMsgs: msgs });
}

export async function retireRoomCards(link: TelegramLink, draft: Draft) {
  for (const id of draft.roomMsgs ?? []) await editButtons(link.chatId, id);
}

export async function sendStartPicker(link: TelegramLink, ctx: MemberCtx, draft: Draft, editId?: number) {
  const date = draft.date!;
  const [rooms, blocks, hours] = await Promise.all([listMemberRooms(), listBlocks(date, date), getOpenHours()]);
  const room = rooms.find((r) => r.id === draft.roomId);
  if (!room) return sendText(link.chatId, "ห้องนี้ปิดจองอยู่ค่ะ เลือกห้องอื่นนะคะ");
  const starts = freeStarts(date, room, blocks, hours.open, hours.close, draft.bookingId);
  const head = `<b>${esc(room.name)}</b> · ${thaiDay(date)}`;
  if (starts.length === 0) {
    const text = `${head}\nวันนี้ไม่เหลือช่วงว่างแล้วค่ะ ลองวันอื่นนะคะ`;
    const kb: Keyboard = [[{ text: "เลือกวันอื่น", data: "wk:" }]];
    return editId ? editText(link.chatId, editId, text, kb) : sendText(link.chatId, text, { buttons: kb });
  }
  const text = `${head}\nเริ่มกี่โมงดีคะ\n<i>พิมพ์ช่วงเวลามาเองก็ได้นะคะ เช่น 13:00-15:00</i>`;
  const kb = [...grid(starts.map((s) => ({ text: s, data: `s:${s}` })), 5), [{ text: "ยกเลิก", data: "x" }]];
  await saveDraft(link.tgUserId, { ...draft, step: "start" });
  return editId ? editText(link.chatId, editId, text, kb) : sendText(link.chatId, text, { buttons: kb });
}

export async function sendEndPicker(link: TelegramLink, ctx: MemberCtx, draft: Draft, editId?: number) {
  const date = draft.date!;
  const [rooms, blocks, hours] = await Promise.all([listMemberRooms(), listBlocks(date, date), getOpenHours()]);
  const room = rooms.find((r) => r.id === draft.roomId)!;
  const s0 = timeToMinutes(draft.start!);
  const ends: Array<{ text: string; data: string }> = [];
  for (let m = s0 + 30; m <= timeToMinutes(hours.close) && m - s0 <= 8 * 60; m += 30) {
    const s = fromBkk(date, hhmm(m - 30)).getTime();
    const e = fromBkk(date, hhmm(m)).getTime();
    if (blocks.some((b) => b.roomId === room.id && b.id !== draft.bookingId && overlaps(b, s, e))) break;
    ends.push({ text: `${hhmm(m)} (${formatHours((m - s0) / 60).replace(" ชม.", "ชม.").replace(" นาที", "น.")})`, data: `e:${hhmm(m)}` });
  }
  const text = `<b>${esc(room.name)}</b> · ${thaiDay(date)} เริ่ม ${draft.start}\nจบกี่โมงคะ`;
  const kb = [...grid(ends.slice(0, 12), 3), [{ text: "เปลี่ยนเวลาเริ่ม", data: "s:" }, { text: "ยกเลิก", data: "x" }]];
  await saveDraft(link.tgUserId, { ...draft, step: "end" });
  return editId ? editText(link.chatId, editId, text, kb) : sendText(link.chatId, text, { buttons: kb });
}

export async function askTitle(link: TelegramLink, ctx: MemberCtx, draft: Draft) {
  const recent = await listOwnBookings(ctx, { fromDate: addDays(bkkDate(new Date()), -60), toDate: addDays(bkkDate(new Date()), 60) });
  const titles = [...new Set(recent.map((b) => b.title).filter((t) => t && t !== "ประชุม"))].slice(-3).reverse();
  await saveDraft(link.tgUserId, { ...draft, step: "title", titleChoices: titles });
  await sendText(
    link.chatId,
    [
      `${thaiDay(draft.date!)} ${draft.start}–${draft.end} ได้ค่ะ`,
      "",
      "ตั้งชื่อการจองให้หน่อยนะคะ เช่น ประชุมทีมขาย",
      "ถ้าเป็นประชุมประจำ บอกหนูได้เลยนะคะว่าอยากให้จองซ้ำวันไหน",
    ].join("\n"),
    { buttons: titles.length ? titles.map((t, i) => [{ text: `ใช้ชื่อ "${t.slice(0, 32)}"`, data: `t:${i}` }]) : undefined },
  );
  return titles;
}

/** Hours past the company's quota are billed to the company at the room's rate. */
function overQuotaLine(remaining: number, hours: number, rate: number, priced: boolean) {
  const c = previewCharge(remaining, hours, rate);
  const head = `โควตาบริษัทเหลือ ${formatHours(remaining)} การจองนี้เกินโควตา ${formatHours(c.chargedHours)}`;
  if (!priced || !c.amount) return `${head} นะคะ`;
  return `${head}\nค่าห้องส่วนที่เกิน <b>${c.amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท</b> จะเรียกเก็บกับบริษัทตอนสิ้นเดือนค่ะ`;
}

export async function sendConfirm(link: TelegramLink, ctx: MemberCtx, draft: Draft, editId?: number) {
  const rooms = await listMemberRooms();
  const room = rooms.find((r) => r.id === draft.roomId);
  if (!room || !draft.date || !draft.start || !draft.end) return;
  const check = await checkWindow(ctx, {
    roomId: room.id,
    date: draft.date,
    start: draft.start,
    end: draft.end,
    excludeBookingId: draft.mode === "move" ? draft.bookingId : undefined,
  });
  if (!check.ok) {
    await saveDraft(link.tgUserId, { ...draft, step: "start" });
    return sendText(link.chatId, `${esc(check.message)}\nเลือกเวลาใหม่นะคะ`, {
      buttons: [[{ text: "เลือกเวลาใหม่", data: "s:" }, { text: "ดูห้องอื่น", data: `d:${draft.date}` }]],
    });
  }
  const usage = await usageFor(ctx);
  const weeks = draft.repeatWeeks ?? 1;
  const total = check.hours * weeks;
  const quota = usage.unlimited
    ? `โควตาบริษัท ไม่จำกัด (เดือนนี้ใช้ไป ${formatHours(usage.orgHours)})`
    : usage.remainingHours! >= total
      ? `โควตาบริษัทเหลือ ${formatHours(usage.remainingHours!)} หลังจองเหลือ ${formatHours(usage.remainingHours! - check.hours)}`
      : overQuotaLine(usage.remainingHours!, total, room.hourlyRate, draft.mode !== "move" && draft.date.slice(0, 7) === bkkDate(new Date()).slice(0, 7));

  const lines = [
    draft.mode === "move" ? "ย้ายการจองไปที่นี่ใช่ไหมคะ" : "สรุปก่อนจองนะคะ",
    "",
    `<b>${esc(room.name)}</b>`,
    `<b>${thaiDay(draft.date)} · ${draft.start}–${draft.end}</b> (${formatHours(check.hours)})`,
    draft.title ? `ชื่อ: ${esc(draft.title)}` : "",
    weeks > 1 ? `จองซ้ำทุกสัปดาห์ ${weeks} ครั้ง` : "",
    "",
    quota,
  ].filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "");

  const kb: Keyboard =
    draft.mode === "move"
      ? [[{ text: "ยืนยันย้าย", data: "ok" }], [{ text: "เลือกเวลาใหม่", data: "s:" }, { text: "ยกเลิก", data: "x" }]]
      : [
          [{ text: "ยืนยันจอง", data: "ok" }],
          [
            { text: weeks > 1 ? `ซ้ำ ${weeks} สัปดาห์` : "จองซ้ำทุกสัปดาห์", data: "rep?" },
            { text: "แก้เวลา", data: "s:" },
          ],
          [{ text: "เปลี่ยนชื่อ", data: "tt" }, { text: "ยกเลิก", data: "x" }],
        ];
  await saveDraft(link.tgUserId, { ...draft, step: "confirm" });
  return editId ? editText(link.chatId, editId, lines.join("\n"), kb) : sendText(link.chatId, lines.join("\n"), { buttons: kb });
}

// ─── Lists ─────────────────────────────────────────────────────────────────

export function bookingLine(b: OwnBooking) {
  return `<b>${esc(b.roomName)}</b> · ${thaiDay(bkkDate(b.startsAt))} ${bkkTime(b.startsAt)}–${bkkTime(b.endsAt)}\n${esc(b.title)} · <code>${b.reference}</code>`;
}

export function bookingButtons(b: OwnBooking): Keyboard {
  const now = Date.now();
  if (Date.parse(b.startsAt) <= now && Date.parse(b.endsAt) > now) {
    return [
      [{ text: "ต่อ 30 นาที", data: `bx:${b.id}:30` }, { text: "จบเลย", data: `be:${b.id}` }],
    ];
  }
  return [
    [{ text: "แก้เวลา", data: `bm:${b.id}` }, { text: "ยกเลิก", data: `bc:${b.id}` }],
    [{ text: "เปลี่ยนชื่อ", data: `bn:${b.id}` }],
  ];
}

export async function sendMyBookings(link: TelegramLink, ctx: MemberCtx) {
  const today = bkkDate(new Date());
  const list = (await listOwnBookings(ctx, { fromDate: today, toDate: addDays(today, 30) })).filter(
    (b) => Date.parse(b.endsAt) > Date.now(),
  );
  if (list.length === 0) {
    return sendText(link.chatId, "ตอนนี้ยังไม่มีการจองที่กำลังจะมาถึงค่ะ\nกด จองห้อง ได้เลยนะคะ", { menu: true });
  }
  const header =
    list.length > 5
      ? `มี ${list.length} รายการใน 30 วันนี้ค่ะ หนูแสดง 5 รายการแรกนะคะ\nดูทั้งหมดได้ที่เว็บ EasySpace`
      : `มี ${list.length} รายการที่กำลังจะมาถึงค่ะ`;
  // Seven days at a glance first: blue is yours, which room, until when.
  try {
    await sendPhoto(link.chatId, await weekImage(ctx, today, "การจองของคุณ 7 วันนี้"), `${header}\nสีน้ำเงินในภาพคือการจองของคุณค่ะ`);
  } catch {
    await sendText(link.chatId, header);
  }
  for (const b of list.slice(0, 5)) {
    await sendText(link.chatId, bookingLine(b), { buttons: bookingButtons(b) });
  }
}

export async function sendUsage(link: TelegramLink, ctx: MemberCtx) {
  const u = await usageFor(ctx);
  const today = bkkDate(new Date());
  const next = (await listOwnBookings(ctx, { fromDate: today, toDate: addDays(today, 30) })).find(
    (b) => Date.parse(b.endsAt) > Date.now(),
  );
  const lines = [
    `สรุปเดือน${u.monthLabel}ค่ะ`,
    "",
    `คุณจองไป <b>${u.myCount} ครั้ง</b> รวม <b>${formatHours(u.myHours)}</b>`,
    u.unlimited
      ? `${esc(ctx.orgName)} ใช้ไป ${formatHours(u.orgHours)} (โควตาไม่จำกัด)`
      : `${esc(ctx.orgName)} ใช้ไป ${formatHours(u.orgHours)} จาก ${formatHours(u.quotaHours)}`,
    u.unlimited ? "" : `<b>เหลือ ${formatHours(u.remainingHours!)}</b>`,
    next ? `\nถัดไป: ${esc(next.roomName)} ${thaiDay(bkkDate(next.startsAt))} ${bkkTime(next.startsAt)}` : "",
  ].filter(Boolean);
  await sendText(link.chatId, lines.join("\n"), { menu: true });
}

// ─── Settings ──────────────────────────────────────────────────────────────

function minLabel(m: number) {
  if (m === 0) return "ปิด";
  return m >= 60 && m % 60 === 0 ? `${m / 60} ชม.` : `${m} นาที`;
}

export function settingsView(p: ReminderPrefs): { text: string; kb: Keyboard } {
  const onOff = (v: boolean) => (v ? "เปิด" : "ปิด");
  return {
    text: [
      "ตั้งค่าการแจ้งเตือนของคุณค่ะ",
      "",
      `เตือนก่อนประชุม: <b>${minLabel(p.remindBeforeMin)}</b>`,
      `แจ้งตอนถึงเวลาประชุม: <b>${onOff(p.startAlert)}</b>`,
      `เตือนก่อนหมดเวลา: <b>${minLabel(p.endWarnMin)}</b>`,
      `แจ้งตอนหมดเวลา: <b>${onOff(p.endAlert)}</b>`,
      `แจ้งเมื่อลูกค้าภายนอกจองห้อง: <b>${onOff(p.externalAlerts)}</b>`,
      "",
      "กดปุ่มเพื่อเปลี่ยน หรือพิมพ์บอกก็ได้ค่ะ เช่น <i>เตือนก่อน 30 นาที</i>",
    ].join("\n"),
    kb: [
      [{ text: `ก่อนประชุม: ${minLabel(p.remindBeforeMin)}`, data: "pf:rb" }],
      [{ text: `ตอนเริ่ม: ${onOff(p.startAlert)}`, data: "pf:sa" }, { text: `ตอนหมด: ${onOff(p.endAlert)}`, data: "pf:ea" }],
      [{ text: `ก่อนหมดเวลา: ${minLabel(p.endWarnMin)}`, data: "pf:ew" }],
      [{ text: `ลูกค้าภายนอกจอง: ${onOff(p.externalAlerts)}`, data: "pf:ex" }],
      [{ text: "ยกเลิกการเชื่อมบัญชี", data: "unlink?" }],
    ],
  };
}

export const REMIND_STEPS = [15, 30, 60, 120, 0];
export const ENDWARN_STEPS = [5, 10, 15, 0];

export function cycle(list: number[], current: number) {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

// ─── Help ──────────────────────────────────────────────────────────────────

export const HELP_TEXT = [
  "หนูช่วยเรื่องห้องประชุมได้ตามนี้ค่ะ",
  "",
  "• <b>จองห้อง</b> กดปุ่ม หรือพิมพ์มาเลย เช่น <i>พรุ่งนี้บ่ายสอง ห้อง master 1 ชม.</i>",
  "• <b>ห้องว่างวันนี้</b> ดูภาพตารางทุกห้อง",
  "• <b>การจองของฉัน</b> แก้เวลา ยกเลิก เปลี่ยนชื่อ",
  "• <b>สรุปการใช้งาน</b> ชั่วโมงที่ใช้และโควตาที่เหลือ",
  "",
  "หนูจะเตือนก่อนประชุม 1 ชม. ตอนเริ่ม ก่อนหมดเวลา 10 นาที และตอนหมดเวลา",
  "เปลี่ยนได้ที่ <b>ตั้งค่าแจ้งเตือน</b> นะคะ",
].join("\n");

export function nextFreeAfter(blocks: Block[], roomId: string, endsAt: string, close: string, date: string, ignoreId?: string) {
  const end = Date.parse(endsAt);
  const closeAt = fromBkk(date, close).getTime();
  const nextStart = blocks
    .filter((b) => b.roomId === roomId && b.id !== ignoreId && Date.parse(b.startsAt) >= end)
    .map((b) => Date.parse(b.startsAt))
    .sort((a, b) => a - b)[0];
  return bkkTime(new Date(Math.min(nextStart ?? closeAt, closeAt)));
}
