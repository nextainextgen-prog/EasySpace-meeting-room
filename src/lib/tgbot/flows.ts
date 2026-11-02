/**
 * The booking bot's update handler. Buttons and expected inputs (an e-mail
 * while linking, a title while booking) are handled right here in code;
 * anything else a member types goes to the AI worker (see ai.ts).
 */

import { addDays, bkkDate, bkkTime } from "@/lib/time/bkk";
import {
  bookForMember,
  cancelForMember,
  endNowForMember,
  extendForMember,
  findMemberByEmail,
  formatHours,
  getOpenHours,
  getOwnBooking,
  listBlocks,
  listMemberRooms,
  loadMemberCtx,
  moveForMember,
  renameForMember,
  usageFor,
  type MemberCtx,
} from "@/lib/server/member-ops";
import { fetchPhoto, renderSummary } from "./render";
import {
  answerCallback,
  editButtons,
  editText,
  sendPhoto,
  sendText,
  sendVideo,
  typing,
  type Keyboard,
} from "./telegram";
import { publicBaseUrl } from "@/lib/data/public-rooms";
import {
  DEFAULT_PREFS,
  getTelegramLink,
  kvAdd,
  kvGet,
  kvSet,
  pushHistory,
  removeTelegramLink,
  saveTelegramLink,
  type TelegramLink,
} from "./store";
import {
  askTitle,
  bookingButtons,
  bookingLine,
  clearDraft,
  cycle,
  ENDWARN_STEPS,
  esc,
  getDraft,
  HELP_TEXT,
  nextFreeAfter,
  REMIND_STEPS,
  retireRoomCards,
  saveDraft,
  sendConfirm,
  sendDay,
  sendEndPicker,
  sendMyBookings,
  sendRoomPicker,
  sendStartPicker,
  sendSuggestions,
  sendUsage,
  sendWeek,
  settingsView,
  thaiDay,
  type Draft,
} from "./views";
import { enqueueAi, runPendingOp } from "./ai";

// ─── Telegram update shapes (only what we read) ────────────────────────────

interface TgUser {
  id: number;
  first_name?: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
}
interface TgCallback {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  // Telegram retries when a webhook is slow; handle each update once.
  if (!(await kvAdd(`tgbot:seen:${update.update_id}`, 1))) return;
  if (update.message) await handleMessage(update.message);
  else if (update.callback_query) await handleCallback(update.callback_query);
}

// ─── Messages ──────────────────────────────────────────────────────────────

const MENU: Record<string, string> = {
  "จองห้อง": "/book",
  "ห้องว่างวันนี้": "/free",
  "การจองของฉัน": "/my",
  "สรุปการใช้งาน": "/usage",
  "ตั้งค่าแจ้งเตือน": "/settings",
};

async function handleMessage(msg: TgMessage): Promise<unknown> {
  if (msg.chat.type !== "private" || !msg.from) return;
  const tgUserId = String(msg.from.id);
  const chatId = String(msg.chat.id);
  const text = (msg.text ?? "").trim();

  const link = await getTelegramLink({ tgUserId });
  if (!link) return handleUnlinked(msg.from, chatId, text);

  const ctx = await loadMemberCtx(link.memberId);
  if (!ctx) {
    await removeTelegramLink(tgUserId);
    return sendText(
      chatId,
      "บัญชีที่เคยเชื่อมไว้ใช้งานไม่ได้แล้วค่ะ\nพิมพ์อีเมลที่ลงทะเบียนไว้อีกครั้งนะคะ",
      { removeMenu: true },
    );
  }
  if (link.chatId !== chatId) await saveTelegramLink({ ...link, chatId });

  if (!text) return sendText(chatId, "ตอนนี้หนูอ่านได้แค่ข้อความนะคะ พิมพ์บอกได้เลยค่ะ");

  const command = MENU[text] ?? (text.startsWith("/") ? text.split(/\s|@/)[0].toLowerCase() : null);
  if (command) {
    await clearDraft(tgUserId);
    return runCommand(command, link, ctx);
  }

  const draft = await getDraft(tgUserId);
  if (draft?.step === "rename" && draft.bookingId) {
    const res = await renameForMember(ctx, draft.bookingId, text);
    await clearDraft(tgUserId);
    return sendText(chatId, res.ok ? `${res.message}ค่ะ` : res.message, { menu: true });
  }

  // A typed time range while a picker is open is just another way of tapping.
  const range = parseRange(text);
  if (draft && range && draft.date && ["start", "end", "room", "confirm"].includes(draft.step ?? "")) {
    const next: Draft = { ...draft, start: range.start, end: range.end };
    if (draft.mode === "move" || (next.roomId && next.title)) return sendConfirm(link, ctx, next);
    if (next.roomId) {
      await saveDraft(tgUserId, next);
      return askTitle(link, ctx, next);
    }
    return sendRoomPicker(link, ctx, next);
  }

  if (draft?.step === "title" && looksLikeTitle(text)) {
    await pushHistory(tgUserId, { role: "user", text });
    return sendConfirm(link, ctx, { ...draft, title: text.slice(0, 120) });
  }

  // Everything else is free text: the AI worker reads it with context.
  await pushHistory(tgUserId, { role: "user", text });
  await typing(chatId);
  await enqueueAi(link, ctx, text, draft);
}

/** Short and plain reads as a title; anything that sounds like an instruction goes to the AI. */
function looksLikeTitle(text: string) {
  if (text.length > 60) return false;
  return !/(ทุก|ซ้ำ|เลื่อน|ย้าย|ยกเลิก|เปลี่ยน|โมง|ทุ่ม|บ่าย|เช้า|พรุ่งนี้|มะรืน|\d{1,2}[:.]\d{2}|ห้อง|วันจันทร์|วันอังคาร|วันพุธ|วันพฤหัส|วันศุกร์|ไม่เอา|ไม่จอง|จองซ้ำ)/.test(text);
}

function parseRange(text: string): { start: string; end: string } | null {
  const m = text.match(/(\d{1,2})[:.](\d{2})\s*(?:-|–|ถึง|to)\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const pad = (n: string) => n.padStart(2, "0");
  return { start: `${pad(m[1])}:${m[2]}`, end: `${pad(m[3])}:${m[4]}` };
}

async function runCommand(command: string, link: TelegramLink, ctx: MemberCtx) {
  switch (command) {
    case "/start":
      await sendText(link.chatId, `สวัสดีค่ะคุณ${esc(firstName(ctx.fullName))} 🌸\nวันนี้ให้หนูช่วยจองห้องไหมคะ`, { menu: true });
      return;
    case "/book":
      await saveDraft(link.tgUserId, { mode: "new", step: "day" });
      await sendWeek(link, ctx);
      await sendSuggestions(link, ctx);
      return;
    case "/free":
      return sendDay(link, ctx, bkkDate(new Date()));
    case "/my":
      return sendMyBookings(link, ctx);
    case "/usage":
      return sendUsage(link, ctx);
    case "/settings": {
      const v = settingsView(link.prefs);
      await sendText(link.chatId, v.text, { buttons: v.kb });
      return;
    }
    case "/unlink":
      await sendText(link.chatId, "ยกเลิกการเชื่อมบัญชีใช่ไหมคะ", {
        buttons: [[{ text: "ยืนยันยกเลิกการเชื่อม", data: "unlink!" }, { text: "ไม่ใช่", data: "noop" }]],
      });
      return;
    default:
      await sendText(link.chatId, HELP_TEXT, { menu: true });
  }
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? full;
}

// ─── Linking ───────────────────────────────────────────────────────────────

/**
 * The 90-second how-to clip (design/clips/telegram-booking), sent when a new
 * user presses Start. Telegram fetches it from public/ once; the file_id it
 * returns is kept and reused, so the clip is never downloaded twice. Rename
 * the file when the clip changes and the old file_id is dropped on its own.
 */
const TUTORIAL_FILE = "/tgbot/how-to-book.mp4";
const TUTORIAL_META = { width: 1080, height: 1920, duration: 91 };

async function sendTutorial(chatId: string) {
  const url = publicBaseUrl() + TUTORIAL_FILE;
  const cached = await kvGet<{ url: string; fileId: string }>("tgbot:tutorial");
  const caption = "ดูวิธีจองห้องกับหนูใน 90 วินาทีค่ะ";
  if (cached?.url === url && (await sendVideo(chatId, cached.fileId, caption, TUTORIAL_META)).ok) return;
  const res = await sendVideo(chatId, url, caption, TUTORIAL_META);
  const fileId = res.result?.video?.file_id;
  if (res.ok && fileId) await kvSet("tgbot:tutorial", { url, fileId });
}

const EMAIL_RE = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/;

async function handleUnlinked(from: TgUser, chatId: string, text: string) {
  const tgUserId = String(from.id);
  const email = text.match(EMAIL_RE)?.[0];
  if (!email) {
    if (text.toLowerCase().startsWith("/start")) await sendTutorial(chatId);
    return sendText(
      chatId,
      [
        "สวัสดีค่ะ 🌸 หนูชื่อน้องจอง ผู้ช่วยจองห้องประชุมของ EasySpace",
        "",
        "ก่อนเริ่ม ขอพิมพ์<b>อีเมลที่ลงทะเบียนใช้งานระบบ</b>ไว้หน่อยนะคะ",
        "หนูจะเช็กให้ว่าคุณอยู่บริษัทไหน",
      ].join("\n"),
      { removeMenu: true },
    );
  }

  // Slow down guessing: six misses in 30 minutes, then wait.
  const failKey = `tgbot:fail:${tgUserId}`;
  const fails = (await kvGet<{ n: number; since: string }>(failKey)) ?? { n: 0, since: new Date().toISOString() };
  const windowOpen = Date.now() - Date.parse(fails.since) < 30 * 60_000;
  if (windowOpen && fails.n >= 6) {
    return sendText(chatId, "ลองหลายครั้งแล้วค่ะ รอสักครึ่งชั่วโมงแล้วค่อยลองใหม่นะคะ\nหรือติดต่อผู้ดูแลบริษัทได้เลยค่ะ");
  }

  const ctx = await findMemberByEmail(email);
  if (!ctx) {
    await kvSet(failKey, windowOpen ? { n: fails.n + 1, since: fails.since } : { n: 1, since: new Date().toISOString() });
    return sendText(
      chatId,
      [
        `หนูยังหาอีเมล <b>${esc(email)}</b> ในระบบไม่เจอค่ะ`,
        "",
        "ลองเช็กตัวสะกดอีกทีนะคะ ต้องเป็นอีเมลเดียวกับที่ใช้เข้าเว็บ EasySpace",
        "ถ้ายังไม่เคยลงทะเบียน ติดต่อผู้ดูแลบริษัทได้เลยค่ะ",
      ].join("\n"),
    );
  }

  const previous = await saveTelegramLink({
    tgUserId,
    chatId,
    memberId: ctx.memberId,
    email: ctx.email,
    username: from.username ?? null,
    firstName: from.first_name ?? null,
    linkedAt: new Date().toISOString(),
    prefs: DEFAULT_PREFS,
  });
  if (previous) {
    const old = await kvGet<{ chatId: string }>(`tgbot:link:${previous}`);
    if (old?.chatId) await sendText(old.chatId, "บัญชีนี้ถูกเชื่อมกับ Telegram อีกเครื่องแล้วค่ะ", { removeMenu: true });
  }

  const usage = await usageFor(ctx);
  await sendText(
    chatId,
    [
      "เชื่อมต่อบัญชีเรียบร้อยค่ะ",
      "",
      `ชื่อ: <b>${esc(ctx.fullName)}</b>`,
      `บริษัท: <b>${esc(ctx.orgName)}</b>`,
      `อีเมล: ${esc(ctx.email)}`,
      usage.unlimited
        ? `โควตาเดือนนี้: ไม่จำกัด (บริษัทใช้ไป ${formatHours(usage.orgHours)})`
        : `โควตาเดือนนี้: เหลือ <b>${formatHours(usage.remainingHours!)}</b> จาก ${formatHours(usage.quotaHours)}`,
      `คุณจองไปแล้ว ${usage.myCount} ครั้ง รวม ${formatHours(usage.myHours)}`,
    ].join("\n"),
  );
  await sendText(chatId, HELP_TEXT, { menu: true });
}

// ─── Buttons ───────────────────────────────────────────────────────────────

async function handleCallback(cb: TgCallback): Promise<unknown> {
  const tgUserId = String(cb.from.id);
  const data = cb.data ?? "";
  const msgId = cb.message?.message_id;
  const link = await getTelegramLink({ tgUserId });
  if (!link) {
    await answerCallback(cb.id, "เชื่อมบัญชีก่อนนะคะ");
    return;
  }
  const ctx = await loadMemberCtx(link.memberId);
  if (!ctx) {
    await answerCallback(cb.id, "บัญชีนี้ใช้งานไม่ได้แล้วค่ะ");
    return;
  }
  const draft = (await getDraft(tgUserId)) ?? ({ mode: "new", step: null } as Draft);
  const [kind, ...rest] = data.split(":");
  const arg = rest.join(":");
  await answerCallback(cb.id);

  switch (kind) {
    case "noop":
      if (msgId) await editButtons(link.chatId, msgId);
      return;

    case "wk":
      return sendWeek(link, ctx, arg || undefined);

    case "fr":
      return sendDay(link, ctx, arg);

    case "d": {
      const next: Draft = { ...draft, date: arg, start: undefined, end: undefined, pending: undefined };
      if (next.mode === "move") return sendStartPicker(link, ctx, next);
      return sendRoomPicker(link, ctx, { ...next, mode: "new", roomId: undefined });
    }

    case "r": {
      await retireRoomCards(link, draft);
      const next: Draft = { ...draft, roomId: arg, roomMsgs: [] };
      if (next.start && next.end) {
        if (next.title) return sendConfirm(link, ctx, next);
        return askTitle(link, ctx, next);
      }
      return sendStartPicker(link, ctx, next);
    }

    case "s": {
      if (!draft.date || !draft.roomId) return sendWeek(link, ctx);
      if (!arg) return sendStartPicker(link, ctx, draft, msgId);
      return sendEndPicker(link, ctx, { ...draft, start: arg, end: undefined }, msgId);
    }

    case "e": {
      if (!draft.start) return sendStartPicker(link, ctx, draft, msgId);
      const next: Draft = { ...draft, end: arg };
      if (next.mode === "move" || next.title) return sendConfirm(link, ctx, next, msgId);
      if (msgId) {
        const rooms = await listMemberRooms();
        const room = rooms.find((r) => r.id === next.roomId);
        await editText(link.chatId, msgId, `<b>${esc(room?.name ?? "")}</b> · ${thaiDay(next.date!)} ${next.start}–${next.end}`);
      }
      return askTitle(link, ctx, next);
    }

    case "t": {
      const title = draft.titleChoices?.[Number(arg)];
      if (!title) return askTitle(link, ctx, draft);
      return sendConfirm(link, ctx, { ...draft, title });
    }

    case "tt":
      await saveDraft(tgUserId, { ...draft, step: "title" });
      return sendText(link.chatId, "พิมพ์ชื่อการจองใหม่ได้เลยค่ะ");

    case "rep?":
      if (!msgId) return;
      return editButtons(link.chatId, msgId, [
        [
          { text: "ครั้งเดียว", data: "rep:1" },
          { text: "4 สัปดาห์", data: "rep:4" },
          { text: "8 สัปดาห์", data: "rep:8" },
          { text: "12 สัปดาห์", data: "rep:12" },
        ],
      ]);

    case "rep":
      return sendConfirm(link, ctx, { ...draft, repeatWeeks: Number(arg) || 1 }, msgId);

    case "ok":
      return confirmDraft(link, ctx, draft, msgId);

    case "x":
      await clearDraft(tgUserId);
      if (msgId) await editText(link.chatId, msgId, "ยกเลิกรายการนี้แล้วค่ะ");
      return;

    case "q": {
      const [roomId, date, start, end] = rest;
      const next: Draft = { mode: "new", step: "title", roomId, date, start, end };
      await retireRoomCards(link, draft);
      return askTitle(link, ctx, next);
    }

    case "bc": {
      const b = await getOwnBooking(ctx, arg);
      if (!b || !msgId) return;
      return replaceMsg(link, msgId, `${bookingLine(b)}\n\nยกเลิกการจองนี้ใช่ไหมคะ`, [
        [{ text: "ยืนยันยกเลิก", data: `bcy:${b.id}` }, { text: "ไม่ยกเลิก", data: `bcn:${b.id}` }],
      ]);
    }

    case "bcy": {
      const res = await cancelForMember(ctx, arg, "ยกเลิกผ่าน Telegram");
      if (msgId) await replaceMsg(link, msgId, res.ok ? `${res.message}ค่ะ` : res.message);
      return;
    }

    case "bcn": {
      const b = await getOwnBooking(ctx, arg);
      if (b && msgId) await replaceMsg(link, msgId, bookingLine(b), bookingButtons(b));
      return;
    }

    case "bm": {
      const b = await getOwnBooking(ctx, arg);
      if (!b) return sendText(link.chatId, "ไม่พบการจองนี้แล้วค่ะ");
      const today = bkkDate(new Date());
      const own = bkkDate(b.startsAt);
      const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
      // Its own day first, so a booking weeks away can still move within that day.
      if (!days.includes(own)) days.unshift(own);
      await saveDraft(tgUserId, {
        mode: "move",
        step: "day",
        bookingId: b.id,
        roomId: b.roomId,
        title: b.title,
        date: bkkDate(b.startsAt),
      });
      return sendText(link.chatId, `ย้าย <b>${esc(b.title)}</b> (${esc(b.roomName)}) ไปวันไหนดีคะ`, {
        buttons: [
          ...chunk(
            days.map((d) => ({
              text:
                d === own
                  ? `วันเดิม (${thaiDay(d).replace(/^(\S+) /, "")})`
                  : d === today
                    ? "วันนี้"
                    : d === addDays(today, 1)
                      ? "พรุ่งนี้"
                      : thaiDay(d).replace(/^(\S+) /, ""),
              data: `d:${d}`,
            })),
            4,
          ),
          [{ text: "ไม่ย้ายแล้ว", data: "x" }],
        ],
      });
    }

    case "bn": {
      const b = await getOwnBooking(ctx, arg);
      if (!b) return;
      await saveDraft(tgUserId, { mode: "new", step: "rename", bookingId: b.id });
      return sendText(link.chatId, `ตอนนี้ชื่อ "${esc(b.title)}"\nพิมพ์ชื่อใหม่ได้เลยค่ะ`);
    }

    case "bx": {
      const [bookingId, minutes] = rest;
      const res = await extendForMember(ctx, bookingId, Number(minutes));
      if (msgId) await editButtons(link.chatId, msgId);
      return sendText(link.chatId, res.ok ? `${res.message}ค่ะ` : `${res.message}\nต่อเวลาไม่ได้นะคะ`);
    }

    case "be": {
      const res = await endNowForMember(ctx, arg);
      if (msgId) await editButtons(link.chatId, msgId);
      return sendText(link.chatId, res.ok ? `${res.message}ค่ะ ขอบคุณที่คืนห้องให้คนอื่นนะคะ` : res.message);
    }

    case "pf": {
      const p = { ...link.prefs };
      if (arg === "rb") p.remindBeforeMin = cycle(REMIND_STEPS, p.remindBeforeMin);
      if (arg === "ew") p.endWarnMin = cycle(ENDWARN_STEPS, p.endWarnMin);
      if (arg === "sa") p.startAlert = !p.startAlert;
      if (arg === "ea") p.endAlert = !p.endAlert;
      if (arg === "ex") p.externalAlerts = !p.externalAlerts;
      await saveTelegramLink({ ...link, prefs: p });
      const v = settingsView(p);
      if (msgId) await editText(link.chatId, msgId, v.text, v.kb);
      return;
    }

    case "unlink?":
      return sendText(link.chatId, "ยกเลิกการเชื่อมบัญชีใช่ไหมคะ\nหนูจะหยุดแจ้งเตือนทั้งหมด", {
        buttons: [[{ text: "ยืนยันยกเลิกการเชื่อม", data: "unlink!" }, { text: "ไม่ใช่", data: "noop" }]],
      });

    case "unlink!":
      await removeTelegramLink(tgUserId);
      if (msgId) await editButtons(link.chatId, msgId);
      return sendText(link.chatId, "ยกเลิกการเชื่อมแล้วค่ะ ถ้าจะกลับมาใช้ พิมพ์อีเมลที่ลงทะเบียนไว้ได้เลยนะคะ", {
        removeMenu: true,
      });

    case "op": {
      if (msgId) await editButtons(link.chatId, msgId);
      if (arg !== "ok" || !draft.pending) {
        await saveDraft(tgUserId, { ...draft, pending: undefined });
        return sendText(link.chatId, "โอเคค่ะ ไม่เปลี่ยนอะไรนะคะ");
      }
      const res = await runPendingOp(ctx, draft.pending);
      await saveDraft(tgUserId, { ...draft, pending: undefined });
      await pushHistory(tgUserId, { role: "bot", text: res.message });
      return sendText(link.chatId, res.ok ? `${res.message}ค่ะ` : res.message, { menu: true });
    }
  }
}

/** Edit a text message in place; photos (whose text is a caption) get a fresh message instead. */
async function replaceMsg(link: TelegramLink, msgId: number, text: string, kb?: Keyboard) {
  const res = await editText(link.chatId, msgId, text, kb);
  if (!res.ok) {
    await editButtons(link.chatId, msgId);
    await sendText(link.chatId, text, kb ? { buttons: kb } : {});
  }
}

function chunk<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

// ─── Finishing ─────────────────────────────────────────────────────────────

async function confirmDraft(link: TelegramLink, ctx: MemberCtx, draft: Draft, msgId?: number) {
  if (draft.step !== "confirm" || !draft.roomId || !draft.date || !draft.start || !draft.end) {
    return sendText(link.chatId, "รายการนี้หมดอายุแล้วค่ะ เริ่มใหม่ได้ที่ปุ่ม จองห้อง นะคะ", { menu: true });
  }
  // Two quick taps on "ยืนยัน" must not book twice.
  if (!(await kvAdd(`tgbot:lock:${link.tgUserId}:${draft.updatedAt ?? ""}`, 1))) return;
  if (msgId) await editButtons(link.chatId, msgId);

  if (draft.mode === "move" && draft.bookingId) {
    const res = await moveForMember(ctx, draft.bookingId, {
      date: draft.date,
      start: draft.start,
      end: draft.end,
      roomId: draft.roomId,
    });
    await clearDraft(link.tgUserId);
    await pushHistory(link.tgUserId, { role: "bot", text: res.message });
    return sendText(link.chatId, res.ok ? `${res.message}ค่ะ` : `${res.message}\nยังไม่ได้ย้ายนะคะ`, { menu: true });
  }

  await typing(link.chatId, "upload_photo");
  const res = await bookForMember(ctx, {
    roomId: draft.roomId,
    date: draft.date,
    start: draft.start,
    end: draft.end,
    title: draft.title ?? "ประชุม",
    repeatWeeks: draft.repeatWeeks,
    channel: "telegram",
  });
  if (!res.ok) {
    await saveDraft(link.tgUserId, { ...draft, step: "start" });
    return sendText(link.chatId, `ยังไม่ได้จองนะคะ ${esc(res.message)}`, {
      buttons: [[{ text: "เลือกเวลาใหม่", data: "s:" }, { text: "ดูห้องอื่น", data: `d:${draft.date}` }]],
    });
  }
  await clearDraft(link.tgUserId);
  await sendBookedSummary(link, ctx, {
    bookingId: res.bookingId,
    reference: res.reference,
    roomId: draft.roomId,
    roomName: res.roomName,
    startsAt: res.startsAt,
    endsAt: res.endsAt,
    hours: res.hours,
    title: draft.title ?? "ประชุม",
    weeks: draft.repeatWeeks ?? 1,
    created: res.created,
    skipped: res.skipped,
  });
}

export async function sendBookedSummary(
  link: TelegramLink,
  ctx: MemberCtx,
  b: {
    bookingId: string;
    reference: string;
    roomId: string;
    roomName: string;
    startsAt: string;
    endsAt: string;
    hours: number;
    title: string;
    weeks: number;
    created: number;
    skipped: number;
  },
) {
  const date = bkkDate(b.startsAt);
  const [rooms, usage, blocks, hours] = await Promise.all([
    listMemberRooms(),
    usageFor(ctx),
    listBlocks(date, date),
    getOpenHours(),
  ]);
  const room = rooms.find((r) => r.id === b.roomId);
  const photo = await fetchPhoto(room?.thumbnailUrl ?? null);
  const freeUntil = nextFreeAfter(blocks, b.roomId, b.endsAt, hours.close, date, b.bookingId);
  const quotaValue = usage.unlimited ? "ไม่จำกัด" : formatHours(usage.remainingHours!);
  const repeat =
    b.weeks > 1
      ? `ทุกสัปดาห์ ${b.created} ครั้ง${b.skipped ? ` (ข้าม ${b.skipped} ครั้งที่ไม่ว่าง)` : ""}`
      : null;

  let image: Buffer | null = null;
  try {
    image = renderSummary({
      heading: "จองสำเร็จ",
      title: b.title,
      roomName: b.roomName,
      roomColor: room?.color ?? "#2D4EF5",
      roomPhoto: photo?.data ?? null,
      roomPhotoType: photo?.type ?? null,
      dateLabel: thaiDay(date),
      timeLabel: `${bkkTime(b.startsAt)}–${bkkTime(b.endsAt)}`,
      durationLabel: `ใช้ห้อง ${formatHours(b.hours)}`,
      reference: b.reference,
      bookedBy: `${ctx.fullName} · ${ctx.orgName}`,
      lines: [
        { label: "โควตาบริษัทเหลือเดือนนี้", value: quotaValue },
        { label: "คุณจองเดือนนี้", value: formatHours(usage.myHours) },
        { label: "ห้องว่างต่อได้ถึง", value: `${freeUntil} น.` },
        ...(repeat ? [{ label: "จองซ้ำ", value: repeat }] : []),
      ],
      footnote: link.prefs.remindBeforeMin
        ? `หนูจะเตือนก่อนเริ่ม ${link.prefs.remindBeforeMin >= 60 ? `${link.prefs.remindBeforeMin / 60} ชั่วโมง` : `${link.prefs.remindBeforeMin} นาที`}`
        : undefined,
    });
  } catch (e) {
    console.error("[tgbot] summary render failed", e);
  }

  const caption = [
    "✅ จองแล้วค่ะ",
    "",
    `<b>${esc(b.roomName)} · ${thaiDay(date)} · ${bkkTime(b.startsAt)}–${bkkTime(b.endsAt)}</b>`,
    `ชื่อ: ${esc(b.title)}`,
    `รหัส <code>${b.reference}</code>`,
    repeat ? `จองซ้ำ${repeat}` : "",
    "",
    usage.unlimited
      ? `โควตาบริษัทไม่จำกัด เดือนนี้คุณใช้ไป ${formatHours(usage.myHours)}`
      : `เหลือโควตาเดือนนี้ ${quotaValue}`,
    `ห้องว่างต่อหลังประชุมได้ถึง ${freeUntil} น.`,
  ]
    .filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "")
    .join("\n");
  const buttons: Keyboard = [[{ text: "แก้เวลา", data: `bm:${b.bookingId}` }, { text: "ยกเลิก", data: `bc:${b.bookingId}` }]];
  if (image) await sendPhoto(link.chatId, image, caption, buttons);
  else await sendText(link.chatId, caption, { buttons });
  await pushHistory(link.tgUserId, { role: "bot", text: `จองแล้ว ${b.roomName} ${date} ${bkkTime(b.startsAt)}-${bkkTime(b.endsAt)} ${b.title} (${b.reference})` });
}
