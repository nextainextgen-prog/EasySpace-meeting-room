"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { recordAudit } from "./audit";
import type { Role } from "@/lib/types";

const RoleEnum = z.enum([
  "super_admin",
  "admin",
  "staff",
  "accountant",
  "marketing",
  "viewer",
]);

/** Invite a new admin user. Creates a Supabase Auth user (if SERVICE_ROLE
 *  available) + a profiles row. If auth.admin.createUser is unavailable
 *  in the env, falls back to inserting a profiles row only — the user can
 *  still sign in via magic link once auth is configured. */
const InviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  role: RoleEnum,
  twoFactorRequired: z.boolean().default(false),
  forcePasswordChange: z.boolean().default(true),
  ipWhitelist: z.array(z.string()).default([]),
  permissionsOverride: z.record(z.string(), z.boolean()).optional(),
  sendInviteEmail: z.boolean().default(true),
});

export async function inviteAdmin(raw: z.infer<typeof InviteSchema>) {
  const parsed = InviteSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false as const,
      error: "validation",
      issues: parsed.error.flatten(),
    };
  const input = parsed.data;
  const supabase = createSupabaseAdminClient();

  // Step 1: ensure auth user exists (best-effort)
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(
      input.email,
      input.sendInviteEmail
        ? undefined
        : { redirectTo: undefined },
    );
    if (!error && data?.user) {
      userId = data.user.id;
    }
  } catch {
    // service role may not be wired locally
  }

  if (!userId) {
    // Try to find existing auth user
    try {
      const { data } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 100,
      });
      const existing = data?.users?.find(
        (u) => u.email?.toLowerCase() === input.email.toLowerCase(),
      );
      if (existing) userId = existing.id;
    } catch {
      // ignore
    }
  }

  if (!userId) {
    return {
      ok: false as const,
      error: "auth_required",
    };
  }

  // Step 2: upsert profile
  const { error: profErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        email: input.email,
        full_name: input.fullName,
        phone: input.phone ?? null,
        role: input.role,
        is_active: true,
        two_factor_enabled: false,
      } as never,
      { onConflict: "id" },
    );
  if (profErr) return { ok: false as const, error: profErr.message };

  // Step 3: store metadata in settings (extras not in profiles schema)
  await supabase.from("settings").upsert(
    {
      key: `admin.${userId}`,
      value: {
        two_factor_required: input.twoFactorRequired,
        force_password_change: input.forcePasswordChange,
        ip_whitelist: input.ipWhitelist,
        permissions_override: input.permissionsOverride ?? {},
        invited_at: new Date().toISOString(),
        failed_attempts: 0,
        session_count: 0,
      } as never,
      category: "admin",
    } as never,
    { onConflict: "key" },
  );

  await recordAudit({
    action: "admin_invited",
    targetType: "profile",
    targetId: userId,
    changes: {
      email: input.email,
      role: input.role,
      two_factor_required: input.twoFactorRequired,
      ip_whitelist: input.ipWhitelist,
    },
  });

  revalidatePath("/admin/users");
  return { ok: true as const, userId };
}

const UpdateAdminSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().optional(),
  phone: z.string().nullable().optional(),
  role: RoleEnum.optional(),
  isActive: z.boolean().optional(),
  twoFactorRequired: z.boolean().optional(),
  forcePasswordChange: z.boolean().optional(),
  ipWhitelist: z.array(z.string()).optional(),
  permissionsOverride: z.record(z.string(), z.boolean()).optional(),
});

export async function updateAdmin(raw: z.infer<typeof UpdateAdminSchema>) {
  const parsed = UpdateAdminSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false as const, error: "validation" };
  const input = parsed.data;
  const supabase = createSupabaseAdminClient();

  const profilePatch: Record<string, unknown> = {};
  if (input.fullName !== undefined) profilePatch.full_name = input.fullName;
  if (input.phone !== undefined) profilePatch.phone = input.phone;
  if (input.role !== undefined) profilePatch.role = input.role;
  if (input.isActive !== undefined) profilePatch.is_active = input.isActive;

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update(profilePatch as never)
      .eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  }

  // Merge metadata
  const { data: existing } = await supabase
    .from("settings")
    .select("value")
    .eq("key", `admin.${input.id}`)
    .maybeSingle();
  const meta = ((existing as { value?: Record<string, unknown> } | null)
    ?.value ?? {}) as Record<string, unknown>;
  if (input.twoFactorRequired !== undefined)
    meta.two_factor_required = input.twoFactorRequired;
  if (input.forcePasswordChange !== undefined)
    meta.force_password_change = input.forcePasswordChange;
  if (input.ipWhitelist !== undefined) meta.ip_whitelist = input.ipWhitelist;
  if (input.permissionsOverride !== undefined)
    meta.permissions_override = input.permissionsOverride;
  await supabase.from("settings").upsert(
    {
      key: `admin.${input.id}`,
      value: meta as never,
      category: "admin",
    } as never,
    { onConflict: "key" },
  );

  await recordAudit({
    action: "admin_updated",
    targetType: "profile",
    targetId: input.id,
    changes: { profile: profilePatch, metadata: meta },
  });

  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function suspendAdmin(id: string, reason?: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: false } as never)
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  await recordAudit({
    action: "admin_suspended",
    targetType: "profile",
    targetId: id,
    reason,
  });
  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function restoreAdmin(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: true } as never)
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  await recordAudit({
    action: "admin_restored",
    targetType: "profile",
    targetId: id,
  });
  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function resendInviteEmail(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return { ok: false as const, error: "not_found" };
  const row = profile as { email: string; full_name: string | null };
  try {
    await supabase.auth.admin.inviteUserByEmail(row.email);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  await recordAudit({
    action: "admin_invite_resent",
    targetType: "profile",
    targetId: id,
  });
  return { ok: true as const };
}

function generateTempPassword(length = 12) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const picks = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ];
  for (let i = 4; i < length; i++) picks.push(all[bytes[i] % all.length]);
  for (let i = picks.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks.join("");
}

/** Force-set a password for an admin (super admin only). Returns the plain
 *  password so it can be shown once to the operator and shared out-of-band. */
export async function setAdminPassword(
  id: string,
  password?: string,
) {
  const supabase = createSupabaseAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return { ok: false as const, error: "not_found" };

  const pwd = password && password.length >= 8 ? password : generateTempPassword();

  const { error } = await supabase.auth.admin.updateUserById(id, {
    password: pwd,
    email_confirm: true,
  });
  if (error) return { ok: false as const, error: error.message };

  await recordAudit({
    action: "admin_password_set",
    targetType: "profile",
    targetId: id,
    changes: { generated: !password },
  });

  return {
    ok: true as const,
    password: pwd,
    email: (profile as { email: string }).email,
  };
}

/** Generate a one-time recovery link the operator can copy and DM to the
 *  admin (useful when Supabase SMTP is unconfigured / email bounces). */
export async function generateAdminResetLink(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return { ok: false as const, error: "not_found" };
  const email = (profile as { email: string }).email;

  const site =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    "";
  const redirectTo = site
    ? `${site.startsWith("http") ? site : `https://${site}`}/reset-password`
    : undefined;

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) return { ok: false as const, error: error.message };

  await recordAudit({
    action: "admin_reset_link_generated",
    targetType: "profile",
    targetId: id,
  });

  return {
    ok: true as const,
    email,
    actionLink: data?.properties?.action_link ?? null,
  };
}

/** Read per-admin metadata (failed_attempts / ip_whitelist / etc.) */
export async function getAdminMetadata(ids: string[]) {
  if (ids.length === 0) return {};
  const supabase = createSupabaseAdminClient();
  const keys = ids.map((id) => `admin.${id}`);
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", keys);
  const out: Record<string, Record<string, unknown>> = {};
  for (const row of (data ?? []) as Array<{
    key: string;
    value: Record<string, unknown>;
  }>) {
    out[row.key.replace("admin.", "")] = row.value;
  }
  return out;
}
