import { NextResponse } from "next/server";
import { generateDailyBrief } from "@/lib/server/ai-brief";
import { dispatchEvent } from "@/lib/server/notifications";

/**
 * Cron entry — wired via `vercel.json` to fire at 19:00 Asia/Bangkok.
 * Generates the Gemini brief from real Supabase stats and posts to the
 * "รายงานยอด" Telegram topic.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const brief = await generateDailyBrief();
    const result = await dispatchEvent("finance.daily_brief", brief.text);
    return NextResponse.json({ ok: true, telegram: result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
