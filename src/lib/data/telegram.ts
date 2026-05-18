import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { TelegramEventKey } from "@/lib/types";

export interface TelegramRoute {
  id: string;
  event_key: TelegramEventKey;
  group_id: string;
  topic_id: number | null;
  enabled: boolean;
  template: string | null;
}

export interface TelegramGroup {
  id: string;
  name: string;
  chat_id: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
}

export async function listTelegramGroups(): Promise<TelegramGroup[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telegram_groups")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as TelegramGroup[];
}

export async function listTelegramRoutes(): Promise<TelegramRoute[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telegram_routes")
    .select("*")
    .order("event_key");
  if (error) throw error;
  return (data ?? []) as unknown as TelegramRoute[];
}

/**
 * Returns (chat_id, topic_id) for the given event, or null if no route /
 * disabled / no group found.
 */
export async function getRouteForEvent(
  event: TelegramEventKey,
): Promise<{ chatId: string; topicId?: number } | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telegram_routes")
    .select("topic_id, enabled, group:telegram_groups(chat_id, is_active)")
    .eq("event_key", event)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    topic_id: number | null;
    enabled: boolean;
    group: { chat_id: string; is_active: boolean } | null;
  };
  if (!row.enabled || !row.group?.is_active) return null;
  return {
    chatId: row.group.chat_id,
    topicId: row.topic_id ?? undefined,
  };
}
