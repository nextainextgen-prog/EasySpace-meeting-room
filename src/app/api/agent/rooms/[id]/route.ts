import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
  resolveRoom,
  listAgentPackages,
  renderRoomText,
  getAvailability,
  today,
} from "@/lib/agent-api/core";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/agent/rooms/{idOrName}?date=YYYY-MM-DD
 *
 * One room, addressable by uuid or by name fragment ("prime"), optionally
 * with that day's slot grid so the bot can answer in a single round-trip.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const room = await resolveRoom(decodeURIComponent(id));
    if (!room) {
      return jsonError("room_not_found", `ไม่พบห้อง "${id}"`, 404);
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const packages = await listAgentPackages();

    const availability = date
      ? (await getAvailability({ date, roomRef: room.id })).rooms[0] ?? null
      : null;

    return jsonOk({
      ok: true,
      room: {
        ...room,
        photos: [room.thumbnail_url, ...room.gallery_urls].filter(
          Boolean,
        ) as string[],
        packages: packages.filter((p) => p.room_id === room.id),
        text: renderRoomText(room, packages),
      },
      availability: availability
        ? {
            date: date ?? today(),
            slots: availability.slots,
            busy: availability.busy,
            freeRanges: availability.freeRanges,
            text: availability.text,
          }
        : null,
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
