/**
 * Google Calendar integration — stubbed until OAuth credentials are provided.
 *
 * Once the user finishes Google Cloud setup (Client ID, Secret, redirect URI),
 * implement OAuth flow in `/api/auth/callback/google` and use the access token
 * here to create/update events via the Google Calendar v3 API.
 */

export interface CalendarEventInput {
  summary: string;
  description?: string;
  start: string; // ISO
  end: string; // ISO
  attendees?: string[];
  location?: string;
}

export async function createCalendarEvent(_input: CalendarEventInput) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return { ok: false, skipped: true, reason: "google_oauth_not_configured" };
  }
  // TODO: implement with googleapis once OAuth is wired
  return { ok: false, skipped: true, reason: "not_implemented" };
}
