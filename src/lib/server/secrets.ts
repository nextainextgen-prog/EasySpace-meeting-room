/**
 * Server-only credentials.
 *
 * Lookup order: environment variable first (Vercel project settings), then
 * the `app_secrets` table, which only the service role can read — so an admin
 * can paste a key in the back office without a redeploy.
 *
 * Never store these in `settings`: that table is readable with the public
 * anon key that ships to every browser.
 */

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

export const SECRET_KEYS = {
  easyslip: { key: "easyslip_api_key", env: "EASYSLIP_API_KEY" },
  lineToken: { key: "line_channel_access_token", env: "LINE_CHANNEL_ACCESS_TOKEN" },
} as const;

export type SecretName = keyof typeof SECRET_KEYS;

const cache = new Map<SecretName, { value: string | null; at: number }>();
const TTL_MS = 60_000;

export async function getSecret(name: SecretName): Promise<string | null> {
  const def = SECRET_KEYS[name];
  const fromEnv = process.env[def.env]?.trim();
  if (fromEnv) return fromEnv;

  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("app_secrets" as never)
    .select("value")
    .eq("key", def.key)
    .maybeSingle();
  // Table missing (migration 16 not run yet) reads as "not configured".
  const value = error ? null : ((data as { value?: string } | null)?.value ?? null);
  cache.set(name, { value, at: Date.now() });
  return value;
}

export async function setSecret(
  name: SecretName,
  value: string,
  updatedBy: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const def = SECRET_KEYS[name];
  const trimmed = value.trim();
  const { error } = trimmed
    ? await admin
        .from("app_secrets" as never)
        .upsert(
          { key: def.key, value: trimmed, updated_by: updatedBy, updated_at: new Date().toISOString() } as never,
          { onConflict: "key" },
        )
    : await admin.from("app_secrets" as never).delete().eq("key", def.key);
  cache.delete(name);
  if (error) {
    return {
      ok: false,
      error: /app_secrets/.test(error.message)
        ? "ยังไม่ได้รัน migration 00000000000016_online_payment.sql"
        : error.message,
    };
  }
  return { ok: true };
}

/** "b278••••957d" — enough to recognise a key, useless to steal. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/** Where a secret currently comes from, for the settings screen. */
export async function secretSource(name: SecretName): Promise<"env" | "db" | "none"> {
  if (process.env[SECRET_KEYS[name].env]?.trim()) return "env";
  return (await getSecret(name)) ? "db" : "none";
}
