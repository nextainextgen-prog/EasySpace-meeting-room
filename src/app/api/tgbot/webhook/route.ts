import { NextResponse } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/tgbot/flows";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Telegram → @EasySpaceBookingBot. Telegram signs every call with the
 * secret_token we registered in setWebhook; anything without it is dropped.
 */
export async function POST(request: Request) {
  const secret = process.env.TGBOT_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }
  try {
    await handleUpdate(update);
  } catch (e) {
    // Always 200: a non-2xx makes Telegram redeliver the same update forever.
    console.error("[tgbot] update failed", update.update_id, e);
  }
  return NextResponse.json({ ok: true });
}
