"use server";

import type {
  NotificationCategory,
  NotificationLevel,
  TelegramEventKey,
} from "@/lib/types";
import { telegramSend } from "@/lib/integrations/telegram";
import { getRouteForEvent } from "@/lib/data/telegram";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

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

const EVENT_TO_CATEGORY: Partial<Record<TelegramEventKey, NotificationCategory>> = {
  "booking.created": "system",
  "booking.updated": "system",
  "booking.cancelled": "system",
  "payment.paid": "finance",
  "payment.deposit": "finance",
  "payment.free": "finance",
  "payment.refund": "finance",
  "outstanding.alert": "finance",
  "finance.daily_brief": "ai_digest",
  "finance.weekly_summary": "ai_digest",
  "notification.time_alert": "time",
  "notification.system": "system",
  "internal.member_joined": "system",
  "internal.quota_alert": "system",
  "internal.no_show": "time",
};

/**
 * Creates an in-app notification row (no Telegram side-effect).
 * Use alongside `dispatchEvent` when an admin should see it in the bell icon.
 */
export async function createInAppNotification(input: {
  event?: TelegramEventKey;
  level: NotificationLevel;
  category?: NotificationCategory;
  title: string;
  body?: string;
  link?: string;
  relatedId?: string;
  recipientId?: string;
}) {
  const supabase = createSupabaseAdminClient();
  const category =
    input.category ??
    (input.event ? EVENT_TO_CATEGORY[input.event] ?? "system" : "system");
  await supabase.from("notifications").insert({
    recipient_id: input.recipientId ?? null,
    level: input.level,
    category,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    related_id: input.relatedId ?? null,
  } as never);
}

/** Fan-out helper: post to Telegram AND create in-app notification. */
export async function broadcastEvent(opts: {
  event: TelegramEventKey;
  text: string;
  inApp: {
    level: NotificationLevel;
    title: string;
    body?: string;
    link?: string;
    relatedId?: string;
  };
}) {
  const [telegram] = await Promise.all([
    dispatchEvent(opts.event, opts.text),
    createInAppNotification({
      event: opts.event,
      level: opts.inApp.level,
      title: opts.inApp.title,
      body: opts.inApp.body,
      link: opts.inApp.link,
      relatedId: opts.inApp.relatedId,
    }),
  ]);
  return { telegram };
}
