import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
  listAgentRooms,
  listAgentPackages,
  renderRoomText,
} from "@/lib/agent-api/core";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/agent/rooms
 *   ?attendees=6          only rooms that seat this many
 *   ?includeInactive=1    include maintenance/inactive rooms
 *
 * Returns every room with its photos, capacity, rate and packages — this is
 * what the bot sends back when someone says "ขอดูห้องประชุม".
 */
export async function GET(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const attendeesRaw = url.searchParams.get("attendees");
    const attendees = attendeesRaw ? Number(attendeesRaw) : undefined;
    const includeInactive = url.searchParams.get("includeInactive") === "1";

    const [rooms, packages] = await Promise.all([
      listAgentRooms({ includeInactive }),
      listAgentPackages(),
    ]);

    const filtered =
      attendees && Number.isFinite(attendees)
        ? rooms.filter((r) => !r.capacity_max || r.capacity_max >= attendees)
        : rooms;

    return jsonOk({
      ok: true,
      count: filtered.length,
      rooms: filtered.map((room) => ({
        ...room,
        photos: [room.thumbnail_url, ...room.gallery_urls].filter(
          Boolean,
        ) as string[],
        packages: packages.filter((p) => p.room_id === room.id),
        text: renderRoomText(room, packages),
      })),
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
