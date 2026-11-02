// Test double for @/lib/integrations/google-calendar — never writes to the shared calendar.
export async function createCalendarEvent() {
  return { ok: false as const, error: "e2e" };
}
export async function deleteCalendarEvent() {
  return { ok: true as const };
}
