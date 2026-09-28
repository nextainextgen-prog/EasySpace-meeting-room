import {
  jsonOk,
  jsonError,
  preflight,
  requireAgentKey,
} from "@/lib/agent-api/core";
import {
  resolveAgentMember,
  linkTelegramUser,
  unlinkTelegramUser,
} from "@/lib/agent-api/members";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * POST /api/agent/members/link
 * body: { telegramUserId, email }   → remembers who this Telegram user is
 * body: { telegramUserId, unlink: true }
 *
 * The mapping lives in the settings KV (`agent.telegram_links`), so every
 * later call can just pass `telegramUserId`.
 */
export async function POST(request: Request) {
  const denied = requireAgentKey(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      telegramUserId?: string | number;
      email?: string;
      memberId?: string;
      phone?: string;
      unlink?: boolean;
    };
    if (body.telegramUserId === undefined || body.telegramUserId === null) {
      return jsonError("telegram_id_required", "ต้องระบุ telegramUserId");
    }

    if (body.unlink) {
      await unlinkTelegramUser(String(body.telegramUserId));
      return jsonOk({ ok: true, unlinked: true });
    }

    const member = await resolveAgentMember({
      memberId: body.memberId,
      email: body.email,
      phone: body.phone,
    });
    if (!member) {
      return jsonError(
        "member_not_found",
        "ไม่พบสมาชิกจากอีเมล/เบอร์ที่ส่งมา",
        404,
      );
    }

    await linkTelegramUser(String(body.telegramUserId), member.memberId);
    return jsonOk({
      ok: true,
      linked: true,
      telegramUserId: String(body.telegramUserId),
      member,
    });
  } catch (error) {
    return jsonError("server_error", (error as Error).message, 500);
  }
}
