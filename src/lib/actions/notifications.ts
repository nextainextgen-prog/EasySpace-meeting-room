"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";

export async function markNotificationRead(id: string) {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .eq("id", id);
  revalidatePath("/admin/notifications");
  return { ok: true as const };
}

export async function markAllNotificationsRead() {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .is("read_at", null);
  revalidatePath("/admin/notifications");
  return { ok: true as const };
}

export async function dismissNotification(id: string) {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("notifications")
    .update({ resolved_at: new Date().toISOString() } as never)
    .eq("id", id);
  revalidatePath("/admin/notifications");
  return { ok: true as const };
}

/** Resolve all open notifications related to a booking — used when a booking
 *  is cancelled / moved so stale time-alerts auto-dismiss. */
export async function resolveNotificationsForBooking(bookingId: string) {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("notifications")
    .update({ resolved_at: new Date().toISOString() } as never)
    .eq("related_id", bookingId)
    .is("resolved_at", null);
  return { ok: true as const };
}

export interface QuietHours {
  enabled: boolean;
  start: string; // "22:00"
  end: string; // "08:00"
}

export async function getQuietHours(): Promise<QuietHours> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "notifications.quiet_hours")
    .maybeSingle();
  const value = (data as { value?: QuietHours } | null)?.value;
  return value ?? { enabled: false, start: "22:00", end: "08:00" };
}

export async function setQuietHours(input: QuietHours) {
  const supabase = createSupabaseAdminClient();
  const me = await getCurrentProfile();
  await supabase.from("settings").upsert(
    {
      key: "notifications.quiet_hours",
      value: input as never,
      category: "notifications",
      updated_by: me?.id ?? null,
    } as never,
    { onConflict: "key" },
  );
  revalidatePath("/admin/notifications");
  return { ok: true as const };
}

/** Read trigger on/off state from settings; falls back to all-on. */
export async function getTriggerToggles(): Promise<Record<string, boolean>> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "notifications.triggers")
    .maybeSingle();
  return (
    ((data as { value?: Record<string, boolean> } | null)?.value as
      | Record<string, boolean>
      | undefined) ?? {}
  );
}

export async function setTriggerToggle(id: string, enabled: boolean) {
  const supabase = createSupabaseAdminClient();
  const me = await getCurrentProfile();
  const existing = await getTriggerToggles();
  const next = { ...existing, [id]: enabled };
  await supabase.from("settings").upsert(
    {
      key: "notifications.triggers",
      value: next as never,
      category: "notifications",
      updated_by: me?.id ?? null,
    } as never,
    { onConflict: "key" },
  );
  revalidatePath("/admin/notifications");
  return { ok: true as const };
}
