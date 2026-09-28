import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
} from "@/lib/agent-api/core";
import { resolveAgentMember, memberUsage } from "@/lib/agent-api/members";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/agent/members/resolve?email=|phone=|memberId=|telegramUserId=
 *
 * Who is the bot talking to? Returns the member, their organisation and the
 * month's quota so the agent can say "เหลือโควตา 12 ชม." before booking.
 */
export async function GET(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const member = await resolveAgentMember({
      memberId: url.searchParams.get("memberId") ?? undefined,
      email: url.searchParams.get("email") ?? undefined,
      phone: url.searchParams.get("phone") ?? undefined,
      telegramUserId: url.searchParams.get("telegramUserId") ?? undefined,
    });
    if (!member) {
      return jsonError("member_not_found", "ไม่พบสมาชิกที่ระบุ", 404);
    }

    const usage = await memberUsage(member.orgId);
    return jsonOk({
      ok: true,
      member,
      quota: {
        usedHours: usage.hoursThisMonth,
        quotaHours: usage.quotaHoursMonthly,
        unlimited: usage.quotaUnlimited,
        remainingHours: usage.quotaUnlimited
          ? null
          : Math.max(0, usage.quotaHoursMonthly - usage.hoursThisMonth),
        percentUsed: usage.quotaPct,
      },
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
