import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { NotificationCategory, NotificationLevel } from "@/lib/types";

export interface NotificationRow {
  id: string;
  recipient_id: string | null;
  level: NotificationLevel;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string | null;
  related_id: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export async function listNotifications(opts: {
  recipientId?: string;
  limit?: number;
  category?: NotificationCategory;
} = {}): Promise<NotificationRow[]> {
  const supabase = createSupabaseAdminClient();
  let q = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.recipientId) q = q.eq("recipient_id", opts.recipientId);
  if (opts.category) q = q.eq("category", opts.category);
  const { data } = await q;
  return (data ?? []) as unknown as NotificationRow[];
}

export async function notificationCountsByCategory(recipientId?: string) {
  const supabase = createSupabaseAdminClient();
  let q = supabase.from("notifications").select("category");
  if (recipientId) q = q.eq("recipient_id", recipientId);
  const { data } = await q;
  const rows = (data ?? []) as Array<{ category: NotificationCategory }>;
  const counts: Record<NotificationCategory | "all", number> = {
    all: rows.length,
    time: 0,
    finance: 0,
    ai_digest: 0,
    ai_insight: 0,
    system: 0,
  };
  for (const r of rows) counts[r.category]++;
  return counts;
}
