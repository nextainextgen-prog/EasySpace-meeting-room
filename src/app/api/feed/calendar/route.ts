import { NextResponse } from "next/server";
import { feedBookings, feedKeyFrom, feedWindow, type FeedBooking } from "@/lib/server/booking-feed";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed/calendar?key=esf_… — the same bookings as an iCalendar feed,
 * for "Add calendar → From URL" in Google Calendar, Apple Calendar or
 * Outlook. 30 days back to 120 days ahead. Cancelled bookings drop out on the
 * next refresh (Google refreshes subscribed calendars every few hours).
 */
export async function GET(request: Request) {
  const key = await feedKeyFrom(request);
  if (!key) return new NextResponse("unauthorized", { status: 401 });
  const { from, to } = feedWindow(new URL(request.url), { back: 30, ahead: 120 });
  const bookings = await feedBookings(key, { from, to });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EasySpace//Booking feed//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(`EasySpace ห้องประชุม · ${key.scopeName}`)}`,
    "X-WR-TIMEZONE:Asia/Bangkok",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...bookings.flatMap(event),
    "END:VCALENDAR",
  ];
  return new NextResponse(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="easyspace-bookings.ics"',
      "Cache-Control": "no-store",
    },
  });
}

function event(b: FeedBooking): string[] {
  const who = [b.company, b.bookedBy].filter(Boolean).join(" · ");
  return [
    "BEGIN:VEVENT",
    `UID:${b.id}@easyspace`,
    `DTSTAMP:${stamp(b.updatedAt)}`,
    `LAST-MODIFIED:${stamp(b.updatedAt)}`,
    `DTSTART:${stamp(b.startsAt)}`,
    `DTEND:${stamp(b.endsAt)}`,
    `SUMMARY:${text([b.room, b.title || who].filter(Boolean).join(" · "))}`,
    `LOCATION:${text(b.room)}`,
    `DESCRIPTION:${text([`รหัสการจอง ${b.reference}`, who && `ผู้จอง ${who}`].filter(Boolean).join("\n"))}`,
    `STATUS:${b.status === "pending" ? "TENTATIVE" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545: lines over 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
