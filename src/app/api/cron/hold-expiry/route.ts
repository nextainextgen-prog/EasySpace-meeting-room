import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { dispatchEvent } from "@/lib/server/notifications";
import {
  holdExpiringTemplate,
  holdExpiredTemplate,
} from "@/lib/templates/telegram";
import { HOLD_WARNING_HOURS } from "@/lib/booking-hold";
import { restoreDisplacedFor } from "@/lib/server/public-booking";

export const dynamic = "force-dynamic";

interface HoldRow {
  id: string;
  reference_code: string;
  starts_at: string;
  ends_at: string;
  hold_expires_at: string;
  room: { name: string } | null;
  customer: { display_name: string; phone: string | null } | null;
}

/**
 * Cron — sweeps ติดจอง once a day.
 *
 *  - Past its deadline  → cancel it so the room goes back on the market.
 *  - Within 24h of it   → nudge Telegram so someone can chase the customer.
 *
 * A hold blocks the room like any other booking, so leaving stale ones around
 * quietly costs real inventory. Configured per `vercel.json`.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const warnBefore = new Date(
    now.getTime() + HOLD_WARNING_HOURS * 3_600_000,
  );

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, starts_at, ends_at, hold_expires_at, room:rooms(name), customer:customers(display_name, phone)",
    )
    .eq("booking_status", "pending")
    .not("hold_expires_at", "is", null)
    .lte("hold_expires_at", warnBefore.toISOString())
    .order("hold_expires_at");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as HoldRow[];
  const expired = rows.filter(
    (r) => new Date(r.hold_expires_at).getTime() <= now.getTime(),
  );
  const expiring = rows.filter(
    (r) => new Date(r.hold_expires_at).getTime() > now.getTime(),
  );

  // ─── Release the lapsed ones ───
  if (expired.length > 0) {
    const ids = expired.map((r) => r.id);
    const { error: cancelErr } = await supabase
      .from("bookings")
      .update({
        booking_status: "cancelled",
        cancelled_at: now.toISOString(),
        cancelled_reason: "ติดจองหมดอายุ — ไม่ได้ยืนยันภายในกำหนด",
        hold_expires_at: null,
      } as never)
      // Re-assert the status in the WHERE clause: someone may have confirmed
      // one of these between the read above and this write.
      .in("id", ids)
      .eq("booking_status", "pending");

    if (cancelErr) {
      return NextResponse.json(
        { ok: false, error: cancelErr.message },
        { status: 500 },
      );
    }

    await supabase.from("booking_audit_log").insert(
      expired.map((r) => ({
        booking_id: r.id,
        action: "hold_expired",
        actor_name: "ระบบ (cron)",
        reason: "ติดจองหมดอายุ",
      })) as never,
    );

    // An online booking that never got confirmed gives internal meetings
    // it displaced their slot back.
    for (const r of expired) await restoreDisplacedFor(r.id);

    for (const r of expired) {
      void dispatchEvent(
        "booking.hold_expired",
        holdExpiredTemplate({
          reference: r.reference_code,
          customerName: r.customer?.display_name ?? "—",
          roomName: r.room?.name ?? "—",
          startsAt: r.starts_at,
          endsAt: r.ends_at,
        }),
      );
    }
  }

  // ─── Nudge the ones running out ───
  for (const r of expiring) {
    const hoursLeft = Math.max(
      1,
      Math.round(
        (new Date(r.hold_expires_at).getTime() - now.getTime()) / 3_600_000,
      ),
    );
    void dispatchEvent(
      "booking.hold_expiring",
      holdExpiringTemplate({
        reference: r.reference_code,
        customerName: r.customer?.display_name ?? "—",
        customerPhone: r.customer?.phone ?? null,
        roomName: r.room?.name ?? "—",
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        expiresAt: r.hold_expires_at,
        hoursLeft,
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    expired: expired.length,
    expiring: expiring.length,
  });
}
