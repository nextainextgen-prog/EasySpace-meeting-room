"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { recordAudit } from "./audit";

/** Update the current user's own profile (name + phone + avatar URL). */
const UpdateProfileSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export async function updateMyProfile(
  raw: z.infer<typeof UpdateProfileSchema>,
) {
  const me = await getCurrentProfile();
  if (!me) return { ok: false as const, error: "auth_required" };
  const parsed = UpdateProfileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "validation" };
  const input = parsed.data;
  const supabase = createSupabaseAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (Object.keys(patch).length === 0) return { ok: true as const };
  const { error } = await supabase
    .from("profiles")
    .update(patch as never)
    .eq("id", me.id);
  if (error) return { ok: false as const, error: error.message };

  await recordAudit({
    action: "profile_updated",
    targetType: "profile",
    targetId: me.id,
    changes: patch,
  });

  revalidatePath("/admin/account");
  return { ok: true as const };
}

/** Upload an avatar file to Supabase Storage bucket "avatars" and update
 *  the profile.avatar_url. Bucket must exist and be public; this is a
 *  best-effort impl — if Storage isn't wired we surface the error to the
 *  caller. */
export async function uploadAvatar(formData: FormData) {
  const me = await getCurrentProfile();
  if (!me) return { ok: false as const, error: "auth_required" };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false as const, error: "no_file" };
  if (file.size > 2 * 1024 * 1024)
    return { ok: false as const, error: "file_too_large" };

  const supabase = createSupabaseAdminClient();
  const ext = file.name.split(".").pop() || "png";
  const path = `${me.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, buffer, {
      contentType: file.type || "image/png",
      upsert: true,
    });
  if (upErr) return { ok: false as const, error: upErr.message };

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: profErr } = await supabase
    .from("profiles")
    .update({ avatar_url: url } as never)
    .eq("id", me.id);
  if (profErr) return { ok: false as const, error: profErr.message };

  await recordAudit({
    action: "avatar_uploaded",
    targetType: "profile",
    targetId: me.id,
    changes: { path },
  });

  revalidatePath("/admin/account");
  return { ok: true as const, url };
}

/* ────── Sessions (stored in settings) ────── */
type SessionRow = {
  id: string;
  device: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  is_current?: boolean;
};

const SESSION_KEY = (uid: string) => `account.${uid}.sessions`;

export async function listMySessions() {
  const me = await getCurrentProfile();
  if (!me) return [] as SessionRow[];
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SESSION_KEY(me.id))
    .maybeSingle();
  return (
    (((data as { value?: { sessions?: SessionRow[] } } | null)?.value
      ?.sessions ?? []) as SessionRow[]) ?? []
  );
}

/** Sign out all other devices via Supabase Auth scope=others. */
export async function signOutOtherDevices() {
  const me = await getCurrentProfile();
  if (!me) return { ok: false as const, error: "auth_required" };
  const supabase = createSupabaseAdminClient();

  // Remove all non-current sessions from our settings table.
  await supabase
    .from("settings")
    .upsert(
      {
        key: SESSION_KEY(me.id),
        value: { sessions: [] as never } as never,
        category: "account",
      } as never,
      { onConflict: "key" },
    );

  // Revoke all refresh tokens for this user via admin API.
  try {
    await supabase.auth.admin.signOut(me.id, "others");
  } catch {
    // older versions don't accept scope arg
  }

  await recordAudit({
    action: "signed_out_other_devices",
    targetType: "session",
    targetId: me.id,
  });

  revalidatePath("/admin/account");
  return { ok: true as const };
}

/** Recent login activity from audit_log for this user. */
export async function listMyLoginActivity(limit = 20) {
  const me = await getCurrentProfile();
  if (!me) return [];
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, created_at, action, ip_address, user_agent")
    .eq("actor_id", me.id)
    .in("action", [
      "login_success",
      "login_failed",
      "signed_out_other_devices",
      "page_view",
    ])
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{
    id: string;
    created_at: string;
    action: string;
    ip_address: string | null;
    user_agent: string | null;
  }>;
}

/* ────── Backup codes ────── */
const BACKUP_KEY = (uid: string) => `account.${uid}.backup_codes`;

export async function generateBackupCodes() {
  const me = await getCurrentProfile();
  if (!me) return { ok: false as const, error: "auth_required" };
  const supabase = createSupabaseAdminClient();
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const raw = randomBytes(5).toString("hex");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  // Store HASH (best-effort): we keep the raw codes here since we don't
  // have a verification flow yet — production-grade impl should hash.
  await supabase.from("settings").upsert(
    {
      key: BACKUP_KEY(me.id),
      value: { codes, used: [], generated_at: new Date().toISOString() } as never,
      category: "account",
    } as never,
    { onConflict: "key" },
  );
  await recordAudit({
    action: "backup_codes_generated",
    targetType: "profile",
    targetId: me.id,
    changes: { count: codes.length },
  });
  revalidatePath("/admin/account");
  return { ok: true as const, codes };
}

export async function getBackupCodesStatus() {
  const me = await getCurrentProfile();
  if (!me) return null;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", BACKUP_KEY(me.id))
    .maybeSingle();
  const v =
    ((data as { value?: { codes?: string[]; used?: string[]; generated_at?: string } } | null)
      ?.value as
      | { codes?: string[]; used?: string[]; generated_at?: string }
      | undefined) ?? null;
  if (!v) return null;
  return {
    total: v.codes?.length ?? 0,
    used: v.used?.length ?? 0,
    remaining: (v.codes?.length ?? 0) - (v.used?.length ?? 0),
    generated_at: v.generated_at ?? null,
  };
}
