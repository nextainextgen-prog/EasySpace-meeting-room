// Test double for @/lib/server/notifications — records instead of sending, so
// an end-to-end run never posts to the real Telegram group.
export const sent: Array<{ kind: string; payload: unknown }> = [];
export async function dispatchEvent(event: string, text: string) {
  sent.push({ kind: `telegram:${event}`, payload: text });
  return { ok: true as const };
}
export async function createInAppNotification(input: unknown) {
  sent.push({ kind: "in_app", payload: input });
}
export async function broadcastEvent() { return { telegram: { ok: true } }; }
