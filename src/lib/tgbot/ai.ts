/**
 * Free text → Claude → action.
 *
 * Claude runs on the office Mac (bot-worker/), under the account that is
 * signed in there. It never touches the database: it reads the context we
 * queue here, decides what the member meant, and answers with JSON — a reply
 * in น้องจอง's voice plus at most one action. Every action that changes data
 * then goes through a confirm button in code, so a misread sentence can
 * never book, move or cancel anything on its own.
 *
 * Queue: `tgbot:q:<ms>:<rand>` rows in the bot store. The worker claims a row
 * by deleting it (only one claimer wins), then POSTs its JSON to
 * /api/tgbot/worker/result.
 */

import { addDays, bkkDate, bkkParts, bkkTime, timeToMinutes } from "@/lib/time/bkk";
import {
  cancelForMember,
  checkWindow,
  extendForMember,
  findOwnByReference,
  formatHours,
  getOpenHours,
  hhmm,
  listMemberRooms,
  listOwnBookings,
  loadMemberCtx,
  moveForMember,
  renameForMember,
  usageFor,
  type MemberCtx,
  type OpResult,
  type OwnBooking,
} from "@/lib/server/member-ops";
import { sendText, type Keyboard } from "./telegram";
import { getHistory, getTelegramLink, kvList, kvSet, kvTake, pushHistory, saveTelegramLink, type TelegramLink } from "./store";
import {
  askTitle,
  bookingLine,
  esc,
  getDraft,
  HELP_TEXT,
  saveDraft,
  sendConfirm,
  sendDay,
  sendMyBookings,
  sendRoomPicker,
  sendStartPicker,
  sendUsage,
  sendWeek,
  settingsView,
  thaiDay,
  type Draft,
  type PendingOp,
} from "./views";

export interface AiContext {
  now: string;
  today: string;
  weekdayToday: string;
  nextSevenDays: Array<{ date: string; weekday: string }>;
  openHours: { open: string; close: string };
  member: { name: string; company: string };
  rooms: Array<{ name: string; capacity: string; amenities: string[] }>;
  myBookings: Array<{ ref: string; room: string; date: string; weekday: string; start: string; end: string; title: string }>;
  draft: { date?: string; room?: string; start?: string; end?: string; title?: string; repeatWeeks?: number; mode: string; step: string | null } | null;
  reminderPrefs: TelegramLink["prefs"];
  quota: { unlimited: boolean; remainingHours: number | null; myHoursThisMonth: number };
  history: Array<{ role: string; text: string }>;
}

export interface AiJob {
  id: string;
  tgUserId: string;
  chatId: string;
  text: string;
  createdAt: string;
  context: AiContext;
}

export const AI_ACTIONS = [
  "none",
  "help",
  "book",
  "show_week",
  "show_free",
  "my_bookings",
  "cancel",
  "move",
  "rename",
  "extend",
  "usage",
  "settings",
  "set_prefs",
] as const;

export interface AiResult {
  reply: string;
  action: (typeof AI_ACTIONS)[number];
  date?: string | null;
  start?: string | null;
  end?: string | null;
  duration_min?: number | null;
  room?: string | null;
  title?: string | null;
  repeat_weeks?: number | null;
  ref?: string | null;
  remind_before_min?: number | null;
  end_warn_min?: number | null;
  start_alert?: boolean | null;
  end_alert?: boolean | null;
  external_alerts?: boolean | null;
}

/** The JSON schema the worker hands to `claude --json-schema`. */
export const AI_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "action"],
  properties: {
    reply: { type: "string" },
    action: { type: "string", enum: [...AI_ACTIONS] },
    date: { type: ["string", "null"] },
    start: { type: ["string", "null"] },
    end: { type: ["string", "null"] },
    duration_min: { type: ["integer", "null"] },
    room: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    repeat_weeks: { type: ["integer", "null"] },
    ref: { type: ["string", "null"] },
    remind_before_min: { type: ["integer", "null"] },
    end_warn_min: { type: ["integer", "null"] },
    start_alert: { type: ["boolean", "null"] },
    end_alert: { type: ["boolean", "null"] },
    external_alerts: { type: ["boolean", "null"] },
  },
} as const;

// ─── Enqueue ───────────────────────────────────────────────────────────────

export async function enqueueAi(link: TelegramLink, ctx: MemberCtx, text: string, draft: Draft | null) {
  const context = await buildContext(link, ctx, draft);
  const now = Date.now();
  const job: AiJob = {
    id: `${now}:${Math.random().toString(36).slice(2, 8)}`,
    tgUserId: link.tgUserId,
    chatId: link.chatId,
    text: text.slice(0, 800),
    createdAt: new Date(now).toISOString(),
    context,
  };
  await kvSet(`tgbot:q:${job.id}`, job);
}

async function buildContext(link: TelegramLink, ctx: MemberCtx, draft: Draft | null): Promise<AiContext> {
  const today = bkkDate(new Date());
  const [rooms, mine, usage, hours, history] = await Promise.all([
    listMemberRooms(),
    listOwnBookings(ctx, { fromDate: today, toDate: addDays(today, 45) }),
    usageFor(ctx),
    getOpenHours(),
    getHistory(link.tgUserId),
  ]);
  const p = bkkParts(new Date());
  return {
    now: `${p.date} ${p.time}`,
    today,
    weekdayToday: `วัน${p.weekdayLabel}`,
    nextSevenDays: Array.from({ length: 8 }, (_, i) => {
      const d = addDays(today, i);
      return { date: d, weekday: `วัน${bkkParts(`${d}T05:00:00Z`).weekdayLabel}` };
    }),
    openHours: hours,
    member: { name: ctx.fullName, company: ctx.orgName },
    rooms: rooms.map((r) => ({
      name: r.name,
      capacity: r.capacityMax ? `${r.capacityMin ?? 1}-${r.capacityMax} คน` : "",
      amenities: r.amenities.slice(0, 5),
    })),
    myBookings: mine
      .filter((b) => Date.parse(b.endsAt) > Date.now())
      .slice(0, 15)
      .map((b) => ({
        ref: b.reference,
        room: b.roomName,
        date: bkkDate(b.startsAt),
        weekday: `วัน${bkkParts(b.startsAt).weekdayLabel}`,
        start: bkkTime(b.startsAt),
        end: bkkTime(b.endsAt),
        title: b.title,
      })),
    draft: draft
      ? {
          mode: draft.mode,
          step: draft.step,
          date: draft.date,
          room: rooms.find((r) => r.id === draft.roomId)?.name,
          start: draft.start,
          end: draft.end,
          title: draft.title,
          repeatWeeks: draft.repeatWeeks,
        }
      : null,
    reminderPrefs: link.prefs,
    quota: { unlimited: usage.unlimited, remainingHours: usage.remainingHours, myHoursThisMonth: usage.myHours },
    // The current message is already the last line; the worker sends it separately.
    history: history.slice(0, -1).map((h) => ({ role: h.role, text: h.text })),
  };
}

/** Oldest waiting job, claimed atomically. */
export async function claimJob(): Promise<AiJob | null> {
  const rows = await kvList<AiJob>("tgbot:q:", { limit: 5 });
  for (const r of rows) {
    const job = await kvTake<AiJob>(r.key);
    if (job) return job;
  }
  return null;
}

/** Jobs nobody picked up — the Mac is asleep or the worker is down. */
export async function rescueStaleJobs(maxAgeMs = 45_000) {
  const rows = await kvList<AiJob>("tgbot:q:", { limit: 20 });
  for (const r of rows) {
    if (Date.now() - Date.parse(r.value.createdAt) < maxAgeMs) continue;
    const job = await kvTake<AiJob>(r.key);
    if (!job) continue;
    await sendText(
      job.chatId,
      "ตอนนี้หนูอ่านข้อความพิมพ์ได้ช้าหน่อยค่ะ\nใช้ปุ่มด้านล่างจอง ดูห้องว่าง หรือดูการจองได้เลยนะคะ",
      { menu: true },
    );
  }
}

// ─── Execute ───────────────────────────────────────────────────────────────

export async function executeAiResult(job: AiJob, result: AiResult): Promise<unknown> {
  const link = await getTelegramLink({ tgUserId: job.tgUserId });
  if (!link) return;
  const ctx = await loadMemberCtx(link.memberId);
  if (!ctx) return;
  const reply = (result.reply ?? "").trim();
  const action = AI_ACTIONS.includes(result.action) ? result.action : "none";

  if (reply) {
    await sendText(link.chatId, esc(reply).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"));
    await pushHistory(link.tgUserId, { role: "bot", text: reply });
  }

  const draft = (await getDraft(link.tgUserId)) ?? ({ mode: "new", step: null } as Draft);

  switch (action) {
    case "none":
      if (!reply) await sendText(link.chatId, "หนูยังไม่แน่ใจว่าหมายถึงอะไรค่ะ ลองใช้ปุ่มด้านล่างได้เลยนะคะ", { menu: true });
      return;
    case "help":
      return void (await sendText(link.chatId, HELP_TEXT, { menu: true }));
    case "show_week":
      return sendWeek(link, ctx, validDate(result.date) ?? undefined);
    case "show_free":
      return sendDay(link, ctx, validDate(result.date) ?? bkkDate(new Date()));
    case "my_bookings":
      return sendMyBookings(link, ctx);
    case "usage":
      return sendUsage(link, ctx);
    case "settings": {
      const v = settingsView(link.prefs);
      return void (await sendText(link.chatId, v.text, { buttons: v.kb }));
    }
    case "set_prefs":
      return setPrefs(link, result);
    case "book":
      return continueBooking(link, ctx, draft, result);
    case "cancel":
    case "move":
    case "rename":
    case "extend":
      return proposeChange(link, ctx, draft, action, result);
  }
}

function validDate(d?: string | null) {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}
function validTime(t?: string | null) {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  // Snap to the half-hour grid the rooms are booked on.
  const total = Math.round((h * 60 + mm) / 30) * 30;
  return hhmm(total);
}

async function setPrefs(link: TelegramLink, r: AiResult) {
  const p = { ...link.prefs };
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  if (typeof r.remind_before_min === "number") p.remindBeforeMin = clamp(r.remind_before_min, 0, 24 * 60);
  if (typeof r.end_warn_min === "number") p.endWarnMin = clamp(r.end_warn_min, 0, 120);
  if (typeof r.start_alert === "boolean") p.startAlert = r.start_alert;
  if (typeof r.end_alert === "boolean") p.endAlert = r.end_alert;
  if (typeof r.external_alerts === "boolean") p.externalAlerts = r.external_alerts;
  await saveTelegramLink({ ...link, prefs: p });
  const v = settingsView(p);
  await sendText(link.chatId, v.text, { buttons: v.kb });
}

async function continueBooking(link: TelegramLink, ctx: MemberCtx, draft: Draft, r: AiResult) {
  const rooms = await listMemberRooms();
  const base: Draft = draft.mode === "new" ? draft : { mode: "new", step: null };
  const roomId = r.room ? matchRoom(rooms, r.room) ?? base.roomId : base.roomId;
  const date = validDate(r.date) ?? base.date;
  const start = validTime(r.start) ?? base.start;
  let end = validTime(r.end) ?? (r.start ? undefined : base.end);
  let defaulted = false;
  if (start && !end) {
    const minutes = r.duration_min && r.duration_min >= 30 ? Math.round(r.duration_min / 30) * 30 : 60;
    end = hhmm(timeToMinutes(start) + minutes);
    defaulted = !r.duration_min;
  }
  const next: Draft = {
    ...base,
    mode: "new",
    date,
    roomId,
    start,
    end,
    title: r.title?.trim() ? r.title.trim().slice(0, 120) : base.title,
    repeatWeeks: r.repeat_weeks && r.repeat_weeks > 1 ? Math.min(r.repeat_weeks, 26) : base.repeatWeeks,
    pending: undefined,
  };
  if (r.room && !roomId) {
    await sendText(link.chatId, `หนูไม่เจอห้องชื่อ "${esc(r.room)}" ค่ะ เลือกจากรายการนี้นะคะ`);
  }
  if (!next.date) {
    await saveDraft(link.tgUserId, { ...next, step: "day" });
    return sendWeek(link, ctx);
  }
  if (!next.roomId) return sendRoomPicker(link, ctx, next);
  if (!next.start || !next.end) {
    await saveDraft(link.tgUserId, next);
    return sendStartPicker(link, ctx, next);
  }
  const check = await checkWindow(ctx, { roomId: next.roomId, date: next.date, start: next.start, end: next.end });
  if (!check.ok) {
    await sendText(link.chatId, `${esc(check.message)}ค่ะ`);
    if (check.code === "conflict") return sendRoomPicker(link, ctx, next);
    await saveDraft(link.tgUserId, next);
    return sendStartPicker(link, ctx, next);
  }
  if (defaulted) await sendText(link.chatId, `หนูใส่ไว้ 1 ชั่วโมงก่อนนะคะ (${next.start}–${next.end}) เปลี่ยนได้ค่ะ`);
  if (!next.title) {
    await saveDraft(link.tgUserId, next);
    return askTitle(link, ctx, next);
  }
  return sendConfirm(link, ctx, next);
}

function matchRoom(rooms: Array<{ id: string; name: string }>, ref: string): string | undefined {
  const q = ref.trim().toLowerCase().replace(/\s*room$/, "");
  return (
    rooms.find((r) => r.name.toLowerCase() === ref.trim().toLowerCase()) ??
    rooms.find((r) => r.name.toLowerCase().replace(/\s*room$/, "") === q) ??
    rooms.find((r) => r.name.toLowerCase().includes(q))
  )?.id;
}

async function proposeChange(
  link: TelegramLink,
  ctx: MemberCtx,
  draft: Draft,
  action: "cancel" | "move" | "rename" | "extend",
  r: AiResult,
) {
  let target: OwnBooking | null = r.ref ? await findOwnByReference(ctx, r.ref) : null;
  if (!target) {
    const today = bkkDate(new Date());
    const upcoming = (await listOwnBookings(ctx, { fromDate: today, toDate: addDays(today, 45) })).filter(
      (b) => Date.parse(b.endsAt) > Date.now(),
    );
    if (upcoming.length === 1) target = upcoming[0];
    else {
      await sendText(link.chatId, "เลือกรายการที่ต้องการได้เลยค่ะ");
      return sendMyBookings(link, ctx);
    }
  }

  let op: PendingOp;
  let question: string;
  if (action === "cancel") {
    op = { kind: "cancel", bookingId: target.id };
    question = "ยกเลิกรายการนี้ใช่ไหมคะ";
  } else if (action === "rename") {
    const title = r.title?.trim();
    if (!title) {
      await saveDraft(link.tgUserId, { mode: "new", step: "rename", bookingId: target.id });
      return sendText(link.chatId, "อยากเปลี่ยนเป็นชื่ออะไรคะ");
    }
    op = { kind: "rename", bookingId: target.id, title: title.slice(0, 120) };
    question = `เปลี่ยนชื่อเป็น "${esc(title)}" ใช่ไหมคะ`;
  } else if (action === "extend") {
    const minutes = r.duration_min && r.duration_min > 0 ? Math.round(r.duration_min / 15) * 15 : 30;
    op = { kind: "extend", bookingId: target.id, minutes };
    question = `ต่อเวลาอีก ${formatHours(minutes / 60)} ใช่ไหมคะ`;
  } else {
    const date = validDate(r.date) ?? bkkDate(target.startsAt);
    const start = validTime(r.start);
    const rooms = await listMemberRooms();
    const roomId = r.room ? matchRoom(rooms, r.room) : undefined;
    if (!start) {
      await saveDraft(link.tgUserId, {
        mode: "move",
        step: "start",
        bookingId: target.id,
        roomId: roomId ?? target.roomId,
        date,
        title: target.title,
      });
      return sendStartPicker(link, ctx, { mode: "move", step: "start", bookingId: target.id, roomId: roomId ?? target.roomId, date, updatedAt: "" });
    }
    const length = (Date.parse(target.endsAt) - Date.parse(target.startsAt)) / 60_000;
    const end = validTime(r.end) ?? hhmm(timeToMinutes(start) + (r.duration_min ?? length));
    const check = await checkWindow(ctx, { roomId: roomId ?? target.roomId, date, start, end, excludeBookingId: target.id });
    if (!check.ok) return void (await sendText(link.chatId, `${esc(check.message)}ค่ะ ยังย้ายไม่ได้นะคะ`));
    op = { kind: "move", bookingId: target.id, date, start, end, roomId };
    question = `ย้ายไป <b>${esc(check.room.name)} · ${thaiDay(date)} · ${start}–${end}</b> ใช่ไหมคะ`;
  }

  await saveDraft(link.tgUserId, { ...draft, pending: op });
  const kb: Keyboard = [[{ text: "ยืนยัน", data: "op:ok" }, { text: "ไม่ใช่", data: "op:no" }]];
  await sendText(link.chatId, `${bookingLine(target)}\n\n${question}`, { buttons: kb });
}

export async function runPendingOp(ctx: MemberCtx, op: PendingOp): Promise<OpResult> {
  switch (op.kind) {
    case "cancel":
      return cancelForMember(ctx, op.bookingId, "ยกเลิกผ่าน Telegram");
    case "rename":
      return renameForMember(ctx, op.bookingId, op.title);
    case "extend":
      return extendForMember(ctx, op.bookingId, op.minutes);
    case "move":
      return moveForMember(ctx, op.bookingId, { date: op.date, start: op.start, end: op.end, roomId: op.roomId });
  }
}
