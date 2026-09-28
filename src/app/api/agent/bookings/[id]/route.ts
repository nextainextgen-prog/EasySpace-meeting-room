import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
  renderBookingText,
} from "@/lib/agent-api/core";
import {
  BOOKING_SELECT,
  shapeBooking,
  type BookingRow,
} from "@/lib/agent-api/bookings";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/agent/bookings/{idOrReferenceCode} */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const ref = decodeURIComponent(id).trim();
    const admin = createSupabaseAdminClient();
    const query = admin.from("bookings").select(BOOKING_SELECT);
    const { data } = UUID_RE.test(ref)
      ? await query.eq("id", ref).maybeSingle()
      : await query.eq("reference_code", ref.toUpperCase()).maybeSingle();

    if (!data) return jsonError("not_found", `ไม่พบการจอง "${ref}"`, 404);

    const booking = shapeBooking(data as unknown as BookingRow);
    return jsonOk({
      ok: true,
      booking,
      text: renderBookingText({
        reference: booking.reference,
        roomName: booking.room?.name ?? "-",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        title: booking.title,
        attendees: booking.attendees,
        bookedBy: booking.bookedBy,
        totalAmount: booking.totalAmount,
        status: booking.status,
      }),
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
