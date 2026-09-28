import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
  getAvailability,
  resolveRoom,
  listBusyBlocks,
  today,
  thaiLongDate,
  TIMEZONE,
  resolveWindow,
  localTime,
} from "@/lib/agent-api/core";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/agent/availability
 *   ?date=YYYY-MM-DD        defaults to today (Asia/Bangkok)
 *   ?room=prime|<uuid>      one room instead of all
 *   ?attendees=6            keep only rooms that seat this many
 *   ?startTime=10:00&endTime=11:30   also answer "is this exact window free?"
 *
 * The slot grid matches the booking screen exactly: 08:30–22:00 starts, 30
 * minutes each. `text` is a ready-to-send Telegram message.
 */
export async function GET(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError("bad_date", "date ต้องเป็นรูปแบบ YYYY-MM-DD");
    }
    const roomRef = url.searchParams.get("room") ?? undefined;
    const attendeesRaw = url.searchParams.get("attendees");
    const attendees = attendeesRaw ? Number(attendeesRaw) : undefined;

    const { rooms, unknownRoom } = await getAvailability({
      date,
      roomRef,
      attendees,
    });
    if (unknownRoom) {
      return jsonError("room_not_found", `ไม่พบห้อง "${roomRef}"`, 404);
    }

    // Optional: answer a specific window in the same call.
    let windowCheck: {
      startsAt: string;
      endsAt: string;
      rooms: Array<{ roomId: string; roomName: string; available: boolean }>;
    } | null = null;
    const startTime = url.searchParams.get("startTime");
    const endTime = url.searchParams.get("endTime");
    if (startTime) {
      const win = resolveWindow({
        date,
        startTime,
        endTime: endTime ?? undefined,
      });
      if (!win.ok) return jsonError("bad_window", win.message);
      windowCheck = {
        startsAt: win.startsAt,
        endsAt: win.endsAt,
        rooms: rooms.map((r) => ({
          roomId: r.room.id,
          roomName: r.room.name,
          available: !r.busy.some(
            (b) =>
              new Date(b.startsAt).getTime() < new Date(win.endsAt).getTime() &&
              new Date(b.endsAt).getTime() > new Date(win.startsAt).getTime(),
          ),
        })),
      };
    }

    return jsonOk({
      ok: true,
      date,
      dateLabel: thaiLongDate(date),
      timezone: TIMEZONE,
      openHours: { start: "08:30", end: "22:30", slotMinutes: 30 },
      windowCheck,
      rooms: rooms.map((r) => ({
        room: {
          id: r.room.id,
          name: r.room.name,
          capacity_min: r.room.capacity_min,
          capacity_max: r.room.capacity_max,
          hourly_rate: r.room.hourly_rate,
          thumbnail_url: r.room.thumbnail_url,
          amenities: r.room.amenities,
        },
        fullyFree: r.fullyFree,
        freeRanges: r.freeRanges,
        busy: r.busy,
        slots: r.slots,
        text: r.text,
      })),
      text: rooms.map((r) => r.text).join("\n\n"),
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}

/**
 * POST /api/agent/availability — same data, body form, plus a direct
 * yes/no for one room and window:
 *   { "room": "prime", "date": "2026-08-20", "startTime": "10:00", "endTime": "11:30" }
 */
export async function POST(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      room?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      durationMinutes?: number;
      startsAt?: string;
      endsAt?: string;
    };
    if (!body.room) return jsonError("room_required", "ต้องระบุ room");

    const room = await resolveRoom(body.room);
    if (!room) return jsonError("room_not_found", `ไม่พบห้อง "${body.room}"`, 404);

    const win = resolveWindow(body);
    if (!win.ok) return jsonError("bad_window", win.message);

    const date = body.date ?? today();
    const busy = await listBusyBlocks(date, [room.id]);
    const clash = busy.find(
      (b) =>
        new Date(b.startsAt).getTime() < new Date(win.endsAt).getTime() &&
        new Date(b.endsAt).getTime() > new Date(win.startsAt).getTime(),
    );

    return jsonOk({
      ok: true,
      available: !clash,
      room: { id: room.id, name: room.name },
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      conflict: clash ?? null,
      text: clash
        ? `${room.name} ไม่ว่างช่วง ${localTime(win.startsAt)}–${localTime(win.endsAt)} น. (ชนกับ ${clash.title} ${clash.startTime}–${clash.endTime})`
        : `${room.name} ว่างช่วง ${localTime(win.startsAt)}–${localTime(win.endsAt)} น.`,
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
