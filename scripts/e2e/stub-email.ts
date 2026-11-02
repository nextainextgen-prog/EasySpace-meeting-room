// Test double for @/lib/email — no mail leaves the machine.
export const mailed: Array<{ to: string; subject: string }> = [];
export async function sendEmail(input: { to: string; subject: string }) {
  mailed.push({ to: input.to, subject: input.subject });
  return { ok: true as const };
}
export function meetingInviteEmail(p: { title: string }) {
  return { subject: `invite ${p.title}`, html: "", text: "" };
}
export function bookingConfirmationEmail() {
  return { subject: "confirm", html: "", text: "" };
}
export const DEFAULT_FROM = "test";
