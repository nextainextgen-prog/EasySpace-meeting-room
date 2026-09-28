/**
 * LINE Messaging API (push Flex messages to customers) + LIFF identity.
 *
 * Push needs the OA's channel access token and the customer's userId. The
 * userId comes from LIFF: the browser hands us its LIFF access token, we ask
 * LINE whether that token was issued to *our* LIFF channel, then read the
 * profile with it. The client never gets to simply claim a userId.
 *
 * For the userId from LIFF to be pushable, the LINE Login channel that owns
 * the LIFF app and the Messaging API channel must sit under the same provider.
 */

import { getSecret } from "@/lib/server/secrets";

const API = "https://api.line.me";

export type LineMessage = Record<string, unknown>;

export async function linePush(
  to: string,
  messages: LineMessage[],
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const token = await getSecret("lineToken");
  if (!token) return { ok: false, status: 0, message: "not_configured" };
  try {
    const res = await fetch(`${API}/v2/bot/message/push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, messages }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    console.error("[line] push failed", res.status, json);
    return { ok: false, status: res.status, message: json?.message ?? `http_${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, message: (err as Error).message };
  }
}

export async function lineBotInfo(
  tokenOverride?: string,
): Promise<{ ok: true; displayName: string; basicId: string; pictureUrl?: string } | { ok: false; message: string }> {
  const token = tokenOverride ?? (await getSecret("lineToken"));
  if (!token) return { ok: false, message: "not_configured" };
  try {
    const res = await fetch(`${API}/v2/bot/info`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { displayName?: string; basicId?: string; pictureUrl?: string; message?: string }
      | null;
    if (res.ok && json?.basicId) {
      return { ok: true, displayName: json.displayName ?? "", basicId: json.basicId, pictureUrl: json.pictureUrl };
    }
    return { ok: false, message: json?.message ?? `http_${res.status}` };
  } catch {
    return { ok: false, message: "network_error" };
  }
}

/**
 * Turn a LIFF access token into a verified LINE userId.
 * The LIFF ID is `<login channel id>-<suffix>`; the token must belong to it.
 */
export async function resolveLiffUser(
  accessToken: string,
  liffId: string,
): Promise<{ ok: true; userId: string; displayName: string } | { ok: false; message: string }> {
  const channelId = liffId.split("-")[0];
  if (!accessToken || !channelId) return { ok: false, message: "missing" };
  try {
    const v = await fetch(
      `${API}/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(8_000), cache: "no-store" },
    );
    const vj = (await v.json().catch(() => null)) as { client_id?: string; expires_in?: number } | null;
    if (!v.ok || vj?.client_id !== channelId || !vj.expires_in || vj.expires_in <= 0) {
      return { ok: false, message: "invalid_token" };
    }
    const p = await fetch(`${API}/v2/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const pj = (await p.json().catch(() => null)) as { userId?: string; displayName?: string } | null;
    if (!p.ok || !pj?.userId) return { ok: false, message: "profile_failed" };
    return { ok: true, userId: pj.userId, displayName: pj.displayName ?? "" };
  } catch {
    return { ok: false, message: "network_error" };
  }
}
