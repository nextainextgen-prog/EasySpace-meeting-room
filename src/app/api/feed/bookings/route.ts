import { NextResponse } from "next/server";
import { feedBookings, feedKeyFrom, feedWindow } from "@/lib/server/booking-feed";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed/bookings — read-only booking list for a key issued in
 * Settings → รหัสอ่านข้อมูลการจอง.
 *   Authorization: Bearer esf_…   (or X-API-Key, or ?key=)
 *   ?date=YYYY-MM-DD | ?from=&to=  (default: today → 30 days ahead, max 200 days)
 *   ?status=all                    include cancelled bookings
 */
export async function GET(request: Request) {
  const key = await feedKeyFrom(request);
  if (!key) return NextResponse.json({ ok: false, error: "unauthorized", message: "รหัสไม่ถูกต้องหรือถูกยกเลิกแล้ว" }, { status: 401 });
  const url = new URL(request.url);
  const { from, to } = feedWindow(url, { back: 0, ahead: 30 });
  const bookings = await feedBookings(key, { from, to, includeCancelled: url.searchParams.get("status") === "all" });
  return NextResponse.json(
    { ok: true, scope: key.scopeName, from, to, count: bookings.length, bookings },
    { headers: { "Cache-Control": "no-store" } },
  );
}
