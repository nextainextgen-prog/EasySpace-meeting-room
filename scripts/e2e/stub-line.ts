// Test double for @/lib/integrations/line-messaging — records pushes instead
// of messaging real customers, and treats any "tok-<userId>" as a valid LIFF
// access token for that user.
export type LineMessage = Record<string, unknown>;
export const pushed: Array<{ to: string; messages: LineMessage[] }> = [];
export async function linePush(to: string, messages: LineMessage[]) {
  pushed.push({ to, messages });
  return { ok: true as const };
}
export async function lineBotInfo() {
  return { ok: true as const, displayName: "stub", basicId: "@stub" };
}
export async function resolveLiffUser(accessToken: string) {
  return accessToken.startsWith("tok-")
    ? { ok: true as const, userId: accessToken.slice(4), displayName: "E2E LINE" }
    : { ok: false as const, message: "invalid_token" };
}
