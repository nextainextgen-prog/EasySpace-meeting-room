import { NextResponse } from "next/server";
import { executeAiResult, type AiJob, type AiResult } from "@/lib/tgbot/ai";
import { sendText } from "@/lib/tgbot/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The Mac worker posts Claude's decision for one queued message here. */
export async function POST(request: Request) {
  const key = process.env.TGBOT_WORKER_KEY;
  if (!key || request.headers.get("authorization") !== `Bearer ${key}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const body = (await request.json()) as { job: AiJob; result: AiResult | null; error?: string };
  if (!body.job?.chatId) return NextResponse.json({ ok: false, error: "no_job" }, { status: 400 });
  try {
    if (!body.result) {
      await sendText(body.job.chatId, "ขอโทษค่ะ หนูอ่านข้อความนี้ไม่ทัน ลองพิมพ์ใหม่ หรือใช้ปุ่มด้านล่างได้เลยนะคะ", { menu: true });
    } else {
      await executeAiResult(body.job, body.result);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tgbot] worker result failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
