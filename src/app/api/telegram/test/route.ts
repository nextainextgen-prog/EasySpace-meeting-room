import { NextResponse } from "next/server";
import { telegramSend } from "@/lib/integrations/telegram";

/**
 * Manual test endpoint:
 *   POST /api/telegram/test
 *   body: { chatId: string, topicId?: number, text: string }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      chatId: string;
      topicId?: number;
      text: string;
    };
    const result = await telegramSend({
      chatId: body.chatId,
      topicId: body.topicId,
      text: body.text,
      parseMode: "HTML",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
