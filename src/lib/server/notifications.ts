"use server";

import type { TelegramEventKey } from "@/lib/types";
import { telegramSend } from "@/lib/integrations/telegram";
import { getRouteForEvent } from "@/lib/data/telegram";

/**
 * Look up the route for an event, send the formatted message.
 * Silently skips when no route is configured or disabled — never throws,
 * because notifications are side-effects and shouldn't fail the action.
 */
export async function dispatchEvent(event: TelegramEventKey, text: string) {
  try {
    const route = await getRouteForEvent(event);
    if (!route) {
      console.warn(`[notify] no route for ${event}`);
      return { ok: false, reason: "no_route" as const };
    }
    return await telegramSend({
      chatId: route.chatId,
      topicId: route.topicId,
      text,
      parseMode: "HTML",
    });
  } catch (err) {
    console.error(`[notify] ${event} failed`, err);
    return { ok: false, error: (err as Error).message };
  }
}
