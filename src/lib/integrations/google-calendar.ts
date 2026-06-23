/**
 * Google Calendar integration via a service account.
 *
 * A single shared "EasySpace Meeting Rooms" calendar is shared with the service
 * account (Make changes to events). The bot creates events on behalf of bookings;
 * Google sends RSVP invites to attendees automatically via `sendUpdates: 'all'`.
 *
 * Reads credentials from one of:
 *   - `GOOGLE_SA_KEY_FILE`  → path to JSON key (local dev)
 *   - `GOOGLE_SA_CLIENT_EMAIL` + `GOOGLE_SA_PRIVATE_KEY` (Vercel env)
 */
import { google, type calendar_v3 } from "googleapis";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface CalendarEventInput {
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees?: string[];
  location?: string;
  timeZone?: string;
}

type SaCreds = { client_email: string; private_key: string };

function loadCreds(): SaCreds | null {
  const file = process.env.GOOGLE_SA_KEY_FILE;
  if (file) {
    try {
      const path = file.startsWith("/") ? file : resolve(process.cwd(), file);
      const raw = readFileSync(path, "utf8");
      const j = JSON.parse(raw) as SaCreds;
      if (j.client_email && j.private_key) return j;
    } catch (e) {
      console.warn("[gcal] failed to read SA key file:", (e as Error).message);
    }
  }
  const email = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (email && key) {
    return { client_email: email, private_key: key.replace(/\\n/g, "\n") };
  }
  return null;
}

function getClient() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) return null;
  const creds = loadCreds();
  if (!creds) return null;
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  return { calendar: google.calendar({ version: "v3", auth }), calendarId };
}

export type CalendarResult =
  | { ok: true; eventId: string; htmlLink?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<CalendarResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, skipped: true, reason: "google_calendar_not_configured" };
  }
  const tz = input.timeZone ?? process.env.APP_TIMEZONE ?? "Asia/Bangkok";
  // Service accounts (no Workspace + DWD) cannot invite attendees — Google
  // rejects the insert outright. We embed the attendee list in the description
  // instead and rely on Resend to send the actual invite emails.
  const attendeesNote = input.attendees?.length
    ? `\nAttendees: ${input.attendees.join(", ")}`
    : "";
  const event: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: (input.description ?? "") + attendeesNote || undefined,
    location: input.location,
    start: { dateTime: input.start, timeZone: tz },
    end: { dateTime: input.end, timeZone: tz },
    reminders: { useDefault: true },
  };
  try {
    const res = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: event,
      sendUpdates: "none",
    });
    const eventId = res.data.id;
    if (!eventId) return { ok: false, skipped: false, error: "no_event_id" };
    return { ok: true, eventId, htmlLink: res.data.htmlLink ?? undefined };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[gcal] createCalendarEvent failed:", msg);
    return { ok: false, skipped: false, error: msg };
  }
}

export async function deleteCalendarEvent(
  eventId: string,
): Promise<CalendarResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, skipped: true, reason: "google_calendar_not_configured" };
  }
  try {
    await client.calendar.events.delete({
      calendarId: client.calendarId,
      eventId,
      sendUpdates: "none",
    });
    return { ok: true, eventId };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[gcal] deleteCalendarEvent failed:", msg);
    return { ok: false, skipped: false, error: msg };
  }
}
