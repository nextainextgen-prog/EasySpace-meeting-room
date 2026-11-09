import { NextResponse } from "next/server";
import { currentPeriod, periodLabel, shiftPeriod } from "@/lib/billing/overage";
import { listOrgMonths } from "@/lib/server/org-billing";
import { publicBaseUrl } from "@/lib/data/public-rooms";
import { dispatchEvent } from "@/lib/server/notifications";

/**
 * Cron — 1st of every month, 09:00 Asia/Bangkok. Tells the finance topic
 * which companies went over their quota last month and by how much, with a
 * link to issue the invoices. Nothing is issued automatically: a person
 * checks the figures first. Configured in `vercel.json`.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const period = shiftPeriod(currentPeriod(), -1);
  const over = (await listOrgMonths(period)).filter((m) => m.amount > 0);
  if (over.length === 0) return NextResponse.json({ ok: true, period, over: 0 });

  const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const total = over.reduce((s, m) => s + m.amount, 0);
  const lines = [
    `<b>ปิดยอดใช้เกินโควตา ${periodLabel(period)}</b>`,
    "",
    ...over.map((m) => `• ${m.orgName} · เกิน ${m.overHours} ชม. · ${baht(m.amount)} บาท`),
    "",
    `รวม ${baht(total)} บาท · ออกใบแจ้งหนี้ได้ที่`,
    `${publicBaseUrl()}/admin/orgs/billing?period=${period}`,
  ];
  await dispatchEvent("outstanding.alert", lines.join("\n"));
  return NextResponse.json({ ok: true, period, over: over.length, total });
}
