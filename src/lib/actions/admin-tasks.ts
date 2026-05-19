"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";

const taskInput = z.object({
  title: z.string().trim().min(1, "ตั้งชื่อ task"),
  detail: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  due_date: z.string().optional().nullable(),
  related_url: z.string().optional().nullable(),
});

export type AdminTaskInput = z.infer<typeof taskInput>;

export async function createAdminTask(input: AdminTaskInput) {
  const parsed = taskInput.parse(input);
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("auth_required");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("admin_tasks").insert({
    owner_id: profile.id,
    title: parsed.title,
    detail: parsed.detail ?? null,
    priority: parsed.priority,
    due_date: parsed.due_date ?? null,
    related_url: parsed.related_url ?? null,
  } as never);
  if (error) {
    // Migration not applied yet — fall back silently so dashboard still works
    if (error.message.includes("admin_tasks")) {
      return { ok: false as const, error: "table_missing" };
    }
    throw new Error(error.message);
  }
  revalidatePath("/admin/dashboard");
  return { ok: true as const };
}

export async function toggleAdminTask(id: string, isDone: boolean) {
  const supabase = createSupabaseAdminClient();
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("auth_required");
  const { error } = await supabase
    .from("admin_tasks")
    .update({
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null,
    } as never)
    .eq("id", id)
    .eq("owner_id", profile.id);
  if (error && !error.message.includes("admin_tasks"))
    throw new Error(error.message);
  revalidatePath("/admin/dashboard");
  return { ok: true as const };
}

export async function deleteAdminTask(id: string) {
  const supabase = createSupabaseAdminClient();
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("auth_required");
  const { error } = await supabase
    .from("admin_tasks")
    .delete()
    .eq("id", id)
    .eq("owner_id", profile.id);
  if (error && !error.message.includes("admin_tasks"))
    throw new Error(error.message);
  revalidatePath("/admin/dashboard");
  return { ok: true as const };
}
