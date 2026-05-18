import type { TelegramEventKey } from "@/lib/types";

const API_BASE = "https://api.telegram.org";

interface SendOpts {
  chatId: string;
  /** message_thread_id for supergroup forum topics */
  topicId?: number;
  text: string;
  parseMode?: "Markdown" | "HTML" | "MarkdownV2";
  disablePreview?: boolean;
}

/** Low-level send. */
export async function telegramSend(opts: SendOpts) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — message dropped");
    return { ok: false, skipped: true };
  }

  const body: Record<string, unknown> = {
    chat_id: opts.chatId,
    text: opts.text,
    disable_web_page_preview: opts.disablePreview ?? true,
  };
  if (opts.topicId) body.message_thread_id = opts.topicId;
  if (opts.parseMode) body.parse_mode = opts.parseMode;

  const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error("[telegram] send failed", json);
    throw new Error(`Telegram API error: ${json.description}`);
  }
  return json;
}

/**
 * Route an event to its configured (chatId, topicId) pair.
 * The mapping lives in Supabase `telegram_routes` table and admin can edit it.
 *
 * For now this function takes the mapping inline — the caller (an event
 * dispatcher) is responsible for looking it up.
 */
export async function notifyEvent(
  event: TelegramEventKey,
  text: string,
  route: { chatId: string; topicId?: number } | null,
) {
  if (!route) {
    console.warn(`[telegram] no route configured for ${event}`);
    return { ok: false, skipped: true };
  }
  return telegramSend({
    chatId: route.chatId,
    topicId: route.topicId,
    text,
    parseMode: "HTML",
  });
}

/**
 * Helper: escape HTML for Telegram safe content.
 */
export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
