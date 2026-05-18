import { NextResponse } from "next/server";
import { generateDailyBrief } from "@/lib/server/ai-brief";
import { dispatchEvent } from "@/lib/server/notifications";

/**
 * Manual trigger: GET /api/ai/daily-brief — generates a fresh Gemini brief
 * and sends it to the "รายงานยอด" Telegram topic.
 */
export async function GET() {
  try {
    const brief = await generateDailyBrief();
    const result = await dispatchEvent("finance.daily_brief", brief.text);
    return NextResponse.json({
      ok: true,
      facts: brief.facts,
      telegram: result,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
