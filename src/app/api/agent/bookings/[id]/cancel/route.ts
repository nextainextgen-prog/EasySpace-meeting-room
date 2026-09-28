import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { cancelMemberBooking } from "@/lib/actions/members";
import { cancelBooking } from "@/lib/actions/bookings";
import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
  localTime,
  thaiLongDate,
} from "@/lib/agent-api/core";
import { resolveAgentMember } from "@/lib/agent-api/members";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/agent/bookings/{idOrReference}/cancel
 * body: { reason, memberEmail? | memberId? | telegramUserId? }
 *
 * An internal booking may only be cancelled by its owner — pass the member
 * identity so the ownership check runs exactly as it does in the portal.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const ref = decodeURIComponent(id).trim();
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
      memberId?: string;
      memberEmail?: string;
      telegramUserId?: string | number;
    };
    const reason = body.reason?.trim() || "ยกเลิกผ่าน AI agent";

    const admin = createSupabaseAdminClient();
    const query = admin
      .from("bookings")
      .select(
        "id, reference_code, source, member_id, starts_at, ends_at, booking_status, room:rooms(name)",
      );
    const { data } = UUID_RE.test(ref)
      ? await query.eq("id", ref).maybeSingle()
      : await query.eq("reference_code", ref.toUpperCase()).maybeSingle();

    if (!data) return jsonError("not_found", `ไม่พบการจอง "${ref}"`, 404);
    const row = data as unknown as {
      id: string;
      reference_code: string;
      source: "internal" | "external";
      member_id: string | null;
      starts_at: string;
      ends_at: string;
      booking_status: string;
      room: { name: string } | null;
    };

    if (row.booking_status === "cancelled") {
      return jsonError("already_cancelled", "การจองนี้ถูกยกเลิกไปแล้ว", 409);
    }

    if (row.source === "internal") {
      const member = await resolveAgentMember({
        memberId: body.memberId,
        email: body.memberEmail,
        telegramUserId: body.telegramUserId,
      });
      if (!member) {
        return jsonError(
          "member_required",
          "การจองภายในต้องยืนยันตัวผู้จองก่อนยกเลิก",
          403,
        );
      }
      const result = await cancelMemberBooking({
        bookingId: row.id,
        memberId: member.memberId,
        reason,
      });
      if (!result.ok) {
        return jsonError(
          result.error === "not_owner" ? "not_owner" : "cancel_failed",
          result.error === "not_owner"
            ? "ยกเลิกได้เฉพาะการจองของตัวเองเท่านั้น"
            : "ยกเลิกไม่สำเร็จ",
          result.error === "not_owner" ? 403 : 400,
        );
      }
    } else {
      const result = await cancelBooking({ bookingId: row.id, reason });
      if (!result.ok) {
        return jsonError("cancel_failed", result.error ?? "ยกเลิกไม่สำเร็จ", 400);
      }
    }

    return jsonOk({
      ok: true,
      reference: row.reference_code,
      status: "cancelled",
      reason,
      text: [
        "<b>ยกเลิกการจองแล้ว</b>",
        "",
        `รหัส: <code>${row.reference_code}</code>`,
        `ห้อง: ${row.room?.name ?? "-"}`,
        `เดิม: ${thaiLongDate(row.starts_at)} ${localTime(row.starts_at)}–${localTime(row.ends_at)} น.`,
        `เหตุผล: ${reason}`,
      ].join("\n"),
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
