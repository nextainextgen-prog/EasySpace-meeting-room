/**
 * Small key-value store for the Telegram booking bot.
 *
 * Rows live in `app_secrets` under the `tgbot:` prefix. That table is the one
 * place only the service role can read (RLS on, anon and authenticated
 * revoked), which is what chat ids, conversation history and pending jobs
 * need — and it already exists, so the bot ships without a migration.
 *
 *   tgbot:link:<tgUserId>      { memberId, chatId, email, prefs, ... }
 *   tgbot:member:<memberId>    "<tgUserId>"   (reverse index)
 *   tgbot:sess:<tgUserId>      the booking draft in progress
 *   tgbot:hist:<tgUserId>      last messages, for the AI's context
 *   tgbot:q:<ms>:<updateId>    a typed message waiting for the AI worker
 *   tgbot:sent:<key>           reminders already delivered
 *   tgbot:seen:<updateId>      Telegram retries, deduplicated
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

const TABLE = "app_secrets" as never;

export async function kvGet<T>(key: string): Promise<T | null> {
  const { data } = await createSupabaseAdminClient()
    .from(TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const raw = (data as { value?: string } | null)?.value;
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await createSupabaseAdminClient()
    .from(TABLE)
    .upsert(
      { key, value: JSON.stringify(value), updated_at: new Date().toISOString() } as never,
      { onConflict: "key" },
    );
}

/** Insert only if absent. Returns false when the key already existed. */
export async function kvAdd(key: string, value: unknown): Promise<boolean> {
  const { error } = await createSupabaseAdminClient()
    .from(TABLE)
    .insert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() } as never);
  return !error;
}

export async function kvDel(key: string): Promise<void> {
  await createSupabaseAdminClient().from(TABLE).delete().eq("key", key);
}

/** Delete and return in one statement — the row goes to exactly one caller. */
export async function kvTake<T>(key: string): Promise<T | null> {
  const { data } = await createSupabaseAdminClient()
    .from(TABLE)
    .delete()
    .eq("key", key)
    .select("value");
  const raw = ((data ?? []) as Array<{ value: string }>)[0]?.value;
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvList<T>(
  prefix: string,
  opts: { limit?: number; olderThan?: string } = {},
): Promise<Array<{ key: string; value: T; updatedAt: string }>> {
  let q = createSupabaseAdminClient()
    .from(TABLE)
    .select("key, value, updated_at")
    .like("key", `${prefix}%`)
    .order("key")
    .limit(opts.limit ?? 500);
  if (opts.olderThan) q = q.lt("updated_at", opts.olderThan);
  const { data } = await q;
  const out: Array<{ key: string; value: T; updatedAt: string }> = [];
  for (const r of (data ?? []) as Array<{ key: string; value: string; updated_at: string }>) {
    try {
      out.push({ key: r.key, value: JSON.parse(r.value) as T, updatedAt: r.updated_at });
    } catch {
      // skip unreadable rows
    }
  }
  return out;
}

export async function kvPurge(prefix: string, olderThan: string): Promise<void> {
  await createSupabaseAdminClient()
    .from(TABLE)
    .delete()
    .like("key", `${prefix}%`)
    .lt("updated_at", olderThan);
}

// ─── Links ─────────────────────────────────────────────────────────────────

export interface ReminderPrefs {
  /** Minutes before start for the "ใกล้ถึงเวลา" notice; 0 turns it off. */
  remindBeforeMin: number;
  startAlert: boolean;
  /** Minutes before end; 0 turns it off. */
  endWarnMin: number;
  endAlert: boolean;
  /** Tell me when an outside customer books a room. */
  externalAlerts: boolean;
}

export const DEFAULT_PREFS: ReminderPrefs = {
  remindBeforeMin: 60,
  startAlert: true,
  endWarnMin: 10,
  endAlert: true,
  externalAlerts: true,
};

export interface TelegramLink {
  tgUserId: string;
  chatId: string;
  memberId: string;
  email: string;
  username: string | null;
  firstName: string | null;
  linkedAt: string;
  prefs: ReminderPrefs;
}

export async function getTelegramLink(
  by: { tgUserId: string } | { memberId: string },
): Promise<TelegramLink | null> {
  let tgUserId: string | null = null;
  if ("tgUserId" in by) tgUserId = by.tgUserId;
  else tgUserId = await kvGet<string>(`tgbot:member:${by.memberId}`);
  if (!tgUserId) return null;
  const link = await kvGet<TelegramLink>(`tgbot:link:${tgUserId}`);
  if (!link) return null;
  return { ...link, prefs: { ...DEFAULT_PREFS, ...(link.prefs ?? {}) } };
}

export async function saveTelegramLink(link: TelegramLink): Promise<string | null> {
  // One chat per member: a new link replaces whatever chat held it before.
  const previous = await kvGet<string>(`tgbot:member:${link.memberId}`);
  if (previous && previous !== link.tgUserId) await kvDel(`tgbot:link:${previous}`);
  await kvSet(`tgbot:link:${link.tgUserId}`, link);
  await kvSet(`tgbot:member:${link.memberId}`, link.tgUserId);
  return previous && previous !== link.tgUserId ? previous : null;
}

export async function removeTelegramLink(tgUserId: string): Promise<void> {
  const link = await kvGet<TelegramLink>(`tgbot:link:${tgUserId}`);
  await kvDel(`tgbot:link:${tgUserId}`);
  if (link) {
    const current = await kvGet<string>(`tgbot:member:${link.memberId}`);
    if (current === tgUserId) await kvDel(`tgbot:member:${link.memberId}`);
  }
  await kvDel(`tgbot:sess:${tgUserId}`);
  await kvDel(`tgbot:hist:${tgUserId}`);
}

export async function listTelegramLinks(): Promise<TelegramLink[]> {
  const rows = await kvList<TelegramLink>("tgbot:link:");
  return rows.map((r) => ({ ...r.value, prefs: { ...DEFAULT_PREFS, ...(r.value.prefs ?? {}) } }));
}

// ─── Conversation ──────────────────────────────────────────────────────────

export interface HistoryLine {
  role: "user" | "bot";
  text: string;
  at: string;
}

export async function pushHistory(tgUserId: string, line: Omit<HistoryLine, "at">) {
  const key = `tgbot:hist:${tgUserId}`;
  const prev = (await kvGet<HistoryLine[]>(key)) ?? [];
  const next = [...prev, { ...line, text: line.text.slice(0, 600), at: new Date().toISOString() }].slice(-10);
  await kvSet(key, next);
}

export async function getHistory(tgUserId: string): Promise<HistoryLine[]> {
  return (await kvGet<HistoryLine[]>(`tgbot:hist:${tgUserId}`)) ?? [];
}
