/**
 * Point @EasySpaceBookingBot at production: webhook (with its secret), the
 * command menu, and the bot's description. Run once after the TGBOT_* env
 * vars are on Vercel and deployed.
 *
 *   npm run tgbot:setup
 */
import { setupBot } from "@/lib/tgbot/telegram";

const APP = (process.env.TGBOT_APP_URL ?? "https://easy-space-meeting-room-yjqk.vercel.app").replace(/\/$/, "");

async function main() {
  const secret = process.env.TGBOT_WEBHOOK_SECRET;
  if (!process.env.TGBOT_TOKEN || !secret) throw new Error("TGBOT_TOKEN / TGBOT_WEBHOOK_SECRET missing in .env.local");

  // Refuse to aim Telegram at a deployment that cannot verify the secret yet.
  const tick = (await fetch(`${APP}/api/tgbot/tick`).then((r) => r.json())) as { skipped?: string };
  if (tick.skipped === "not_configured") {
    throw new Error("production has no TGBOT_TOKEN yet — add the env vars on Vercel and redeploy first");
  }
  const probe = await fetch(`${APP}/api/tgbot/webhook`, {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret, "content-type": "application/json" },
    body: JSON.stringify({ update_id: 0 }),
  });
  if (probe.status !== 200) throw new Error(`webhook refused the secret (${probe.status}) — TGBOT_WEBHOOK_SECRET differs on Vercel`);

  const res = await setupBot(`${APP}/api/tgbot/webhook`, secret);
  for (const [k, v] of Object.entries(res)) console.log(k.padEnd(18), (v as { ok: boolean }).ok ? "ok" : JSON.stringify(v));
  const info = await fetch(`https://api.telegram.org/bot${process.env.TGBOT_TOKEN}/getWebhookInfo`).then((r) => r.json());
  console.log("webhook", (info as { result: { url: string } }).result.url);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
