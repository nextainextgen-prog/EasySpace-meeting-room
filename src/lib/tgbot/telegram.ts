/**
 * Thin Telegram Bot API client for the booking bot (@EasySpaceBookingBot).
 *
 * Separate from src/lib/integrations/telegram.ts, which posts to the staff
 * group with a different bot. Images are uploaded as bytes rather than linked,
 * so nothing the bot draws ever needs a public URL.
 *
 * Set TGBOT_DRY_RUN=1 (or call `startRecording`) and every call is captured
 * instead of sent — the test scripts read the transcript from there.
 */

export type Button = { text: string; data: string } | { text: string; url: string };
export type Keyboard = Button[][];

export interface Outgoing {
  method: string;
  payload: Record<string, unknown>;
  photo?: Buffer;
}

let recorder: Outgoing[] | null = null;
let fakeId = 1000;

export function startRecording(): Outgoing[] {
  recorder = [];
  return recorder;
}
export function stopRecording() {
  recorder = null;
}

function token(): string | null {
  return process.env.TGBOT_TOKEN?.trim() || null;
}

export function botConfigured(): boolean {
  return !!token();
}

function dryRun() {
  return recorder !== null || process.env.TGBOT_DRY_RUN === "1";
}

async function call<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
  photo?: Buffer,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  if (dryRun()) {
    const entry = { method, payload, photo };
    if (recorder) recorder.push(entry);
    else console.log("[tgbot:dry]", method, JSON.stringify(payload).slice(0, 400));
    return { ok: true, result: { message_id: ++fakeId } as T };
  }
  const t = token();
  if (!t) return { ok: false, description: "TGBOT_TOKEN not set" };
  const url = `https://api.telegram.org/bot${t}/${method}`;
  try {
    let res: Response;
    if (photo) {
      const form = new FormData();
      for (const [k, v] of Object.entries(payload)) {
        if (v === undefined || v === null) continue;
        form.append(k, typeof v === "string" ? v : JSON.stringify(v));
      }
      form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "image.png");
      res = await fetch(url, { method: "POST", body: form });
    } else {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) console.error(`[tgbot] ${method} failed:`, json.description);
    return json;
  } catch (e) {
    console.error(`[tgbot] ${method} threw:`, e);
    return { ok: false, description: String(e) };
  }
}

function inline(kb?: Keyboard) {
  if (!kb || kb.length === 0) return undefined;
  return {
    inline_keyboard: kb.map((row) =>
      row.map((b) => ("url" in b ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data })),
    ),
  };
}

/** The persistent menu under the text box. */
export const MAIN_MENU = {
  keyboard: [
    [{ text: "จองห้อง" }, { text: "ห้องว่างวันนี้" }],
    [{ text: "การจองของฉัน" }, { text: "สรุปการใช้งาน" }],
    [{ text: "ตั้งค่าแจ้งเตือน" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export async function sendText(
  chatId: string,
  text: string,
  opts: { buttons?: Keyboard; menu?: boolean; removeMenu?: boolean } = {},
) {
  const reply_markup = opts.buttons
    ? inline(opts.buttons)
    : opts.menu
      ? MAIN_MENU
      : opts.removeMenu
        ? { remove_keyboard: true }
        : undefined;
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup,
  });
}

export async function sendPhoto(
  chatId: string,
  photo: Buffer | string,
  caption: string,
  buttons?: Keyboard,
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    caption,
    parse_mode: "HTML",
    reply_markup: inline(buttons),
  };
  if (typeof photo === "string") return call<{ message_id: number }>("sendPhoto", { ...payload, photo });
  return call<{ message_id: number }>("sendPhoto", payload, photo);
}

export async function editText(chatId: string, messageId: number, text: string, buttons?: Keyboard) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: inline(buttons) ?? { inline_keyboard: [] },
  });
}

export async function editButtons(chatId: string, messageId: number, buttons?: Keyboard) {
  return call("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: inline(buttons) ?? { inline_keyboard: [] },
  });
}

export async function answerCallback(id: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id: id, text });
}

export async function typing(chatId: string, action: "typing" | "upload_photo" = "typing") {
  return call("sendChatAction", { chat_id: chatId, action });
}

export async function setupBot(webhookUrl: string, secret: string) {
  const commands = [
    { command: "book", description: "จองห้องประชุม" },
    { command: "free", description: "ดูห้องว่าง" },
    { command: "my", description: "การจองของฉัน" },
    { command: "usage", description: "สรุปการใช้งานและโควตา" },
    { command: "settings", description: "ตั้งค่าแจ้งเตือน" },
    { command: "help", description: "วิธีใช้" },
  ];
  const a = await call("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
  const b = await call("setMyCommands", { commands, language_code: "th" });
  const c = await call("setMyCommands", { commands });
  const d = await call("setMyDescription", {
    description:
      "น้องจอง ผู้ช่วยจองห้องประชุม EasySpace สำหรับพนักงานในตึก กด Start แล้วพิมพ์อีเมลที่ลงทะเบียนไว้เพื่อเชื่อมบัญชีค่ะ",
  });
  const e = await call("setMyShortDescription", {
    short_description: "จองห้องประชุม EasySpace ในแชตเดียว",
  });
  return { setWebhook: a, commandsTh: b, commands: c, description: d, shortDescription: e };
}
