import { NextResponse } from "next/server";
import { runBotTick } from "@/lib/tgbot/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reminder heartbeat for the booking bot. Called every minute by the worker
 * on the office Mac and every five minutes by GitHub Actions (through
 * /api/cron/time-alerts). Idempotent, so a wrong token is refused but a
 * missing one is accepted — the same rule as the other time-alert cron.
 */
async function handle(request: Request) {
  const auth = request.headers.get("authorization");
  const allowed = [process.env.CRON_SECRET, process.env.TGBOT_WORKER_KEY].filter(Boolean).map((k) => `Bearer ${k}`);
  if (auth && !allowed.includes(auth)) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await runBotTick();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
