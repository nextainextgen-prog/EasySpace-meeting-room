"use server";

import { geminiText } from "@/lib/integrations/gemini";
import { bookingStatsForDay } from "@/lib/data/bookings";
import { listCustomers } from "@/lib/data/customers";
import { formatBaht } from "@/lib/format";

/**
 * Generate a daily Telegram brief using Gemini.
 * Pulls real stats from Supabase, prompts Gemini for a Thai summary
 * formatted for Telegram (HTML, no emojis).
 */
export async function generateDailyBrief(forDate = new Date()) {
  const [stats, customers] = await Promise.all([
    bookingStatsForDay(forDate),
    listCustomers({ limit: 200 }),
  ]);

  const newCustomers7d = customers.filter((c) => {
    const created = new Date(c.created_at);
    return forDate.getTime() - created.getTime() < 7 * 24 * 3600 * 1000;
  }).length;

  const highRisk = customers.filter((c) => c.churn_risk === "high").length;

  const facts = {
    date: forDate.toLocaleDateString("th-TH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    bookings_today: stats.bookings,
    revenue_paid: stats.revenuePaid,
    revenue_total: stats.revenueTotal,
    outstanding_count: stats.outstandingCount,
    outstanding_amount: stats.outstandingAmount,
    customers_total: customers.length,
    new_customers_7d: newCustomers7d,
    churn_high: highRisk,
  };

  const system = [
    "คุณเป็นนักวิเคราะห์ธุรกิจห้องประชุม (ภาษาไทย)",
    "สรุปสั้น 5-8 บรรทัด ใช้ตัวเลขจริงเท่านั้น",
    "ห้ามใช้อิโมจิ ห้ามเดา ใช้ <b></b> ได้สำหรับเน้น",
    "เน้นประเด็น: รายรับ, ค้างชำระ, ลูกค้าใหม่, สิ่งที่ต้องระวัง",
    "ตอบเป็นข้อความ Telegram HTML — ไม่ต้องมี markdown",
  ].join("\n");

  const prompt = `สรุปประจำวัน ${facts.date}\n${JSON.stringify(facts, null, 2)}`;

  // Gemini is best-effort. If the key is missing, rate-limited, or the
  // network fails, we still want the daily Telegram brief to ship with
  // raw numbers so the team isn't blind.
  let ai: string;
  try {
    ai = (await geminiText(prompt, system)).trim();
  } catch (err) {
    console.error("[ai-brief] gemini failed, using factual fallback", err);
    ai = [
      `<b>สรุปวันนี้</b> (AI ใช้งานไม่ได้ชั่วคราว — แสดงตัวเลขดิบ)`,
      `• การจอง: ${facts.bookings_today} รายการ`,
      `• รายรับเข้าจริง: ${formatBaht(facts.revenue_paid)} จากยอดรวม ${formatBaht(facts.revenue_total)}`,
      `• ค้างชำระ: ${facts.outstanding_count} รายการ · ${formatBaht(facts.outstanding_amount)}`,
      `• ลูกค้าใหม่ 7 วัน: ${facts.new_customers_7d} ราย`,
      facts.churn_high > 0
        ? `• เสี่ยง churn สูง: ${facts.churn_high} ราย`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return {
    facts,
    text: [
      `<b>AI Daily Brief — ${facts.date}</b>`,
      "",
      ai,
      "",
      "─────────────────────",
      `รายรับเข้าจริง: <b>${formatBaht(facts.revenue_paid)}</b>`,
      `ยอดทั้งหมด: ${formatBaht(facts.revenue_total)}`,
      `ค้างชำระ: ${facts.outstanding_count} รายการ · ${formatBaht(facts.outstanding_amount)}`,
      `ลูกค้าใหม่ 7 วัน: ${facts.new_customers_7d} ราย`,
      facts.churn_high > 0
        ? `เสี่ยง churn สูง: <b>${facts.churn_high} ราย</b>`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
