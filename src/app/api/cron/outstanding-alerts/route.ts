import { NextResponse } from "next/server";
import { listOutstanding } from "@/lib/data";
import { dispatchEvent } from "@/lib/server/notifications";
import { outstandingAlertTemplate } from "@/lib/templates/telegram";

/**
 * Cron — fires once daily (09:00 Asia/Bangkok). Sends a Telegram digest of
 * outstanding payments older than 1 day. Configured per `vercel.json`.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const outstanding = await listOutstanding(50);
  const overdue = outstanding.filter((o) => o.days_overdue > 0);

  for (const row of overdue.slice(0, 20)) {
    void dispatchEvent(
      "outstanding.alert",
      outstandingAlertTemplate({
        reference: row.reference_code,
        customerName: row.customer_name,
        amountOutstanding: row.outstanding_amount,
        daysOverdue: row.days_overdue,
        dueAt: row.due_at,
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    total: outstanding.length,
    overdue: overdue.length,
  });
}
