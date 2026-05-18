import { NextResponse } from "next/server";
import { geminiText } from "@/lib/integrations/gemini";
import { telegramSend } from "@/lib/integrations/telegram";
import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";

/**
 * Cron entry — wired via `vercel.json` to run at 19:00 Asia/Bangkok daily.
 * Generates the AI daily brief and dispatches to the configured Telegram
 * topic ("ยอดเข้าไม่พัก" by default).
 */
export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` — verify in prod.
  const auth = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    // TODO: replace with real aggregation once Supabase data is available.
    const [route] = await supabase
      .from("telegram_routes" as never)
      .select("*")
      .eq("event_key", "finance.daily_brief")
      .limit(1)
      .then((r) => (r.data ?? []) as Array<{ group_id: string; topic_id: number }>);

    if (!route) {
      return NextResponse.json(
        { ok: false, reason: "no_route_configured" },
        { status: 200 },
      );
    }

    const summary = await geminiText(
      "สรุปการเงินของระบบจองห้องประชุมประจำวันแบบสั้น (ไทย) ใช้ตัวเลขจำลอง: รายได้ 7,430 บาท · รายจ่าย 1,200 บาท · กำไร 6,230 บาท (margin 83%)",
      "คุณเป็นนักบัญชี AI สำหรับธุรกิจห้องประชุม กระชับ ใช้ตัวเลขชัด ห้ามใช้อิโมจิ",
    );

    const chatId = process.env.TELEGRAM_DEFAULT_CHAT_ID;
    if (!chatId) {
      return NextResponse.json(
        { ok: false, reason: "no_chat_id" },
        { status: 200 },
      );
    }

    await telegramSend({
      chatId,
      topicId: route.topic_id,
      text: `<b>AI Daily Brief</b>\n\n${summary}`,
      parseMode: "HTML",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
