import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
  resolveRoom,
  listAgentPackages,
  quoteBooking,
  resolveWindow,
  localTime,
  thaiLongDate,
} from "@/lib/agent-api/core";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/agent/quote?room=prime&date=2026-08-20&startTime=10:00&endTime=12:00
 *
 * Price preview for an external (paying) booking, using the same package rule
 * as the admin form: the largest package that fits the booked hours wins.
 * Internal member bookings are always free and do not need this.
 */
export async function GET(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const roomRef = url.searchParams.get("room");
    if (!roomRef) return jsonError("room_required", "ต้องระบุ room");

    const room = await resolveRoom(roomRef);
    if (!room) return jsonError("room_not_found", `ไม่พบห้อง "${roomRef}"`, 404);

    const win = resolveWindow({
      date: url.searchParams.get("date") ?? undefined,
      startTime: url.searchParams.get("startTime") ?? undefined,
      endTime: url.searchParams.get("endTime") ?? undefined,
      durationMinutes: url.searchParams.get("durationMinutes")
        ? Number(url.searchParams.get("durationMinutes"))
        : undefined,
      startsAt: url.searchParams.get("startsAt") ?? undefined,
      endsAt: url.searchParams.get("endsAt") ?? undefined,
    });
    if (!win.ok) return jsonError("bad_window", win.message);

    const packages = await listAgentPackages();
    const quote = quoteBooking(room, packages, win.startsAt, win.endsAt);

    return jsonOk({
      ok: true,
      room: { id: room.id, name: room.name },
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      quote,
      text: [
        `<b>${room.name}</b> · ${thaiLongDate(win.startsAt)}`,
        `เวลา ${localTime(win.startsAt)}–${localTime(win.endsAt)} น. (${quote.hours} ชม.)`,
        quote.packageName
          ? `แพ็กเกจ ${quote.packageName}: ${quote.baseAmount.toLocaleString("th-TH")} บาท (ประหยัด ${quote.savingsVsHourly.toLocaleString("th-TH")} บาท)`
          : `ค่าห้อง ${quote.hourlyRate.toLocaleString("th-TH")} บาท/ชม. รวม ${quote.baseAmount.toLocaleString("th-TH")} บาท`,
      ].join("\n"),
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
