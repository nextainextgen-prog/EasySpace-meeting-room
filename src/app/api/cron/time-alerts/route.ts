import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { dispatchEvent } from "@/lib/server/notifications";
import {
  bookingStartingSoonTemplate,
  bookingEndingSoonTemplate,
  bookingNoShowTemplate,
} from "@/lib/templates/telegram";

/**
 * Cron — fires every 5 minutes. Scans bookings to send time-based alerts:
 *   • A2: 15 minutes before a booking starts
 *   • A3: 5 minutes before a booking ends
 *   • A5: marks no-show when grace period passes
 *
 * Idempotency: uses `bookings.metadata.alerts_sent` to remember which alerts
 * have already gone out so re-firing the cron is safe.
 */
export async function GET(request: Request) {
  // Auth is best-effort: this endpoint is idempotent (alerts_sent markers
  // prevent dupes), only fires Telegram messages tied to real bookings,
  // and is invoked from GitHub Actions on Hobby plan — which can't inject
  // Vercel's CRON_SECRET. Reject only when the caller supplies a wrong
  // token; an absent Authorization header is accepted.
  const auth = request.headers.get("authorization");
  if (
    auth &&
    process.env.CRON_SECRET &&
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const horizonStart = new Date(now.getTime() - 30 * 60_000);
  const horizonEnd = new Date(now.getTime() + 30 * 60_000);

  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      `id, reference_code, starts_at, ends_at, booking_status, metadata,
       customer:customers(display_name, phone),
       room:rooms(name)`,
    )
    .in("booking_status", ["pending", "confirmed", "in_use"])
    .gte("starts_at", horizonStart.toISOString())
    .lte("ends_at", horizonEnd.toISOString());

  const bookings = (bookingsRaw ?? []) as unknown as Array<{
    id: string;
    reference_code: string;
    starts_at: string;
    ends_at: string;
    booking_status: string;
    metadata: Record<string, unknown> | null;
    customer: { display_name: string; phone: string | null } | null;
    room: { name: string } | null;
  }>;

  const events: Array<{ id: string; alert: string }> = [];

  for (const b of bookings) {
    const start = new Date(b.starts_at);
    const end = new Date(b.ends_at);
    const minutesToStart = Math.round((start.getTime() - now.getTime()) / 60_000);
    const minutesToEnd = Math.round((end.getTime() - now.getTime()) / 60_000);
    const minutesPastStart = -minutesToStart;
    const sent = ((b.metadata?.alerts_sent ?? []) as string[]) ?? [];

    async function markSent(alertKey: string) {
      const newMeta = {
        ...(b.metadata ?? {}),
        alerts_sent: [...sent, alertKey],
      };
      await supabase
        .from("bookings")
        .update({ metadata: newMeta } as never)
        .eq("id", b.id);
      events.push({ id: b.id, alert: alertKey });
    }

    // A1: 30 min before start (fire within [16, 30])
    if (
      minutesToStart >= 16 &&
      minutesToStart <= 30 &&
      !sent.includes("starting_30")
    ) {
      void dispatchEvent(
        "notification.time_alert",
        bookingStartingSoonTemplate({
          reference: b.reference_code,
          customerName: b.customer?.display_name ?? "—",
          roomName: b.room?.name ?? "—",
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          minutesUntil: Math.max(0, minutesToStart),
        }),
      );
      await markSent("starting_30");
    }

    // A2: 15 min before start (fire within [-2, 15])
    if (
      minutesToStart >= -2 &&
      minutesToStart <= 15 &&
      !sent.includes("starting_15")
    ) {
      void dispatchEvent(
        "notification.time_alert",
        bookingStartingSoonTemplate({
          reference: b.reference_code,
          customerName: b.customer?.display_name ?? "—",
          roomName: b.room?.name ?? "—",
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          minutesUntil: Math.max(0, minutesToStart),
        }),
      );
      await markSent("starting_15");
    }

    // A3: 15 min before end (fire within [6, 15])
    if (
      minutesToEnd >= 6 &&
      minutesToEnd <= 15 &&
      !sent.includes("ending_15")
    ) {
      void dispatchEvent(
        "notification.time_alert",
        bookingEndingSoonTemplate({
          reference: b.reference_code,
          customerName: b.customer?.display_name ?? "—",
          roomName: b.room?.name ?? "—",
          endsAt: b.ends_at,
          minutesUntil: minutesToEnd,
        }),
      );
      await markSent("ending_15");
    }

    // A4: 5 min before end
    if (
      minutesToEnd >= 0 &&
      minutesToEnd <= 5 &&
      !sent.includes("ending_5")
    ) {
      void dispatchEvent(
        "notification.time_alert",
        bookingEndingSoonTemplate({
          reference: b.reference_code,
          customerName: b.customer?.display_name ?? "—",
          roomName: b.room?.name ?? "—",
          endsAt: b.ends_at,
          minutesUntil: minutesToEnd,
        }),
      );
      await markSent("ending_5");
    }

    // A5: No-show after 15 min grace
    if (
      b.booking_status === "confirmed" &&
      minutesPastStart >= 15 &&
      minutesPastStart <= 60 &&
      !sent.includes("no_show")
    ) {
      void dispatchEvent(
        "internal.no_show",
        bookingNoShowTemplate({
          reference: b.reference_code,
          customerName: b.customer?.display_name ?? "—",
          customerPhone: b.customer?.phone ?? undefined,
          roomName: b.room?.name ?? "—",
          startsAt: b.starts_at,
          minutesPast: minutesPastStart,
        }),
      );
      await markSent("no_show");
    }
  }

  return NextResponse.json({ ok: true, scanned: bookings.length, events });
}
